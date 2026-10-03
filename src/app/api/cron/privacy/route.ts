import { withDatabaseDeadline } from "@/lib/db/deadline";
import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  acquireCronJobRun,
  checkpointCronJobRun,
  CronLeaseBusyError,
  finishCronJobRun,
} from "@/lib/cron-health";
import { runPrivacyRetentionCleanup } from "@/lib/privacy-retention-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runCron(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let run: Awaited<ReturnType<typeof acquireCronJobRun>>;
  try {
    run = await acquireCronJobRun("privacy_retention");
  } catch (error) {
    if (error instanceof CronLeaseBusyError) {
      return NextResponse.json({ ok: false, status: "running", retryAfterSeconds: error.retryAfterSeconds }, {
        status: 409,
        headers: { "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    return NextResponse.json({ ok: false, status: "failed", error: "Privacy cleanup health state is unavailable." }, { status: 503 });
  }

  let knownProcessedCount = 0;
  let healthStoreUnavailable = false;
  let healthFinishAttempted = false;
  try {
    const result = await runPrivacyRetentionCleanup({
      cursor: run.cursor,
      deadlineAt: run.deadlineAt,
      maxOperations: run.batchLimit,
      checkpoint: async (cursor, processedCount) => {
        knownProcessedCount = processedCount;
        try {
          await checkpointCronJobRun({ runId: run.runId, fence: run.fence, cursor, processedCount });
        } catch (error) {
          healthStoreUnavailable = true;
          throw error;
        }
      },
    });
    const errorCode = result.failed > 0
      ? (result.status === "failed" ? "job_failed" : "partial_failures")
      : result.backlog ? "budget_exhausted" : undefined;
    knownProcessedCount = result.deleted;
    try {
      healthFinishAttempted = true;
      await finishCronJobRun({
        runId: run.runId,
        fence: run.fence,
        status: result.failed > 0 && result.status === "partial" ? "partial" : result.status,
        processedCount: result.deleted,
        failedCount: result.failed,
        errorCode,
        outcomes: Object.fromEntries(result.operations.map((operation) => [operation.table, {
          deleted: operation.deleted,
          failed: operation.failed,
          complete: !operation.failed && !operation.fullBatch,
        }])),
      });
    } catch (error) {
      healthStoreUnavailable = true;
      throw error;
    }
    return NextResponse.json({ ok: result.status === "succeeded" || result.status === "no_work", ...result }, {
      status: result.failed > 0 ? 500 : result.status === "partial" ? 202 : 200,
    });
  } catch {
    if (!healthFinishAttempted) {
      try {
        healthFinishAttempted = true;
        await finishCronJobRun({
          runId: run.runId,
          fence: run.fence,
          status: "failed",
          processedCount: knownProcessedCount,
          failedCount: 1,
          errorCode: healthStoreUnavailable ? "health_store_unavailable" : "job_failed",
        });
      } catch {
        // The fenced lease may already have expired; the health layer records that failure.
      }
    }
    return NextResponse.json({ ok: false, status: "failed", processedCount: knownProcessedCount,
      error: healthStoreUnavailable ? "Privacy cleanup health state is unavailable." : "Privacy cleanup could not complete." }, {
      status: healthStoreUnavailable ? 503 : 500,
    });
  }
}

export async function GET(request: Request) {
  return withDatabaseDeadline(Date.now() + 60_000, () => runCron(request));
}
