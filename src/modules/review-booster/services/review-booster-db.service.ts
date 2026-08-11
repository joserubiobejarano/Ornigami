import { sql } from "@/lib/db/neon";
import { PLANS, isPlanId } from "@/lib/billing/plans";
import { FollowupStats, FollowupVisit } from "@/modules/review-booster/types/followup.types";

export type CreateFollowupVisitInput = {
  businessId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  serviceName?: string | null;
  visitedAt: string | Date;
  source?: string | null;
  externalId?: string | null;
};

export type CreateFollowupMessageInput = {
  visitId: string;
  businessId: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  provider?: string;
  providerMessageId?: string | null;
  status: "sent" | "failed" | string;
  errorMessage?: string | null;
  sentAt?: string | Date | null;
};

export type CsvVisitDuplicateInput = {
  businessId: string;
  customerEmail: string;
  serviceName?: string | null;
  visitedAt: string | Date;
};

export type BusinessFollowupSettings = {
  id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  google_review_url: string | null;
  rebooking_url: string | null;
  tone: string | null;
  language: string | null;
  email_from_name: string | null;
  error_reason?: string | null;
};

export type FollowupIntegrationEventInput = {
  businessId: string;
  source: string;
  eventType?: string | null;
  externalId?: string | null;
  rawPayload?: unknown;
  processedAt?: string | Date | null;
};

export async function createFollowupVisit(input: CreateFollowupVisitInput): Promise<FollowupVisit> {
  // TODO: enforce business membership/ownership authorization before creating followup visits.
  const rows = await sql`
    INSERT INTO public.followup_visits (
      business_id, customer_name, customer_email, customer_phone, service_name, visited_at, source, external_id
    )
    VALUES (
      ${input.businessId},
      ${input.customerName ?? null},
      ${input.customerEmail ?? null},
      ${input.customerPhone ?? null},
      ${input.serviceName ?? null},
      ${input.visitedAt},
      ${input.source ?? "manual"},
      ${input.externalId ?? null}
    )
    RETURNING
      id, business_id, customer_name, customer_email, customer_phone, service_name,
      visited_at, source, followup_status, followup_sent_at
  `;
  return rows[0] as FollowupVisit;
}

export async function findCsvVisitDuplicate(input: CsvVisitDuplicateInput): Promise<FollowupVisit | null> {
  const rows = await sql`
    SELECT
      id, business_id, customer_name, customer_email, customer_phone, service_name,
      visited_at, source, followup_status, followup_sent_at
    FROM public.followup_visits
    WHERE business_id = ${input.businessId}
      AND source = 'csv'
      AND customer_email IS NOT NULL
      AND lower(customer_email) = lower(${input.customerEmail})
      AND coalesce(service_name, '') = coalesce(${input.serviceName ?? null}, '')
      AND visited_at = ${input.visitedAt}
    LIMIT 1
  `;
  return (rows[0] as FollowupVisit | undefined) ?? null;
}

export async function getFollowupStats(businessId: string): Promise<FollowupStats> {
  const rows = await sql`
    SELECT
      count(*) FILTER (WHERE lower(followup_status) = 'pending')::int AS pending,
      count(*) FILTER (WHERE lower(followup_status) = 'sent')::int AS sent,
      count(*) FILTER (WHERE lower(followup_status) = 'failed')::int AS failed,
      count(*) FILTER (WHERE lower(followup_status) = 'skipped')::int AS skipped
    FROM public.followup_visits
    WHERE business_id = ${businessId}
  `;
  const row = rows[0] as { pending: number; sent: number; failed: number; skipped: number } | undefined;
  return {
    pending: row?.pending ?? 0,
    sent: row?.sent ?? 0,
    failed: row?.failed ?? 0,
    skipped: row?.skipped ?? 0
  };
}

export type ReviewOutcomeStats = {
  requestsSent: number;
  reviewsSynced: number;
  repliesPosted: number;
  linkClicks: number;
};

export type ReviewBoosterMonthlyUsage = {
  sent: number;
  allowance: number;
};

