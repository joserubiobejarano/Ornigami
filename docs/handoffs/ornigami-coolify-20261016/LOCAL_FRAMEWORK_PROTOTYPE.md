# Local framework prototype — local result and Linux follow-up

Latest follow-up: the owner-approved [single Linux trial](./FRAMEWORK_LINUX_TRIAL.md) of exact candidate `fe71816993f5eb42d0565befb4354d478e48429a` **failed**. Compilation/TypeScript passed, but generated Windows external-module specifiers failed Linux page collection. No image exists. Fresh base scan: 0 critical/54 high, threshold failed. Linux runtime/browser/restart/cache and final-image scanning remain untested. The exact partial artifact was downloaded and owner-acknowledged before cleanup; evidence-capture failure and recovered logs are documented. Vercel is held by app-specific Git disconnection. One trial/acknowledgment approval is consumed; no retry or production adoption is authorized.

## Historical local checkpoint

The bounded Windows experiment passed its focused checks. **This is not production adoption, Linux/image acceptance or an accepted maintenance SLA.** All work is local. No external runner, publication, live integration change, VPS operation, deployment, provider send or agent delegation occurred.

## Exact review identities

| Item | Identity |
| --- | --- |
| Tested application candidate | `fe71816993f5eb42d0565befb4354d478e48429a` |
| Isolated application branch | `codex/ornigami-sri-local-prototype-f-20261016` |
| Framework implementation commit | `f9f43a700228a014569fd5827ede82b76c713e66` |
| Official Next source | `2864b1772c37242a9b40ab4d366eb7d368c2a070` (`v16.4.2`) |
| Complete source patch SHA-256 | `41708142d05f1d6ff1383b090a48c72fce09b69e25a44cd1586b39fa55580db6` |
| Modified package SHA-256 | `3ebe019c4b83a48469956f0ca255f03be22272599127c86d87e1e2daa3519a81` |
| Canonical candidate application lock SHA-256 | `8a4b5a645fc660814914aced2dd86b283f7efb5da235de4d9ac8df69f42ed898` |
| Canonical fixture lock SHA-256 | `80112b403b80edf8052a7bf22dd40501dbfa59ac89127231b3d10a6be133b1f5` |
| Upstream frozen dependency lock SHA-256 | `69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6` |
| Browser tool lock SHA-256 | `f0e06f4053177dddd5c287f28a506d98d50af0625bf36e7c08b7420065534ee5` |

[IDENTITIES.json](./framework-prototype-evidence/IDENTITIES.json) also records SHA-512 package integrity and Git blob identities for the package, patch, lock and proposed workflow. The original preparation branch keeps its application dependency/lock unchanged; the separate experimental branch consumes and locally commits the 44,857,165-byte tarball in `vendor/framework/`. Both Docker install stages copy it before `npm ci`. No registry is used. The package's internal version remains Next 16.4.2; its explicit experimental provenance/digest identifies modified bytes. Upstream signatures authenticate the original package, not ours.

## Repairs and packaging proof

The source patch repairs server layer/boundary/bootstrap/polyfill emitters and missing-manifest handling on the actual route-module path. It passes manifest integrity into the four tracked, readable Next-vendored RSC production preinit emitters. All four actual production App Router bundles are rebuilt. It repairs asynchronous webpack loading before insertion, including nonce/crossorigin propagation and strict digest-length validation. CSS-only chunks are excluded from the JavaScript hash table using webpack's module source types; unresolved JavaScript placeholders still fail the build. No HTML response rewrite, startup patch, ignored installation edit, assertion removal or advisory suppression substitutes for these changes.

Builds F and G started from separate generated package directories, reseeded generated `dist` from the verified official tarball and rebuilt source targets serially. They produced **identical complete archive bytes**, 8,695 payload files and 2,745 source maps. Deterministic archive order/modes/ownership/epoch and gzip level 6 are pinned. [Final reproduction receipt](./framework-prototype-evidence/REPRODUCIBILITY_FINAL.json) and [per-file manifest](./framework-prototype-evidence/payload-manifest-f.json) retain the comparison.

This proves same-environment reproduction on Node 22.23.3 Windows x64 / pnpm 10.33.0 / Python 3.14.6. Modified source files are normalized to LF; the observed upstream checkout uses `core.autocrlf=true`. Independent-machine/Linux framework-package reproduction is **untested**. The builder deliberately reuses unchanged official assets/types and official native dependencies; it does not independently rebuild all upstream dependencies, vendored React, native binaries, development bundles or declarations. Complete framework type/lint suites and a full component SBOM remain adoption work. The actual application TypeScript build passed.

