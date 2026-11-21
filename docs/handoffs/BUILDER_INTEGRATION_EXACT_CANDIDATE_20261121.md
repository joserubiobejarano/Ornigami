# Builder integration and exact-candidate rehearsal plan

Date: 21 November 2026
Status: **corrected synthetic builder candidate. This supersedes `ce56ea8` as
the proposed rehearsal candidate. No CI dispatch, image build, external artifact
storage, deployment, DNS/TLS change, real invitation, paid call or customer
admission was performed.**

## Corrected integration ancestry

| Item | Exact identity |
| --- | --- |
| Starting candidate (superseded) | `ce56ea8370879192fad8d03d3bab814c1a20fdb5` |
| Shared source base | `a46f3600ef4f20817fb7a127584547064e6cfb08` |
| Orchestration tip | `340ee97c51ca56c87cd9ec36bc642f2e67ea67bd` (`codex/exact-candidate-orchestration-20261121`) |
| Journal fix commit | `9319370d589286edd56ab4c6b6a85d879db93752` |
| Journal handoff tip | `ebb487da11118ff458ecbdf1d268f2ebd5ceb5b1` (`codex/ornigami-builder-journal-continuity-20261121`) |
| Orchestration merge | `b2fe214108dcd71c0d793ca5d3f38dea1605aa00` |
| Journal merge | `285dced2df8113659bf99167f85f359b9f1246f0` |
| Final delivery tip | Reported with the delivery message; use `git rev-parse HEAD` |

Both required tips descend from `a46f360`, not from `ce56ea8`. Neither was an
ancestor of `ce56ea8` before this correction.

## Reproduced integration omission

Before the merges, on starting candidate `ce56ea8`:

- `340ee97` was **not** an ancestor;
- `ebb487d` was **not** an ancestor;
- `BUILDER_MINIMIZATION_JOURNAL_VERSION` was `1`, with no `intentDigest`,
  `journalCommitments`, gate v3 or receipt v3;
- the rehearsal accepted caller context names as independence and did not
  select Docker contexts through `DOCKER_CONTEXT`;
- `.local/review-journal-prefix.mts` reused event A's id while changing its
  subject/effects to control B.

Recorded starting-candidate output:

```text
same-ID divergent prefix: PREPARED
replay: complete
control B revoked: true
gate present: false
```

After the corrected integration, the same reproduction reports:

```text
divergence rejected: invalid_journal The minimisation journal is corrupt or has an unsupported version.
control B revoked: false
gate present: true
```

The reproduced starting-candidate failure is therefore fixed by the actual
journal tip, not recreated locally.

## Conflict-resolution record

### 1. Orchestration

Adopted `340ee97` as the orchestration source:

- per-phase `*_ENGINE`, `*_ENGINE_BIN`, `*_CONTEXT`, `*_ENDPOINT`,
  `*_DOCKER_HOST` and `*_CONTAINER_HOST` routing;
- Docker context selection via `DOCKER_CONTEXT`;
- observed build/verification/phase daemon identities rather than caller names
  or image absence;
- fresh phase-daemon transfer verification when required;
- the `edge-setup` checkpoint and explicit `ACTION=qualify` resume;
- preserved qualification attempts and resume input/identity validation.

### 2. Canonical command interface

The only supported interface is:

```text
ACTION=plan | ACTION=checkpoint | ACTION=qualify
```

`ACTION=plan` is the default. Obsolete `REHEARSAL_MODE`, `PLAN_ONLY`, `EXECUTE`
and `RESUME` inputs now fail clearly with
`<name> is obsolete; use ACTION=plan|checkpoint|qualify.` They are not silently
remapped. README, tests and this handoff use only the canonical interface.

### 3. Journal content commitments

Adopted `ebb487d` / `9319370`:

- journal format `2` with canonical immutable-intent `intentDigest`;
- prepared gate and attempt receipt format `3` with ordered
  `{id,intentDigest}` `journalCommitments`;
- prior-receipt and backup-journal commitment prefix checks;
- rejection of reused ids with altered subject, effects, timestamps, plan
  evidence or accounting, even when a digest is recomputed;
- fail-closed handling for legacy journals/gates/receipts without commitments;
- lifecycle-only journal metadata remains outside the digest.

### 4. Preserved prepared-attempt guard

The useful `ce56ea8` guard is retained on top of v3 commitments:

- replay never silently rebinds an already prepared attempt to different journal
  evidence;
- a changed journal hash or commitment sequence produces `replay_conflict`;
- explicit `restore-prepare` may correct evidence only while the store still
  equals the pre-restore hash and no effects were written;
- corrected replay then uses that explicit prepared binding.

### 5. Linux journey adaptation

`deploy/builder/qualify-linux.sh` now uses the commitment format and exercises
both required negative cases:

