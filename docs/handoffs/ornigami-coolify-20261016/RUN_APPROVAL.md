# External Linux build approval packet

Prepared 16 October 2026. **Not pushed or run.** The owner has accepted standard public GitHub Actions, an 8 GiB/3 CPU serial BuildKit cap, 4096 MiB Node build heap, source maps retained and no paid runner. Publication and one request-only trial are now approved conditional on verifying deployment integrations before either push. The [current preflight](./INTEGRATION_PREFLIGHT.md) stopped before publication: GitHub App inventory is now accessible, but Netlify's repository/branch deployment behavior requires owner account sign-in. The approval persists for resumption once verified. No Contabo host commands or changes occurred. Deployment, autodeploy, cron, providers, production data, migrations and GHCR publication remain closed.

## Exact identities

| Item | Value |
| --- | --- |
| Public repository | `joserubiobejarano/Ornigami` |
| Preparation branch | `codex/ornigami-coolify-preparation-20261016` |
| Build candidate | `51673d76bd407f69fa1a437f1b52587f0a888cfa` |
| Candidate lock SHA-256 | `5eff2b421d8becc7d24b79b9af9265cb655014c56e36873c8400b2a2c1c5ed47` |
| Workflow | `.github/workflows/ornigami-image-rehearsal.yml` |
| Job | `build-validate-scan` |
| Deliberate trigger file | `.github/build-requests/ornigami.json` — absent until approval |
| Runtime acceptance script | `deploy/coolify/linux-runtime-acceptance.sh` |
| Future local image tag | `ornigami:rehearsal-51673d76bd407f69fa1a437f1b52587f0a888cfa` |
| Registry publication | None; no GHCR write permission, login or push |

The approval packet is committed after the candidate so its exact SHA can be recorded without self-reference. The eventual trigger commit will have a third identity, recorded in Actions alongside the immutable candidate. It changes only the request JSON, not application or workflow code. A Git commit SHA is not an image identity: the workflow records the source revision label, Linux/amd64 platform, Docker image configuration ID, image size and archive checksum separately. No registry manifest digest exists yet.

## Trigger and publication boundaries

