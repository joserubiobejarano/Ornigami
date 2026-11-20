# Builder server hardening

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication.

## Exact source

- Branch: `codex/ornigami-builder-hardening-20261120`
- Base: `7b8674358d5421c589bea22f55167276f4d391ec`
- Implementation commit: `af0160d116cdc7ad3d40254ece268e1dffca38b2`
- Worktree: `C:/Users/joser/.local/ornigami-builder-hardening-20261120`
- Review addressed: independent combined review at
  `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/codex-builder-combined-review/.local/review/REPORT.md`

This slice closes the review's two blocking client defects (duplicate request
id after reload/edit; draft storage surviving sign-out) and hardens the server
contracts around logout, admission, store locking, request ids, redemption and
origin checks. Default-closed access, invite-only sessions, exact-revision
approval and the disabled live provider are unchanged.

## Logout contract

`POST /api/builder/session/logout` succeeds only when server revocation is
confirmed or the presented session is already inactive.

| Case | Response | Cookie | Server session |
| --- | --- | --- | --- |
| Valid active session revoked | `200 {state:"revoked"}` | cleared | revoked |
| Token absent, unknown, expired or already revoked | `200 {state:"already_inactive"}` | cleared | already inactive |
| Store/lock/read/write failure | `503 {error:"logout_unconfirmed",retryable:true}` with `Retry-After: 1` | **not cleared** | unchanged |
| Wrong or missing configured origin | `403` | unchanged | unchanged |
| Closed runtime | `404` | unchanged | not applicable |

The client now waits for the response. It clears builder draft keys and pauses
draft persistence only after a successful response, then navigates. On a
retryable failure it stays signed in and shows an actionable error. A repeated
sign-out is idempotent and reports `already_inactive`.

## Admission and revocation policy

The initial session lookup is not sufficient on its own. The reservation
transaction re-reads the server-side session and subject under the store lock.
A revoked/expired session, mismatched subject, or revoked subject is denied with
`401 session_inactive` and creates no usage record.

| Revocation timing | Result |
| --- | --- |
| Before reservation/lookup | `401`/`404`; no usage record |
| After reservation, before the final pre-dispatch recheck | Reservation settles `failed` at `0`; `401 session_inactive`; no provider request |
| During an admitted test delay or other pre-dispatch work | Same as above; the final recheck runs after the delay |
| After provider dispatch | Work is not forcibly retracted. The result is discarded (`401 session_inactive`) and the ledger settles actual/unknown; request quota remains consumed |
| During logout | Logout blocks until revocation is confirmed; generation already admitted follows the rules above |

The remaining race between the final recheck and the provider call is bounded
and explicitly accepted: revocation in that window may allow already-started
provider work, but no preview is returned and accounting remains conservative.

## Store lock and interrupted-write contract

The durable store remains `identity-store.json` version `1`. Identity, session,
invite and usage records are preserved; no schema migration is required.

Lock files:

- `identity-store.lock` — exclusive writer lock.
- `identity-store.reap.lock` — serializes stale-lock reaping.
- `*.tmp` — atomic-write and lock-claim temporaries.

Lock metadata contains `version`, random `token`, `pid`, stable store host id and
`acquiredAt`. The file is created by syncing a temporary file and hard-linking it
into place, so readers never see partial owner metadata.

Guarantees:

- **Age alone never displaces an owner.** A lock is reclaimed only when its
  recorded host matches `BUILDER_RUNTIME_STORE_HOST_ID` (default: OS hostname)
  and its PID is provably dead on that host. A live but paused owner keeps the
  lock.
- **An old owner cannot remove a successor.** Release reads the token, moves the
  file to a unique quarantine path, verifies the moved token, and only then
  deletes it. A token mismatch restores the successor and leaves it locked.
- **Stale reaping is serialized** by the reap claim and rechecked before the
  store lock is renamed away.
- **Different-host, corrupt or unprovable owners fail closed.** They are not
  auto-removed; operators must recover manually after stopping all writers.
- **Store writes are atomic.** The new JSON is written and synced to a
  temporary file, renamed over `identity-store.json`, then the directory is
  synced where the platform supports it.
- **Interrupted writes preserve the previous store.** A crash before rename
  leaves the last complete store readable; dead-owner temporary files are
  removed on the next locked write. A live owner's temp file is left alone.
