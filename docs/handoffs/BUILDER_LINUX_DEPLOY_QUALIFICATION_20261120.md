# Builder Linux deploy qualification handoff

20 November 2026. Local source only; no image was built, pushed or deployed, no
real invitation was issued and no paid call was made. **Linux execution remains
pending**: this workstation has no Docker, Podman, nerdctl or WSL distro. No
image digest exists.

## Exact source

- Branch: `codex/ornigami-builder-deploy-20261120`
- Base: `5a5db54b7764a7dbf98637874e31c0061a66cee8`
- Implementation commit: `5a29d04cd784f440620a01460ec308e832e8e07b`
- Worktree: `C:/Users/joser/.local/ornigami-builder-deploy-20261120`

The implementation is confined to `deploy/builder/`, the operator CLI and its
additive store diagnostics, a local self-test script and focused tests. It does
not change the builder web routes, the server quota contract, or access
defaults. Deployment, registry publication, real invitations and paid calls
remain outside this session.

The operational decision and procedure are in
[`docs/BUILDER_DEPLOY_OPERATIONS_20261120.md`](../BUILDER_DEPLOY_OPERATIONS_20261120.md).
The image/operator/lock runbook is in
[`deploy/builder/README.md`](../../deploy/builder/README.md).

## What changed

### Rerun-safe qualification

`deploy/builder/qualify-linux.sh` now derives a unique `RUN_ID` and scopes every
path and resource:

- evidence, backup, restore and store-export directories under
  `.local/builder-linux-qualification/runs/<RUN_ID>/`;
- image, containers, network and named volumes with the run id in their names;
- an existence check before every path/resource, refusing instead of deleting or
  reusing;
- `org.ornigami.qualify.run=<RUN_ID>` on every created resource, re-checked
  before cleanup;
- cleanup removes only run-owned containers/network, keeps volumes by default
  (`KEEP_VOLUMES=1`), and removes volumes/image only on explicit opt-in;
- `KEEP_ON_FAILURE=1` retains failed-run containers/network/volumes for
  inspection;
- prior evidence, backups, stores and containers are never touched.

### Supported operator CLI path

The runtime image now contains `scripts/builder-invite-operator.mjs` and its
source-only dependency closure (`identity-store.ts`, `usage-ledger.ts`). The
build stage smoke-tests `lock-status`, so a broken operator import fails the
image build.

`deploy/builder/operator.sh` is the supported wrapper:

```bash
BUILDER_OPERATOR_IMAGE=<image> \
BUILDER_OPERATOR_VOLUME=<volume> \
BUILDER_RUNTIME_STORE_HOST_ID=<same-as-runtime> \
  ./deploy/builder/operator.sh list --json
```

It runs the image's Node 22 with `--network none`, `--read-only`,
`--user 1000:1000`, the same persistent volume at `/data/builder`, and the same
store host id. `BUILDER_OPERATOR_STORE=<absolute-host-dir>` selects bind mode;
`--print-command` prints the exact command without an engine.

The operator CLI adds read-only `lock-status` and token-bound
`recover-lock --confirm-no-writers`. Recovery refuses a missing/corrupt store,
refuses a changed token or successor lock, renames observed locks to
timestamped `*.recovered.*` quarantine files, never deletes them, and verifies
the `identity-store.json` hash did not change.

### Restart, fresh-volume restore and closed rollback

The Linux harness now uses a **named persistent volume** by default and one
runtime container at a time. It seeds two synthetic identities and one
unresolved usage reservation, then requires after a same-container restart and
after backup into a **fresh volume + fresh container**:

- identity A's valid session: `200`;
- identity B's revoked session: `401`;
- a new generation for identity A: `429 subject_concurrency`;
- the seeded `reserved` usage record and the store SHA-256 unchanged.

On the restore copy only, it injects a foreign-host stale lock and proves
recovery refuses without confirmation or with a wrong token, then succeeds with
the observed token and leaves the store hash unchanged. Finally it starts the
same image in `closed` mode against the authoritative volume and proves home
`200`, `/builder` `404`, anonymous session `401`, unchanged store hash, and
unchanged subject/session/usage records.

