# Dedicated Linux DB admission-only preparation — 17 October 2026

Execution follow-up: the subsequently approved exact publication, one request/attempt and one owner custody acknowledgment are consumed. See [Linux result: expired DB rejected, complete diagnostics retained](./DB_ADMISSION_ONLY_LINUX_TRIAL.md). No further trial is approved. The local preparation/proposed scope below is historical.

Local preparation is complete. **No publication, registration, request commit, DB download, external runner, acknowledgment, scan, build, registry/VPS/deployment/provider operation occurred.** Holds were not altered; their effective live state was not freshly rechecked for this local-only task. QR staging and unrelated work were preserved. A future run requires separate approval and fresh admission.

## Exact candidate and identities

Candidate **`2ae7f60ce8edd1880b24924a0e213f34abd97ed1`**, branch **`codex/ornigami-db-admission-only-20261017`**, tree `a11153448904e21c82bea866663dd663f49c0921`, isolated worktree `.local/framework-prototype/ornigami-db-admission-only`. Based on local DB repair `4a555d43e5ae26ca6bdfe229a5215c62577c3077`; implementation commit `cf30f4ddbf538bd7c836438dea11fcd03f4e146f` and final completeness repair are local. Preparation docs began clean at `4854b3619e8ebe5c315fee82fb69e2f0ac1ab233`. Main/prior worktrees were preserved.

| Identity | Exact value |
| --- | --- |
| Admission-only workflow Git blob | `0c586a048fc3055b675ba9fbf242cf48917f335a` |
| Admission-only workflow SHA-256 | `d9fbe748cd8df38b89d9b177edc62323c720bc92f9a774911e9cb7d3d5c7fdeb` |
| Admission-only controller SHA-256 | `97b941309e6d06f7776eb6cd2f7d59c934426e07472564e00463db1f18ee9edc` |
| Unchanged DB guard SHA-256 | `eca21565887cdbf39261d50a563651d3fafcef7a26e80af0698a67790fd65fc8` |
| Unchanged application lock SHA-256 | `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815` |
| Unchanged framework package SHA-256 | `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f` |
| Unchanged framework patch SHA-256 | `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5` |
| Unchanged full-build marker SHA-256 | `fede7ba833abd87e813168412a1e798bdd2ac6c480689dd42d7c785c2f00f676` |
| Exact proposed diagnostic request bytes SHA-256 | `1e2aa1f555db9f6169402de942fc5e134a903aaa364a5b2dc38d5d9a667e151e` |

[Every source/package/lock/workflow identity](./db-admission-only-evidence/IDENTITIES.json), [exact request preview](./db-admission-only-evidence/REQUEST_PREVIEW.json), [request protocol/tool pins/deadlines](./db-admission-only-evidence/REQUEST_PROTOCOL.json), [implementation diff](./db-admission-only-evidence/implementation.patch). Preview is outside all trigger paths; no diagnostic marker or request commit exists. Full workflow, full marker, Dockerfile, framework, npm archive, lock and freshness helper match their previous Git blobs exactly. Node remains 22.23.3/OpenSSL 3.5.8. No new image identity exists.

## Restricted trigger and bounded behavior

Use existing publication branch **`codex/ornigami-sri-local-prototype-f-20261016`**, workflow **`.github/workflows/ornigami-db-admission-only.yml`**, and distinct trigger path **`.github/build-requests/ornigami-db-admission.json`**. Publishing the candidate without a request-path change cannot invoke either preparation workflow. Existing CI/security exclusions remain effective in source; this is not live deployment-hold evidence. No workflow_dispatch/default-branch merge, PR or schedule is required. Full image marker **`.github/build-requests/ornigami.json` remains unchanged**.

Request is exactly one single-parent child of this candidate, changing only the new request path, with keys `purpose`, `sourceSha`, `packageLockSha256`; purpose is `ornigami-db-admission-only-v1`, source is the exact candidate above, lock is above. Runner checks immediate parent, exact changed paths, lock bytes, candidate/request blobs for both workflows/full marker, actual executed workflow SHA/ref, clean detached candidate and public repository/branch/attempt one. Local real Git histories test rejection of extra files, extra keys, wrong source/lock/purpose, merges and workflow/full-marker drift. Local source/trigger tests prove diagnostic requests cannot select the full workflow. Actual Linux shell/jq/GitHub event binding remains untested.

