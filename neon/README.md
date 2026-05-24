# Neon Migrations

This folder is the database source of truth for the application.

## Apply in order

1. `001_initial.sql`
2. `002_auto_reply_profiles.sql`
3. `003_business_foundation.sql`
4. `004_review_booster_tables.sql`
5. `005_business_agent_billing_fields.sql`

## What each migration adds

| File | Purpose |
|------|---------|
| `001_initial.sql` | Core app schema: users, profiles, billing mirrors, reviews, projects, leads, feedback, and Google Business Profile support tables. |
| `002_auto_reply_profiles.sql` | Adds or safeguards reply-profile automation fields. |
| `003_business_foundation.sql` | Adds the business ownership model: `businesses`, `business_members`, and `business_agents`. |
| `004_review_booster_tables.sql` | Adds Review Booster tables: visits, messages, and integration events. |
| `005_business_agent_billing_fields.sql` | Adds Stripe linkage and billing-period fields used for business-agent activation. |

## Current database strategy

- Use this folder only.
- Do not maintain a parallel schema elsewhere.
- Keep migration order stable across local, staging, and production environments.

## What matters most for the current product

The most important product-specific migration areas today are:

- Google review operations
- business-agent activation
- Review Booster domain tables
