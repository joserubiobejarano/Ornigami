# A12 privacy retention cleanup handoff

The privacy cron route now uses the A12 fenced cron lease and health record. It processes a single table batch at a time, starts from a persisted rotating table cursor, checkpoints after each completed statement, and checks the acquired deadline and operation cap before starting another batch. A full batch conservatively signals possible backlog so the following scheduled invocation continues from the next table. Authorization runs before lease acquisition. A busy lease returns `409`; completed work returns `200`; a continuation returns `202`; table failures return `500`; health-store failures return `503`.

The cleanup helper reports attempted, deleted, and failed counts, per-table outcomes, continuation state, and a fixed status (`succeeded`, `partial`, `failed`, or `no_work`). Health outcomes contain only fixed table names and numeric/boolean fields. Operation errors are logged with a fixed code; row content, SQL errors, identifiers, and other exception text are not logged or returned. The review click retention predicate uses `clicked_at`. Cron-run cleanup only removes old terminal rows with `finished_at`, keeping active and unresolved run evidence.

The existing approved retention periods and the one-day demo challenge expiry grace remain unchanged. The helper's deletion set remains the existing approved 11 tables; it preserves delivery, quota/usage, review/reply, suppression, billing, invitation, privacy deletion-operation, and cron lease/cursor/alert histories. A full batch creates conservative continuation work without expanding the policy scope.

## Integration dependencies and decisions

- Requires A12 shared cron health changes: durable `cron_job_state` lease/cursor fields, fenced acquire/checkpoint/finish helpers, run outcome JSON, and alert evaluation. These are consumed by the route but owned by the shared A12 integration. `finishCronJobRun` needs sanitized per-table `outcomes` persistence for the privacy-health view.
- Requires the shared cron budget contract's acquired `deadlineAt` and `batchLimit`; no new privacy setting or dependency is introduced. Database statement execution itself must have an infrastructure/client timeout because the application deadline only prevents starting another table batch.
- Old rows whose `cron_runs.status` is still `running` remain available for diagnosis. Health integration should identify and terminalize truly abandoned runs after lease expiry before any later cleanup policy removes them; this change does not infer staleness or rewrite their status.
- No scheduler activation, deployment, shared configuration change, retention-period change, or deletion policy expansion is included.

## Validation

Behavioral unit coverage is in `tests/a12-privacy-cleanup.test.mts` for authorization, sequential bounded processing, cursor rotation, expired budget admission, partial table failure, sanitized health outcomes, correct click timestamp, active run preservation, and protected histories. Existing A11 PostgreSQL retention coverage now marks the expired fixture as terminal and asserts that a stale-looking active row remains. Run the A12 test directly with `node --experimental-strip-types --test tests/a12-privacy-cleanup.test.mts`; the isolated A11 PostgreSQL fixture test also needs the repository's local PostgreSQL test prerequisites. No external database or staging/production environment is used.

The route follows the Next 16.3.8 Route Handler guidance in the original checkout: it uses the Web `Request` API, returns `NextResponse`/Web `Response` JSON, and opts into the Node.js runtime and dynamic execution for database-backed work.
