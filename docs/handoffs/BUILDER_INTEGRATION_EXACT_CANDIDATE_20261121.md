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
| Full repository suite (`node scripts/test.mjs`) | **1445/1445 passed**, zero failures/skips |
| TypeScript (`tsc --noEmit`) | passed |
| Full lint (`eslint .`) | passed with 0 errors (27 existing warnings) |
| Private staging package/closure tests | 23/23 passed |
| Builder Linux qualification self-test | 13/13 passed |
| `git diff --check` | passed |

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
8. unchanged usage rows, accounting snapshot, lock recovery and closed rollback.

The results receipt records `minimization_applied`,
`restore_gate_blocked_reopen`, `restore_replay_completed`,
`restored_access_denied`, `second_restore_cycle`,
`second_restore_receipt_history_preserved`, the journal hashes and the minimised
store hashes. `accept-runtime-rollback.sh` fails closed if any of those markers
is missing.

## One exact-candidate rehearsal

`deploy/builder/private-staging/rehearse-exact-candidate.sh` has explicit
`ACTION=plan`, `ACTION=checkpoint` and `ACTION=qualify` modes:

1. `plan` writes the reviewable plan without contacting an engine, registry or
   origin.
2. `checkpoint` builds the exact candidate source SHA once, retains the local
   archive and receipt, loads/verifies it on a fresh verification daemon, verifies
   a transfer on the phase daemon when that observed daemon differs, and stops.
   It emits the verified immutable image ID plus concrete edge-setup instructions.
   The new image is not running on the fresh verification daemon.
3. `qualify` resumes only after authorized edge setup. It re-verifies the existing
   archive/receipt, observed daemon identities and running edge identity, then
   runs edge, browser, runtime, restore, minimisation, replay, second restore and
   closed rollback with that same image ID. It never rebuilds, substitutes an
   image, erases earlier qualification attempts or accepts changed
   source/origin/daemon inputs.

Engine routing is explicit per phase. `*_ENGINE` selects Docker or Podman;
`*_ENGINE_BIN` optionally selects the binary. Use exactly one daemon selector:
Docker `*_CONTEXT`, or an explicit `*_ENDPOINT`/`*_DOCKER_HOST` (Docker) or
`*_CONTAINER_HOST` (Podman). Context and endpoint cannot both select a daemon.
Podman context routing is unsupported. Build and verification must resolve to
different observed daemon identities; different caller-supplied names or image
absence are not accepted as independence. If the phase daemon differs from the
verification daemon, the archive must load and verify on a fresh phase daemon
before qualification.

Required immutable-identity chain:

```text
application source SHA
  -> acceptance harness SHA
  -> immutable image ID (sha256:<64-hex>)
  -> retained archive SHA-256 and size
  -> build and verification daemon identities
  -> optional phase-daemon transfer verification
  -> effective HTTPS origin
  -> edge/browser/runtime/restore/replay/rollback receipts
  -> minimisation journal hash and restore attempt/receipt IDs
```

An Actions artifact digest, mutable tag, loopback origin, local rebuild, reused
qualification attempt or linked dependency result must not substitute for any
link in that chain. A complete marker is written only after every resumed phase
and identity check succeeds.

## Authorization gates

Before any remote execution or artifact storage:

- obtain authorization for the Linux builder host and isolated verification
  daemon;
- obtain authorization for the private HTTPS origin, DNS/TLS edge and BasicAuth
  custody;
- obtain authorization for archive custody/storage and any registry publication;
- keep deployment, real invitations, paid calls and customer admission closed.

No remote action was taken while preparing this plan.
