# Builder-only Linux packaging and runtime qualification

Status: packaging and the qualification harness are prepared on
`codex/ornigami-builder-deploy-browser-20261120` from `d58566f`, with functional
implementation `9f4476c`. **Linux execution is pending**: this workstation has
no Docker, Podman, nerdctl or WSL engine. No image was built, pushed or
deployed. Sessions 1 and 2 own application behavior; this directory owns image
packaging, the supported operator path and runtime qualification.

Final qualification must use the **merged candidate** with a clean worktree. Do
not reuse an image built from an older review or packaging branch.

## Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builder-only distroless image, non-root UID/GID 1000, `/data/builder` volume, builder health check, packaged operator CLI |
| `qualify-linux.sh` | Run-scoped Linux build/runtime qualification; exits `2` and prints the command plan when no engine exists |
| `qualify-http.mjs` | Read-only, mode-aware HTTP journey helper mounted into the runtime container; invite requires the 307 sign-in redirect, closed requires 404 |
| `qualify-seed.mjs` | Qualification-only synthetic reservation and stale-lock fixture, mounted read-only into a one-shot container |
| `qualify-browser.mjs` | Playwright browser phase against the built container through a loopback-only test origin |
| `qualify-proxy.mjs` | Loopback-only host TCP proxy from `127.0.0.1:<port>` to the runtime's private container IP |
| `qualify-connectivity.mjs` | Bounded host TCP/HTTP diagnostic with error code/cause and loopback-only origin checks |
| `operator.sh` | Supported operator CLI wrapper: same image, no network, same UID, same persistent volume and store host id |
| `tests/stub-engine.sh` | Local rerun-safety self-test engine (never builds or runs a container) |

The review-only synthetic private staging package (actual-origin image build,
retention, independent pull verification, edge/runtime/browser acceptance and
rollback) is in [`private-staging/README.md`](./private-staging/README.md).

## Image design

- Two-stage dependency install and one production dependency stage, using the
  repository-pinned Node `22.23.3` / OpenSSL `3.5.8` distroless parents and
  vendored npm `11.21.1`.
- Build runs from the repository root; the application is
  `builder-runtime/`, not the legacy root app.
- Runtime user is explicitly `1000:1000`.
- `BUILDER_RUNTIME_STORE_DIR=/data/builder`; the directory is image-owned at
  `1000:1000` mode `0700` so a fresh named volume inherits that ownership and
  mode. A `.ornigami-volume` marker is included only to make the directory
  non-empty; the app ignores it.
- Health check fetches `http://127.0.0.1:3000/` and requires `200`. Do not reuse
  the legacy `/robots.txt` health check; the builder runtime intentionally
  returns `404` for legacy paths.
- Image labels include the exact `org.opencontainers.image.revision`,
  `org.ornigami.runtime=builder`, `org.ornigami.single-replica=true`,
  `org.ornigami.operator-cli=/app/scripts/builder-invite-operator.mjs` and the
  public origin.
- The image also carries the operator CLI and its two source modules
  (`identity-store.ts`, `usage-ledger.ts`), which use Node built-ins only. The
  build stage smoke-tests `lock-status` so a broken operator import fails the
  image build. `/app/qualify` is an empty image-owned directory used as the
  read-only mount point for the qualification helpers; it is not part of the
  web runtime.

## Run-scoped rerun safety

Every invocation derives a `RUN_ID` and refuses collisions. It never deletes or
reuses:

- an existing evidence directory (`EVIDENCE_DIR`, `BACKUP_DIR`, `RESTORE_DIR`,
  `STORE_EXPORT_DIR`);
- an existing image tag, container name, network or volume;
- a bind store directory.

Defaults are run-scoped:

```text
EVIDENCE_DIR      .local/builder-linux-qualification/runs/<RUN_ID>
IMAGE             ornigami-builder:qualify-<RUN_ID>
CONTAINER         ornigami-builder-qualify-<RUN_ID>
RESTORE_CONTAINER ornigami-builder-qualify-<RUN_ID>-restore
CLOSED_CONTAINER  ornigami-builder-qualify-<RUN_ID>-closed
NETWORK           ornigami-builder-qualify-net-<RUN_ID>
STORE_VOLUME      ornigami-builder-store-<RUN_ID>
RESTORE_VOLUME    ornigami-builder-restore-<RUN_ID>
```

