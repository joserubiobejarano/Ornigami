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
