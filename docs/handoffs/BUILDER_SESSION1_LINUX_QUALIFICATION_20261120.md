# Session 1 Linux qualification result

20 November 2026. This record covers one authorized Linux x86_64 rehearsal of the
reviewed Session 1 candidate. The image identity and all pre-qualification checks
passed, but `qualify-linux.sh` stopped at a required writable-path probe before
the egress, operator, browser, restart, restore, lock-recovery and closed-rollback
phases. The artifact is therefore **NO-GO**. Access remains closed. No registry
publication, deployment, DNS change, real invitation or paid call occurred.

## Exact source and run

- Reviewed Session 1 SHA: `088f9cf4915fa5829b9dce676c59b6840373a238`
- Candidate ref used only to make the SHA fetchable by Actions:
  `ci/ornigami-builder-session1-candidate-088f9cf`
- Retained workflow source: run `44799494500`, commit
  `fffc7d47e69b4ae06a8a11555f87c1d8e7b42c54`
- Rehearsal workflow branch: `ci/ornigami-builder-session1-qualify-20261120`
- Workflow commit: `8585e2ced99851685be2795746fd0b9971abbe03`
- Successful dispatch ID: `44805794761`
- Job ID: `136529336218`
- Run URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44805794761>
- Started/finished: `2026-11-20T19:50:00Z` / `2026-11-20T19:55:30Z`
- Qualification settings: `BROWSER_PHASE=1`, `KEEP_ON_FAILURE=1`,
  `KEEP_VOLUMES=1`, `REMOVE_IMAGE=0`

The first dispatch, run `44805527435`, stopped at checkout because the reviewed
SHA was not yet present on any remote ref (`upload-pack: not our ref
088f9cf4915fa5829b9dce676c59b6840373a238`). No build ran. Its log is retained at
the path below. The SHA was then pushed to the temporary candidate ref above and
a fresh run was dispatched.

The retained workflow setup steps were carried forward. Two enforcement changes
were added for this rehearsal: a full-suite skip/accounting gate and an explicit
artifact gate covering the install, audits, lint, typegen, TypeScript, suite,
result flags, access-mode smokes, operator/browser/ZIP evidence and image label.

## Host toolchain (separate from the image)

| Item | Value |
| --- | --- |
| Runner image | GitHub Actions `ubuntu-24.04` |
| Kernel / architecture | `Linux 7.0.0-1017-azure x86_64` |
| OS | Ubuntu 24.04.5 LTS |
| CPUs / memory | 4 CPUs / 16,367,528 KiB |
| Free workspace | 90,481,401,856 bytes |
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
| Image tag | `ornigami-builder:qualify-builder-44805794761-1` |
| Local image ID | `sha256:6af77d0700eef9d61b3bfbe034ca2aa90bda662ac3ef89731806d79f108d12aa` |
| Revision label | `088f9cf4915fa5829b9dce676c59b6840373a238` |
| Run label | `builder-44805794761-1` |
| Source-SHA label | `088f9cf4915fa5829b9dce676c59b6840373a238` |
| Image size | 967,030,812 bytes |

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
| Bash checks | All executed; `full-suite-skips.tsv` is empty and no `Bash is unavailable` skip remains |

The previous run `44799494500` had 14 Bash-discovery skips and two unrelated
failures. The reviewed candidate's Bash discovery fix executed those checks on
Linux, so no skip remains in this run.

## Qualification phases

Passed before the failure:

- image revision, single-replica, user, health check, operator CLI and run labels;
- read-only root and runtime UID/GID `1000:1000`;
- invite-mode HTTP smoke through the loopback-published origin:
  home `200`, anonymous `/builder` `307` to `/?error=session`, session `401`,
  generation `404`.

Failing phase:

```text
==> PASS http:smoke:invite
Error: EACCES: permission denied, open '/app/builder-runtime/.next/cache/.probe'
    at Object.writeFileSync (node:fs:2430:20)
```

The container ran with `--tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m`
and no explicit `uid=`, `gid=` or `mode=`. The runtime user is `1000:1000`; the
probe could not write to the mounted cache. `/tmp` was writable; the probe failed
at the cache path before exercising `/home/node`. This is a packaging/runtime
writable-path defect on the current engine, not an application HTTP failure.

Not reached because the script stops on the first failure:

- egress-block verification and forbidden-provider environment check;
- packaged operator CLI invite/list/revoke and synthetic session state;
- browser journey, online operator revocation, screenshots and ZIP audit;
- populated restart and fresh-volume restore;
- stale/foreign-scope lock recovery;
- same-image closed rollback and final results/checks manifest.

## Evidence paths

Actions artifact (30-day retention):

- Name: `builder-linux-qualification-44805794761-1`
- ID: `14663547380`
- URL: <https://github.com/joserubiobejarano/Ornigami/actions/runs/44805794761/artifacts/14663547380>

Local retained evidence:

- Root: `.local/builder-linux-qualification-20261120/`
- Full run log: `run-44805794761-full.log`
- Artifact copy:
  `run-44805794761/builder-linux-qualification-44805794761-1/`
- Failing qualification transcript:
  `run-44805794761/builder-linux-qualification-44805794761-1/qualification-console.log`
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
- First dispatch checkout-failure log:
  `run-44805527435-checkout-failure.log`
- Previous run `44799494500` reference evidence:
  `previous-run-44799494500/` and `previous-run-44799494500.log`
- Workflow definition used:
  `builder-linux-qualification-used.yml`

## Decisions

- **Artifact: NO-GO.** The exact candidate built a correctly labelled image, and
  install, suite, audits and image contract passed. The required runtime
  writable-path check failed, so egress controls, packaged operator revocation,
  browser/ZIP evidence, populated restart, fresh-volume restore, lock recovery
  and same-image closed rollback are unproven. Do not promote or deploy this
  image.
- **Private staging: NO-GO.** There is no qualified artifact. Host/proxy/TLS/
  origin, backup-encryption and actual-host checks plus the owner privacy,
  retention, support, custom-Next maintenance and acceptance gates also remain
  open.

A future attempt needs a new candidate SHA that explicitly sets the tmpfs
ownership/mode for `/app/builder-runtime/.next/cache` (and checks `/home/node`),
then a fresh exact-SHA build and full qualification. This image must not be reused.

Registry publication, deployment, DNS, real invitations and paid calls remain
out of scope and were not performed.  The builder stays closed and the live
provider/test hooks stay disabled.
