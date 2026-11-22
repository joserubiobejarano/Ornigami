# Builder beta operations-readiness record — 22 November 2026

Baseline control-plane tip: `a42badc8c9c1e0f98c5520887b1cb3657b05d449`.
Worktree/branch: `C:/Users/joser/.local/ornigami-beta-readiness-20261122`,
`codex/ornigami-beta-readiness-20261122`.
Implementation commit: `57e97e0d933c3b96065ae56a942966ed9206eb3a`.

This slice did not rebuild or re-qualify the accepted image, deploy, publish,
change DNS, send messages, admit customers or use a real store/customer data.

## 1. Qualification record closed

- `CURRENT_STATE.md` now records the accepted synthetic qualification
  (`45043028345`) and its scope boundaries.
- `ROADMAP.md` now points operations work at backup/recovery, owner decisions,
  support/retention, custom-Next ownership and usability rather than repeating
  the completed image qualification.
- The earlier failure record is marked historical; the accepted R2 record is
  canonical.
- The consumer checkout label is corrected for future identity output:
  `verify-exact-identities.sh` emits `sourceCheckoutSha` and
  `harnessCheckoutSha`. Historical `harness-identity.txt` evidence is preserved;
  its old `applicationSourceSha` field is documented as the consumer checkout,
  not the application source.
- [Custody index](./BUILDER_QUALIFICATION_CUSTODY_INDEX_20261122.md) identifies
  the archive, image, receipts, local copies, retrieval proof and the
  **2026-11-29T16:21:16Z** latest qualification-artifact expiry.

Owner-held custody is still pending. No duplicate was deleted, retention was not
extended and nothing was uploaded elsewhere.

## 2. Encrypted backup/recovery

Implemented `scripts/builder-backup-restore.mjs` using the existing builder store
lock, serialization, minimization journal, restore gate and replay modules.

- AES-256-GCM authenticated encryption; scrypt key derivation; random salt and
  nonce; versioned header/manifest.
- Includes identity store, minimization journal and restore-receipt history.
- Excludes locks, temporary files and restore gates; refuses pending journal,
  corrupt history, unexpected files, non-private POSIX modes or live/stale
  locks.
- Passphrase is read from a private file, never printed or written to the
  archive/receipts.
- Restore targets a fresh directory, writes a closed restore gate first,
  re-verifies every file and the accounting snapshot, and leaves admission
  unavailable.
- Replay requires the latest authoritative journal and explicit point-in-time /
  usage-window / open-usage acknowledgements. The gate is removed only after the
  existing continuity and accounting checks pass.
- Receipts record archive hash/size, manifest file hashes, source store hash,
  accounting snapshot, restore attempt, replay result, limitations and
  `customerAdmission=closed`.

Full mechanics and limits: [BUILDER_BACKUP_RESTORE_20261122.md](./BUILDER_BACKUP_RESTORE_20261122.md).

## 3. Recovery tests

Executed on Windows 11 x64, Node `v24.11.1`:

```text
node --experimental-strip-types --test tests/builder-backup-restore.test.mts
15/15 pass
```

Covered successful encrypted backup and fresh restore; wrong key, corrupt and
truncated archive; missing journal and corrupt/missing receipt history; older
backup plus newer minimization/replay; repeated replay idempotence; reserved and
unknown usage preservation; control-subject session behavior; interruption after
gate/files/receipt and during replay with resumable closed gates; pending
journal/gate/lock/unexpected-file backup refusal; missing acknowledgement and
non-empty output refusal; CLI end-to-end; POSIX mode assertions.

Existing builder suites also passed:

```text
node --experimental-strip-types --test \
  tests/builder-minimization-restore-lifecycle.test.mts \
  tests/builder-store-hardening.test.mts tests/builder-identity-store.test.mts \
  tests/builder-usage-ledger.test.mts tests/builder-runtime-isolation.test.mts \
  tests/builder-minimization.test.mts
57/57 pass
```

Private local logs are under ignored `.local/beta-readiness/` with `SHA256SUMS`.

### Windows evidence vs Linux-only requirements

Windows evidence establishes the tool logic, crypto/auth failure handling,
manifest integrity, gate/replay behavior and synthetic store accounting. It does
not establish:

- POSIX `0700/0600` enforcement on a real Linux volume;
- stopped-writer volume snapshot semantics and `fsync` behavior on the target
  filesystem;
- the packaged operator image/runtime;
- actual key custody, destination, retention or restart/rollback on a host.

Those remain Linux/owner-gated. The frozen qualified image predates this tool; a
new image would require separate build/qualification.

## 4. Owner decisions

One consolidated request is in
[OWNER_DECISIONS_BETA_20261122.md](./OWNER_DECISIONS_BETA_20261122.md). It asks
for decisions on backup destination/frequency/retention/key custody/recovery
operator, record retention/assisted deletion, support ownership/channel/response,
custom-Next maintainer or retirement, and hosting/admission scope.

No decision is approved on the owner's behalf. No message was sent under the
current authorization, so all five remain **pending**. Existing documents are
proposals, not adopted policy.

## 5. Low-assistance usability exercise

Prepared [BUILDER_BETA_USABILITY_EXERCISE_20261122.md](./BUILDER_BETA_USABILITY_EXERCISE_20261122.md):
invite entry, synthetic brief, packshot, generation, edit/regeneration, local
approval, ZIP export, recovery and sign-out, with pass criteria and a friction
log.

It was **not executed** with the owner or a customer. The accepted 32-check
browser qualification is agent-operated mechanics evidence and is not reported
as independent customer usability. No external participant was recruited or
messaged.

## Customer-admission blocker list

1. Owner backup destination/frequency/retention/key custody and recovery
   operator are undecided.
2. Record retention and assisted-deletion policy is undecided.
3. Support owner/channel/response expectations are undecided.
4. Custom-Next accountable maintainer or retirement plan is undecided.
5. Persistent hosting route and customer-admission scope are undecided.
6. Linux/volume backup/restore/replay and actual key-custody operation are not
   verified.
7. The synthetic `no-sandbox` CI browser exception and synthetic edge do not
   establish customer-environment security or usability.

Until these are resolved, keep admission closed and use synthetic stores only.

## Scope

- Local implementation, tests, commits and synthetic artifacts only.
- No registry publication, public DNS/ACME, persistent deployment, default-branch
  merge, customer data/admission, paid provider call or external message.
- The accepted image/archive and historical worktrees are preserved.

