# Neon Migrations

This folder is the database source of truth for the application.

## Apply in order

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
14. `014_security_hardening.sql`
15. `015_stripe_usage_periods.sql`
16. `016_remove_legacy_plan_taxonomy.sql`
17. `017_team_invitations.sql`

## What each migration adds

| File | Purpose |
|------|---------|
| `001_initial.sql` | Core app schema: users, profiles, billing mirrors, reviews, projects, leads, feedback, and Google Business Profile support tables. |
| `002_auto_reply_profiles.sql` | Adds or safeguards reply-profile automation fields. |
| `003_business_foundation.sql` | Adds the business ownership model: `businesses`, `business_members`, and `business_agents`. |
| `004_review_booster_tables.sql` | Adds Review Booster tables: visits, messages, and integration events. |
| `005_business_agent_billing_fields.sql` | Adds Stripe linkage and billing-period fields used for business-agent activation. |
| `006_public_demo_events.sql` | Adds durable rate-limit tracking for public demo actions. |
| `007_review_booster_unsubscribes.sql` | Adds unsubscribe tokens and suppression records for Review Booster recipients. |
| `008_pricing_plans.sql` | Adds pricing-plan fields and Stripe webhook idempotency events. |
| `009_review_booster_error_reason.sql` | Adds persisted Review Booster processing error reasons. |
| `010_review_booster_retries.sql` | Adds bounded retry state for failed Review Booster messages. |
| `011_review_link_clicks.sql` | Adds review-link click attribution tracking. |
| `012_cron_runs.sql` | Adds durable execution history for scheduled jobs. |
| `013_review_business_tenancy.sql` | Reconciles Review Replies with business-scoped tenancy and adds canonical `business_id` ownership to reviews and reply drafts. |
| `017_team_invitations.sql` | Adds expiring Complete-plan team invitations. |

## Current database strategy

- Use this folder only.
- Do not maintain a parallel schema elsewhere.
- Keep migration order stable across local, staging, and production environments.

## What matters most for the current product

The most important product-specific migration areas today are:

- Google review operations
- business-agent activation
- Review Booster domain tables
