import { NextResponse } from "next/server";
import { sql } from "@/server/db";
import { isCronRequestAuthorized } from "@/server/auth";
import { PRIVACY_RETENTION_DAYS } from "@/server/privacy-retention";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cutoff = new Date(Date.now() - PRIVACY_RETENTION_DAYS.operationalRecords * 24 * 60 * 60 * 1000);
  const results = await Promise.all([
    sql`DELETE FROM followup_messages WHERE created_at < ${cutoff}`,
    sql`DELETE FROM integration_events WHERE created_at < ${cutoff}`,
    sql`DELETE FROM visits WHERE created_at < ${cutoff}`,
  ]);
  return NextResponse.json({ ok: true, operations: results.length });
}

export const GET = handle;
export const POST = handle;
