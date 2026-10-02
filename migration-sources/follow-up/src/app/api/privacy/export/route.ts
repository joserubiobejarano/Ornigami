import { NextResponse } from "next/server";
import { sql } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [businesses, visits, messages, integrationEvents] = await Promise.all([
    sql`SELECT * FROM businesses`,
    sql`SELECT * FROM visits`,
    sql`SELECT * FROM followup_messages`,
    sql`SELECT * FROM integration_events`,
  ]);
  return NextResponse.json({ businesses, visits, messages, integrationEvents }, { headers: { "Cache-Control": "no-store" } });
}
