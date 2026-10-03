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
| `023_booking_intake.sql` | Scoped encrypted booking credentials, atomic authenticated event/visit admission |
| `024_review_draft_policy.sql` | Current draft/version state, generation/post fences and owner-shared usage reservations |
| `026_privacy_account_lifecycle.sql` | Default-closed deletion foundation, provider leases, freeze marker and durable recovery operations |
| `027_cron_operations.sql` | Fenced job leases, job/unit cursors, sanitized outcomes and deduplicated schedule alerts |
| `031_google_location_selection.sql` | Per-business selected location and OAuth/cache generations; no automatic selection or legacy backfill |
| `032_workspace_bootstrap.sql` | Serialized first-workspace creation sharing the invitation user mutex |
| `033_account_lifecycle_auth_team.sql` | Atomic auth/token/team/workspace freeze guards |
| `034_account_lifecycle_billing.sql` | Billing admission/provider leases and frozen-owner webhook exclusion |
| `035_account_lifecycle_replies.sql` | Frozen generation/post guards and safe post-outcome evidence |
| `036_account_lifecycle_booster.sql` | Owner/actor-attributed delivery admission and drains |
| `037_account_lifecycle_finalization.sql` | Generic external-operation leases, provider evidence and guarded finalization |
| `038_booster_intake_lifecycle.sql` | Atomic frozen-owner/member manual and CSV admission |

Apply available migrations in numeric order; do not renumber applied files. 018 remains unused; 025/028–030 remain reserved. Wave 4 adds 023/027/033–038 to the existing production schema in one bounded transaction after isolated SQL and exact Linux CI validation. Fresh databases apply all available files in numeric order. Deletion stays disabled until retention/provider/operator activation gates are complete. Deploy schema before consumers and pause/drain review schedules during cutover. Preserve conservative legacy trial history, pending billing intents, unknown delivery/post fences and suppression. Google selections remain explicit. See [database behavior](../docs/DATABASE.md) and [wave 4 evidence](../docs/tasks/A00_WAVE4_INTEGRATION_REVIEW.md).
