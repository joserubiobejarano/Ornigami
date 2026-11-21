# Builder assisted minimisation and restore replay — contract

**Status: builder-only mechanics, synthetic evidence only. No owner policy is
adopted. No retention period, purge, automatic expiry, scheduler, customer
admission, deployment or real-store operation is authorized.**

Start point: `f73e93fccb42d1752d77e51e9e6374752b4f23d6`.
Restore-attempt lifecycle correction: `57254a95391e2f8a2672176d0cf25aa7cb8f56e6`
(from `44e116366a0aca09b09bd22e87c7216ce2a8dc93`).
Owner proposals read at `d6549ba454e26f1e01914c4189c9388550fe89a3` are treated
as proposals, not adopted policy.

## 1. Implemented scope

| Capability | Entry point | Effect |
| --- | --- | --- |
| Reviewed dry run | `minimize --store <dir> --subject <id> --plan-out <file>` | Prints or writes affected record IDs and categories, store hash, expected result hash and accounting snapshot. No tokens, labels or request content. |
| Explicit apply | `minimize-apply --store <dir> --plan <file> --confirm-subject <id>` | Validates the reviewed plan against the current store, appends a durable journal request, revokes the subject's sessions and unused invites, minimises labels/token hashes, preserves usage rows, and writes a receipt. |
| Durable journal | `minimization-journal.json` | Append-only event evidence under the existing store lock. Pending/completed phases, no labels or credentials. |
| Restore gate | `restore-prepare --store <restored> --journal <file>` | Opens a durable attempt id and writes a `closed` gate before any journal or receipt evidence is loaded. |
| Offline replay | `replay-minimization --store <restored> --journal <file>` | Reapplies journaled revocations/minimisations to an older backup, verifies continuity and accounting invariants, writes an attempt receipt, then removes the gate only after verifying that attempt. |
| Reopen check | `replay-status --store <dir>` and runtime startup | Fails closed while a gate lacks a complete receipt for its own attempt, or while a journal request is pending. A verified receipt removes the gate. |

The operator wrapper and image include the same commands. The plan file may live
inside the mounted store directory so the packaged operator can read it without
an extra mount.

## 2. What minimisation changes and preserves

Changes only for the specified subject:

- subject `label` becomes `[minimized]`; `revokedAt` is set if not already set;
- every session for the subject is revoked and its `tokenHash` becomes the
  non-credential tombstone `minimized`;
- every invite for the subject has its label and token hash minimised;
- unused invites (`usedAt` absent and not already revoked) are revoked;
- used invites keep their `usedAt`/`redeemedSessionId` evidence and are not
  retroactively revoked.

Preserved exactly:

- the opaque `subjects[].id` and all usage relationships;
- every `usage[]` row, including `usageId`, `subjectId`, `sessionId`,
  `generationId`, `state`, `requestKey`, `costMicros`, `reservedCostMicros`,
  `leaseExpiresAt`, settlement/reconciliation fields and all timestamps;
- request counts, settled spend, reserved exposure, unknown exposure and the
  effective-spend total;
- all records for every other subject.

There is no full purge, no aggregate/tombstone compaction, no row deletion, no
automatic retention expiry and no quota/spend reset. Deleting a subject must
never create new capacity; the minimisation path does not touch usage rows.

## 3. Writer coordination and crash-consistency contract

The existing `identity-store.lock` remains the only writer lock. Journal, store
and receipt writes use a same-directory temporary file, `fsync`, atomic rename
and directory `fsync` where supported. No second writer, database or scheduler
is introduced.

Apply ordering:

1. acquire the existing store lock;
2. read `identity-store.json`, its exact SHA-256 and `minimization-journal.json`;
3. reject a stale/tampered plan or an incompatible/corrupt store **before any
   mutation**;
4. append a `pending` journal event and sync it;
5. apply the reviewed effects to the store and atomically replace
   `identity-store.json`;
6. mark the journal event `completed` with the result store hash and sync it;
7. release the lock and return the receipt.

| Interruption point | Durable state | Required behaviour |
| --- | --- | --- |
| Before step 4 | Old store, no event | No request exists; nothing to recover. |
| After step 4, before step 5 | Old store, pending event | Request is durable. Ordinary writers and admission fail closed. Re-running the same reviewed apply finishes the request. |
| After step 5, before step 6 | Minimised store, pending event | Request and effects are durable. Ordinary writers and admission fail closed. Re-running the same apply verifies the result hash and marks the event completed. |
| After step 6 | Minimised store, completed event | Request and effects are durable; no recovery needed. |

