# Repaired external trial — finished, acceptance failed

The separately authorized trial built the exact Linux amd64 candidate successfully, but **the image is not accepted for deployment**. Base and final scans each report 4 critical and 71 high findings. The cold HTTP/security block failed without retained assertion diagnostics; restart/cache persistence was not reached. Stop after this trial: no rerun, larger limit, paid fallback, GHCR publication, deployment or provider/cron activation is authorized.

## Identity and publication protections

Branch: `codex/ornigami-coolify-preparation-20261016`. Correction/evidence publication: `58492698a3b5caf6ca6e76368d85cb7fd1ea9e25`; its request file was unchanged. After checking that publication started no build or deployment, the separate request-only commit was pushed: `18298cf019800f55a921186ae88d465150a69e7b`.

Candidate: `a0f319c39a3bbc315e8e2a0d8ca4f854c7438838`. Canonical committed lock SHA-256: `b7335ef2e1163bf36afcf48309c3eaab68ea4731909a6bc4c981b0a0ea048ed1`. Candidate/request workflow blobs match: `6447501d8e4fa4c7d16aef94fa99be4098af7445`. Source admission verified detached checkout and committed lock bytes. The branch-restricted push/request trigger avoids the default-branch `workflow_dispatch` requirement.

[Run 38938062184](https://github.com/joserubiobejarano/Ornigami/actions/runs/38938062184), attempt 1, job `117098439630`, ran 17:13:44–17:18:19 UTC on 16 October 2026. Exactly one new trial ran under this authorization. The [original admission failure](./EXTERNAL_TRIAL.md) and its receipts are preserved unchanged.

Before both pushes, authenticated checks reconfirmed: no repository webhooks; installed GitHub Apps were CodeRabbit, Netlify and Vercel; the four projects in the owner's sole Netlify team had no linked repository; Vercel's linked `locallift` project used production branch `main`, and the candidate explicitly disables this preparation branch in `vercel.json`; Coolify's existing Ornigami staging environment had zero resources. No integration was knowingly left unchecked. Post-correction checks found no new Actions run or deployment. Post-trial checks found only the two separately authorized runs (each attempt 1), zero GitHub deployments for the request SHA, no preparation-branch Vercel deployment among the latest 20, and still zero Coolify resources. See [integration preflight](./INTEGRATION_PREFLIGHT.md) and the retained post-trial receipts below. Only the existing private dashboard SSH forwarding connection was used; no Contabo build or remote host command was performed in this trial.

## Gate results

| Gate | Result and evidence limit |
| --- | --- |
| Integration protections, request/source/workflow/lock admission | **Passed** |
| Runner preflight and pinned scanner verification | **Passed**; Trivy 0.76.0 |
| Bounded Linux amd64 image build | **Passed**, exit 0, 180 seconds |
| Build cap and zero OOM counters | **Passed**, measurements below |
| Base and final scan execution/identity/schema checks | **Passed** |
| Base and final vulnerability acceptance | **Failed**, each 4 critical / 71 high; no threshold weakened |
| Startup and initial container isolation | **Passed**: robots health probe, UID 1000, read-only root rejection, writable `/tmp`, no network/ports, dropped capabilities, no-new-privileges, bounded memory/CPU/PIDs |
| Cold HTTP/security block | **Failed**, exit 1; exact assertion unknown |
| Individual HTTP, CSP/SRI, static manifest, hostile forwarding, auth/cron negative checks | **Untested for acceptance**: block attempted but individual results were not retained |
| Native image optimization, restart/recreate/cache persistence | **Untested**, not reached |
| Cleanup commands | **Passed**; final absence of disposable resources **untested**, no independent inventory |
| Diagnostic retention | **Failed** for cold HTTP output and original scanner JSON; available receipts downloaded |
| Retained deployable image / registry manifest digest | **Untested**, publication not authorized |
| Public HTTPS/Traefik, real sessions/callbacks, Neon/schema/restore, provider acceptance, natural cron and alert delivery | **Untested**, gates remain closed |

The runtime script redirects the initial Node HTTP block into temporary `http-cold.txt`. Its failure exits under `set -e` before printing that file, and the workflow collector did not export it. The original assertion cannot now be recovered from downloaded logs. This is a diagnostic gap, not evidence that a particular header or route was responsible. A future proposed correction should retain each stage's stdout/stderr and exit status on every exit before cleanup, plus original Trivy JSON/SBOM; it has not been implemented or retried under this authorization.

## Build, image and resource receipts

Build interval: 17:14:15–17:17:15 UTC. BuildKit memory cap `8589934592`, swap cap `0`, CPU quota `300000 100000`, worker parallelism 1; Node heap 4096 MiB, source maps retained. Runner preflight observed 4 CPUs, 15,989 MiB total / 15,041 MiB available RAM and 92,103,778,304 free disk bytes.

Peak BuildKit cgroup memory was **8,130,437,120 bytes (7.572 GiB)**, leaving approximately **438 MiB (5.35%)** below the 8 GiB cap. All memory-event counters, including `max`, `oom` and `oom_kill`, were zero. Resource acceptance CPU usage delta was 249,571,594 microseconds; quota throttling was recorded. This whole-builder peak includes native processes, cache and image export; it is neither V8 heap use nor a measured minimum memory requirement. One successful sample with this headroom does not justify moving builds back onto the shared host.

The short runtime sample at 768 MiB / 0.75 CPU, heap 512 MiB, zero extra swap, PID limit 128 peaked at **176,586,752 bytes (168.4 MiB)**; all memory-event counters were zero and `OOMKilled=false`. The app was still running when sampled. This startup/probe sample does not establish native memory under realistic traffic or complete runtime acceptance.

Image config ID: `sha256:d24ed046ead4ed183456f4535172a338255d4b8345688d96d6b602e3188a69d3`; Linux amd64, revision label points to the exact candidate, fictional build origin `https://rehearsal.invalid`. Image size: 1,905,623,097 bytes. Transient saved archive: 1,942,539,264 bytes, SHA-256 `e1e00d48b37971f38c1cf26c42fec5171af37555315fb2c32de6f6bd37cb4fd2`; layer-list SHA-256 `90a614c3190a9219e3f1432d567888ad3f83310b57cae6caeae89a5d0f23066d`. These are receipts for an **ephemeral successful build**, not a retained deployable image or registry manifest digest. The archive was not downloaded or published to GHCR.

Filesystem capacity was 154,894,188,544 bytes. Before cleanup: used 74,519,425,024, free 80,357,986,304; after cleanup: used 65,130,528,768, free 89,746,882,560. These snapshots are not disk peaks. Docker's pre-cleanup table reported images 4.024 GB, a BuildKit volume 5.218 GB and zero separate build-cache entries. Trivy cache occupied 1,630,544,024 bytes. Raw measurements and complete layer identities are retained in the summary/derived JSON.

## Advisory findings and remediation options

The base and final scans have identical high/critical rows: **75 package/advisory rows each**, not 75 unique CVEs. Each also reports 102 medium, 84 low and 1 unknown. Of the 75 rows, 58 have no fixed version listed in this database. The database was updated 16 October 01:13:54 UTC and downloaded at 17:14:03 UTC. The older Docker Hub snapshot of 4 critical / 22 high is historical and does not supersede this scan.

All CVEs, installed versions, fixed-version fields and advisory links are preserved in [the 75-row CSV](./external-trial-38938062184/final-high-critical.csv) and [derived JSON](./external-trial-38938062184/advisory-findings.json). Empty fixed-version fields remain empty; no findings were ignored or suppressed.

| Affected package(s), installed version | Severity / rows | Fixed versions listed; remediation option |
| --- | --- | --- |
| `perl-base` 5.36.0-7+deb12u3 | Critical 3, high 5 | Critical CVEs 2026-13221, 2026-42496, 2026-8376 and four high rows list 5.36.0-7+deb12u4; high CVE-2026-9538 lists none. Review patched pinned OS/base candidate and rescan. |
| `zlib1g` 1:1.2.13.dfsg-1 | Critical 1 | CVE-2023-45853, none listed; applicability needs explicit component review, remains failing here. |
| `brace-expansion` 2.0.2 | High 5 | Latest listed 2.x fix across these rows: 2.1.6; other branch fixes remain in CSV. Upgrade compatible parent/toolchain, verify all five rows disappear. |
| `bsdutils` 1:2.38.1-5+deb12u3; `libblkid1`, `libmount1`, `libsmartcols1`, `libuuid1`, `mount`, `util-linux`, `util-linux-extra` 2.38.1-5+deb12u3 | High 48 | None listed for six CVEs per package; evaluate patched compatible base or upstream fixes. |
| `gzip` 1.12-1 | High 1 | None listed |
| `http-cache-semantics` 4.2.0 | High 1 | None listed; upstream dispute does not clear acceptance. |
| `ip-address` 10.1.0 | High 1 | 10.3.1 |
| `libacl1` 2.3.1-3 | High 1 | None listed |
| `libsystemd0`, `libudev1` 252.39-1~deb12u2 | High 2 | None listed |
| `libtinfo6`, `ncurses-base`, `ncurses-bin` 6.4-4 | High 3 | None listed |
| `pacote` 19.0.2 and 20.0.1 | High 2 | 21.5.1; parent/toolchain compatibility review required |
| `picomatch` 4.0.3 | High 1 | 4.0.4 (also lists 3.0.2 and 2.3.2) |
| `sigstore` 3.1.0 | High 1 | 4.1.1; major-version compatibility review required |

Debian confirms Perl's bookworm security fix at `5.36.0-7+deb12u4` for the three critical findings: [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221), [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496), [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376). The last concerns 32-bit Perl; this image's architecture alone is not a recorded Perl applicability assessment. For zlib, [Debian's tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853) distinguishes vulnerable minizip code from bookworm's zlib binaries. That nuance is retained for review without suppressing the scanner finding or clearing the gate.

The [GitHub advisory for http-cache-semantics](https://github.com/advisories/ghsa-ch52-4w7c-c8xp) lists no patched version; an [upstream dispute](https://github.com/github/advisory-database/issues/10139) remains a review input, not an exemption. “None listed” means the captured database supplies no fix, not that a fix can never exist.

Identical base/final JavaScript rows suggest inherited package-manager dependencies, but exact file paths were not retained, so attribution remains an inference. A future candidate should inspect full scanner targets/SBOM, upgrade compatible parent tooling, or remove unused npm/Yarn from the final runtime following [official Node image guidance](https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md). Application lock overrides alone cannot be assumed to fix base-image copies. Revalidate pinned Node/base support and the [announced October Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) before another candidate. Inspect unnecessary exported build/cache artifacts to reduce the 1.9 GB image while retaining source maps, generated static assets and runtime libraries. No such code/base change was made in this trial.

## Evidence custody and remaining release dependencies

[Evidence manifest](./external-trial-38938062184/EVIDENCE.json) records identities, gates, sizes and SHA-256 for downloaded [raw logs](./external-trial-38938062184/raw-logs.zip), combined log, run metadata, rendered summary, derived findings and post-trial integration receipts. Logs and summary were downloaded 17:18:23–17:18:29 UTC after runner cleanup and before log expiry. Original scanner JSON, cold HTTP diagnostics and image archive were transient and were not downloaded; this retention failure remains visible. Derived JSON/CSV are identified as derived, not original scanner output.

No real database/provider credentials, production data, migrations, mail/review replies or paid AI were used. Contabo, GHCR, deployment, autodeploy, cron/provider and live-release gates remain closed. The [deployment contract](../../../deploy/coolify/README.md) still defines app-only volumes/secrets, disabled schedules, Neon/config/media backups and cutover/rollback. Exact public DNS/HTTPS origins and callback acceptance remain pending; tunnel localhost is not a public origin. External alert delivery, scheduled independent backup copies, key custody and replacement-host recovery proof remain open. Shared-host/control-plane backup is not an application recovery substitute.

This authorization is consumed. Any diagnostic repair, dependency/base remediation, retained-image publication or further build needs a separately reviewed scope; no automatic retry is queued. The final documentation/evidence commit is local only, leaving the remote at the authorized request commit.
