# A09 — review draft policy handoff

Last updated: 2026-10-03

Base: `a513887a2f703974b0afcf23afae5baba255a98e` (A02/A08 integration baseline)

Isolated worktree: `C:\Users\joser\Desktop\Projects\Ornigami-Worktrees\A09-review-draft-policy`

This package implements the client workflow for versioned Review Replies drafts and contributes the route/persistence changes in this worktree. It follows A02 business access and A08's selected Google location and cached review contracts. It does not edit the shared roadmap or deployment configuration.

## Behavior

- **Generate** calls the review-scoped generation route. It saves an `ai_drafted` version and accounts for successful generation against the existing Review Replies allowance. A saved draft, a human edit, or an in-flight generation claim prevents replacement. Generate never calls Google to post.
- **Save draft** stores the current human text with its `expectedVersion`. The page keeps the local text and original base version after refresh when that text is unsaved. A conflict shows that the saved copy changed and offers an explicit action to load the current saved copy; it never adopts a new version while retaining stale text.
- **Approve & post** saves changed human text first, then sends the exact visible text with the returned version and `intent: "manual"`. Posting marks explicit approval and then calls Google. A stale version returns a conflict and keeps the user's edits available for reconciliation.
- Known 4–5-star ratings may auto-post only during supported interactive pending processing when the owner enabled the setting. Unknown and 1–3-star ratings require manual approval. Scheduled processing creates drafts only. Repeated sync/process calls preserve local unsaved edits and the server skips reviews with an existing draft.
- The inbox uses the business ID from shared reply settings and only offers the business's selected location. Members use the business's authorized workflow even when their personal plan does not grant access. Settings controls follow the backend role response; auto-post settings are owner-only.

## API contract used by the client

- `GET /api/settings/reply` returns `businessId`, `role`, `isOwner`, `canManageAutoReply`, shared reply defaults, and `autoReplyAllReviews`.
- `GET /api/reviews?businessId=&loc=` includes `draftReply`, `draftState`, `draftVersion`, and `draftUpdatedAt` on each review row.
- Review-scoped `POST /api/openai/review-reply` accepts `businessId`, `reviewId`, `locationName`, and review context. Success returns `{ ok: true, draft }`. Existing draft/claim conflicts do not replace the saved version.
- `POST /api/reviews/draft` accepts `{ businessId, reviewId, reply, expectedVersion }`; a stale version returns `409` with `currentDraft` so the user can choose to load it.
- Manual `POST /api/google/replies` accepts `{ businessId, reviewId, locationName, reply, intent: "manual", expectedVersion }`. The server verifies the exact current text and version before approving and posting.
- Interactive `POST /api/google/reviews/process-pending` accepts the selected `businessId` and location. Scheduled processing remains draft-only.

Draft states are `new`, `ai_drafted`, `human_edited`, `approved`, and `posted`. Existing untagged saved drafts are conservatively classified as human edits at version 1. The proposed migration and transaction functions are in [A09-draft-schema.sql](./A09-draft-schema.sql), reserved for migration 024. A00 must review and number it before rollout; this worktree does not apply database changes.

## Dependencies and integration notes

- Runtime dependencies: none added.
- Schema: migration 024 proposal adds draft state/version/claims, usage reservations, and transaction functions while retaining prior reply rows. Apply it before deploying route consumers.
- The existing shared usage window and allowance cap remain authoritative; this work changes reservation/commit behavior and does not choose a new period or quota policy.
- A02 business context and A08 selected-location/provider contracts are required. The UI sends the explicit business ID returned by settings where routes accept it.
- Integration follow-up: A13 must update `dashboard-metrics.ts` usage/count queries to count the current sidecar draft per unreplied review, not every historical `review_replies.posted = false` version. The append-only draft history intentionally retains prior versions, so counting all rows overstates pending replies after edits and can continue counting the previous version after posting. Proposed pending-draft count:

  ```sql
  SELECT count(*)
  FROM public.review_reply_draft_state AS d
  JOIN public.reviews AS r
    ON r.id = d.review_id AND r.business_id = d.business_id
  JOIN public.review_replies AS rr
    ON rr.id = d.reply_id
   AND rr.review_id = r.id
   AND rr.business_id = d.business_id
  WHERE d.business_id = $1
    AND d.state IN ('ai_drafted', 'human_edited', 'approved')
    AND rr.posted IS FALSE
    AND lower(COALESCE(r.status, '')) <> 'replied'
    AND r.reply_comment IS NULL;
  ```

  The sidecar primary key gives one current version per review; the join scopes it to the selected business and its exact current reply row. A13 should use equivalent predicates for its other dashboard counts. `usage.ts` has no remaining production callers according to the integration search; remove or leave it only after confirming that search in the final integrated tree. A12 can later integrate these draft and reservation records into budget/health reporting; it is not an A09 runtime dependency.
