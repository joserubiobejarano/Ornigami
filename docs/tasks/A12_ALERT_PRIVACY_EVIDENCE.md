# A12 Sentry alert and privacy run evidence

Status: isolated evidence and implementation handoff. No shared roadmap, workflow, deployment configuration, database schema, or deployed environment was changed. The next configured privacy cron opportunity is still pending.

## Sentry transport change

`src/lib/cron-alerts.ts` now clears recorded transport failures only when the SDK has a client, `captureMessage` returns an event ID, `flush(2_000)` completes, and the `afterSendEvent` hook reports a finite 2xx response for that same event ID. The event hook is removed in `finally`. An unrelated concurrent event, a missing response, a dropped/disabled event, a rejected HTTP response, or a flush timeout remains a transport failure. Detailed failure reasons go to the sanitized logger; the database retains the existing constrained `alert_transport_failed` value. This preserves the migration 027 `last_transport_error` constraint and adds no schema or dependency change.

`scripts/a12-sentry-delivery-probe.mjs` reads only `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` from the explicit env file argument; it ignores process env. Its default mode is a read-only project check. A live event requires the explicit `--send-probe` mode. The fixed event has no request, user, customer, exception, or breadcrumb data. `--readback <event-id>` checks an existing event without sending another; `--inspect-workflows` reads organization alert workflows filtered to the DSN project and reports counts/date/type/status fields without recipient identifiers.

## Controlled Sentry result