1. **Before preparation:** reused event ids with changed intent and a recomputed
   `intentDigest`; preserved receipt and backup-journal commitments reject it.
2. **After preparation:** changed evidence with a recomputed digest; the
   prepared-attempt guard rejects it with `replay_conflict`.

Both cases assert the store hash is unchanged, the control subject remains
active, usage/accounting is preserved and the restore gate remains closed. The
correct journal then completes the same second restore attempt. The extended
second-restore/accounting journey and same-image acceptance checks remain.

Markers required by `accept-runtime-rollback.sh` include:

```text
same_id_changed_intent_replay_blocked=true
changed_intent_gate_preserved=true
changed_intent_before_prepare_blocked=true
changed_evidence_after_prepare_blocked=true
prior_commitments_preserved=true
control_subject_access=true
```

## Verification

Clean supported install in the fresh worktree:

- Node `v22.23.3`, OpenSSL `3.5.8`;
- npm `11.21.1` from the vendored checksum-pinned archive;
- `npm ci` from the committed lockfile, no reused `node_modules`.

| Gate | Result |
| --- | --- |
| Both required tips are ancestors | yes |
| Original journal reproduction | rejected; control not revoked; gate present |
| Full repository suite (serial Windows mode) | **1460/1460 passed**, zero failures/skips |
| TypeScript (`tsc --noEmit`) | passed |
| Full lint (`eslint .`) | passed, 0 errors (28 existing warnings) |
| Minimisation/restore lifecycle suites | **23/23 passed** |
| Orchestration/rehearsal suite | passed, including obsolete-input rejection |
| Builder Linux qualification self-test | **13/13 passed** |
| Bash syntax checks | passed |
| `git diff --check` | passed |

The serial mode is the documented Windows mode for avoiding temporary
PostgreSQL `EBUSY` cleanup and builder store-lock timing flakes. No test was
omitted or weakened.

## Corrected rehearsal commands

Effective HTTPS origin placeholder: `https://builder-staging.ornigami.com`.
Use the exact authorized origin. Do not deploy automatically.

### Plan

```bash
ACTION=plan \
SOURCE_SHA=<exact-final-sha> \
APP_URL=https://builder-staging.ornigami.com \
HARNESS_SHA=<exact-final-sha> \
REHEARSAL_DIR=<new-directory> \
  bash deploy/builder/private-staging/rehearse-exact-candidate.sh
```

### Checkpoint: build once, retain, independently verify, stop

```bash
ACTION=checkpoint \
SOURCE_SHA=<exact-final-sha> \
APP_URL=https://builder-staging.ornigami.com \
HARNESS_SHA=<exact-final-sha> \
REHEARSAL_DIR=<new-directory> \
BUILD_ENGINE=docker BUILD_CONTEXT=build-runner \
VERIFY_ENGINE=docker VERIFY_CONTEXT=isolated-verifier \
PHASE_ENGINE=docker PHASE_CONTEXT=isolated-verifier \
  bash deploy/builder/private-staging/rehearse-exact-candidate.sh
```

The build and verification contexts must resolve to different observed daemon
identities. If the phase daemon differs from the verifier, the archive must load
and verify on that fresh phase daemon before qualification. The checkpoint writes
`checkpoint.json` and `CHECKPOINT_READY.txt`, including the verified image ID and
archive identity, then stops before edge qualification.

### Qualify: resume the same immutable image against the private HTTPS edge

```bash
ACTION=qualify \
REHEARSAL_DIR=<same-directory> \
BUILD_ENGINE=docker BUILD_CONTEXT=build-runner \
VERIFY_ENGINE=docker VERIFY_CONTEXT=isolated-verifier \
PHASE_ENGINE=docker PHASE_CONTEXT=isolated-verifier \
STAGING_BASIC_AUTH_USER=<private-user> \
STAGING_BASIC_AUTH_PASSWORD=<private-password> \
EDGE_APP_CONTAINER=<running-edge-app> \
EDGE_PROXY_CONTAINER=<running-caddy> \
EDGE_STORE_VOLUME=<edge-store-volume> \
BUILDER_OPERATOR_VOLUME=<edge-store-volume> \
BUILDER_RUNTIME_STORE_HOST_ID=<edge-store-host-id> \
  bash deploy/builder/private-staging/rehearse-exact-candidate.sh
```

Resume rejects changed source, origin, image, archive, daemon identities or edge
container inputs. It preserves earlier attempts, uses a new qualification attempt
directory and writes a complete marker only after every identity check succeeds.
Each phase must use the same immutable image ID.

## Authorization boundary

No CI dispatch, image build, external artifact storage, deployment, DNS change,
real invitation, paid call or customer admission is authorized by this task.
Runner, daemon, edge and artifact-custody authority must be established before
execution. Customer admission remains closed.
