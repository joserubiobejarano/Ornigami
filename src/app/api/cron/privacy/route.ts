import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sql } from "@/lib/db/neon";
import { dateDaysAgo, PRIVACY_RETENTION_DAYS } from "@/lib/privacy-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const now = Date.now();
  const leadsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.leads, now);
  const feedbackCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.feedback, now);
  const demoEventsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.publicDemoEvents, now);
  const reviewClicksCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.reviewLinkClicks, now);
  const integrationEventsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.followupIntegrationEvents, now);
  const cronRunsCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.cronRuns, now);
  const stateCutoff = dateDaysAgo(PRIVACY_RETENTION_DAYS.rateLimitState, now);
  const results = await Promise.all([
    sql`DELETE FROM public.leads WHERE created_at < ${leadsCutoff}`,
    sql`DELETE FROM public.feedback WHERE created_at < ${feedbackCutoff}`,
    sql`DELETE FROM public.public_demo_events WHERE event_date < ${demoEventsCutoff}`,
    sql`DELETE FROM public.public_demo_email_challenges WHERE expires_at < now() - interval '1 day'`,
    sql`DELETE FROM public.api_rate_limits WHERE updated_at < ${stateCutoff}`,
    sql`DELETE FROM public.auth_login_attempts WHERE updated_at < ${stateCutoff}`,
    sql`DELETE FROM public.email_verification_tokens WHERE expires_at < now()`,
    sql`DELETE FROM public.review_link_clicks WHERE created_at < ${reviewClicksCutoff}`,
    sql`DELETE FROM public.followup_integration_events WHERE created_at < ${integrationEventsCutoff}`,
    sql`DELETE FROM public.cron_runs WHERE started_at < ${cronRunsCutoff}`,
  ]);
  return NextResponse.json({ ok: true, operations: results.length });
}
