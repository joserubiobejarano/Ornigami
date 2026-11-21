# Handoff — builder restore-attempt lifecycle correction

Date: 21 November 2026
Branch: `codex/ornigami-builder-minimization-20261121`
Base: `44e116366a0aca09b09bd22e87c7216ce2a8dc93`
Fix commit: `57254a95391e2f8a2672176d0cf25aa7cb8f56e6`

Status: **builder-only mechanics and synthetic regressions. No owner policy
adopted. No real store touched, no customer admission, no deployment, no
message sent and no paid call made.**

## Reproduced failure

Before the fix, the supplied `.local/review-replay.mts` showed:

```text
prepare2: replay_conflict A previous restore replay receipt conflicts with this journal.
gate present: false
reopen check: READY
invite startup: ACCEPTED
```

That meant a second restore with a newer journal was rejected, no closed gate
was left behind, and invite mode could open a restored store whose newer
minimisation had never been replayed.

After the fix the same synthetic reproduction shows:

```text
prepare2 accepted
gate present: true
reopen check: BLOCKED Restored store has no valid receipt for its current restore attempt; do not open it.
gate after missing journal: true
invite startup: BLOCKED ... Restored store has no valid receipt for its current restore attempt; do not open it.
```

`review-replay.mts` only prepares the second cycle; the lifecycle regression
below also replays it, revokes the newer subject and verifies accounting.

## Implemented lifecycle

- A restore attempt is opened durably before any journal, receipt history or
  identity-store read. The gate starts as `closed` with a new `attemptId`.
- Only after evidence loads does the gate become `prepared`, binding the attempt
  to one journal hash, ordered event-id sequence and pre-restore store hash.
- Attempt receipts are version 2 and attempt-scoped:
  `restore-replay-receipt.<attemptId>.json`, plus the stable
  `restore-replay-receipt.json` latest copy. The latest copy is archived under
  its attempt id before a newer receipt replaces it.
- Journal continuity requires both:
  - every historical receipt's ordered event ids to be a prefix of the supplied
    journal;
  - the restored backup's own journal event sequence to be a prefix of the
    supplied journal.
- A failed attempt may be re-prepared for corrected evidence only before store
  effects are written. After effects, retries must use the same journal.
- The gate is removed only after the current attempt receipt matches the
  prepared journal sequence, pre-restore hash, current store hash and all
  invariant flags. Startup performs the same verification and removes a
  complete gate; an incomplete or corrupt state stays closed.
- Invite-mode startup, session admission and ordinary writers all fail closed
  while a gate exists. `list`, `lock-status` and lock recovery remain available
  for diagnosis. The stopped-writer restore topology is unchanged.
- Usage rows, idempotency relationships, request counts, settled spend and
  reserved/unknown exposure remain unchanged. Unaffected subjects remain
  active.

## Regression evidence

`tests/builder-minimization-restore-lifecycle.test.mts` covers:

- successful restore A → ordinary operation → minimisation B → new backup →
  replay of A+B, with receipt A preserved and B revoked;
- missing/corrupt journal before the first gate, followed by startup rejection;
- a backup containing only the previous latest receipt;
- journal growth accepted while incomplete or divergent history stays closed;
- a same-image/prepared-attempt changed-intent journal rejected with
  `replay_conflict`, with the gate and store unchanged, control subject active,
  and the exact prepared journal completing the same attempt;
- corrupt historical receipt keeping the gate closed;
- interruption at `gate_closed`, `gate_prepared`, `store_written`,
  `journal_written`, `receipt_written` and `gate_removed`;
- repeated preparation and replay with attempt history preserved;
- invite-mode startup rejection after failed attempts and acceptance only after
  a verified current-attempt receipt;
- admission and ordinary writer blocking while the gate is open, then control
  subject access after replay;
- reserved/unknown usage and spend totals preserved throughout.

Commands run from `57254a9`:

```bash
node --experimental-strip-types --test \
  tests/builder-minimization.test.mts \
  tests/builder-minimization-restore-lifecycle.test.mts
# 17/17 pass

node --experimental-strip-types --test --test-concurrency=1 \
  tests/builder-client-lifecycle.test.mts \
  tests/builder-generation-limits.test.mts \
  tests/builder-identity-store.test.mts \
  tests/builder-operator-cli.test.mts \
  tests/builder-production-boundary.test.mts \
  tests/builder-request-hardening.test.mts \
  tests/builder-runtime-isolation.test.mts \
  tests/builder-store-hardening.test.mts \
  tests/builder-usage-ledger.test.mts \
  tests/builder-minimization.test.mts \
  tests/builder-minimization-restore-lifecycle.test.mts
# 83/83 pass

node node_modules/eslint/bin/eslint.js \
  builder-runtime/lib/identity-store.ts \
  builder-runtime/lib/minimization.ts \
  tests/builder-minimization.test.mts \
  tests/builder-minimization-restore-lifecycle.test.mts
# clean
```

`tsc --noEmit` reports only the pre-existing
`builder-runtime/next.config.ts` `agentUpgrade` dependency-set error; all changed
files type-check clean. Running all builder test files concurrently on Windows
can hit the 10-second store-lock wait under load; the same suites pass 83/83 with
`--test-concurrency=1` and the usage-ledger suite passes independently.

## Rollback and compatibility limitations

- Gate and receipt format is version 2. Version 1 artifacts from `44e1163` are
  preserved but fail closed under this binary; they are not auto-migrated.
- Earlier binaries ignore the v2 gate, attempt receipts and receipt history and
  do not fail closed. Rollback after an open restore attempt or a v2 receipt is
  unsupported.
- Do not delete gates, latest receipts, attempt receipts or usage rows to bypass
  a conflict. Preserve them for review.
- If prepare and replay are both skipped entirely, the runtime cannot infer that
  an arbitrary store is a restored backup. The supported restore path must call
  `restore-prepare`/`replay-minimization`; this remains a process control.
- No retention, purge, scheduler, real-store operation or customer admission is
  authorized.

## Ownership

This session owns minimization/store/operator mechanics and the new lifecycle
tests. Qualification/artifact tooling remains with the other session. This fix
changes no Dockerfile, operator command list or deployment artifact.