One standard public `ubuntu-24.04` job, no paid runner or capacity fallback. Existing shared trial concurrency group with cancellation disabled; no automatic retry; rerun attempts are rejected. Serial tool and diagnostic scopes enforce **2 GiB / 1 CPU / zero swap / 512 MiB Node heap**, with verified actual cgroup controls and 20 GiB free-disk reserve. Runner admission requires x64/Linux, two host CPUs, 3 GiB available memory, disk reserve and supported sudo/systemd/cgroup tooling. Bootstrap records actual tool versions/checksums and host-tool inventory. Only Node/Trivy archives are fetched, checked against existing fixed digests before use; no dependency installation or image pull/scan/app build.

Exactly one Trivy `image --download-db-only` invocation uses a newly owned cache and one explicit `ghcr.io/aquasecurity/trivy-db:2` DB repository, avoiding default mirror fallback. This is a DB OCI artifact, not a container-image pull. Source inspection confirmed the pinned flags/defaults: [Trivy source and hash receipt](./db-admission-only-evidence/LOCAL_TOOL_IDENTITIES.json), [retained upstream source](./db-admission-only-evidence/trivy-db-flags.go). No orchestration retry; upstream transport behavior is not claimed to be a single HTTP request. Actual DB output has never been obtained by this candidate.

One shared admission runs even after failed download, so partial/missing inputs get original-byte/identity/clock/rejection receipts. Metadata bytes (bounded 64 KiB), scanner/DB identity, initial and validation OS clocks, parsed/raw timestamps and exact reasons are retained before failure. Guard policy is unchanged: schema 2 and `UpdatedAt <= guard clock < NextUpdate`, zero grace, no DownloadedAt freshness extension. Failure skips dependent work; no image roles exist in this workflow. On successful download and admission only, controlled Linux schema/fail-fast fixtures run separately using fictional bytes and clocks. Their success cannot substitute for real DB admission.

Deadlines: **25-minute job; 600-second work deadline from initialization; 180-second bootstrap; 360-second worker; 180 seconds per download/fixture command; 600-second custody window; 90-second cleanup**, with five-second kill grace on outer timeout commands. Work cannot extend its initialization deadline. Timestamped wall/monotonic/cgroup/disk samples are taken every second and before/after diagnostics; memory peak/limit/OOM/kill and CPU counters remain visible. Resource verdict is separate from DB/fixture outcome. Nonzero memory-limit/OOM counters stop work; unsupported controls or disk reserve exhaustion fail closed. Administrative fetch/capture/custody/cleanup remain outside worker scopes, under the job deadline. No compiler headroom claim follows.

## Evidence and custody

Capture records explicit passed/failed/skipped phases, required receipts, exact rejection reasons, raw-byte and identity/clock consistency, nonempty summary and hashed file/byte manifest. Failed/rejected admission can have complete diagnostic capture; missing/interrupted records fail completeness. A worker initializes skipped phases before resource admission; an attempted diagnostic without inventory cannot be silently treated as skipped. No DB/tool archives or secrets are uploaded. Artifact content is bounded at 64 MiB, requested retention 30 days (repository policy still applies). Failed source admission uses workflow-owned fallback capture, never candidate code.

**One owner-authenticated acknowledgment is required for the proposed future run and needs its own explicit run-specific approval.** New helper `retain-db-admission-evidence.mjs` binds workflow path, artifact name and attempt one, then reuses existing owner/request/run/digest/fsync/read-back checks before exactly one status POST. A custody receipt proves durable bytes only; completeness and security/admission remain independent. No real API/status was used locally.

Only verified custody permits explicit cleanup. Cleanup checks the resolved direct child of RUNNER_TEMP, exact run/attempt/request/ref receipt and no symlink/junction/reparse point, then removes only that claimed tree and reports disk/removal read-back. No global cleanup, Docker/VPS operation or other project path is touched. If custody is absent, explicit cleanup fails/skips; GitHub's eventual ephemeral teardown remains outside our control and the uploaded artifact is the fallback. Protocol failure likewise avoids candidate cleanup. Final cleanup observations occur after immutable upload: **download finished logs/summary separately after completion**, preserve their identities and assess that supplemental recovery independently. Hard cancellation/termination may prevent complete capture; do not infer completeness.

