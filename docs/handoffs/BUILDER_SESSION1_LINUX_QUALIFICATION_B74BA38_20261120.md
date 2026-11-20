# Session 1 Linux qualification result at b74ba38

20 November 2026. This record covers the authorized Linux x86_64 rehearsal of
candidate `b74ba387bcef397984530146181b9c8bcd2446ea`. Install, suite, audits,
image identity and the first runtime checks passed, but `qualify-linux.sh`
stopped at the second part of the persistent-store writable-path check:
`/data/builder` reported mode `755`, not `700`. The artifact is **NO-GO**.
Access remains closed. No registry publication, deployment, DNS change, real
invitation or paid call occurred.

## Exact source, reachability and run

- Reviewed Session 1 SHA: `b74ba387bcef397984530146181b9c8bcd2446ea`
- Approved remote ref: `refs/heads/codex/ornigami-builder-tmpfs-ownership-20261120`
- Ref tip at dispatch: `977151ee756370d300d9fb923d74f2a0c4c058cb`
- Reachability check before dispatch: `git merge-base --is-ancestor
  b74ba387bcef397984530146181b9c8bcd2446ea
  origin/codex/ornigami-builder-tmpfs-ownership-20261120` exited `0`
- Retained workflow source: run `44805794761`, workflow commit
  `8585e2ced99851685be2795746fd0b9971abbe03`
- Rehearsal workflow commit: `71e1321dca5cbf03b2112ca24d95c1b9819cc03e`
  (adds explicit enforcement of the four per-path writable checks)
- Workflow branch: `ci/ornigami-builder-session1-qualify-20261120`
- Run ID: `44811515570`
- Job ID: `136548989660`
- Run URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44811515570>
- Started/finished: `2026-11-20T20:27:21Z` / `2026-11-20T20:32:32Z`
- Qualification settings: `BROWSER_PHASE=1`, `KEEP_ON_FAILURE=1`,
  `KEEP_VOLUMES=1`, `REMOVE_IMAGE=0`

The exact SHA was confirmed reachable from the approved remote ref before
dispatch. No checkout-failure retry was needed.

## Host toolchain (separate from the image)

| Item | Value |
| --- | --- |
| Runner image | GitHub Actions `ubuntu-24.04` |
| Kernel / architecture | `Linux 7.0.0-1017-azure x86_64` |
| OS | Ubuntu `24.04.5 LTS` |
| CPUs / memory | 4 CPUs / 16,367,524 KiB |
| Free workspace | 90,476,544,000 bytes |
| Host Node | `v22.23.3` |
| Host npm | `10.9.9` |
| Host Python / ZIP | Python `3.12.3`, `zipfile` OK |
| Container engine | Docker client/server `28.0.4` |
| Engine user / root | runner UID 1001 / `/var/lib/docker` |

## Image toolchain and identity (separate from the host)

| Item | Value |
| --- | --- |
| Platform | `linux/amd64` |
| Base runtime | distroless `nodejs22-debian13` nonroot |
| Image Node / npm / OpenSSL | `22.23.3` / `11.21.1` / `3.5.8` |
| Framework | Next.js `16.4.5` |
| Runtime user | `1000:1000` |
| Image tag | `ornigami-builder:qualify-builder-44811515570-1` |
| Local image ID | `sha256:ecd312d146c246807d0c650cf792ac60537e4514c3ef8e63e0c3b8d41cec896c` |
| Revision label | `b74ba387bcef397984530146181b9c8bcd2446ea` |
| Run label | `builder-44811515570-1` |
| Source-SHA label | `b74ba387bcef397984530146181b9c8bcd2446ea` |
| Image size | 967,030,297 bytes |

## Install, suite and audits

