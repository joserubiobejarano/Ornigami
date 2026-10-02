# A01 / A02 / A04 / A18 integration review

Date: 2026-10-02. A00 independently reviewed four requested commits and their handoffs, delegated read-only second opinions to Luna agents, and reviewed their findings and the subsequent fixes again. Integration was assembled in the isolated `review/a01-a02-a04-a18` worktree before main was changed.

| Package | Reviewed commit | Decision |
| --- | --- | --- |
| A01 | `8af0858` | Accept patched/aligned dependencies, committed webpack pipeline and anonymous production smoke. Signed-in/provider acceptance remains A17; static CSP hash parity is not a claim that runtime consumes that manifest. |
| A02 | `e105177` | Accept shared context foundation and disconnected navigation after fixing zero-row owner-profile increments. Route/UI/provider adoption remains explicitly incomplete. |
| A04 | `dfe092e` | Accept verification/recovery, bounded public writes, atomic token consumption and live user/version JWT validation after completing its shared-layout handoff and applying migration 020. |
| A18 | `57f3dcd` | Accept proposal documents, with an integration clarification about A02 consumer adoption and selected-location limits. This is documentation acceptance, not owner approval of new commercial/automation policy. |

## Review corrections and integration work

- `incrementBusinessReviewReplyUsage` now requires `UPDATE ... RETURNING id` to produce a row, otherwise throws a typed 403. The behavioral test verifies denial with a missing profile and successful owner-attributed increment. The Luna reviewer checked this fix and the merged auth/deleted-user paths again.
- Recovery pages are included in `LayoutFrame`'s app-route classification, exactly as requested by A04. They no longer use the marketing header/footer whose auth links can lose their callback.
- `npm test` explicitly discovers all `tests/*.test.mts` using a cross-platform Node runner. CI locates PostgreSQL binaries through `pg_config --bindir`, so the real SQL suite runs rather than being silently omitted. Its loopback cluster contains fixtures and never uses the live database.
- The Neon migration map and deployment checklist now include 020 without renumbering reserved, unauthored 018/019. Preserved legacy schemas are not replayed.

## Combined validation

Clean install on official Node 22.23.3, Windows x64; no dotenv files in the integration worktree. Build/smoke use dummy CI settings. All 63 discovered tests pass with zero skips, including actual PostgreSQL token/reset/registration/rate-limit concurrency and Auth.js Core stale-session cookie removal. Lint has zero errors and four pre-existing UI navigation warnings. Type generation and TypeScript pass. Full and production-only dependency audits show zero findings. Committed webpack build, generation of two static CSP hashes, and production smoke pass. Local Markdown references and Git whitespace are checked before integration.

Target Ubuntu/Node 22 quality/security CI is a required gate before main is advanced. Local evidence does not assert Linux CI passed. No test sends real email, posts Google replies, changes passwords in production, charges cards, or exercises live authenticated providers. Public production acceptance remains separate.

## Required production migration

Migration `020_account_recovery.sql` was applied with PostgreSQL 17 `psql`, `ON_ERROR_STOP`, a single transaction, and local lock/statement timeouts. Target credentials were read privately from Vercel's production configuration for `locallift`; no credentials are committed or printed. The initial pooler connection rejected a startup timeout parameter before SQL ran; the successful retry used the direct connection to the same verified Neon database.

Migration SHA-256: `a0c3d5f80497f838d4995ff251764480393fd858987b68e049d2035246d93583`. Completion: `2026-10-02T18:25:47.783Z`.

Postflight confirmed the non-null/default-zero integer `users.auth_version`, verification callback column, password-reset table, expiry index, and its primary/unique/cascading foreign-key constraints. The eight existing users were preserved and versions initialized to zero. Preflight found no missing profiles or case-folded duplicate email groups; that observation is not a durable case-insensitive identity constraint. A private execution receipt is retained with the consolidation backup.

A01/A02/A18 need no migrations. Reservation 018 is unused; A03's 019 is not authored. Other deployments/databases must verify their own schema before using the new auth code. Retain the additive migration on rollback. Reverting to auth code that ignores `auth_version` can revive invalidated sessions, so an auth rollback needs a deliberate session-invalidation plan. Existing old JWTs lacking a version require fresh sign-in after rollout.

## Next handoffs

Start A03 billing, A05 invitations/team lifecycle, and A08 Google integration together from updated main using separate worktrees. A03/A05/A08 must use A02's canonical actor/business/owner contracts without replacing actor identity with owner identity. A03/A05 implement security fixes while keeping unapproved A18 behavior changes as explicit decisions. A08 provides provider request/resource/selection contracts before A09 rewrites shared reply persistence/policy.

A15 can inventory external services/data; A16 can prepare approval evidence; A17 can design acceptance tests; A19 can assess runtime security after A01. A06 waits for A03's billing/usage contract. A14 can analyze/scaffold a disabled lead module, but implementation still depends on A05 and explicit product/provider decisions.
