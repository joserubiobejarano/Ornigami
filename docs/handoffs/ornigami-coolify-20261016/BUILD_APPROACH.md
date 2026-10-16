# Build memory investigation and external builder recommendation

Latest external result: [the one approved Actions trial failed source admission](./EXTERNAL_TRIAL.md), before any build or Linux memory/runtime measurement. Earlier lock SHA-256 values in this investigation identify Windows working-copy bytes; the trial report distinguishes the committed LF checksum. No retry or Linux fit is established.

The owner accepted the external resource/cost approach after this investigation. The subsequent [build approval packet](./RUN_APPROVAL.md) supersedes the inactive-template instructions below with a restricted preparation-branch workflow and exact candidate/run procedure. Publication and one trial are conditionally approved; the [integration preflight](./INTEGRATION_PREFLIGHT.md) must be completed before either push. The measurements and failed-build evidence below are unchanged.

16 October 2026. This follows the [failed Linux build handoff](./HANDOFF.md). The original failure receipts and hashes remain unchanged. No Contabo connection/retry, shared-limit change, purchase, external workflow dispatch, image publication, deployment, cron activation or provider action is authorized or performed by this follow-up.

## Recommendation and complete incremental cost

Use a **standard GitHub-hosted `ubuntu-24.04` x64 runner**, not a paid larger runner. Read-only `gh repo view` confirmed `joserubiobejarano/Ornigami` is **PUBLIC** on 16 October. GitHub lists this public-repository runner as **4 CPUs, 16 GB RAM, 14 GB SSD**. The repository need not change visibility or move to an organization. [Official runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

| Cost component | Proposed approach | Additional cost |
| --- | --- | ---: |
| Runner compute | Standard public-repository Actions runner; manual build only | $0 |
| Builder subscription / new VPS | None; ephemeral GitHub VM | $0 |
| Persistent build cache | None; cold builds, temporary local BuildKit cache removed | $0 |
| Actions image artifacts | None; do not upload a large image tar as an Actions artifact | $0 |
| Image registry storage and transfer | Proposed GHCR handoff only after separate publication acceptance; currently free for container images, including private packages | $0 under current policy |
| Deployment / provider work | None; no host deployment or provider operation | $0 |
| Tax / currency conversion on this new usage | No paid line item to convert or tax | $0 |
| **Total incremental platform charge** | **Recommended public standard runner + the proposed GHCR path** | **$0 USD per build and per month under current policies** |

Public standard-runner use is free; paid larger runners are a different product. At four builds/month taking 20 or 40 minutes, the recommended compute charge remains $0; at twenty builds/month (400 or 800 minutes), it remains $0. This is not a quote for an unknown paid account or a promise that pricing cannot change. Existing Contabo, Neon and other company subscriptions are unchanged and excluded from this incremental build cost; operator labor is not a purchased service here. [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GHCR storage/bandwidth policy](https://docs.github.com/en/billing/concepts/product-billing/github-packages).

No paid plan, card entry, prepaid credits, artifact retention or Docker Build Cloud subscription is needed for this recommendation. GHCR publication is not implemented or authorized in the prepared template; there is currently no new package or registry credential. Future publication must accept package visibility/access and an app-scoped read-only pull identity before Coolify can consume a retained digest. GitHub currently promises at least one month's notice before a Container Registry pricing change.

If the repository becomes private, **stop and re-review**: the standard runner becomes 2 CPUs/8 GB and private usage can consume paid minutes. The template refuses a private repository before allocating its runner. As a price comparison only, GitHub's paid 4-core larger Linux runner costs $0.012/minute, so a 20-minute job is $0.24 and a 40-minute job $0.48 before applicable taxes; it additionally requires an eligible organization plan. That purchase/setup is unnecessary here. [Runner pricing and eligibility](https://docs.github.com/en/billing/reference/actions-runner-pricing).

## Resource envelope and first external trial

These are **proposed limits for a future external trial**, not changes to Contabo and not a measured minimum:

| Layer | Proposed resource/admission setting |
| --- | --- |
| Runner | Standard public `ubuntu-24.04`, x86_64; nominal 4 CPUs / 16 GB RAM / 14 GB SSD |
| Admission | At least 4 online CPUs, 14 GiB total / 12 GiB available memory and 10 GiB free scratch; otherwise fail without pruning tools or selecting a paid runner |
| BuildKit | Aggregate 8 GiB RAM, zero additional swap, 3 CPU quota, one OCI build step at a time |
| Node build | 4096 MiB old-space ceiling, one Next static-generation worker; measure the whole cgroup because Node heap is only part of total memory |
| First build flags | Webpack memory optimization on; source maps retained; separate Webpack worker initially off pending Linux/plugin acceptance |
| Time | Plan 10–20 minutes for a cold build and scan, not a measured SLA; build command cap 30 minutes, job cap 40 minutes |
| App runtime | Still provisional 768 MiB / 0.75 CPU / 512 MiB heap; separate from build resources |

The prior 2 GiB failure proves the old allowance was insufficient for that cold build. It does not prove that 4, 6 or 8 GiB is the minimum. The larger external envelope leaves space for V8, native/SWC allocations, compiler processes, BuildKit and page cache; actual Linux peak must determine whether it is adequate. If this external profile fails, retain metrics and stop for review rather than escalating resources automatically. No new always-on builder is proposed.

## What the failure establishes

The failed source was `42e75deb4d9525f111222879b2229cffda904f57`, lock SHA-256 `5eff2b421d8becc7d24b79b9af9265cb655014c56e36873c8400b2a2c1c5ed47`. Both dependency installations completed. Failure occurred during **webpack optimized production compilation**, before TypeScript/prerender completion and before the static CSP hash generator could finish. It was not a runtime, Neon or scheduler failure.

The builder cgroup hit its 2 GiB ceiling with one OOM kill. A near-failure sample recorded 2,030,133,248 bytes anonymous memory against only 12,734,464 bytes file memory, full-memory pressure avg10 14.78%, and 27,469 major faults. Host memory remained available. This supports a compiler/process allocation problem within the imposed cgroup, rather than global host exhaustion or merely evictable npm cache. It does **not** identify a particular leaking module or establish a V8 leak.

Installed Next 16.4.1 guidance describes `experimental.webpackMemoryOptimizations` as a low-risk experimental way to reduce peak memory. Its separate Webpack build worker is automatically disabled when custom webpack configuration exists; Sentry supplies that configuration. Enabling that worker is another candidate, but custom plugin compatibility and aggregate child-process memory must be tested. Source evidence is the installed memory guide and `next/dist/build/index.js`; the [upstream memory guide](https://nextjs.org/docs/app/guides/memory-usage) describes the same tradeoffs.

Installed Sentry 10.69.0 webpack code generates server `source-map` and client `hidden-source-map` unless `sourcemaps.disable` is set. An absent upload token prevents upload, rather than preventing map generation. Source-map generation is therefore a plausible avoidable allocation cost for a token-free fictional rehearsal. `widenClientFileUpload` broadens upload selection; it is not by itself proof of the memory cause. Without a heap/native allocation profile, attribution remains a hypothesis to compare locally.

Do not switch away from webpack and lose the reviewed SRI path, disable TypeScript errors, drop CSP/static generation, remove React Compiler, or weaken runtime protections to fit a build budget. Disabling source maps has an observability/symbolication tradeoff and remains a separate explicit opt-in.

## Prepared local changes and external workflow

Five cold local comparison builds completed on Windows 11 x64 / Node 24.11.1, with the unchanged lockfile, 1408 MiB heap setting, one Next worker, synthetic inputs and no upload token. The [profile manifest](./LOCAL_PROFILE.json) binds the modified configuration/Dockerfile/helper hashes and baseline Git commit. Original `.next` output was backed up and restored; no Linux image was built in this follow-up.

| Local profile | Sampled process-tree RSS peak | Change from baseline | Sample span |
| --- | ---: | ---: | ---: |
| Baseline | 3,398,213,632 bytes / 3.16 GiB | — | 117.3 s |
| Webpack memory optimization | 3,350,503,424 bytes / 3.12 GiB | 1.4% lower | 130.6 s |
| Sentry source maps suppressed | 3,037,605,888 bytes / 2.83 GiB | 10.6% lower | 69.4 s |
| Memory optimization + maps suppressed | 2,937,016,320 bytes / 2.74 GiB | 13.6% lower | 55.9 s |
| Separate Webpack worker + memory optimization, maps retained | 2,952,921,088 bytes / 2.75 GiB | 13.1% lower | 71.2 s; separately measured wall time 73.5 s |

These are single runs with approximately 2.16-second Windows process-table sampling, summing the launcher and discovered descendants. They can miss brief peaks/processes and double-count shared resident pages; they exclude the Linux BuildKit/cgroup environment. The 8 GiB sampled safety cutoff was not crossed; it was not an OS-enforced memory limit. Stopwatch recording was corrected before the fifth run; the manifest records the final helper's hash, and the first four durations are sample spans, not exact wall times. No precise speedup is claimed. The memory-only difference is small enough to treat cautiously. Source-map suppression and the worker merit a Linux comparison, but none of these results establishes a 2 GiB Linux fit or a leak diagnosis.

All five builds completed compilation, TypeScript checks and static CSP hash generation. Seven focused security tests and an independent `tsc --noEmit --incremental false` passed. **Optimized HTTP production smoke was not run**: each fresh build output was removed after profiling and the original output restored. No extra build was run just to turn that missing receipt into a success claim. Sentry/plugin worker compilation passed locally; runtime, source-map symbolication, Linux native memory and other deployment acceptance remain open.

Raw comparison logs, samples and the ad hoc profiler remain under `.local/coolify-preparation/local-build-profile/` and `.local/coolify-preparation/profile-build.ps1`. The profiler is diagnostic evidence, not a production build dependency. Keep source maps on and the separate compiler worker off for the first proposed external trial; the cheaper, generously sized public runner avoids making an observability tradeoff solely to squeeze into Contabo's failed allowance.

The Dockerfile retains the original 1408 MiB default build heap and false optimization flags. It accepts explicit build-only arguments for the heap and three independent options: `ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS`, `ORNIGAMI_BUILD_DISABLE_SOURCEMAPS`, and `ORNIGAMI_BUILD_WEBPACK_WORKER`. Next applies these options only under `ORNIGAMI_CONTAINER_BUILD=true`; source-map suppression also requires no Sentry upload token. Runtime memory, headers/CSP/SRI, static hash generation and job/provider flags retain their contracts. Turning the options off restores the original build settings.

The original inactive template has been replaced by the [preparation-branch workflow](../../../.github/workflows/ornigami-image-rehearsal.yml). See the [approval packet](./RUN_APPROVAL.md) for the restricted push trigger and exact source/lock admission. It uses no application secrets or GitHub token permissions, no host SSH, no publication and no deployment. Its expanded disconnected Linux production HTTP/security/restart checks use synthetic Auth/Google values, no database URL/network/published ports, and disabled feature/task flags. The full image scan fails on high/critical findings or invalid results. No large Actions artifacts or persistent remote build cache are configured.

Local validation of that template comprises YAML parsing, Bash syntax checks and offline fixtures for its actual Trivy parser; it has not run on GitHub. The parser must accept Trivy's legitimate omitted/null/empty vulnerability collections while rejecting malformed values, mismatched image identity and high/critical findings. A synthetic parser fixture is not a scan receipt. The pinned base still has the unresolved advisory gate recorded in the original handoff.

Before any future run, the owner must approve publication of the exact candidate and a dedicated build-request commit. The branch currently exists only locally; GitHub main does not contain this prepared candidate. A first run is a build/validation trial: its image is temporary and removed on cleanup. A separate accepted GHCR publication phase would retain the scanned image by digest; the workflow does not claim artifact delivery or create pull credentials.

## Remaining validation gates

The original failure evidence remains authoritative. Local Windows comparisons are not Linux Node 22 image acceptance. Still required: an admitted external Linux build; base-image advisory remediation/disposition and a final image scan; Linux app health/negative security checks, native/heap/external memory measurements and restart/cache persistence; exact accepted DNS/HTTPS origin and callbacks; isolated bounded Neon target and restore; independent copies, delivered alerts, key custody and replacement-host proof. No compatible image rollback is yet demonstrated. Deployment, autodeploy, cron, providers and live-release gates remain closed.
