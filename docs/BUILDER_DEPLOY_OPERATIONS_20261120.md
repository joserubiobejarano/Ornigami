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
reap-lock owner state, token, PID, hostname, acquired time and temporary files.
`list` is read-only. The other commands serialize through the store lock.

## Store host ID

`BUILDER_RUNTIME_STORE_HOST_ID` is the stable logical host identity recorded in
lock metadata. The default is the OS hostname, which changes when a container is
replaced. Use one stable value for the runtime, the operator wrapper and the
qualification helpers for the life of a volume, for example
`ornigami-builder-store-v1`.

The host id is not a secret and does not replace the lock token. Changing it
makes existing locks foreign and unprovable; it does not authorize takeover.

## Lock recovery across process and container replacement

Automatic reaping remains conservative: it removes a lock only when the recorded
host matches the current host id and the recorded PID is provably dead. A fresh
container commonly reuses low PIDs, so a stale runtime lock can look live; a
replaced OS host makes it foreign. In both cases, recovery is a deliberate
operator action.

The safe sequence is:

1. Stop the runtime and every operator process; no rolling overlap.
2. Back up the store volume while stopped.
3. `operator.sh lock-status --json`; record the store hash and lock/reap tokens.
4. If the store is missing, corrupt or the wrong version, restore the last
   accepted backup instead of recovering locks.
5. `operator.sh recover-lock --token <observed> --confirm-no-writers
   [--reap-token <observed>] --json`.
6. The command binds to the observed tokens, renames locks to timestamped
   `*.recovered.*` quarantine files, never deletes them, and verifies the store
   hash did not change. A successor lock is refused, not displaced.
7. `operator.sh list --json`; reconcile `reserved`/`unknown` usage explicitly.
8. Restart with the same host id and verify the expected session, revocation and
   reservation state.

Never delete or truncate `identity-store.json` to clear a lock or a usage limit.
Never copy a live lock into a replacement volume. Keep quarantine files for
incident review.

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

## Verification status

- Rerun-safety self-test: exercised locally with a stub engine; designed to
  refuse existing evidence/resources and clean up only run-owned resources.
- Operator CLI lock diagnostics/recovery: focused local tests pass.
- Real build, non-root container, named volume, egress denial, restart,
  fresh-container restore, lock recovery on the actual volume and closed
  rollback: **pending Linux execution**.

## Related evidence

- [`docs/handoffs/BUILDER_LINUX_DEPLOY_QUALIFICATION_20261120.md`](./handoffs/BUILDER_LINUX_DEPLOY_QUALIFICATION_20261120.md)
  — exact commit, commands, local check results and the pending Linux receipt.
- [`deploy/builder/README.md`](../deploy/builder/README.md) — image, operator,
  lock-recovery and backup/restore runbook.
- [`docs/BUILDER_CANDIDATE_DECISIONS_20261120.md`](./BUILDER_CANDIDATE_DECISIONS_20261120.md)
  — application candidate gates and owner decisions.
