# A13 dashboard access, pagination, performance, and recovery

Status: implementation and peer review complete; tested and ready for integration with one known standard-runner test failure documented below. Root-owned type generation, typecheck, lint, build, production-smoke, and the full sequential test run passed. This task branch is based on `e5a9c0f` in `C:/Users/joser/Desktop/Projects/Ornigami-Worktrees/A13-dashboard-usability-performance` (`fix/dashboard-usability-performance`). Do not deploy or merge from this worktree.

## Scope

A13 consolidates the dashboard work tracked under I04/I08 and the A13 row in the project roadmap: canonical workspace access for owners and members, bounded business-scoped dashboard reads, inbox and visit pagination, accessible loading/error/empty/recovery states, and performance evidence.

The access-specific contract and required shared proxy coordination are recorded in [A13 access integration proposal](./A13_ACCESS_SHARED_INTEGRATION.md). UI contracts and integration handoff are in [A13 UI integration notes](./A13_UI_SHARED_INTEGRATION.md). Query/index measurements and any migration-specific shared handoff belong in [A13 performance evidence](./A13_PERFORMANCE_EVIDENCE.md). No shared roadmap, deployment configuration, or live environment has been changed by this worktree.

## Implementation handoff

The access implementation uses the existing A02 strict business-context and owner-entitlement services. Owners and members resolve the same canonical workspace; frozen or unavailable context fails closed. Dashboard reads use workspace IDs for shared reviews and follow-up visits, actor IDs for legacy personal projects, and the integration owner's selected Google location for location counts. No global cross-tenant lead count is displayed.

The summary metrics distinguish UTC-month reply totals from all-time sent follow-ups. Follow-up aggregate failures preserve successfully loaded review totals and expose a recoverable dashboard error. No Reply quota UI or policy was changed; the existing billing-period protective generation ceiling remains in place, and the proposed UTC business-shared Reply ceiling is unapproved. Dashboard role gating hides trial, activation, plan-change, and billing controls from members, while existing API authorization remains the security boundary for mutations.

Pagination uses bounded opaque cursors for reviews and Booster visits. Previous/next recovery preserves the current page when a request fails; posting uncertainty remains reserved for reconciliation. The pagination implementation adds migration 028 and bounded route contracts. Apply the migration before serving those query paths and choose a rollout window based on target table size. The UI implementation is covered by the A13 interaction and responsive review.

For local access and metric verification, run `node --experimental-strip-types --test tests/a13-dashboard-access.test.mts tests/a09-persistence-postgres.test.mts` with the repository's supported Node 22 runtime and PostgreSQL test prerequisites. The temporary `/a13-fixture` route uses synthetic member/review/visit data and intercepted fetch calls only; it is local browser-review tooling, not a supported product route.

## Verification evidence

- [x] Owner/member, frozen access, selected location, partial stats failure, and disconnected member behavior covered in `tests/a13-dashboard-access.test.mts`.
- [x] A09 dashboard draft aggregate test fixture accounts for the new business-scoped follow-up statistic in `tests/a09-persistence-postgres.test.mts`.
- [x] Node 22 focused A13 access + A09 PostgreSQL run: 7/7 tests passed.
- [x] Targeted ESLint on access files passed with no errors; the temporary test callback warning was corrected.
- [x] Root browser review of the temporary synthetic fixture verified dirty reply preservation across failed Next navigation, retry/GET recovery, and a read-only fenced review; Booster visit page failure preserved current rows and retry loaded the next page, with keyboard Previous working.
- [x] At a 390px browser viewport (375px layout width), the dashboard shell had no page-level horizontal overflow and billing navigation stayed hidden for a member. The Booster table retained local horizontal scrolling (872px table in a 315px container).
- [x] Access, backend, and UI peer reviews completed with no blocking findings.
- [x] Windows Node 22.23.3 direct Node invocations equivalent to type generation and typecheck passed: `node node_modules/next/dist/bin/next typegen` and `node node_modules/typescript/bin/tsc --noEmit`, including the UI tests.
- [x] Windows Node 22.23.3 direct ESLint invocation completed with zero errors and four pre-existing location-navigation warnings.
- [x] Windows Node 22.23.3 direct Node invocation of `next build --webpack` followed by `scripts/generate-static-csp-hashes.mjs` passed and generated two CSP hashes.
- [x] Windows Node 22.23.3 direct Node invocation of `scripts/production-smoke.mjs` passed static CSP hash parity, nonce-bound hydration/rotation, and anonymous dashboard/auth/Google/billing boundaries.
- [x] The full 356-test suite passed with 0 failures and 0 skipped in 299.8 seconds on Windows Node 22.23.3/PostgreSQL 17. PowerShell discovery was `$a13SuitePaths = @(rg --files tests -g '*.test.mts' | Sort-Object)` followed by `node --experimental-strip-types --test --test-concurrency=1 @a13SuitePaths`.
- [x] The standard `npm test` script (`node scripts/test.mjs`) completed 355/356 tests, with one failure and zero skipped in 59.5 seconds. The failure is the unchanged `tests/a08-google-postgres.test.mts:204` assertion that the freeze transaction acquired its business lock before the writer starts; actual count was 0, expected 1.
- [x] The sequential run passed all 356 tests, while the standard runner failure is consistent with a synchronization/timing interaction under its execution pattern. This is a suspected cause, not proven. `tests/a08-google-postgres.test.mts` and the shared test-runner/CI ownership are outside A13 scope.
- [x] An earlier parallel full-suite attempt completed 353 tests with 348 passing and five failures: one legacy UI mock was corrected, and four PostgreSQL timing-barrier failures occurred under concurrent load. The explicit sequential run above is green.
- [x] These checks used synthetic/local fixtures only; no environment files, provider credentials, live databases, or deployment targets were changed.

## Unresolved integration decisions

- Shared `src/lib/disconnected-access-policy.ts` and `src/proxy.ts` currently redirect paid disconnected Reply inbox/overview requests before the new recovery UI can render. A02/shared integration must decide how to let authorized read-only inbox/overview pages show disconnected/error states while preserving owner-only Google changes and provider API authorization. See the access proposal.
- Migration 028 adds regular indexes. The integration owner should choose a rollout window appropriate for the target data volume and decide whether deployment needs a concurrent-index procedure; ordinary index creation can hold write locks.
- Clearing an uncertain external post still requires an authoritative provider reconciliation path; that work is outside this branch's ownership.
- Review the A08 PostgreSQL test synchronization barrier and the standard runner's parallel resource bounds through their owning integration/CI work. A deterministic A08 option is a persistent `psql` session that emits `LOCK_HELD` after `SELECT ... FOR UPDATE`, keeps the transaction open behind a controlled barrier until the writer is confirmed blocked, then allows freeze/commit; bounded test concurrency is an alternative for isolating resource contention. The parallel-load explanation is plausible but unproven. No runner or shared CI configuration change was made in A13.
- Browser review used a temporary public fixture route with synthetic identities/data, mocked client fetch responses, and no auth/provider/database calls. Its marketing chrome and delayed development compile/hydration are not representative of a production authenticated session. The route files were removed after review.
- No dependencies, shared deployment configuration, or database models were added or changed. Migration 028 adds indexes; the Review Replies read projection uses a local TypeScript type.
- No cross-owner review blockers remain. The standard-runner A08 failure above is the known test limitation; root owns the combined commit and handoff hash.
- Linux CI parity, provider-backed behavior, production Core Web Vitals, and Lighthouse measurements remain unverified; they require their respective authorized environments and traffic.
