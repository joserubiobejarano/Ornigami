# Builder server hardening handoff

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication.

## Exact source

- Branch: `codex/ornigami-builder-hardening-20261120`
- Base: `7b8674358d5421c589bea22f55167276f4d391ec`
- Implementation commit: `af0160d116cdc7ad3d40254ece268e1dffca38b2`
- Worktree: `C:/Users/joser/.local/ornigami-builder-hardening-20261120`
- Review read:
  `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/codex-builder-combined-review/.local/review/REPORT.md`

The decision, protocol, recovery procedure, topology and rollback are in
[`docs/BUILDER_SERVER_HARDENING_20261120.md`](../BUILDER_SERVER_HARDENING_20261120.md).
The prior accounting rules remain in
[`docs/BUILDER_GENERATION_LIMITS_20261120.md`](../BUILDER_GENERATION_LIMITS_20261120.md).

## Changes

- **Logout:** `200` only after revocation is confirmed or the session is already
  inactive; `503 logout_unconfirmed` with `Retry-After` and no cookie clear when
  revocation cannot be confirmed; `403` for the wrong configured origin.
- **Client logout:** waits for confirmation, pauses intake persistence, clears
  all builder draft keys, broadcasts session end and navigates only on success;
  shows a retryable error and keeps the session on failure.
- **Admission:** reservation re-reads the session and subject under the store
  lock. Revocation before dispatch settles `failed 0` and returns
  `401 session_inactive`; revocation after dispatch discards the result and
  settles actual/unknown. Request quota remains consumed.
- **Locking:** complete metadata lock files created by synced temp + hard link;
  token-checked release; dead-owner-only reaping with a serialized reap claim;
  no age-based stealing; old owner cannot remove a successor; foreign-host or
  corrupt locks fail closed.
- **Writes:** atomic temp + rename + directory sync where supported; interrupted
  writes keep the previous store; dead-owner temp files are cleaned, live-owner
  files are kept.
- **Request id:** canonical UUID required before reservation; client uses
  `crypto.randomUUID()` per attempt; scoped replay protection is unchanged.
- **Origin:** exact full `NEXT_PUBLIC_APP_URL` origin; no request URL, Host or
  forwarded-header fallback.
- **Redemption:** 4,096-byte streamed body bound, URL-encoded single token only;
  20/client/min and 100/global/min per process, `429` with `Retry-After`;
  optional trusted-proxy client key.
- **Tests/evidence:** store hardening, request hardening, actual route matrix,
  UUID updates to the prior generation matrix and client helper tests.

## Validation

Windows 11 x64, Node `v24.11.1`; no Linux/container host.

- Focused builder suites: **55/55 pass**.
- Store hardening: **8/8 pass**: live old lock retained, dead owner reclaimed,
  successor lock protected, foreign host fail-closed, interrupted-write
  recovery, mixed operator CLI/runtime writes preserved records, corrupt store
  unchanged, unprovable lock retained.
- Actual hardening route matrix: **9/9 pass** (missing id, origin, logout
  confirmation/failure, redemption bounds, pre-dispatch and post-dispatch
  revocation).
- Existing generation-limit matrix: **12/12 pass** with UUID ids.
- Chromium client check: builder draft key removed on sign-out, unrelated key
  retained, sign-in page reached. Evidence:
  `.local/browser-hardening/results.json`.
- Builder build and smoke: pass, **0 denied egress** each.
- Legacy build and production smoke: pass; legacy routes and Campaign Lab remain
  intact.
- TypeScript: pass. ESLint: **0 errors, 27 pre-existing warnings**.
- Full suite: **1,376 tests, 1,370 pass, 6 fail**; the six failures reproduce at
  the review target and are unrelated (three `./lib/builder/startup`
  instrumentation mocks; three staging synthetic-fixture SQL assertions).

## Supported topology

One host, one local store directory, one builder runtime process plus
short-lived operator CLI processes. Local NTFS (tested) or local POSIX with
hard links and atomic rename (not tested). Set a stable
`BUILDER_RUNTIME_STORE_HOST_ID` for the runtime and every operator CLI process.
Do not use shared/network filesystems, multiple replicas, Linux containers
without separate qualification, or concurrent old/new lock implementations. If
the id is unset in a container and the OS hostname changes, recovery is manual.
PID reuse or a changed host id fails closed and requires manual lock recovery
after stopping all writers.

## Rollback

Stop all writers first. Back up the store. Deploy the `7b86743` builder build
(or `ec801ba` as an emergency stop); store version `1` and identity/usage
records remain readable. Remove new lock/reap/temp files only after proving no
writer remains, because the previous code uses mtime-based lock stealing. Keep
access invite-only, test hooks off and the live provider disabled. Rollback to
`7b86743` loses the new logout/admission/lock guarantees; `ec801ba` also loses
quota enforcement. Never clear usage or delete the store to bypass a limit.

## Boundaries

No paid or live provider call, deployment, DNS/access change, customer message,
publication or Linux/container qualification was performed. Multi-replica
storage, distributed rate limiting, PID-reuse recovery and actual proxy/TLS
behavior remain separate gates.
