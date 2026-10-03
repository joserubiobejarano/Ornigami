# A06 Review Booster delivery and monthly quotas

This handoff is from isolated worktree `Ornigami-A06-booster-delivery-quotas`, branch `fix/booster-delivery-quotas`, based on `a513887`. The owner approved the policy below on 3 October 2026.

Owner-approved policy: count in UTC calendar months, independent of Stripe's monthly or annual billing period. Booster allows 500 emails and Complete allows 1,500. Do not prorate or roll over quota. Preserve current-month usage through trial conversion and plan upgrades. Reserve quota before provider I/O; accepted sends consume it, and unknown provider outcomes retain their reservation. When quota is exhausted, leave visits waiting only while they remain inside the existing seven-day visit eligibility window.

## Implementation in this worktree

- Migration `022_booster_delivery_quotas.sql` adds workspace scoped delivery records, durable provider payloads, idempotency keys, leases/fencing, UTC quota reservations, a legacy sent-count baseline, and SQL operations to claim, prepare, begin, finalize, release, and mark unknown sends.
- `atomic-followup-db.service.ts` exposes those operations to the runner. `followup-runner.service.ts` prepares and persists the provider JSON before sending, reuses the stored JSON and key on recovery, and treats acceptance followed by a database failure as unknown.
- The module-owned `FollowupRunResult` now reports `unknown` and `deferred`; run-now returns these additive fields. The shared cron aggregator still needs to preserve them for A12/A13 consumers.
- `resend.provider.ts` exports `prepareResendPayload` and `sendPreparedWithResend`, requires a provider message ID on success, sends an `Idempotency-Key`, bounds the full response read to ten seconds, and classifies conflicts, server errors, timeouts, transport failures, and malformed successes as ambiguous. Definite pre-send configuration errors and ordinary 4xx rejections are classified as definite; the runner must preserve an already-unknown delivery even if a later local configuration error prevents its replay.
- Prepared payloads include complete localized subject/body CTA/unsubscribe text and HTML for English, Spanish, French, German, Italian, and Portuguese. Unknown language values fall back to English; locale variants use their base language. URLs and body text are escaped for HTML. Missing or invalid visit timestamps do not claim the visit happened yesterday. OpenAI failure falls back to deterministic localized copy.
- Provider payload includes the durable delivery UUID in the `ornigami_delivery_id` tag; this is the correlation value reserved for A10's signed webhook reconciliation.
- Sender display, recipient, reply-to, subject, text, HTML, headers, and tags are persisted in the frozen payload. The Resend secret is read only by the transport and is never persisted. No new environment setting or runtime dependency is required.

