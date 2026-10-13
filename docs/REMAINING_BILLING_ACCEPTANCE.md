# Remaining billing acceptance — 13 October 2026

Branch: `task/remaining-billing-acceptance`, based on `0bcdd8f`. Worktree: `Ornigami-Remaining-Billing`.

## Result and boundary

Annual Stripe test-clock conversion and renewal passed. An authenticated synthetic owner completed annual Booster Checkout in the browser, and genuine Stripe events reached the production-built application's HTTP webhook through Stripe CLI forwarding. Application billing code and policy were unchanged.

The target was `http://127.0.0.1:50369/api/stripe/webhook`, backed by disposable PostgreSQL 17 with canonical migrations through 041, including the duplicate acknowledgement fix in 039. This verifies local provider-origin HTTP delivery. Deployed webhook delivery, production configuration, live charges and production retry transport remain outside this acceptance. No deployment, merge or shared roadmap update was performed.

The target refused shared Next environment files and inherited live Stripe keys. It used the CLI's named test credential and the application's pinned API version `2026-07-29.dahlia`. Synthetic catalog entries matched the application's plan amounts. The committed harness scopes mutations to its owned test resources; a separate audit correction is recorded below. The local runtime used the existing fixture Neon-to-PostgreSQL bridge; authentication, Checkout, webhook signature validation, provider retrieval and billing persistence used the real application code.

## Annual provider cycle

Designated run: `da120680-925d-4621-9056-bd399910e6d2`.

| Check | Observed result |
| --- | --- |
| Price and trial | EUR 360, recurring every year; exactly 14 days trialing |
| Paid conversion | Active subscription, paid EUR 360 invoice `in_1UPwF1KBOOwWa94Weq2auYsc` |
| Initial annual service period | `[1793071130, 1824607130)`, exactly 12 UTC calendar months |
| Renewal | Distinct paid EUR 360 `subscription_cycle` invoice `in_1UPwFBKBOOwWa94WFFEGt3AX` |
| Renewed service period | `[1824607130, 1856229530)`, another 12 UTC calendar months |

The test clock advanced past billing boundaries to let invoice payment processing settle. The repeatable harness allows two hours for settlement. The direct provider subscription used a Stripe test payment method; it was separate from the browser's no-card trial. A trial's service period ends at trial expiry; it is not itself a 12-month paid period.

Provider receipt: `.local/a17-stripe-evidence/annual-da120680-925d-4621-9056-bd399910e6d2.json`. Earlier exploratory outcomes are retained, including failures while settling invoices and cleanup. The separate `annual-cleanup-audit.json` confirms their owned resources were subsequently cleaned. A further completed run, `9ad74435-69e8-4489-9d40-32bffc1b8425`, also passed and cleaned up; it is supplementary evidence.

## Interactive Checkout and application delivery

Application run: `d46558b2-00e7-4e8c-b6f0-a5859964a39a`. Next build ID: `6ZC6CoqCkzFWrSeviIWas`. Combined SHA-256 of webhook route, reconciliation module and plan catalog: `e34934222766b3e4dcedf6d41399af55dbb2b75bc37abdaa72feb1cc331838e5`.

The browser signed in through the ordinary credentials UI, selected **Yearly**, saw Booster **360 EUR/year**, submitted the application Checkout form, and followed the redirect to Stripe-hosted **Sandbox** Checkout. Stripe displayed 14 days free, then EUR 360/year, EUR 0 due today and the missing-payment-method cancellation disclosure. Clicking **Start trial** completed Checkout without a payment method and returned to `/dashboard/billing?success=1`. The page displayed **Review Booster / trialing / 360 EUR/year** with Yearly selected.

Before completion, the observed annual Checkout intent was pending, no subscription or agent entitlement existed, and trial history was unconsumed. After authoritative webhook reconciliation, the intent was completed and both owner and business trial histories were consumed. The synthetic prior usage of 11 stayed 11 against the Booster allowance of 500. A subsequent Stripe-origin cancellation changed the application to canceled and retired the intent, while preserving both histories and usage.

The same annual price `price_1UPwJ8KBOOwWa94WQMEEYxPJ` and subscription `sub_1UPwLSKBOOwWa94Wm4FAWYRJ` were verified in Stripe and persisted application state. The browser trial's initial paid invoice amount was EUR 0; this journey did not exercise a paid browser charge.

| Genuine Stripe event | HTTP result and persistence |
| --- | --- |
| `invoice.paid`, `evt_1UPwLTKBOOwWa94WuuunBWqD` | 200; completed event row, annual trial entitlement |
| `customer.subscription.updated`, `evt_1UPwMzKBOOwWa94WzbIeQpRK` | 200; completed event row |
| `customer.subscription.updated`, `evt_1UPwNDKBOOwWa94WPOvaaJMH` | 200; annual/trialing, usage 11 |
| `customer.subscription.deleted`, `evt_1UPwNGKBOOwWa94W8oq041rb` | 200; canceled, consumed histories and usage 11 retained |

The initial simultaneous Checkout event burst also returned retryable 500s for `checkout.session.completed`, `customer.subscription.created` and `invoice.payment_succeeded` because the shared reconciliation lease was busy. Stripe CLI did not retry those three deliveries. The successful `invoice.paid` event reconciled the authoritative trial state; later serialized provider updates and cancellation also converged. This is evidence of recovered subscription state through distinct provider events, not proof that every initial event was acknowledged or that deployed retries were exercised. Unmapped events from the separate annual provider runs are excluded from the application's correlated acceptance receipts.