## Regression and resource results

| Gate | Result |
| --- | --- |
| Cold package install | **Passed.** Fresh fixture `npm ci` from the pinned archive/lock; fresh actual app installation added 655 packages. No installed dependency was patched afterward. |
| Actual Ornigami fresh build | **Passed** at the exact candidate above, 73.930 seconds including static CSP generation; 142 application source maps and two static CSP hashes with byte parity. |
| Actual home/login HTTP/security | **Passed.** Unchanged checker, 31 protected script-tag occurrences, zero missing/invalid digests and zero external script sources. Required headers, inline nonces and nonce rotation passed. [Raw receipt](./framework-prototype-evidence/ornigami-app-final.json). |
| Fictional framework production/browser suite | **Passed: nine groups.** Normal/error/loading/not-found/global-error routes; valid hydration, late chunk loading and navigation; corrupted bootstrap and late scripts rejected without executing markers; missing/malformed server entries; missing and malformed browser hashes rejected before a late-script request; independent process restart/cache marker; missing entire manifest returns HTTP 500. |
| Standalone browser-tool cold install | **Passed.** Exact Playwright 1.61.0 lock installed separately, then all nine groups passed again using that toolset. No browser download or external page traffic. |
| Diagnostic retention | **Passed for these tests.** Failed and successful assertions/status/relevant headers/bounded fictional bodies/server logs/exit codes are retained before cleanup. Original Linux harness and independent restart/cache checks remain unchanged. |
| External evidence-custody guard | **Six local tests passed using fake APIs only.** Durable local bytes/receipt precede an acknowledgment; wrong owner/source/run, corrupt bytes and missing approval never post. No real status was posted. Live handshake remains untested. |
| Real container restart/recreation/cache ownership/reuse | **Untested.** A local process restart and a cache marker are not container-volume or actual cache-reuse proof. |
| Linux image/native/resource/security checks | **Untested for this candidate.** Proposed trial below; not approved or run. |

Local builds/install/tests were serial under Windows Job Objects. Initial frozen upstream installation used an 8 GiB limit (peak 1,074,495,488 bytes); subsequent work used **6 GiB committed memory / three CPU equivalents / 4096 MiB Node heap / 20 minutes**, admission requiring a 3 GiB free-memory reserve and 40 GiB free disk, with stops below 3 GiB available RAM or above 20 GiB observed volume growth.

Final package F: 139.267 seconds, peak 814,125,056 committed bytes. Reproduction G: 133.962 seconds, peak 805,179,392 bytes. Actual app build plus HTTP checker: 82.482 seconds overall, peak **4,001,763,328 committed bytes**, minimum system free memory 8,200,175,616 bytes, observed system disk growth peak 1,129,869,312 bytes. These are Windows process-tree committed-memory/volume observations, not Linux native RSS or app-only disk allocation. Linux cgroup OOM counters are unavailable here; no zero-Linux-OOM claim is made. Per-phase receipts and the separate logical disk inventory are retained.

## Preserved failures and unresolved adoption gates

Historical Contabo and both external failures remain untouched. New local failures are also retained: initial builder entrypoint failure; package A's incomplete patch metadata after the failed Windows checkout, plus missing RSC SRI/nonce and harness cleanup failures; package B's crossorigin assertion failure; and package C's actual-app unresolved CSS-only placeholder failure at source `fc34ec15c25b4787480ec4a2ddbeef5a1b8371bd`. C/D had reproducible archives and passing small fixtures but **failed actual application acceptance**. F/G supersede them. Package E is an intermediate build, not an accepted candidate. No repeated build was run merely to rediscover the original 21 missing attributes.

Primary maintainer, backup and security-review ownership remain **unassigned**. This experiment creates no SLA. Adoption needs accepted owners for Next and vendored RSC changes, upstream rebase/advisory response, full framework verification, package provenance/SBOM review and a retirement plan when a supported official package passes the same tests.

Historical image findings remain **4 critical / 71 high**. Confirmed current-image remediations: **none**. Trixie and package-manager removal remain unverified. [Affected packages/fixed versions/remediation options](./CANDIDATE_REPAIR.md), [applicability and unresolved findings](./SRI_FRAMEWORK_REVIEW.md) and the original 75-row scan stay visible. No threshold or suppression changed. No accepted retained deployable image exists; a locally retained framework tarball is not a Linux app image.

