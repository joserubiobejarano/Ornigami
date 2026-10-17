# Minimal glibc diagnostic Linux trial — 17 October 2026

**Exactly one authorized trial completed with failure before compilation. No retry is running or approved.** Candidate `5d1659d6fcce05be476d6bd8ab1932f9448db031` and request-only child `d2bbe3ad0a7eb1019e369d279dfbc1ea7430dfba` are published on `codex/ornigami-sri-local-prototype-f-20261016`. [Run 39027472379, attempt 1](https://github.com/joserubiobejarano/Ornigami/actions/runs/39027472379) failed original parent/tool scan collection and the independent all-stage gate. No BuildKit builder, app image, cold app installation or compilation occurred. Runtime/security/browser/restart/cache acceptance remains untested for this candidate. The one trial and one custody acknowledgment authorization are consumed.

All 43 historical Debian highs remain unresolved. This run produced **no vulnerability reports**, so new-image finding counts are **unknown**, not zero. No deployable image was created or retained. Framework production adoption, registry publication, VPS changes, deployments, cron/provider activation and live release remain closed. Existing integration holds and QR staging were preserved.

## Admission and exact publication

After the infrastructure owner restored the existing private tunnel, complete fresh admission passed. No tunnel startup or SSH/host command was performed by this session.

- Coolify owner dashboard: existing project `vqkyv5dpjpjazuknkgyunioi`, existing fictional-staging `d9ixeysd9tajcavvibltt3is`, **zero resources / No resources yet**. There is no app resource to attach an autodeploy watcher or active deployment operation. This was reloaded after candidate publication and after the trial; no shared infrastructure, project/resource or QR setting was changed.
- Vercel owner UI explicitly states Ornigami's existing `locallift` project **is not connected to a Git repository**. Fresh API inventory contains three projects and no other Ornigami Git connection. The project GET omits its optional `link` property; that omission was not silently equated to a null hold. The explicit owner UI establishes the disconnected state. BUILDING/QUEUED/INITIALIZING operations are empty with no further page. Latest and production remain `dpl_AXyNVgUpoPPhczSUjpxrURtp9JfE` before publication, after publication and after trial. The hold stays disconnected; restoration instructions in [FRAMEWORK_LINUX_TRIAL.md](./FRAMEWORK_LINUX_TRIAL.md) still require separate approval. No existing domain, deployment or runtime job was changed.
- Netlify sole known owner-team unfiltered inventory shows the four previously recorded sites. Every Developer settings Repository card reports **Current repository: Not linked**. The team Builds view has no build activity and was rechecked after publication and trial. No site configuration or unrelated project was changed.
- GitHub owner ADMIN/public repository verified; hooks `[]`; Pages 404. Repository UI lists only CodeRabbit, Netlify and Vercel. Fresh public CodeRabbit definition has no push subscription; its contents/workflows write permissions are retained in evidence rather than described as read-only. Exact-source CI/security exclude the restricted branch; image workflow requires a request-only push. Existing manual cron dispatch workflows were not invoked and the independent scheduled monitor only reads cron health. No queued, in-progress, waiting, pending or requested repository Actions run existed at admission.
- Billing owner UI: GitHub Free, **82 / 2,000 included minutes**, **0.1 / 0.5 GB included Actions storage**. Two existing repository artifacts total less than the helper's 256 MiB bound. Standard public `ubuntu-24.04` x64 is free; [GitHub's reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) lists 4 CPUs/16 GB RAM/14 GB SSD. Actual allocated-runner free space was still checked rather than inferred from historical runs. It passed with **91,896,475,648 bytes free**, 4 CPUs, total 15,988 MiB and available 14,533 MiB. No paid/larger runner or account/budget/storage change was used.

Preparation HEAD began clean at `9d54ecafa86443958c94eb568f7d02b7cc3aa8f7`; exact candidate worktree was clean. All 12 recorded source/package/patch/lock/workflow/policy identities matched committed bytes; both signed parent indexes and their amd64/config bindings were verified freshly before publication. The remote restricted branch was still at `496b57d147bc2a63182e3489583bb3532d28cfc2`. Normal fast-forward publication of the exact candidate changed no request marker; subsequent GitHub runs/checks/deployments for that candidate were all zero, Vercel was held/unchanged, Netlify showed no build activity and Coolify remained empty. Only then was the separate request-only child created, verified and normally pushed. Its sole parent is the candidate and its only changed path is `.github/build-requests/ornigami.json`. No force push, merge or application correction occurred during this trial.

