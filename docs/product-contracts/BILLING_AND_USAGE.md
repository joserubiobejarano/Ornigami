# Billing and usage contract

**Status: A18 draft for owner approval.** Verified source behavior and public promises are separate from recommended target policy. This specification does not implement enforcement.

See [legacy and deferred scope](LEGACY_AND_DEFERRED.md) and [Speed to Lead](SPEED_TO_LEAD.md) for their separate contracts.

## Verified promises and runtime behavior

The [catalog](../../src/lib/billing/plans.ts) sets these amounts and public limits:

| Plan | Monthly price | Annual price | Published request and seat wording |
| --- | --- | --- | --- |
| Review Replies | EUR 39 | EUR 360 | One location, one user; unlimited synced reviews |
| Review Booster | EUR 39 | EUR 360 | Up to 500 requests per month; one location, one user |
| Complete | EUR 59 | EUR 560 | Up to 1,500 requests per month; one location, three users |

The marketing UI describes prices as per location; checkout uses EUR. Annual prices are billed yearly; monthly equivalents are display calculations. No change to these prices is proposed.

Replies has a catalog allowance value of 2,000 and an [internal generation safety ceiling](../../src/lib/review-reply-policy.ts). Public copy does not sell a 2,000-request allocation. Unlimited synced reviews and generated drafts are distinct units. Complete's request allowance describes Booster sends, not a shared bucket for sends and reply generation.

Complete's copy claims requests turned into real reviews. Current counters do not establish request-to-review causal attribution. A click or contemporaneous synced review cannot prove a particular email produced a review.

The [pricing FAQ](../../src/app/pricing/page.tsx) says the plan continues after 14 days, while [checkout](../../src/app/api/stripe/checkout/route.ts) and its [policy](../../src/lib/billing/checkout-policy.ts) require no card up front and cancel at trial end without a payment method. Copy must reflect that conditional continuation.

Current enforcement:

- Booster counts sent follow-up messages by business from the subscription period start. Annual subscriptions can use the annual start despite monthly allowance copy.
- Exhaustion can permanently skip visits, preventing automatic recovery after upgrade. Dashboard copy promising next-month sending must account for the seven-day visit window.
- [Reply usage](../../src/lib/usage.ts) is stored by user in profiles and reset against the subscription period. Generation paths consult and increment the 2,000 safety ceiling; teammates do not share that counter.
- Every eligible new checkout sets a 14-day trial without persisted trial history. Existing active/trialing/past-due subscriptions block checkout, but cancellation can permit another trial.
- Some Replies access uses a seven-day helper based on current_period_end, while team/plan checks and Booster cron differ. Grace is inconsistent.
- [Plan changes](../../src/app/api/stripe/change-plan/route.ts) update Stripe immediately with always_invoice proration; they do not schedule downgrades.
- One location is advertised, but one canonical business selection shared by Replies and Booster is not established. Discovery does not prove permission to operate every location.
- Complete has three seats. [Team invitations](../../src/app/api/team/route.ts) count memberships and pending reservations; removal/revocation and downgrade behavior remain incomplete.

These findings are local source evidence, consistent with [E02/E06/E09](../ROADMAP.md), rather than live Stripe or database verification.

## Recommended target policy

Every numbered rule is proposed for owner approval.

1. **One selected GBP location per business.** Replies and Booster share a business-owned stable account/location identity. Discovery does not activate locations. Switching selection does not reset quota or silently redirect existing visits: keep their captured destination or hold them for owner review. Invalid/cross-business selections fail rather than selecting another location. A manual Booster review link remains usable without GBP connection, with validated destination and explicit one-business/location scope.

2. **Full UTC calendar-month Booster quotas.** Windows are [00:00 UTC on the first, 00:00 UTC on the first of the next month), independent of monthly/annual Stripe invoices and activation date. The caps are 500 for Booster and 1,500 for Complete. No activation/trial proration, rollover, or billed overages. Trial and paid conversion share the current window; a trial crossing a month boundary receives the ordinary new-month reset. Display the reset instant in the user's locale with its UTC basis.

3. **Reserve before contacting the provider.** Reserve atomically against business, agent, and UTC window. Accepted sends consume one unit, distinct from delivery and conversion. A send accepted after midnight charges its reserved window. Unknown provider outcomes retain reservations until reconciled; do not automatically release them. Provider rejection or generation failure releases the reservation. Stable provider idempotency and recoverable persistence prevent retries from sending or charging twice.

4. **Defer exhaustion within visit eligibility.** Otherwise eligible unsent visits wait fairly until capacity is available, but only between 23 hours and seven days after the actual visit. Older visits expire with a reason. Upgrade can release eligible work, never expired work. Recheck suppression, current access, and destination immediately before sending.

5. **Business-shared Reply safety accounting.** Recommend 2,000 monthly generation units for Replies and Complete, separate from Booster sends. This is a technical protective ceiling, not a purchased send bucket. Failed generation, sync, posting an existing draft, human edits/saves, and repeated processing of unchanged drafts consume no generation unit. Use the same UTC windows and actor-independent ownership. Explain any protective pause and recovery path in the UI; do not advertise literally unlimited generation if a hard ceiling blocks legitimate use. Unlimited sync remains a separate promise. Owner approval is required for this safety policy and any public drafting claim affected by it.

