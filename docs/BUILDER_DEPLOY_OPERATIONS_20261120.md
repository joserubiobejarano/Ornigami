# Builder deploy and qualification operations

20 November 2026. Local source only; no image was built, pushed or deployed, no
real invitation was issued and no paid call was made. Linux execution remains
**pending** because no Docker, Podman, nerdctl or WSL engine is available on this
workstation.

## Decision

`deploy/builder` owns the builder-only image, its Linux qualification harness,
the supported operator CLI path and the store-host/lock recovery procedure.
Application behavior remains owned by Sessions 1 and 2.

The candidate keeps the fixed production boundary:

- one replica, one local store, one writer;
- non-root UID/GID `1000`;
- a dedicated persistent volume at `/data/builder`;
- default access closed, invite mode explicit;
- live provider and paid calls disabled;
- no deployment, registry publication, DNS/edge change or real invitation in
  this slice.

## Rerun safety contract

A qualification is an append-only evidence operation:

- every run gets a unique `RUN_ID`; the evidence directory, image tag,
  containers, network and volumes are derived from it;
- an existing evidence path, backup, store export, image, container, network or
  volume is refused, never deleted or reused;
- every created resource is labelled `org.ornigami.qualify.run=<RUN_ID>`, and
  cleanup re-checks that label before removing anything;
- `KEEP_ON_FAILURE=1` retains failed-run containers, network and volumes for
  inspection; `KEEP_VOLUMES=1` retains successful-run volumes; `KEEP_VOLUMES=0`
  and `REMOVE_IMAGE=1` remove only run-owned resources;
- prior run directories and pre-existing resources are left byte-for-byte
  intact.

The local `node scripts/builder-linux-qualify-self-test.mjs` proves this with a
stub engine. It is not Linux/image evidence.

## Supported operator CLI path

The runtime image contains the operator CLI and its two source-only modules, so
the operator runs on the image's Node 22 with the same UID and volume as the
runtime. `deploy/builder/operator.sh` is the supported wrapper:

- `--network none`, `--read-only`, `--user 1000:1000`;
- the named volume (or a documented bind directory) at `/data/builder`;
- the same `BUILDER_RUNTIME_STORE_HOST_ID` as the runtime;
- commands `issue`, `revoke-invite`, `revoke-session`, `revoke-subject`,
  `reconcile-usage`, `lock-status`, `recover-lock`, `list`.

`lock-status` is read-only and reports the store version/hash, host id, lock and
reap-lock owner state, token, PID, hostname, process scope, acquired time and
temporary files. `list` is read-only. The other commands serialize through the
store lock.

The operator can revoke a subject while the runtime is online. A free lock is
acquired normally; a short live transaction is waited for. Only a stale or
foreign lock is refused and requires the recovery sequence below.

## Store host ID and process scope

`BUILDER_RUNTIME_STORE_HOST_ID` is the stable logical host identity recorded in
lock metadata. The default is the OS hostname, which changes when a container is
replaced. Use one stable value for the runtime, the operator wrapper and the
qualification helpers for the life of a volume, for example
`ornigami-builder-store-v1`.

The host id is not a secret and does not replace the lock token. A shared host id
is **not** sufficient to compare process liveness: the runtime and the packaged
operator normally run in different PID namespaces. Lock metadata and temp-file
names therefore also carry a process scope derived from the host id, the Linux
PID namespace identity (or the single-host fallback) and the boot identity.

Automatic lock reaping acts only when the recorded scope matches the current
process scope, the recorded PID is provably dead, and the lock was acquired after
the current boot. Orphan temp cleanup only removes files with the same scope
token; missing scope, a different PID namespace, a different boot or a foreign
host is classified as `foreign_scope`/`foreign_host` and is never auto-reaped.
Foreign temp files are preserved for review. That is deliberately conservative:
conservative: cross-container recovery is an operator action, not a guess based
on a PID that may belong to a different namespace.

## Lock recovery across process and container replacement

A live runtime and a packaged operator share the store host id but not a PID
namespace. This does not block normal operation: a free store lock is acquired
normally, and a short live transaction is waited for. The operator can issue,
revoke or reconcile while the runtime is online because those commands only hold
the lock for their own short transaction.

The unsafe cases are stale or foreign locks: a crashed runtime, a `SIGKILL`, a
replaced container, a changed host id or corrupt owner metadata. A fresh
container may reuse low PIDs, so a stale runtime lock can look live; a replaced
OS host makes it foreign. The automatic reaper will not touch either. The safe
sequence is:

1. Stop the runtime and every operator process; no rolling overlap.
2. Back up the store volume while stopped.
3. `operator.sh lock-status --json`; record the store hash, owner state, scope
   and lock/reap tokens.