An interruption therefore cannot silently lose the request or its effects. A
pending journal makes `withBuilderIdentityStore` writes fail with
`BuilderStoreUnavailable`; `validateBuilderSession` fails closed and
`readBuilderAdmissionStatus` returns `unavailable`. `list` remains readable for
operator diagnosis. Restart startup also fails while the pending journal or an
unreplayed restore gate remains.

Idempotency: the reviewed `planId` and journal `planId` are unique. Repeating
the same apply after a completed request returns `already_applied` without a
second event. Repeating replay returns the same store hash and no new effects.

### Restore attempt lifecycle

A restore attempt is explicit and durable before evidence loading:

1. `restore-prepare` or a direct `replay-minimization` acquires the existing
   store lock and writes `restore-replay-gate.json` with a new `attemptId` and
   `phase: "closed"`.
2. Only then is the journal, receipt history or identity store read. A missing,
   corrupt, incomplete or divergent input throws and leaves the gate closed.
3. After the journal and continuity checks pass, the gate becomes
   `phase: "prepared"` with the journal hash, ordered journal event ids and the
   pre-restore store hash.
4. Store effects, derived journal and an attempt-scoped receipt are written in
   that order.
5. The gate is removed only after a receipt for the same `attemptId` matches the
   prepared journal sequence, the pre-restore hash, the current store hash and
   all accounting invariants.

A failed attempt can be re-prepared for corrected evidence only while the store
hash still equals the prepared pre-restore hash and no effects were written.
After effects exist, retries must use the same journal. This prevents silently
discarding a partial restore.

The gate write is the first durable action. If it cannot be synced, the restore
command fails and the store must remain stopped; do not open a restored store
whose gate could not be written.

| Restore interruption | Durable state | Reopen behaviour |
| --- | --- | --- |
| After closed gate | Gate, no journal binding | Blocked; retry may bind evidence |
| After prepared gate | Gate bound to journal, no receipt | Blocked; retry same journal |
| After store write | Minimised store, no receipt | Blocked; retry verifies/receipts |
| After derived journal write | Store and journal, no receipt | Blocked; retry receipts |
| After receipt write | Complete receipt, gate still present | Startup verifies receipt and removes gate |
| After gate removal | Complete receipt, no gate | Startup allowed |

Startup, admission and ordinary writers share one gate contract:

- invite-mode startup checks the gate before the writable probe; a verified
  current-attempt receipt removes the gate, otherwise startup fails;
- session lookup and admission report `unavailable` while any gate exists;
- ordinary store writers (invite, reservation, settlement, reconciliation,
  revocation, minimisation plan/apply) fail with `BuilderStoreUnavailable` or
  `restore_pending` while any gate exists;
- `list`, `lock-status` and lock recovery remain available for diagnosis;
- the supported restore topology still requires every writer and the runtime to
  be stopped before copying a backup, preparing, replaying and reopening.

## 4. Plan binding and rejection rules

A plan contains:

- the exact store SHA-256 at dry-run time;
- the expected post-minimisation store SHA-256;
- the exact subject, invite, session and preserved usage IDs;
- categories and counts;
- an accounting snapshot before and after;
- an `effectAt` timestamp fixed at dry-run time, so apply and replay produce the
  same store hash and revocation timestamps;
- a `planId` over canonical plan content.

Apply rejects without mutation when:

- the plan JSON is malformed, has extra fields, or its `planId` does not match
  its content;
- the store changed after the dry run (`stale_plan`);
- the store hash is neither the reviewed input nor the reviewed result;
- another subject's pending journal request exists;
- the plan's effects, accounting, store shape or version are incompatible;
- the store's accounting relationships are already inconsistent.

`--confirm-subject` is an additional operator guard against applying the right
file to the wrong subject; it does not replace plan review.

## 5. Offline restore replay

Supported synthetic restore sequence:

1. stop every writer;
2. copy the older backup into a fresh store directory;
3. `restore-prepare --store <restored> --journal <primary-journal>`;
4. `replay-minimization --store <restored> --journal <primary-journal>`;
5. `replay-status --store <restored>` must report ready;
6. only then start the runtime.

Replay behaviour:

- opens a durable closed gate before reading the journal, receipt history or
  store, so missing/corrupt input leaves the store closed;
- requires a parseable, supported journal; missing or corrupt evidence fails;
- requires the backup's own journal event sequence to be a prefix of the supplied
  journal; a missing, reordered or divergent prefix fails;
- requires every historical receipt's ordered `journalEventIds` to be a prefix
  of the supplied journal. A newer journal may grow the event sequence; it may
  not drop or replace receipted events;
