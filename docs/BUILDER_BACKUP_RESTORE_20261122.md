# Builder encrypted backup and recovery — 22 November 2026

Status: **operator-controlled synthetic mechanics only. No backup destination,
frequency, retention period, key custodian, support policy or customer admission
is adopted.** The tool uses synthetic stores and synthetic passphrases only.

## Topology

Supported topology:

- one host, one builder runtime replica and one writer;
- the runtime and every operator process are stopped before the backup;
- the store is a local directory/volume with `identity-store.json`,
  `minimization-journal.json` and restore-replay receipt history;
- restore writes into a **fresh, empty directory or volume**;
- the restored store remains closed by a restore-replay gate until the latest
  authoritative journal is replayed and verified.

Unsupported: live copy of a running store, shared filesystem, horizontal
writers, copying a live lock into a replacement volume, or using a reputation
database/job.

## Tool

`scripts/builder-backup-restore.mjs` is a builder-only operator tool. It imports
the existing store serialization, lock, restore-gate, minimization and replay
modules; it does not implement a second store or a second journal.

Commands (run from a clean source/operator checkout):

```bash
node --experimental-strip-types scripts/builder-backup-restore.mjs backup \
  --store <store-dir> --out <new-archive.ornibak> \
  --passphrase-file <0600-passphrase-file> [--receipt <new-receipt.json>]

node --experimental-strip-types scripts/builder-backup-restore.mjs inspect \
  --archive <new-archive.ornibak>

node --experimental-strip-types scripts/builder-backup-restore.mjs verify \
  --archive <new-archive.ornibak> --passphrase-file <0600-passphrase-file>

node --experimental-strip-types scripts/builder-backup-restore.mjs restore \
  --archive <new-archive.ornibak> --out <fresh-restore-dir> \
  --passphrase-file <0600-passphrase-file> \
  --acknowledge-point-in-time [--receipt <new-restore-receipt.json>]

node --experimental-strip-types scripts/builder-backup-restore.mjs evidence \
  --store <live-stopped-store> --out <new-reconciliation-evidence.json>

node --experimental-strip-types scripts/builder-backup-restore.mjs replay \
  --store <fresh-restore-dir> --journal <latest-authoritative-journal.json> \
  [--acknowledge-usage-window] [--acknowledge-open-usage] \
  [--receipt <new-replay-receipt.json>]

node --experimental-strip-types scripts/builder-backup-restore.mjs reconcile \
  --store <fresh-restore-dir> \
  --reconciliation <new-reconciliation-evidence.json> \
  [--restore-receipt <restore-receipt.json>] \
  [--replay-receipt <replay-receipt.json>] \
  [--acknowledge-open-usage] [--receipt <new-reconciliation-receipt.json>]
```

`inspect` reads only the archive header and never needs the passphrase. The
other commands print a JSON receipt. Secrets are not printed. `replay` does not
release admission; `reconcile` is the only command that can remove the restore
gate, and only with authoritative evidence.

## Archive format

- magic/versioned container: `ORNIBAK1`, format version `1`;
- payload: canonical JSON manifest plus file bytes;
- encryption: AES-256-GCM (authenticated encryption, 128-bit tag);
- key derivation: scrypt (`N=32768`, `r=8`, `p=1`, 32-byte key, 16-byte salt);
- fresh random 12-byte nonce per archive;
- the header is authenticated as additional data;
- publication uses a same-directory temporary file, `fsync`, and an atomic
  **hard-link** to the final name; an existing archive or receipt is never
  replaced, and only this operation's temporary file is removed;
- archive/receipt files are written `0600`; restore writes the original file
  modes from the manifest. Directory `fsync` is attempted and unsupported
  platform errors are documented, not treated as a power-loss proof.

The payload contains:

- source host ID, store version and exact `identity-store.json` SHA-256;
- journal presence/hash and latest journal event time;
- restore-replay receipt IDs;
- accounting snapshot (usage records, request keys, settled/reserved/unknown
  exposure);
- every included file with path, mode, size, SHA-256 and base64 content;
- explicit exclusions and point-in-time limitations.

## Included and excluded

Included:

- `identity-store.json`;
- `minimization-journal.json` (a canonical empty journal is recorded when the
  live store has none);
- `restore-replay-receipt.json` and
  `restore-replay-receipt.<attemptId>.json` history.

Excluded and refused if present:

- `identity-store.lock` and `identity-store.reap.lock`;
- temporary files;
- `restore-replay-gate.json` (an unresolved restore must be finished first);
- any unrecognized file or symlink.

Backup refuses a pending minimization journal, corrupt receipt history,
non-private POSIX permissions, a live/stale lock or a non-empty output path.

## Restore, replay, reconciliation and admission

These are separate operations:

1. **Restore** decrypts and verifies the manifest, writes a closed
   `restore-replay-gate.json` first, writes the store/journal/receipts, re-hashes
   the store, recomputes accounting and leaves admission unavailable.
2. **Replay** applies the latest authoritative minimization journal and verifies
   journal continuity plus the existing replay receipt. It **does not remove the
   restore gate**. Its receipt says `status=replayed-closed`,
   `admissionClosed=true` and `reconciliationRequired=true`.