- **Concurrent runtime and operator CLI writes** are serialized by the same
  lock. Tests preserve pre-existing identity and usage records byte-for-byte
  while CLI invites and runtime reservations interleave.

### Supported storage topology

Supported for this slice:

- one host and one local filesystem store directory;
- one builder runtime process, plus short-lived operator CLI processes on the
  same host;
- local NTFS (tested on Windows) or a local POSIX filesystem with hard-link and
  atomic-rename support (not tested here);
- a stable `BUILDER_RUNTIME_STORE_HOST_ID` across restarts, set to the same
  value for the runtime and every operator CLI process;
- one replica only.

Not supported or qualified:

- multiple hosts or replicas sharing a network filesystem;
- NFS/SMB/shared block storage;
- Linux, container, distroless or volume-replacement behavior;
- PID reuse or a changed host id after an unclean stop (fails closed; manual
  recovery required);
- hostile local users with write access to the store directory.

The invitation-attempt limiter is additionally per process and resets on
restart. It is abuse friction, not a durable security ledger.

### Manual recovery from an interrupted write or stuck lock

1. Stop the builder runtime and every operator CLI process.
2. Copy the entire store directory to a timestamped backup.
3. Confirm no process is writing. Inspect `identity-store.lock` and
   `identity-store.reap.lock` metadata (`pid`, `hostname`, `acquiredAt`) and
   verify no matching process remains.
4. If `identity-store.json` parses and matches version `1`, keep it. Remove the
   stale lock/reap files and `*.tmp` files only after step 3. Never delete or
   truncate `identity-store.json` to clear a lock or a usage limit.
5. If the store is corrupt, restore the last accepted copy and preserve the
   corrupt file for audit. Do not merge records by hand.
6. Restart, run
   `node --experimental-strip-types scripts/builder-invite-operator.mjs list --store <dir> --json`,
   and reconcile any `reserved`/`unknown` usage records explicitly.

## Request id contract

The builder route now requires a canonical UUID request id before reservation:

- absent, numeric, malformed or overlong ids return `400` and create no usage
  record;
- accepted ids keep the existing scoped replay protection
  (`subjectId + sessionId + requestId`);
- the builder client creates one `crypto.randomUUID()` per user-initiated
  attempt, so reload, remount, “edit brief”, and a second tab cannot collide
  with an earlier per-mount counter;
- Campaign Lab keeps its existing request-id behavior.

## Configured origin and proxy model

`Origin` must equal the full origin of `NEXT_PUBLIC_APP_URL` (scheme, host and
port). The check ignores request URL, `Host`, `X-Forwarded-Host` and
`X-Forwarded-Proto`, so a client cannot widen the accepted origin with spoofed
proxy headers. A missing `Origin` or a `Sec-Fetch-Site` value other than
`same-origin` is rejected.

Intended model: the TLS-terminating reverse proxy owns the configured public
origin and forwards to the runtime; the runtime port is not directly public.
The proxy must preserve `Origin`. No proxy header is trusted for origin
acceptance.

## Invitation redemption bounds

- Body: URL-encoded only, maximum **4,096 actual bytes** counted from the
  stream, not `Content-Length`. Missing/understated length cannot bypass it.
- Exactly one `token` field; duplicate/unknown fields, empty tokens and tokens
  over 512 characters are rejected.
- Attempts: default **20 per client per 60 seconds** and **100 globally per
  process per 60 seconds**, returning `429 rate_limited` with `Retry-After`.
- `BUILDER_RUNTIME_TRUST_PROXY_HEADERS=1` enables the first `X-Forwarded-For`
  hop (or `X-Real-IP`) as the client key. It must only be enabled when the edge
  overwrites those headers.
- Per-process state resets on restart; one replica is the supported topology.

## Added configuration

| Variable | Default | Accepted | Effect |
| --- | --- | --- | --- |
| `BUILDER_RUNTIME_REDEEM_WINDOW_SECONDS` | `60` | `10..3600` | Attempt window |
| `BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT` | `20` | `1..1000` | Attempts per client per window |
| `BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT` | `100` | `1..10000`, at least the client limit | All attempts per process per window |
| `BUILDER_RUNTIME_TRUST_PROXY_HEADERS` | unset | `1` | Enables forwarded client key |
| `BUILDER_RUNTIME_STORE_HOST_ID` | OS hostname | `1..255` chars | Stable lock-owner host id |

