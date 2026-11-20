# Builder candidate test repair handoff

20 November 2026. Local source only; no deployment, customer invitation, paid
call or publication. Session 1 retains deploy/builder ownership.

## Exact source

- Branch: `codex/ornigami-builder-test-repair-20261120`
- Base candidate: `5a5db54b7764a7dbf98637874e31c0061a66cee8`
- Repair commit: `0d4ebca26dae1b74f95852b19f8531b2491fc79f`
- Worktree: `C:/Users/joser/.local/ornigami-builder-test-repair-20261120`
- Candidate decision read:
  `docs/BUILDER_CANDIDATE_DECISIONS_20261120.md` in the base candidate.

## Environment

- Windows 11 x64 (host reported Windows 11 Pro 10.0.26200)
- Node `v24.11.1`, npm `11.6.2`
- Git `core.autocrlf=true`
- Working-tree fixture line endings: `CRLF=60, LF=0`
- No dotenv files, live provider, Docker/Linux target or deployment used

## Reproduction before repair

Exact command:

```powershell
node --experimental-strip-types --test `
  tests/a00-server-observability.test.mts `
  tests/private-preview-sentry-isolation.test.mts `
  tests/staging-synthetic-fixture.test.mjs
```

Result: **17 tests, 11 pass, 6 fail**. The six failing tests were:

1. `Next server registration initializes the appropriate runtime and request hook never passes source data`
2. `private Preview skips server and edge initialization and request-error transport despite configured DSN`
3. `ordinary Preview and Production retain runtime Sentry initialization and request-error capture`
4. `fixture rejects ON CONFLICT mutation appended to the owner insert`
5. `fixture rejects inconsistent owner, membership, or review business references`
6. `fixture rejects expressions, function calls, and trailing clauses`

The instrumentation failures were `Cannot find module './lib/builder/startup'`
or `Unexpected runtime dependency: ./lib/builder/startup`. The production
instrumentation intentionally validates the builder boundary for the Node
runtime, but the two test harnesses did not mock that dependency.

The SQL failures were test-setup no-ops. The checked-out fixture was CRLF while
each mutation used LF search text, so `.replace(...)` returned the unchanged
fixture and the validator correctly accepted it. The tests therefore failed
their `ok === false` expectation without exercising the mutation.

## Line-ending and mutation check

The fixture test now:

- normalizes the fixture to LF for inspection and constructs an explicit CRLF
  variant;
- validates both the LF and CRLF baseline successfully;
- applies every rejection mutation through a helper that asserts the input
  actually changed;
- preserves the source line ending while mutating, so the CRLF path is passed
  to the real validator;
- runs every rejection case against both LF and CRLF inputs.

This covers the ON CONFLICT, owner/member/review reference, expression/function,
trailing clause, credential, DDL, update, schedule, extra-row and delivery-table
mutations. The missing-migration-column check also asserts that the intended
migration text changed. No production validator change was needed.

## Instrumentation repair

Both loaders now mock `./lib/builder/startup` and assert startup validation is
called exactly once for the Node runtime and not for Edge or a non-runtime
registration. Existing Sentry assertions remain: private Preview performs zero
SDK imports, initialization, capture and flush, while ordinary Preview and
Production retain one initialization/capture/flush per runtime. Builder startup
rejection coverage remains in
`tests/builder-production-boundary.test.mts`.

No production source changed in this repair. `git diff 5a5db54..HEAD -- src
builder-runtime deploy` is empty.

## Verification after repair

Targeted command above: **17 tests, 17 pass, 0 fail**.

Full suite exact command:

```powershell
node scripts/test.mjs
```

Result: **1,381 tests, 1,381 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**
(log: `.local/test-repair-full.log`).

Also:

- whole-project TypeScript: pass;
- ESLint on the three repaired test files: 0 errors/warnings.

## Remaining failures and boundaries

- No remaining full-suite failures were observed on this Windows environment.
- The candidate decision's Linux/image, host restart, proxy/TLS, privacy,
  retention, support and custom-Next ownership gates remain unchanged and open.
- This repair does not authorize staging, deployment, DNS/edge changes, real
  invitations or a live provider. Access remains closed and the provider
  disabled.
- Session 1's deploy/builder files were not modified.

## Rollback

Revert `0d4ebca` to restore the previous tests. The repair is test-only; no
store, fixture data, application runtime or builder deployment state changes.