Every resource this run creates carries
`org.ornigami.qualify.run=<RUN_ID>`. Cleanup removes a container, network,
volume or image only after re-reading that label. A pre-existing resource
without the label is left untouched even if a caller supplied its name.

`KEEP_ON_FAILURE=1` (default) stops this run's containers but retains them,
the network and the volumes for inspection. `KEEP_VOLUMES=1` (default) retains
the run's named volumes after success; set `KEEP_VOLUMES=0` to remove only the
run-owned volumes. `REMOVE_IMAGE=1` removes only an image labelled with this
run id. Evidence and backups are never removed by a later run.

Locally runnable rerun-safety check:

```bash
node scripts/builder-linux-qualify-self-test.mjs
```

It runs `qualify-linux.sh` in `QUALIFY_SELF_TEST=1` mode with a stub engine and
**9/9** checks: existing evidence, network, volume and container are refused and
left intact; a normal run removes only its own network and container; the exact
`type=volume,src=...,dst=/data/builder` and `type=bind,src=...,dst=/data/builder`
mount pairs are asserted; `KEEP_VOLUMES=0` removes only the run-owned volume; bind
mode creates no named volume; the operator wrapper prints the isolated command;
and a mount-construction failure or engine-helper failure exits non-zero without
ever writing `ok=true`. It does not build or run the image.

## Build

From the repository root, with a clean merged candidate:

```bash
SOURCE_SHA="$(git rev-parse HEAD)"
APP_URL="https://builder-staging.example"   # must equal the runtime origin

docker build -f deploy/builder/Dockerfile \
  --platform linux/amd64 \
  --label org.ornigami.qualify.run="candidate-build" \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  --build-arg ORNIGAMI_SOURCE_SHA="$SOURCE_SHA" \
  -t ornigami-builder:"${SOURCE_SHA:0:12}" .
```

The build rejects a missing/invalid 40-hex source SHA or relative/non-HTTP(S)
origin, and refuses to bake invite mode into the image. Build-time and runtime
`NEXT_PUBLIC_APP_URL` must match.

For a local HTTP check use `APP_URL=http://127.0.0.1:3100`; for staging use the
actual HTTPS origin. A proxy path prefix is not supported by this image; serve
the builder at the origin root.

## Local Linux qualification

Preferred command on an authorized Linux runner:

```bash
SOURCE_SHA="$(git rev-parse HEAD)" \
APP_URL="http://127.0.0.1:3100" \
./deploy/builder/qualify-linux.sh
```

If the runner uses Podman, set `ENGINE=podman`. If it is root, keep the
environment variables (`sudo -E`). The default store mode is a **named
persistent volume**. Bind mode is still available for a non-final smoke:

```bash
STORE_MODE=bind STORE_DIR=/absolute/new/empty/dir \
  SOURCE_SHA="$(git rev-parse HEAD)" ./deploy/builder/qualify-linux.sh
```

The browser phase has two explicit scopes. `QUALIFICATION_PATH=http-loopback`
uses a host-side TCP proxy bound only to `127.0.0.1:<port>` and forwards to the
runtime's private container IP on port `3000`; it is valid only when the image's
configured origin is that loopback origin and is diagnostic, not HTTPS
acceptance. `QUALIFICATION_PATH=https-edge` targets the exact HTTPS application
origin with private BasicAuth; the runtime application/effective origin stays
HTTPS and is never replaced by loopback. Docker does not honor published ports
on an `--internal` network, so the runtime is never started with `-p`. The
container remains on the internal default-deny network whenever it is local.
`qualify-browser.mjs` performs a bounded readiness check before launching
Chromium and records Node fetch error codes/causes without request secrets.

`BROWSER_PHASE=0` is partial evidence only: the result sets
`browser_journey=skipped`, `full_acceptance=false` and
`acceptance_scope=partial`. It cannot be presented as full acceptance.

