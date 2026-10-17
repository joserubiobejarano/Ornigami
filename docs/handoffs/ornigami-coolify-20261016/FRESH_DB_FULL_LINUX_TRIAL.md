# First full minimal-base trial with fresh DB — 17 October 2026

Subsequent result: [run39069347358 validates the npm repair and app functional paths; both tooling scans still fail](./MINIMAL_BASE_LINUX_RESULT.md). The failed bootstrap and its original evidence below remain historical facts. Current campaign accounting is3dispatches/15minutes charged/0reserved.

**[Run39068571833](https://github.com/joserubiobejarano/Ornigami/actions/runs/39068571833), attempt1, failed. No compilation/image/runtime acceptance.** Source `d20ea56ac3ead80439d3e5f66cdc4dc34963d40e`; request-only child `4cfb4b392f092e7706c4d5552e47b262167bb376`. One exact full request under the activated standing campaign, after successful fresh DB diagnostic39068058066. Both requests and all prior evidence preserved; local branch/worktree unchanged.

Before dispatch, full workflow was tightened to reject reruns, bind executed workflow SHA/ref to request, bind source to immediate parent, and enforce the runbook20GiB initial/predownload reserve.141tests, full-workflow actionlint and Bash/Python syntax passed in bounded2GiB/1CPU/512MiB Node verification. Exact source/tree/lock/framework/workflow identities, current owner UI/API holds,154/2000 included minutes,0.1/0.5GB storage and zero-dollar usage blocks passed. Zoisial had0unsettled reservation at this full admission. Source publication was non-force, changed no marker and caused0runs/deployments; only the separate full-marker child dispatched once.40minutes reserved first. No shared host build/configuration or provider action.

## Original failures and passed prerequisites

Actual Linux source/ref/attempt/workflow binding, runner CPU/memory/disk admission, Node/scanner pins, fresh cosign parent verification, one immutable official DB download and strict shared internal freshness passed. The four original parent/tool inventories and complete current vulnerability reports were collected. Results:

| Role | HIGH | CRITICAL | Outcome |
| --- | --- | --- | --- |
| Signed Distroless debug parent |0|0|Reported OS/library scan and native inventory passed |
| Signed Distroless runtime parent |0|0|Reported OS/library scan and native inventory passed |
| BuildKit0.33.1 pinned image |107|0|Failed security threshold |
| Dockerfile frontend1.7 pinned image |56|4|Failed security threshold |
| build-base/deps/builder/prod-deps/runner |unknown|unknown|Skipped after primary bootstrap failed; no export/recompilation fallback |

Do not sum repeated advisory IDs across binaries as unique CVEs, dismiss tooling findings because the final app is separate, or claim nine-role security success. Both parents still report23MEDIUM/8LOW each. Historical43final Debian highs are not reinterpreted or declared fixed. Overall image/security acceptance failed independently of the continuing advisory coverage hold.

The build's first build-base RUN reached the final `npm --version` check, which failed with **`env: can't execute 'bash': No such file or directory`**. Original Dockerfile PATH placed `/opt/ornigami-npm/bin` ahead of `/usr/local/bin`. The complete checksum-pinned npm archive contains `bin/npm` and `bin/npx` Bash launchers (`#!/usr/bin/env bash`), shadowing the intended npm-cli.js/npx-cli.js symlinks. The official JS entrypoints use `#!/usr/bin/env node`. This is executable lookup failure, **not V8 abort or cgroup kill**. npm install and Next compilation never ran.

Build cgroup8GiB/3CPU/zero swap remained unchanged: peak587,522,048bytes; memory.max/OOM/kill deltas0. Original build stdout/exit and actual resource observations retained. Intermediate export driver refused to rerun the failed primary build and explicitly skipped dependent roles. Native application imports, codecs, HTTP/CSP/SRI, browser and restart/cache checks were skipped, not inherited from old images.

An initial user-facing update mistakenly called all four parent/tool scans zero HIGH/CRITICAL based on the phase status; exact reports disproved that. Corrected immediately in chat and preserved all failing tooling rows. The statements and counts here supersede that mistaken update.

## Custody, completeness and cleanup

Artifact12113698330, ZIP655,181bytes, SHA-256 `ef122f65d2e53b034628610ae3ac84a86d91120fbc674632c7517ffdd1156b2e`. All140files/5,374,238payload bytes, exact file set, hashes, safe paths, source/request/run/attempt/ref and **executed workflow SHA/ref** were independently verified before the single owner status. Durable ZIP fsync/read-back passed; capture independently passed for this explicit failure path. This proves evidence completeness/custody, not skipped execution or security acceptance.

Finished logs and supplemental receipts were separately recovered, not backfilled into the immutable upload. Cleanup removed only the owned builder/state and four exact claimed parent/tool images. No global Docker cleanup or other project's resources. Job20:52:45–20:54:31UTC =106seconds, conservatively ceil106/60=**2runner minutes**. Campaign totals2dispatches/3minutes charged/0reserved: **4trials/297minutes remain**.

## Coherent local repair and security review

Dockerfile removes `/opt/ornigami-npm/bin` from PATH; retains the complete verified npm package, version check, JS symlinks, Node/OpenSSL, BusyBox shell, UID/GID, source maps, lifecycle scripts and all resource/security checks. No Bash installation or package modification. A focused regression unpacks the real pinned archive, uses actual Bash command lookup to reproduce historical launcher shadowing and verify the repaired Dockerfile PATH chooses the JS shim, then executes the real npm-cli.js offline under the pinned local Node. This is local resolution/CLI proof; real Linux minimal-base bootstrap/install/build is still untested until the next justified trial.

**142tests pass without failure/skip**, plus full-workflow lint and all Bash/Python syntax. Local supervisor2GiB/1CPU/512MiB Node,55.672seconds, peak174,120,960bytes, minimum free system RAM5,313,245,184bytes, exit0/no supervisor stop. No Linux cgroup/swap proof inferred from Windows. Local Docker absent and WSL not installed; no installation or QR VM reuse/fallback attempted.

All167HIGH/CRITICAL tooling finding rows retained in [TOOLING_HIGH_CRITICAL.json](./external-trial-39068571833/TOOLING_HIGH_CRITICAL.json). BuildKit findings include embedded Go stdlib, go-archive0.2.0, x/net and Alpine pcre2; frontend findings include old Go/containerd/Docker/OTel/grpc/x packages, including two Docker rows with no fixed version reported. No rows suppressed. Official latest BuildKit0.34.0 and exact master `64aefaef4d7dbb993156a0839958e4342aeb4c51` source metadata still list go-archive0.2.0 and x/net0.59.0 while retained reports require0.3.0/0.60.0. This is source-level evidence that a blind latest-version bump is not a verified remedy; no claim of an actual scan of those newer images. Exact official source files/receipts retained.

Next justified trial may test the coherent npm PATH repair and collect previously skipped full app/native/runtime/persistence diagnostics under the existing reviewed controller, which permits functional collection after captured tooling advisory failures. Keep the original tooling pins/findings visible unless a separately coherent verified remedy is prepared; do not guess a secure digest, remove either tooling role, build a substitute DB or raise limits. Overall tooling/security/advisory coverage remains held, regardless of individual functional results. Continue within remaining standing allowance, with fresh source/integration/quota/resource admission and ledger reservation; no routine per-candidate approval.

The private staging planning default is dedicated owner-controlled private GHCR; GitHub's current official billing documentation states Container registry storage/bandwidth is free, distinct from the small shared Actions evidence allowance. Zero-dollar blocks stay. Exact accepted image, measured size, private visibility/access, pull/restore proof, concrete deployment/profile approval and real staging origin/Neon/secret/maintenance ownership remain unfulfilled; no image publication or deployment is implied.
