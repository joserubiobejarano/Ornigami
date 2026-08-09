import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const rows = await sql`
    SELECT DISTINCT ON (job_name) job_name, started_at, finished_at, status, processed_count, failed_count, error_message
    FROM public.cron_runs
    ORDER BY job_name, started_at DESC
  `;
  return NextResponse.json({ ok: true, jobs: rows });
}