# Billing acceptance — 13 October 2026

Branch: `task/billing-acceptance`, based on `e21249e`. Worktree: `Ornigami-Billing-Acceptance`.

## Scope and changes

Verified the established one-time 14-day trial policy using Stripe test-mode resources and isolated application tests. Pricing, FAQ structured data, dashboard and Stripe-hosted checkout now explain that no card is required at entry, a payment method is needed for paid continuation, and a trial without one cancels at expiry. Previously consumed and unknown trial histories receive an explicit paid-checkout disclosure. Unknown history still cannot obtain a trial; it can proceed to paid checkout or be reconciled by support.

Migration `039_billing_lease_duplicate_alias.sql` fixes a replay defect: the completed-event cleanup predicate used an unqualified `fence`, which conflicted with the function's output variable and raised a PostgreSQL ambiguity error. A duplicate delivery could therefore return HTTP 500 instead of the intended duplicate acknowledgement. The migration qualifies that table column; it does not change billing policy, catalog prices or trial eligibility. Cancellation details and trial end dates remain in Stripe's billing portal; scheduled cancellation is not separately persisted in the dashboard. Existing past-due grace behavior remains intact.

## Provider evidence

Stripe CLI 1.45.1 supplied its named test-mode credential. The application's live `.env.local` was not loaded. The SDK used the application's pinned API version, `2026-07-29.dahlia`, and asserted `livemode: false` on provider objects. Synthetic resources used a separate EUR 39 monthly price; existing catalog resources and customers were not modified.

Final provider run: `225951fa-a569-4996-b67a-aaedf5d33b85`. The committed webhook fixture comes from the earlier successful run `c77a75d8-e5f6-46b6-a652-eb4df907bdfe`.

| Scenario | Observed result |
| --- | --- |
| Trial start | `trialing`; `trial_end - trial_start` equals exactly 14 days |
| No payment method at expiry | Test-clock advancement produces `canceled` |
| Successful conversion | Test card produces `active` with a paid invoice |
| Declined conversion | Failed test card produces `past_due` |
| Explicit cancellation | Provider confirms `canceled` |
| Hosted checkout payload | Stripe accepts the 14-day trial, optional payment collection, missing-method cancellation and disclosure; test session expires afterwards |

All six provider checks passed. Test clocks and their synthetic customers/subscriptions were deleted. The synthetic product and price were deactivated, because Stripe does not permit deleting a product with associated prices. Recorded provider events are minimized to billing reconciliation fields; credentials and hosted invoice/payment links are excluded.

This verifies a synthetic local acceptance target. Hosted checkout session creation was verified through Stripe's API; an interactive browser checkout and delivery to a deployed webhook endpoint were not exercised. It does not certify production configuration or authorize live billing.

## Application evidence

The checkout and reconciliation suites verify owner-only access, immutable checkout intents, provider uncertainty, abandoned-session recovery, no repeat trial, unknown-history trial exclusion, current-provider-state reconciliation for delayed events, duplicate handling, and retryable webhook failures.

The PostgreSQL suite starts a disposable local cluster and applies repository migrations to synthetic data. Added coverage seeds seven accepted requests and applies trial conversion, payment failure, cancellation and duplicate cancellation. Usage remains seven and consumed trial history survives every transition. No production database URL is used.

The recorded-event integration test loads minimized snapshots from the successful Stripe run, generates local test signatures with Stripe's SDK, and invokes the actual Next webhook handler, reconciliation module and persistence functions against disposable PostgreSQL. Its provider retrieval callback supplies the captured current subscription snapshot, without a network request. This checks the application integration using real provider data; it does not represent Stripe-origin HTTP delivery.

Production validation: `npm run build` passed with synthetic environment values in an isolated source copy (Next 16.3.8, TypeScript, 24 static pages, route tracing and CSP hash generation). SHA-256 checks confirmed all five changed application files matched the task worktree. Focused ESLint passed. The isolated copy avoided a locked PostgreSQL test log under the shared worktree's `.next` directory.

Final focused regression: **41/41 passed, zero skipped**. This includes both disposable PostgreSQL tests and the recorded-event signed webhook integration. Invalid signatures caused no database/provider reads; replay acknowledged the completed event without fetching again; delayed trial events converged to the captured current active, past-due or canceled subscription state. Quota usage remained seven and both business and owner trial histories stayed consumed. Reapplying migration 039 twice preserved usage and history.

```text
node --experimental-strip-types --test tests/a03-checkout-routes.test.mts tests/a03-reconciliation.test.mts tests/a03-billing-postgres.test.mts tests/a17-stripe-test-acceptance.test.mts tests/a17-stripe-event-reconciliation.test.mts
npx tsc --noEmit
```

Type checking and focused ESLint passed. The provider harness's five guard/cleanup tests are included in the 41-test count; all six real Stripe provider scenarios passed separately. Build evidence is retained locally in `.local/a17-validation/build-evidence.json`, focused regression output in `.local/a17-validation/regression.log`, and final provider evidence in `.local/a17-stripe-evidence/provider-225951fa-a569-4996-b67a-aaedf5d33b85.json`. The minimized fixture at `tests/fixtures/a17-stripe-subscription-snapshots.json` is committed so the application regression can run without provider credentials.

## Repeat provider acceptance

Run from the task worktree with the Stripe CLI already authenticated in test mode. The harness reads only the named `test_mode_api_key` from its configuration when `STRIPE_SECRET_KEY` is absent. An inherited live key is rejected; the harness does not switch a live key to test mode.

```powershell
$env:A17_STRIPE_CONFIRM = 'I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS'
$env:A17_STRIPE_TARGET = 'isolated-test'
node scripts/a17-stripe-test-acceptance.mjs --execute
```

This creates synthetic test-mode provider resources and attempts cleanup. It never loads `.env.local`. Minimized evidence is written under ignored `.local/a17-stripe-evidence/`. A failed assertion or incomplete cleanup must be resolved before treating a new run as accepted. Keep provider evidence separate from application regression evidence.

Stripe references: [Checkout trials](https://docs.stripe.com/payments/checkout/free-trials.md?payment-ui=stripe-hosted), [test-clock simulations](https://docs.stripe.com/billing/testing/test-clocks), [product deletion restrictions](https://docs.stripe.com/api/products/delete), and [Checkout session parameters](https://docs.stripe.com/api/checkout/sessions/create).

## Integration handoff

Review and integrate the task branch through the integration session, including migration `039_billing_lease_duplicate_alias.sql` through the normal migration process. The replay fix is not active on any deployed target until that migration is applied. No merge into `main`, shared roadmap update or deployment was performed. Production target acceptance and any live enrollment remain subject to the existing launch gates.
