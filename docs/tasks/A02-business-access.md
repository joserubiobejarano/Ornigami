# A02 — Business access handoff

Branch: `fix/business-access`. Baseline: `ff4d9b2` (`chore/unified-workspace`).
Isolated checkout: `Ornigami-A02-business-access`.
Scope: roadmap A02 / E08. No roadmap, deployment configuration, provider state, environment credentials, or production database changes.

## Implemented contract

- `resolveBusinessContext(actorUserId, businessId?)` is read-only and requires a persisted canonical UUID actor plus ownership/membership. Explicit unauthorized workspace selection returns null and never falls back. Without a selection, all shared lookups select the earliest accessible business by `created_at, id`.
- `BusinessContext` keeps `actorUserId` distinct from `businessId`, `business`, `role` and canonical `ownerUserId`. `billingOwnerUserId`, `integrationOwnerUserId`, `replyPolicyOwnerUserId` and `usageOwnerUserId` currently map to that business owner. Membership authorizes participation; `businesses.owner_user_id` is ownership authority.
- `requireBusinessContext`, `assertBusinessOwner` and `requireBusinessOwner` reject unauthorized access with typed 401/403 errors. `safeApiErrorResponse` understands those errors. The active-agent wrapper adds `businessContext` while preserving `session` and `business`. `requireActiveAgentBusinessContext` is available for new route consumers; legacy `requireActiveAgentAccess` still returns a business row.
- Agent-access checks ignore compatibility email arguments. First-login business creation remains allowed only through a persisted UUID user. They never recreate identities from email. Other legacy auth/layout paths still require A04/A11 migration.
- `getBusinessPlanInfo(context, agentId)` reads the selected business's agent record, never the actor's personal subscription. Active/trialing and the existing seven-day past-due grace determine access. Canceled/inactive/expired records return effective `planId: free`; `storedPlanId`, `billingPeriod` and period metadata remain available for billing display. Personal `getUserPlanInfo` semantics remain unchanged.
- Business resolution seeds only the canonical owner's membership and avoids teammate-triggered placeholder-name writes.
- Middleware uses the selected integration owner's Google row. Only entitled Google-dependent Replies pages need Google. Billing, dashboard, team, settings, email-only Booster, Replies settings and connection recovery remain reachable while disconnected. Inactive users reach activation UI. Google-workflow state lookup errors redirect to connect; recovery pages avoid redirect loops. Auth, nonce/CSP and demo protection remain intact; no development-bypass flag is needed.
- `getBusinessReplyDefaults(actorUserId, businessId)` reads shared owner settings after membership validation. The personal reader remains available.
- The explicit paired APIs `checkBusinessReviewReplyUsage(actorUserId, businessId)` and `incrementBusinessReviewReplyUsage(actorUserId, businessId)` resolve the same shared counter owner. Unauthorized/missing-selection checks and missing owner profiles fail closed; unauthorized increments throw 403. The legacy `checkReviewReplyUsage` / `incrementReviewReplyUsage` pair keeps supplied-user ownership until consumers migrate both calls together, preventing workspace inference from charging a different owner.

## Required integration changes

These consumers belong to other work packages. They must adopt the contracts before claiming the Complete-member end-to-end workflow is fixed.

| Owner | Required adoption |
| --- | --- |
| A03 billing | Require canonical owner at checkout/change-plan/portal; use billing owner customer mapping. Hide member billing mutation controls. Serialize checkout and reconcile webhook state separately. |
| A05 team | Replace stored membership-role authority in `getTeamContext` with canonical context role. Audit historical noncanonical owner membership rows before deciding repair. |
| A08 Google | OAuth start/callback, connection/status, location/review/reply and disconnect must use `integrationOwnerUserId` from the same selected context. Require owner for connect/disconnect/location selection unless delegated permission is approved. Preserve actor for audit and verify business/location/review ownership before provider calls. The connection row indicates stored OAuth state, not provider-token validity. |
| A09 Replies | Use shared defaults in settings GET, pending processing, OpenAI generation and cron. Settings PUT must require owner and write owner settings. Migrate the legacy usage pair to `checkBusinessReviewReplyUsage` / `incrementBusinessReviewReplyUsage` together with the same actor and explicit business ID, including trusted cron jobs. Do not mix legacy and business-scoped operations. Draft/post automation policy remains A09-owned. |
| A00/A13 UI | Adopt business plan in `/api/user/plan`, `src/components/dashboard/review-replies-dashboard-page.tsx` and billing display. Avoid switching `getUserPlanInfo` globally because personal consumers have different semantics. |
| A04/A11 identity/privacy | Migrate remaining email fallbacks in layouts/auth; use actor for personal deletion and canonical owner for workspace/provider cleanup. |

Routes and provider clients were not rewritten in A02. Current callers using only personal plan/defaults/Google APIs still need these adapters. Do not use a shared owner ID as a replacement session identity.

## Usage-window ownership and unresolved decisions

A02 preserves the existing billing-period reset algorithm: owner profile counters reset when the selected `business_agents.current_period_start` changes, with existing annual/monthly derivation fallbacks and the 2,000 internal Replies safety ceiling. A06 owns monthly windows independent of annual Stripe billing, period boundaries, and atomic reservation/accounting; A02 does not resolve E06 or concurrency.

Reply policy/counters and Google connections are still stored by owner identity. Multiple businesses owned by one user therefore share those records; per-business/location persistence and workspace selection UI require an integration/product decision. No migration is necessary for this compatibility contract; reservation 018 is unused. Existing first-login business creation still has a concurrent creation race; A00 must decide provisioning serialization and multi-business policy before imposing owner uniqueness. Decide whether members may edit tone/contact settings or enable auto-post, and whether to repair historical owner-role rows after read-only audit. Until delegated permissions are explicit, shared sensitive changes use the owner guard.

## Test evidence

Run from the isolated checkout:

```powershell
node --experimental-strip-types --test tests/a02-business-context.test.mts tests/a02-disconnected-access.test.mts tests/a02-shared-policy-usage.test.mts
npm test
npm run test:security
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
git diff --check
```

Final validation on 2026-10-02 (Windows, Node 24.11.1): 21 A02 behavioral tests, 16 existing tests and 7 security tests passed (44 total). TypeScript, repository lint and Git whitespace checks passed. The first sandboxed test-runner attempt failed with `spawn EPERM`; the identical command passed after approval to run Node child processes outside the sandbox. No provider calls were made. Focused tests execute production context, business bootstrap, plan, authorization, usage/settings, access lookup and proxy code with mocked database/Auth edges. They cover canonical ownership/member denial, cross-business selection, deleted actor behavior, expired entitlement, shared owner attribution/reset, disconnected navigation, failure recovery, CSP nonce and demo safeguards. They do not execute SQL on Postgres or establish provider authorization.

Dependencies: no package/lockfile, schema, environment or deployment change. Existing TypeScript devDependency supports the test loader. A17/A00 must add the uniquely named A02 tests to shared discovery/CI; existing npm scripts remain unchanged. Provider acceptance, Linux/Node 22 release build and invited-member end-to-end acceptance remain with integration/A01/A17/A08. No live billing/messages/replies or deployment were performed.

## Rollback

Revert A02 source and test changes together. Once consumers adopt explicit context/owner mapping, revert their paired reads/writes with the corresponding helper contract to avoid mismatched accounting. There is no schema migration or provider-state rollback.