The script:

1. rejects a dirty worktree unless `ALLOW_DIRTY=1` is explicitly set for a
   non-final smoke;
2. requires `HEAD == SOURCE_SHA` and 40-hex `SOURCE_SHA`;
3. refuses every run-id/path/image/container/network/volume collision;
4. builds the pinned image and verifies the revision, single-replica,
   operator-cli and run labels, `1000:1000` user, and builder health check;
5. creates an internal (no-egress) network and a **named persistent volume**
   labelled with the run id, verifies that label, and initializes the new
   volume root to `1000:1000` mode `0700` with a one-shot root container using
   `--network none --read-only` and only the volume mount. Fresh bind roots are
   explicitly chowned/chmodded to the same owner/mode before a writer starts;
6. runs one invite container with `--read-only`, the volume at `/data/builder`,
   UID/GID 1000, and only these writes:
   - `/data/builder` — persistent store, `1000:1000`, mode `0700`;
   - `/tmp` — tmpfs `rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700`;
   - `/app/builder-runtime/.next/cache` — tmpfs
     `rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700`;
   - `/home/node` — tmpfs
     `rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700`;
7. collects the effective owner, mode, and write/delete result separately for
   every declared writable path before failing the phase, then verifies store
   file `0600`/UID 1000, invite-mode anonymous `/builder` `307` to same-origin
   `/?error=session`, anonymous session `401`, anonymous generation `404`, home
   `200`, and that `/app` is not writable;
8. verifies the container cannot reach `https://example.com`;
9. verifies no provider/database/billing/mail/Sentry environment variables;
10. exercises the **supported operator CLI path** in the packaged image:
    `lock-status` reports the same store host id, then synthetic invites are
    issued and listed;
11. redeems two synthetic invites over HTTP, revokes identity B's session, and
    seeds one unresolved reservation for identity A with the packaged
    identity/usage modules;
12. restarts the same container (one replica; no overlap) and checks:
    - identity A's valid session still returns `200`;
    - identity B's revoked session returns `401`;
    - identity A's unresolved reservation still blocks generation with `429`
      `subject_concurrency`;
    - the store hash and the usage record are unchanged;
13. runs the **browser phase** against the container through a loopback-only
    host proxy (`127.0.0.1:<port>` -> private container IP:3000) while the
    container remains on its internal no-egress network. Live provider and test
    hooks stay disabled.
    `qualify-browser.mjs` issues two synthetic subjects and proves generation
    after refresh/edit, two-tab generation, replay deduplication, sign-out, a
    fresh approved ZIP export, online operator revocation of subject A while its
    workspace is open (A clears and cannot generate), and subject B remaining
    unaffected;
14. stops the container, backs up the volume, creates and initializes a
    **fresh volume**, copies the backup into it, and starts a **fresh
    container**; verifies the restore root is `1000:1000` mode `0700`, the store
    file is `1000:1000` mode `0600`, and the store hash and all records are
    preserved; repeats the session, revocation and reservation checks;
15. on the restore copy only, injects a same-host/foreign-PID-namespace stale
    lock, proves `recover-lock` refuses without confirmation and with a wrong
    token, then proves the observed token plus `--confirm-no-writers` quarantines
    the lock without changing the store and that `list` still reads it;
16. starts the same image with `BUILDER_RUNTIME_MODE=closed` against the
    authoritative volume, proves home `200`, `/builder` `404`, session `401`,
    the store hash is unchanged and all subject/session/usage records are
    preserved;
17. exports the final store and writes `results.txt` + `checks.tsv`.

### Writable tmpfs ownership

Every runtime tmpfs is explicit: `uid=1000,gid=1000,mode=0700` plus the existing
`rw,noexec,nosuid` flags. Docker's default tmpfs root is root-owned with a
different mode, which caused the cache probe to fail with `EACCES` when the
options were implicit. The persistent `/data/builder` volume remains a separate
mount and is never converted to tmpfs; it is image-owned at `1000:1000` mode
`0700`.

