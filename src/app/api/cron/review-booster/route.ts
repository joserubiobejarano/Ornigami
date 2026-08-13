import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { finishCronRun, startCronRun } from "@/lib/cron-health";
import { getReviewBoosterBillingPeriodUsage } from "@/modules/review-booster/services/review-booster-db.service";
import {
  createFollowupRunnerDependencies,
  runEligibleFollowups
} from "@/modules/review-booster/services/followup-runner.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveBusinessRow = {
  business_id: string;
};

async function listActiveReviewBoosterBusinesses(): Promise<string[]> {
  const rows = await sql`
    SELECT business_id
    FROM public.business_agents
    WHERE agent_id = 'review_booster'
      AND lower(status) IN ('active', 'trialing')
  `;
  return (rows as ActiveBusinessRow[]).map((row) => row.business_id);
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("review_booster");
  try {
    const businessIds = await listActiveReviewBoosterBusinesses();
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const businessId of businessIds) {
      try {
        const deps = createFollowupRunnerDependencies(businessId);
        const runResult = await runEligibleFollowups(deps);
        totalSent += runResult.sent;
        totalFailed += runResult.failed;
        totalSkipped += runResult.skipped;
        const periodUsage = await getReviewBoosterBillingPeriodUsage(businessId);
        if (periodUsage.sent >= periodUsage.allowance && runResult.skipped > 0) {
          safeLogger.warn("cron.review_booster.fair_use_limit", {
            businessId,
            sent: periodUsage.sent,
            allowance: periodUsage.allowance,
            skipped: runResult.skipped,
          });
        }

      } catch (error) {
        totalFailed += 1;
        safeLogger.error("cron.review_booster.business_failed", { businessId, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    await finishCronRun({ runId, status: "succeeded", processedCount: businessIds.length, failedCount: totalFailed });

    return NextResponse.json({
      ok: true,
      businesses_scanned: businessIds.length,
      total_sent: totalSent,
      total_failed: totalFailed,
      total_skipped: totalSkipped,
    });
  } catch (error) {
    await finishCronRun({ runId, status: "failed", processedCount: 0, failedCount: 1, errorMessage: error instanceof Error ? error.message : "unknown" });
    safeLogger.error("cron.review_booster.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Server error"
      },
      { status: 500 }
    );
  }
}
