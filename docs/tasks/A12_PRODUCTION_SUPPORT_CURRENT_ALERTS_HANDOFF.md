# A12 production support and current alerts handoff

Status: tooling review and isolated acceptance are complete. **Production support onboarding and current-alert delivery acceptance are pending.** No production database connection/query, support-role mutation, staff credential installation, Sentry notification send, provider change, deployment, or main-branch change was made in this task.

## Reviewed evidence

- [A12 support access operations](./A12_SUPPORT_ACCESS.md) describes the guarded `ornigami_support_reader` provisioning/activation wrapper, effective privilege verifier, TLS credential handling, and private local inbox artifact. Its live receipt is for the separately approved child branch only; that credential must not be used for production.
- [A12 current alert routing review](./A12_CURRENT_ALERT_ROUTING_REVIEW.md) records the read-only UI view of current project alert `746029` and its history, while [A12 Sentry notification evidence](./A12_SENTRY_NOTIFICATION_EVIDENCE.md) records one historical mailbox receipt attributed to rule `760684`. No source record currently links those identifiers; current-alert delivery remains unproved. The workflow API returned 403. No test notification was sent.
- [A12 support child disposition](./A12_TEST_BRANCH_DISPOSITION.md) recommends resolving named owner/consumer checks and expiring the possible production-snapshot child by 2026-10-05 18:00 Europe/Madrid. Its current expiry is `Never`; no expiry or deletion action was taken.
- [A12 support visibility](./A12_SUPPORT_VISIBILITY.md) defines the inbox boundary. `SUPPORT_DATABASE_URL` is an operator-only credential for `scripts/support-inbox.mjs`, not an application deployment setting or `DATABASE_URL` fallback.

The parent reviewer identified project `bitter-brook-23785103` (`Local Lift`) and production branch `br-red-frost-alc3smfv` in the signed-in Neon UI. This is a target observation only; production configuration identity was not freshly established by this task, and no production database connection/query was made. The current scope still requires the user's production target/staff destination decision and a named operator/owner for the credential.

## Production onboarding sequence after scope is settled

1. Confirm the exact Neon project, production branch, endpoint host, database name, PostgreSQL version, and operator authorization in Neon Console. Arrange a short-lived owner/admin source file and a **pre-existing** staff-managed private destination outside the repository for the generated support credential. Do not reuse the A12 child credential or possible child snapshot as a production fixture.
2. Run the wrapper without a mode against the independently copied host/database:

   ```powershell
   node scripts/a12-support-access-provision.mjs `
     --admin-env 'C:\path\outside\repo\production-admin.env' `
     --expected-host '<exact production endpoint host>' `
     --expected-database '<exact production database>'
   ```

   This local dry run parses the supplied URL and checks its host/database against those expected values; it does **not** connect to PostgreSQL or audit the target. The reviewed wrapper has no separate read-only database-audit CLI mode. Before any mutation, an operator must perform and retain a bounded read-only target preflight: confirm PostgreSQL 17+, `public.feedback`, whether the fixed role already exists and its state, feedback RLS, and effective table/column/sequence, database/schema, and callable `SECURITY DEFINER` privileges. If that preflight cannot establish the documented invariants, stop without applying or repairing shared grants.
3. If the exact role is absent and the preflight is clear, `--apply` executes the fail-closed transaction in [A12_SUPPORT_ACCESS.sql](./A12_SUPPORT_ACCESS.sql), verifies effective access, then creates a random login credential in the approved private destination and enables the role. If a previously created, independently audited `NOLOGIN` role exists and matches every required flag/grant, use `--activate`. Both paths check the private destination and pass the generated password only over required TLS via `psql` stdin. Do not put credential values in arguments, terminal output, Git, or application deployment settings.
4. Load the newly approved production credential into the operator process without echoing it, run `scripts/support-inbox.mjs --limit 1`, and retain only the private artifact path. Then run `scripts/a12-support-access-verify.mjs` with the same exact expected host/database and artifact path. The verifier is read-only and confirms identity, `SELECT public.feedback` only, no memberships/escalation/other persistent access, read-only transaction, and private artifact ACL. The operator must independently check that the resulting artifact is in the approved staff-managed private location and follow its retention policy.
5. Remove the temporary admin source after accepted verification and confirm the expected access artifact lifecycle. Record only sanitized target/result metadata. Production onboarding closes only when the named staff credential owner confirms delivery and the independent production verifier succeeds.

Current alert acceptance is a separate gate: a permitted read-only `alerts:read`-capable Sentry credential would allow GET confirmation of workflow `746029`, but cannot by itself map historical rule `760684` or prove delivery. Any controlled delivery test still needs an approved project, one-event test, recipient, and source/recipient evidence plan. The current user decision does not yet authorize a send or identify those destinations.

## Validation and change

`npm ci` completed in this isolated worktree with zero reported vulnerabilities. The serial combined support/current-alert suites passed **20/20**, zero failed or skipped, using the synthetic local PostgreSQL 17.9 fixture. The first run exposed that the fixture's generated artifact path was 262 characters and `icacls` could not inspect it under the classic Windows 260-character path limit. Both test-only fixture roots now use `.next/a12pg`; the equivalent path is 240 characters. The PostgreSQL privilege and ACL assertions are unchanged, and the rerun passed. No production database or provider was contacted.

The isolated worktree is `ops/a12-production-support-current-alerts`, based on `5a80b8d`. Its review changes are the test-only fixture directory correction in `tests/a12-support-access.test.mts` and these three task documents: this handoff, [A12 current alert routing review](./A12_CURRENT_ALERT_ROUTING_REVIEW.md), and [A12 support child disposition](./A12_TEST_BRANCH_DISPOSITION.md). No production tooling behavior, application code, dependency, shared setting, model, route, schema, migration, roadmap, or deployment change is needed for the reviewed scope.

No production database credential was copied or used. The existing Sentry token was loaded for GET-only checks without emitting its value.

The proposed integration dependencies are a named operator/owner for the production support credential, approval of the exact target and private staff-managed credential destination, and production onboarding only after a read-only database preflight. The current alert evidence has separate pending dependencies: permitted Sentry read scope for API confirmation if required, an authoritative mapping (or continued unresolved status) between IDs `760684` and `746029`, and an approved recipient/evidence plan before any controlled send. The child disposition decision is **EXPIRE by 2026-10-05 18:00 Europe/Madrid**, after named owner and consumer checks; provider execution remains pending and no expiry action was taken.

## Acceptance receipt

Runtime: Node.js `v24.11.1`; isolated PostgreSQL `17.9`. Exact combined command:

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/a12-support-access.test.mts tests/a12-support-visibility.test.mts tests/a12-sentry-delivery-probe.test.mts tests/a12-alerts.test.mts
```

Result: **20/20 passed**, 0 failed, 0 skipped (`12.0s`). Scoped `npm.cmd exec -- eslint tests/a12-support-access.test.mts` completed without diagnostics; `git diff --check` exited 0. No full app build or Linux CI claim is made. `npm ci` reported zero vulnerabilities and did not change package manifests. These tests exercised only synthetic/local fixtures; separate read-only Sentry GET/UI review is documented above and in the linked routing memo. No production database or provider mutation occurred.
