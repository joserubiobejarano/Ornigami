import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sql } from "@/lib/db/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const results = await Promise.all([
    sql`DELETE FROM public.leads WHERE created_at < now() - interval '90 days'`,
    sql`DELETE FROM public.feedback WHERE created_at < now() - interval '365 days'`,
    sql`DELETE FROM public.public_demo_events WHERE event_date < CURRENT_DATE - 90`,
    sql`DELETE FROM public.public_demo_email_challenges WHERE expires_at < now() - interval '1 day'`,
    sql`DELETE FROM public.api_rate_limits WHERE updated_at < now() - interval '2 days'`,
    sql`DELETE FROM public.auth_login_attempts WHERE updated_at < now() - interval '2 days'`,
    sql`DELETE FROM public.email_verification_tokens WHERE expires_at < now()`,
    sql`DELETE FROM public.review_link_clicks WHERE created_at < now() - interval '365 days'`,
  ]);
  return NextResponse.json({ ok: true, operations: results.length });
}
