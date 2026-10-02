# A08 — Google integration handoff

Last updated: 2026-10-03

Branch: `fix/google-integration`

Baseline: `0f8433f`

Isolated worktree: `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A08-google-integration`

This work addresses Roadmap E07 and adopts A02's business context. Google credentials remain encrypted and owner-keyed in `gbp_connections`; discovered locations remain cached by owner in `gbp_locations`. Route access resolves an authorized business context and uses its `integrationOwnerUserId`. A member does not need a personal Google connection or personal plan. Provider changes require the selected business's A02 entitlement for `review_replies` or `review_booster`, including its existing past-due grace behavior.

Owners can connect, disconnect, and choose a location. Members can view the selected location and sync its shared authorized workflow. Owners can view all their cached discoveries while choosing a business location. Explicit `businessId` query/body selections are validated and never fall back; when omitted, A02's deterministic accessible-business default applies. Query and body values that conflict are rejected.

OAuth state is signed, expires after ten minutes, and binds actor, business, and integration owner. The callback compares the state cookie, resolves current access and owner role again before exchanging the code, then revalidates access and entitlement before saving credentials. A successful reconnect invalidates the prior owner's location cache before storing new credentials. Disconnect deletes the shared connection and invalidates the owner's cached locations in one SQL statement. Disconnect affects every business owned by that user and does not call Google's remote revocation endpoint.

Cached location selection is per business. Discovery never inserts a selection. The owner-only selection endpoint validates the owner's local location, performs a live Google discovery check, and writes the mapping only after both checks pass. Repeating the current selection is idempotent. Choosing a different location returns `409`; no switching policy is inferred. A disconnected or stale cache location is not usable until a complete discovery sees it again.

The unnumbered DDL proposal is [A08-selected-location-schema.sql](./A08-selected-location-schema.sql). A00 must review, assign the migration number, decide legacy backfill behavior, and install the selection table and connection-generation columns before selected-location flows can run. A08 did not add or apply a numbered migration or shared TypeScript model. Routes fail closed with generic `503` responses when the proposal's schema is unavailable. It has not been applied to staging or production.

OAuth credential replacement rotates `gbp_connections.connection_version`; token refresh preserves it. Refresh persistence compares the original token snapshot and version before updating, so a slow refresh cannot overwrite a newer OAuth connection or another refresh. Each cached location records the version used for its discovery. Reads, selection writes, and cron joins require a cache row to match the owner's current version. Sync captures the version before provider calls, checks it again after discovery, and writes only while the same version remains current. The owner selection route rechecks the generation after live provider verification and conditions its mapping write on the captured version. Existing cache rows have a NULL version and remain unavailable until fresh discovery validates them. These checks prevent a delayed account-X discovery from becoming usable after reconnect to account Y.

Refresh coalescing remains process-local; compare-and-set token persistence protects correctness across workers, although duplicate refresh calls may still occur.

## Cross-package handoff

- **A00** must approve and number/install the selection schema and connection-generation columns, and choose any legacy location backfill policy.
- **A07** must scope Review Booster's selected review URL and member/owner behavior. A08 preserves provider `metadata.newReviewUri` in cached raw metadata and does not overwrite the manually configured `businesses.google_review_url`.
- **A09** still owns `process-pending`, reply settings, shared usage accounting, draft preservation, and automatic-post policy. The current cron path consumes selected locations but retains its existing draft/usage behavior pending A09's paired migration; see the [A08 review-sync handoff](./A08-google-review-sync-handoff.md).
- [A08 canonical resource/backfill proposal](./A08-canonical-resource-backfill.sql) records review resource reconciliation for A00.
- **A13** must add the owner location-selection UI and include business IDs when a user explicitly changes workspace. Existing callers may omit the ID and receive A02's deterministic default.
- **A11** owns privacy cleanup and any actual Google token revocation. Local disconnect removes the encrypted credential and invalidates all of that owner's cached locations; Google-side consent is unchanged.
- **A16** still owns Google API approval, quota, account eligibility, registered callbacks, and controlled real-provider acceptance. No real Google credentials or provider calls were used for this implementation.

No package dependencies, environment variables, deployment settings, roadmap files, or numbered migrations were added by A08. The existing A02 `BusinessContext`, encrypted token columns, Google OAuth configuration, and proposed SQL schema are integration dependencies.

## Validation

Root integration checks confirmed on Node `22.23.3` and PostgreSQL `17`: generated types, `tsc`, production build with fixture environment values, smoke checks for anonymous auth, Google and billing boundaries, protected-dashboard access, nonce hydration, rotation, static CSP hashes, and OpenGraph, plus security checks (`7/7`) passed. Lint completed with zero errors and four pre-existing UI warnings. The full repository test run passed `111/111` with `0` skipped and `0` cancelled; A08 added 48 tests compared with the baseline's 63. The isolated ownership suite passes `19/19`; it covers owner/member visibility, OAuth state and callback checks, disconnect/reconnect invalidation, generation races, provider-error sanitization, and no-auto-switch selection.

The client and PostgreSQL suites cover encrypted credentials, refresh compare-and-set, timeout/retry handling, provider pagination, owner/member selected-location privacy, production-shaped batch persistence, schema constraints, competing selections, and dry-run backfill. The native PostgreSQL test supports the existing CI `A04_PG_BIN` override/fallback. Linux CI has not run locally and remains an integration gate.

All validation used local fixtures and a disposable PostgreSQL database; no real Google credentials or calls were used. This handoff does not claim deployment or real-provider acceptance.

## A00 integration resolution — 2026-10-03

A00 promotes the reviewed schema to [migration 031](../../neon/migrations/031_google_location_selection.sql), with replay-safe table/index creation and no automatic selection/backfill. A08 PostgreSQL tests exercise that canonical migration twice. Production preflight contains no Google connections/cache/reviews, so no legacy remapping is required. A00 adds minimum owner selection controls in Replies settings and hides owner actions from members; full explicit-workspace UI remains A13. Selected review/post requests pin the OAuth generation, including refresh/retry. Same-browser disconnect clears pending OAuth state; cross-device pending-consent revocation remains A11 lifecycle work.

Scheduled drafting keeps the baseline active/trialing predicate; interactive workflows retain existing A02 past-due grace. A09/A18 must reconcile this difference under an approved policy rather than expanding sends/drafting implicitly. Reconnecting the same selected location is recoverable through rediscovery. Reconnecting to a different location remains blocked: A13/A11 must implement an owner-confirmed, audited recovery/switch contract after A18 policy approval, without resetting trial or usage histories. Do not clear selections or grant location switches as an incidental reconnect side effect.