- preserves every attempt receipt in
  `restore-replay-receipt.<attemptId>.json` and refreshes the stable
  `restore-replay-receipt.json` latest copy. If a backup contains only the latest
  copy, that receipt is archived under its attempt id before the latest copy is
  replaced;
- applies each journaled event by subject scope, so a session/invite created
  between the plan and the backup cannot remain active;
- treats a journaled subject absent from an older backup as already outside the
  backup's risk surface, but rejects the backup if related sessions, invites or
  usage rows remain without the subject;
- verifies usage rows and all accounting totals are byte-for-byte unchanged;
- verifies usage-to-subject/session relationships and idempotency-key
  uniqueness;
- writes an attempt-scoped receipt with the attempt id, prior receipt ids,
  journal hash, ordered event ids, before/after store hashes, accounting
  snapshots and invariant results;
- writes all journal events into the restored store as `completed` with replay
  evidence, so startup does not see a pending event;
- removes `restore-replay-gate.json` only after the current attempt receipt
  passes the same checks the runtime performs.

Two-cycle restore is supported without deleting receipts. A successful restore
A may be followed by ordinary operation, minimization B, a new backup/restore,
and replay of the newer A+B journal. Receipt A remains historical evidence; the
new attempt records A as a prior receipt and applies only the new effects.
A journal that omits A, reorders A, or diverges from the backup's own journal
fails and leaves the new gate closed.

Missing, incomplete or inconsistent evidence leaves the gate in place. Runtime
startup refuses to open the store until a complete receipt exists for the gate's
own attempt, matches the prepared event sequence and current store hash, and all
invariant flags are true. A verified receipt removes the gate and permits
ordinary operation. `restore-prepare` closes the window between copying a backup
and the first replay attempt; the supported restore path must call it. If both
prepare and replay are skipped entirely, the runtime cannot infer that an
arbitrary store is a restored older backup — that is a process violation, not an
automatic detection.

Replay is idempotent: a second replay of the same journal makes no store change,
keeps the same store hash, and returns a new complete receipt with no applied
events. Repeated preparation returns the same open attempt; preparation after a
verified restore records a no-op attempt receipt and leaves the store open.

## 6. Compatibility and rollback implications

- `identity-store.json` remains version `1`; no migration is required.
- The minimised store is readable by the current and earlier builder binaries:
  subject/invite/session records remain, usage is unchanged, and revokedAt/token
  tombstones deny access.
- The journal, replay gate and attempt receipts are new sidecar files. An earlier
  binary ignores them and does **not** fail closed on a pending journal, an
  unreplayed restore gate or corrupt receipt history.
- Therefore a rollback to an earlier binary after a pending apply, an open
  restore attempt or a receipted v2 restore is unsupported. Either finish/verify
  the current request with this image, or keep the store closed and preserve all
  sidecars for review.
- Gate and receipt format is version `2`. Version `1` artifacts from
  `44e1163` are preserved but fail closed under this binary; they are not
  auto-migrated. Do not delete them to force the store open.
- Receipt history is append-only by attempt id. The stable
  `restore-replay-receipt.json` copy is only a convenience pointer; historical
  attempt files are the evidence. Do not delete either to bypass a conflict.
- Do not delete `minimization-journal.json`, `restore-replay-gate.json`,
  `restore-replay-receipt.json`, `restore-replay-receipt.<attemptId>.json`, usage
  rows or the store to bypass a limit.
- The existing single-replica/one-writer rule still applies. Journal write
  ordering assumes the existing local filesystem and lock; shared-filesystem or
  multi-replica operation remains unsupported.
- Do not start the older `ec801ba` builder in invite mode; it reads the store but
  does not enforce generation budgets. This contract does not change that
  rollback warning.

## 7. Explicitly pending owner policy

Not implemented or authorized by this contract:

- any retention period or deletion deadline;
- full purge, aggregate spend/count tombstone or compaction of raw usage;
- automatic expiry, cleanup, scheduler or cron;
- self-service deletion, customer-facing deletion UI or rights automation;
- journal retention period, approver identity/authority, dual control or
  cryptographic operator signatures;
- encrypted off-host backup, key custody, provider-side backup coverage or
  independent restore review;
- customer notice/addendum, customer admission, real invitations or support
  routing;
- deployment, registry publication, DNS/edge change, provider call or paid call.

Until the owner adopts those decisions, this remains a builder-only assisted
minimisation and restore-replay mechanic. Treated owner proposals are not
policy.
