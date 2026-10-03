# A17 launch acceptance

Status: scoped implementation complete; overall provider and authenticated-browser acceptance remain blocked. No authenticated application-target receipt is recorded; scoped provider receipts are listed below.

Base reviewed: `e5a9c0f` (2026-10-03), after A00 wave 4 integration. This package turns the integrated contracts into a bounded acceptance record. It does not approve pending commercial/privacy policies or assert that a test fixture is a browser, provider, staging, or production result.

Worktree: `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A17-launch-acceptance`; branch: `test/launch-acceptance`; base commit: `e5a9c0f`.

## Release boundary

A17 has three evidence levels, which must be recorded separately:

1. **Isolated behavior**: unit/route tests and disposable PostgreSQL suites in this checkout can run now; run them on the exact candidate and record commit, runtime, command, counts, skips, and whether PostgreSQL actually ran. A10/A13/A16/A19 merges may add follow-up cases, but they do not block current isolated checks. These tests do not use shared databases or real providers.
2. **Authenticated browser acceptance**: signed-in owner, invited member, and unrelated outsider accounts in an isolated target deployment with disposable workspaces and provider test accounts. Verify navigation, visible role controls, request outcomes, and persisted results. A route test does not satisfy this level. A13 must finish shared parent layouts, dashboard counters and remaining plan consumers first.
3. **Provider/production acceptance**: Stripe test mode was authorized in principle but checks were skipped at the user's request on 2026-10-03. The canonical configuration was reported to contain a live key; its value was not disclosed or copied into this checkout, and it was not used. The requested test-key location remains unresolved; no prior test-mode pass is inferred. The first authorized direct Resend production attempt returned HTTP 403; a separate read-only domain inventory showed configured sender domain `kruno.app` is absent from the account's domains, with the cause of that rejection unconfirmed. A later separately identified authorized run used the verified domain `reviews.ornigami.com` as an in-memory sender override; Resend accepted it, and a read-only message lookup verified the intended recipient/sender and delivered event. No shared sender/DNS/config was changed. The probe does not establish the app's canonical sender configuration, webhook/ledger state, suppression, or full application workflow. A read-only Sentry project check returned HTTP 200 with matching org/project identity and read access; no event was sent. Google acceptance is blocked because no GBP account is available. These scoped receipts do not establish complete provider/workflow acceptance. See [A17 provider acceptance](./A17_PROVIDER_ACCEPTANCE.md) for run IDs and receipt details. Do not activate account deletion through this package.

Broad paid launch remains held until A10 delivery event/suppression work, A13 shared UI/contract alignment, A16 Google approval evidence for Replies, and A19 runtime CSP review are resolved for the affected product surface. Booster can be piloted independently of Google approval after billing/delivery gates and its own provider acceptance. A17 does not make the pending A18 choices: Reply safety quota, payment-recovery grace, scheduled downgrade timing/seats, member read access after lapse, selected-location switch treatment, or automatic-posting policy beyond the currently implemented A09 rules.

## Work packages and dependencies

| Package | Acceptance dependency / exit evidence |
| --- | --- |
| A10 delivery events and suppression | Merge and test accepted-versus-delivered/failed events, bounce/complaint suppression and any outbox decision. A17 verifies one controlled message through Resend's provider lookup; application accepted/delivered state, webhook processing, suppression and complete delivery workflow still depend on A10. |
| A13 shared layout, dashboard and copy | Merge canonical owner/member/outsider access in all signed-in parent layouts and remaining plan/dashboard consumers; reconcile UI with approved trial/quota semantics. A17 authenticated browser matrix is blocked until then. |
| A16 Google access | Obtain/record GBP Basic API access approval, usable non-zero quota, enabled review API, published/verified OAuth consent as required, correct redirect URIs, and an eligible real client profile with Manager access. This is an external gate, not a test fixture. |
| A19 CSP assessment | Review deployed runtime headers, nonce/hydration behavior and report-only Trusted Types evidence; assign and close any actionable findings before marking CSP acceptance. A local helper test cannot establish runtime browser behavior. |
| A11 privacy/account deletion | Routine privacy export/retention and health acceptance are in scope. Account deletion remains disabled until the A11 policy, retained-data disclosures, provider reconciliation and operator gates are resolved. Test that it stays disabled; do not run destructive production deletion. |
| A01 release pipeline | Exact candidate Linux quality/security CI and required migrations on an isolated target are release prerequisites. The Windows/base A00 test report is not a substitute. |

## Run and record

