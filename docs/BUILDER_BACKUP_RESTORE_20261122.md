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

node --experimental-strip-types scripts/builder-backup-restore.mjs replay \
  --store <fresh-restore-dir> --journal <latest-authoritative-journal.json> \
  --acknowledge-usage-window [--acknowledge-open-usage] \
  [--receipt <new-replay-receipt.json>]
```

`inspect` reads only the archive header and never needs the passphrase. The
other commands print a JSON receipt. Secrets are not printed.

## Archive format

- magic/versioned container: `ORNIBAK1`, format version `1`;
- payload: canonical JSON manifest plus file bytes;
- encryption: AES-256-GCM (authenticated encryption, 128-bit tag);
- key derivation: scrypt (`N=32768`, `r=8`, `p=1`, 32-byte key, 16-byte salt);
- fresh random 12-byte nonce per archive;
- the header is authenticated as additional data;
- file writes use a same-directory temporary file, `fsync`, and rename;
- archive/receipt files are written `0600`; restore writes the original file
  modes from the manifest.

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

## Restore and admission gate

Restore decrypts and verifies the complete manifest before creating the output.
It then writes a valid **closed** `restore-replay-gate.json` first, writes the
store/journal/receipts, re-hashes the restored store, recomputes accounting and
verifies the gate. Admission is unavailable and session validation throws while
the gate exists.

The operator must run `replay` with the latest authoritative journal. Replay uses
the existing gate, minimization-journal continuity, receipt-history and
accounting machinery. It removes the gate only after the existing replay receipt
matches the gate and the store. A missing, corrupt or inconsistent journal or
receipt history leaves the gate closed.

Required acknowledgements are deliberate:

- `--acknowledge-point-in-time` on restore;
- `--acknowledge-usage-window` on replay;
- `--acknowledge-open-usage` when the restored accounting still contains
  `reserved` or `unknown` usage.

These are acknowledgements, not fixes. They do not reconstruct post-backup
usage, settlement or provider outcomes, and they do not open customer admission.

## Point-in-time limits

A backup is a snapshot, not a database rewind:

- usage and settlement written after the backup are not reconstructed;
- the latest authoritative minimization journal can replay minimization effects,
  but it cannot recover missing usage/settlement records;
- reserved/unknown usage remains exactly as restored and must be reconciled by
  the operator;
- an older backup plus a newer journal is only safe when the operator accepts
  the usage/settlement gap;
- a missing or uncertain accounting record keeps admission closed;
- the tool never calls a provider, retries a generation or invents a settlement.

The source store is never deleted or overwritten. Restore always targets a
fresh directory/volume. Rollback before admission is the preserved source
volume plus the backup; rollback after admission does not undo post-restore
usage.

## Verification evidence (Windows)

Executed on Windows 11 x64 with Node `v24.11.1`:

```text
node --experimental-strip-types --test tests/builder-backup-restore.test.mts
15/15 pass
```

Covered:

- encrypted backup and authenticated inspect/verify;
- fresh restore with a closed gate and unavailable admission/session;
- wrong key, corrupted archive and truncated archive;
- missing journal and corrupt/missing receipt history;
- older backup followed by newer minimization and replay;
- repeated replay idempotence and unchanged store hash;
- reserved/unknown usage preservation and explicit acknowledgement;
- control-subject session behavior after replay;
- interruption after gate, files, receipt and during replay, with resumable
  closed gates;
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

