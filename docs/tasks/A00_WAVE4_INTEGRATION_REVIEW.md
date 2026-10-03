# A07 / A12 / A11 integration review — 2026-10-03

Reviewed A07 `2d48d0d`, A12 `35abdaa` and A11 follow-up `5f259c0`, their handoffs and their combined behavior against main `fec3fc2`. Three Luna reviews were followed by A00 source review, fixes and independent verification. Original deliveries remain in merge ancestry. All five A11 manifest patches were hash-verified and applied to source/tests before A07/A12 integration; documentation-only patches do not count as activation.

## Integration corrections

- A07: preserve scoped encrypted booking credentials, raw-body HMAC/timestamp authentication, atomic event/visit dedupe, conflict-aware CSV outcomes, phone-only non-sendability and omission-preserving optional settings. Reserve the `csv` source for the importer, so authenticated booking events cannot collide with its expression index. Validate even previously signed tracked-link destinations before recording clicks or rendering links. Export safe credential metadata without encrypted secrets. Manual/CSV admission locks and rechecks owner/actor freeze atomically; business settings already receive the 033 trigger guard.
- A12: combine fair durable job/unit cursors and fenced leases with A11 frozen-owner exclusions and provider actor attribution. Propagate scheduler timeout overrides through the public draft service. Keep manual provider calls bounded for lifecycle draining. Preserve alert send failures as actionable health instead of false success; ambiguous sends cannot be blindly retried. Retry missing/failed Sentry transport after five minutes. Monitor the existing daily 03:00 UTC Vercel privacy job, rather than treating it as unscheduled. Add an independent hourly authenticated GitHub health monitor.
- Database requests now execute the statement and transaction-local server timeout together, with a bounded Neon request signal. Default statement/request limits are 10/11 seconds; cron requests inherit a 60-second database deadline, including acquisition and terminal writes. A12's 45-second work budget remains cooperative, with bounded provider admissions and terminal-write allowance. Expired query deadlines start no request. A timeout does not prove that an external provider canceled its work.
- A11: promote shared auth/team, billing, reply, Booster and finalization SQL into canonical numbered migrations. A same-key known failure returns explicit `failed`, never `done` or automatic replay. Unknown draft-provider outcomes retain an uncertain lifecycle operation. Safe workspace exports include reply-post outcome/business/review/time metadata, excluding claim tokens and actor IDs.

## Schema and rollout

New production schema is 023 booking credentials/intake, 027 cron operations, 033 auth/team freeze, 034 billing lifecycle, 035 reply lifecycle, 036 Booster lifecycle, 037 external-operation drains/finalization and 038 manual/CSV lifecycle admission. Existing 018 remains unused; 025/028–030 remain reserved. Do not renumber/rewrite previously applied migrations or deploy consumers before their schema.

Apply the reviewed files transactionally through PostgreSQL CLI on the freshly verified Vercel production database, with credentials passed only through environment, lock timeout five seconds and statement timeout thirty seconds. Pause/drain both GitHub review schedules around cutover; restore them after the exact deployment is Ready. The privacy scheduler performs already-approved routine retention only. It does not activate account deletion.

## Deletion activation remains blocked

`PRIVACY_ACCOUNT_DELETION_ENABLED` remains unset/false, returning 503 before auth/freeze/provider work. The integrated technical contracts do not authorize production destructive acceptance or remove these gates:

1. Approve purpose and purge periods for linkable trial-owner, deletion-operation and generic provider-operation identifiers, including Stripe customer-erasure evidence containing operation/customer IDs. Implement the agreed purge behavior.
2. Accurately disclose Stripe's retained financial history after customer deletion. Do not promise complete provider erasure based only on an API tombstone.
3. Perform controlled paid-owner/member, Stripe/Google revocation, pre-existing portal URL, concurrent OAuth/customer/session/reset/job and recovery acceptance with authorized isolated targets. Verify restricted recovery remains usable if activation is later closed while accounts are frozen.
4. Provide authorized operator reconciliation for unknown native/generic provider outcomes. Lease expiry never proves failure; do not clear post/send fences or reservations merely on TTL.

No new Reply UTC quota, scheduled automatic posting, downgrade policy or lead entitlement is approved. A07's retained optional rebooking/sender behavior was delegated in its own task and documented in its handoff: one secondary booking CTA in the same email; display name only, server-controlled sender address; no native booking-provider claim. Legacy runtime/callback cutover remains A15.

## Security advisory

The freshly reported [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces` through development ESLint pattern tooling and has no patched version at this review. Full audit has eleven high ancestry records; production audit has zero findings. The evaluated invocation uses repository-controlled lint patterns. A narrowly scoped exception accepts only that exact advisory URL throughout every dependency ancestry, with no mixed/unknown advisories and a clean production high/critical gate. It expires `2026-10-10T00:00:00Z`; malformed/network/error reports fail closed. A01 must resolve the dependency exposure or document a reviewed replacement before expiry. No dependency downgrade or blanket development waiver is applied.

## Validation and next owners

Required checks: clean Node 22 install; lint/typegen/TypeScript; full tests with real disposable PostgreSQL, fresh numeric migration application and lifecycle replay; security gate; fixture production build/CSP/auth smoke; exact candidate Linux quality/security CI. Production verification uses CLI and safe public requests only. Tests do not send customer emails, charge cards or post Google replies.

A00 local validation passed all 340 discovered tests, including actual PostgreSQL same-key failure, owner/member finalization, concurrent CSV/freeze and numeric schema/replay fixtures. Lint has zero errors and four navigation warnings; typegen/TypeScript, the scoped audit gate, fixture webpack build and production CSP/auth/Google/billing smoke pass. New lifecycle SQL fixtures honor CI's PostgreSQL binary path. Exact Linux CI and production receipts remain independent release gates.

Start **A10** delivery events/suppression and **A13** shared parent-layout/dashboard/performance/usability independently from this main. **A17** can start isolated cross-workflow acceptance now and finish target acceptance after those merges. **A12** still owns I07 global-error capture/support operator visibility; its cron deliverable does not complete that portion. **A01** owns the expiring advisory; **A11** owns the remaining activation gates. A16 Google approval, A15 external inventory and A19 CSP assessment remain independent.

The single roadmap records current completion and pending work. CLI receipts with counts, migration hashes and deployment IDs are kept privately outside Git; this document alone does not establish production completion.
