import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";
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
      AND lower(status) = 'active'
  `;
  return (rows as ActiveBusinessRow[]).map((row) => row.business_id);
}

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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

      } catch (error) {
        totalFailed += 1;
        safeLogger.error("cron.review_booster.business_failed", { businessId });
      }
    }

    return NextResponse.json({
      ok: true,
      businesses_scanned: businessIds.length,
      total_sent: totalSent,
      total_failed: totalFailed,
      total_skipped: totalSkipped,
    });
  } catch (error) {
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
