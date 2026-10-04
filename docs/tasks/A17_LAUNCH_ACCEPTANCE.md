# A17 launch acceptance

**Latest bounded completion — October 4:** [Public release journeys](./A00_PUBLIC_RELEASE_JOURNEYS_2026-10-04.md) supplies deployed synthetic preview receipts for public application mail/CTAs/recovery, concurrent CSV/manual/cron behavior, unsubscribe/frozen-owner guards, current application Sentry trigger/recipient and real normalized browser CSP reports. It fixes a concrete Booster capture gap. Request timings remain a baseline, not CWV/load acceptance. Next is owner pilot/privacy/rollback decisions and affected external/provider gates; no completed A10/A12/A17/A20 package is restarted. Historical checklists preserve their earlier evidence boundaries.

**Latest operator completion — October 4:** [Production activation](./A00_PRODUCTION_ACTIVATION_2026-10-04.md) closes original inbox placement, permanent production mail/webhook transport, feedback-only support onboarding, Sentry editor email-action delivery and saved child expiry with reader retirement. Remaining release evidence is bounded: actual public application link/recovery and other unperformed journeys, deployed performance/CSP report review and application Sentry trigger. Stripe remains skipped; Google and owner policy/retention decisions remain gated. Broad paid launch remains held; completed setup and implementation sessions are not reassigned. Earlier status blocks below are dated historical evidence.

**Latest operator evidence — wave 11, 2026-10-04:** [A00 review](./A00_WAVE11_INTEGRATION_REVIEW.md) closes the bounded live Resend application-to-signed-webhook proof and accepts A12's production-operations runbooks. Permanent deployed mail configuration/public CTA/inbox placement, production support credential delivery, current Sentry alert delivery and proposed child expiry execution remain open. Existing authenticated core/privacy observation evidence stays closed. Broad paid launch remains held; no new broad A17/A20 audit is assigned.

**Operator evidence update — 2026-10-04:** [Wave 10](./A00_WAVE10_INTEGRATION_REVIEW.md) closes the successful production privacy checkpoint observation and verifies local synthetic HTTP ingress, child-only support access and one historical notification receipt. Broad paid launch remains held: live Resend/public endpoint, production support/current-rule evidence, unperformed release journeys and external/policy gates are not waived. No new broad A17/A20 rerun is assigned.

Status: integrated A17 implementation and provider receipts are preserved below. [Wave 9 A20 integration](./A00_WAVE9_INTEGRATION_REVIEW.md) closes the isolated authenticated core-workflow gap; external provider, operational and other explicitly unperformed release journeys remain open. Historical candidate feasibility and browser evidence remain in [A17 integrated acceptance handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md).

Historical package evidence below was reviewed at `e5a9c0f` (2026-10-03), after A00 wave 4 integration. Current integrated candidate: `a98878ef2611322c54f67de61a018b7ecf8e3298` (A00 wave 7, 2026-10-04). Neither record approves pending commercial/privacy policies or treats a fixture as target/provider evidence.

Historical A17 worktree: `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A17-launch-acceptance`; branch: `test/launch-acceptance`; base commit: `e5a9c0f`.

## Release boundary

A17 has three evidence levels, which must be recorded separately:

