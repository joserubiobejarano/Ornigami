# Database

Neon Postgres is the database. `neon/migrations` is the only schema source of truth; apply migrations in numeric order.

## Migration order

1. `001_initial.sql` — core users, profiles, billing mirrors, reviews, projects, leads, feedback, and Google tables
2. `002_auto_reply_profiles.sql` — reply-profile automation fields
3. `003_business_foundation.sql` — businesses, members, and agent activation
4. `004_review_booster_tables.sql` — visits, messages, and integration events
5. `005_business_agent_billing_fields.sql` — Stripe linkage and billing-period fields
6. `006_public_demo_events.sql` — public demo rate-limit tracking
7. `007_review_booster_unsubscribes.sql` — recipient suppression records
8. `008_pricing_plans.sql` — plan fields and Stripe webhook idempotency
9. `009_review_booster_error_reason.sql` — persisted processing error reasons
10. `010_review_booster_retries.sql` — bounded retry state
11. `011_review_link_clicks.sql` — review-link click attribution
12. `012_cron_runs.sql` — scheduled-job execution history
13. `013_review_business_tenancy.sql` — canonical business ownership for reviews and reply drafts
14. `014_security_hardening.sql` — email verification, login attempts, API/public-demo rate limits, and Review Replies usage counter
15. `015_stripe_usage_periods.sql` — current billing-period start fields
16. `016_remove_legacy_plan_taxonomy.sql` — current plan constraints (`free`, `replies`, `booster`, `complete`)
17. `017_team_invitations.sql` — expiring Complete-plan workspace invitations

18. `019_billing_lifecycle.sql` — durable customer/checkout and trial/reconciliation histories
19. `020_account_recovery.sql` — session version and single-use recovery tokens
20. `021_workspace_invitations.sql` — atomic invitation/seat lifecycle
21. `022_booster_delivery_quotas.sql` — durable Booster delivery and UTC monthly quota ledger
22. `024_review_draft_policy.sql` — current draft/version/posting state and generation reservations
23. `026_privacy_account_lifecycle.sql` — gated deletion operations and provider-call leases
24. `031_google_location_selection.sql` — explicit selected location and connection generations
25. `032_workspace_bootstrap.sql` — serialized workspace admission

Wave 4 adds 023 booking intake, 027 cron operations, and 033–038 lifecycle guards/finalization/manual-CSV admission. Wave 5 adds 025 provider delivery events/suppression and 028 dashboard indexes. See the canonical [migration map](../neon/README.md). 018 remains unused and 029–030 remain reserved. Existing deployments receive only missing reviewed files without renumbering earlier applied migrations.

Delivery status is independent of send acceptance: a bounce, complaint or later provider failure never releases accepted quota or makes a replacement send eligible. Event history stores linkable recipient hashes; global suppression retains the normalized address to block Booster sends across businesses. Correlation remains after delivery-row cleanup so late verified feedback can still suppress. These retained identifiers require an explicit retention decision; no TTL or deletion purge is invented. Workspace export projects associated status/event/correlation metadata and associated-address suppression reason/time, excluding provider/event identifiers, payloads and hashes. Other mail categories require a separate suppression policy. Owner manual lookup reconciliation remains default-closed behind `RESEND_RECONCILIATION_ENABLED` until provider configuration and controlled acceptance are verified.

## Main schema areas

- Identity: `users`, `profiles`, `email_verification_tokens`
- Billing: `subscriptions`, `user_billing`, `v_user_plan`, `business_agents`, Stripe event/idempotency fields
- Business tenancy: `businesses`, `business_members`, `business_agents`
- Google operations: `gbp_connections`, `gbp_locations`, `reviews`, `review_replies`, `automation_prefs`
- Review Booster: `followup_visits`, `followup_messages`, `followup_integration_events`, `followup_unsubscribes`, `review_link_clicks`
- Operations/privacy: `cron_runs`, `api_rate_limits`, `auth_login_attempts`, `public_demo_events`, `public_demo_email_challenges`
- Team: `team_invitations`
- Legacy/supporting: `projects`, `leads`, `feedback`

## Tenancy and access rules

- `reviews.business_id` is the canonical ownership key.
- `review_replies.business_id` follows its owning review.
- Legacy `user_id` columns remain for compatibility; application reads/writes use business scope.
- `business_agents` grants feature access. User-facing active statuses are `active` and `trialing`.
- Scheduled Review Booster and Review Replies jobs process `active` or `trialing` agent records.

