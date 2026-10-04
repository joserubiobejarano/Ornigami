# Paid Review Booster rollout decision

**Status: launch direction approved by the owner on October 4, 2026; named audience and technical implementation/acceptance remain pending.** Privacy and performance defaults were delegated to A00 and are now recorded in the [paid launch policy](../product-contracts/PAID_BOOSTER_LAUNCH.md). No customer is enrolled by this document.

## Owner reply and adopted scope

| Decision | Owner reply / adopted default |
| --- | --- |
| Audience | Not yet available; recruit over the next few weeks, likely beauty salons, restaurants and gyms. Actual businesses/dates remain pending. |
| Commercial | Always paying; only the demo is free. New-customer free trials are superseded. Initial offer: Booster at the existing EUR 39/month or EUR 360/year, one location/user and 500 requests per UTC month. |
| Operations | Jose handles release, monitoring, support, privacy requests and rollback. Published contact routing still needs proof. |
| Privacy/mail | Owner delegated the choice. Adopt explicit purpose-specific permission, minimal customer fields, immediate unsubscribe and the purpose-based retention table in the paid launch policy. Implementation is required. |
| Performance | Owner delegated the choice. Adopt at most five staged businesses, median HTML <=2 s/p95 <=3 s, ten-session isolated read-load acceptance and Google CWV quality targets with lab/field evidence distinguished. |
| Launch | Approved direction. Activation waits for named paying businesses and the technical entry gates; no repeated business-policy approval request is needed. |

Roll out to one, then three, then five businesses after at least seven healthy operating days per stage; review after 30 days from the first paid activation. The start date is driven by recruitment and readiness. These are operating reviews, not free access or trial periods. Review Replies/Complete sales, lead cutover and destructive deletion activation are outside this initial Booster offer.

## Entry gates and stop conditions

| Gate | Required record |
| --- | --- |
| Release/operations | Exact reviewed main Ready, Quality/Security passed, accepted primary schedule receipts and a fresh naturally scheduled independent GitHub health pass. The manual recovery receipt is distinct. |
| Paid checkout | New free-trial creation removed, existing issued promises handled safely, authoritative paid activation and narrow Stripe test/provider acceptance. The previous Stripe skip cannot establish a paid launch. No live charge without an authorized payer. |
| Mail/privacy | Permission evidence enforced across intake, approved retention implemented with durable fences/suppression preserved, accurate notices/processor arrangement and actual privacy/support routing to Jose. |
| Performance | Existing owner navigation/HTTP baseline accepted provisionally; ten-session isolated read-load proof before first paying business, larger HTTP/mobile lab evidence before expansion. Field p75 follows real traffic; no invented results. |
| Audience | Record actual named business/location, subscription interval, start date and authorized recipient data before onboarding. |
| Rollback | Jose stops intake/new enrollment and pauses affected automation through reviewed controls. Retain unknown-provider fences and reconciliation evidence; do not blindly retry/release reservations. |

Stop for duplicate sends/quota, cross-business access, unsubscribe/freeze bypass, missing/unhealthy scheduled runs or unconfirmed alerts. Performance degradation holds expansion under the chosen policy. An ambiguous provider outcome goes to operator review, never a blind retry.

## What remains for the owner

Supply actual participating businesses/locations and dates when recruited. For a controlled live billing acceptance, identify an authorized payer/payment method when the prepared test-mode work is ready. Support/contact routing and any actual seller/jurisdiction particulars must be verified during onboarding; the policy does not invent them. The privacy/performance choices and launch direction do not need to be asked again.

## Evidence boundary

[Owner access and performance](./A00_OWNER_ACCESS_AND_PERFORMANCE_2026-10-04.md) records working production credentials navigation and twelve HTTP samples, not browser rendering or populated-load proof. [Remaining follow-through](./A00_REMAINING_LAUNCH_FOLLOWUPS.md) records closed mail/cron/notice observations. The existing public privacy notice correctly says self-service deletion is unavailable; target retention periods will be published only with validated deployed enforcement. Deletion and uncertain-provider reconciliation stay disabled. The [paid launch policy](../product-contracts/PAID_BOOSTER_LAUNCH.md) partitions only the changed A21/A22/A23 criteria; no broad closed audit is restarted.