A17 includes `tests/a17-cross-workflow.test.mts`, which exercises a member manual-intake-to-send journey against disposable PostgreSQL with a mocked Resend provider; `scripts/a17-provider-acceptance.mjs`, a bounded loopback-only owner/member read-only application probe; and `scripts/a17-live-provider-probes.mjs`, which supports the scoped Resend send and read-only Sentry project check. These provide partial isolated and provider evidence; they do not establish CSV/send concurrency, browser, app-level production delivery, Google, Stripe, or full cross-provider acceptance. The current candidate's full suite and required quality gates are recorded below. Remaining behavior gaps are assigned in [A17_ACCEPTANCE_MATRIX.md](./A17_ACCEPTANCE_MATRIX.md).

For each target run, record candidate commit/deployment ID, migration set and sanitized target DB identity, actor role/plan/status, test mode versus live, action and result, UTC time, safe correlation IDs, and cleanup. Never record credentials, tokens, raw customer payloads, review text, provider response bodies, or secret environment values. Repository investigation inspects environment variable names and tool availability only; the scoped provider probe reads its explicit allowlisted provider values privately and does not emit them.

| Evidence | Result |
| --- | --- |
| Clean install | Node 22.23.3 / npm 11.6.2; `npm ci` passed, 675 packages added. |
| Lint | Passed with 0 errors and 4 existing navigation warnings. |
| Type generation and TypeScript | Passed final rerun. |
| Security tests | Passed 7/7. |
| Security audit | Passed; zero production findings. Eleven existing high development ancestry records remain under the approved narrow exception expiring 2026-10-10. |
| Full discovered suite | Passed 354/354, zero failures/skips, Node 22 with real disposable PostgreSQL (60.80 seconds), including final A08 gate cleanup and A17 suites. |
| Production build and smoke | Passed: webpack build, CSP hash generation and production smoke. |
| Exact candidate Linux CI | Pending A01 release gate. |
| Stripe | Skipped at user request; live key was not used, test-key location unresolved. |
| Direct provider probes | Resend: initial run HTTP 403; a separate run with in-memory verified sender override was accepted and provider lookup confirmed delivery. Shared app sender config remains unresolved. Sentry: read-only HTTP 200 with matching project identity; no event sent. See [provider receipt](./A17_PROVIDER_ACCEPTANCE.md). |
| Google | Blocked; no GBP account is available. |
| Authenticated browser / production application smoke | Pending A13 and an isolated candidate target. |

## Scope and rollback

This package changes acceptance tests/scripts/docs and stabilizes an A08 PostgreSQL concurrency test. It changes no application runtime code, schema, migration, settings, dependency, or deployment. No migration or deployment was performed. Reverting the package removes these scoped files and test stabilization; no database rollback is needed. Temporary PostgreSQL fixture directories are cleaned by the tests under `.next`.

Reproduce the local gates from the worktree with Node 22:

```powershell
npm ci
npm test
npm run lint
npm run typegen
npx tsc --noEmit
npm run security:audit
npm run test:security
npm run build
npm run test:build
```

## Proposed shared-document integration edits

These are findings for the integration owner after A10/A13/A16/A19 land. The combined A17 branch also carries its scoped tests/scripts and A08 test stabilization; these shared documents remain untouched.

- `docs/DEPLOYMENT_CHECKLIST.md`: update the migration inventory to the actual canonical sequence (including 019, 021–024, 026–027, 031–038 and the explicitly unused/reserved gaps); replace the stale Sentry runtime name `SENTRY_DSN` with `NEXT_PUBLIC_SENTRY_DSN` while retaining build-upload names; split isolated, authenticated-browser, Stripe test/live, Google-approved, privacy-retention, and deletion-disabled evidence so checkboxes cannot imply one level proves another. Add the A13 role matrix and A10 accepted/delivered distinction.
- `docs/ARCHITECTURE.md`: record canonical owner/member shared entitlement and owner-only mutation boundaries, A06's approved UTC calendar-month Booster caps, A09 draft/manual approval boundaries, A12 lease/continuation response meanings, A11 deletion-disabled status, and which integration/UI work remains. Existing prose is too high-level to act as acceptance criteria.
- `docs/ROADMAP.md` and `docs/tasks/A00_WAVE4_INTEGRATION_REVIEW.md`: after those packages merge, replace open/next-owner language with exact commit/evidence links. Keep Google provider readiness, A19 CSP runtime evidence, A10 semantics, and A11 activation decisions as separate gates. The current docs correctly say A17 may start isolated acceptance now and that Google Console/real-provider acceptance remains unverified.
- `docs/product-contracts/BILLING_AND_USAGE.md`: leave unapproved proposals marked pending. Once the owner decides downgrade/seats, recovery grace and access, Reply safety accounting, and location switch behavior, add dated approval evidence before A17 tests the new behavior or A13 publishes it.

Do not copy private deployment receipts or production account/provider identifiers into these shared documents.