The existing generation limits, test-provider gate, session TTL and store
settings are unchanged. `BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1` is still needed for
the injected test provider and delay. The live provider remains disabled.

## Verification evidence

Windows 11 x64, Node `v24.11.1`. No Linux/container target was available.

- Focused builder suites: **55/55 pass** across identity store, runtime
  isolation, production boundary, usage ledger, generation limits, store
  hardening and request hardening.
- Store hardening tests: **8/8**, including live-old-lock non-displacement,
  dead-owner reclamation, successor-lock protection, foreign-host fail-closed,
  interrupted-write recovery, mixed CLI/runtime concurrency and corrupt-store
  byte preservation.
- Actual builder hardening route checks: **9/9 pass**:
  - missing request id `400` before reservation;
  - mismatched configured origin `403`;
  - valid UUID generation `200`;
  - cross-origin logout `403` with the session still active;
  - blocked revocation `503`, `Retry-After: 1`, no cookie clear, session still
    active;
  - confirmed logout `200 revoked`, session `401`, repeat logout
    `already_inactive`;
  - oversized redemption `413`, invalid `400`, third client attempt `429`,
    another client still `200`;
  - revocation during admitted delay `401`, ledger `failed 0`, no dispatch;
  - revocation after dispatch `401`, preview suppressed, ledger `unknown` at
    `50000` micros.
- Existing generation-limit route matrix: **12/12 pass**, including UUID
  success, scoped replay, concurrency/spend/request denials, restart
  persistence, unknown reservations and reconciliation.
- Actual Chromium client check: signed in with an invite, placed a builder draft
  key plus an unrelated key in `sessionStorage`, clicked **Sign out**, reached
  the sign-in page, and observed **zero** builder draft keys with the unrelated
  key retained. This closes review B2.
- Request-id helper test: 100 generated ids are unique UUIDv4 values; the
  builder component uses that helper. Reload/edit/regenerate was not rerun as a
  full browser journey in this slice.
- Builder build: pass, **0 denied egress**. Builder smoke: pass, **0 denied
  egress**.
- Legacy build and production smoke: pass; legacy routes and Campaign Lab gates
  remain intact.
- Whole-project TypeScript: pass. ESLint: **0 errors**, 27 pre-existing
  warnings.
- Full suite: **1,376 tests, 1,370 pass, 6 fail**. The six failures reproduce at
  the base review target and are unrelated: three instrumentation mocks cannot
  resolve `./lib/builder/startup` and three staging synthetic-fixture SQL
  assertions. No builder, ledger, Campaign Lab or production-smoke test failed.

Evidence: `.local/builder-hardening/results.json`,
`.local/builder-generation-limits/results.json`, and the browser session
observation above.

## Rollback

- Stop the runtime and all operator CLI processes before changing source.
- Back up the store directory and record its hash.
- Deploy the previous builder build from `7b86743` (or `ec801ba` for an
  emergency stop). No store migration is needed; version `1` and all optional
  usage fields remain readable.
- Remove current `identity-store.lock`, `identity-store.reap.lock` and `*.tmp`
  files only after proving no writer remains. The previous lock implementation
  uses mtime-based staleness and must not run concurrently with this one.
- Rollback to `7b86743` restores the old logout behavior and accepts UUID ids,
  but loses reservation-time admission rechecks and the new lock guarantees.
  Keep access invite-only and the provider disabled.
- Rollback to `ec801ba` removes quota enforcement entirely; use it only as an
  emergency stop with invite-only access, test hooks off and no live provider.
- Preserve `identity-store.json` and unresolved `reserved`/`unknown` records for
  audit. Never clear usage to bypass a limit.

## Remaining gates

- Linux/container filesystem and hard-link behavior, volume replacement, host
  clock and actual proxy/TLS behavior are unqualified.
- Multi-replica or shared-filesystem storage is not supported.
- PID reuse and host-id changes require manual lock recovery.
- The invitation limiter is per-process, not a distributed rate limiter.
- Live provider use, paid calls, deployment, DNS/access changes and customer
  publication remain separately unauthorized.
