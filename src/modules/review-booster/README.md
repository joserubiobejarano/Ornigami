# Review Booster Module

This module contains the product and runtime logic for Review Booster.

Review Booster is the follow-up engine that helps a business ask for more Google reviews after completed customer visits.

## What the module currently does

- Stores and displays completed visits
- Accepts visits from manual entry and CSV upload
- Saves business-level Review Booster settings
- Generates follow-up email copy
- Sends follow-up emails through Resend
- Records sent and failed message attempts
- Supports both manual runs and cron runs

## Folder structure

### `components/`

Reusable UI pieces for the Review Booster dashboard, navigation, status display, and run actions.

### `pages/`

Feature-specific page implementations for:

- dashboard
- new visit
- upload
- settings

Note: one placeholder page from an earlier import still exists in this folder, but the main runtime route uses the live dashboard page under `src/app`.

### `services/`

Main services include:

- `csv-parsing.service.ts`
- `followup-email-generator.service.ts`
- `followup-runner.service.ts`
- `resend.provider.ts`
- `review-booster-db.service.ts`

### `types/`

Shared Review Booster types.

## Runtime entry points

### Dashboard routes

- `/dashboard/agents/review-booster`
- `/dashboard/agents/review-booster/new`
- `/dashboard/agents/review-booster/upload`
- `/dashboard/agents/review-booster/settings`

### API routes

- `/api/review-booster/settings`
- `/api/review-booster/visits`
- `/api/review-booster/upload`
- `/api/review-booster/run-now`
- `/api/cron/review-booster`

## Activation model

Access depends on `public.business_agents`.

Required values:

- `agent_id = review_booster`
- `status in ('active', 'trialing')` for user-facing access
- `status = 'active'` for the cron route's business scan

## Data dependencies

Review Booster depends on these migration steps:

- `003_business_foundation.sql`
- `004_review_booster_tables.sql`
- `005_business_agent_billing_fields.sql`

## Important implementation notes

### Settings are business-backed

Review Booster settings are currently stored on the `businesses` row, not in a dedicated settings table.

### Google review URL resolution

The module prefers a Google-derived review URL when synced locations are available. A manually entered URL is used as fallback.

### CSV rules

Current CSV expectations:

- file type must be CSV
- max size is 1 MB
- max row count is 500
- expected columns are `customer_name`, `customer_email`, `service_received` or `service_name`, and `visited_at`
- duplicate CSV rows are skipped

### Current gap: timing rule mismatch

The upload page explains a review-request timing window, but the current send query does not enforce that window. The actual runner currently processes pending visits that have:

- `followup_status = 'pending'`
- no previous sent message
- customer email present
- business review URL present

## Why this module matters

Review Booster is already a real end-to-end workflow and is the strongest current candidate for focused product polish, onboarding, and sales enablement work.