3. **Reconciliation** consumes a separate authoritative evidence file captured
   from the latest stopped live store by the `evidence` command. The evidence
   records the live store hash, journal identity, full usage rows, usage hash,
   accounting snapshot, receipt IDs and capture time, with a self-integrity ID.
4. **Admission release** is a consequence of matching evidence only. The
   reconciliation command verifies the restored store hash, usage hash,
   accounting, journal/replay receipt and evidence freshness. It removes the
   gate only after the replay receipt matches; the final receipt says
   `status=complete` and `admissionClosed=false`.

Matching evidence proves that the restored store equals the latest
authoritative live store for the accounted fields. It does not prove that an
older backup contains post-backup usage: if live usage or settlement changed,
the hashes differ, reconciliation is blocked, and the gate stays closed. The
actionable message is to use a newer backup or authoritative evidence; the tool
never invents the missing records.

Acknowledgements are recorded but are **not evidence**:

- `--acknowledge-point-in-time` on restore;
- optional `--acknowledge-usage-window` on replay;
- `--acknowledge-open-usage` when reserved/unknown exposure remains.

`--acknowledge-open-usage` does not discard the exposure; it only confirms that
the operator reviewed it before evidence-backed release. Missing, stale,
mismatched or corrupt evidence keeps the gate closed. If final receipt
publication fails after gate release, the tool re-closes the store with a new
gate and reports the failure.

## Reconciliation evidence

`evidence` requires a stopped, clean store with no lock, restore gate or pending
minimization journal. It writes private evidence outside the store. The evidence
contains usage metadata and accounting, not brief text or key material; treat it
as private operational data. It is generated by the tool from the live store,
not by acknowledgement flags or an edited packet.

The reconciliation receipt records the evidence hash, store/usage hashes,
journal hash, accounting, acknowledgements and actual admission state. A
blocked receipt records `admissionClosed=true` and the exact mismatch reason.

## Point-in-time limits

A backup is a snapshot, not a database rewind:

- usage and settlement written after the backup are not reconstructed;
- the latest authoritative minimization journal can replay minimization effects,
  but it cannot recover missing usage/settlement records;
- reserved/unknown usage remains exactly as restored and must be reviewed by
  the operator; it is never discarded or reset;
- an older backup plus a newer journal remains closed when authoritative
  evidence differs; an acknowledgement cannot substitute for a newer backup;
- a missing, stale, mismatched or uncertain accounting record keeps admission
  closed;
- the tool never calls a provider, retries a generation or invents a settlement.

The source store is never deleted or overwritten. Restore always targets a
fresh directory/volume. Rollback before admission is the preserved source
volume plus the backup; rollback after admission does not undo post-restore
usage.

## Verification evidence (Windows)

Executed on Windows 11 x64 with Node `v24.11.1`:

```text
node --experimental-strip-types --test tests/builder-backup-restore.test.mts
20/20 pass
```

Covered:

- encrypted backup and authenticated inspect/verify;
- fresh restore with a closed gate and unavailable admission/session;
- wrong key, corrupted archive and truncated archive;
- missing journal and corrupt/missing receipt history;
- older backup followed by newer minimization, closed replay and evidence-backed release;
- repeated default-path replay idempotence and unchanged store hash;
- reserved/unknown usage preservation and explicit acknowledgement;
- control-subject session behavior after reconciliation;
- post-backup usage/settlement keeps admission closed; a newer authoritative
  snapshot can release it;
- stale/missing/mismatched reconciliation evidence keeps the gate closed;
- no-clobber archive/JSON publication, competing outputs, concurrent
  publication and link-interruption cleanup;
- interruption after gate, files, receipt, during replay and before admission
  release, with resumable closed gates;
- pending journal, restore gate, lock and unrecognized-file backup refusal;
- missing acknowledgement and non-empty output refusal;
- private POSIX permissions (skipped on Windows; Linux-only assertion);
- operator CLI backup/inspect/restore/replay end to end;
- existing builder store/minimization/usage suites: 57/57 pass.

Windows does not enforce POSIX `0700/0600` modes, Docker volume semantics,
filesystem `fsync` behavior or the packaged operator image. Those remain
Linux-only requirements.

## Linux-only requirements before real use

1. Run the tests on the target Linux/Node 22 image or operator host and confirm
   POSIX mode assertions.
2. Stop the runtime and every operator writer; verify no lock/gate/temp state
   remains before backup.
3. Snapshot the actual Docker volume or bind directory with the approved
   host-level tool, preserving the store directory as a unit.
4. Deliver the passphrase through an owner-approved `0600` file or secret
   mechanism; never put it in command history, logs, receipts or the archive.
5. Restore into a fresh run-owned volume/container, replay the latest
   authoritative journal, reconcile reserved/unknown usage and verify
   admission/session behavior before opening the beta.
6. Apply the owner's destination, frequency, retention, key custody and
   recovery-operator decisions; none are adopted here.

The frozen qualified image predates this tool. Do not assume it contains the new
script; running the tool from a new image requires a separately scoped image
build/qualification. The tool can be run from a clean source/operator checkout
against a stopped volume.

## Owner decisions still required

See [the consolidated decision request](./OWNER_DECISIONS_BETA_20261122.md).
Until those decisions are answered, backup destination/frequency/retention/key
custody and customer admission remain pending.
