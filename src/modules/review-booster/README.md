# Review Booster Module

This module owns the Review Booster feature logic: completed visits, CSV import, business settings, follow-up email generation, Resend delivery, retries, unsubscribe suppression, tracked review links, and manual/cron execution.

## Runtime routes

- `/dashboard/agents/review-booster`
- `/dashboard/agents/review-booster/new`
- `/dashboard/agents/review-booster/upload`
- `/dashboard/agents/review-booster/settings`
- `/api/review-booster/settings`
- `/api/review-booster/visits`
- `/api/review-booster/upload`
- `/api/review-booster/run-now`
- `/api/review-booster/unsubscribe`
- `/api/cron/review-booster`

## Activation and data

Access requires `business_agents.agent_id = 'review_booster'` with status `active` or `trialing`. The Complete plan also includes this agent and up to three workspace users.

Settings are stored on `businesses`. Visits and messages are stored in `followup_visits` and `followup_messages`; unsubscribe and click attribution use their dedicated tables. Relevant migrations are `003` through `012`, plus business tenancy `013`, security/usage migrations `014`–`016`, and team invitations `017`.

## Current behavior

- CSV files must be CSV, at most 1 MB and 500 rows, with `customer_name`, `customer_email`, `service_received` or `service_name`, and `visited_at`.
- Duplicate CSV rows are skipped.
- A Google review URL is derived from synced GBP locations when possible; a manual URL is the fallback.
- Eligible visits are 23 hours to seven days old, pending or retryable failures, unsent, subscribed, and within the active plan allowance.
- Failed sends persist reasons and use bounded retry backoff.
- The runner applies a bounded per-run batch limit.
