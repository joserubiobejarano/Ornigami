# One approved external trial — admission failed

16 October 2026. The preparation branch was published after the [integration preflight](./INTEGRATION_PREFLIGHT.md) cleared. Exactly one request-only commit was pushed and one Actions run occurred, attempt 1. **No image build started and no image exists. No retry was performed.**

| Identity | Value |
| --- | --- |
| Branch | `codex/ornigami-coolify-preparation-20261016` |
| Approved source | `51673d76bd407f69fa1a437f1b52587f0a888cfa` |
| First publication, without marker | `b7c32ae039efbc80bc06667e2aa7872e12207e46` |
| Request-only commit | `e6b0e1ac83ade48bbc6eadbf4a2e6a1b6b091fcc` |
| Actions run | [38936353655](https://github.com/joserubiobejarano/Ornigami/actions/runs/38936353655), attempt 1 |
| Job | `117092729136` |
| Run interval | 17:00:34–17:00:44 UTC; job approximately six seconds |
| Result | Failure in source admission, before resource preflight/BuildKit/scanner download |
| Local repair candidate, not pushed/run | `a0f319c39a3bbc315e8e2a0d8ca4f854c7438838` |

## Publication and integration receipts

Before the first push: Netlify's only team had four projects, all explicitly “Current repository: Not linked”; Vercel live project `locallift` was linked to Ornigami with `main` as production branch and this candidate's exact preparation-branch Git-deployment block; GitHub's installed Apps were identified, repository webhooks were empty; Coolify's existing Ornigami project/environment had zero resources. No installation, permission, deployment or shared setting was changed.

The first push published only the preparation branch, with no request file. Checks through 17:00:02 UTC found zero Actions runs on the branch, zero check runs and GitHub deployments for the publication commit, no matching preparation deployment in the latest 20 Vercel project deployments, and no new Coolify resource. Only then was the sole request file committed and pushed at approximately 17:00:32 UTC. The candidate/workflow blob was unchanged. The source checksum in that request was wrong, as detailed below.

Post-trial checks at approximately 17:03:30 UTC found exactly one branch run, attempt 1; zero GitHub deployments for the request SHA; zero matching Vercel deployments; and still zero resources in the Ornigami Coolify environment. The [captured integration receipt](./external-trial-38936353655/post-trial-integrations.json) and scoped [Coolify AX receipt](./external-trial-38936353655/coolify-after-trial.txt) preserve these results. No PR, merge, GHCR publication, provider action, authorized cron invocation, shared-host build, host/proxy/firewall change or capacity purchase occurred. Only the existing local private dashboard forwarding connection was restored for read-only inspection; no remote shell command ran.

## Root cause and local correction

The request supplied the Windows working-copy SHA-256 of `package-lock.json`. System Git has `core.autocrlf=true`, so the Windows working copy and committed Git blob differ only in line endings:

| Bytes | Length | CRLF lines | SHA-256 |
| --- | ---: | ---: | --- |
| Committed Git blob, checked out on Linux | 494,529 | 0 | `b7335ef2e1163bf36afcf48309c3eaab68ea4731909a6bc4c981b0a0ea048ed1` |
| Windows working copy / request value | 506,218 | 11,689 | `5eff2b421d8becc7d24b79b9af9265cb655014c56e36873c8400b2a2c1c5ed47` |

Converting the exact committed LF bytes to CRLF reproduces the request hash. Normalizing the Windows bytes to LF reproduces the committed bytes. The marker schema, request-only diff, source ancestry, exact source SHA and matching workflow blob independently check out. The admission step reached environment propagation but wrote no successful admission summary; the lock comparison is the failing assertion. This is a preparation error in the chosen checksum, not an npm/compiler/memory failure. Earlier Windows lock hashes remain valid receipts for those bytes; they must not be treated as canonical committed-source hashes.

Two later steps also failed without useful measurements: the scan tried to inspect a nonexistent image and the OOM gate had no cgroup files. Their original guard trusted an unset build exit output even though the build step was skipped. The local repair now requires an explicit successful build-step outcome, nonempty exit output and zero exit code. Missing outputs are not evidence of success; see GitHub's [expression comparison rules](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions).

The local repair additionally checks the requested checksum against `git show SOURCE_SHA:package-lock.json`, prints both hashes on mismatch, and separately verifies detached checkout bytes match the committed blob. It preserves strict SHA/lock admission rather than tolerating mismatches. No lockfile/dependency, Dockerfile, runtime budget, resource limit or security contract changed.

Local validation passed: YAML parsing, all ten Bash blocks, independent review, and six synthetic admission cases using the actual admission block. The valid case uses an LF committed blob with a CRLF Windows worktree; the CRLF-derived request hash is explicitly rejected. Extra changed path, workflow mismatch, invalid source and incorrect checksum remain rejected. No Linux build/runtime acceptance is claimed for the repair. It is committed locally only; the remote remains at the original request commit.

The approved single trial is consumed. **Another trial requires a new explicit authorization**, a newly reviewed candidate whose workflow blob matches the new request commit, and the canonical committed lock hash. Do not rerun attempt 1 or silently edit the historical request. This document proposes no automatic retry and no increase to the accepted 8 GiB/3 CPU/4096 MiB envelope.

## Results and measured limits

| Gate | Actual result |
| --- | --- |
| Linux runner | Ubuntu 24.04.5, runner image `20261012.334.1`, Actions runner `2.337.0`; from setup log |
| Source admission | Failed: CRLF/LF checksum mismatch |
| Runner CPU/RAM admission | Skipped; no observed CPU/RAM capacity receipt |
| BuildKit limits / peak / OOM | Not applied/measured: builder never started; **unavailable**, not zero |
| App compilation / image identity | Skipped; no Docker image ID, archive checksum or registry digest |
| Base advisory scan | Skipped; earlier 4 critical / 22 high Docker Hub snapshot remains unresolved |
| Final image scan | Step failed because image was absent; Trivy did not scan an image |
| HTTP/security/native checks | Skipped; no Linux runtime acceptance |
| Restart/cache persistence | Skipped; no container or trial volume existed |
| App peak memory / OOM | Unavailable, not a successful fit within the runtime budget |
| Cleanup | Successful; zero running temporary builder; Docker reported zero containers/volumes/build cache |

Cleanup summary measured runner filesystem capacity 154,894,188,544 bytes. Before cleanup: 62,773,571,584 used / 92,103,839,744 available; after cleanup: 62,773,551,104 used / 92,103,860,224 available. The source directory occupied 5,857,689 bytes. Six runner-provided images occupied 1.869 GB; these were not Ornigami candidate images. These are disk snapshots, not a measured peak or a successful build's disk requirement. Build/runtime memory and OOM counters cannot be inferred from these values.

## Preserved evidence and remaining gates

The [evidence manifest](./external-trial-38936353655/EVIDENCE.json) hashes the original downloaded log ZIP, readable CLI log, run/step metadata, rendered job summary and post-trial integration checks. The ZIP passes its CRC check; focused credential-pattern inspection found no token/private-key/database-URL patterns. Local screenshot remains in the ignored trial directory.

The job had already cleaned up at 17:00:41 UTC when completion was observed. GitHub's persisted run metadata/logs were downloaded at approximately 17:00:55–17:00:57, and raw ZIP/summary at 17:02:56, before log expiry. This is **not** a claim that local download beat runner cleanup. No transient scanner report or image archive existed to recover. Hash-protected copies are committed under `external-trial-38936353655/`; original Contabo failure and Windows profiling receipts are unchanged.

Still open: an authorized new Linux trial, full HTTP/security/native/restart/cache acceptance and meaningful runtime/build measurements; base advisory remediation/disposition and final image scan; accepted exact origin and callbacks; separately authorized retained GHCR artifact/pull identity; bounded fictional Neon/config/media restore; independent scheduled copies, delivered alerts, key custody and replacement-host proof. No compatible retained-image rollback is demonstrated. Even a future successful ephemeral build will not itself deliver a retained deployable image. Deployment, cron/provider and live-release gates remain closed.