## Local verification

All commands ran from the worktree. Synthetic data only; live provider and test
hooks disabled; no paid calls.

| Check | Result |
| --- | --- |
| `node scripts/builder-linux-qualify-self-test.mjs` | **7/7 pass** |
| `node --experimental-strip-types --test tests/builder-operator-cli.test.mts` | **4/4 pass** |
| Focused builder identity/store/operator/usage/limits suites | **38/38 pass** |
| `npx tsc --noEmit` | pass |
| ESLint on changed TS/MJS | pass |
| `bash -n` on qualification, operator and stub scripts | pass |
| `node --check` on HTTP/seed/self-test helpers | pass |
| `node scripts/builder-runtime-qualify.mjs build` | pass, 0 denied egress |
| `node scripts/builder-runtime-qualify.mjs smoke` | pass, 0 denied egress |

The self-test proves with a stub engine that an existing evidence directory,
network, volume and container are refused and left intact; that a normal run
removes only its own network/container; that `KEEP_VOLUMES=0` removes only its
own volume; that bind mode creates no named volume; and that the operator
wrapper prints the expected isolated command for volume and bind stores.

It does **not** build the image or exercise the container runtime. Those remain
Linux-pending.

## Pending Linux execution

No Docker, Podman, nerdctl, WSL distro or Bash-on-Linux engine is available on
this workstation. Run the following on an authorized Linux runner from a clean
checkout of the committed candidate:

```bash
git status --porcelain                 # must be empty
SOURCE_SHA="$(git rev-parse HEAD)"
APP_URL="http://127.0.0.1:3100"

SOURCE_SHA="$SOURCE_SHA" APP_URL="$APP_URL" \
  ./deploy/builder/qualify-linux.sh
```

Use `ENGINE=podman` if that is the authorized engine. If the runner is root,
preserve the environment (`sudo -E`). The script refuses a dirty worktree and a
`SOURCE_SHA` that differs from `HEAD`.

Expected evidence in `.local/builder-linux-qualification/runs/<run-id>/`:

- `results.txt` with `ok=true`, the exact `source_sha`, `run_id`, `image`,
  `store_mode=volume`, `store_host_id`, `store_sha256`, `backup_sha256`, the
  restart/restore/session/revocation/reservation flags, `lock_recovery=true`,
  `closed_rollback_preserved_store=true`, `closed_records_preserved=true`,
  `single_replica=true` and `checks=<count>`;
- `checks.tsv` with the image contract, UID/read-only, HTTP smoke, operator,
  restart, backup/restore, lock-recovery and closed-rollback checks;
- `qualify.log`, `operator.log`, `http.log`;
- `backup/store/`, `store-export/`, `list-before-closed.json`,
  `list-after-closed.json`.

The run remains **explicitly pending Linux execution** until those files show
`ok=true`. Do not report an image digest, deployment, or staging acceptance
from this handoff.

## Remaining limits

- No Linux build, image digest, container, named-volume, egress, restore or
  closed-rollback execution exists yet.
- The runner must have a usable Docker/Podman daemon and run as root or UID
  1000 so the UID 1000 helper containers can write the backup/evidence
  directories.
- The harness requires host `node` for operator JSON parsing and
  `sha256sum`/`shasum`; the final checklist already requires Linux/Node 22.
- One replica, one local store and one writer remain mandatory. The operator
  and read-only hash helpers must not be treated as additional replicas.
- `BUILDER_RUNTIME_STORE_HOST_ID` must stay stable per volume. A stale runtime
  lock after container replacement can look live because low PIDs are reused;
  recovery is deliberate and token-bound, not automatic.
- The full repository suite was not rerun; this slice only exercised the
  builder-focused suites listed above.
- No deployment, DNS/edge change, registry publication, real invitation or paid
  provider call was made or authorized.
