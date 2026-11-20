# Builder generation limits and usage accounting

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication.

## Decision

The builder runtime enforces per-subject and global generation request,
concurrency and spend limits **before** provider dispatch. The durable
`identity-store.json` usage array is the single ledger. Reservations, quota
checks and settlement run under the existing exclusive store lock, so two
concurrent requests cannot both consume the last request slot, concurrency slot
or spend headroom.

The implementation reuses the reviewed invite/recovery contract:

- The quota key is the server-derived `subjects[].id`, never a client claim.
- The request is authenticated by the server-side session before quota checks.
- The same builder-only store and lock cover identity, sessions and usage.
- No reputation user, plan, database table, billing record or provider account
  is read.
- Default access stays closed and the live provider stays disabled.

A generation is only attempted when the ledger can be read and written. If the
store is missing, corrupt, locked beyond the bounded wait, or otherwise
unwritable, the route denies dispatch with `503 accounting_unavailable` rather
than making an unaccounted provider call.

## Accounting rules

One accepted, authenticated, same-origin, validated generation request creates
exactly one `reserved` usage record before dispatch. The client `requestId` is
the idempotency key, scoped to `subjectId` + `sessionId`.

| Event | Request quota | Usage record | Spend exposure |
| --- | --- | --- | --- |
| Unauthenticated, cross-origin, closed mode or stale subject header | No | None | None |
| Invalid body, malformed JSON or invalid brief | No | None | None |
| Request/concurrency/spend limit denial | No | None | None |
| Duplicate `requestId` for the same subject and session | No | Existing record returned | Unchanged |
| Accepted request before dispatch | Yes, one | `reserved` | Reservation micros |
| Success with generated proposal | Yes | `succeeded` at actual micros | Actual micros |
| No provider available / not dispatched | Yes | `failed` at `0` | Zero |
| Cancellation before dispatch | Yes | `failed` at `0` | Zero |
| Timeout, invalid output, provider error or thrown transport | Yes | `unknown` at reservation | Reservation micros |
| Caller cancellation after dispatch with ambiguous result | Yes | `unknown` at reservation | Reservation micros |
| Settlement write cannot be verified | Yes | Remains `reserved` at reservation | Reservation micros |
| Reservation lease expires without settlement | Yes | `unknown` at reservation; concurrency freed | Reservation micros |
| Reported actual cost exceeds the reservation | Yes | `unknown` at reservation | Reservation micros |
| Operator reconciliation of `unknown` | Yes, unchanged | `succeeded`/`failed` with audited reason | Reviewed actual or zero |

Rules:

- **Request limits are a rolling window.** Every usage record accepted inside
  `BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS` counts, including `failed` and
  `unknown` records. Denied or invalid requests never create a record.
- **Spend caps are lifetime.** Effective spend is `0` for `failed`, the
  recorded actual for `succeeded`, and the reservation for `reserved` or
  `unknown`. Spend is never refunded automatically.
- **Concurrency counts active reservations.** Only `reserved` records with an
  unexpired lease occupy a slot. Expiry converts the record to `unknown` at the
  reserved cost, which frees concurrency without hiding spend exposure.
- **Settlement is idempotent.** Only a `reserved` record can transition. A
  repeated settlement, including one with a different outcome, returns the
  existing final record without changing cost.
- **Ambiguity stays reserved.** Missing usage, invalid output, timeouts,
  transport throws and failed settlement writes never settle to zero.
- **Reconciliation is operator-only.** `reconcile-usage` only accepts an
  `unknown` record and records the reason and timestamp. It is not a retry and
  never dispatches a provider call.
- **No silent overrun.** An actual cost above the reservation becomes
  `unknown` at the reservation; the ledger does not understate the cap.
- **No double charge on replay.** The same `requestId` cannot create a second
  record or a second provider dispatch. The client generates a new `requestId`
  for a new user-initiated generation.

Micros are internal accounting units (`1_000_000` micros = `1` unit of provider
currency as configured by the operator). They are not customer billing.

## Configuration

Defaults keep the runtime closed. Invite mode and the test provider must be
enabled explicitly.

| Variable | Default | Accepted range | Purpose |
| --- | --- | --- | --- |
| `BUILDER_RUNTIME_MODE` | `closed` | `closed`, `invite` | Access mode |
| `BUILDER_RUNTIME_STORE_DIR` | unset | writable builder-only directory | Identity and usage store |
| `BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS` | `86400` | `60..604800` | Rolling request window |
| `BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT` | `30` | `1..10000` | Requests per subject per window |
| `BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT` | `300` | `1..100000` | Requests across all subjects per window |
| `BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT` | `2` | `1..100` | Active subject generations |
| `BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT` | `8` | `1..100` | Active generations across all subjects |
| `BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS` | `5000000` | `0..1000000000000` | Lifetime subject spend cap |
| `BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS` | `50000000` | `0..1000000000000` | Lifetime global spend cap |
| `BUILDER_RUNTIME_REQUEST_RESERVE_MICROS` | `50000` | `0..1000000000` | Per-request reservation |
| `BUILDER_RUNTIME_RESERVATION_LEASE_SECONDS` | `300` | `30..3600` | Stale-reservation lease |
| `BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS` | `5000` | `50..15000` | Provider timeout |
| `BUILDER_RUNTIME_ALLOW_TEST_HOOKS` | unset | `1` to enable | Test-only gate |
| `BUILDER_RUNTIME_TEST_PROVIDER` | `none` | `none`, `success`, `invalid`, `timeout`, `unknown` | Injected stub provider |
| `BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS` | `0` | `0..1000000000` | Synthetic actual cost for the stub |
| `BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS` | `0` | `0..5000` | Test-only dispatch delay |

