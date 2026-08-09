# Review Booster Module

This module contains the product and runtime logic for Review Booster.

Review Booster is the follow-up engine that helps a business ask for more Google reviews after completed customer visits.

## What the module currently does

- Stores and displays completed visits
- Accepts visits from manual entry and CSV upload
- Saves business-level Review Booster settings
- Generates follow-up email copy
- Sends follow-up emails through Resend
- Adds unsubscribe links to follow-up emails and suppresses future sends for opted-out recipients
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
- `status in ('active', 'trialing')` for the cron route's business scan

## Data dependencies

Review Booster depends on these migration steps:

- `003_business_foundation.sql`
- `004_review_booster_tables.sql`
- `005_business_agent_billing_fields.sql`
- `007_review_booster_unsubscribes.sql`
- `009_review_booster_error_reason.sql`
- `010_review_booster_retries.sql`
- `011_review_link_clicks.sql`
- `012_cron_runs.sql`

## Important implementation notes

### Settings are business-backed

Review Booster settings are currently stored on the `businesses` row, not in a dedicated settings table.

### Google review URL resolution

The module prefers a Google-derived review URL when synced locations are available. A manually entered URL is used as fallback.

For highest conversion, use the direct Google Maps "Write a review" link (popup review form) whenever possible.

### CSV rules

Current CSV expectations:

- file type must be CSV
- max size is 1 MB
- max row count is 500
- expected columns are `customer_name`, `customer_email`, `service_received` or `service_name`, and `visited_at`
- duplicate CSV rows are skipped

### Current send eligibility

The runner enforces the review-request timing and suppression rules. A visit is eligible when it has:

- `followup_status = 'pending'`, or a retryable failure with fewer than three attempts
- no previous sent message
- customer email present and not unsubscribed
- business review URL present
- `visited_at` between 23 hours and seven days ago
- retry backoff elapsed when retrying a failed send

## Why this module matters

Review Booster is already a real end-to-end workflow and is the strongest current candidate for focused product polish, onboarding, and sales enablement work.