| Identity | Exact value |
| --- | --- |
| Candidate | `5d1659d6fcce05be476d6bd8ab1932f9448db031` |
| Request-only commit | `d2bbe3ad0a7eb1019e369d279dfbc1ea7430dfba` |
| Canonical application lock SHA-256 | `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815` |
| Identical candidate/request workflow blob | `f29ae07e8f356aadbd236342e6029cc53191c509` |
| Workflow canonical SHA-256 | `569e69e546626efc56155ad2d371f921876082ea084baec37771e05ed4f45c3e` |
| Unchanged Next package SHA-256 | `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f` |
| Unchanged full framework patch SHA-256 | `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5` |
| Unchanged npm 11.21.1 archive SHA-256 | `dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b` |

Exact parent/index/config/Node binary identities remain in the [feasibility packet](./MINIMAL_GLIBC_FEASIBILITY.md) and [fresh source admission](./external-trial-39027472379/source-admission.json). Linux parent admission independently passed exact cosign publisher verification, Distroless signer verification and signed index/manifest/config/Node annotation binding. Downloaded host Node archive and Trivy archive checksums passed. Parent filesystem analysis checks the exact official Node ELF. **Actual application-container Node/OpenSSL/glibc/CPU and native loading probes did not run.** Node remains the reviewed 22.23.3/OpenSSL 3.5.8; no version change was introduced.

## Every trial phase

| Phase | Gate | Evidence / limitation |
| --- | --- | --- |
| Live holds/watchers/operations, included capacity and identities | **Passed** | Fresh owner UI/API/local receipts; no historical hold substituted for a live check. |
| Candidate publication / request-only admission | **Passed** | No unintended candidate run/deployment; exact source/lock and identical workflow admitted by Linux runner. Exactly one request run, attempt 1. |
| Linux pinned tooling / signed-parent provenance | **Passed** | Host Node/scanner archive checksums and actual cosign parent admission receipts retained. Not application runtime acceptance. |
| Bounded database download | **Passed command/resource gate** | Download command exit 0 under 2 GiB/1 CPU/zero swap; does not prove DB freshness/eligibility. |
| Parent/tool file/native inventories | **Passed for four roles** | Actual Linux Docker archive config/layer binding, full filesystem hashes and static ELF closure. No execution/loading proof; no normalized OS vulnerability package inventory. |
| Frozen database time admission | **Failed** | Every attempted scanner role rejected metadata before vulnerability analysis. Exact rejection branch cannot be established from retained metadata. |
| All-nine security/coverage acceptance | **Failed** | Four failed preflights; five skipped roles. No complete OS/language vulnerability JSON. Counts unknown; no suppression or threshold change. |
| Cold app installation, non-root/cache setup and production compilation | **Untested** | Builder creation/build skipped after parent scan collection failure. No successful compilation claim. |
| App native/codec/platform probes | **Untested** | No app container. Earlier static/Windows receipts retain their original scope. |
| HTTP/CSP/SRI and all nine browser corruption-rejection groups | **Untested** | Both runtime and framework fixture steps skipped. Security assertions were not removed. |
| Independent restart/recreation/cache persistence | **Untested** | No app image/container/cache volume. |
| Timestamped scan/inventory resource scopes | **Passed measured scope limits/OOM gates** | Nine receipts, 2 GiB/1 CPU/zero swap, zero memory.max/OOM/kill events. No whole-run or compiler headroom claim. |
| Natural failed-scan/skipped-runtime capture | **Passed collection/hash coverage** | Nonempty summary; exact source/lock; explicit nine-role statuses; scan error/stdout/resource receipts; skipped runtime snapshots marked unavailable. |
| Full security/forensic evidence completeness | **Failed** | Vulnerability reports absent and rejected DB metadata/hash/clock not saved. A successful capture step is not full validation completeness. |
| Deliberate HTTP/build-failure/skipped fixtures | **Untested** | Fixture execution skipped. Natural early failure tests collection, not all forced-failure scenarios. |
| Durable owner custody | **Passed independently** | One exact artifact, digest, durable save/read-back and one owner status before cleanup. Does not attest completeness/security. |
| Finished logs/summary recovery and cleanup | **Passed recovery; qualified cleanup proof** | Logs ZIP/text and completed rendered summary recovered. Four claimed image-reference removals exit 0; no final exhaustive resource inventory or disk measurement after those final removals. |
| Final holds / no deployment | **Passed** | Still empty Coolify; disconnected Vercel owner UI/zero active API operations/unchanged production; Netlify no build activity. No request GitHub deployment. QR untouched. |

