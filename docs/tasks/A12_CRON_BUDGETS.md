# A12 cron budgets and resumable review jobs

Status: implementation handoff for isolated A12 review. This document is task-specific; the shared roadmap and deployment configuration are unchanged.

## Behavior

The Booster and Replies GET handlers authenticate before acquiring the durable per-job lease. Each job asks the health store for a 45-second execution budget and a keyset batch of at most 20 businesses or locations. The initial lease is 90 seconds; checkpoint renewals are capped at the job deadline plus a 15-second terminal-write margin. A concurrent invocation receives HTTP 409 with `Retry-After`; bad credentials receive 401.

Each route admits provider work only when enough budget remains for the provider timeout and checkpoint margin. Booster keeps the current business in its durable cursor only when it has not completed the candidate unit; its delivery ledger safely recovers claims whose frozen payload was persisted before send. Replies stores a global business/location keyset and a per-business stage cursor for the location, draft review ID, provider connection version, and sweep failure/success counters. The keyset advances past a partially processed unit so later tenants run; after the keyset reaches the end, the route resets it for another pass and resumes saved unit cursors. Replies checkpoints each settled draft before moving to the next review. Continuations are bounded per HTTP invocation: the scheduler should use its normal cadence and cap any follow-up invocations rather than looping until a 200 response.

Responses distinguish a clean sweep (200 `succeeded`), an empty sweep (200 `no_work`), and a resumable budget/batch continuation (202 `partial`, `ok:false`). Ordinary and ambiguous delivery failures return 500 and remain visible in the health summary, including across clean later batches. A final no-work tail cannot erase an earlier failure. Health-store acquisition/checkpoint/terminal-write failures fail closed with 503; checkpoint faults do not trigger a second terminal write. Quota deferrals remain separate from failures. Unknown Booster provider outcomes count as failures.

Both business scans exclude owners whose `privacy_deletion_requested_at` marker is set. The code consumes that marker during cron admission; it does not claim atomic deletion fencing for a provider operation already in progress or activate the disabled A11 deletion workflow.

## Budget and cancellation limits

Booster admits a candidate with 28 seconds remaining, limits scheduled OpenAI generation to at most 8 seconds with SDK retries disabled, and requires at least 15 seconds before its existing 10-second Resend boundary. The runner checks admission again before `begin-send`; a persisted pre-send claim remains recoverable if the window closes.

Replies uses up to 9 seconds for a Google sync request window, 8 seconds for review-alert email, and up to 8 seconds for scheduled OpenAI generation with retries disabled. Google fetches receive the abort signal, check it before token lookup and each retry, and use an abortable retry delay. Alert fetches await the actual fetch cancellation and never log response bodies or review text.

These are admission and provider bounds, not a hard end-to-end wall-clock guarantee. The health lease defaults to 90 seconds with a 45-second job budget; checkpoint renewals are capped at the job deadline plus a 15-second terminal-write margin. Neon statements in selection, profile, draft, checkpoint, and finalization calls still need a database-side statement timeout. Google token refresh has its own bounded request and cannot be cancelled after refresh starts; the route can stop before the subsequent Google API call. Those limits can make a handler finish beyond its nominal budget if a database or token-refresh call consumes its full timeout.

## Shared integration contracts

The routes consume the additive health contract in `src/lib/cron-health.ts`: `acquireCronJobRun`, fenced `checkpointCronJobRun`, and `finishCronJobRun`. The corresponding schema proposal is in [A12_CRON_SCHEMA.sql](./A12_CRON_SCHEMA.sql). Integration must apply that migration before deploying these route consumers. The handoff also adds a per-business `cron_unit_state` cursor so a large Replies location can rotate behind later businesses while keeping its inner review checkpoint.

Shared helper changes are additive: the Booster runner accepts optional scheduler callbacks and exposes local progress flags; manual callers retain the default behavior. Review draft and email generators accept an optional provider timeout; default interactive timeouts stay unchanged. Google review fetching accepts an optional signal, and the Google client checks that signal around retry boundaries. Review alerts accept an optional signal and required-delivery flag; existing manual sync callers retain the default configuration behavior.

## Remaining integration decisions

- Apply and review the new cron schema before using the durable route API. Do not ship these handlers against only the older `cron_runs` table.
- Neon statements need a server-side timeout contract. Until that is configured and verified, report the 45-second limit as cooperative admission budgeting rather than a hard maximum.
- Booster's per-business candidate query remains capped at the oldest 50 eligible candidates. Quota and busy deferrals are expected outcomes and do not count as failures; a persistently deferred oldest window still depends on the existing delivery selection policy and bounded scheduler follow-up cadence to revisit later work fairly.
- Replies customer alert email has no durable outbox/idempotency key. The cursor records an indeterminate alert stage; a later run records a failure and continues drafting without blind resend. A crash after review persistence but before that stage is saved can lose an alert; a crash after provider acceptance but before stage advancement can leave delivery indeterminate. Decide whether A10/A17 should add a durable notification outbox.
- The per-business unit cursor holds one selected location at a time. If product behavior permits multiple concurrently selected locations for one business, integration should verify rotation across all selected locations with the route's location keyset and unit cursor before enabling that configuration.
- Review Replies still requires Google API approval and controlled provider acceptance. These mocked tests do not establish real Google, Resend, OpenAI, or deployment behavior.

## Verification

The task branch includes isolated route tests for authorization, lease conflict, resume checkpoints, partial/failed responses, health-store failures, fair keyset progression, and no-work tails. Run with Node 22:

```powershell
npx tsc --noEmit
node --experimental-strip-types --test tests/a00-wave3-booster.test.mts tests/a08-google-reviews.test.mts tests/a12-cron-routes.test.mts tests/a12-provider-timeouts.test.mts
```

No live database, provider, staging, production, or deployment configuration is part of this verification.