1. **Isolated behavior**: unit/route tests and disposable PostgreSQL suites in this checkout can run now; record the exact candidate, runtime, command, counts, skips, and whether PostgreSQL actually ran. A10 delivery-event tests are integrated. These tests do not use shared databases or real providers.
2. **Authenticated browser acceptance**: signed-in owner, invited member, and unrelated outsider accounts against the actual candidate app with an isolated database. Verify navigation, visible role controls, request outcomes, and persisted results. A13 shared layouts, dashboard, access and recovery UI are integrated; the remaining blocker is an isolated app-runtime database (validated local bridge or supplied disposable deployment) plus seeded Auth.js actors. [A20](./A20_AUTHENTICATED_BROWSER_ACCEPTANCE.md) owns the provider-independent fixture and signed-in journey. The local browser and adapter feasibility findings are recorded in the [integrated handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md). A route test does not satisfy this level.
3. **Provider/production acceptance**: Stripe test mode was authorized in principle but checks were skipped at the user's request on 2026-10-03. The canonical configuration was reported to contain a live key; its value was not disclosed or copied into this checkout, and it was not used. The requested test-key location remains unresolved; no prior test-mode pass is inferred. The first authorized direct Resend production attempt returned HTTP 403; a separate read-only domain inventory showed configured sender domain `kruno.app` is absent from the account's domains, with the cause of that rejection unconfirmed. A later separately identified authorized run used the verified domain `reviews.ornigami.com` as an in-memory sender override; Resend accepted it, and a read-only message lookup verified the intended recipient/sender and delivered event. No shared sender/DNS/config was changed. The probe does not establish the app's canonical sender configuration, webhook/ledger state, suppression, or full application workflow. A read-only Sentry project check returned HTTP 200 with matching org/project identity and read access; no event was sent. Google acceptance is blocked because no GBP account is available. These scoped receipts do not establish complete provider/workflow acceptance. See [A17 provider acceptance](./A17_PROVIDER_ACCEPTANCE.md) for run IDs and receipt details. Do not activate account deletion through this package.

Broad paid launch remains held until A10's isolated implementation is connected to an authorized Resend endpoint and controlled application delivery acceptance, A17 completes authenticated browser acceptance, A16 obtains Google approval evidence for Replies, and A19's target CSP/report findings are reviewed for the affected product surface. A13 is integrated; its signed-in acceptance is still open. Booster can be piloted independently of Google approval after billing/delivery gates and its own provider acceptance. A17 does not make the pending A18 choices: Reply safety quota, payment-recovery grace, scheduled downgrade timing/seats, member read access after lapse, selected-location switch treatment, or automatic-posting policy beyond the currently implemented A09 rules.

## Work packages and dependencies

| Package | Acceptance dependency / exit evidence |
| --- | --- |
| A10 delivery events and suppression | Integrated implementation and disposable-PostgreSQL/synthetic-signature tests are reviewed in [A00 wave 7](./A00_WAVE7_INTEGRATION_REVIEW.md). Remaining: configure the isolated Resend endpoint/signing secret, prove provider ingress and application ledger state, and complete controlled delivery/suppression acceptance. Keep manual reconciliation disabled until its separate gate closes. |
| A13 shared layout, dashboard and copy | Integrated; isolated core authenticated acceptance closed by [wave 9](./A00_WAVE9_INTEGRATION_REVIEW.md). Production performance/typography and provider-specific recovery evidence remain separate. |
| A16 Google access | Obtain/record GBP Basic API access approval, usable non-zero quota, enabled review API, published/verified OAuth consent as required, correct redirect URIs, and an eligible real client profile with Manager access. This is an external gate, not a test fixture. |
| A19 CSP assessment | Integrated hardening and local anonymous Chromium/smoke fixtures are documented in [A19 runtime assessment](./A19_CSP_RUNTIME_ASSESSMENT.md). Remaining: exact candidate browser acceptance as authorized, deployed headers and report-only Trusted Types review; assign and close actionable findings before marking target CSP acceptance. |
| A11 privacy/account deletion | Routine privacy export/retention and health acceptance are in scope. Account deletion remains disabled until the A11 policy, retained-data disclosures, provider reconciliation and operator gates are resolved. Test that it stays disabled; do not run destructive production deletion. |
| A01 release pipeline | Exact candidate Linux quality/security CI and required migrations on an isolated target are release prerequisites. The Windows/base A00 test report is not a substitute. |

## Run and record

A17 includes `tests/a17-cross-workflow.test.mts`, which exercises a member manual-intake-to-send journey against disposable PostgreSQL with a mocked Resend provider; `scripts/a17-provider-acceptance.mjs`, a bounded loopback-only owner/member read-only application probe; and `scripts/a17-live-provider-probes.mjs`, which supports the scoped Resend send and read-only Sentry project check. These provide partial isolated and provider evidence; they do not establish CSV/send concurrency, browser, app-level production delivery, Google, Stripe, or full cross-provider acceptance. The current candidate's full suite and required quality gates are recorded below. Remaining behavior gaps are assigned in [A17_ACCEPTANCE_MATRIX.md](./A17_ACCEPTANCE_MATRIX.md).

