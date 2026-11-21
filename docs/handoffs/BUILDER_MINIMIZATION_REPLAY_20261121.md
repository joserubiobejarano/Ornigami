# Handoff — builder assisted minimisation and restore replay

Date: 21 November 2026
Branch: `codex/ornigami-builder-minimization-20261121`
Base: `f73e93fccb42d1752d77e51e9e6374752b4f23d6`
Implementation commit: `1e8063518ae8036022c884022e7523fcb7f39e45`

Status: **builder-only mechanics implemented and tested synthetically. No owner
policy adopted. No real store touched, no customer admission, no deployment, no
message sent and no paid call made.**

Owner proposals at `d6549ba454e26f1e01914c4189c9388550fe89a3` were read as
proposals. They are not adopted policy.

## What is implemented

| Area | Mechanic |
| --- | --- |
| Dry run | `minimize --store <dir> --subject <id> --plan-out <file>` prints/writes affected record IDs and categories, input/output store hashes and accounting snapshots. No labels, tokens or request content. |
| Apply | `minimize-apply --store <dir> --plan <file> --confirm-subject <id>` rejects stale/tampered plans before mutation, revokes subject sessions and unused invites, minimises labels and token hashes, and preserves every usage row. |
| Journal | `minimization-journal.json` with `pending`/`completed` events, written under the existing `identity-store.lock` and atomic temp/fsync/rename. |
| Crash guard | A pending journal blocks ordinary store writes, denies session admission with `unavailable`, and blocks runtime startup. Re-running the same plan completes it. |
| Restore gate | `restore-prepare --store <restored> --journal <file>` writes `restore-replay-gate.json` before opening a restored store. |
| Offline replay | `replay-minimization --store <restored> --journal <file>` reapplies all journaled subject revocations/minimisations, verifies usage/accounting invariants, writes `restore-replay-receipt.json`, then removes the gate. |
| Reopen check | `replay-status --store <dir>` and runtime startup fail closed if the gate has no complete matching receipt or the journal is pending. |

The detailed transaction, recovery, compatibility and rollback contract is in
[`../BUILDER_MINIMIZATION_REPLAY_CONTRACT_20261121.md`](../BUILDER_MINIMIZATION_REPLAY_CONTRACT_20261121.md).

## Accounting guarantees

Minimisation and replay do not modify `usage[]`. The tests assert:

- every usage row is byte-for-byte unchanged;
- the usage hash, request-key count, settled spend, reserved exposure, unknown
  exposure and effective-spend total are unchanged;
- `subjectId`/`sessionId`/`generationId`/`requestKey` relationships remain valid
  and idempotency keys remain unique;
- reserved and unknown records remain unresolved and keep blocking capacity;
- the control subject keeps its label, session, invite and accounting, and can
  still reserve usage.

No full purge, aggregate compaction, retention expiry, scheduler or quota reset
exists.

## Verification

Run from the handoff commit:

```bash
node --experimental-strip-types --test tests/builder-minimization.test.mts
# 12/12 pass

node --experimental-strip-types --test \
  tests/builder-client-lifecycle.test.mts \
  tests/builder-generation-limits.test.mts \
  tests/builder-identity-store.test.mts \
  tests/builder-operator-cli.test.mts \
  tests/builder-production-boundary.test.mts \
  tests/builder-request-hardening.test.mts \
  tests/builder-runtime-isolation.test.mts \
  tests/builder-store-hardening.test.mts \
  tests/builder-usage-ledger.test.mts \
  tests/builder-minimization.test.mts
# 78/78 pass

node node_modules/eslint/bin/eslint.js \
  builder-runtime/lib/identity-store.ts \
  builder-runtime/lib/minimization.ts \
  builder-runtime/lib/runtime-config.ts \
  scripts/builder-invite-operator.mjs \
  tests/builder-minimization.test.mts
# clean
```

Full repository runner: `node scripts/test.mjs` reported **1421/1422 pass**. The
single failure is `tests/a01-fast-glob-compat.test.mts:46` (installed
`@typescript-eslint` consumer source mismatch: expected 2 `isDynamicPattern`
calls, found 0). It reproduces unchanged in the base checkout
`C:/Users/joser/Desktop/Projects/Ornigami` with the same `node_modules`; it is
not caused by this change. The local `node_modules` was a junction to that
checkout because the new worktree has no install.

TypeScript: `tsc --noEmit` reports only the pre-existing
`builder-runtime/next.config.ts` `agentUpgrade` property error produced by the
linked dependency set. All changed files type-check clean.

`git diff --check` is clean.

## Test coverage against the requested fixtures

| Fixture | Test |
| --- | --- |
| Normal plan/apply, no token/label exposure | `dry-run lists affected ids/categories...` |
| Control subject access/accounting intact | same test and concurrent-operator test |
| Older backup resurrection | `offline replay resurrects an older backup...` |
| Repeated replay | same test, second replay |
| Concurrent identical applies | `concurrent identical applies...` |
| Concurrent operator activity | `concurrent operator activity...` |
| Interrupted apply before/after store write | `interrupted apply leaves durable evidence...` |
| Interrupted replay before receipt | `an interrupted replay keeps the restore gate closed...` |
| Stale and tampered plans | `stale and tampered plans are rejected...` |
| Missing/corrupt/incomplete journal | `missing, corrupt, incomplete...` |
| Inconsistent accounting/store | same test |
| Pending journal blocks reopening | `a pending apply journal blocks runtime reopening` |
| Restore gate before replay | `restore-prepare closes a restored store...` |
| Unresolved reserved/unknown preservation | plan/apply and replay tests |
| Operator CLI | `the supported operator CLI exposes...` |

## File ownership and integration notes

This session owns the new files:

- `builder-runtime/lib/minimization.ts`
- `tests/builder-minimization.test.mts`
- `docs/BUILDER_MINIMIZATION_REPLAY_CONTRACT_20261121.md`
- this handoff

Minimal integration edits were required in shared packaging/runtime files:

- `builder-runtime/lib/identity-store.ts` — journal schema/IO, atomic writer
  reuse, pending-journal guard, restore gate check;
- `builder-runtime/lib/runtime-config.ts` — startup gate;
- `scripts/builder-invite-operator.mjs` — new commands;
- `deploy/builder/operator.sh` — command allowlist only;
- `deploy/builder/Dockerfile` — one copy line for the new operator module;
- `deploy/builder/README.md` — supported-command list and contract link.

The artifact/acceptance session should re-run its Linux packaging/operator
qualification on the merged candidate. No image was built or deployed here.

## Not implemented / pending owner policy

Still pending and deliberately absent:

- retention periods or deletion deadlines;
- full purge, aggregate spend/count tombstones or raw-usage compaction;
- automatic expiry, cleanup, scheduler or cron;
- self-service or customer-facing deletion;
- journal retention, approver identity/authority, dual control or operator
  signatures;
- encrypted off-host backup, key custody or independent restore review;
- customer notice/addendum, customer admission, real invitations or support
  routing;
- deployment, registry publication, DNS/edge change, provider calls or paid
  calls.

Do not treat the synthetic receipt, gate or journal as customer-admission
evidence. Do not delete the journal, gate, receipt or usage rows to bypass a
limit.
