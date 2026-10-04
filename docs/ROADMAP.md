# Roadmap and pending work

This is Ornigami's single current backlog. Work from completed agent sessions is not reassigned unless a changed requirement or reproducible failure invalidates its evidence. Read [product contracts](./PRODUCT_CONTRACTS.md), [operations](./OPERATIONS.md), [technical reference](./TECHNICAL_REFERENCE.md), [release evidence](./RELEASE_EVIDENCE.md) and the [user guide](./USER_GUIDE.md) for the retained details. Historical handoffs remain recoverable from Git history.

## Current decision and release boundary

The owner **restored the established trial policy on October 4, 2026**: one 14-day trial per business **and billing owner**, unknown legacy history requires reconciliation, no card at trial entry, no payment method at expiry cancels, no repeated/reset trial or quota reset on conversion. The temporary paid-only/no-new-trials proposal and A21 removal task are cancelled. Customers pay after the established trial; no additional free production plan or manual free entitlement is approved. Existing implementation is retained.

The owner approves the launch direction, handles release/support/privacy/monitoring/rollback, and delegated the chosen mail/retention/performance defaults. Those choices are made; implementation and evidence remain distinct. Actual participating businesses are not yet available, likely salons/restaurants/gyms over the next few weeks. Initial scope is Review Booster only, one business/location, up to five staged businesses, with a manually validated Google review URL. Do not sell Replies/Complete before their Google gates close or infer a customer enrollment/start date.

The canonical project stays at `Ornigami/Ornigami-Agents`. Needed local recovery/evidence is consolidated under its Git-ignored, owner-restricted `.local/recovery`; old working copies and duplicate generated artifacts are removed only after reviewed preservation. Active credentials remain in their established private operator store. Workspace cleanup does not delete cloud resources or production data.

## Before onboarding the first business

| Remaining criterion | Current state | Next work / owner |
| --- | --- | --- |
| Permission and retention enforcement | Product defaults chosen; current intake/retained histories do not establish their full enforcement. | A22 implements permission evidence across manual/CSV/webhook intake, minimization and guarded terminal cleanup/durable-key separation, accurate notices/processor terms and assisted-rights handling. Preserve one-time-trial evidence and do-not-send protection. |
| Privacy/support delivery to Jose | Existing support reader/operator alerts accepted; published contact routing and the assisted privacy-request process need concrete verification. | A22/A00 verify actual routing to the operator and request-handling deadlines. Published addresses alone do not prove monitored inboxes. No new support dashboard requirement. |
| Representative performance | Production owner login/four-page navigation, 12 HTTP samples, actual Webpack inventory and isolated large-data/core tests accepted. Ten-session read-load target is not yet measured. | A23 reuses isolated fixtures to prove p95 <=3 s without production load/customer/provider operations. Larger HTTP/mobile lab baseline before cohort expansion; field CWV follows real traffic. |
| Naturally scheduled independent health | Natural Vercel Booster 19:07/20:07 UTC and Replies 20:11 UTC accepted. Manual independent health recovery at 20:27 passed. Latest observed scheduled GitHub health result is the old 17:37 failure. | A00 records a fresh healthy natural monitor receipt or fixes a reproducible delivery failure. Manual dispatch/current healthy DB state are not scheduler proof. |
| Existing trial-to-paid billing acceptance | One-time trial implementation is retained. Controlled Stripe trial/expiry/conversion/annual/failure/cancellation/provider acceptance remains unperformed; previous live-test skip is respected. Pricing FAQ continuation copy needs the no-payment-method cancellation condition before trial entry. | Narrow A17/operator acceptance of the existing contract in an isolated test-mode target and align pricing/checkout/dashboard copy, then an authorized payer/method for any live charge. Do not rewrite checkout into paid-only or silently grant active plans. |
| Actual audience/onboarding record | Owner will recruit over the next few weeks; no actual business/location/start date has been supplied. | Owner names businesses and provides permission-authorized data when ready; A00 records the reviewed release/limits and commercial onboarding. No repeated approval request for the decisions already made. |

Start with one business; expand to three and five after at least seven consecutive healthy operating days per stage. Review after 30 days from the first activation. These are operational reviews, not extensions of the approved 14-day trial. Monthly allowance is 500 Booster requests (1,500 Complete where its separate gates permit it), full UTC calendar months, no rollover/proration or reset on conversion. Do not invent hidden daily caps.

## Dated or conditional follow-ups

