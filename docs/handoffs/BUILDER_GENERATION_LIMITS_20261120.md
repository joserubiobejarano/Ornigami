# Builder generation limits and usage accounting handoff

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication.

## Exact source

- Branch: `codex/ornigami-builder-generation-limits-20261120`
- Base: `ec801ba10af66942b0d1c3b65fd77f468ec759dc`
- Implementation commit: `fdd8eb6b084161dbefd58eac2b2d4fa14ba8febc`
- Worktree: `C:/Users/joser/.local/ornigami-builder-generation-limits-20261120`

The implementation reuses the reviewed invite/recovery subject, session and
store contract. It is confined to `builder-runtime/`, the builder operator and
qualification scripts, narrow shared generation/UI seams, and tests. The
development Campaign Lab and the legacy application remain development-only and
otherwise unchanged.

The decision, accounting table, configuration contract, privacy signals,
rollback procedure and separate canary plan are in
[`docs/BUILDER_GENERATION_LIMITS_20261120.md`](../BUILDER_GENERATION_LIMITS_20261120.md).

## What changed

- `builder-runtime/lib/usage-ledger.ts` — atomic reservation, rolling request
  window, active concurrency, lifetime spend, idempotent settlement, stale-lease
  conversion and operator reconciliation.
- `builder-runtime/lib/generation-limits.ts` — pre-dispatch reservation,
  provider-dispatch tracking, outcome classification, customer denials and
  privacy-safe signals.
- `builder-runtime/lib/test-provider.ts` — injected `test-stub` provider
  (`success`, `invalid`, `timeout`, `unknown`); only reachable with
  `BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1`.
- `builder-runtime/lib/runtime-config.ts` — limit, timeout and test-provider
  configuration with startup validation. Defaults remain closed.
- `builder-runtime/lib/identity-store.ts` — optional ledger fields and the
  serialized `withBuilderIdentityStore` transaction helper. Store version stays
  `1`.
- `builder-runtime/app/api/builder/generate/route.ts` — returns `409` for a
  replayed request id, `429` (with `Retry-After` where meaningful) for limits,
  `503` for unavailable accounting and `408` for pre-dispatch cancellation.
  It re-checks the server session after generation, as before.
- `src/lib/campaign-lab/generation/service.ts` and `types.ts` — caller
  `AbortSignal` is linked to the provider timeout controller and removed after
  the call.
- `src/components/campaign-lab/campaign-lab.tsx` — limit/accounting denials
  keep the last accepted preview visible and show the server message. No
  approval is created or reused.
- `scripts/builder-invite-operator.mjs` — new `reconcile-usage` command.
- `scripts/builder-generation-limits-check.mjs` — actual authenticated route
  and restart evidence.
- `scripts/builder-runtime-qualify.mjs` — passes the new builder-only limit and
  test-provider variables.
- `tests/builder-usage-ledger.test.mts`,
  `tests/builder-generation-limits.test.mts`,
  `tests/builder-identity-store.test.mts`,
  `tests/builder-runtime-isolation.test.mts` — focused coverage.

## Accounting contract in one paragraph

One accepted, authenticated, same-origin, validated request creates one
reserved record before dispatch. The client `requestId`, scoped by subject and
session, is the idempotency key. Success settles the actual cost; a known
non-dispatch settles zero; timeout, invalid output, provider error, transport
throw, post-dispatch cancellation and unverifiable settlement remain `unknown`
at the reserved cost. Stale leases become `unknown`, freeing concurrency while
preserving spend exposure. Request limits use a rolling window, spend caps are
lifetime, and concurrency counts only active `reserved` leases. Denials and
invalid requests create no usage record. If the ledger cannot be read or
written, the route denies dispatch.

## Local verification evidence

All commands ran from the worktree with no dotenv files, the offline guard
enabled, the live provider disabled and no paid calls.

- **Focused builder suites: 39/39 pass**, covering:
  - 20 concurrent reservations stopping at the concurrency cap;
  - 10 concurrent reservations stopping below the spend cap;
  - atomic subject/global rolling request limits;
  - replayed request ids producing no second record or provider call;
  - idempotent settlement and over-reservation handling;
  - unknown outcomes staying reserved and operator reconciliation;
  - stale leases freeing concurrency without hiding spend;
  - corrupt/unavailable ledgers failing closed;
  - accounting surviving a fresh store read (restart);
  - cancellation before dispatch, post-dispatch throw, timeout and invalid
    output classification;
  - closed defaults and rejection of test hooks without explicit enablement.