Docker accepts `uid`, `gid` and `mode` in the `--tmpfs` option string. Rootless
Podman applies its user-namespace mapping, so the same option string can have a
different host-visible owner; the in-container owner/mode probe is authoritative.
The local stub asserts the exact arguments, but only the authorized Docker or
Podman run proves real mount permissions.

### Mounted store initialization

A named-volume root is not assumed to inherit the image directory mode. After
creating the run-owned primary or restore volume, the script verifies the
`org.ornigami.qualify.run` label and runs one narrow setup container as `0:0`
with `--network none --read-only` and only the new volume at `/data/builder`.
That step chowns the root to `1000:1000`, chmods it to `0700`, and verifies the
result before the writer starts or before backup data is imported. An unowned,
foreign-labelled or wrong volume is refused without modification.

Fresh bind mode is handled directly on the host: the newly created `STORE_DIR`
and `RESTORE_DIR` roots are chowned to `1000:1000` when needed and chmodded to
`0700` before use. The host-side owner/mode check runs on Linux; the local
Windows stub only asserts the setup ordering and arguments because its POSIX
mode reporting is not representative.

The writable-path phase probes all four paths and records each owner, mode and
write/delete result before reporting any collected failure. The store remains a
separate persistent mount; the root filesystem stays read-only and the runtime
stays at UID/GID `1000:1000`.

For a real-engine preflight before a full rehearsal, set `MOUNT_ONLY=1` (and
normally `BROWSER_PHASE=0 KEEP_VOLUMES=0 REMOVE_IMAGE=1`). The script still
builds the exact image, creates and initializes the run-owned primary volume,
starts the invite runtime with the real mount arguments, probes all four paths,
writes a mount-only result, and stops before egress/operator/browser/restore.
This is real mount evidence, not a stub or full acceptance.

For the host connection path, `DIAGNOSTIC=1 BROWSER_PHASE=1` records
in-container HTTP, host TCP, host HTTP at the exact loopback origin, and live
engine port/network/health/lifecycle evidence before and after the same-container
restart, then exits before Chromium. It is a diagnostic, not full acceptance.

The browser phase needs Playwright/Chromium on the browser host. Install it under
`scripts/framework-prototype/browser-tools` or set `BROWSER_PLAYWRIGHT` to its
`index.mjs`. `http-loopback` requires the exact loopback application origin;
`https-edge` requires the exact HTTPS origin and private BasicAuth and must not
replace it with loopback. The script waits up to 20 seconds for the target to
return `200` before launching Chromium; failures record the underlying fetch
`code`/`causeCode`/`causeMessage`. On the Linux runner, `unzip` or `python3` is
needed for ZIP audit. `BROWSER_PHASE=0` produces partial evidence only and is
never full acceptance.

Evidence is written to the run directory (`results.txt`, `checks.tsv`,
`qualify.log`, `operator.log`, `http.log`, `browser/`, `backup/`,
`store-export/`, `list-before-closed.json`, `list-after-closed.json`). Do not
commit `.local/`.

If no engine is present, the script prints the equivalent commands and exits
`2`. That is the current status on this workstation.

## Supported operator CLI path

The image contains the operator CLI, so the supported path does not depend on
the host Node version and always uses the same UID and volume as the runtime.
Use the wrapper:

```bash
BUILDER_OPERATOR_IMAGE="ornigami-builder:${SOURCE_SHA:0:12}" \
BUILDER_OPERATOR_VOLUME="ornigami-builder-store" \
BUILDER_RUNTIME_STORE_HOST_ID="ornigami-builder-store-v1" \
  ./deploy/builder/operator.sh list --json
```

The wrapper runs:

```text
docker run --rm --network none --read-only --user 1000:1000
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700
  --tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700
  --mount type=volume,src=<volume>,dst=/data/builder
  -e BUILDER_RUNTIME_STORE_HOST_ID=<same value as the runtime>
  <image> --experimental-strip-types /app/scripts/builder-invite-operator.mjs
  <command> --store /data/builder ...
```