## Local evidence and phase disposition

**128/128 tests pass, zero failures/skips**, final bounded suite. Coverage includes actual temporary Git histories, trigger isolation, download failure/launch exception, one shared rejection/success, downstream skip, immutable original bytes/clocks, missing/tampered/incomplete capture, late-worker inventory absence, manifest hashes, Python failed-source fallback, owned cleanup, junction refusal, resource-policy drift/limit/OOM/disk fixtures and separate fake-API custody checks. Full-image security/coverage regressions also remain intact.

Actionlint **1.7.12 passes**; all **eight Bash blocks/scripts and three Python bodies** parse. Optional shellcheck/pyflakes adapters were unavailable and disabled, not reported run. Local actionlint archive/executable bytes were verified against the already installed pinned archive; no tool binary was downloaded. [Checks](./db-admission-only-evidence/CHECKS.json), [TAP](./db-admission-only-evidence/tests.stdout), [resource receipt](./db-admission-only-evidence/bounded-6/resources.json), [failures/limitations](./db-admission-only-evidence/LIMITATIONS_AND_FAILURES.json).

Final Windows Job Object: **2 GiB / 1 CPU / 512 MiB Node / 180-second wall cap**, exit 0 in **33.997 seconds**, peak committed **174,100,480 bytes**, minimum free system memory **15,725,322,240 bytes**, observed shared-system disk-growth peak **5,902,336 bytes**. No supervisor stop. Windows provides no Linux zero-swap/cgroup/OOM proof. First local run inherited the prior launcher's 4 GiB/3 CPU bounds and failed one junction-refusal assertion (57/58); its exact output is preserved. The launcher now supports tighter 2 GiB/1 CPU options without changing previous defaults. All later runs used those tighter limits; repeats followed actual capture/custody/resource/source-binding repairs. No external budget was changed.

| Gate | Disposition |
| --- | --- |
| Local protocol, isolation, failure/capture/cleanup regressions | Passed: fictional/local files only |
| Workflow lint and syntax | Passed; unavailable optional adapters untested |
| Historical preservation | Passed: 742 files verified unchanged |
| Live holds/watchers/operations/included capacity | Untested freshly; required before future publication |
| Real pinned Linux tool bootstrap and cgroup controls | Untested |
| Real DB download/admission/lease | Untested |
| Controlled fixtures on actual Linux | Untested; Windows fictional fixtures passed |
| Runner artifact completeness / owner custody / final cleanup | Untested; local fixture contracts passed |
| Historical image security | Failed/unresolved; 43 historical Debian highs not fixed by this work |
| New image, runtime/restart/cache, deployment/release acceptance | Untested/closed |

Historical passing Linux functional evidence stays preserved. Historical failed base/final scans, original artifact-completeness failure and supplemental recovered evidence remain separate. The previous DB rejection's precise cause remains unrecoverable from its missing originals. A future new DB result cannot retrospectively explain it. Maintenance/adoption owners, origin/callback agreement, isolated Neon, retained image, independent backups/alerts/key custody/replacement-host recovery remain open. No provider/cron/public-release gate is opened.

## Exact next proposed approval — not granted

Approve publication of **`2ae7f60ce8edd1880b24924a0e213f34abd97ed1`** only after fresh full integration/watchers/active-operation/exact-identity/included-capacity admission. Publish that candidate to the existing restricted branch without force or either marker change; verify no unintended build/deployment. Then approve one separate request-only child using the [exact preview bytes](./db-admission-only-evidence/REQUEST_PREVIEW.json), one diagnostic attempt under the limits/deadlines above, and **one owner-authenticated custody acknowledgment after verified digest, durable download and read-back**. Future request commit/run/artifact IDs do not yet exist.

Recover the immutable artifact, assess completeness independently, obtain finished logs and owned-file cleanup observations, commit sanitized results, and stop after that attempt. No retry, second DB, scan/build, resource increase, paid fallback, registry publication, VPS operation, framework production adoption, deployment/provider activation or hold restoration is included. Any full image trial remains a separate decision.
