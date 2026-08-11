# Database

This repository uses Neon Postgres. The canonical schema source of truth is `neon/migrations`.

## Migration order

Apply migrations in this exact order:

1. `001_initial.sql`
2. `002_auto_reply_profiles.sql`
3. `003_business_foundation.sql`
4. `004_review_booster_tables.sql`
5. `005_business_agent_billing_fields.sql`
6. `006_public_demo_events.sql`
7. `007_review_booster_unsubscribes.sql`
8. `008_pricing_plans.sql`
9. `009_review_booster_error_reason.sql`
10. `010_review_booster_retries.sql`
11. `011_review_link_clicks.sql`
12. `012_cron_runs.sql`
13. `013_review_business_tenancy.sql`

## Main schema areas

### Identity and profile

- `users`
- `profiles`

Purpose:

- account identity
- business/profile defaults
- plan metadata used in UI gating

### Billing

- `subscriptions`
- `user_billing`
- `v_user_plan`

Purpose:

- Stripe customer and subscription mirrors
- effective plan and usage lookup

### Google review operations

- `gbp_connections`
- `gbp_locations`
- `reviews`
- `review_replies`
- `automation_prefs`

Purpose:

- Google OAuth state and tokens
- synced locations
- synced reviews
- draft or posted reply records
- review-automation preferences

### Business and agent activation

- `businesses`
- `business_members`
- `business_agents`

Purpose:

- business ownership container
- membership mapping
- per-agent activation state and Stripe linkage

### Review Booster domain

- `followup_visits`
- `followup_messages`
- `followup_integration_events`

Purpose:

- completed customer visit records
- sent and failed email records
- external event dedupe/logging support

### Review tenancy

- `reviews.business_id` is the canonical ownership key shared with Review Booster.
- `review_replies.business_id` follows the owning review's business.
- The legacy `user_id` columns remain temporarily for compatibility, but application reads and writes use `business_id`.
- Migration `013_review_business_tenancy.sql` backfills existing rows from the owner's earliest business and enforces non-null business ownership.

### Legacy or supporting domain tables

- `projects`
- `leads`
- `feedback`

Purpose:

- older content-generation history
- inbound lead capture
- feedback collection

## Tables that matter most for the current product

If you only need to understand the current live product, start with:

- `users`
- `profiles`
- `businesses`
- `business_members`
- `business_agents`
- `gbp_connections`
- `gbp_locations`
- `reviews`
- `review_replies`
- `followup_visits`
- `followup_messages`

## Important behavioral rules

### Agent access

`business_agents` is the main access-control record for product features.

Current agent ids used in code:

- `review_replies`
- `review_booster`
- `speed_to_lead`

Current access statuses treated as usable:

- `active`
- `trialing`

### Review Booster cron selection

The cron route selects businesses where:

- `agent_id = 'review_booster'`
- `status = 'active'`

### CSV dedupe

Review Booster CSV imports are deduped by business, customer email, service, visit date, and `source = 'csv'`.

### Review Booster send history

A visit is skipped from re-send if a previously sent message already exists for that visit.

## Database caveats a new maintainer should know

### No RLS security boundary

Authorization is handled in route and service code, not through Postgres row-level security.

### Mixed user-resolution history

Some app flows still include compatibility logic for sessions that resolve more reliably by email than by UUID.

### Business settings double as Review Booster settings

Review Booster settings are currently stored on the `businesses` row itself, including:

- business name
- business type
- review URL
- tone
- language

## Practical guidance

- Treat `neon/migrations` as the only schema truth.
- Do not create a second migration tree.
- Keep business-agent records aligned with Stripe webhook behavior.
- When investigating Review Booster bugs, inspect both `followup_visits` and `followup_messages` together.
