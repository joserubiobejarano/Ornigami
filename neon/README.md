# Neon Migrations

This folder is the database source of truth. Apply every migration once, in numeric order, across local, staging, and production environments.

## Migration map

| File | Purpose |
|---|---|
| `001_initial.sql` | Core users, profiles, billing mirrors, reviews, projects, leads, feedback, and Google tables |
| `002_auto_reply_profiles.sql` | Reply-profile automation fields |
| `003_business_foundation.sql` | Businesses, members, and agent activation |
| `004_review_booster_tables.sql` | Visits, messages, and integration events |
| `005_business_agent_billing_fields.sql` | Stripe linkage and billing-period fields |
| `006_public_demo_events.sql` | Public demo rate-limit tracking |
| `007_review_booster_unsubscribes.sql` | Review Booster recipient suppression |
| `008_pricing_plans.sql` | Plan fields and Stripe webhook idempotency |
| `009_review_booster_error_reason.sql` | Persisted processing error reasons |
| `010_review_booster_retries.sql` | Bounded retry state |
| `011_review_link_clicks.sql` | Review-link click attribution |
| `012_cron_runs.sql` | Scheduled-job execution history |
| `013_review_business_tenancy.sql` | Canonical business ownership for reviews and reply drafts |
| `014_security_hardening.sql` | Email verification, login attempts, API/public-demo rate limits, and usage counter |
| `015_stripe_usage_periods.sql` | Current billing-period start fields |
| `016_remove_legacy_plan_taxonomy.sql` | Current plan constraints |
| `017_team_invitations.sql` | Expiring Complete-plan workspace invitations |

Do not maintain a parallel schema or skip a migration. See [docs/DATABASE.md](../docs/DATABASE.md) for the product-facing data model and behavior rules.