- Integration follow-up: A11 privacy/export/retention coverage must include `review_reply_draft_state` and `review_reply_usage_reservations`, including retained reply-version history and owner-ledger data.
- No deployment, shared database migration, or real Google provider call was performed. The proposal was applied only in the disposable local PostgreSQL test database described below.

## Validation

- Validation runtime: Node.js 22.23.3; reproduce the standard gates from [.github/workflows/ci.yml](../../.github/workflows/ci.yml) and [.github/workflows/security.yml](../../.github/workflows/security.yml).
- `node scripts/test.mjs` (`npm test`): 193/193 passed, 0 skipped; includes all PostgreSQL 17 suites.
- Security suite: 7/7 passed.
- Next type generation and `tsc --noEmit`: passed.
- Full ESLint: 0 errors and 4 existing navigation warnings; isolated PostgreSQL test ESLint recheck: 0 warnings.
- The A09 streaming cancellation regression covers both client cancellation and a provider iterator whose `return()` teardown rejects; each path releases reserved usage without charging.
- `git diff --check`: passed.
- Production build passed on Node.js 22.23.3 and generated two static CSP hashes.
- Smoke checks passed for static CSP parity, nonce hydration/rotation, protected dashboard, OG image, and anonymous auth/Google/billing boundaries using fixture environment values. No live provider calls were made.
- Migration functions were applied twice only in the disposable local PostgreSQL 17 test database to verify repeatability. No shared migration was applied.
- Linux CI, browser acceptance, and live Google provider acceptance remain unverified.

## Changed files and integration order

- Client workflow: `src/modules/review-replies/` and `src/components/reviews/review-list.tsx`, `src/components/reviews/review-workflow.ts`; A09-specific client tests are `tests/a09-ui-api.test.mts` and `tests/a09-ui-workflow.test.mts`.
- Routes and processing: `src/app/api/reviews/`, `src/app/api/google/`, `src/app/api/openai/review-reply/`, `src/app/api/settings/reply/`, and `src/app/api/cron/review-replies/`; corresponding route/process tests are under `tests/a09-*.test.mts`.
- Persistence proposal and service: `docs/tasks/A09-draft-schema.sql`, `src/lib/review-draft-policy.ts`, `src/lib/review-draft-processing.ts`, and `src/lib/review-reply-server.ts`. Apply reviewed migration 024 before enabling route consumers. Keep the SQL proposal outside the migration runner until A00 numbers and approves it.
- Integration sequence: review and number schema migration 024; complete A13 dashboard-count changes, A11 privacy/export/retention handling, and a safe recovery policy for uncertain post outcomes; apply the reviewed migration in the target environment; then deploy route consumers and client together and validate manual and eligible interactive posting with the approved Google test account. A12 budget/health reporting can follow.

## Open integration decisions

- Current usage-window and owner-shared auto-reply preference behavior is preserved. A18 should decide future policy for monthly boundaries, workspace-vs-owner billing periods, and whether automation preferences should remain owner-shared or become per-business.
- Run migration/function checks against PostgreSQL 17 and the exact Node 22 production test gates in the integrated checkout.
- Verify manual and eligible interactive posting against an approved Google test account. This branch only validates local/mock behavior.
- An uncertain Google post outcome (timeout, 5xx, or local persistence failure after Google may have accepted the reply) deliberately leaves the posting fence held to prevent duplicate publication. There is no UI reconciliation or administrative fence-release path in this scope; define and implement a safe reconciliation procedure before operating this case.
- Optional A12 operational follow-up: review the existing missing Sentry `global-error` boundary and deprecated client config warning found during build review.
# A00 integration addendum — 2026-10-03

The schema proposal is promoted to canonical `neon/migrations/024_review_draft_policy.sql`; persistence tests apply the numbered file, including idempotent replay. Automatic posting locks the business-agent row before the owner profile, matching A03 billing reconciliation. Mutation routes enforce same-origin browser requests before paid generation, draft writes, automation opt-in or provider posting. Dashboard counts use the one current actionable draft rather than historical unposted versions. A11 workspace exports include safe draft/reservation projections without fences, actor identifiers or request tokens.

The existing owner-profile billing-period/2,000 generation protection remains in force. A06's UTC quota contract applies to Booster sends; it does not approve a new Reply ceiling. Ambiguous Google post outcomes remain fenced for authoritative reconciliation and A13 recovery UI; elapsed time alone must never authorize another post.
