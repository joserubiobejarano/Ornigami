# A18 integration handoff

Branch: docs/product-contracts. Baseline: ff4d9b2. Integration owner: A00.

## Result and decision status

Five task-specific documents define reputation billing/usage, retained legacy behavior, disabled future lead scope, and shared implementation handoffs. New policies are **proposed pending owner approval**, with observed behavior separately recorded. No policy was approved merely because an optional question went unanswered.

Existing EUR prices, 14-day/no-card trial entry, and reputation-only Complete remain unchanged. Rebooking/sender fields are retained compatibility requirements, currently not working end to end; no feature is silently retired. QR and broader agency work are explicitly deferred. Speed to Lead stays disabled and unpriced.

Owner choices remaining:

- UTC calendar/full-month quotas, no rollover, cross-midnight reservation ownership, and business-shared Reply safety accounting.
- One 14-day trial per business **and billing owner**; historical eligibility/retention exceptions. Trial preference was requested; no answer is recorded.
- Recovery-only payment policy, notice clock, scheduled downgrade timing, seats, and member read access after lapse/downgrade.
- Shared selected location and captured-versus-held existing visit destinations after a switch.
- Scheduled drafts-only versus separately approved scheduled posting; explicit high-rating opt-in and mandatory low/unknown-rating human approval.
- Lead packaging/price/billable event/included units/trial/provider costs/spend limits/countries/channels. No approved lead offer was supplied.
- Local SEO/free-audit prominence and project API support/retirement after inventory; exact URL allowlist and legacy customer reliance.

Do not finalize affected behavior against an unapproved proposal. The linked specifications provide deterministic recommendations rather than leaving technical semantics implicit.

## Submitted shared-change proposals

This table is the reviewable submission to integration. Shared files are not edited by A18.

| Owner | Models/routes/settings/copy to integrate |
| --- | --- |
| A02 | Shared actor/business/owner context and entitlement/usage ownership. Coordinate stable selected-location identity and durable trial identity with A03/A08. |
| A03 | Stripe checkout/change-plan/portal/webhook: owner-only customer mapping, trial history consumed at authoritative trial start, retry-safe checkout, approved grace and downgrade effective dates. |
| A05 | Team membership/invitation atomic reservations, owner revoke/remove, downgraded member access; enforce three total Complete seats including owner/pending invites. |
| A06 | Business/agent UTC usage window/reservation model, stable provider idempotency and acceptance reconciliation, deferred/expired quota state, suppression/timing rechecks. No annual-sized monthly window. |
| A07 | Existing Booster settings POST omission-preserving updates for rebooking_url/email_from_name; separate URL validation, same-email optional booking CTA, visibly non-sendable phone-only visits, authenticated/deduplicated generic booking intake. |
| A08 | Google resource selection/persistence and business ownership; only the selected location in sync/reply/derived-link workflows, invalid selection fails without fallback. |
| A09 | Draft state/version preservation, one approval policy across UI/manual/cron, business-shared generation accounting, no charge/overwrite on repeated human drafts. |
| A10 | Accepted/delivered/failed event semantics and suppression; sender display name distinct from verified address/domain. Customer-owned domains remain future scope. |
| A11 | Trial-history privacy retention; complete export/deletion/retention for new delivery/lead/consent data; proposed Twilio processor/vendor disclosures before use. |
| A13 | Pricing FAQ continuation conflict, seven-day quota-deferred expiry, selected-location copy, accepted-versus-delivered status, click-versus-conversion claims, retained settings guidance, Local SEO and coming-soon promises. |
| A14 | Disabled lead module/routes, canonical business/user foreign keys, stl_* domain schema, explicit internal-admin authority, provider callback security and approved future offer only. |
| A15 | Legacy customer/deployment/database/embed/callback/job inventory, old-ID mappings, settings/send/suppression preservation, compatibility/deprecation plan and rollback. No cloud retirement authorized. |
| A01 | Review any future Twilio/runtime dependency and lockfile change. A18 adds no dependency and does not modify shared manifests. |
| A17 | Route/service and controlled provider acceptance for approved billing, quota, trials, seats, location, approval, legacy, and lead behavior. |

No migration or environment variable is added by this branch. A00 allocates exact schema changes/migration numbers with package owners. Independent analysis does not mean dependent implementations have merged.

## Validation evidence

On Windows, Node v24.11.1 and npm 11.6.2, in the isolated A18 worktree:

| Check | Result |
| --- | --- |
| npm test | 16/16 passed |
| npm run test:security | 7/7 passed |
| Local Markdown links/source references | 50 links passed; table structure and UTF-8 passed |
| Git whitespace and changed-file scope | Staged diff passed; exactly five docs/product-contracts files, shared files unchanged |

Initial suite runs stopped because the fresh worktree lacked zod. With scoped permission, the existing zod 4.1.12 package was copied into this worktree's ignored node_modules. Both suites then passed. No full install, lockfile change, shared dependency directory mutation, or secret copy was needed.

Existing suites validate baseline utilities/policies. They do **not** prove proposed quota/trial/rebooking/lead policies have been implemented. The acceptance scenarios in the specs are handoffs for those implementations; no new implementation-mirroring tests were added for these reversible document changes.

Lint, typecheck, build, Node 22/Linux, live provider tests, and end-to-end acceptance were not run for this documentation-only diff. The baseline test runner emitted its existing MODULE_TYPELESS_PACKAGE_JSON warning. No production readiness claim is made.

## Review and integration

Review [billing/usage](BILLING_AND_USAGE.md), [legacy/deferred](LEGACY_AND_DEFERRED.md), [lead scope](SPEED_TO_LEAD.md), and [reply-policy recommendation](README.md). Integration may cherry-pick the final scoped commit or review the branch against ff4d9b2; this session does not merge it. Reverse the documentation commit to roll back; no data migration is involved.

ROADMAP.md, shared deployment configuration, runtime files, preserved source, other worktrees, and main are outside this change. No push, merge, deployment, provider message, charge, database mutation, or external retirement was performed. The integration session decides approval, shared roadmap reconciliation, merging, and later release steps.
