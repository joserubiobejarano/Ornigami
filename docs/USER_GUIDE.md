# Review Booster user guide

Review Booster asks consenting customers for a Google review after a completed visit. A manual Google review URL is enough; Google Business Profile API access is needed for Review Replies, not this email workflow. Current launch readiness is in the [roadmap](./ROADMAP.md).

## Account, trial and setup

1. Create/verify an account and select your business. Credentials sign-in works; the observed incomplete Google sign-in flow is being diagnosed.
2. The business owner activates Review Booster through Billing. Eligible business/owner pairs may use **one 14-day trial**; unknown prior history needs reconciliation. No card is required at entry. Without a payment method at expiry the trial cancels; continued paid access requires valid billing. Cancelling/rejoining/changing plans does not create a second trial.
3. Configure business identity, city, language/tone, sender name and a validated direct Google review URL in Booster settings. Ornigami's configured sender is verified; customer-specific sending domains are future work.
4. Record actual completed visits manually, by CSV or through a configured generic booking webhook. A phone-only visit can be retained but cannot receive email. Generic intake is not a native salon/restaurant/gym booking connector.
5. Allow scheduled processing or use the manual campaign control for eligible visits. Adding a visit does not mean it was sent, delivered or produced a review.

Only upload customer details you are authorized to use for this purpose. Initial rollout policy requires purpose-specific permission evidence; automated enforcement of the new policy remains A22 work. Never import bought/scraped lists, sensitive health/treatment notes or addresses merely because a booking system contains them. Pending technical readiness is not permission to enroll customers early.

## CSV input

CSV files may contain up to **500 rows / 1 MB**. `customer_email` and `visited_at` are required for a usable delivery row; `customer_name` and `service_received` (or `service_name`) are optional. Name/service are limited to 120 characters, email 254 and visit-time text 40. Times must be a date `YYYY-MM-DD` interpreted in UTC, or an ISO timestamp with `Z`/an explicit offset. Use the actual visit time, not import time.

Business, normalized email, service, visit time and CSV source determine duplicate detection. Quoted values are supported; malformed CSV fails clearly. The result distinguishes inserted, skipped, duplicate and invalid rows. Retrying a partially successful import does not create duplicates of already imported rows. Correct invalid records rather than repeatedly uploading an unchanged file. The sample/template example row is not a real customer record and is skipped.

## Timing and allowance

A visit is eligible between **23 hours and seven days** after it occurred. Failed provider attempts have bounded backoff/retry; an uncertain provider outcome is held for operator review rather than sent again. A future visit or an already expired one cannot be made eligible by repeatedly pressing the send control.

Review Booster has 500 requests and Complete 1,500 per **full UTC calendar month**, independent of monthly/annual invoice periods. No rollover or proration, and no quota reset on trial conversion, upgrade, cancellation/rejoining or another teammate's action. An upgrade raises the cap while preserving usage. The UI shows the next UTC reset in your locale. Quota-deferred visits send only if capacity returns before their existing seven-day eligibility ends; expired work is not revived.

An accepted email consumes a request even if it later bounces. Unknown provider results retain their quota reservation. Generating content or getting a provider rejection does not by itself prove an accepted send. The first rollout offers Booster only; Complete/Replies activation remains subject to the separate launch gates.

## Status meanings and safe recovery

| Status | Meaning / action |
| --- | --- |
| Pending / scheduled | Waiting for eligible processing; check timing, configured destination and entitlement. |
| Sending | A worker holds the durable claim. Avoid repeated manual attempts. |
| Sent / accepted | Resend accepted the message. This is not yet proof of delivery or a Google review. |
| Delivered | A verified provider delivery event was recorded; a review still is not inferred. |
| Delivery status unknown / reconciliation required | Provider outcome is uncertain. Contact support; do not manually recreate the visit or resend it. |
| Waiting for quota | Deferred while the monthly cap is exhausted, only within the existing visit window. |
| Failed / bounced / complained / suppressed | Inspect the displayed reason. Suppression prevents later sends where applicable; correct configuration/data only through safe controls. |
| Unsubscribed | No follow-up will be sent to a matching unsubscribed recipient. Historical accepted/unknown delivery state is preserved. |
| Expired / skipped | Work is ineligible or deliberately excluded. An expired visit does not become eligible after upgrading. |

Unsubscribe protection is separate from ordinary contact cleanup. A complaint/global suppression can block delivery beyond a single visit; do not bypass it with a new record or email variation. Click counts are link interactions, not confirmed Google reviews or a request-to-review conversion rate.

## Privacy and help

Authenticated export is available. Send privacy/deletion requests through the published privacy contact; self-service account deletion is temporarily unavailable. Jose owns support/monitoring/privacy handling. See [operations](./OPERATIONS.md) for routing verification and the assisted process; the chosen retention defaults are not advertised as enforced until the implementation is deployed.

Test the review destination before a real campaign, keep visit data minimal and review failures/unknown outcomes with support. Email verification/reset, support and billing messages are distinct from optional review-request mail. The public demo sends a sample preview to its tester; it does not create a customer visit, subscription or scheduled production campaign.