Staging origin/callback/DNS acceptance, isolated Neon identity/limits/secrets, actual-host proxy negatives, independent backups, key custody, delivered alerts and replacement-host recovery remain open. Existing project/environment IDs and the 768 MiB / 0.75 CPU runtime proposal remain unchanged. Domain `ornigami.com` does not authorize a staging hostname or DNS action. Cron, Replies/provider/paid AI, Contabo and public release remain closed.

## Exact proposed external trial — separate approval required

Candidate `fe71816993f5eb42d0565befb4354d478e48429a` contains the runnable build-only workflow `.github/workflows/ornigami-image-rehearsal.yml`, restricted to **`codex/ornigami-sri-local-prototype-f-20261016`**. Its workflow blob is `4938e0fe6cfd93c491ab1691eb02c89555d48fa2`. The request file is absent. Initial branch-creation events are gated off, and duplicate quality/security push builds exclude this exact experimental branch. These local rules do not prove any live deployment hold.

Proposed sequence after explicit publication/trial approval:

1. Freshly verify effective Vercel, Netlify, GitHub Apps/workflows and Coolify autodeploy protections. The last live Vercel observation has Git deployment creation **enabled**, no verified branch hold; Netlify requires a fresh check. Stop if any integration cannot be checked. No live setting change is authorized here.
2. Publish exactly the candidate to the experimental branch **without** a request file. Confirm no build or deployment began. No merge/default-branch registration is needed.
3. Add one separate request-only commit with exactly this content; verify it has the candidate as ancestor, the workflow blobs match, the canonical committed lock checksum matches, and only this path changes:

```json
{"packageLockSha256":"8a4b5a645fc660814914aced2dd86b283f7efb5da235de4d9ac8df69f42ed898","sourceSha":"fe71816993f5eb42d0565befb4354d478e48429a"}
```

The path is `.github/build-requests/ornigami.json`. Push that single request commit for **one** public standard `ubuntu-24.04` Linux amd64 trial. No automatic retry, paid runner, resource increase or fallback. The runner preflight and serial BuildKit limits remain 8 GiB / three CPUs / 4096 MiB heap / zero swap, maps retained. Runtime checks remain 768 MiB / 0.75 CPU / 512 MiB Node heap, non-root/read-only, disconnected, internal port only.

The workflow retains complete base/final Trivy findings and unchanged zero critical/high gates; actual image HTTP/security/native checks and independent restart/recreation/cache checks; build/runtime cgroup peaks, OOM counters and disk use. It adds an independent Linux fixture/browser phase after the image runtime phase, using the exact committed package and tool locks, checksum-pinned Linux Node 22.23.3 and an already installed browser. A transient scope **on the disposable GitHub VM only** caps that phase at 8 GiB / three CPUs / zero swap. Missing Chrome/cgroup support fails; no paid/download fallback. Browser failure does not suppress final scans or evidence capture. The Linux adapter/workflow were YAML/shell syntax checked locally; their Linux execution is **untested**.

Use the already built, pinned JavaScript framework package for this image trial; do not silently rebuild/relabel a different Linux package against the pinned lock. This tests Linux portability, not cross-platform package-byte reproduction. Included public-runner capacity only; verify included artifact quota before approval, no paid capacity/storage fallback.

The workflow captures/uploads evidence with 30-day retention, then waits up to ten minutes **before cleanup acceptance** for an owner-authenticated local-custody receipt. The job token has only `statuses: read`; it cannot acknowledge itself. The local helper checks owner/run/attempt/request/artifact identity, verifies the uploaded zip digest, writes and fsyncs a new local copy/receipt and checks read-back before posting one exact commit status. Only the repository owner can satisfy the bound context and artifact digest. Wrong/missing acknowledgment fails the trial; timeout permits failure cleanup and makes no retention/acceptance success claim. Existing scanner/runtime failures remain failed even when custody is acknowledged. This is a proposed protocol, not a performed GitHub write or proof of live behavior.

Future approval must explicitly include **one owner-authenticated receipt status on the request commit after verified download**, alongside branch publication and one trial. Preflight owner CLI artifact-read/status-write access and active local monitoring before starting; do not regenerate shared credentials. After upload, obtain the run/attempt/request/artifact ID and expected zip SHA-256 from the action output, then run with the verified local Node executable:

```text
node scripts/framework-prototype/retain-external-evidence.mjs RUN_ID ATTEMPT REQUEST_SHA ARTIFACT_ID ZIP_SHA256 NEW_LOCAL_OUTPUT_DIRECTORY --acknowledge
```

The status context is `ornigami/evidence-local/RUN_ID/ATTEMPT`; its description binds the artifact ID and uploaded zip hash. It is solely a custody receipt, not deployment/provider/advisory acceptance. No such command was run against GitHub here; all six guard tests injected fake APIs. Image cleanup is intentional: even a successful ephemeral trial yields **no retained deployable image**. GHCR/other retained image publication, deployment, DNS, providers and release need separate decisions.

