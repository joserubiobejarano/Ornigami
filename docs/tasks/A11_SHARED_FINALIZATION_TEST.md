# A11 composed finalization test

`tests/a11-shared-finalization-postgres.test.mts` is an isolated PostgreSQL integration proposal. It applies migrations 019–022, 024, 031, 032 and 026, then applies the Auth/Team, Billing, Replies, Booster, and lifecycle SQL proposals twice. In the assigned checkout it resolves the other proposals from their sibling worktrees; after integration it prefers the proposal files in this checkout. It copies no proposal SQL into this branch.

The test covers owner cascade and member preservation with Auth/Team triggers installed, finalizer marker restoration, null and stale fences, active and uncertain generic owner/actor operations, native Booster unknown-outcome drains for owner and actor, actor-specific Replies receipt purge while preserving another member's receipt, owner workspace receipt purge, and removal of deleted-user Google evidence and generic encrypted operation evidence while preserving survivor records.

Run with `node --experimental-strip-types --test tests/a11-shared-finalization-postgres.test.mts` on a host with PostgreSQL 17 binaries available (or set `A11_PG_BIN`). This creates only a disposable cluster under `.next` and makes no provider or shared database calls.