6. **One 14-day trial per business and billing owner.** Both durable histories must have no prior consumed trial. Consume eligibility only when Stripe authoritatively starts the trial; abandoned checkout does not consume it. Plan/period/owner changes, cancellation, and recheckout never reset consumed history. Unknown legacy history requires reconciliation rather than automatic eligibility. Support exceptions must be deliberate and recorded. A11 defines privacy-compatible evidence retention; this does not authorize retaining deleted personal data indefinitely. No card is required at trial entry; no payment method at expiry cancels, while paid continuation requires a valid method and successful billing. Conversion does not reset usage.

7. **Recovery-only payment grace.** Keep billing repair/cancellation, account recovery, team administration, and data viewing/export available during payment trouble and afterward under valid identity/role rules. Paid generation/sends require authoritative active/trialing state. Recommend a seven-day recovery notification period beginning at the first authoritative payment failure; retries do not extend it. This is a notice period, not permission for paid work in past_due. Its end neither deletes data nor removes repair/read access. Owner must approve replacing current route-specific grace and the period_end-based helper.

8. **Prompt upgrades; next-period downgrades.** Recommend upgrades with displayed Stripe proration and effective access only after authoritative reconciliation. Schedule downgrades at the next subscription billing boundary, with effective date shown before confirmation. Monthly quota remains independent. Usage never resets: upgrading at 450/500 permits 1,050 more sends under Complete; lowering to 500 after 700 sends permits no further sends that month. A03 must reconcile portal-originated changes as well as app changes.

9. **Business seats include the owner.** Single-agent plans permit one total seat; Complete permits three, counting accepted members and unexpired pending invitations. Recommend blocking downgrade until the owner revokes excess invites/removes extra members; recheck immediately before a scheduled downgrade takes effect and prevent incompatible seat reservations meanwhile. Never silently delete a person or workspace data. Membership retained during billing lapse does not grant paid work; exact member read-access handling needs owner confirmation. A05 must enforce remove/revoke and reservation atomically.

## Integration owners and shared-change proposals

| Owner | Required integration |
| --- | --- |
| A02 | Canonical business/owner context, shared entitlement/usage ownership, selected-location contract; coordinate trial identities with A03. |
| A03 | Durable trial history/reservation, owner-only idempotent checkout/customer mapping, authoritative reconciliation, approved payment and plan-change dates. Coordinate A11 history retention. |
| A05 | Atomic membership/invitation seats, owner remove/revoke actions, scheduled downgrade compatibility and member access. |
| A06 | UTC usage windows and atomic reservations, accepted/unknown outcome accounting, quota-deferred/expired visit states, bounded fair recovery. |
| A07 | Preserve visit destinations and retained settings when intake/selection changes. |
| A08 | Stable shared selected GBP resource, ownership checks, selected-location processing, no silent fallback. |
| A09 | Business-shared generation accounting and the draft/approval policy in the directory README. |
| A13 | Correct trial-end, exhausted-quota, protective-pause, one-location, and conversion-attribution copy. |
| A17 | Validate approved policies with workflow tests after implementation. |

Exact fields/routes/migrations remain with implementation owners and A00 allocation. No dependency addition or migration is introduced here.

## Decisions awaiting owner approval

Approve UTC/full-month/no-rollover quotas; one trial per business and billing owner; recovery-only grace; scheduled downgrade timing and seats; business-shared generation safety accounting; location-switch handling; and corrected customer promises. Trial preference was requested but no answer is recorded. New policy is therefore proposed, not approved.

## Deterministic acceptance scenarios

Use a frozen clock. These are future implementation cases, not passing tests for this documentation.

- January ends at 2026-02-01T00:00:00Z. A reservation at 2026-01-31T23:59:59Z stays in January even if accepted after midnight. In leap year 2028, February 29 belongs to February and March 1 begins the new window. DST/local timezone changes do not change boundaries.
- A mid-month annual activation receives that month's full cap and the next UTC month's cap. Annual renewal, price/period switches, trial conversion, owner/actor changes, and location switches never add a reset.
- With 499 accepted/reserved Booster units, competing cron/manual attempts produce one final reservation. Generation failure/provider rejection frees it; an unknown provider result holds it; accepted send plus persistence failure/replay consumes exactly one.
- Deferred age six days and 23 hours may send when capacity becomes available. Seven days plus one second expires permanently; an upgrade cannot revive it. A visit exactly seven days old must satisfy the chosen inclusive selection boundary and still be eligible at send time.
- Upgrade at 450/500 yields 1,050 remaining Complete units. A downgrade with 700 already used blocks new sends under 500 until the next window. Removing Booster entitlement stops sends without deleting pending data.
- A trial starts once from authoritative state, lasts 14 days, and cancellation/recheckout/plan switch do not restore it. Abandoned checkout consumes no trial. Unknown legacy history blocks automatic trial grant pending reconciliation. No payment method at expiry cancels with accurate UI.
- Payment failure leaves repair/read/export available while paid work stops outside active/trialing. Repeated failures do not slide the notice deadline; recovery restores access without clearing usage.
- Two discovered GBP resources confer one selection. Both agents use it; cross-business selection fails. Existing visits keep their destination or are held for review after a switch.
- Three total Complete seats may include pending reservations. Concurrent fourth invitations fail. Scheduled downgrade cannot apply with incompatible seats or silently remove members.
- Human draft edits/reprocessing do not consume another generation unit or overwrite text; unknown/low ratings never auto-post. Source-backed public copy and enforcement agree.

## Evidence boundaries

Source review only. No runtime, schema, routes, dependencies, deployment configuration, or roadmap changes were made. Root validation and environmental limits are recorded in [HANDOFF.md](HANDOFF.md).
