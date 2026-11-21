# Builder integration and exact-candidate rehearsal plan

Date: 21 November 2026
Status: **integrated synthetic builder candidate. No deployment, registry
publication, remote execution, artifact storage, DNS/TLS change, real invitation,
paid call or customer admission was performed.**

## Integrated corrections

| Item | Exact identity |
| --- | --- |
| Shared parent | `f73e93fccb42d1752d77e51e9e6374752b4f23d6` (`docs: add synthetic private staging acceptance package`) |
| Review tip 1 | `5b476fdfdc3b0cbff9888dc3fdfec11d57fa5d24` (`codex/builder-private-staging-https-closure-20261121`, `fix: close private staging HTTPS and archive qualification gaps`) |
| Review tip 2 | `6414bd2365483136cedc944e78c71b05d089e803` (`codex/ornigami-builder-minimization-20261121`, `docs(builder): record restore-attempt lifecycle evidence`) |
| Tip-1 merge | `419ec187512552bff81dcc4203c8e1a9c936506f` |
| Tip-2 merge | `f5e6977c7cae5ad8a02939d0e4a4386c636e158a` |
| Final delivery tip | Reported with the delivery message; use `git rev-parse HEAD` |

Both tips descend from the same shared parent. The only shared file changed by
both tips is `deploy/builder/README.md`. The merge was reviewed explicitly and
retains both scopes:

- tip 1's `QUALIFICATION_PATH=http-loopback` versus `https-edge` browser/runtime
  origin contract;
- tip 2's added `minimize`, `minimize-apply`, `restore-prepare`,
  `replay-minimization`, `replay-status` operator commands and contract link.

No side was dropped, no shared test assertion was weakened, and no dependency
result from a linked checkout was reused as candidate evidence.

## Clean toolchain and verification

The local checkout now has its own dependency tree. It is not a junction to
another worktree. Installation used the supported toolchain inputs:

- Node `v22.23.3`, OpenSSL `3.5.8` (official Windows x64 archive, SHA-256 verified
  against the nodejs.org `SHASUMS256.txt`);
- npm `11.21.1` from the repository's vendored
  `vendor/build-tools/npm-11.21.1.tgz` (SHA-256
  `dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b`);
- `npm ci` from the committed lockfile with no reuse of another checkout's
  `node_modules`.

Results:

| Gate | Result |
| --- | --- |
| Full repository suite (`node scripts/test.mjs`, serial on Windows) | **1447/1447 passed**, zero failures/skips |
| TypeScript (`tsc --noEmit`) | passed |
| Full lint (`eslint .`) | passed with 0 errors (27 existing warnings) |
| Private staging package/closure tests | 24/24 passed |
| Minimisation/restore lifecycle tests | 18/18 passed |
| Local rehearsal prepare/resume routing with stub engines | passed |
| Builder Linux qualification self-test | 13/13 passed |
| `git diff --check` | passed |

The full suite was run with `--test-concurrency=1` because parallel Windows runs
can hit the already-documented temporary-PostgreSQL `EBUSY` cleanup and builder
store-lock timing flakes. No test was skipped or weakened.

### Reported fast-glob failure

The earlier `tests/a01-fast-glob-compat.test.mts` failure came from a linked
`node_modules` tree whose installed `@typescript-eslint` consumer source did not
match its lock. With the clean install, `node_modules/fast-glob` resolves to this
worktree's `scripts/vendor/fast-glob-compat`, and the unmodified compatibility
suite passes **11/11**. The assertion remains: it still requires two
`isDynamicPattern` calls and the exact adapter-only API surface.

### Reported agentUpgrade failure

The earlier `builder-runtime/next.config.ts` `agentUpgrade` type error came from
the linked older Next dependency set. The clean lock resolves Next `16.4.5`,
whose config type accepts the reviewed `experimental.agentUpgrade: false`
setting. `tsc --noEmit` now passes without changing the config, removing the
setting or weakening
`tests/builder-runtime-isolation.test.mts`.

## Extended synthetic Linux journey

`deploy/builder/qualify-linux.sh` now extends the existing restart/restore/lock/
closed-rollback journey with:

1. a reviewed minimisation of subject A in the stopped authoritative store;
2. a backup that predates minimisation A;
3. `restore-prepare`, which must block reopening before replay;
4. `replay-minimization` of journal A into the older backup;
5. HTTP denial of the restored minimised subject;
6. a second restore cycle: snapshot restore A, minimise B, grow the journal to
   A+B, restore the older snapshot, replay A+B;
7. preservation of receipt A while only B is applied, and denial of both A and B
   after the second restore;
8. a same-image/changed-intent negative replay after the second attempt is
   prepared: replay rejects the changed journal, keeps the gate closed and the
   store hash unchanged, and leaves the control subject active; the exact
   prepared journal then completes the same attempt;
9. unchanged usage rows, accounting snapshot, lock recovery and closed rollback.

The results receipt records `minimization_applied`,
`restore_gate_blocked_reopen`, `restore_replay_completed`,
`restored_access_denied`, `second_restore_cycle`,
`second_restore_receipt_history_preserved`,
`same_id_changed_intent_replay_blocked`, `changed_intent_gate_preserved`,
`control_subject_access`, the journal hashes and the minimised store hashes.
`accept-runtime-rollback.sh` fails closed if any of those markers is missing.

## One exact-candidate rehearsal

`deploy/builder/private-staging/rehearse-exact-candidate.sh` prepares one
reviewable plan and, only with explicit authorization, executes it:

1. build the exact candidate source SHA once;
2. retain the local archive and its receipt in an explicitly authorized custody
   directory;
3. independently load and verify that archive on a daemon context separate from
   the build daemon;
4. stop at the durable `edge-setup` checkpoint;
5. resume against the matching private HTTPS edge and run edge, browser,
   runtime, restore, minimisation, replay, same-ID/changed-intent negative,
   second restore and closed rollback with that one immutable image ID;
6. reconcile source SHA, harness SHA, image ID, archive SHA-256/size, custody
   path and the effective HTTPS origin across every receipt.

The default is `REHEARSAL_MODE=plan`; it contacts no engine, registry or origin.
Prepare/resume require the runner, daemon, edge and artifact-custody authority
flags plus a fresh archive-verification daemon and all staging credentials/edge
inputs. The script never pushes an image, deploys, changes DNS or opens customer
admission. Rehearsal routing and the checkpoint/resume path are exercised locally
with stub build/verify engines and a stub qualification runner before any remote
execution request.

Required immutable-identity chain:

```text
application source SHA
  -> acceptance harness SHA
  -> immutable image ID (sha256:<64-hex>)
  -> retained archive SHA-256 and size
  -> effective HTTPS origin
  -> edge/browser/runtime/restore/replay/rollback receipts
  -> minimisation journal hash and restore attempt/receipt IDs
```

An Actions artifact digest, mutable tag, loopback origin, local rebuild or linked
dependency result must not substitute for any link in that chain.

## Authorization gates

Before any remote execution or artifact storage:

- obtain authorization for the Linux builder host and isolated verification
  daemon;
- obtain authorization for the private HTTPS origin, DNS/TLS edge and BasicAuth
  custody;
- obtain authorization for archive custody/storage and any registry publication;
- keep deployment, real invitations, paid calls and customer admission closed.

No remote action was taken while preparing this plan.