`BUILDER_OPERATOR_STORE=/absolute/host/dir` selects bind mode instead of a named
volume. `--print-command` prints the exact engine command without running it.
Supported commands are `issue`, `revoke-invite`, `revoke-session`,
`revoke-subject`, `reconcile-usage`, `lock-status`, `recover-lock` and `list`.

The operator is read/write only against the store volume. It has no network, no
provider credentials and no application secrets. Do not run it concurrently
with another writer except for the read-only `list`/`lock-status` commands; the
store lock serializes writers, but the supported topology is one runtime writer
plus short-lived operator processes.

## Store host ID and process scope

`BUILDER_RUNTIME_STORE_HOST_ID` is the stable logical host identity written into
`identity-store.lock` and `identity-store.reap.lock` metadata. The default is the
OS hostname, which changes when a container is replaced. **Set the same
constant for the runtime, the operator wrapper and the seed/qualification
helpers for the life of the volume**, for example:

```text
BUILDER_RUNTIME_STORE_HOST_ID=ornigami-builder-store-v1
```

Keep it stable across restarts, container recreation and volume replacement. The
host id is metadata only; it is not a secret and does not replace the lock token.

A shared host id is not enough to compare liveness. The runtime and the packaged
operator normally run in distinct PID namespaces, so a PID recorded by one is
meaningless in the other. New locks and temp files therefore carry a process
scope derived from the host id, the PID namespace identity (or the single-host
fallback) and the boot identity. Automatic reaping acts only when that scope
matches the current process scope, the PID is provably dead, and the lock was
acquired after the current boot. Dead-owner temp cleanup only removes files with
the same scope token; missing scope, a different PID namespace, a different boot
or a foreign host is `foreign_scope`/`foreign_host` and is never auto-reaped.
Foreign temp files are preserved for review.

## Operator revocation while the runtime is online

The supported operator can `issue`, `revoke-subject`, `revoke-session`,
`reconcile-usage` and `list` while the runtime is serving traffic. It does not
need to stop the runtime:

- a free store lock is acquired normally;
- a short live runtime transaction is waited for (the operator's normal
  bounded lock wait);
- the operator writes the revocation and releases the lock;
- the open workspace notices the revoked session on its next 15-second/focus
  session check, clears the subject draft, and returns to sign-in.

Do **not** run a second runtime or a long-lived second writer. Only the
short-lived operator transactions are supported alongside the runtime. If a
stale/foreign lock blocks the operator, stop all writers and use the recovery
procedure below; never delete the store or a live lock to force the revoke
through.

## Safe lock recovery across process and container replacement

Normal `docker stop` does not normally leave a store lock because locks are held
only for the duration of one store transaction. Recovery is for a crash,
`SIGKILL`, host-id change, corrupt owner metadata or a foreign volume. A stale
runtime lock can look `live` or foreign after container replacement because a
fresh container has a different PID namespace and may reuse low PIDs (often PID
1); do not rely on the automatic same-scope reaper in that case. **Manual
operator recovery is required.**

Procedure:

1. Stop **all** writers: remove the old runtime container and every operator
   process. Do not run a replacement concurrently.
2. Back up the entire store volume while stopped. Keep the backup private; it
   contains identity/session hashes and usage metadata, not brief text.
3. Inspect the locks with the packaged operator:

   ```bash
   BUILDER_OPERATOR_IMAGE=<image> \
   BUILDER_OPERATOR_VOLUME=<volume> \
   BUILDER_RUNTIME_STORE_HOST_ID=<same-as-runtime> \
     ./deploy/builder/operator.sh lock-status --json
   ```

   Record the `token` (and `reapLock.metadata.token` if present), the `owner`
   state, the `scope` and the store SHA-256.
4. If `identity-store.json` is missing, corrupt or the wrong version, stop and
   restore the last accepted backup. Do not recover locks around a bad store.
5. Recover only the locks you observed:

   ```bash
   BUILDER_OPERATOR_IMAGE=<image> \
   BUILDER_OPERATOR_VOLUME=<volume> \
   BUILDER_RUNTIME_STORE_HOST_ID=<same-as-runtime> \
     ./deploy/builder/operator.sh recover-lock \
       --token <observed-lock-token> \
       --confirm-no-writers \
       [--reap-token <observed-reap-token>] --json
   ```

   Recovery requires the exact observed token and the explicit
   `--confirm-no-writers` statement. It renames the lock(s) to timestamped
   `*.recovered.*` quarantine files, never deletes them, and verifies that the
   store hash did not change. If a successor lock appears, it refuses rather
   than displacing it.
