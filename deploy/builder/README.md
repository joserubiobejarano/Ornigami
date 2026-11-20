# Builder-only Linux packaging

Status: packaging prepared from `7b8674358d5421c589bea22f55167276f4d391ec`.
Linux execution is **pending** because this workstation has no Docker, Podman,
or WSL engine. Sessions 1 and 2 own application behavior; this directory owns
image packaging and local runtime checks only.

Final qualification must use the **merged candidate** with a clean worktree.
Do not reuse an image built from the review/packaging branch after the candidate
changes.

## Files

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builder-only distroless image, non-root UID/GID 1000, `/data/builder` volume, builder health check |
| `qualify-linux.sh` | Reproducible Linux build and runtime assertions; exits `2` and prints the command plan when no engine exists |

## Image design

- Two-stage dependency install and one production dependency stage, using the
  repository-pinned Node `22.23.3` / OpenSSL `3.5.8` distroless parents and
  vendored npm `11.21.1`.
- Build runs from the repository root; the application is
  `builder-runtime/`, not the legacy root app.
- Runtime user is explicitly `1000:1000`.
- `BUILDER_RUNTIME_STORE_DIR=/data/builder`; the directory is image-owned so a
  fresh named volume inherits UID/GID 1000. A `.ornigami-volume` marker is
  included only to make the directory non-empty; the app ignores it.
- Health check fetches `http://127.0.0.1:3000/` and requires `200`. Do not reuse
  the legacy `/robots.txt` health check; the builder runtime intentionally
  returns `404` for legacy paths.
- Image labels include the exact `org.opencontainers.image.revision`,
  `org.ornigami.runtime=builder`, `org.ornigami.single-replica=true`, and the
  public origin.

## Build

From the repository root, with a clean merged candidate:

```bash
SOURCE_SHA="$(git rev-parse HEAD)"
APP_URL="https://builder-staging.example"   # must equal the runtime origin

docker build -f deploy/builder/Dockerfile \
  --platform linux/amd64 \
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

The script:

1. rejects a dirty worktree unless `ALLOW_DIRTY=1` is explicitly set for a
   non-final smoke;
2. requires `HEAD == SOURCE_SHA`;
3. builds the pinned image and verifies the revision/single-replica labels,
   `1000:1000` user, and builder health check;
4. runs the container with `--read-only`, an internal (no-egress) network, and
   only these writes:
   - `/data/builder` — persistent store (bind mount in the local script;
     named volume in staging);
   - `/tmp` — tmpfs;
   - `/app/builder-runtime/.next/cache` — tmpfs;
   - `/home/node` — tmpfs;
5. verifies UID/GID 1000, store file `0600`/UID 1000, `/builder` `404`,
   session `401`, home `200`, and that `/app` is not writable;
6. verifies the container cannot reach `https://example.com`;
7. verifies no provider/database/billing/mail/Sentry environment variables are
   present;
8. restarts the container and checks the store survives;
9. stops the container, copies the store, restores it into a **fresh
   container**, and checks health, ownership, and store hash;
10. stops the fresh container and starts the same image with
    `BUILDER_RUNTIME_MODE=closed` against the same store, proving the
    stop-or-close rollback preserves usage/identity records and leaves
    `/builder` closed.

Evidence is written to `.local/builder-linux-qualification/` (`results.txt`,
store, backup, restore). Do not commit `.local/`.

If no engine is present, the script prints the equivalent commands and exits
`2`. That is the current status on this workstation.

## Read-only-root writable paths

| Path | Type | Why |
| --- | --- | --- |
| `/data/builder` | persistent volume | `identity-store.json` and transient `identity-store.lock`; single writer |
| `/tmp` | tmpfs, noexec/nosuid | Node/Next temporary files |
| `/app/builder-runtime/.next/cache` | tmpfs, noexec/nosuid | Next runtime cache if it writes one |
| `/home/node` | tmpfs, noexec/nosuid | `HOME` compatibility; may be removable if Linux evidence shows no writes |
| `/app` | read-only | application code and build output; must not be written |

Actual Linux execution must confirm this list. If the server fails to start or
health-check under `--read-only`, inspect logs and add only the proven path to
the documented tmpfs/volume set. Do not make the whole root writable to hide an
unknown write.

## Single replica

`identity-store.json` is a local file with a process lock. It is not safe on a
shared filesystem or across multiple replicas. The staging limit is **one
running replica**, one writer, one dedicated read-write volume. Stop the old
container before starting a replacement; do not run rolling overlap. Horizontal
scaling requires a transactional shared ledger and a new review.

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
container. The local script uses an internal Docker/Podman network and proves a
public HTTPS request fails.

Build-time registry access is separate from runtime egress. Pin and pre-pull
the base images and dependency toolchain on the authorized runner; do not add a
runtime network dependency to satisfy the build.

## Backup and restore into a fresh container

Local bind-mount workflow (used by `qualify-linux.sh`):

```bash
docker stop ornigami-builder
mkdir -p backup/store
cp -a .local/builder-linux-qualification/store/. backup/store/
sha256sum backup/store/identity-store.json

mkdir -p restore
cp -a backup/store/. restore/
chown -R 1000:1000 restore        # only when running as root
```

Start a **fresh** container with `restore/` mounted at `/data/builder`, wait for
health, and verify the store hash and `0600`/UID 1000 ownership. The evidence
must show the restored container serving `/` `200`, anonymous `/builder` `404`,
and anonymous session `401` before application-level session checks.

Named-volume workflow for staging:

```bash
docker volume create ornigami-builder-store
# run the image with:
#   --mount type=volume,src=ornigami-builder-store,dst=/data/builder
docker stop ornigami-builder
docker cp -a ornigami-builder:/data/builder ./store-backup
# create the replacement container with a NEW volume, copy the backup in while
# stopped, then start it and verify hash/ownership/health.
```

Backup while stopped. Do not copy the lock file while a writer is active. Keep
the backup accessible only to the operator; it contains identity/session hashes
and usage records.

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

The qualification script proves the closed rollback leaves the store hash
unchanged. Application-level reconciliation of `unknown` records remains owned
by Sessions 1 and 2.

## Final qualification checklist

- Clean merged candidate, `HEAD == SOURCE_SHA`, image label matches.
- Linux/Node 22 build and dependency audit on the candidate.
- Non-root `1000:1000`, read-only root, only documented writable paths.
- Store `0600`, correct owner, single writer/volume/replica.
- Health `200`; closed `/builder` `404`; anonymous session `401`.
- No runtime egress; no provider/database/mail/Sentry configuration.
- Restart preserves store; backup restores into a fresh container.
- Closed rollback preserves usage and does not reopen without quotas.
- Sessions 1 and 2 application journeys pass on the same merged image.

Staging deployment, DNS, external accounts, and paid services remain outside
this packaging work and require separate authorization.