Local evidence: `.local/a17-stripe-evidence/application-d46558b2-00e7-4e8c-b6f0-a5859964a39a.json`, `provider-sequence-d46558b2-00e7-4e8c-b6f0-a5859964a39a.json`, and `.local/a17-validation/browser-journey.json`. The browser receipt and three screenshots preserve the selected plan, hosted Checkout and return state. Provider receipts exclude API keys, signing secrets and payment links. Synthetic login credentials remain only in ignored fixture files until teardown.

The earliest collector overwrote successive phase snapshots; its retained application JSON represents the canceled state. The pre-completion observations are preserved in `d46558b2-00e7-4e8c-b6f0-a5859964a39a-precompletion-witness.json` with explicit witness provenance, rather than a reconstructed database snapshot or invented capture timestamp. The final collector now saves separate timestamped phase receipts and verifies the completed Stripe Checkout session, application price/status/period and customer mapping before reporting acceptance.

## Verification

The actual isolated production build completed successfully. Focused billing regression: **45/45 passed, zero skipped**, including disposable PostgreSQL billing persistence, signed captured-event webhook integration, checkout/reconciliation regressions and four new annual boundary/guard/cleanup tests. Three additional HTTP launcher guard tests passed, for **48 focused tests total**. Those signed regression tests cover replay, delayed events, failure propagation and quota/history preservation; they are separate from provider-origin delivery evidence.

```powershell
node --experimental-strip-types --test tests/a03-checkout-routes.test.mts tests/a03-reconciliation.test.mts tests/a03-billing-postgres.test.mts tests/a17-stripe-test-acceptance.test.mts tests/a17-stripe-event-reconciliation.test.mts tests/a17-stripe-annual-acceptance.test.mjs
node --test tests/a17-stripe-http-target.test.mjs
```

Repeat the standalone annual provider check with the Stripe CLI already authenticated in test mode:

```powershell
$env:A17_STRIPE_CONFIRM = 'I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS'
$env:A17_STRIPE_TARGET = 'isolated-test'
node scripts/a17-stripe-annual-acceptance.mjs --execute
```

An inherited live or invalid key blocks execution. Inspect scenario and cleanup status in the resulting minimized receipt before accepting a run.

For the interactive application acceptance, use a clean worktree without `.env.local` or other Next environment files. The reusable HTTP harness currently uses the Windows PostgreSQL/Stripe CLI fixture conventions and Windows process identity checks. With the same explicit test authorization variables set:

```powershell
node scripts/a17-stripe-http-target.mjs start
```

Wait for the ready handoff. Keep its launcher running so Stripe CLI continues forwarding. Read the ignored `.a20-fixture/a17-stripe-http-target.json` locally for the synthetic owner login and loopback origin. Use the normal login UI, select Yearly Booster and complete its hosted sandbox trial. Capture browser evidence separately. Then, from another terminal:

```powershell
node scripts/a17-stripe-http-target.mjs snapshot
node scripts/a17-stripe-http-target.mjs provider-sequence
node scripts/a17-stripe-http-target.mjs finalize
```

The sequence command changes metadata on the mapped test subscription and cancels it, checking provider-origin deliveries and preserved usage/history. Finalization requires accepted persisted state, completed Checkout and an already canceled mapped test subscription. It verifies recorded process ownership before shutdown and preserves a cleanup receipt outside the disposable fixture. Investigate any failed check or incomplete cleanup; do not treat launcher readiness alone as acceptance.

## Cleanup and integration handoff

Application cleanup receipt: `.local/a17-stripe-evidence/d46558b2-00e7-4e8c-b6f0-a5859964a39a-cleanup.json`, status **complete**. The synthetic customer was deleted, its subscription was canceled, all six run-owned prices and the product were verified inactive, both recorded processes were confirmed exited, the loopback listener was clear, and the disposable `.a20-fixture` database/directory was removed. Annual provider cleanup separately confirmed cancellation, payment-method detachment, clock/customer deletion and catalog deactivation. Test invoices/events remain in Stripe's test-mode history.

Audit correction: a separate inventory pass briefly deactivated three historical test products based on an A17 metadata tag without confirming task ownership. Their previously observed `active: true` state was restored and verified; no subscriptions or customers were changed by that audit. The affected products are `prod_VQmdYcNjKLbvEi`, `prod_VQmcdd0RUZZfKv`, and `prod_VQmcUEo87niXLF`. Their provenance remains unverified, and no cleanup claim is made for them. `.local/a17-stripe-evidence/target-run-resource-cleanup-audit.json` retains both the mistaken changes and corrective restoration. Earlier known launcher runs `a4d0b5cd-ea41-47b2-89ce-7dd24b89498d` and `92c0e8ee-1f7c-46cd-9bd9-d374ee695157` were verified inactive.

Final focused ESLint passed with zero warnings, and `git diff --check` passed. Changes comprise the repeatable annual provider harness, actual HTTP target/collector/finalizer, seven focused harness tests and this task document. The integration session can review the three scoped acceptance results and the explicit initial concurrency/retry limitation before applying them to a deployment decision. Deployment-target webhook transport and retry acceptance remain to be performed by that session.