6. Run `list --json` and confirm the synthetic/expected subjects, sessions and
   usage records. Reconcile any `reserved`/`unknown` usage explicitly.
7. Restart the runtime with the same `BUILDER_RUNTIME_STORE_HOST_ID` and verify
   home `200`, invite-mode anonymous `/builder` `307` to same-origin
   `/?error=session`, anonymous session `401`, anonymous generation `404`, and
   the expected authenticated session/reservation state.

Never delete or truncate `identity-store.json` to clear a lock or a usage limit.
Never remove a quarantine file before the incident is reviewed. Do not copy a
live lock file into a replacement volume. Foreign-scope temp files are preserved
for review; only same-scope dead-owner temp files are removed automatically.

## Single replica and persistent volume

`identity-store.json` is a local file with a process lock. It is not safe on a
shared filesystem or across multiple replicas. The supported topology is **one
running replica, one writer, one dedicated read-write persistent volume**. Stop
the old container before starting a replacement; do not run rolling overlap.
Horizontal scaling requires a transactional shared ledger and a new review.

## Proxy and origin

The reverse proxy/edge owns TLS, private access, and the public hostname. The
app expects:

- the builder served at the origin root, not under a path prefix;
- `Host` preserved and `X-Forwarded-Proto: https` at the edge;
- only the proxy can reach container port 3000; do not publish it directly;
- build-time and runtime `NEXT_PUBLIC_APP_URL` exactly equal to the external
  origin, so cookies become `Secure` and same-origin checks match;
- no legacy auth, billing, email, cron, or provider routes in front of this app.

An illustrative private proxy contract (replace names/credentials outside this
repository):

```caddyfile
builder.example.test {
  basic_auth { # approved private access record
    # ...
  }
  reverse_proxy 127.0.0.1:3100 {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

No DNS, edge, staging, or account change is authorized by this file.

## Egress policy

Runtime has no provider, database, mail, payment, cron, or Sentry client. The
expected policy is default-deny egress with only the reverse proxy path to the
container. The script uses an internal Docker/Podman network and proves a public
HTTPS request fails. The operator and seed helpers run with `--network none`.

Build-time registry access is separate from runtime egress. Pin and pre-pull
the base images and dependency toolchain on the authorized runner; do not add a
runtime network dependency to satisfy the build.

## Backup and restore into a fresh container

The qualification uses a named volume:

```bash
# Stop the runtime first. Do not copy a live store.
docker run --rm --network none --user 1000:1000 \
  --mount type=volume,src=<volume>,dst=/data/builder,readonly \
  --mount type=bind,src=<private-backup-dir>,dst=/backup \
  <image> -e 'const fs=require("fs");for(const f of fs.readdirSync("/data/builder"))fs.cpSync(`/data/builder/${f}`,`/backup/${f}`,{recursive:true})'