## Historical first implementation checkpoint (superseded)

Approved local scope starts from `3f3433e49f9fcc41fa5bc0adb96a93d30794016d`. Production adoption, primary/backup/security ownership and any ongoing SLA remain **unaccepted**. No push, runner, registry, live integration, host or provider operation is authorized or performed.

The isolated package repairs source server layer/boundary emitters and bootstrap/polyfill validation; rebuilds all four actual production App Router bundles; and adds a fail-closed asynchronous webpack loader with integrity/nonce/crossorigin set before insertion. The experiment exposed an additional production emitter: Next-vendored RSC client preinit calls hard-code undefined integrity. Four readable tracked production emitter files now consume a request-independent integrity callback supplied through the route module's loaded client manifest. Missing entire manifests are checked on the actual route-module path, not only the legacy component loader. No HTML rewrite or installed `node_modules` patch is used.

The incremental builder seeds unchanged assets and types from the verified official package, builds server/build TypeScript and production renderer bundles serially, and packages maps/licenses with explicit provenance. It does not claim a complete rebuild of upstream, vendored React, native binaries, dev bundles or public declarations. Prototype source/recipe: [scripts/framework-prototype](../../../scripts/framework-prototype/README.md).

Complete source patch SHA-256: `529b9afde81c9881d7e012f67c9be1eda31ed07a7d1eb3f6ad8110063b2793b7`. Exact official Next source commit: `2864b1772c37242a9b40ab4d366eb7d368c2a070`; upstream frozen lock SHA-256: `69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6`. Node 22.23.3 Windows x64, pnpm 10.33.0, Python 3.14.6. The verified official tarball and signing/checksum receipts remain in the earlier decision packet.

Package C SHA-256: `8f300215eada8b60097638715c31c4f0272263a9bf71f409534de854833cac58`, 44,319,908 bytes. Internal Next version remains 16.4.2; `ornigami-sri.1-experiment` and the digest distinguish modified bytes. It is not an official signed Next release. Archive is retained only in ignored local prototype storage; it is not a retained deployable Linux image.

Package C cold-installed from a frozen fixture lock and compiled with source maps. All eight fictional fixture groups passed: production HTTP/CSP/SRI across normal/error/loading/not-found/global-error routes; browser hydration/late loading/navigation; actual browser rejection and nonexecution of separately corrupted bootstrap and late scripts; missing/malformed server entries; missing browser hash rejected before network loading; independent process restart/cache marker; and missing entire production manifest returning HTTP 500. Browser contexts are new and page traffic is restricted to loopback. Exact assertions/status/body/headers/logs survive cleanup in [evidence](./framework-prototype-evidence/INDEX.json).

Package C built in 137.909 seconds, peak committed process-tree memory 838,897,664 bytes. Local bounds are 6 GiB committed memory, three CPU equivalents, 4096 MiB Node heap, 20 minutes, with a 3 GiB system-memory reserve and 20 GiB observed disk-growth stop. Initial frozen installation used the earlier 8 GiB cap, peak 1,074,495,488 bytes. Windows job memory is committed memory, not Linux native RSS; Linux cgroup OOM counters are unavailable. Supervisor receipts must not be relabeled zero-OOM Linux results.

Earlier local attempts remain visible: first builder entrypoint failure; package A's incomplete patch metadata after a failed Windows checkout, plus missing RSC tags/nonce and harness cleanup failure; package B's explicit-crossorigin assertion failure. A is superseded and B failed acceptance. Repairs kept assertions intact. Package C's full patch applies to the exact upstream tree in an independent temporary Git index.

At this implementation checkpoint, a second package build and the actual Ornigami cold application build/security checks are pending. The final result will append their identities and evidence; passing fixture groups alone are not application/image acceptance. Full upstream type/lint suites, independent-machine/Linux reproducibility, native image checks, actual container restart/recreation/volume ownership/cache reuse and the earlier failed Linux security checks remain untested.

Historical image scans still report **4 critical / 71 high** findings; Trixie and package-manager removal remain unverified, with no confirmed image remediation or accepted retained image. No suppression or threshold change. Maintenance owners, advisory triage/rebase capacity and adoption remain open. Live Vercel branch hold remains unverified; publication is closed. Staging origin/callback/DNS acceptance, Neon identity/bounds/secrets, independent backups/key custody/alerts and replacement-host proof remain open. All cron/provider/release gates stay closed.
