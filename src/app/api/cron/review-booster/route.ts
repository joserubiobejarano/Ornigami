import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { acquireCronJobRun, checkpointCronJobRun, CronLeaseBusyError, finishCronJobRun } from "@/lib/cron-health";
import { providerWindow } from "@/lib/cron-budget";
import { getReviewBoosterBillingPeriodUsage } from "@/modules/review-booster/services/review-booster-db.service";
import { createFollowupRunnerDependencies, runEligibleFollowups } from "@/modules/review-booster/services/followup-runner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveBusinessRow = { business_id: string };
type BoosterCursor = { businessId: string | null; resumeBusiness: boolean; sweepFailures: number; sweepSuccesses: number; needsAnotherPass: boolean } | null;
const BUDGET_MS = 45_000;
const BUSINESS_BATCH_LIMIT = 20;
const CANDIDATE_ADMISSION_MS = 28_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class CronCheckpointError extends Error { constructor() { super("Cron checkpoint failed"); } }

function readCursor(value: unknown): BoosterCursor {
  if (!value || typeof value !== "object") return null;
  const cursor = value as Partial<NonNullable<BoosterCursor>>;
  return (cursor.businessId === null || (typeof cursor.businessId === "string" && UUID.test(cursor.businessId))) && typeof cursor.resumeBusiness === "boolean"
    ? { businessId: cursor.businessId ?? null, resumeBusiness: cursor.resumeBusiness, sweepFailures: Number.isSafeInteger(cursor.sweepFailures) ? Math.max(0, Number(cursor.sweepFailures)) : 0, sweepSuccesses: Number.isSafeInteger(cursor.sweepSuccesses) ? Math.max(0, Number(cursor.sweepSuccesses)) : 0, needsAnotherPass: cursor.needsAnotherPass === true }
    : null;
}

async function listBusinessBatch(cursor: BoosterCursor, limit: number): Promise<string[]> {
  const after = cursor?.businessId ?? null;
  const includeCurrent = cursor?.resumeBusiness === true;
  const rows = await sql`
    SELECT ba.business_id
    FROM public.business_agents ba
    INNER JOIN public.businesses b ON b.id = ba.business_id
    WHERE ba.agent_id = 'review_booster'
      AND lower(ba.status) IN ('active', 'trialing')
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = b.owner_user_id AND u.privacy_deletion_requested_at IS NOT NULL)
      AND (${after}::uuid IS NULL OR ba.business_id > ${after}::uuid OR (${includeCurrent} AND ba.business_id = ${after}::uuid))
    ORDER BY ba.business_id
    LIMIT ${limit}
  `;
  return (rows as ActiveBusinessRow[]).map((row) => row.business_id);
}

function jsonResponse(body: Record<string, unknown>, status: number, retryAfter?: number) {
  return NextResponse.json(body, { status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined });
}