```

Start a **fresh** container with a **fresh** volume, copy the backup in while it
is stopped, then start and verify the store hash, `0600`/UID 1000 ownership,
home `200`, invite-mode anonymous `/builder` `307` to same-origin
`/?error=session`, anonymous session `401`, anonymous generation `404`, the
valid session, the revoked session and the unresolved reservation. The
qualification script performs this sequence and records the hashes.

Bind-mount equivalent (replace the path with the run's bind store):

```bash
docker stop ornigami-builder
mkdir -p backup/store
cp -a <bind-store>/. backup/store/
sha256sum backup/store/identity-store.json
```

Never overwrite an existing backup or evidence directory. Use a new timestamped
path or a new run id.

## Stop-or-close rollback

Preferred rollback on any packaging/runtime failure:

1. Stop the container and remove it from proxy traffic.
2. Keep `/data/builder` and every usage/identity record.
3. Either leave the app stopped, or restart **this same image** with
   `BUILDER_RUNTIME_MODE=closed` and the same store. Closed mode serves the
   notice at `/` with `200`, but `/builder` and session access remain `404`/`401`.
4. Do not delete the store, clear usage, or edit the JSON to bypass a limit.
5. Do not start the parent `ec801ba` image in invite mode: it reads the store
   but does **not** enforce generation budgets. If a previous image is required,
   keep it closed until a quota-capable image is restored.

The qualification script proves the closed rollback leaves the store hash and
all subject/session/usage records unchanged.

## Final qualification checklist

- Clean merged candidate, `HEAD == SOURCE_SHA`, image label matches.
- Linux/Node 22 build and dependency audit on the candidate.
- Non-root `1000:1000`, read-only root, only documented writable paths.
- Each writable path reports owner `1000:1000`, mode `0700` and a successful
  write/delete probe; all four results are collected before any phase failure;
  tmpfs retains `noexec,nosuid`; `/data/builder` remains a separate persistent
  volume.
- The new primary and restore volume roots are initialized only after their run
  label is verified, before a writer starts or data is imported; fresh bind
  roots receive the same explicit owner/mode.
- Named persistent volume, store `0600`, correct owner, single writer/one
  replica/one volume.
- Health `200`; invite-mode anonymous `/builder` `307` to same-origin
  `/?error=session`; closed-mode `/builder` `404`; anonymous session `401`;
  anonymous generation `404`.
- No runtime egress; no provider/database/mail/Sentry configuration.
- Restart preserves the valid session, the revocation and the unresolved
  reservation; store hash and usage record unchanged.
- Backup restores into a fresh initialized volume and fresh container with the
  restore root at `0700`, store file at `0600`, correct ownership, and the same
  hash and records.
- Same-host/foreign-PID-namespace stale lock is classified `foreign_scope` and
  is not auto-reaped; observed-token recovery quarantines it and preserves the
  store.
- Browser phase through the loopback-only host proxy passes with the live
  provider and test hooks disabled, including online subject-A revocation and
  subject-B isolation; the host origin is reachable before and after the
  same-container restart.
- A skipped browser phase is rejected as full acceptance: the result is
  `acceptance_scope=partial`, `full_acceptance=false` and
  `browser_journey=skipped`.
- Closed rollback preserves usage and does not reopen without quotas.
- Sessions 1 and 2 application journeys pass on the same merged image.

Staging deployment, DNS, external accounts, registry publication, real
invitations and paid services remain outside this packaging work and require
separate authorization.

## Exact Linux execution commands (pending)

Run these on the authorized Linux runner from a clean checkout of the committed
candidate:

```bash
git status --porcelain                 # must be empty
SOURCE_SHA="$(git rev-parse HEAD)"
APP_URL="http://127.0.0.1:3100"

SOURCE_SHA="$SOURCE_SHA" APP_URL="$APP_URL" \
  ./deploy/builder/qualify-linux.sh

# The script prints the run directory, for example:
#   .local/builder-linux-qualification/runs/<run-id>/
# Upload results.txt, checks.tsv and the logs. Do not upload the store/backup
# if it contains real data; this qualification uses synthetic identities only.

# Inspect or operate the same run's volume:
BUILDER_OPERATOR_IMAGE="ornigami-builder:qualify-<run-id>" \
BUILDER_OPERATOR_VOLUME="ornigami-builder-store-<run-id>" \
BUILDER_RUNTIME_STORE_HOST_ID="ornigami-builder-store" \
  ./deploy/builder/operator.sh lock-status --json

# Optional cleanup of only this run's volumes after evidence review:
docker volume rm "ornigami-builder-store-<run-id>" \
  "ornigami-builder-restore-<run-id>"
```

The result remains **pending Linux execution** until that run produces
`ok=true` with `full_acceptance=true`, the session/revocation/reservation,
fresh-volume restore, same-host/foreign-scope lock recovery, browser phase and
closed-rollback checks. The browser phase requires Playwright Chromium and
`unzip`/`python3`; `BROWSER_PHASE=0` is partial evidence only.