GitHub requires a `workflow_dispatch` workflow on the default branch. This workflow instead uses `push` with **both** an exact preparation-branch filter and an exact request-path filter, so no merge or workflow installation on `main` is needed. It has no dispatch, schedule, pull-request or tag trigger. [GitHub event rules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [branch/path filter rules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore).

The job rejects another repository, a private repository or another ref. Admission verifies the request commit matches the push SHA, is a single-parent commit changing only the request path, and contains exactly two validated JSON fields. The source must be an ancestor of the request commit, the workflow blob must be identical at source/request commits, and the detached source checkout must be clean with the expected lock checksum. There is no implicit "latest" source selection. Each later trial requires another deliberate request-only commit; there is no automatic retry or resource escalation.

Publishing the branch makes the existing unpublished preparation history public, including application/security dependency changes; it does not merge any of it into `main`. Existing CI/security push workflows skip this exact preparation branch to avoid additional automatic builds; their pull-request behavior stays intact. No pull request is opened by the procedure.

Repository reads confirmed public visibility, default branch `main`, no remote preparation branch and no repository webhooks. Historical GitHub deployment records exist. The candidate therefore disables Vercel Git deployments for this exact preparation branch via `git.deploymentEnabled`, using the [documented branch-specific setting](https://vercel.com/docs/project-configuration/git-configuration). It does not change other branches or shared Vercel settings. Existing cron workflows are not triggered by these pushes; schedule events use the default branch. No Vercel/host control plane settings were accessed or changed in this follow-up. Before the publication approval is exercised, the integration owner must confirm no additional GitHub App or external branch watcher will deploy this branch; an empty webhook list alone cannot prove that. If an unknown deployment integration exists, stop publication and resolve it with its owner.

## Resource, security and acceptance behavior

The free standard public `ubuntu-24.04` x64 runner is nominally 4 CPUs/16 GB RAM/14 GB SSD. Admission requires at least 4 CPUs, 14 GiB total and 12 GiB available memory plus 10 GiB scratch. No paid fallback, new service, cache subscription or purchase is selected. The [cost investigation](./BUILD_APPROACH.md) records the complete incremental $0 platform cost under current policies. Recheck visibility/pricing before execution.

BuildKit has one OCI worker step at a time, 8 GiB total RAM with zero additional swap, and 3 CPU quota. Docker and cgroup limits are checked. The build uses heap 4096 MiB, one Next static-generation worker, Webpack memory optimization enabled, source maps retained and separate Webpack build worker disabled. Synthetic `https://rehearsal.invalid` is only a build/test input, never an accepted public origin. This image must not be promoted to a real domain without an origin-bound rebuild and acceptance. No Sentry/provider credentials or upload token are supplied.

The Linux runtime trial uses the production image as UID 1000, read-only root filesystem, dropped capabilities, no new privileges, 768 MiB/0.75 CPU, no swap, no host ports and `network none`. It has a dedicated disposable named cache volume and bounded `/tmp`. HTTP probes execute inside its network namespace against loopback. They cannot reach a provider or database. Cron requests use missing/incorrect authentication only; no authorized job is invoked.

Acceptance extends beyond Docker liveness: production HTML/assets and CSP/SRI/header behavior, anonymous/session/protected-route boundaries, denied cron/API requests, native image behavior, restart and container recreation with cache persistence are asserted by the script. Receipts distinguish cache-volume continuity from application cache reuse. No cache proof establishes Neon persistence, media backup, sessions with real users, provider callbacks or scheduler readiness. All three runtime phases must pass. Linux checks are **prepared, not passed** until an actual run produces evidence.

Build and runtime receipts capture peak cgroup memory, OOM counters, resource limits, timing and disk use. The workflow records source/lock/request identities, pinned build/base/scanner versions, image identity and final scan results. Build failure and runtime failure still leave summaries/cleanup evidence; final scanning is attempted for an image produced by a successful build even if runtime acceptance fails. A cancelled job or abruptly lost runner may leave incomplete receipts; that is an incomplete trial, not acceptance.

## Base-image advisory review and scan gates

Pinned base: `node:22.23.3-bookworm-slim@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562`. Anonymous registry inspection confirmed Linux/amd64 and Node 22.23.3, image config `sha256:d0a16be756b6ec6658aecb8b7bcf87fa6c7d0d7fcc6ca53ad14bb49a4c90bdd7`. The Node [September 23 release](https://nodejs.org/en/blog/release/v22.23.3) is current for the 22.x line on this review date; [October 21 security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) are announced for 22.x with highest severity HIGH. Re-review the release/advisory status immediately before a run, especially on/after October 21; a changed base requires a new exact candidate and approval.

The [exact Docker Hub manifest snapshot](https://hub.docker.com/layers/library/node/22.23.3-bookworm-slim/images/sha256-efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562) still reports **4 critical, 22 high, 16 medium, 39 low and 2 unspecified** findings. These are advisory counts from Docker Hub, not fresh Trivy acceptance or evidence that the pinned base is safe. The proposed trial may collect build/runtime evidence while this known gate remains blocked; no advisory waiver is granted.

The workflow verifies the pinned Trivy binary, scans the exact base and then the exact final image for OS and language vulnerabilities. Base findings remain visible for remediation review; a base scan does not replace a final-image scan. Invalid/partial reports fail. Final HIGH/CRITICAL findings fail the job; the workflow does not ignore unfixed findings or accept a scanner outage as success. Human review must resolve each affected component/version/fix or an explicit disposition before any later release. Announced fixes not yet represented in a scanner database remain a separate gate even if a scan is green.

## Publication and run steps — approved subject to integration verification

These commands are a reviewable procedure, **not executed**. Use PowerShell in `C:/Users/joser/Desktop/Projects/Ornigami-coolify-prep-20261016`. Stop on any nonzero Git result. Do not force-push, merge, open a deployment PR or modify the candidate.

1. Review the candidate commit and this packet. Confirm the branch is clean, the remote points to the stated public repository, external deploy integrations are closed for this branch, and the base/advisory review is still current. Check that the marker is absent. Then publish the preparation branch with no request file:

   ```powershell
   git status --short
   git branch --show-current
   git remote get-url origin
   git show --stat 51673d76bd407f69fa1a437f1b52587f0a888cfa
   Test-Path .github/build-requests/ornigami.json # must be False
   git push --set-upstream origin HEAD:refs/heads/codex/ornigami-coolify-preparation-20261016
   ```

   This publishes Git source/workflow only. With no marker-path change, it does not start the image workflow. Confirm this before proceeding. No `gh workflow run` command or default-branch change is needed.

2. After approval to run, create and commit the sole request file, then push that commit to the same branch:

   ```powershell
   New-Item -ItemType Directory -Force .github/build-requests | Out-Null
   $ornigamiRequest = '{"sourceSha":"51673d76bd407f69fa1a437f1b52587f0a888cfa","packageLockSha256":"5eff2b421d8becc7d24b79b9af9265cb655014c56e36873c8400b2a2c1c5ed47"}'
   [IO.File]::WriteAllText((Join-Path (Get-Location) '.github/build-requests/ornigami.json'), $ornigamiRequest + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
   git add -- .github/build-requests/ornigami.json
   git diff --cached --name-only # must list only .github/build-requests/ornigami.json
   git diff --cached --check
   git commit -m "Request approved isolated Linux image rehearsal"
   git push origin HEAD:refs/heads/codex/ornigami-coolify-preparation-20261016
   git rev-parse HEAD # record this request SHA separately
   gh run list --repo joserubiobejarano/Ornigami --workflow ornigami-image-rehearsal.yml --branch codex/ornigami-coolify-preparation-20261016 --limit 5
   ```

3. Inspect the matching request SHA's run, step summaries and logs. A run starting or the image compiling is not acceptance. Record all phase/scan exits and resource evidence, including failures; do not retry or change resources automatically. Export the reviewed summaries and logs into the task evidence before GitHub retention expires. The summary records scan findings/identity/database metadata; raw JSON scan reports are temporary, with no report artifact upload configured. Do not include secrets or fabricate missing counters. Cleanup removes the temporary builder, app, cache volume and image.

4. **Stop after the build/validation trial.** Even a successful run leaves only an ephemeral tested image on a disposable runner; logs/IDs cannot be deployed. This workflow uploads no image archive, pushes no registry package and creates no pull identity. A later separately accepted GHCR publication procedure must retain a scanned origin-correct image by manifest digest, record visibility/pull access and establish reproducibility/identity with the accepted trial. Do not rebuild later and assume the new digest is the tested image: mutable package repositories and vulnerability databases can differ.

## Evidence and remaining gates

Local preparation checks passed on 16 October:

- YAML parsing, all ten workflow Bash blocks and runtime-helper Bash syntax; extracted runtime Node syntax.
- Exact branch/path trigger, empty token permissions, absent request marker and exact Vercel branch guard; unchanged lock checksum.
- The actual admission block against synthetic local Git repositories: valid marker-only request accepted; extra changed file, changed workflow blob, invalid/nonancestor source and incorrect lock rejected.
- Actual final scan parser fixtures: legitimate missing/null vulnerability lists accepted, medium findings recorded, high findings rejected with details, malformed vulnerability lists and mismatched image identity rejected.
- Builder counter parser fixtures: real multiline sections accepted; OOM, decreasing CPU counters, missing event counter and over-cap peak rejected. Runtime metric validation requires observed limits, nonzero peak, CPU accounting and zero OOM/OOM-kill counters.
- Independent review and `git diff --check` passed. These checks did not start Docker, GitHub Actions or a host build. No Linux run result is claimed.

Keep the original [failed 2 GiB build receipts](./HANDOFF.md) and [Windows comparison manifest](./LOCAL_PROFILE.json) unchanged.

Open after this preparation: approved Git publication/request; admitted Linux build and full HTTP/security/native/restart/cache receipts; base advisories and final scan; retained registry artifact and app-scoped pull identity; exact DNS/HTTPS origins and callback acceptance; app-scoped secret custody; bounded isolated Neon/config/media recovery rehearsal; independent scheduled copies, delivered alerts and replacement-host proof. Runtime smoke does not prove measured sustained native-memory headroom or production load safety. No production SQL/migrations, real-provider acceptance, review replies, mail sends or paid AI is authorized. Existing shared-host resource/network/volume and cutover/rollback contracts remain unchanged.
