# A17 October 4 privacy checkpoint observation

Observation time: 2026-10-04 11:26 UTC (13:26 Europe/Madrid). This read-only follow-up inspected the scheduled daily privacy checkpoint after the 2026-10-04 03:00 UTC / 05:00 Europe/Madrid opportunity. It did not call the cron route, health endpoint, alert evaluator, cleanup helper, or any provider mutation. Work is on isolated branch `task/a17-oct04-privacy-checkpoint`, based on `0cad6cdb9c59751d7b8dda47fb1a5fdd0a126e92`; no roadmap, shared deployment setting, merge, or deployment was changed.

## Verified observation

The prior identity-verified Wave 7 snapshot at 2026-10-04 00:05 Europe/Madrid had zero privacy runs, no state row, and one active `never_run` alert with one transport failure; see [A12 alert/privacy evidence](./A12_ALERT_PRIVACY_EVIDENCE.md) and [Wave 7 integration review](./A00_WAVE7_INTEGRATION_REVIEW.md). Its saved environment pull and database receipt were checked at 2026-10-03 22:05 UTC and report production fingerprint `2f2b3d476ccfbc62744b7891beaa6934e7eb964224ed2682c20abc5d7574259f`. The associated deployment receipt, checked at 22:20 UTC, reports commit `a98878ef2611322c54f67de61a018b7ecf8e3298` READY with the production alias matching. Before PostgreSQL was invoked, the explicit saved environment source was checked against that pinned fingerprint; the fresh query returned the same fingerprint and `transactionReadOnly: true`. This confirms the saved source still points to the previously verified production database identity; it is not a fresh pull of current Vercel environment configuration. The prior receipt recorded deletion and reconciliation gates false; those gates were not re-read in this snapshot.

The database contains a privacy run recorded at 03:00:46Z–03:00:49Z. It finished `succeeded`, processed/deleted 10 rows, failed 0, and recorded all 11 configured outcome tables complete. The durable state has a checkpoint at 03:00:49Z, no cursor, and no active lease. The `never_run` alert is inactive and has `resolvedAt` 03:00:49.335Z.

The resolved alert still retains `transportFailures: 1` and `lastTransportError: alert_transport_failed`. Its database condition is resolved; the prior notification transport failure has not been cleared in this row. This snapshot does not establish downstream notification delivery.

The stored run time aligns with the scheduled window, but cron run rows have no invocation-source field. The Wave 9 production receipt reports commit `0cad6cdb9c59751d7b8dda47fb1a5fdd0a126e92` READY with the production alias matched at 01:52 UTC. A read-only request-log query for that deployment and 02:59–03:03Z returned one log row and no privacy-route request. Because the receipt does not prove that deployment still owned the alias at 03:00 UTC, this log result does not identify the actual scheduled target or caller. The evidence records a post-window database run, not proof of which caller started it.

The fresh PostgreSQL observation was at 2026-10-04T11:26:12.865902Z. The complete sanitized snapshot and the bounded log-query limits are in [A17_OCT04_PRIVACY_CHECKPOINT_EVIDENCE.json](./A17_OCT04_PRIVACY_CHECKPOINT_EVIDENCE.json).

## Reproduction and safeguards

Run `node scripts/a17-privacy-checkpoint-read.mjs <explicit-production-env> [psql-executable]` with the previously verified production source. The observer accepts only the pinned identity fingerprint, clears inherited `PG*` connection overrides, uses PostgreSQL CLI with a 15-second statement timeout and 30-second process timeout, begins `READ ONLY`, selects only cron state/run/alert metadata, checks the read-only setting, and rolls back. It emits fixed fields and omits run IDs, cursor values, raw outcomes, alert keys, SQL errors, and credentials. Its default PostgreSQL 17 executable is Windows-specific; other platforms use `psql` from PATH.

The original main-checkout Neon HTTP observer was not used because it labels target identity unverified and has an incomplete active-alert projection. No new package or database dependency was added. Shared models, routes, settings, migrations, and deployment configuration need no integration change. Task-owned files are the observer, its focused `.test.mts` suite, this note, and the sanitized JSON receipt.

Focused validation on Node v24.11.1: `node --experimental-strip-types --test tests/a17-privacy-checkpoint-read.test.mts` passed 6/6; `node --check scripts/a17-privacy-checkpoint-read.mjs`, isolated strict TypeScript checking of the task test, and scoped ESLint passed. Node 22 was unavailable, and no broad build or full suite was run for this task slice. ESLint emitted only its configuration warning that React could not be auto-detected in the external tooling checkout. The tests cover read-only SQL scope, resolved alert inclusion, safe projections, wrong-fingerprint refusal before connection, inherited `PG*` override clearing, bounded execution, read-only confirmation, and sanitized failures.

All task files are under `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A17-oct04-privacy-checkpoint`. To roll back this isolated handoff, remove or revert its four task-owned files; there is no database, provider, scheduler, or deployment rollback because none was changed.

## Remaining operational decision

Decide whether the residual `alert_transport_failed` marker warrants a separate Sentry transport/notification follow-up. Do not re-run the privacy route to recover or manufacture evidence. The scheduled invocation itself remains unattributed from the available run record and bounded deployment log results.
