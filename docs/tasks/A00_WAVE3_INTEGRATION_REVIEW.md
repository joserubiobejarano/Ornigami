# A06 / A09 / A11 integration review — 2026-10-03

Reviewed A06 `8bd991d`, A09 `70ad8dd` and A11 `3ed841f`, their handoffs and their combined behavior on main `a513887`. Three Luna reviews were followed by A00 source review and cross-package corrections. Original commits remain in the integration branch ancestry.

## Corrections and contracts

- A06: connect reserved monthly usage and unknown/deferred results to dashboard/cron reporting; distinguish quota waiting from delivery failure; show UTC reset and seven-day expiry; keep manual Run available for deferred-only queues; label durable statuses; reject unsafe external email links without changing frozen provider payloads or keys.
- A09: promote the proposal to canonical migration 024; align automatic-post business-agent/profile lock order with A03; protect browser mutations from same-site sibling-origin forgery; count one current saved draft and exclude historical, posted and in-flight versions. The actual PostgreSQL claim and dashboard SQL are exercised by integration tests.
- A11: include safe Booster delivery/monthly-baseline and Reply draft/reservation metadata in canonical-owner workspace exports; preserve histories during routine retention. Tests populate private payload/key/fence/error/provider values and verify they never enter the export.

Reply generation keeps the existing owner-profile billing-period/2,000 protection. No proposed UTC Reply quota or new scheduled-posting policy is approved by this merge. Scheduled processing drafts only; human-edited, low and unknown-rating replies require deliberate approval of exact saved text/version.

## A11 remains disabled

Migration 026 and exports are foundation work. Production preflight confirms `PRIVACY_ACCOUNT_DELETION_ENABLED` is not true. The disabled route returns 503 before auth, user freeze, database mutation or provider calls. Do not enable it until E03 is complete:

1. Apply shared business/auth/billing/team/Google/job exclusion and bounded drains. Integrate billing provider-call leases into existing create paths and restrict frozen sessions to working deletion recovery UI.
2. Fence Google reconnection and token writers; finalization must verify the relevant grant is absent or the revoked generation is unchanged.
3. Define and implement Stripe customer-data erasure/scrubbing after billing is conclusively drained, or obtain an explicit lawful retention scope and accurate user-facing notice.
4. Guard verification/reset request and token-consumption writes while frozen.
5. Approve purpose and purge period for UUID-linked trial-owner and deletion-operation history.

These are required activation blockers, recorded in the single roadmap and A11 handoffs. Neither helper tests nor the default-closed foundation establishes working production account erasure.

## Validation and rollout

Use Node 22 clean installation, full test discovery including disposable PostgreSQL, lint/typegen/TypeScript, audit and fixture production build/smoke. Validate exact Linux quality/security CI before advancing main. No regression test uses a production database or sends customer emails, charges cards or posts Google replies.

A00 local validation passed all 250 discovered tests, including fresh numeric-order schema application, migration replay, concurrent claims/saves, the billing/post lock-order regression, actual dashboard SQL, and private owner/member export projections. Lint has zero errors and four existing navigation warnings; typegen/TypeScript, production audit (zero findings), the fixture webpack build and CSP/auth/Google/billing production smoke pass. The final deferred-only Run UI correction also passes its focused rendered-page regression. Exact candidate Linux CI remains the final pre-merge gate; target deployment and CLI receipts must be verified separately.

Production preflight used fresh Vercel environment configuration and PostgreSQL CLI with credentials passed through environment, without logging secrets. Verified database identity matches the previous release; counts were eight users/eight businesses/eight memberships, zero Google connections/reviews, one historical sent visit/message and zero current-UTC-month sent messages. Deletion is disabled. Review migrations 022/024/026 transactionally before consumer deployment; retain existing 019/020/021/031/032 and unused reservations without renumbering.

For sender cutover, disable the GitHub Booster scheduler temporarily, drain existing runs, recheck eligible/historical data, apply the ledger migration, deploy the exact tested consumer commit and restore the scheduler only after Ready verification. A provider acceptance lost by the legacy runner cannot be reconstructed merely by seeding local rows. Unknown new outcomes retain payload/key/quota and stop replay after the conservative 23-hour boundary; authoritative reconciliation belongs to A10/A17. Unknown Google posts retain their fence; never clear it solely on TTL expiry.

The owner explicitly approved the A06 policy in the A06 chat on 2026-10-03 (2026-10-02 23:09:49 UTC): full UTC calendar-month Booster quotas of 500/1,500, independent of annual invoices, no proration/rollover, usage preserved through trial conversion/upgrades, accepted sends consuming quota, unknown outcomes retaining reservations, and exhaustion deferring only within the existing seven-day eligibility window. This approval applies to Booster; the proposed UTC Reply ceiling and other new policies remain unapproved. The review branch is a concrete integration candidate; this document alone is not evidence that production migrations or deployment have completed.

## Next work

A07 intake and A12 operations can start from the merged contracts. A11 needs a coordinated activation follow-up; E03 remains a launch blocker. A13 follows A07 and handles shared dashboard/usage/approval/recovery UI; A10 follows A07 for signed delivery events and authoritative reconciliation. A15 inventory, A16 Google approval preparation, A17 acceptance design and A19 CSP assessment remain independent. Keep work in separate branches and coordinate shared-file ownership in the roadmap.