`BUILDER_RUNTIME_TEST_PROVIDER`, its cost and the test delay are rejected at
startup unless `BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1`. Normal smoke and production
qualification do not set that flag. The test provider is an injected object; it
is not reachable through Campaign Lab provider environment variables. The live
provider remains disabled because the builder wrapper passes
`providerResolution: null` and only an injected provider can dispatch.

## Customer-visible feedback

| Response | Customer message |
| --- | --- |
| `429 generation_limit`, code `subject_requests` / `global_requests` | The relevant request limit is reached; `Retry-After` is the seconds until the oldest request leaves the window. |
| `429 generation_limit`, code `subject_concurrency` / `global_concurrency` | Another generation is running; `Retry-After` is the bounded lease wait. |
| `429 generation_limit`, code `subject_spend` / `global_spend` | The spend cap is exhausted; contact the operator before another generation. |
| `409 request_already_submitted` | This request id was already submitted; start a new generation. |
| `503 accounting_unavailable` | Usage accounting cannot be verified; no provider request was made or the reservation remains held. |
| `408 generation_cancelled` | The request was cancelled before dispatch. |

The builder workspace keeps the **last accepted preview** visible on these
denials. It does not synthesize a replacement draft and does not approve
anything. A later successful generation still needs a fresh approval of its
exact revision; no stale approval can authorize a changed preview.

## Privacy-safe operational signals

Only bounded structured fields are logged:

```json
{
  "event": "builder_generation",
  "signal": "reservation_created | reservation_denied | settled | settlement_unavailable | cancelled",
  "at": "<ISO timestamp>",
  "subjectRef": "<first 12 hex of SHA-256(subjectId)>",
  "usageId": "use_*",
  "code": "<denial or settlement code>",
  "outcome": "reserved | succeeded | failed | unknown",
  "providerDispatched": true,
  "costMicros": 50000,
  "retryAfterSeconds": 60
}
```

The signal never contains offer copy, labels, brand names, destination URLs,
tokens, cookies, request bodies or raw provider output. `subjectRef` is one-way
and truncated; it is a correlation aid, not an identity.

## Storage and rollback

The store remains `identity-store.json` version `1`. New usage fields are
optional, so an older binary can read the same file. Rollback does not require a
migration or a schema change.

To roll back:

1. Stop the builder runtime.
2. Copy `BUILDER_RUNTIME_STORE_DIR` to a timestamped backup.
3. List open records with
   `node --experimental-strip-types scripts/builder-invite-operator.mjs list --store <dir> --json`
   and record any `reserved` or `unknown` usage ids.
4. Revert this commit (or deploy the `ec801ba` builder source) and rebuild the
   builder runtime.
5. Restart with closed or invite access as before. The earlier code ignores the
   usage array; generation returns to the previous no-quota behavior, so keep
   access invite-only and the live provider disabled until limits are restored.
6. Keep the usage records for later reconciliation. Do **not** delete
   `identity-store.json` or the usage array to clear a limit; that destroys the
   audit trail and could hide unresolved provider exposure.

The local file store has the same single-host, process-lock limitations as the
invite slice. It is not qualified on shared filesystems, multiple server
instances, container replacement, backup/restore or retention automation.
Horizontal scaling requires a transactional shared ledger before enforcement can
be trusted across instances.

## Bounded provider canary plan (separate authorization)

This commit does not add a live provider path and performs no paid call. A
canary requires a separately reviewed change that injects a real provider and a
reviewed price table.

Before requesting authorization:

- Use a dedicated canary store, not a customer or shared store.
- Pin one provider, one model and one reviewed price table; record the exact
  provider request/response accounting fields.
- Set a tiny budget, for example: window `3600`, subject requests `2`, global
  requests `2`, subject and global concurrency `1`, subject and global spend
  `150000` micros, reservation `50000` micros, lease `120`, timeout `15000`.
- Keep test hooks off. The canary provider is a separate explicit switch.
- Keep default access closed; use one synthetic subject and one synthetic offer.
- Watch the structured signals, the ledger, the provider invoice and the
  absence of unexpected egress.

Sequence:

1. Submit one synthetic brief with a unique request id. Expect one dispatch,
   one `succeeded` record and actual cost at or below the reservation.
2. Replay the same request id. Expect `409`, no second dispatch and no new
   record.
3. Submit the second allowed request. Expect success and the ledger spend to
   remain at or below the cap.
4. Submit a third request. Expect `429 subject_requests` before dispatch and no
   new record.
5. Restart the runtime against the same store. Confirm the request count,
   spend and records survive.
6. Compare the ledger with the provider invoice. Reconcile any mismatch through
   `reconcile-usage`; never edit the JSON by hand.

Stop immediately on any `unknown` outcome, settlement failure, actual cost above
reservation, unexpected provider dispatch, mismatch between ledger and invoice,
or any `5xx`. Roll back the canary provider switch, keep the store, and report
the record ids. No retry is authorized after an ambiguous outcome.

## Related evidence

- `docs/handoffs/BUILDER_GENERATION_LIMITS_20261120.md` — implementation,
  commands, route evidence and exact commit.
- `docs/handoffs/BUILDER_INVITE_RECOVERY_20261120.md` — reviewed subject,
  session and store contract.
