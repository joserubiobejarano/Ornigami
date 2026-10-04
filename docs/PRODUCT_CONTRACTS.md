# Product contracts

This document consolidates product promises and approved decisions. “Current” describes code observed in the reviewed source; “approved target” records an owner decision that still needs implementation or acceptance. Proposals are not authorization to ship.

## Product and launch boundary

Ornigami is a business workspace for Google Review Replies and post-visit Review Booster. The initial paid offer is Review Booster only, email only, one business/location/user, with a manually validated Google review URL. Begin with one enrolled and activated business (trial or paid), then expand to three and five only after seven consecutive healthy operating days at each stage. Review the rollout after 30 days from the first business activation. The audience has not yet been recruited; likely salons, restaurants and gyms are only a recruitment direction, not enrolled customers. Jose owns release, monitoring, support, privacy requests and rollback.

The existing catalog is Replies EUR 39/month or 360/year; Booster EUR 39/month or 360/year; Complete EUR 59/month or 560/year. Booster includes 500 accepted requests per UTC calendar month; Complete includes 1,500. Complete combines the two reputation agents. Initial launch sells Booster only while Google Business Profile access is gated. New businesses may use the established 14-day trial once under the trial eligibility contract below; the public demo remains available. Speed to Lead remains disabled/coming soon, without an approved price, trial, volume, entitlement or channel. Public Local SEO, free-audit and legacy project surfaces remain supporting compatibility features, not the primary product.

## Billing, trials and entitlements

**Current trial offer:** one 14-day trial per business and billing owner, with no card required at entry. If there is no payment method at expiry, cancel the trial. Otherwise, paid entitlement requires successful authoritative billing reconciliation; a checkout redirect alone grants no access. Existing commitments run to their existing end without shortening or silently charging them. Stripe test-mode acceptance is still required before conversion; no live charge is authorized. The demo and this established trial are the only free experiences; do not add other free entitlements. Resolve open checkout sessions safely before onboarding.

**Durable eligibility contract:** a trial can begin only if both business and billing-owner histories show no consumed trial. Unknown legacy history fails closed and requires operator reconciliation. Consume eligibility only when Stripe authoritatively starts the trial; abandoned checkout consumes nothing. Plan/period/owner changes, cancellation, recheckout and conversion never reset history. Do not purge history or reset eligibility. Preserve the minimal business/owner anti-abuse evidence for as long as this criterion must be enforced, with access restrictions and at least annual necessity review. Handle valid erasure requests through the rights process and a documented evidence/claims assessment; no automatic purge/reset is defined.

Conversion preserves usage. Customer-facing copy must not promise unconditional continuation.

The reviewed pricing FAQ currently says the plan continues after 14 days without explaining the no-payment-method cancellation. Align pricing, checkout and dashboard copy with the condition before trial entry; preserve the existing cancellation behavior.

Active/trialing agent state gates paid feature work. Business agent plan/period bounds are authoritative; the owner profile is a compatibility mirror. Billing, trial activation, Google connection changes and provider reconciliation are owner-only. Recovery/read/export paths remain governed by their own identity and role checks. New checkout and owner billing changes must be idempotent and bound to the canonical business owner/customer mapping.

## Booster delivery and permission

The approved Booster allowance uses full UTC calendar months `[first day 00:00 UTC, next first day 00:00 UTC)`, independent of Stripe monthly/annual billing and activation date. Caps are 500 Booster and 1,500 Complete. No proration, rollover or billed overage. Trial and paid conversion share the month window; changing plan, owner, actor or location never resets usage. Accepted sends consume quota. Provider uncertainty retains its reservation and key until authoritative reconciliation; never release or automatically retry an unknown operation under a new key. Rejection/generation failure releases a reservation. Usage and keys survive routine message/data cleanup.

Eligible visit age is 23 hours through seven days from actual visit time. Exhausted work may wait fairly only within that eligibility window; expired work stays expired, including after upgrade. Recheck current entitlement, suppression, selected destination and timing just before send. Reviews are requested neutrally from eligible consenting recipients; do not filter by expected satisfaction or imply a click caused a review.

For launch, a review request is optional customer communication requiring explicit permission for this purpose. Record permission source, timestamp and notice version before upload/intake; a generic business attestation is not per-recipient proof. Do not use purchased/scraped lists or infer permission from a booking address. Include business identity, reason, privacy information and an immediate free unsubscribe. Keep account/security/billing mail separate from promotions. This is the approved conservative product choice, not a legal certification.

Collect only recipient email, optional first name, actual visit time, business/location and permission evidence needed for sending. Exclude health conditions, treatment notes and other sensitive service details from intake, generated text, logs and AI prompts. One shared explicit Google location is used by Replies and derived Booster links; manually validated review URLs remain available without GBP approval. Location discovery alone grants no activation. Cross-business or stale location references fail closed. Location-switch treatment remains an unapproved policy choice; the documented recommendation is to preserve each queued visit's captured destination or hold it for owner review, never silently redirect it.

## Review Replies and draft policy

Replies depends on an authorized Google Business Profile connection, selected location, API access/quota and required OAuth publication/verification. Discovery does not establish posting permission. Drafts are versioned; the current exact text must be reviewed and approved before posting. Low/unknown-rating reviews remain manual-only. Current shared enforcement preserves human edits and retained posting fences; refreshing a review does not clear an uncertain post. Scheduled jobs may sync and draft; scheduled posting is not approved. Only known 4–5-star replies may auto-post through explicit business-owner opt-in in supported interactive processing. An ambiguous Google result remains fenced until authoritative reconciliation.

The proposed business-shared UTC monthly 2,000 Reply generation ceiling, recovery-only billing grace, seven-day notice clock, scheduled downgrades, owner-inclusive seat changes, member access after lapse and location-switch recovery remain unapproved unless stated above. Do not implement a proposal as an approved promise. Complete's three seats include owner plus accepted members and live pending invitations in current enforcement; avoid silent user/workspace deletion.

## Future Speed to Lead boundary

Speed to Lead is registered as coming soon and checkout rejects it. There is no operational lead intake, entitlement, Twilio route or lead schema. Public `/api/leads` records marketing enquiries, not customer leads. Preserved Contactor code and schema are migration reference only. No owner-approved packaging, price, billable event, quota, trial, overage, provider cost, country, channel, consent or service scope exists. Do not activate operational signup, checkout, jobs or sends until those decisions, canonical business ownership, privacy, provider acceptance and isolated acceptance are complete. Existing Complete does not imply lead access.

## Decisions and implementation gates

Approved but not fully delivered: permission/retention/support implementation and representative Booster performance evidence before live enrollment, whether trial or paid. The paid-only A21 change is cancelled. The current durable one-time trial policy is implemented; verify its Stripe provider acceptance before paid conversion. Initial customer audience/dates are unknown. Google Replies/API access remains separately gated. Self-service account deletion and uncertain-provider recovery remain disabled. No automatic trial-history purge or live payment is authorized by this document.

Source references for the conservative email permission choice: [LSSI articles 21–22](https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a21). This is a product authorization default, not a legal classification of every review request.