4. If the store is missing, corrupt or the wrong version, restore the last
   accepted backup instead of recovering locks.
5. `operator.sh recover-lock --token <observed> --confirm-no-writers
   [--reap-token <observed>] --json`.
6. The command binds to the observed tokens, renames locks to timestamped
   `*.recovered.*` quarantine files, never deletes them, and verifies the store
   hash did not change. A successor lock is refused, not displaced.
7. `operator.sh list --json`; reconcile `reserved`/`unknown` usage explicitly.
8. Restart with the same host id and process scope model and verify the expected
   session, revocation and reservation state.

Never delete or truncate `identity-store.json` to clear a lock or a usage limit.
Never copy a live lock into a replacement volume. Keep quarantine files and any
foreign-scope temp files for incident review. Preserve every identity and usage
record; recovery only quarantines lock metadata.

## Restart, restore and closed-rollback state contract

The qualification seeds two synthetic identities and one unresolved usage
reservation:

- identity A has a valid session;
- identity B's session is revoked;
- identity A has one `reserved` usage record with the configured subject
  concurrency set to `1`.

After a same-container restart and after backup into a **fresh volume + fresh
container**, the harness requires:

- identity A's session returns `200`;
- identity B's session returns `401`;
- a new generation for identity A returns `429 subject_concurrency` and creates
  no second reservation;
- the usage record and the `identity-store.json` SHA-256 are unchanged.

The same-image `BUILDER_RUNTIME_MODE=closed` rollback on the authoritative
volume must serve home `200`, `/builder` `404` and anonymous session `401`, leave
the store hash unchanged and preserve every subject, session (including the
revocation) and usage record.

## Browser phase against the built container

`deploy/builder/qualify-browser.mjs` runs against the built container through a
**host-loopback-only** published port. The runtime stays on the internal
default-deny network; publishing `127.0.0.1:<port>:3000` is ingress only and does
not grant the container egress. The build/runtime origin is the same loopback
URL. Live provider and test hooks remain disabled, so generation uses the
deterministic local fallback.

The phase issues two synthetic subjects through the packaged operator CLI, then
proves:

- generation after refresh and after "Edit brief inputs";
- two tabs sharing one session both generate;
- replaying one generation request returns `409 request_already_submitted` and
  does not create a second reservation;
- approval and a fresh ZIP export with matching receipt/meta/packshot hash and
  zip integrity;
- revoking subject A through the supported operator while A's workspace is open:
  A's tabs reach sign-in, A's builder draft keys are empty, A cannot generate and
  no A workspace text remains;
- subject B's session remains active and B can still generate;
- B signs out through the UI and its builder storage clears.

Playwright/Chromium must be available on the browser host. The phase is enabled
by default; set `BROWSER_PHASE=0` only for a non-browser packaging smoke. The
qualification refuses a non-loopback `APP_URL` while the browser phase is
enabled. Browser evidence is written under the run's `browser/` directory
(`results.json`, downloads, extracted ZIP, screenshots).

## Verification status

- Rerun-safety self-test: **9/9** local stub-engine checks. It asserts the exact
  volume/bind `--mount` pair, refuses collisions, leaves pre-existing resources
  intact, removes only run-owned resources, and proves a mount-construction or
  engine-helper failure cannot produce `ok=true`.
- Operator CLI lock diagnostics/recovery: focused local tests pass, including a
  same-host/foreign-PID-namespace lock and a pre-boot lock that must not be
  auto-reclaimed.
- Browser phase: **25/25** local checks against a production builder process
  with the live provider and test hooks disabled. This proves journey logic and
  the online operator revocation; it is not container/Linux evidence.
- Real build, non-root container, named volume, egress denial, restart,
  fresh-container restore, lock recovery on the actual volume, browser phase
  through the published container port, and closed rollback: **pending Linux
  execution**.

## Related evidence

- [`docs/handoffs/BUILDER_DEPLOY_BROWSER_QUALIFICATION_20261120.md`](./handoffs/BUILDER_DEPLOY_BROWSER_QUALIFICATION_20261120.md)
  — exact commit, local self-test/lock/browser results and the pending Linux
  receipt for this session.
- [`docs/handoffs/BUILDER_LINUX_DEPLOY_QUALIFICATION_20261120.md`](./handoffs/BUILDER_LINUX_DEPLOY_QUALIFICATION_20261120.md)
  — prior deploy qualification, commands and pending Linux receipt.
- [`deploy/builder/README.md`](../deploy/builder/README.md) — image, operator,
  lock-recovery, browser-phase and backup/restore runbook.
- [`docs/BUILDER_CANDIDATE_DECISIONS_20261120.md`](./BUILDER_CANDIDATE_DECISIONS_20261120.md)
  — application candidate gates and owner decisions.