## Failure, inventory and advisory disposition

The exact retained scanner error is:

```text
Database metadata missing, future-dated or expired; prepare a fresh frozen database first
```

The source parses `db/metadata.json`, then requires `UpdatedAt <= Date.now()` and `NextUpdate > Date.now()`. The guard failed before creating the per-stage scan output directory or saving DB metadata/hash. Consequently the driver also records `ENOENT ... scan/index.json`. The latter is secondary, not the underlying reason. We cannot prove which timestamp/field comparison failed, whether the downloaded DB was stale/future-dated, or whether an adapter/schema/clock issue exists: **the rejected payload and exact scanner clock were not retained**. No further download, scanner run, clock adjustment, fallback database or relaxed freshness check was attempted.

The driver continued the other three distinct planned parent/tool roles after the first shared-DB guard rejection. These were separate required roles, not retries, but global fail-fast behavior is insufficient for a shared prerequisite failure and should be repaired before another trial. The run then stopped before builder creation, compilation or provider-capable app work. No cache export or raw BuildKit progress protocol was exercised.

| Role | Actual filesystem/native inventory | Vulnerability scan |
| --- | --- | --- |
| original-base: debug tooling parent | Passed; 2,142 file entries / 285 native paths | Failed DB preflight; no finding counts |
| original-runtime-base | Passed; 1,759 entries / 284 native paths | Failed DB preflight; no finding counts |
| BuildKit tool image | Passed; 1,134 entries / 291 native paths | Failed DB preflight; no finding counts |
| Dockerfile frontend | Passed; two entries / one native path; no OS DB by design | Failed DB preflight; Go vulnerability coverage untested |
| build-base, deps, builder, prod-deps, runner | Skipped | Untested |

Native paths count aliases as filesystem entries; they are not unique binary counts. These four parent/tool images have no npm package manifests, hence `packages: 0` in the native analyzer means zero such manifests, **not zero OS packages or vulnerabilities**. OS database presence is recorded for both parents and BuildKit, but the failed Trivy step produced no normalized OS/language package/version vulnerability inventory. The complete filesystem/hash/ELF receipts and failed preflight logs remain retained.

The previous candidate's **0 critical/54 high original base** and **0 critical/43 high final image** remain failed historical gates, distinct from this unscanned minimal candidate. The 43 Debian rows are util-linux 36, acl one, systemd two, ncurses three and perl one. Their installed/fixed-reference versions and compatible-vendor-update limitations remain in [LOCAL_SECURITY_REMEDIATION.md](./LOCAL_SECURITY_REMEDIATION.md) and the original advisory inventory; no new compatible fixes were established here. Earlier 4-critical/71-high findings also remain in their original historical evidence. No advisory was suppressed or marked resolved by signatures, package absence assumptions, static closure or missing reports.

## Resources, retention and cleanup

The approved BuildKit budget remains 8 GiB/3 CPU/zero swap, Node heap 4 GiB, serial worker, source maps retained. Builder creation was skipped, so there is **no new compiler/BuildKit peak** and no new evidence resolving the older exact 8 GiB peak/three limit events. Runtime 768 MiB/0.75 CPU/approximately 512 MiB heap remains untested here. No resource limit was increased.

| Executed scope | Peak bytes | Exit / limits |
| --- | ---: | --- |
| Database download | **1,996,271,616** | exit 0; 2 GiB/1 CPU/zero swap |
| Tooling-parent filesystem | 483,221,504 | exit 0; same limits |
| Runtime-parent filesystem | 486,637,568 | exit 0; same limits |
| BuildKit filesystem | 625,180,672 | exit 0; same limits |
| Frontend filesystem | 107,483,136 | exit 0; same limits |
| Four scanner preflights | 44,740,608–46,030,848 | each exit 1; resource limit/OOM gates passed separately |