| Check | Result |
| --- | --- |
| Clean install | PASS, `npm ci` exit 0 |
| Full dependency audit | PASS, 0 vulnerabilities, exit 0 |
| Production dependency audit | PASS, 0 vulnerabilities, exit 0 |
| Release audit policy | PASS, exit 0 |
| `npm ls --all` | PASS, exit 0 |
| Lint | PASS, exit 0 (warnings only) |
| Type generation | PASS, exit 0 |
| TypeScript | PASS, exit 0 |
| Full test suite | **1403 tests, 1403 pass, 0 fail, 0 skipped** |
| Bash checks | All executed; `full-suite-skips.tsv` is empty |

## Qualification phases

Passed:

- image revision, single-replica, user, health, operator CLI and run labels;
- read-only root and runtime UID/GID `1000:1000`;
- invite-mode HTTP smoke: home `200`, anonymous `/builder` `307` to
  `/?error=session`, session `401`, generation `404`;
- `writable:store:owner` = `1000:1000`.

Failed:

```text
==> PASS writable:store:owner
FAIL: writable:store:mode: expected [700], got [755]
==> Failure: retained this run's containers/network/volumes for inspection.
```

The tmpfs mounts now carry the explicit
`uid=1000,gid=1000,mode=0700` options and the runtime user is `1000:1000`.
The failure is specifically the persistent named volume root: the container
mounted the run-owned `/data/builder` volume and reported mode `755`, although
the candidate Dockerfile applies `chmod 0700` to the image directory. The named
volume root did not inherit the required mode on this engine.

Not reached because the script stops on the first failure:

- `writable:store:write-delete`, `writable:tmp:*`, `writable:next-cache:*`,
  `writable:home:*`;
- egress-block verification and forbidden-provider environment check;
- packaged operator CLI invite/list/revoke and synthetic session state;
- browser journey, online operator revocation, screenshots and ZIP audit;
- populated restart and fresh-volume restore;
- stale/foreign-scope lock recovery;
- same-image closed rollback and the final results/checks manifest.

## Evidence paths

Actions artifact (30-day retention):

- Name: `builder-linux-qualification-44811515570-1`
- ID: `14666288239`
- URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44811515570/artifacts/14666288239>

Local retained evidence:

- Root: `.local/builder-linux-qualification-20261120/`
- Full run log: `run-44811515570-full.log`
- Artifact copy:
  `run-44811515570/builder-linux-qualification-44811515570-1/`
- Failing qualification transcript:
  `run-44811515570/builder-linux-qualification-44811515570-1/qualification-console.log`
- Same transcript in the evidence bundle:
  `.../evidence-bundle/qualify.log`
- Checks reached:
  `.../evidence-bundle/checks.tsv`
- Invite HTTP evidence:
  `.../evidence-bundle/http.log`
- Container/network/volume diagnostics:
  `.../diagnostics/`
- Image identity:
  `.../image/`
- Full-suite log and skip accounting:
  `.../full-suite.log`, `.../full-suite-summary.txt`, `.../full-suite-skips.tsv`
- Pre-dispatch reachability record:
  `run-44811515570-reachability.txt`
- Workflow definition used:
  `builder-linux-qualification-used-b74ba38.yml`

## Decisions

- **Linux artifact: NO-GO.** The exact candidate built a correctly labelled
  image, and install, suite, audits, image contract and the first runtime checks
  passed. The required per-path writable check failed at the persistent-store
  mode, so egress controls, operator revocation, browser/ZIP evidence, restart,
  restore, lock recovery and closed rollback remain unproven. Do not promote or
  deploy this image.
- **Private staging: NO-GO.** There is no qualified artifact. Host/proxy/TLS/
  origin, backup-encryption and actual-host checks plus the owner privacy,
  retention, support, custom-Next maintenance and acceptance gates also remain
  open.

A future attempt needs a new candidate SHA that makes the mounted `/data/builder`
volume root `1000:1000` mode `0700` (or changes the contract to a verified mode
that the volume can actually provide), then a fresh exact-SHA build and full
qualification. This image must not be reused.

Registry publication, deployment, DNS, real invitations and paid calls remain
out of scope and were not performed. The builder stays closed and the live
provider/test hooks stay disabled.
