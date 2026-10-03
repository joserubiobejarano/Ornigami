import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sql } from "@/lib/db/neon";
import { evaluateCronAlerts } from "@/lib/cron-alerts";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const monitoring = await evaluateCronAlerts();
    if (!monitoring.ok) throw new Error("health store unavailable");
    const rows = await sql`
      SELECT DISTINCT ON (job_name) job_name, started_at, finished_at, status, processed_count, failed_count,
        budget_ms, batch_limit, outcomes
      FROM public.cron_runs
      ORDER BY job_name, started_at DESC
    `;
    const state = await sql`SELECT job_name, fence, lease_until, cursor IS NOT NULL AS has_cursor,
      checkpoint_at, heartbeat_at, last_success_at, last_status, budget_ms, batch_limit
      FROM public.cron_job_state ORDER BY job_name`;
    const alerts = await sql`SELECT alert_key, job_name, reason, active, first_seen_at, last_seen_at, last_sent_at,
        transport_failures, last_transport_error
      FROM public.cron_alert_state WHERE active IS TRUE ORDER BY first_seen_at DESC`;
    return NextResponse.json({ ok: true, healthy: alerts.length === 0, monitoring, jobs: rows, state, alerts });
  } catch {
    safeLogger.error("cron.health.endpoint_failed", { errorCode: "health_store_unavailable" });
    return NextResponse.json({ ok: false, error: "Cron health unavailable" }, { status: 503 });
  }
}
