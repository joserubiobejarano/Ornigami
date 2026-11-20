# Builder runtime tmpfs ownership correction

20 November 2026. Local source correction only. No workflow was dispatched, no
image was published, no deployment/DNS change occurred, no real invitation was
issued and no paid call was made.

## Exact source

- Branch: `codex/ornigami-builder-tmpfs-ownership-20261120`
- Base: `088f9cf4915fa5829b9dce676c59b6840373a238`
- Candidate code SHA: `b74ba387bcef397984530146181b9c8bcd2446ea`
- Worktree: `C:/Users/joser/.local/ornigami-builder-tmpfs-ownership-20261120`
- Retained evidence: run `44805794761` at base `088f9cf`, saved from the
  `builder-linux-qualification-44805794761-1` artifact.

This handoff is documentation-only after the candidate code SHA. The next Linux
run must checkout the candidate SHA itself.

## Retained failure

Run `44805794761` passed the full suite (`1403/1403`, zero skips), image labels,
read-only root, UID/GID `1000:1000` and the mode-aware HTTP invite check. It then
failed the writable-path probe:

```text
Error: EACCES: permission denied, open
'/app/builder-runtime/.next/cache/.probe'
```

The tmpfs mounts were created without explicit ownership/mode. The runtime
process is UID/GID `1000:1000`, but the cache mount was root-owned, so the
runtime could not write its declared cache path. The root filesystem was already
read-only and the store was already a separate persistent volume.

## Corrections

- Runtime tmpfs mounts now explicitly use
  `uid=1000,gid=1000,mode=0700` while retaining `rw,noexec,nosuid`:
  - `/tmp`: `size=64m`;
  - `/app/builder-runtime/.next/cache`: `size=64m`;
  - `/home/node`: `size=16m`.
- The persistent `/data/builder` volume remains a separate mount, never tmpfs.
  The image directory is now `1000:1000` mode `0700`, so a fresh named volume
  inherits least-privilege ownership/mode.
- Operator and qualification helper tmpfs mounts now use the same explicit
  `uid=1000,gid=1000,mode=0700` options.
- The qualification probes the effective owner, mode and write/delete behavior
  separately at every declared writable path:
  - `writable:store:owner|mode|write-delete` — `/data/builder`, mode `700`;
  - `writable:tmp:owner|mode|write-delete` — `/tmp`, mode `700`;
  - `writable:next-cache:owner|mode|write-delete` —
    `/app/builder-runtime/.next/cache`, mode `700`;
  - `writable:home:owner|mode|write-delete` — `/home/node`, mode `700`.
- `scripts/builder-linux-qualify-self-test.mjs` now asserts the exact runtime
  tmpfs arguments, the three-mount count, the store mount separation, the
  read-only root, UID/GID `1000:1000`, and all four per-path probes. It also
  asserts the operator tmpfs options and the Dockerfile store mode.
- The builder README records the tested options and engine differences. Docker
  accepts `uid`, `gid` and `mode` in the `--tmpfs` option string. Rootless
  Podman maps container UID/GID through its user namespace, so host-visible
  ownership can differ; the in-container probe is authoritative.

Application routes, auth, quota behavior and the persistent store contract were
not changed.

## Focused verification

| Check | Result |
| --- | --- |
| `node scripts/builder-linux-qualify-self-test.mjs` | **10/10 pass** |
| Focused builder/operator/isolation/store/HTTP suites | **38/38 pass**, 0 fail, **0 skipped** |
| `npx tsc --noEmit` | pass |
| `bash -n deploy/builder/qualify-linux.sh` | pass |
| `bash -n deploy/builder/operator.sh` | pass |
| `node --check scripts/builder-linux-qualify-self-test.mjs` | pass |
| Retained full suite at base `088f9cf` | **1403/1403 pass**, 0 fail, **0 skipped** |

The local stub checks assert arguments, not real mount permissions. The actual
tmpfs owner/mode and write/delete result for each path remain pending the next
authorized Docker or Podman run.

## Next authorized Linux command

From a clean checkout of the candidate code SHA:

```bash
git checkout b74ba387bcef397984530146181b9c8bcd2446ea
git status --porcelain                       # must be empty

SOURCE_SHA="b74ba387bcef397984530146181b9c8bcd2446ea" \
APP_URL="http://127.0.0.1:3100" \
BROWSER_PHASE=1 \
  ./deploy/builder/qualify-linux.sh
```

The run should now report all `writable:store`, `writable:tmp`,
`writable:next-cache` and `writable:home` owner/mode/write-delete checks before
continuing to egress, operator, browser/ZIP, restart, restore, lock recovery and
closed rollback. Dispatch, deployment, registry publication and DNS changes
remain for the separately authorized rehearsal.
