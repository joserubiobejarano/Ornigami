# A13 UI shared integration notes

This note covers the A13 dashboard UI changes only. It does not amend `ROADMAP.md`, shared deployment settings, or package dependencies.

## Shared contracts the UI consumes

- Reviews pagination: `GET /api/reviews?loc=<location>&businessId=<workspace>&limit=50&cursor=<opaque>` preserves existing `items`, `businessId`, and `locationName` fields and adds `page: { nextCursor: string | null, hasMore: boolean }`. Cursor scope is the canonical business and selected Google location; the UI resets cursor history when either changes and commits page state only after a successful response.
- Booster visits pagination: `GET /api/review-booster/visits?businessId=<workspace>&limit=50&cursor=<opaque>` returns `{ items, page: { nextCursor, hasMore }, businessId }`. SSR uses `getRecentVisitsPage` for the first bounded page; the UI requests subsequent pages from this endpoint.
- Review recovery projection: each review includes `postRecoveryStatus: "posting" | "reconciliation_required" | null` from the durable posting fence/lease and `draftState: "posted"` after a confirmed successful post. The UI treats this read projection as authoritative, provides a GET-only refresh, and blocks editing/generation/save/post while a retained fence is present.
- Workspace access: the Booster route consumes `getDashboardAgentAccess(session.user.id, "review_booster")` to resolve the canonical business and member/owner entitlement. The dashboard UI expects this helper to fail closed for unavailable/frozen access and member activation affordances to remain owner-only.

## Integration dependencies and decisions

- Apply the backend-owned pagination migration and route/service changes together; cursor UI depends on those additive page response shapes and stable business-scoped cursors.
- Keep proxy/disconnected-access policy coordinated with the access owner. If paid disconnected Reply routes are redirected before rendering, members cannot see the inbox recovery state; provider connection mutations must remain owner-only.
- No authoritative Google readback/operator reconciliation endpoint is currently available for expired review-post fences. Until one is designed, refreshing saved status is the only UI recovery action. Do not clear a fence or offer a retry/repost based on client state.
- No new package or shared configuration change is required by the UI. The `Review` type adds the nullable read-only `postRecoveryStatus`; the pagination types describe the additive page envelope.

## UI-owned implementation

The bounded review-page/draft cache and cursor state live in `src/modules/review-replies/hooks/use-review-inbox-data.ts`; inbox controls and recovery affordances are in `src/modules/review-replies/pages/reviews-page.tsx` and `src/components/reviews/review-list.tsx`. Booster page controls and retry guidance are in `src/modules/review-booster/components/recent-visits-table.tsx`, rendered by the dashboard route. The connection page is role-aware and fails closed while permission state loads or errors. Route-level `loading.tsx` and `error.tsx` provide bounded retry/recovery presentation without triggering provider actions.

Focused interaction coverage is in `tests/a13-ui-pagination.test.mts`: dirty draft text/version survives page changes, failed page fetch preserves the visible page/cursor for retry, and a delayed response from an old location cannot replace the current location. The integration owner should run combined typecheck/lint/full-suite/build and record final browser evidence after shared route/access changes settle.

## Additional recovery verification

`tests/a13-ui-recovery.test.mts` exercises the production manual-post service: malformed and `{ ok: false }` HTTP 200 responses, network failure, 409 with the current draft, and explicit `{ ok: true }` success. Each case asserts one request only, so uncertain results are never automatically resent. A production-page callback harness also starts a pending save, switches the rendered inbox location, resolves the old operation, and verifies it performs no visible review/draft writes in the new scope. Node 22 focused run: 3/3 passed. The earlier pagination hook interactions remain 3/3 passed; the Booster quota/table regression test passes 3/3.
