# Review Booster Module

This module owns the Review Booster feature logic: completed visits, CSV import, business settings, follow-up email generation, Resend delivery, retries, unsubscribe suppression, tracked review links, and manual/cron execution.

## Runtime routes

- `/dashboard/agents/review-booster`
- `/dashboard/agents/review-booster/new`
- `/dashboard/agents/review-booster/upload`
- `/dashboard/agents/review-booster/settings`
- `/api/review-booster/settings`
- `/api/review-booster/booking-credentials` (owner credential management)
- `/api/webhooks/booking` (scoped, signed generic completed-event intake)
- `/api/review-booster/visits`
- `/api/review-booster/upload`
- `/api/review-booster/run-now`
- `/api/review-booster/unsubscribe`
- `/api/cron/review-booster`

## Activation and data

Access requires `business_agents.agent_id = 'review_booster'` with status `active` or `trialing`. The Complete plan also includes this agent and up to three workspace users.

Settings are stored on `businesses`. Visits and messages are stored in `followup_visits` and `followup_messages`; unsubscribe and click attribution use their dedicated tables. Relevant migrations are `003` through `012`, plus business tenancy `013`, security/usage migrations `014`–`016`, team invitations `017`, and A06 delivery/quota migration `022`.

## Current behavior

- CSV files must be CSV, at most 1 MB and 500 data rows, with `customer_email` and `visited_at`. Customer name and `service_received`/`service_name` are optional.
- CSV insertion is conflict-aware: overlapping imports return inserted/duplicate/row-error counts, using the existing business/email/service/timestamp unique index. Equivalent timestamp offsets normalize to UTC; date-only input means midnight UTC. Offset-free datetimes and malformed files are rejected.
- Importing/recording a visit sends no email itself, but eligible visits enter the existing manual/scheduled queue. Phone-only manual/booking visits are explicitly non-sendable; there is no SMS workflow.
- The canonical selected Google location provides the automatic review URL; a valid manually configured direct Google review URL takes precedence. The Booster settings page links to the shared Google location-selection control.
- Eligible visits are 23 hours to seven days old, pending or retryable failures, unsent, subscribed, and within the active plan allowance.
- Failed sends persist reasons and use bounded retry backoff.
- The runner applies a bounded per-run batch limit.

## A06 atomic delivery and quota handoff

Migration `neon/migrations/022_booster_delivery_quotas.sql` adds durable per-visit delivery rows, fenced leases, frozen provider JSON, stable Resend idempotency keys, and UTC calendar-month quota reservations. Approved limits are 500 emails for Booster and 1,500 for Complete. Usage does not prorate or roll over and survives upgrades or trial conversion. Accepted sends count; unknown outcomes hold their reservation. Visits deferred by quota remain eligible for a later month only while within the existing seven-day visit window.

The runner prepares the complete Resend JSON and persists it before provider I/O. Recovery uses the same JSON and key, and retries must use the original Resend sending account. Payloads include the stable delivery ID as the `ornigami_delivery_id` Resend tag for future signed-webhook correlation. The API secret is transport-only; sender, recipient, reply-to, subject, text, HTML, headers, and tags are frozen before delivery. The provider accepts prepared payloads through `sendPreparedWithResend`; it returns only a confirmed message ID and classifies transport, timeout, 5xx, 409, and malformed success responses as unknown. The key window is 24 hours, so attempts older than 23 hours require reconciliation. Unknown outcomes retain quota and are never automatically re-keyed. An unsubscribe committed before the pre-send database boundary blocks the send; an email already in provider I/O cannot be recalled. No new runtime dependency or environment setting is required.

See [delivery and quota contracts](../../../docs/TECHNICAL_REFERENCE.md) and [release evidence](../../../docs/RELEASE_EVIDENCE.md) for integration requirements, verification, and unresolved operator/UI decisions. The module is integrated into the canonical app; current pending/provider boundaries are recorded in the shared roadmap.

## A07 intake and settings handoff

Migration `023_booking_intake.sql` adds scoped encrypted/revocable booking credentials and atomic completed-event/visit admission. Booking clients sign the exact raw JSON body with their business credential and a bounded timestamp; caller-selected business IDs and legacy global Basic Auth are rejected. Generic source labels do not establish native provider connectors. The intake creates visits for the existing A06 sender, with no new scheduler.

Business members read shared settings through the canonical owner and selected Google location. The Booster owner can select an unselected Google location from Booster settings through A08's existing owner-only selection route, including for Booster-only businesses. Once selected, the location is pinned and shown read-only; changing it is not offered. A Booster settings save never includes a location selection. Omitted sender/rebooking values survive saves, and explicit empty/null values clear them. Sender names affect display only, with the address controlled by `EMAIL_FROM`.

Google review URLs use exact HTTPS destination rules: `search.google.com/local/writereview?placeid=…`, `g.page/{slug}/review`, and `g.page/r/{id}/review`. General Maps/profile/share URLs are not accepted as review destinations. Optional booking links use distinct public HTTPS rules, with no URL fetching. Invalid legacy values remain available for correction while blocked from new link rendering/preparation. A valid booking URL adds a localized "Book again" link in the same email. A06 freezes that link and sender together with the full payload; subsequent retries reuse the original JSON/key.

Current intake/CSV/settings contracts are in [the technical reference](../../../docs/TECHNICAL_REFERENCE.md). Scoped shared integration acceptance is recorded in [release evidence](../../../docs/RELEASE_EVIDENCE.md); coordinate new shared changes through the current roadmap.
