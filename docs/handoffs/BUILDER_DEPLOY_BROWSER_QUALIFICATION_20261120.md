# Builder deploy/browser qualification handoff

20 November 2026. Local source only; no image was built, pushed or deployed, no
real invitation was issued and no paid call was made. Access stays closed, the
live provider and test hooks stay disabled, and real Linux execution remains
**pending**.

## Exact source

- Branch: `codex/ornigami-builder-deploy-browser-20261120`
- Base: `d58566f228861ce54548f8a19daf8426d4cdd920`
- Core implementation: `9f4476c72d89492449f21275963022f7f815b4eb`
- Worktree: `C:/Users/joser/.local/ornigami-builder-deploy-browser-20261120`

The Linux run must record its actual clean `git rev-parse HEAD` in
`results.txt`. Commits after `9f4476c` are confined to documentation and
browser-helper refinements; they do not change builder web routes, access
defaults, the store schema or the server quota contract.

The implementation is confined to the qualification harness, the operator
store-lock contract/diagnostics, focused tests and documentation. It does not
change builder web routes, access defaults or the server quota contract.
Deployment, registry publication, real invitations and paid calls remain
outside this session.

## What changed

### Qualification self-test and exact mounts

`deploy/builder/qualify-linux.sh` previously called `store_mount_args` before its
definition from the normal stub path. The failure happened inside process
substitution, produced an empty mount list and still wrote `ok=true`.

The mount builder is now defined before first use and populates one validated
`STORE_MOUNT_ARGS` array. Volume and bind modes are checked for non-empty,
comma/newline-free, correctly shaped sources and for the exact
`--mount type=<mode>,src=<source>,dst=/data/builder` pair. Every runtime,
operator and seed helper aborts if construction fails.

`node scripts/builder-linux-qualify-self-test.mjs` now runs **9/9** checks:

- pre-existing evidence directory, network, volume and container are refused and
  left intact;
- a normal run removes only its own network/container;
- the exact volume mount is present exactly once;
- the exact bind mount is present exactly once in bind mode;
- `KEEP_VOLUMES=0` removes only the run-owned volume;
- bind mode creates no named volume;
- the operator wrapper prints the isolated named-volume and bind commands;
- an invalid mount source exits non-zero and writes no `ok=true`;
- a deliberate engine `create` failure exits non-zero and writes no `ok=true`.

### Lock ownership for live runtime + packaged operator

The runtime and operator share the logical store host id but normally run in
different PID namespaces. The old `ownerIsProvablyInactive` check combined the
shared host id with a PID from the caller's namespace, which is not comparable.
The old dead-owner temp cleanup had the same problem.

Lock metadata and temp filenames now include a process scope derived from:

- the logical store host id;
- the Linux PID namespace identity (or the single-host fallback);
- the boot identity.

Automatic lock reaping acts only when host and scope match, the PID is provably
dead, and the lock was acquired after the current boot. Orphan temp cleanup only
removes same-scope dead-owner files; temp names carry the scope token. Missing
scope, foreign scope, foreign host, pre-boot locks and foreign temp files are
preserved for review and require the operator recovery path. This is the
conservative policy: there is no supported shared `/proc` across the runtime and
operator containers.

The operator can still revoke a subject while the runtime is online: a free lock
is acquired normally and a short live transaction is waited for. `lock-status`
reports the scope and owner state; `recover-lock` remains token-bound,
confirmation-required and quarantine-preserving. It never deletes
`identity-store.json` or usage records.

### Browser phase against the built container

`deploy/builder/qualify-browser.mjs` runs against the built container through a
host-loopback published port (`127.0.0.1:<port>:3000`). The container stays on
the internal default-deny network; the published port is ingress only. The
build/runtime origin is the same loopback URL. Live provider and test hooks
remain disabled, so generation uses the deterministic local fallback.

The phase issues two synthetic subjects through the packaged operator path and
proves:

- generation after refresh and after "Edit brief inputs";
- two tabs sharing the session both generate;
- replaying one generation request returns `409 request_already_submitted`;
- approval and a fresh ZIP export with receipt/meta/packshot hash and zip
  integrity;
- revoking subject A through the supported operator while A's workspace is open:
  both A tabs reach sign-in, A's builder draft keys are empty, A cannot generate
  and no A workspace text remains;
- subject B's session remains active and B can still generate;
- B signs out through the UI and its builder storage clears.

The qualification refuses a non-loopback `APP_URL` while the browser phase is
enabled. `BROWSER_PHASE=0` skips the browser phase for a non-browser packaging
smoke. Playwright Chromium is required on the browser host; `unzip` or
`python3` is required for ZIP audit.

## Local verification

All commands ran from this worktree. Synthetic data only; live provider and test
hooks disabled; no paid calls.