async function persistCheckpoint(input: Parameters<typeof checkpointCronJobRun>[0]): Promise<void> {
  try { await checkpointCronJobRun(input); }
  catch { throw new CronCheckpointError(); }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);

  let lease;
  try {
    lease = await acquireCronJobRun("review_booster", { budgetMs: BUDGET_MS, batchLimit: BUSINESS_BATCH_LIMIT });
  } catch (error) {
    if (error instanceof CronLeaseBusyError) return jsonResponse({ ok: false, status: "already_running" }, 409, error.retryAfterSeconds);
    safeLogger.error("cron.review_booster.acquire_failed", { errorCode: "health_store_unavailable" });
    return jsonResponse({ ok: false, status: "failed", error: "Cron health store unavailable" }, 503);
  }

  const cursor = readCursor(lease.cursor);
  let checkpoint: BoosterCursor = cursor;
  let processedCount = 0;
  let businessesScanned = 0;
  let failures = 0;
  let sweepFailures = cursor?.sweepFailures ?? 0;
  let sweepSuccesses = cursor?.sweepSuccesses ?? 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalUnknown = 0;
  let totalDeferred = 0;
  let resumeWork = false;
  let interrupted = false;
  let needsAnotherPass = cursor?.needsAnotherPass ?? false;
  let terminalAttempted = false;
  const finishOnce = async (input: Parameters<typeof finishCronJobRun>[0]) => {
    terminalAttempted = true;
    await finishCronJobRun(input);
  };

  try {
    const businesses = await listBusinessBatch(cursor, lease.batchLimit);
    if (businesses.length === 0) {
      if (needsAnotherPass) {
        const nextPassCursor: BoosterCursor = { businessId: null, resumeBusiness: false, sweepFailures, sweepSuccesses, needsAnotherPass: false };
        await persistCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: nextPassCursor, processedCount });
        const status = sweepFailures > 0 ? (sweepSuccesses > 0 ? "partial" : "failed") : "partial";
        await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: sweepFailures ? "partial_failures" : "budget_exhausted" });
        return jsonResponse({ ok: false, status, continuation: true, businesses_scanned: 0, total_sent: 0, total_failed: 0, total_skipped: 0, total_unknown: 0, total_deferred: 0, sweep_failed_count: sweepFailures }, sweepFailures > 0 ? 500 : 202);
      }
      if (sweepFailures > 0) {
        const status = sweepSuccesses > 0 ? "partial" : "failed";
        await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: "partial_failures", clearCursor: true });
        return jsonResponse({ ok: false, status, continuation: false, businesses_scanned: 0, total_sent: 0, total_failed: sweepFailures, total_skipped: 0, total_unknown: 0, total_deferred: 0 }, 500);
      }
      const status = cursor ? "succeeded" : "no_work";
      await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: 0 });
      return jsonResponse({ ok: true, status, businesses_scanned: 0, total_sent: 0, total_failed: 0, total_skipped: 0, total_unknown: 0, total_deferred: 0 }, 200);
    }

    for (const businessId of businesses) {
      if (Date.now() + CANDIDATE_ADMISSION_MS > lease.deadlineAt.getTime()) { interrupted = true; break; }
      businessesScanned += 1;
      const businessSweepFailureBase = sweepFailures;
      const businessSweepSuccessBase = sweepSuccesses;
      checkpoint = { businessId, resumeBusiness: true, sweepFailures, sweepSuccesses, needsAnotherPass };
      try {
        const deps = await createFollowupRunnerDependencies(businessId, undefined, {
          generateBody: (visit) => {
            const timeoutMs = providerWindow(lease.deadlineAt, { maxMs: 8_000, reserveMs: 15_000 });
            if (timeoutMs === null) throw new Error("Cron provider admission window closed");
            return import("@/modules/review-booster/services/followup-email-generator.service").then(({ generateFollowupEmailBody }) => generateFollowupEmailBody({
              business_name: visit.businessName,
              business_type: visit.businessType,
              city: visit.city,
              customer_name: visit.customerName,
              service_name: visit.serviceName,
              google_review_url: visit.googleReviewUrl,
              tone_setting: visit.tone,
              language: visit.language,
              visited_at: visit.visitedAt,
            }, { timeoutMs }));
          },
        });
        const result = await runEligibleFollowups(deps, {
          shouldContinue: () => Date.now() + CANDIDATE_ADMISSION_MS <= lease.deadlineAt.getTime(),
          shouldBeginSend: () => Date.now() + 15_000 <= lease.deadlineAt.getTime(),
          onCandidateComplete: async (_visit, outcome) => {
            processedCount += 1;
            sweepFailures = businessSweepFailureBase + outcome.failed + outcome.unknown;
            sweepSuccesses = businessSweepSuccessBase + outcome.sent + outcome.skipped + outcome.deferred;
            checkpoint = { businessId, resumeBusiness: true, sweepFailures, sweepSuccesses, needsAnotherPass };
            await persistCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount });
          },
        });
        totalSent += result.sent;
        totalFailed += result.failed + result.unknown;
        totalSkipped += result.skipped;
        totalUnknown += result.unknown;
        totalDeferred += result.deferred;
        failures += result.failed + result.unknown;
        sweepFailures = businessSweepFailureBase + result.failed + result.unknown;
        sweepSuccesses = businessSweepSuccessBase + result.sent + result.skipped + result.deferred;
        const usage = await getReviewBoosterBillingPeriodUsage(businessId);
        if (usage.allowance > 0 && usage.used >= usage.allowance && (result.skipped > 0 || result.deferred > 0)) {
          safeLogger.warn("cron.review_booster.fair_use_limit", { used: usage.used, sent: usage.sent, reserved: usage.reserved, allowance: usage.allowance, skipped: result.skipped });
        }
        if (result.interrupted) {
          resumeWork = true;
          interrupted = true;
          needsAnotherPass = true;
          checkpoint = { businessId, resumeBusiness: false, sweepFailures, sweepSuccesses, needsAnotherPass };
          await persistCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount });
          break;
        }
        // A full candidate batch is rotated past so quota deferrals or busy oldest rows
        // cannot monopolize every invocation. The next full sweep revisits this business.
        if (result.candidateBatchFull) needsAnotherPass = true;
        checkpoint = { businessId, resumeBusiness: false, sweepFailures, sweepSuccesses, needsAnotherPass };
        if (result.candidateBatchFull) resumeWork = true;
        await persistCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount });
        if (failures > 0 && result.failed + result.unknown > 0) {
          safeLogger.warn("cron.review_booster.business_partial_failure", { failed: result.failed, unknown: result.unknown });
        }
      } catch (error) {
        if (error instanceof CronCheckpointError) throw error;
        failures += 1;
        sweepFailures += 1;
        totalFailed += 1;
        safeLogger.error("cron.review_booster.business_failed", { errorCode: "job_failed" });
        // Persist advancement after a settled business failure so one bad tenant cannot starve later tenants.
        checkpoint = { businessId, resumeBusiness: false, sweepFailures, sweepSuccesses, needsAnotherPass };
        processedCount += 1;
        await persistCheckpoint({ runId: lease.runId, fence: lease.fence, cursor: checkpoint, processedCount });
      }
      if (Date.now() + CANDIDATE_ADMISSION_MS > lease.deadlineAt.getTime()) { interrupted = true; break; }
    }

    const reachedBatchEnd = businesses.length >= lease.batchLimit;
    const continuation = interrupted || resumeWork || reachedBatchEnd || needsAnotherPass;
    const sweepFailed = sweepFailures > 0;
    const status = sweepFailed ? (sweepSuccesses > 0 ? "partial" : "failed") : continuation ? "partial" : processedCount === 0 ? "no_work" : "succeeded";
    await finishOnce({ runId: lease.runId, fence: lease.fence, status, processedCount, failedCount: sweepFailures, errorCode: sweepFailed ? "partial_failures" : continuation ? "budget_exhausted" : undefined, clearCursor: !continuation && sweepFailed });
    const response = {
      ok: !continuation && !sweepFailed,
      status,
      continuation,
      businesses_scanned: businessesScanned,
      total_sent: totalSent,
      total_failed: totalFailed,
      sweep_failed_count: sweepFailures,
      total_skipped: totalSkipped,
      total_unknown: totalUnknown,
      total_deferred: totalDeferred,
    };
    return jsonResponse(response, sweepFailed ? 500 : continuation ? 202 : 200);
  } catch (error) {
    if (error instanceof CronCheckpointError) {
      safeLogger.error("cron.review_booster.checkpoint_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    if (terminalAttempted) {
      safeLogger.error("cron.review_booster.finish_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    safeLogger.error("cron.review_booster.failed", { errorCode: "job_failed" });
    try {
      await finishOnce({ runId: lease.runId, fence: lease.fence, status: "failed", processedCount, failedCount: failures + 1, errorCode: "job_failed" });
    } catch {
      safeLogger.error("cron.review_booster.health_finish_failed", { errorCode: "health_store_unavailable" });
      return jsonResponse({ ok: false, status: "failed", errorCode: "health_store_unavailable" }, 503);
    }
    return jsonResponse({ ok: false, status: "failed", error: "Cron run failed" }, 500);
  }
}