export async function getReviewBoosterMonthlyUsage(businessId: string): Promise<ReviewBoosterMonthlyUsage> {
  const rows = await sql`
    SELECT
      ba.plan_id,
      (
        SELECT count(*)::int
        FROM public.followup_messages fm
        WHERE fm.business_id = ${businessId}
          AND lower(fm.status) = 'sent'
          AND fm.sent_at >= date_trunc('month', now())
      ) AS sent
    FROM public.business_agents ba
    WHERE ba.business_id = ${businessId}
      AND ba.agent_id = 'review_booster'
    LIMIT 1
  `;
  const row = rows[0] as { sent?: number; plan_id?: string | null } | undefined;
  const planId = row?.plan_id && isPlanId(row.plan_id) ? row.plan_id : "booster";
  return { sent: Number(row?.sent ?? 0), allowance: PLANS[planId].monthlyRequestAllowance };
}
export async function getReviewOutcomeStats(businessId: string): Promise<ReviewOutcomeStats> {
  const rows = await sql`
    SELECT
      count(DISTINCT v.id) FILTER (WHERE lower(v.followup_status) = 'sent')::int AS requests_sent,
      count(DISTINCT r.id)::int AS reviews_synced,
      count(DISTINCT rr.id) FILTER (WHERE rr.posted = true)::int AS replies_posted,
      count(DISTINCT c.id)::int AS link_clicks
    FROM public.businesses b
    LEFT JOIN public.followup_visits v ON v.business_id = b.id
    LEFT JOIN public.reviews r ON r.business_id = b.id
    LEFT JOIN public.review_replies rr ON rr.review_id = r.id
    LEFT JOIN public.review_link_clicks c ON c.business_id = b.id
    WHERE b.id = ${businessId}
  `;
  const row = rows[0] as {
    requests_sent?: number;
    reviews_synced?: number;
    replies_posted?: number;
    link_clicks?: number;
  } | undefined;
  return {
    requestsSent: Number(row?.requests_sent ?? 0),
    reviewsSynced: Number(row?.reviews_synced ?? 0),
    repliesPosted: Number(row?.replies_posted ?? 0),
    linkClicks: Number(row?.link_clicks ?? 0),
  };
}
export async function getRecentVisits(businessId: string, limit = 50): Promise<FollowupVisit[]> {
  const rows = await sql`
    SELECT
      v.id,
      v.business_id,
      b.name AS business_name,
      b.business_type,
      b.city,
      v.customer_name,
      v.customer_email,
      v.customer_phone,
      v.service_name,
      v.visited_at,
      v.source,
      v.followup_status,
      v.followup_sent_at,
      v.attempt_count,
      v.next_attempt_at,
      b.google_review_url,
      b.rebooking_url,
      b.tone,
      b.language,
      b.email_from_name,
      (SELECT fm.error_message FROM public.followup_messages fm WHERE fm.visit_id = v.id ORDER BY fm.created_at DESC LIMIT 1) AS error_reason
    FROM public.followup_visits v
    JOIN public.businesses b ON b.id = v.business_id
    WHERE v.business_id = ${businessId}
    ORDER BY v.visited_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 500))}
  `;
  return rows as FollowupVisit[];
}

export async function listEligibleFollowupVisits(businessId: string): Promise<FollowupVisit[]> {
  const rows = await sql`
    SELECT
      v.id,
      v.business_id,
      b.name AS business_name,
      b.business_type,
      b.city,
      v.customer_name,
      v.customer_email,
      v.customer_phone,
      v.service_name,
      v.visited_at,
      v.source,
      v.followup_status,
      v.followup_sent_at,
      v.attempt_count,
      v.next_attempt_at,
      b.google_review_url,
      b.rebooking_url,
      b.tone,
      b.language,
      b.email_from_name,
      (SELECT fm.error_message FROM public.followup_messages fm WHERE fm.visit_id = v.id ORDER BY fm.created_at DESC LIMIT 1) AS error_reason
    FROM public.followup_visits v
    JOIN public.businesses b ON b.id = v.business_id
    WHERE v.business_id = ${businessId}
      AND (lower(v.followup_status) = 'pending' OR (lower(v.followup_status) = 'failed' AND coalesce(v.attempt_count, 0) < 3 AND (v.next_attempt_at IS NULL OR v.next_attempt_at <= now())))
      AND v.followup_sent_at IS NULL
      AND v.customer_email IS NOT NULL
      AND b.google_review_url IS NOT NULL
      AND length(trim(v.customer_email)) > 0
      AND v.visited_at <= now() - interval '23 hours'
      AND v.visited_at >= now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1
        FROM public.followup_unsubscribes u
        WHERE u.business_id = v.business_id
          AND u.customer_email_normalized = lower(v.customer_email)
      )
    ORDER BY v.visited_at ASC
  `;
  return rows as FollowupVisit[];
}

