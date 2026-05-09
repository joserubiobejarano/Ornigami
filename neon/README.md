# Neon database migrations

Canonical schema for LocalLift lives only in `neon/migrations`.

Apply files in numeric order:

1. `001_initial.sql`
2. `002_auto_reply_profiles.sql`
3. `003_business_foundation.sql`
4. `004_review_booster_tables.sql`
5. `005_business_agent_billing_fields.sql`

## File purposes

| File | Purpose |
|------|---------|
| `001_initial.sql` | Core platform tables (`users`, `profiles`, billing, GBP, reviews, leads, feedback, projects). |
| `002_auto_reply_profiles.sql` | Ensures `profiles.auto_reply_all_reviews` is present (idempotent safeguard). |
| `003_business_foundation.sql` | Business ownership model: `businesses`, `business_members`, `business_agents`. |
| `004_review_booster_tables.sql` | Review Booster domain tables for visits, sent messages, and integration events. |
| `005_business_agent_billing_fields.sql` | Adds Stripe linkage fields to business/agent records. |

Do not maintain parallel migration trees. This folder is the only migration source of truth.