For each target run, record candidate commit/deployment ID, migration set and sanitized target DB identity, actor role/plan/status, test mode versus live, action and result, UTC time, safe correlation IDs, and cleanup. Never record credentials, tokens, raw customer payloads, review text, provider response bodies, or secret environment values. Repository investigation inspects environment variable names and tool availability only; the scoped provider probe reads its explicit allowlisted provider values privately and does not emit them.

### Historical A17 package receipt (`e5a9c0f`)

The following evidence table is preserved from the original A17 worktree and applies to that reviewed base, not automatically to `a98878e` or later task-added files. Current integrated-candidate evidence is in the [matrix refresh](./A17_ACCEPTANCE_MATRIX.md#integrated-candidate-refresh--2026-10-04-europemadrid) and [integrated handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md).

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
| Authenticated browser / production application smoke | A13 is integrated. Signed-in journeys are blocked pending an isolated app-runtime database and seeded Auth.js actors; anonymous candidate browser evidence is tracked in the [integrated handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md). No production application smoke is claimed by this local check. |

### Current integrated base (`a98878e`)

Current A17 worktree: `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A17-integrated-release-acceptance`; branch: `test/a17-integrated-release-acceptance`; reviewed base: `a98878ef2611322c54f67de61a018b7ecf8e3298`. The production build and anonymous local browser receipt use Node 22.23.3 and build ID `oovgZ3zMmXj4MCw3J98vP`. A19 CSP/hydration assertions and the in-app Chromium login/dashboard redirect check passed; see the [integrated handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md). The separate [A17 integrated delivery acceptance](./A17_INTEGRATED_DELIVERY_ACCEPTANCE.md) reports its disposable PostgreSQL journey. The final suite SHA, 465/465 test result, and all release-gate receipts are in [A17 integrated release evidence](./A17_INTEGRATED_RELEASE_EVIDENCE.md).

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

## Historical shared-document integration proposals

These proposals originated with the earlier A17 package. The current deployment checklist already records the canonical migrations, NEXT_PUBLIC_SENTRY_DSN, evidence levels, role boundaries and delivery semantics; the architecture already records shared owner entitlements, UTC caps, draft/manual boundaries, cron outcomes and disabled deletion. Later A00 wave handoffs and the single roadmap record the integrated packages. Do not reassign those documentation corrections as new implementation work. Remaining product decisions still require dated owner approval; historical wave 4 evidence stays tied to its original base. The proposals are preserved below for provenance.

- `docs/DEPLOYMENT_CHECKLIST.md`: update the migration inventory to the actual canonical sequence (including 019, 021–024, 026–027, 031–038 and the explicitly unused/reserved gaps); replace the stale Sentry runtime name `SENTRY_DSN` with `NEXT_PUBLIC_SENTRY_DSN` while retaining build-upload names; split isolated, authenticated-browser, Stripe test/live, Google-approved, privacy-retention, and deletion-disabled evidence so checkboxes cannot imply one level proves another. Add the A13 role matrix and A10 accepted/delivered distinction.
- `docs/ARCHITECTURE.md`: record canonical owner/member shared entitlement and owner-only mutation boundaries, A06's approved UTC calendar-month Booster caps, A09 draft/manual approval boundaries, A12 lease/continuation response meanings, A11 deletion-disabled status, and which integration/UI work remains. Existing prose is too high-level to act as acceptance criteria.
- `docs/ROADMAP.md` and `docs/tasks/A00_WAVE4_INTEGRATION_REVIEW.md`: after those packages merge, replace open/next-owner language with exact commit/evidence links. Keep Google provider readiness, A19 CSP runtime evidence, A10 semantics, and A11 activation decisions as separate gates. The current docs correctly say A17 may start isolated acceptance now and that Google Console/real-provider acceptance remains unverified.
- `docs/product-contracts/BILLING_AND_USAGE.md`: leave unapproved proposals marked pending. Once the owner decides downgrade/seats, recovery grace and access, Reply safety accounting, and location switch behavior, add dated approval evidence before A17 tests the new behavior or A13 publishes it.

Do not copy private deployment receipts or production account/provider identifiers into these shared documents.