export async function unsubscribeCustomerFromBusinessFollowups(input: {
  businessId: string;
  customerEmail: string;
}): Promise<void> {
  const email = input.customerEmail.trim().toLowerCase();
  await sql`
    INSERT INTO public.followup_unsubscribes (business_id, customer_email, reason, updated_at)
    VALUES (${input.businessId}, ${email}, 'email_link', now())
    ON CONFLICT (business_id, customer_email_normalized)
    DO UPDATE SET updated_at = now()
  `;

  await sql`
    UPDATE public.followup_visits
    SET followup_status = 'skipped', updated_at = now()
    WHERE business_id = ${input.businessId}
      AND customer_email IS NOT NULL
      AND lower(customer_email) = lower(${email})
      AND lower(followup_status) = 'pending'
      AND followup_sent_at IS NULL
  `;
}

export async function getBusinessFollowupSettings(businessId: string): Promise<BusinessFollowupSettings | null> {
  // TODO: enforce caller authorization to read business followup settings.
  const rows = await sql`
    SELECT
      id, name, business_type, city, google_review_url, rebooking_url, tone, language, email_from_name
    FROM public.businesses
    WHERE id = ${businessId}
    LIMIT 1
  `;
  return (rows[0] as BusinessFollowupSettings | undefined) ?? null;
}

export async function createFollowupMessage(input: CreateFollowupMessageInput): Promise<void> {
  await sql`
    INSERT INTO public.followup_messages (
      visit_id, business_id, channel, subject, body, provider, provider_message_id, status, error_message, sent_at
    )
    VALUES (
      ${input.visitId},
      ${input.businessId},
      ${input.channel ?? "email"},
      ${input.subject ?? null},
      ${input.body ?? null},
      ${input.provider ?? "resend"},
      ${input.providerMessageId ?? null},
      ${input.status},
      ${input.errorMessage ?? null},
      ${input.sentAt ?? null}
    )
  `;
}

export async function hasSentMessageForVisit(visitId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM public.followup_messages
    WHERE visit_id = ${visitId}
      AND lower(status) = 'sent'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function markVisitSent(visitId: string): Promise<void> {
  await sql`
    UPDATE public.followup_visits
    SET followup_status = 'sent', followup_sent_at = now(), next_attempt_at = NULL, updated_at = now()
    WHERE id = ${visitId}
  `;
}

export async function markVisitFailed(visitId: string, _errorMessage: string): Promise<void> {
  await sql`
    UPDATE public.followup_visits
    SET followup_status = 'failed', last_error = ${_errorMessage}, attempt_count = coalesce(attempt_count, 0) + 1, next_attempt_at = now() + (least(power(2, coalesce(attempt_count, 0)), 8) * interval '15 minutes'), updated_at = now()
    WHERE id = ${visitId}
  `;
}

export async function markVisitSkipped(visitId: string, reason: string): Promise<void> {
  await sql`
    UPDATE public.followup_visits
    SET followup_status = 'skipped', last_error = ${reason}, next_attempt_at = NULL, updated_at = now()
    WHERE id = ${visitId}
      AND followup_sent_at IS NULL
  `;
}
export async function findFollowupIntegrationEventDuplicate(
  businessId: string,
  source: string,
  externalId: string
): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM public.followup_integration_events
    WHERE business_id = ${businessId}
      AND source = ${source}
      AND external_id = ${externalId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function createFollowupIntegrationEvent(input: FollowupIntegrationEventInput): Promise<void> {
  await sql`
    INSERT INTO public.followup_integration_events (
      business_id, source, event_type, external_id, raw_payload, processed_at
    )
    VALUES (
      ${input.businessId},
      ${input.source},
      ${input.eventType ?? null},
      ${input.externalId ?? null},
      ${input.rawPayload ? JSON.stringify(input.rawPayload) : null}::jsonb,
      ${input.processedAt ?? null}
    )
    ON CONFLICT (business_id, source, external_id)
    DO NOTHING
  `;
}
