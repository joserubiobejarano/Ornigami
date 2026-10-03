import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie",
};

/**
 * Export account-owned records in one SQL statement. A single statement gives
 * the export a consistent PostgreSQL snapshot without pulling provider tokens,
 * secret payloads, or unrelated workspace members into the response.
 */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }

  const url = new URL(request.url);
  const scopes = url.searchParams.getAll("scope");
  if (scopes.length > 1) {
    return NextResponse.json({ error: "Specify one export scope." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const rawScope = scopes[0] ?? "personal";
  if (rawScope !== "personal" && rawScope !== "workspace") {
    return NextResponse.json({ error: "Scope must be personal or workspace." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const scope = rawScope;
  const businessIds = url.searchParams.getAll("businessId");
  const businessId = businessIds[0] ?? null;
  if (businessIds.length > 1 || (businessIds.length === 1 && (!businessId || !UUID_PATTERN.test(businessId)))) {
    return NextResponse.json({ error: "businessId must be a UUID." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (scope === "personal" && businessIds.length > 0) {
    return NextResponse.json({ error: "businessId is available only for workspace exports." }, { status: 400, headers: PRIVATE_HEADERS });
  }

  if (scope === "workspace") {
    let result: Array<{ export_data?: unknown }>;
    try {
      result = await sql`
      WITH actor AS (
        SELECT id, email, name, image, email_verified, created_at, updated_at
        FROM public.users
        WHERE id = ${userId}::uuid AND privacy_deletion_requested_at IS NULL
      ), owned_businesses AS (
        SELECT b.id, b.owner_user_id, b.name, b.business_type, b.city, b.country, b.website,
          b.phone, b.google_review_url, b.rebooking_url, b.tone, b.language,
          b.email_from_name, b.stripe_customer_id, b.created_at, b.updated_at
        FROM public.businesses b
        INNER JOIN actor a ON a.id = b.owner_user_id
        WHERE ${businessId}::uuid IS NULL OR b.id = ${businessId}::uuid
      )
      SELECT jsonb_build_object(
        'version', 1,
        'scope', 'workspace',
        'generatedAt', now(),
        'businesses', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'business', jsonb_build_object(
              'id', b.id, 'name', b.name, 'business_type', b.business_type,
              'city', b.city, 'country', b.country, 'website', b.website,
              'phone', b.phone, 'google_review_url', b.google_review_url,
              'rebooking_url', b.rebooking_url, 'tone', b.tone, 'language', b.language,
              'email_from_name', b.email_from_name, 'created_at', b.created_at, 'updated_at', b.updated_at
            ),
            'settings', jsonb_build_object(
              'agents', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'agent_id', ba.agent_id, 'status', ba.status, 'plan_id', ba.plan_id,
                  'billing_period', ba.billing_period, 'activated_at', ba.activated_at,
                  'deactivated_at', ba.deactivated_at, 'price_locked_until', ba.price_locked_until,
                  'created_at', ba.created_at, 'updated_at', ba.updated_at
                )) FROM public.business_agents ba WHERE ba.business_id = b.id
              ), '[]'::jsonb),
              'selectedGoogleLocation', (
                SELECT jsonb_build_object('location_id', s.location_id, 'created_at', s.created_at, 'updated_at', s.updated_at)
                FROM public.business_google_locations s WHERE s.business_id = b.id
              ),
              'googleConnection', (
                SELECT jsonb_build_object('provider', c.provider, 'scope', c.scope, 'expires_at', c.expires_at,
                  'connection_version', c.connection_version, 'created_at', c.created_at, 'updated_at', c.updated_at)
                FROM public.gbp_connections c INNER JOIN actor a ON a.id = c.user_id
              ),
              'googleLocations', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'location_name', l.location_name, 'title', l.title, 'address', l.address,
                  'timezone', l.timezone, 'store_code', l.store_code, 'place_id', l.place_id,
                  'connected', l.connected, 'created_at', l.created_at, 'updated_at', l.updated_at
                ))
                FROM public.gbp_locations l
                INNER JOIN actor a ON a.id = l.user_id
                WHERE l.id IN (SELECT s.location_id FROM public.business_google_locations s WHERE s.business_id = b.id)
              ), '[]'::jsonb),
              'automationPreferences', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'location_id', p.location_id, 'autosend_min_rating', p.autosend_min_rating,
                  'approve_low_ratings', p.approve_low_ratings, 'check_interval_minutes', p.check_interval_minutes,
                  'created_at', p.created_at, 'updated_at', p.updated_at
                ))
                FROM public.automation_prefs p
                WHERE p.location_id IN (SELECT s.location_id FROM public.business_google_locations s WHERE s.business_id = b.id)
              ), '[]'::jsonb)
            ),
            'reviews', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', r.id, 'location_name', r.location_name, 'google_review_id', r.google_review_id,
                'reviewer_name', r.reviewer_name, 'star_rating', r.star_rating, 'comment', r.comment,
                'review_update_time', r.review_update_time, 'language_code', r.language_code,
                'reply_comment', r.reply_comment, 'reply_update_time', r.reply_update_time,
                'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at
              )) FROM public.reviews r WHERE r.business_id = b.id
            ), '[]'::jsonb),
            'replies', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', rr.id, 'review_id', rr.review_id, 'draft_markdown', rr.draft_markdown,
                'posted', rr.posted, 'posted_at', rr.posted_at, 'google_operation_id', rr.google_operation_id,
                'created_at', rr.created_at, 'updated_at', rr.updated_at
              )) FROM public.review_replies rr WHERE rr.business_id = b.id
            ), '[]'::jsonb),
            'replyDraftState', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'review_id', s.review_id, 'reply_id', s.reply_id, 'state', s.state,
                'version', s.version, 'updated_at', s.updated_at
              ) ORDER BY s.review_id)
              FROM public.review_reply_draft_state s WHERE s.business_id = b.id
            ), '[]'::jsonb),
            'replyUsageReservations', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'review_id', u.review_id, 'usage_period_start', u.usage_period_start,
                'state', u.state, 'created_at', u.created_at, 'expires_at', u.expires_at,
                'finalized_at', u.finalized_at
              ) ORDER BY u.created_at, u.usage_period_start)
              FROM public.review_reply_usage_reservations u WHERE u.business_id = b.id
            ), '[]'::jsonb),
            'visits', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', v.id, 'customer_name', v.customer_name, 'customer_email', v.customer_email,
                'customer_phone', v.customer_phone, 'service_name', v.service_name, 'visited_at', v.visited_at,
                'source', v.source, 'external_id', v.external_id, 'followup_status', v.followup_status,
                'followup_sent_at', v.followup_sent_at, 'created_at', v.created_at, 'updated_at', v.updated_at
              )) FROM public.followup_visits v WHERE v.business_id = b.id
            ), '[]'::jsonb),
            'messages', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'visit_id', m.visit_id, 'channel', m.channel, 'subject', m.subject,
                'body', m.body, 'provider', m.provider, 'status', m.status,
                'sent_at', m.sent_at, 'created_at', m.created_at
              )) FROM public.followup_messages m WHERE m.business_id = b.id
            ), '[]'::jsonb),
            'boosterDeliveries', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'visit_id', d.visit_id, 'state', d.state, 'first_attempt_at', d.first_attempt_at,
                'send_attempt_count', d.send_attempt_count, 'reservation_month', d.reservation_month,
                'created_at', d.created_at, 'updated_at', d.updated_at, 'accepted_at', d.accepted_at,
                'delivery_status', d.delivery_status, 'delivery_status_at', d.delivery_status_at
              ) ORDER BY d.created_at, d.visit_id)
              FROM public.booster_followup_deliveries d WHERE d.business_id = b.id
            ), '[]'::jsonb),
            'boosterDeliveryEvents', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'delivery_id', d.id, 'event_type', e.event_type, 'event_created_at', e.event_created_at,
                'evidence_source', e.evidence_source, 'received_at', e.received_at
              ) ORDER BY e.event_created_at, e.event_id)
              FROM public.booster_delivery_events e
              INNER JOIN public.booster_followup_deliveries d ON d.id = e.delivery_id
              WHERE d.business_id = b.id
            ), '[]'::jsonb),
            'boosterDeliveryCorrelations', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'delivery_id', d.id, 'linked_at', c.linked_at
              ) ORDER BY c.linked_at, d.id)
              FROM public.booster_delivery_provider_correlations c
              INNER JOIN public.booster_followup_deliveries d ON d.id = c.delivery_id
              WHERE d.business_id = b.id
            ), '[]'::jsonb),
            'boosterDeliverySuppressions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'email', s.email_normalized, 'reason', s.reason, 'created_at', s.created_at
              ) ORDER BY s.email_normalized)
              FROM public.booster_delivery_suppressions s
              WHERE EXISTS (
                SELECT 1 FROM public.followup_visits v
                WHERE v.business_id = b.id AND lower(trim(v.customer_email)) = s.email_normalized
              )
            ), '[]'::jsonb),
            'boosterQuotaLegacyUsage', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'month_start_utc', q.month_start, 'accepted_count', q.accepted_count
              ) ORDER BY q.month_start)
              FROM public.booster_quota_legacy_usage q WHERE q.business_id = b.id
            ), '[]'::jsonb),
            'clicks', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'visit_id', c.visit_id, 'clicked_at', c.clicked_at, 'user_agent', c.user_agent
              )) FROM public.review_link_clicks c WHERE c.business_id = b.id
            ), '[]'::jsonb),
            'integrationEvents', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', e.id, 'source', e.source, 'event_type', e.event_type,
                'external_id', e.external_id, 'processed_at', e.processed_at, 'created_at', e.created_at
              )) FROM public.followup_integration_events e WHERE e.business_id = b.id
            ), '[]'::jsonb),
            'bookingCredentials', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'label', c.label, 'created_at', c.created_at,
                'last_used_at', c.last_used_at, 'revoked_at', c.revoked_at
              ) ORDER BY c.created_at, c.id)
              FROM public.booster_booking_credentials c WHERE c.business_id = b.id
            ), '[]'::jsonb),
            'replyPostOutcomes', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'business_id', o.business_id, 'review_id', o.review_id,
                'outcome', o.outcome, 'recorded_at', o.recorded_at
              ) ORDER BY o.recorded_at, o.review_id)
              FROM public.privacy_reply_post_outcomes o WHERE o.business_id = b.id
            ), '[]'::jsonb),
            'unsubscribeSuppressions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'customer_email', u.customer_email, 'reason', u.reason,
                'unsubscribed_at', u.unsubscribed_at, 'created_at', u.created_at, 'updated_at', u.updated_at
              )) FROM public.followup_unsubscribes u WHERE u.business_id = b.id
            ), '[]'::jsonb),
            'invitations', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'role', i.role, 'status', i.status, 'expires_at', i.expires_at,
                'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at, 'created_at', i.created_at
              )) FROM public.team_invitations i WHERE i.business_id = b.id
            ), '[]'::jsonb),
            'billing', jsonb_build_object(
              'stripeCustomerId', b.stripe_customer_id,
              'subscriptions', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'agent_id', ba.agent_id, 'plan_id', ba.plan_id, 'billing_period', ba.billing_period,
                  'stripe_subscription_id', ba.stripe_subscription_id, 'stripe_price_id', ba.stripe_price_id,
                  'status', ba.status, 'activated_at', ba.activated_at, 'deactivated_at', ba.deactivated_at,
                  'current_period_start', ba.current_period_start, 'current_period_end', ba.current_period_end,
                  'created_at', ba.created_at, 'updated_at', ba.updated_at
                )) FROM public.business_agents ba WHERE ba.business_id = b.id
              ), '[]'::jsonb),
              'checkoutHistory', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'plan_id', i.plan_id, 'billing_period', i.billing_period,
                  'stripe_session_id', i.stripe_session_id, 'stripe_subscription_id', i.stripe_subscription_id,
                  'status', i.status,
                  'created_at', i.created_at, 'updated_at', i.updated_at, 'completed_at', i.completed_at
                )) FROM public.billing_checkout_intents i WHERE i.business_id = b.id
              ), '[]'::jsonb),
              'trialHistory', (
                SELECT jsonb_build_object('state', h.state, 'source', h.source,
                  'stripe_subscription_id', h.stripe_subscription_id, 'consumed_at', h.consumed_at,
                  'created_at', h.created_at, 'updated_at', h.updated_at)
                FROM public.billing_trial_business_history h WHERE h.business_id = b.id
              ),
              'trialReservation', (
                SELECT jsonb_build_object('business_id', r.business_id, 'created_at', r.created_at)
                FROM public.billing_trial_reservations r WHERE r.business_id = b.id
              )
            )
          )) FROM owned_businesses b
        ), '[]'::jsonb),
        'owner', (SELECT jsonb_build_object('email', a.email, 'name', a.name, 'image', a.image) FROM actor a)
      ) AS export_data
      WHERE EXISTS (SELECT 1 FROM actor)
        AND EXISTS (SELECT 1 FROM owned_businesses)
      `;
    } catch (error) {
      safeLogger.error("privacy.export.workspace_failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
      return NextResponse.json({ error: "Export is temporarily unavailable." }, { status: 500, headers: PRIVATE_HEADERS });
    }
    const exportData = (result[0] as { export_data?: unknown } | undefined)?.export_data;
    if (!exportData) {
      return NextResponse.json({ error: "Workspace not found or not owned by this account." }, { status: 403, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json(exportData, { headers: PRIVATE_HEADERS });
  }

  let result: Array<{ export_data?: unknown }>;
  try {
    result = await sql`
    WITH actor AS (
      SELECT id, email, name, image, email_verified, created_at, updated_at
      FROM public.users
      WHERE id = ${userId}::uuid AND privacy_deletion_requested_at IS NULL
    )
    SELECT jsonb_build_object(
      'version', 1,
      'scope', 'personal',
      'generatedAt', now(),
      'user', (SELECT jsonb_build_object('id', a.id, 'email', a.email, 'name', a.name, 'image', a.image,
        'email_verified', a.email_verified, 'created_at', a.created_at, 'updated_at', a.updated_at) FROM actor a),
      'profile', (
        SELECT jsonb_build_object('full_name', p.full_name, 'business_name', p.business_name,
          'city', p.city, 'country', p.country, 'plan', p.plan, 'plan_type', p.plan_type,
          'plan_status', p.plan_status, 'plan_current_period_end', p.plan_current_period_end,
          'ai_posts_used', p.ai_posts_used, 'audits_used', p.audits_used,
          'review_replies_used', p.review_replies_used, 'usage_reset_date', p.usage_reset_date,
          'reply_tone', p.reply_tone, 'owner_name', p.owner_name, 'contact_preference', p.contact_preference,
          'auto_reply_all_reviews', p.auto_reply_all_reviews, 'created_at', p.created_at, 'updated_at', p.updated_at)
        FROM public.profiles p INNER JOIN actor a ON a.id = p.id
      ),
      'projects', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'type', p.type,
          'input', p.input, 'output_md', p.output_md, 'created_at', p.created_at, 'updated_at', p.updated_at))
        FROM public.projects p INNER JOIN actor a ON a.id = p.user_id
      ), '[]'::jsonb),
      'feedback', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', f.id, 'message', f.message, 'category', f.category,
          'url', f.url, 'browser', f.browser, 'created_at', f.created_at))
        FROM public.feedback f INNER JOIN actor a ON a.id = f.user_id
      ), '[]'::jsonb),
      'businesses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'business_type', b.business_type,
          'city', b.city, 'country', b.country, 'created_at', b.created_at, 'updated_at', b.updated_at))
        FROM public.businesses b INNER JOIN actor a ON a.id = b.owner_user_id
      ), '[]'::jsonb),
      'memberships', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('business_id', bm.business_id, 'role', bm.role,
          'business_name', b.name, 'created_at', bm.created_at))
        FROM public.business_members bm
        INNER JOIN actor a ON a.id = bm.user_id
        INNER JOIN public.businesses b ON b.id = bm.business_id
      ), '[]'::jsonb),
      'invitations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('business_id', i.business_id,
          'role', i.role, 'status', i.status, 'expires_at', i.expires_at, 'accepted_at', i.accepted_at,
          'revoked_at', i.revoked_at, 'created_at', i.created_at))
        FROM public.team_invitations i INNER JOIN actor a ON a.id = i.invited_by
      ), '[]'::jsonb),
      'googleLocations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('location_name', l.location_name, 'title', l.title,
          'address', l.address, 'timezone', l.timezone, 'store_code', l.store_code,
          'place_id', l.place_id, 'connected', l.connected, 'created_at', l.created_at, 'updated_at', l.updated_at))
        FROM public.gbp_locations l INNER JOIN actor a ON a.id = l.user_id
      ), '[]'::jsonb),
      'googleConnection', (
        SELECT jsonb_build_object('provider', c.provider, 'scope', c.scope, 'expires_at', c.expires_at,
          'connection_version', c.connection_version, 'created_at', c.created_at, 'updated_at', c.updated_at)
        FROM public.gbp_connections c INNER JOIN actor a ON a.id = c.user_id
      ),
      'automationPreferences', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('location_id', p.location_id,
          'autosend_min_rating', p.autosend_min_rating, 'approve_low_ratings', p.approve_low_ratings,
          'check_interval_minutes', p.check_interval_minutes, 'created_at', p.created_at, 'updated_at', p.updated_at))
        FROM public.automation_prefs p
        WHERE p.location_id IN (SELECT l.id FROM public.gbp_locations l INNER JOIN actor a ON a.id = l.user_id)
      ), '[]'::jsonb),
      'billing', jsonb_build_object(
        'legacyCustomerId', (SELECT b.stripe_customer_id FROM public.user_billing b INNER JOIN actor a ON a.id = b.user_id),
        'customerId', (SELECT b.stripe_customer_id FROM public.billing_owner_customers b INNER JOIN actor a ON a.id = b.owner_user_id),
        'subscriptions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'price_id', s.price_id,
            'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
            'created_at', s.created_at, 'updated_at', s.updated_at))
          FROM public.subscriptions s INNER JOIN actor a ON a.id = s.user_id
        ), '[]'::jsonb),
        'checkoutHistory', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('business_id', i.business_id, 'plan_id', i.plan_id,
            'billing_period', i.billing_period, 'stripe_session_id', i.stripe_session_id,
            'stripe_subscription_id', i.stripe_subscription_id,
            'status', i.status, 'created_at', i.created_at, 'updated_at', i.updated_at, 'completed_at', i.completed_at))
          FROM public.billing_checkout_intents i INNER JOIN actor a ON a.id = i.owner_user_id
        ), '[]'::jsonb),
        'businessTrialHistory', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('business_id', h.business_id, 'state', h.state,
            'source', h.source, 'stripe_subscription_id', h.stripe_subscription_id,
            'consumed_at', h.consumed_at, 'created_at', h.created_at, 'updated_at', h.updated_at))
          FROM public.billing_trial_business_history h
          WHERE h.business_id IN (SELECT b.id FROM public.businesses b INNER JOIN actor a ON a.id = b.owner_user_id)
        ), '[]'::jsonb),
        'customerProvisioning', (
          SELECT jsonb_build_object('status', p.status, 'created_at', p.created_at, 'updated_at', p.updated_at)
          FROM public.billing_customer_provisioning p INNER JOIN actor a ON a.id = p.owner_user_id
        ),
        'trialReservations', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('business_id', r.business_id, 'created_at', r.created_at))
          FROM public.billing_trial_reservations r INNER JOIN actor a ON a.id = r.owner_user_id
        ), '[]'::jsonb),
        'webhookEvents', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('event_id', e.event_id, 'event_type', e.event_type,
            'status', e.status, 'completed_at', e.completed_at, 'created_at', e.created_at, 'updated_at', e.updated_at))
          FROM public.billing_webhook_events e INNER JOIN actor a ON a.id = e.owner_user_id
        ), '[]'::jsonb),
        'reconciliationLease', (
          SELECT jsonb_build_object('event_id', l.event_id, 'event_type', l.event_type,
            'lease_until', l.lease_until, 'updated_at', l.updated_at)
          FROM public.billing_reconciliation_leases l INNER JOIN actor a ON a.id = l.owner_user_id
        ),
        'trialHistory', (
          SELECT jsonb_build_object('state', h.state, 'source', h.source,
            'stripe_subscription_id', h.stripe_subscription_id, 'consumed_at', h.consumed_at,
            'created_at', h.created_at, 'updated_at', h.updated_at)
          FROM public.billing_trial_owner_history h INNER JOIN actor a ON a.id = h.owner_user_id
        )
      )
    ) AS export_data
    WHERE EXISTS (SELECT 1 FROM actor)
    `;
  } catch (error) {
    safeLogger.error("privacy.export.personal_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "Export is temporarily unavailable." }, { status: 500, headers: PRIVATE_HEADERS });
  }
  const exportData = (result[0] as { export_data?: unknown } | undefined)?.export_data;
  if (!exportData) {
    return NextResponse.json({ error: "Account not found or session expired." }, { status: 401, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json(exportData, { headers: PRIVATE_HEADERS });
}
