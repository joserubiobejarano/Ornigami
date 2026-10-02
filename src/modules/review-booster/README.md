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

Settings are stored on `businesses`. Visits and messages are stored in `followup_visits` and `followup_messages`; unsubscribe and click attribution use their dedicated tables. Relevant migrations are `003` through `012`, plus business tenancy `013`, security/usage migrations `014`–`016`, team invitations `017`, and A06 delivery/quota migration `022`.

## Current behavior

- CSV files must be CSV, at most 1 MB and 500 rows, with `customer_name`, `customer_email`, `service_received` or `service_name`, and `visited_at`.
- Duplicate CSV rows are skipped.
- A Google review URL is derived from synced GBP locations when possible; a manual URL is the fallback.
- Eligible visits are 23 hours to seven days old, pending or retryable failures, unsent, subscribed, and within the active plan allowance.
- Failed sends persist reasons and use bounded retry backoff.
- The runner applies a bounded per-run batch limit.

## A06 atomic delivery and quota handoff

Migration `neon/migrations/022_booster_delivery_quotas.sql` adds durable per-visit delivery rows, fenced leases, frozen provider JSON, stable Resend idempotency keys, and UTC calendar-month quota reservations. Approved limits are 500 emails for Booster and 1,500 for Complete. Usage does not prorate or roll over and survives upgrades or trial conversion. Accepted sends count; unknown outcomes hold their reservation. Visits deferred by quota remain eligible for a later month only while within the existing seven-day visit window.

The runner prepares the complete Resend JSON and persists it before provider I/O. Recovery uses the same JSON and key, and retries must use the original Resend sending account. Payloads include the stable delivery ID as the `ornigami_delivery_id` Resend tag for future signed-webhook correlation. The API secret is transport-only; sender, recipient, reply-to, subject, text, HTML, headers, and tags are frozen before delivery. The provider accepts prepared payloads through `sendPreparedWithResend`; it returns only a confirmed message ID and classifies transport, timeout, 5xx, 409, and malformed success responses as unknown. The key window is 24 hours, so attempts older than 23 hours require reconciliation. Unknown outcomes retain quota and are never automatically re-keyed. An unsubscribe committed before the pre-send database boundary blocks the send; an email already in provider I/O cannot be recalled. No new runtime dependency or environment setting is required.

See [A06 delivery and quota handoff](../../../docs/tasks/A06_BOOSTER_DELIVERY_QUOTAS.md) for integration requirements, verification, and unresolved operator/UI decisions. This worktree does not update shared routes or domain models, deployment configuration, or the roadmap.