Resend documents that idempotency keys are retained for 24 hours, repeated requests must use the same payload, and a reused key with a changed payload returns 409. A concurrent request with the same key also returns 409, so both cases remain ambiguous here. After 23 hours from the first provider attempt, the runner requires reconciliation and never automatically releases quota or creates a replacement key. This one-hour safety margin avoids retrying close to [Resend's key expiry](https://resend.com/changelog/idempotency-keys).

The frozen payload also carries an opaque `ornigami_delivery_id` provider tag. Resend includes tags in webhook events according to its [tag/webhook documentation](https://resend.com/changelog/tags-for-batch-and-scheduled-emails). A future A10 handler should verify the signed event, correlate `data.tags.ornigami_delivery_id`, then validate provider, business, and delivery state before applying it. This work does not add a webhook route.

The legacy usage baseline deduplicates historical sent messages per visit and books them into their UTC send month. The no-duplicate and atomic-quota guarantee begins at the coordinated A06 cutover. A pre-A06 email accepted by Resend and lost before the old application persisted it has no reliable correlation key and cannot be reconstructed from this migration.

## Integration handoff

Integrate migration 022 before enabling the runner. The worktree deliberately leaves shared routes, UI, shared domain models, dependency manifests, settings, deployment configuration, and `ROADMAP.md` untouched. The integration session should:

- The existing run-now route already returns additive runner result fields; cron aggregation currently drops them. Update the cron aggregator and downstream UI to surface `unknown` and `deferred` counts without changing the run-now transport contract. The module-owned `FollowupRunResult` already declares both fields; shared consumers should preserve them.
- In `src/app/(dashboard)/dashboard/agents/review-booster/page.tsx`, calculate the allowance display from `monthlyUsage.used`, not `monthlyUsage.sent`, and show the UTC reset boundary and the seven-day expiry for visits waiting on quota.
- In `src/app/api/cron/review-booster/route.ts`, aggregate `unknown`/`deferred` outcomes and gate work on monthly `used` (accepted sends plus active reservations), with A12 timeout/partial/no-work status semantics. Keep `sent` as accepted-send history.
- Update the A13 visit/status UI to distinguish `deferred_quota`, `unknown`, `reconciliation_required`, and ordinary rejected sends. Explain that an unknown reservation still occupies capacity.
- Confirm settings and business-agent entitlement fields continue to provide `plan_id` and active/trialing status; the quota SQL uses these existing fields and requires no new runtime package.
- Apply `neon/migrations/022_booster_delivery_quotas.sql` through the normal integration migration process. Do not run it against staging or production from this task worktree.
- A07 booking intake and CSV retries must create/claim visits through the same atomic delivery path; keep phone-only visits explicitly non-sendable until an email destination exists.
- Extend A11 privacy export/retention to include `booster_followup_deliveries`; it references visits with cascade deletion, so before deleting the ledger preserve accepted/current-month usage aggregates or deletion could free occupied quota.
- Stop legacy send schedulers during the migration/application switch. Earlier legacy sends that reached Resend but failed before any persistence cannot be inferred retroactively; coordinate one sender cutover and a controlled reconciliation window.
- Add an operator reconciliation path for unknown sends older than 23 hours. Use a signed A10 webhook tag when available and verify provider state before manual retry or quota release. Preserve the same Resend sending account for every unresolved replay; changing accounts may lose access to the original idempotency record.

These are the A07/A10/A11/A12/A13 handoffs: A07 booking events and CSV retries must enter the same durable delivery claim; A10 verifies signed Resend events and correlates them by the frozen delivery tag; A11 exports and retains the new delivery ledger and protects occupied month usage before any cascade deletion; A12 keeps cron timeout/partial/unknown semantics visible to operators; A13 changes dashboard and visit queries to show reservations, quota-deferred visits, and accurate month boundaries.

Suppression is linearized at `begin_booster_delivery_send`: an unsubscribe committed before that pre-send boundary blocks sending. Once the runner has crossed it and provider I/O is in flight, a later unsubscribe cannot recall that request.

No new dependency or environment setting is required. Migration 022 remains a proposal in this worktree and has not been applied outside its disposable integration database. These changes have not sent real email and have not been deployed. The remaining decision is the user-facing presentation and operator workflow for unknown/reconciliation-required deliveries; the delivery safety behavior remains fail-closed until that workflow is integrated.

## Verification

Validation on the final worktree passed:

- Clean `npm ci` under Node 22.23.3 installed 675 packages; no dependency manifest or lockfile changes were needed.
- `node scripts/test.mjs`: 197/197 passed, 0 failed, 0 skipped. This included the disposable PostgreSQL 17 integration coverage. An initial run hit a transient collision on A05's port 55405; the unchanged rerun passed cleanly.
- `npm run lint`: exit 0, with four existing navigation warnings.
- `npm run typegen` and `npx tsc --noEmit`: passed.
- `npm run build` (Next webpack build plus static CSP hash generation): passed.
- `node scripts/production-smoke.mjs`: passed local anonymous/authentication, Google, billing, and CSP boundary checks.

The focused A06 database cases are in `tests/a06-booster-postgres.test.mts`; they cover the 499-to-500 final-slot claim, usage independent of annual billing and across entitlement changes, UTC month reservation reassignment, retry/recovery keys, claim fences, suppression, actor authorization, and legacy sent baseline idempotence. `tests/a06-booster-delivery-integration.test.mts` runs the production runner adapter with real PostgreSQL: overlapping runs with usage at 499 allow one final send; an accepted provider response followed by failed DB finalization replays the exact frozen JSON and stable key, resulting in one simulated physical send, one sent message, and one quota unit; and a crash after claim but before payload preparation safely recovers. The provider in these tests is an in-process idempotency mock, so these tests do not establish live Resend acceptance or deliverability.

No real emails were sent and no staging or production migration or deployment was performed. Logs cited by the integration session: `a06-tests.log` and `a06-smoke.log`.

## A00 integration review — 2026-10-03

The prior explicit owner approval was verified from the A06 chat and reconciled into the shared product contract. The integration branch connects unknown/deferred results and reserved usage to cron/dashboard, shows UTC reset and seven-day expiry, labels durable delivery states, validates HTTPS production email links without altering frozen requests, and includes safe ledger/baseline projections in A11 exports. Expected quota deferrals remain distinct from delivery failures. A07/A10/A12/A13/A17 still own their remaining intake, reconciliation, operational and acceptance work as partitioned in the single roadmap.
