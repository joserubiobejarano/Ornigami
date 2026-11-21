# Handoff — journal immutable-intent commitments

Date: 21 November 2026
Branch: `codex/ornigami-builder-journal-continuity-20261121`
Base: `a46f3600ef4f20817fb7a127584547064e6cfb08`
Fix commit: `9319370d589286edd56ab4c6b6a85d879db93752`

Status: **builder-only mechanics and synthetic regressions. No owner policy
adopted. No real store touched, no customer admission, no deployment, no paid
call.**

## Reproduced failure

The supplied `.local/review-journal-prefix.mts` reused event A's id while
changing its subject and effects to control subject B. Before the fix it
reported:

```text
same-ID divergent prefix: PREPARED
replay: complete
control B revoked: true
gate present: false
```

After the fix:

```text
divergence rejected: invalid_journal ...
control B revoked: false
gate present: true
```

The rejection occurs before store effects; the restore gate remains closed and
invite-mode startup is still refused.

## Implemented content commitments

- Journal format is now version `2`. Each event separates:
  - immutable intent: event id/kind, subject, reviewed plan id, planned and
    expected store hashes, `effectAt`, `createdAt`, effects, summary and
    accounting snapshot;
  - lifecycle metadata: `phase`, `completedAt`, `resultStoreHash`,
    `replayedAt`, `replayedStoreHash`.
- `intentDigest` is SHA-256 over canonical immutable intent. It is recomputed
  and verified whenever a journal is read.
- Gate and receipt format is version `3`. Prepared gates and attempt receipts
  carry ordered `journalCommitments: [{ id, intentDigest }]`.
- Continuity requires the receipt commitments and the backup journal commitments
  to be true content prefixes of the supplied journal. Ordered ids alone are no
  longer used.
- Apply still validates journal intent against the reviewed plan fields before
  effects.
- Recomputing a digest beside modified content is insufficient: earlier
  receipts and the backup journal retain the original commitments and reject it.
- Legitimate lifecycle metadata changes do not alter `intentDigest`, so
  pending/completed and replay metadata can advance normally.
- Evidence lacking commitments fails closed:
  - version `1` journals without `intentDigest`;
  - version `2` gates/receipts without `journalCommitments`;
  - duplicate, misnamed or conflicting receipt commitments.

## Regressions added

In `tests/builder-minimization-restore-lifecycle.test.mts`:

- reused event id with altered subject;
- reused event id with altered effects;
- reused event id with altered timestamps;
- reused event id with altered plan/accounting evidence;
- recomputed digest with receipt-only prior evidence;
- changed content prefix plus appended events with backup-journal commitments;
- legitimate lifecycle metadata updates for completed and pending events;
- version `1` journal and version `2` receipt fail-closed treatment;
- existing gate-first, crash-recovery, repeated-restore and accounting tests
  remain in place.

Every rejection asserts the store hash is unchanged, control subject B is not
revoked, the control subject C remains intact, usage rows and accounting totals
are preserved, and invite-mode startup is blocked.

## Verification

```bash
node --experimental-strip-types --test \
  tests/builder-minimization.test.mts \
  tests/builder-minimization-restore-lifecycle.test.mts
# 22/22 pass

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
# 88/88 pass

node node_modules/eslint/bin/eslint.js \
  builder-runtime/lib/identity-store.ts \
  builder-runtime/lib/minimization.ts \
  tests/builder-minimization.test.mts \
  tests/builder-minimization-restore-lifecycle.test.mts
# clean
```

`tsc --noEmit` reports only the pre-existing
`builder-runtime/next.config.ts` `agentUpgrade` dependency-set error; changed
files type-check clean.

## Compatibility and rollback

- `identity-store.json` remains version `1`.
- Journal format is version `2`; gate/receipt format is version `3`.
- Version `1` journals and version `2` gates/receipts are preserved but fail
  closed because they lack the commitments required to prove content
  continuity. They are not auto-migrated.
- Earlier binaries ignore the commitments and do not fail closed. Rollback
  after a pending apply or any v3 restore attempt is unsupported.
- Do not delete journals, gates, latest receipts, attempt receipts or usage rows
  to bypass a conflict.
- The stopped-writer restore topology remains required.

## Ownership

This session owns minimization/store mechanics, lifecycle tests and their
contracts. Qualification/artifact tooling remains with the other session. This
fix changes no Dockerfile, operator command list or deployment artifact.