- **Actual authenticated route matrix: 11/11 checks pass**
  (`node scripts/builder-runtime-qualify.mjs node
  scripts/builder-generation-limits-check.mjs`):
  - authenticated generation returned `200` with synthetic revision
    `145187e87341182e`;
  - replaying the same request id returned `409 request_already_submitted`;
  - two concurrent subject requests produced one `200` and one
    `429 subject_concurrency`;
  - ledger held exactly two records and `80000` micros after those attempts;
  - the next request was denied `429 subject_spend` before dispatch;
  - the denied request created no usage record;
  - after a server restart against the same store, a third request hit
    `429 subject_requests` with `Retry-After: 3600`, and subject A's two
    records were still present;
  - timeout, invalid output and an injected ambiguous provider outcome each
    settled `unknown` at `50000` micros;
  - operator reconciliation changed one unknown to `succeeded` at `25000`
    micros and one to `failed` at `0`, leaving the third unknown intact.
  - Evidence: `.local/builder-generation-limits/results.json` and its
    isolated store.
- **Builder build/smoke:** `node scripts/builder-runtime-qualify.mjs build`
  passed with **0 denied egress attempts**;
  `node scripts/builder-runtime-qualify.mjs smoke` passed with **0 denied
  egress attempts**. The smoke keeps the default-closed page/API, route
  inventory, nonce/SRI and fail-closed startup checks.
- **Legacy build/smoke:** `node scripts/offline-qualify.mjs build` passed and
  `node scripts/offline-qualify.mjs node scripts/production-smoke.mjs` passed.
- **Whole-project TypeScript:** pass.
- **ESLint:** 0 errors, 27 pre-existing warnings outside this slice.
- **Full test suite:** 1354/1360 pass. The six failures reproduce unchanged at
  base `ec801ba` and are unrelated to this slice: three
  `staging-synthetic-fixture` SQL parser checks and three instrumentation mocks
  that cannot resolve `./lib/builder/startup`. No builder, ledger, Campaign Lab
  or production-smoke test failed.

## Operational behavior

- Access still defaults to closed. Invite mode and a writable store are
  required before generation is reachable.
- The live provider is still disabled. The builder wrapper passes
  `providerResolution: null`; only the explicitly gated injected test provider
  can dispatch.
- A store failure returns `503` and makes no provider request.
- Repeating a request id returns `409` and never dispatches twice.
- The workspace preserves the last accepted preview on limit/accounting denial.
  It does not approve the current revision; fresh generation still needs a fresh
  exact-revision approval.
- Signals contain only the truncated hashed subject reference, usage id, codes,
  outcome, dispatch flag, cost micros and retry seconds. They contain no offer
  content, labels, URLs, tokens or request bodies.
- The operator can inspect the store with
  `node --experimental-strip-types scripts/builder-invite-operator.mjs list --store <dir> --json`
  and close an ambiguous charge with `reconcile-usage`.

## Remaining gaps

- Actual provider cost is only supplied by the injected test provider. A live
  provider price-table integration and invoice reconciliation are not part of
  this commit.
- The ledger is a single-host local file with a process lock. Shared filesystems,
  multiple server instances, container replacement, backup/restore, retention
  and corruption recovery are not qualified. A transactional shared ledger is
  required before horizontal scaling.
- There is no customer usage dashboard or self-serve limit increase. Denials
  are actionable text; spend denials require operator contact.
- A user who manually starts a new generation after an ambiguous outcome gets a
  new request id. The UI says not to retry immediately and the reservation
  remains, but automatic ambiguous-outcome replay is not implemented.
- Rolling windows depend on the host clock; clock skew and time-zone behavior
  are not separately qualified.
- Rate limiting for invite redemption and broader abuse controls remain outside
  this slice.
- A real provider canary is excluded and requires separate authorization. The
  bounded plan is in the decision document.

No paid calls, live provider calls, deployment, DNS/account changes,
production migrations, customer messages or publication were performed.
