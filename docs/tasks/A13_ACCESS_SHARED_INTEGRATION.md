# A13 dashboard access integration proposal

This proposal records the dashboard access changes and the shared routing decision needed before the disconnected recovery view can be reached. It does not modify the shared roadmap, proxy, or deployment configuration.

## Implemented in the A13 worktree

- `src/lib/dashboard-access.ts` resolves the authenticated actor through `resolveBusinessForSessionUserStrict` and reads Review Replies entitlement with `getBusinessPlanInfo` for the canonical workspace. Members inherit the owner's paid agent access while actor and owner lifecycle freezes continue to deny access.
- The Review Replies overview and legacy `/reviews` and agent layouts use that shared resolver rather than personal plan lookups. Failed context/entitlement checks render an error or fail closed instead of offering subscription actions.
- Dashboard billing navigation, demo trial action, no-active-plan trial action, activation controls, and inactive Review Replies placeholders are owner-only. A member receives an instruction to ask the owner to activate the agent.
- The overview reads Google connection status from `integrationOwnerUserId`. A disconnected owner can start reconnect; a disconnected member sees owner-directed recovery guidance.
- Dashboard summary reviews use `businessId`; Google locations count only the business's selected location whose owner, connected flag, and OAuth generation still match. Projects remain actor-scoped for legacy compatibility. The former global `public.leads` count was removed; the deprecated audit metric is zeroed instead of leaking another tenant's rows.
- Dashboard review/reply aggregates are independent and run concurrently. Follow-up count is explicitly named and business-scoped. A follow-up query failure keeps the review metrics and exposes an error state.

## Shared integration needed

The current shared `src/lib/disconnected-access-policy.ts` classifies `/reviews` and `/dashboard/agents/review-replies` as Google-dependent paths. `src/proxy.ts` redirects paid users without a Google connection to `/connect`; if access resolution throws, it also redirects those same paths. That intercepts the new disconnected overview and its warning/error UI before the page can render.

Integration should adjust the shared policy so the Review Replies overview and inbox may render in a disconnected state for an authorized workspace. Keep owner connection/settings routes and all provider mutation routes protected by their current canonical owner, entitlement, lifecycle-freeze, and Google-connection checks. Access-resolution errors on the overview should reach a safe error boundary or error callout rather than being reported as a Google connection problem. The A13 page itself does not weaken API authorization.

The resolution-error behavior is a product/security integration choice: allowing an inbox shell after a transient database failure is useful for recovery messaging, while any inbox data must still come only from an independently authorized route. The shared session/business resolver should also continue to attribute connection state to the canonical owner for members.

## Models, routes, settings, and dependencies

- No new model, migration, package, environment setting, or deployment setting is required by the access changes.
- The summary route uses the already integrated selected-location contract from migration 031 (`business_google_locations` and `connection_version`). Apply the existing reviewed migrations as required by the deployment checklist before integrating consumers.
- The shared proxy policy is the only integration change requested by this proposal. It belongs to A02/shared integration ownership and was left untouched in this A13 worktree.

## Evidence and remaining work

- `tests/a13-dashboard-access.test.mts`: owner/member entitlement, frozen denial without personal-plan fallback, shared member metrics, actor-scoped projects, no unscoped leads count, partial stats error, selected live location scoping, and disconnected member guidance.
- `tests/a09-persistence-postgres.test.mts`: existing draft aggregate integration check, with a minimal `followup_visits` fixture added for the A13 follow-up statistic.
- Node 22 focused run: **7/7 passed** across those two files. TypeScript `tsc --noEmit` passed before the latest small comment/fallback edits and is being rerun for final evidence.
- The disconnected browser page remains unreachable until the shared proxy policy is integrated. No production data, OAuth provider, or deployment was used.