All nine timestamped scopes report zero memory.max, OOM and OOM-kill events. These are individual scope peaks, not a global/whole-job peak. The DB peak is about 1.86 GiB under a 2 GiB cap; no adequate scan/build headroom conclusion follows. Full before/after CPU/stat/pressure/PID counters are retained in the artifact. All phases were serial.

Allocated-runner initial free disk: **91,896,475,648 bytes**. Pre-upload free disk: **89,066,897,408 bytes**. Finished-summary before/after main cleanup snapshots: **89,066,754,048 bytes**, approximately 2.83 GB lower than initial; these are checkpoints, not a disk high-water measurement. Source footprint 56,843,481 bytes; DB cache 1,628,446,873 bytes. The summary's "after cleanup" disk sample precedes the driver removing four claimed images, so it cannot prove final reclaimed bytes. Finished logs confirm exactly those four image-reference removals with exit 0; no unowned image prune or shared-host cleanup occurred. No BuildKit container/state volume or app image existed.

Artifact **12098614820**, **260,837 bytes**, ZIP SHA-256 **`8ecc367200984d4719cf8231fb7858a8701de495b5be88d6ed0c205bebf84881`**. Helper verified run/request/attempt/artifact identity, fsynced the exact bytes and receipt and verified read-back at **11:08:23 UTC**. Exactly one owner-authenticated status followed; runner accepted it at **11:08:26 UTC**, before cleanup completed at **11:08:27 UTC**. The [original ZIP](./external-trial-39027472379/original-artifact.zip), [download receipt](./external-trial-39027472379/DOWNLOAD_RECEIPT.json) and [owner status](./external-trial-39027472379/STATUS_ACK.json) are retained. No second acknowledgment was posted.

All **82 manifest-listed files** match exact bytes/digests; extracted artifact has 83 files including its unchanged manifest. Nonempty summary and natural failed/skipped phase receipts are present. [Completeness assessment](./external-trial-39027472379/COMPLETENESS.json) explicitly fails complete security/forensic proof separately from passed hash coverage/capture/custody. Finished [logs](./external-trial-39027472379/run.log), [rendered summary](./external-trial-39027472379/finished-summary-ax.txt), [results](./external-trial-39027472379/RESULTS.json) and [local checksums](./external-trial-39027472379/SHA256SUMS.json) are retained before expiry. Original raw finished-log ZIP is durably preserved under ignored `.local/minimal-glibc-live-5d1659-20261017/`, with its checksum in the log provenance receipt. **486 prior evidence files were reverified unchanged**, including the previous incomplete artifacts and supplemental recovery. Nothing retroactively repairs those earlier completeness failures.

## Next decision; no further execution approved

Recommend a separate bounded local repair scope: retain DB metadata, DB content identity and actual scanner clock before rejecting; emit an explicit failure index even when shared DB admission fails; identify missing/invalid/future/expired fields without weakening any freshness/security threshold; fail the whole serial plan on shared prerequisite/protocol failure; and add focused successful/failed/skipped retention regressions, including real Trivy metadata schema fixtures. Preserve all original evidence. Do not implement a repair or fetch a replacement DB under this consumed trial authorization. A subsequent exact candidate and any Linux run need separate review/approval; no automatic retry, package fallback, paid runner or limit increase is included.

The remaining cold Linux installation, app native/codec/loading, cached exports, complete nine-role inventories/scans, HTTP/CSP/SRI, browser corruption rejection, restart/recreation/cache, intentional failure fixtures and build/runtime resource measurements remain necessary. Maintainer/backup/security-review ownership and framework adoption remain unresolved. Exact staging HTTPS origin/callbacks, bounded dedicated Neon identity, secrets, independently scheduled Neon/config/media copies, alert delivery, key custody and replacement-host restore proof remain open. ornigami.com is not DNS/routing/provider authorization; host backups cover only the Coolify control plane. There is no retained accepted image or release approval.
