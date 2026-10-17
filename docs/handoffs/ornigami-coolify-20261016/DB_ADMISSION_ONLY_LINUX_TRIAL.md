# Admission-only Linux trial — 17 October 2026

**One authorized attempt completed and failed admission. No retry or replacement download.** [Run 39032144805, attempt 1](https://github.com/joserubiobejarano/Ornigami/actions/runs/39032144805) downloaded one DB successfully, then correctly rejected its expired NextUpdate under the unchanged freshness policy. Dependent Linux fixtures were skipped. Original diagnostics and complete failure capture are retained; one verified owner custody acknowledgment and scoped cleanup passed. This grants no image/security/runtime/release acceptance.

## Exact publication and admission

Candidate **`2ae7f60ce8edd1880b24924a0e213f34abd97ed1`**; one request-only child **`97fc2b86f2efe55683242e8b20a38a79fdebfb1e`**. Publication branch **`codex/ornigami-sri-local-prototype-f-20261016`**. Workflow `.github/workflows/ornigami-db-admission-only.yml`, Git blob `0c586a048fc3055b675ba9fbf242cf48917f335a`, SHA-256 `d9fbe748cd8df38b89d9b177edc62323c720bc92f9a774911e9cb7d3d5c7fdeb`. Application lock SHA-256 remains `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815`.

Fresh admission verified exact source/package/lock/workflow identities, actual effective holds/watchers, active operations and included capacity before publication. Ornigami Coolify project `vqkyv5dpjpjazuknkgyunioi` / fictional-staging `d9ixeysd9tajcavvibltt3is` remained empty: no app resource or watcher/operation target. Owner Vercel UI explicitly showed Git disconnected; the API omitted link (not treated alone as proof), production `dpl_AXyNVgUpoPPhczSUjpxrURtp9JfE` and latest deployments were unchanged, zero active operations. All four Netlify projects were unlinked, no team build activity. GitHub had exactly CodeRabbit/Netlify/Vercel, no hooks/Pages, no active Actions runs; CodeRabbit had no push subscription (its write permissions are retained, not described as read-only). Source CI/security exclusions and isolated request filters were checked. No integration settings were changed or restored.

GitHub Free showed **86/2000 included minutes, 0.1/0.5 GB Actions storage**, with three existing repository artifacts totaling 635,855 bytes. Standard public `ubuntu-24.04` only; no paid/larger fallback or purchase. Actual allocated-runner disk reserve was separately enforced. The candidate was pushed once without force and without either marker change; independent observations confirmed **zero candidate runs and deployments**, unchanged provider holds and empty app environment. Only then was the exact reviewed diagnostic marker committed and pushed once. Its SHA-256 is `1e2aa1f555db9f6169402de942fc5e134a903aaa364a5b2dc38d5d9a667e151e`; only `.github/build-requests/ornigami-db-admission.json` changed. Full-build marker stayed unchanged. Actual Linux protocol recorded request SHA = executed workflow SHA, exact restricted ref, source = immediate parent, matching candidate/request workflow blob, correct lock and clean detached source. Exactly one matching run, attempt one, and no request deployment were confirmed after completion.

[Fresh admission](./external-db-admission-39032144805/ADMISSION_PASSED.json), [exact source identities](./external-db-admission-39032144805/source-admission.json), [candidate publication confirmation](./external-db-admission-39032144805/PUBLICATION_CONFIRMED.json), [request verification](./external-db-admission-39032144805/REQUEST_VERIFIED.json), [actual Linux binding](./external-db-admission-39032144805/artifact/protocol.json), [post-trial holds](./external-db-admission-39032144805/POST_TRIAL_HOLDS.json).

## Phase results

| Phase/gate | Result | Evidence/limit |
| --- | --- | --- |
| Fresh integration/identity/included-capacity admission | Passed | Owner UI + read-only API receipts |
| Candidate-only publication isolation | Passed | No marker change, zero candidate runs/deployments |
| Matching request and Linux source/workflow binding | Passed | Single request-only child; actual workflow SHA/ref match |
| Pinned tools/versions/architecture/resource admission | Passed | Node 22.23.3/OpenSSL 3.5.8; Trivy 0.76.0; Linux x64 |
| Exactly one DB download | Passed | Exit 0; 12:20:52.563–12:20:59.034 UTC; one explicit repository |
| Shared DB freshness admission | **Failed** | `NextUpdate-expired`; retained raw bytes/clocks/reasons |
| Dependent controlled Linux fixtures | **Skipped / untested** | Shared prerequisite failed; no weakened or forced pass |
| Resource controls and disk reserve | Passed for this diagnostic | 2 GiB/1 CPU/zero swap/512 MiB heap; zero limit/OOM events |
| Artifact capture/completeness | Passed for this failure path | 22 hashed files + manifest; raw and identity/clock consistency verified |
| Owner durable custody acknowledgment | Passed independently | Exactly one owner status after digest/fsync/read-back |
| Scoped cleanup and finished-log recovery | Passed independently | Owned directory absent; supplemental finished evidence saved/read back |
| Vulnerability scans / app install/build / image / runtime/browser/restart/cache | **Untested / not run** | Outside this authorization; no image exists |
| Historical image security / production adoption / release | **Failed/unresolved or closed** | No finding waived or fixed; no acceptance inferred |

[Machine-readable results](./external-db-admission-39032144805/RESULTS.json), [all final step conclusions](./external-db-admission-39032144805/jobs-final.json), [phase receipts](./external-db-admission-39032144805/artifact/phases.json).

## Proven reason for this rejection

The one invocation used `trivy image --download-db-only --no-progress --db-repository ghcr.io/aquasecurity/trivy-db:2` and a newly owned empty cache. Download exit 0 is not freshness acceptance. No mirror/replacement DB, second invocation or Java DB was requested. The retained original metadata is **153 bytes**, SHA-256 **`b5a896b8af7c6235ce5ea8e55d91d8df95ce6f292dbdc171acbad0335c2bfb10`**, with schema Version 2:

| Clock/field | Exact retained value |
| --- | --- |
| UpdatedAt | `2026-10-16T01:13:54.947090392Z` |
| NextUpdate | `2026-10-17T01:13:54.947090202Z` |
| DownloadedAt | `2026-10-17T12:20:59.030530208Z` |
| Initial guard OS clock | `2026-10-17T12:20:59.036Z` |
| Actual validation OS clock | `2026-10-17T12:21:01.336Z` |

NextUpdate was **11h 07m 06.389s expired** at the reviewed millisecond comparison precision. All required timestamps parsed; sole rejection code was `NextUpdate-expired`. Original nanosecond-shaped strings remain intact. Parsed values and expiry were independently recomputed locally from retained bytes. Policy remains `UpdatedAt <= actual guard clock < NextUpdate`, zero grace and no DownloadedAt extension; a recent download does not renew it. No suppression or threshold change.

Runner streamed the **1,628,446,720-byte DB** SHA-256 `bf1f1b29d76cae9ff085d418cb4bfdb3906b6069f837abdef06558b8102dd1db`; scanner executable SHA-256 `1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19`. DB contents were not uploaded or retained locally; the local assessment verifies receipts, not a second local DB hash. Scanner archive SHA-256 `e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7`; Node archive `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`; extracted Node `fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48`. Archive checksums preceded execution; actual versions/checksums are retained in bootstrap stdout.

This establishes why **this** admission failed. Why the configured repository served a DB with expired metadata is not established by this evidence; no publisher/registry/transport attribution is invented. The precise cause of historical run 39027472379 remains unrecoverable because its rejected metadata/clock were missing. This new result does not retroactively repair that failure or its completeness limitation.

[Original metadata](./external-db-admission-39032144805/artifact/database-admission/metadata.original.bin), [complete rejection index](./external-db-admission-39032144805/artifact/database-admission/index.json), [download stdout/stderr](./external-db-admission-39032144805/artifact/download.stderr), [independent assessment](./external-db-admission-39032144805/INDEPENDENT_ASSESSMENT.json).

## Actual resources and deadlines

Both serial scopes retained **MemoryMax 2,147,483,648 bytes, swap maximum 0, CPU quota 1 core**; actual worker `cpu.max` was `100000 100000`; explicit pinned Node heap 512 MiB. Tool-preparation peak was **422,473,728 bytes**, final max/OOM/kill counters zero. Worker peak was **2,014,834,688 bytes (1.876 GiB)**, 11 timestamped samples over **8.839s**; final memory events max/oom/oom_kill/oom_group_kill all zero, resource verdict passed independently of controller exit **1**. CPU usage was 6.522566s; 56 throttled periods/1.024913s throttled time are retained as expected observations under the cap, not omitted.

Minimum observed free disk **89,852,461,056 bytes**, above 20 GiB reserve. Observed cleanup free disk **89,993,617,408 → 92,116,877,312 bytes**; this is filesystem free-space observation, not an exclusive per-process disk-usage measurement. The 600-second initialization work deadline, 25-minute job limit, 600-second custody window and reviewed per-phase timeouts remained unchanged; run 12:20:40–12:21:28 UTC, worker 12:20:52.507–12:21:01.346, cleanup 12:21:25.651. No budget increase or swap fallback.

These are real small-diagnostic Linux measurements. They establish no app/compiler memory headroom, RSS/page-cache attribution, full-build safety or combined shared-host capacity. No build was attempted and no Contabo operation was used.

[Timestamped worker samples and counters](./external-db-admission-39032144805/artifact/resources.json), [bootstrap controls/peak/versions](./external-db-admission-39032144805/artifact/bootstrap.stdout).

## Immutable custody, completeness and cleanup

Artifact **12100568577**, `ornigami-db-admission-39032144805-1`, ZIP **9,995 bytes**, SHA-256 **`260a9652c4814e0653ce360abb03211f7b48bbd865e214bbd0ed246bbb9fbc27`**. Requested 30-day retention; API expiration 2026-11-16T12:21:01Z. Original ZIP is preserved unchanged and durable locally. Identity/path/name/attempt/request and digest were verified; fsync and read-back completed **12:21:15.064 UTC**, then exactly one owner status was created **12:21:16 UTC**. Custody acknowledged byte retention only, not successful admission or completeness.

Separately verified **22 manifest files plus manifest, exact file set, all byte counts/hashes**, nonempty **237-byte summary**, original metadata/receipt identity and both clocks, source/executed workflow binding and explicit skipped reason. Runner capture passed; the local independent assessment confirms this rejection is not the earlier ambiguous missing-diagnostic failure. No valid-real-DB path or Linux fixtures passed in this run. Complete diagnostic capture does not complete image/security acceptance.

Cleanup verified current run/attempt/request/ref ownership and direct-child path/symlink boundaries, then removed only `/home/runner/work/_temp/ornigami-db-only-39032144805-1-tVOu4m`. Read-back **existsAfter=false** at **12:21:25.651 UTC**, after owner acknowledgment. Cleanup step succeeded. Finished raw log ZIP, complete text logs, run/jobs/artifact metadata and the cleanup receipt were then durably saved and read back. They are **supplemental evidence produced/recovered after the original immutable artifact**, not claimed part of its manifest. No global prune or shared-host deletion.

[Original ZIP](./external-db-admission-39032144805/custody/evidence.zip), [download/read-back receipt](./external-db-admission-39032144805/custody/DOWNLOAD_RECEIPT.json), [single owner status](./external-db-admission-39032144805/custody/STATUS_ACK.json), [completeness](./external-db-admission-39032144805/COMPLETENESS.json), [finished-log recovery hashes](./external-db-admission-39032144805/FINISHED_RECOVERY.json), [recovered cleanup](./external-db-admission-39032144805/CLEANUP_RECOVERED.json), [entire evidence checksums](./external-db-admission-39032144805/SHA256SUMS.json).

## Remaining gates and stopped state

The one trial and one custody acknowledgment are consumed. **Stopped; no retry, new marker edit, replacement DB, policy exception, extra registration, scan/build, paid fallback or resource increase.** Published restricted branch stays at request `97fc2b86f2efe55683242e8b20a38a79fdebfb1e`; full-build marker remains unchanged. Holds remain effective; existing production deployments/runtime jobs/domains and QR staging are preserved. No registry/GHCR image publication, VPS operation, DNS/public routing, deployment, provider activation or framework production adoption occurred.

Before any separately approved future attempt, review why a newly fetched DB was expired and how to obtain an admissible vendor DB under the existing policy. Do not silently add DownloadedAt grace, change repository/version, fetch replacements or retry this request. Any policy interpretation/repository/tooling or source change needs its own concrete review; any further external attempt needs new exact-source approval and fresh integration/capacity admission. A future valid DB path must still exercise the skipped Linux controlled fixtures.

No vulnerabilities were scanned here. All **43 historical Debian highs** and earlier distinct base/final findings remain unresolved; historical passing functional evidence remains separate and unchanged. All nine image scan roles, intermediate tooling safety, fresh accepted image, app runtime/security/browser/restart/cache validation and build-memory investigation remain open. No retained accepted deployable image exists. Maintainer/backup/security ownership, production framework adoption, exact staging origin/callbacks, dedicated Neon identity, independent backups/alerts/key custody/replacement-host recovery remain open. Cron/provider and live-release gates stay closed.

**819 prior evidence files were verified unchanged** before adding this result. This report and sanitized original failure evidence are committed locally for integration review; no merge or shared-roadmap update.