| Check | Result |
| --- | --- |
| `node scripts/builder-linux-qualify-self-test.mjs` | **9/9 pass** |
| Focused builder store/operator hardening tests | **15/15 pass** |
| Focused builder suites (identity/store/operator/usage/limits/request/lifecycle) | **48/48 pass** |
| `npx tsc --noEmit` | pass |
| ESLint on changed TS/MJS | pass |
| `bash -n` and `node --check` on changed scripts | pass |
| Builder production build / smoke | pass, 0 denied egress each |
| Local browser phase against production `next start` | **25/25 checks**, revision `3ffb03a5135b1d43` |

The local browser phase used:

```bash
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3041 \
  node scripts/builder-runtime-qualify.mjs build

# Invite runtime with a temporary store, live provider and test hooks disabled:
BUILDER_RUNTIME_MODE=invite \
BUILDER_RUNTIME_STORE_DIR=.local/browser-local2/store \
BUILDER_RUNTIME_STORE_HOST_ID=browser-local2-host \
BUILDER_RUNTIME_ALLOW_TEST_HOOKS=0 \
BUILDER_RUNTIME_TEST_PROVIDER=none \
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3041 \
  node node_modules/next/dist/bin/next start builder-runtime \
    --hostname 127.0.0.1 --port 3041

BROWSER_BASE_URL=http://127.0.0.1:3041 \
BROWSER_EVIDENCE_DIR=.local/browser-local2/evidence \
BROWSER_OPERATOR_MODE=local \
BROWSER_OPERATOR_STORE_DIR=.local/browser-local2/store \
BUILDER_RUNTIME_STORE_HOST_ID=browser-local2-host \
  node deploy/builder/qualify-browser.mjs
```

Local browser evidence: `.local/browser-local2/evidence/results.json`,
`downloads/browser-a.zip`, `extracted/browser-a/` and four screenshots. The
exported revision is `3ffb03a5135b1d43`; the ZIP has 14 entries and matching
meta/receipt/packshot hash. This is host-process evidence, not container/Linux
evidence.

## Pending Linux execution

No Docker, Podman, nerdctl or WSL distro is available on this workstation. The
real build, non-root container, named volume, internal-network egress denial,
restart, fresh-container restore, lock recovery on the actual volume, browser
phase through the published container port and closed rollback are **not**
executed.

Run on the authorized Linux runner from a clean checkout:

```bash
git status --porcelain                 # must be empty
SOURCE_SHA="$(git rev-parse HEAD)"
APP_URL="http://127.0.0.1:3100"

SOURCE_SHA="$SOURCE_SHA" APP_URL="$APP_URL" \
  ./deploy/builder/qualify-linux.sh
```

Prerequisites: a usable Docker/Podman daemon, root or UID 1000, host Node 22,
Playwright Chromium, and `unzip` or `python3`. If Playwright is unavailable, use
`BROWSER_PHASE=0` only for a packaging-only smoke; the final browser gate
requires the phase enabled.

Expected run evidence under `.local/builder-linux-qualification/runs/<run-id>/`:

- `results.txt`: `ok=true`, exact `source_sha`, `run_id`, `image`,
  `store_mode=volume`, `store_host_id`, `browser_phase=1`,
  `browser_origin=http://127.0.0.1:<port>`, `browser_loopback_publish=<port>`,
  `browser_journey=true`, restart/restore/session/revocation/reservation flags,
  `lock_recovery=true`, `closed_rollback_preserved_store=true`,
  `closed_records_preserved=true`, `single_replica=true` and `checks=<count>`;
- `checks.tsv`: image contract, UID/read-only, HTTP smoke, operator, restart,
  backup/restore, foreign-scope lock recovery, browser journey and closed
  rollback;
- `qualify.log`, `operator.log`, `http.log`;
- `browser/results.json`, browser downloads/extracted ZIP/screenshots;
- `backup/store/`, `store-export/`, `list-before-closed.json`,
  `list-after-closed.json`.

The result remains **explicitly pending Linux execution** until that run shows
`ok=true`. Do not report an image digest, deployment or staging acceptance from
this handoff.

## Remaining limits

- No Linux build/image digest, container runtime, named-volume, egress,
  fresh-container restore, container browser phase or closed-rollback evidence
  exists yet.
- The local browser phase used a host runtime and host operator (same PID
  namespace). The container operator's foreign-scope behavior is covered by
  store-hardening/operator tests and remains to be exercised end-to-end on
  Linux.
- Cross-container automatic lock reaping is deliberately unsupported. A stale
  runtime lock requires stop + backup + token-bound `recover-lock`; the operator
  must not delete the store or a live lock.
- The full repository suite was not rerun. Only the focused builder suites above
  were run.
- No deployment, DNS/edge change, registry publication, real invitation, live
  provider call or paid call was made or authorized.