| Work | Boundary / next action |
| --- | --- |
| Temporary A12 database child | Approved expiry October 5, **18:00 Madrid  / 16:00 UTC**. Reader disabled and credential removed. A00 verifies provider removal after the saved deadline; a scheduled expiry is not completed deletion. |
| Google account sign-in | Observed supported OAuth login did not complete; normal credentials works. Diagnose the exact callback/flow before relying on Google login. This is separate from Business Profile API approval. |
| Browser/field performance | Larger permitted HTTP sample and mobile lab measurement before growing beyond the first business. Targets: median HTML <=2 s/p95 <=3 s; field p75 LCP <=2.5 s, INP <=200 ms, CLS <=0.1. No field traffic means no field claim; lack of field p75 alone does not block the first small cohort. |
| Review Replies/Complete launch | Eligible real client/Manager access, Google Basic API approval/nonzero quota, OAuth/domain requirements and controlled discovery/sync/draft/post/cron acceptance. A16 runbook preparation is closed; consume it once actual access exists. No synthetic Business Profile. |
| Reply/commercial policy | Business-shared Reply ceiling/window and public copy, recovery-only grace/notice, downgrade timing/seats/member access, location-switch and new automation choices remain separate unapproved proposals. Do not infer their approval from Booster choices. |
| Destructive account deletion | Shared lifecycle/auth/billing/Google fences are integrated, but controlled provider cancellation/revocation/erasure, portal/concurrency/recovery and operator activation remain. Retention defaults are chosen, not enforcement. Keep deletion disabled until those gates close; assisted requests need a safe timely process. |
| Unknown provider reconciliation | Durable unknown-send/post reservations stay fenced. Controlled authorized provider lookup/permission/payload/UI and operator recovery proof remain before enabling reconciliation. No blind retry or releasing a fence on lease expiry. |
| Lead and legacy cutover | A14 lead module/provider/pricing and A15 actual database/export/customer URL/scheduler cutover are deferred. Keep legacy source/recovery records and disable lead sales. Production cutover requires its separately explicit instruction. |
| Later hardening/improvements | Trusted Types enforcement after observed sinks/provider acceptance; strict inline-style feasibility; Auth.js stable migration when verified available; throughput/onboarding/customer domains and future QR/agency/Local SEO scope. None adds a new broad Booster audit. |

## Closed evidence to consume

- A01 dependencies/advisory remediation and clean release tooling: zero full/production audit findings at accepted source; no temporary advisory exception remains.
- A02–A09 shared tenant/billing/team/Google/intake/sender/draft contracts, UTC Booster accounting, quota reservation/freeze/suppression/claim protections and bounded dashboard access are integrated. Retain unresolved live-provider and changed-target boundaries above.
- A10 signed delivery/suppression and permanent Resend configuration/transport; isolated actual app review/unsubscribe journeys are accepted. Production current alert/Sentry/operator-mail correlation is accepted. No repeat endpoint/mail/support setup session.
- A11 shared lifecycle fences/projections and migrations are integrated; deployment is not destructive activation.
- A13/A20 isolated authenticated owner/member/outsider/mobile/keyboard/persistence/CSP and large-data query checks are accepted. Production owner credentials access and current-account read navigation are accepted, not populated paid-provider or browser CWV proof.
- October 4 privacy checkpoint observation, primary cron/server-instrumentation recovery and natural Vercel Booster/Replies receipts are accepted. Only the distinct natural independent health observation remains.

See [release evidence](./RELEASE_EVIDENCE.md) for exact commits, test scopes, receipts and historical source pointers. Closing these packages does not certify unperformed Stripe/Google operations, field performance, erasure or future expiry.

## Work coordination

A22 permission/retention and A23 measurement preparation can proceed independently; final A23 evidence targets the merged build. Billing verification retains the approved trial contract. A00 handles narrow operational integration and exact deployment review. Cleanup source `b2430e6` passed Quality and Security, including 550 tests, release build and production smoke. The prior `84334c7` font-loader failure is historical; its cause remains unproved, but no failing current build is established. **A21 paid-only checkout is cancelled.**

Use a branch per changed criterion from current reviewed main. Each handoff names its commit, behavior, meaningful verification, migration/environment/rollback changes and evidence limits. Coordinate shared auth/usage/cron/provider files and request an unused migration number from A00; never renumber an applied migration. Keep one reviewed schema history and one primary scheduler. Do not edit the roadmap in competing branches. No ordinary implementation task implies real customer messages, live charges/replies, destructive production cleanup or deployment.

Original historical task documents are available at pre-cleanup commit `84334c7` through `git show 84334c7:docs/tasks/<file>` or the private verified recovery bundle. Necessary branch/uncommitted recovery is consolidated without claiming unfinished code merged. No complete A10/A12/A17/A20 audit is reassigned merely because a provider/input is absent.
