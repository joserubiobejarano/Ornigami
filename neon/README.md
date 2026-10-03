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
| `019_billing_lifecycle.sql` | Durable customer/checkout intents, reconciliation leases/events, independent trial histories and atomic billing snapshots |
| `020_account_recovery.sql` | Session revocation version, auth callback destinations, and expiring single-use password-reset tokens |
| `021_workspace_invitations.sql` | Invitation status/revocation, expiry/reinvite, serialized seat admission and member cleanup |
| `022_booster_delivery_quotas.sql` | Durable frozen email requests, fenced replay, atomic UTC monthly reservations and legacy usage baseline |
| `024_review_draft_policy.sql` | Current draft/version state, generation/post fences and owner-shared usage reservations |
| `026_privacy_account_lifecycle.sql` | Default-closed deletion foundation, provider leases, freeze marker and durable recovery operations |
| `031_google_location_selection.sql` | Per-business selected location and OAuth/cache generations; no automatic selection or legacy backfill |
| `032_workspace_bootstrap.sql` | Serialized first-workspace creation sharing the invitation user mutex |

Apply available migrations in numeric order; do not renumber applied files. 018 remains unused; 023/025/027–030 remain reserved for dependent packages. Wave 3 adds 022/024/026 after previously applied 031/032; do not renumber applied files. Fresh databases apply all available files in numeric order. Deletion stays disabled until shared freeze/drain/recovery/provider and retention gates are completed. Deploy each schema before its consumers. Wave 2 applies 019, 021, 031 and 032 in one bounded transaction on the verified production target, after isolated PostgreSQL and Linux CI validation. Preserve conservative legacy trial history and pending billing intents. Google selections are explicit; never infer a selection from cached discovery. See [database behavior](../docs/DATABASE.md) and [integration evidence](../docs/tasks/A00_WAVE2_INTEGRATION_REVIEW.md).
