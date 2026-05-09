import { NextRequest, NextResponse } from "next/server";

import { sql } from "@/lib/db/neon";
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
    const results: Array<{
      business_id: string;
      ok: boolean;
      scanned: number;
      sent: number;
      failed: number;
      skipped: number;
      error?: string;
    }> = [];

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

        results.push({
          business_id: businessId,
          ok: runResult.ok,
          scanned: runResult.scanned,
          sent: runResult.sent,
          failed: runResult.failed,
          skipped: runResult.skipped
        });
      } catch (error) {
        totalFailed += 1;
        results.push({
          business_id: businessId,
          ok: false,
          scanned: 0,
          sent: 0,
          failed: 1,
          skipped: 0,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return NextResponse.json({
      ok: true,
      businesses_scanned: businessIds.length,
      total_sent: totalSent,
      total_failed: totalFailed,
      total_skipped: totalSkipped,
      results
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Server error"
      },
      { status: 500 }
    );
  }
}