## Review Booster rules

- CSV duplicates are detected by business, normalized customer email, service, visit date, and `source = 'csv'`.
- The runner skips visits with a sent message or active unsubscribe.
- Eligible visits are pending or retryable failures, have a review URL and email, and are 23 hours to seven days old.
- Failed sends persist an error, increment attempts, and use bounded backoff.
- Monthly allowances are derived from the active plan and enforced before sending.
- Review Booster settings are stored on `businesses`, including name, type, city, review URL, rebooking URL, tone, language, and sender name.

## Maintainer guidance

- Inspect `followup_visits` and `followup_messages` together when debugging delivery.
- Keep `neon/README.md` and this file aligned with every new migration.
- Do not create a second migration tree.
- Application code, not RLS, owns authorization and business scoping.

## Reviewed billing, team and Google contracts — 2026-10-03

Migrations 019/021/031/032 extend the canonical Neon schema. Billing keeps immutable provider requests and keys in `billing_checkout_intents`/`billing_customer_provisioning`, a canonical `billing_owner_customers` mapping, owner/event reconciliation fences, and atomic subscription/business-agent/profile snapshots. Business agent plan/period fields and period bounds are authoritative for A06; the owner profile is a compatibility mirror. Independent business/owner trial histories consume eligibility only on authoritative trial start. Unknown legacy history requires operator reconciliation.

`team_invitations.status` is pending/accepted/revoked, with expiry and revocation timestamps. Business-row locks serialize seat checks with billing snapshots; the persisted user mutex serializes acceptance across businesses and first-workspace creation via `ensure_workspace_for_user`. Complete reserves three seats including the owner and live pending invitations. Owner cleanup is permitted after lapse; new downgrade policy remains undecided.

`business_google_locations` records one explicit selected cached location per business. Connections rotate `connection_version` on OAuth replacement, while refresh preserves it; each discovered cache row records its validating generation. Stale/disconnected rows are unavailable. No initial selection or canonical-review backfill is inferred. Provider review/post requests pin the selected generation. A11 owns export/deletion/retention coverage for all new lifecycle tables and remote Google revocation; A13/A18 own approved location-switch recovery.

## Reviewed delivery, draft and privacy contracts — wave 3

Booster captures immutable provider payloads and stable idempotency keys in `booster_followup_deliveries`. Claims reserve quota under the business mutex; accepted and unresolved outcomes occupy their reserved UTC month. Frozen legacy usage is separate in `booster_quota_legacy_usage`. Unknown outcomes stop replay after the conservative 23-hour cutoff and require authoritative reconciliation; never release an unknown reservation or substitute a new key automatically. Routine visit/history deletion must preserve usage and suppression.

`review_reply_draft_state` selects the one current version; historical `review_replies` remain append-only. Generation leases and `review_reply_usage_reservations` protect owner-shared accounting. This preserves the existing Reply profile billing-period/2,000 safety ceiling; it does not approve or implement A18’s proposed UTC Reply ceiling. Post uncertainty keeps its fence until authoritative Google reconciliation; never clear the fence merely because its timestamp expired.

Privacy workspace exports include safe delivery/baseline/draft/reservation/booking-credential/post-outcome metadata, excluding provider payloads, keys, leases, errors and credential secrets. Wave 4 implements shared freezes/drains, restricted recovery, Stripe customer-erasure and Google-generation evidence; `PRIVACY_ACCOUNT_DELETION_ENABLED` remains unset/false pending approved identifier/evidence retention and controlled provider/operator acceptance. The route returns 503 before freezing users while gated. Generic expired leases become uncertain; a failed same-key operation stays failed and needs an explicit new attempt/key. See [wave 4 review](./tasks/A00_WAVE4_INTEGRATION_REVIEW.md) and the single [roadmap](./ROADMAP.md).

Cron state is persisted in `cron_job_state`/`cron_unit_state`, with per-run fences and bounded cooperative work. `cron_alert_state` deduplicates actionable failures and missed schedules; only fixed health codes/counts reach monitoring. SQL executes in a transaction with a local statement timeout and client request abort. Routine privacy cleanup rotates bounded table batches and preserves unresolved operation/billing/usage/suppression history. The daily Vercel privacy schedule and hourly independent health monitor are separate from account deletion.
