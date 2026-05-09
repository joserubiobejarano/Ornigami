# Review Booster module

This module powers post-visit follow-up workflows that help businesses request reviews from customers after service visits.

## What it includes

- `pages/`
  - UI surfaces used by dashboard routes (`dashboard`, `new visit`, `upload`, `settings`).
- `services/`
  - CSV parsing/import logic
  - Follow-up candidate selection and execution runner
  - Email content generation
  - Email provider integration (Resend)
  - DB access helpers for metrics/visits/settings
- `components/`
  - Reusable UI blocks for Review Booster pages
- `types/`
  - Shared module type definitions

## Runtime wiring

- Dashboard route entry:
  - `/dashboard/agents/review-booster`
- API routes:
  - `/api/review-booster/visits`
  - `/api/review-booster/upload`
  - `/api/review-booster/settings`
  - `/api/review-booster/run-now`
  - `/api/cron/review-booster`

## Activation model

Feature access is controlled by `public.business_agents`:

- `agent_id = review_booster`
- `status` must be `active` or `trialing` for access

Inactive businesses see activation placeholders in dashboard UI.

## Data dependencies

Review Booster depends on migration tables introduced in:

- `neon/migrations/003_business_foundation.sql`
- `neon/migrations/004_review_booster_tables.sql`
- `neon/migrations/005_business_agent_billing_fields.sql`