On 2026-10-03, the script read the allowlisted Sentry values from the main checkout's explicit `.env.local` file. It verified the project slug, organization slug, and numeric project ID against the DSN with HTTP 200. One fixed smoke event was submitted with a unique `probe_id`:

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Sentry envelope ingest | HTTP 200 | Sentry's ingest endpoint accepted the envelope. |
| Event readback | First GET returned 404; a later read-only GET returned HTTP 200 and matched event ID, fixed message, and all fixed tags. Sentry `dateReceived`: `2026-10-03T16:22:25.766Z`. Event ID: `f25543726e00e14e8907a99e6e0f426e`. | The event was persisted and readable in the matching project. |
| Legacy project issue-rule inspection | HTTP 404 from the older project `/rules/` endpoint. | This endpoint result is not evidence that the project has no workflows. |
| Current workflow inspection | HTTP 403 from `GET /api/0/organizations/{org}/workflows/?project={numeric-project-id}&per_page=100`, after a fresh project identity check. | Rule/action state is unreadable with the available token. This is consistent with insufficient scope or another access policy; the exact cause was not established. The official [Fetch Alerts API](https://docs.sentry.io/api/monitors/fetch-alerts/) lists `alerts:read`, `org:read`, `org:admin`, or `org:write`; no scope change was made. |
| Alert action / recipient delivery | Unverified | Ingest and event readback do not establish that an alert workflow matched, nor that email or another notification reached its configured recipient. No email or Slack message was sent by this probe. |

Sentry's [retrieve-event API](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/) documents the event-ID readback used here. The initial readback delay is why the harness supports a separate readback-only retry mode. The event's existence does not prove routing or notification delivery.

## Privacy schedule and observation

The isolated `vercel.json` still specifies `/api/cron/privacy` at `0 3 * * *` (03:00 UTC daily). At the 2026-10-03 16:38 UTC observation, the next scheduled opportunity was **2026-10-04 03:00 UTC**. That window is future relative to the captured evidence; the scheduled run has not yet been observed, and no manual cron request, health GET, evaluator, or cleanup operation was run.

The read-only observer `scripts/a12-privacy-run-observe.mjs` reads only `DATABASE_URL` from the explicit env file argument. It runs `SET TRANSACTION READ ONLY`, sets a 10-second transaction-local statement timeout, and performs only `SELECT` statements on `cron_job_state`, `cron_runs`, and active `cron_alert_state` rows for `privacy_retention`. It emits timestamps, fixed statuses/reasons, counts, checkpoint/cursor presence, and constrained transport codes; it drops run IDs, cursor contents, outcomes' row data, and exception text. Its target label intentionally says the main-checkout connection's deployed identity is unverified.

Latest snapshot at `2026-10-03T16:40:55.302Z` UTC (a second read-only snapshot confirmed the same state):

| Read-only field | Value |
| --- | --- |
| Configured target | Main checkout `DATABASE_URL`; deployed target identity unverified |
| Transaction mode | Read-only confirmed |
| Privacy state row / recent runs | No state row; zero recent privacy runs |
| Active privacy alert | One `never_run` alert |
| Alert transport state | `transport_failures=1`; `last_transport_error=alert_transport_failed`; last seen `2026-10-03T14:43:50.818Z` |

This snapshot is evidence for the configured checkout database only. It does not establish that this connection is the Vercel production database. No privacy run/checkpoint has been observed in the recorded snapshot.

To observe the next scheduled opportunity without invoking cron, run the observer against the approved, identity-verified Vercel receipt source before 03:00 UTC, then again after the scheduled window, for example at 03:05 UTC:

```powershell
node scripts/a12-privacy-run-observe.mjs 'C:\path\to\explicit\main\.env.local'
```

Compare `privacyState.lastStartedAt`, `lastFinishedAt`, `checkpointAt`, `lastStatus`, and `recentRuns`. A run is observed only if a new start/terminal record appears in the verified target after the window; a continuation can be `partial` with a checkpoint. Check `activePrivacyAlerts` for resolution and transport counters. If no new run appears, record a missed observation and investigate scheduler delivery through deployment logs; do not call the health route or cleanup endpoint to force evidence.

## Verification

### A00 identity-verified integration snapshot

At `2026-10-03T20:59:15.958Z`, A00 freshly pulled the linked Vercel production configuration privately and verified the expected database host/database fingerprint before using PostgreSQL CLI in a read-only transaction. The verified production target contains eight users and eight businesses, zero privacy runs, no privacy state row, and one active `never_run` alert with `transport_failures=1` / `last_transport_error=alert_transport_failed` (last seen `2026-10-03T19:14:59.198848Z`). This resolves the target-identity limitation of the author's earlier snapshot, not the future scheduled-run gate. Existing 025/028 schema and the 036 lifecycle wrapper are present; this wave requires no migration. Account deletion and manual delivery reconciliation remain disabled. No cleanup, health evaluation, Sentry send, or customer job was invoked by A00.

The combined Windows/Node 22 standard parallel suite passed 450/450 tests without skips. It additionally exercises the installed Sentry SDK with an injected in-memory transport, requiring a matching acknowledgement and stripping polluted inherited scope. This offline SDK test performs no HTTP delivery and does not establish browser capture or notification recipients. Exact Linux CI and deployment are checked by A00 before merge; see [wave 6 integration evidence](./A00_WAVE6_INTEGRATION_REVIEW.md).

Focused offline coverage passed 14 tests across `tests/a12-alerts.test.mts`, `tests/a12-sentry-delivery-probe.test.mts`, and `tests/a12-privacy-run-observe.test.mts`. The cron tests cover fixed payload sanitization, the matching event's 2xx requirement, HTTP 429, unrelated event IDs, missing SDK clients, flush success without acknowledgement, listener cleanup, and migration-compatible failure persistence. Probe tests mock HTTP and cover fixed event construction, readback retry without resend, project ID matching, workflow pagination and recipient-ID redaction, redirect refusal, bounded responses, and sanitized failures. Observer tests assert read-only SQL sequencing and sanitized checkpoint/outcome/alert output. These tests do not represent real alert-action or scheduled-run delivery.

No package or shared model change is needed. Integration retains the existing migration 027 enum/check contract. The original target-identity limitation is resolved by A00's snapshot above. The October 4 scheduled privacy run/checkpoint, workflow/action access (the author's read-only workflows request returned HTTP 403; the exact access cause is unestablished), and notification recipient delivery remain unverified. A00 reconciles the shared roadmap; the existing cron schedule is unchanged.
