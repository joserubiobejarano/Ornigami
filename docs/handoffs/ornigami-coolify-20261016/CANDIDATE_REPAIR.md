# Local candidate repair — no new trial authorized

This preparation follows the [failed runtime/advisory acceptance trial](./REPAIRED_TRIAL.md). Successful compilation of `a0f319c39a3bbc315e8e2a0d8ca4f854c7438838` remains historical evidence, not acceptance of this repaired candidate. No external run, branch push, GHCR publication, Contabo command, deployment, cron or provider operation is part of this repair. Previous evidence directories remain unchanged.

## Base and final-image advisory disposition

The Docker stages retain Node 22.23.3 but move together from bookworm-slim to the official Linux amd64 `node:22.23.3-trixie-slim@sha256:6b25e0bf3aaee33c18ba3c5d1b71646df1ba485a2a5500fd8376a3be3d110812`. [Registry identity receipt](../../../deploy/coolify/base-image-candidate.json) records its immutable manifest and official source annotation. This changes glibc/OS libraries and therefore requires a fresh image build, native sharp/HTTP checks and restart/persistence acceptance; it is not an accepted drop-in runtime yet.

Read-only registry inspection verified the 29,843,350-byte Debian rootfs layer against SHA-256 `ecc510c1e359bdc007b39802570bb7e4dec7d6ebccf357c3201a74299113e05e`. Its dpkg inventory contains Perl 5.40.1-6+deb13u1, zlib1g 1:1.3.dfsg+really1.3.1-1+b1, util-linux family 2.41.5-0+deb13u1 and gzip 1.13-1+deb13u1; util-linux-extra is absent there. Later Node image layers can change that inventory, so this is not a final-image scan or proof of absence in the finished image.

The final stage removes unused npm, npx, Corepack and Yarn directories/entrypoints, then checks the expected Node version and absent manager paths. App dependencies still come from the committed `npm ci --omit=dev` stage. Build stages retain their package managers; those base vulnerabilities remain in scope. No `.trivyignore`, ignored-unfixed switch, VEX exemption, severity reduction or relaxed threshold is introduced. Source maps, static CSP hash generation, non-root user, health check, read-only runtime and resource/network restrictions are retained.

All **75 high/critical package/advisory rows from the previous image** remain visible in the [original CSV](./external-trial-38938062184/final-high-critical.csv), with installed version, each CVE, fixed versions and advisory URL. The following is a preparation disposition, not a replacement scan or a claim that any row is cleared:

| Prior affected packages | Available fix / preparation disposition |
| --- | --- |
| `perl-base` 5.36.0-7+deb12u3: three critical and five high rows | Bookworm fix for the three critical and four high rows is 5.36.0-7+deb12u4. Trixie's 5.40.1-6+deb13u1 is listed fixed for those critical issues. CVE-2026-9538 remains vulnerable in Trixie; no supported Trixie fix listed. |
| `zlib1g` 1:1.2.13.dfsg-1: critical CVE-2023-45853 | Trixie source 1:1.3.dfsg+really1.3.1-1 is listed fixed. Debian's bookworm/minizip applicability nuance remains recorded, without suppressing the prior finding. |
| `bsdutils`, `libblkid1`, `libmount1`, `libsmartcols1`, `libuuid1`, `mount`, `util-linux`, `util-linux-extra`: six high rows each | Trixie fix for CVE-2026-53613/53615 is 2.41.5-0+deb13u1, but CVE-2026-76642/78408/78409/78410 remain open. No all-clear disposition. |
| `brace-expansion` 2.0.2: five high rows | 2.x fixes through 2.1.6 cover the listed rows; CSV retains fixes for other branches. Final-stage manager removal targets inherited copies; exact paths and any remaining app copies require the new scan. |
| `http-cache-semantics` 4.2.0: high | No fixed version listed. Manager removal may remove inherited copies; otherwise remains blocked. The upstream dispute is not an exemption. |
| `ip-address` 10.1.0: high | Fixed version 10.3.1; target inherited copies by removing final managers, verify final inventory. |
| `pacote` 19.0.2 and 20.0.1: two high rows | Fixed version 21.5.1; removal avoids an unreviewed major-version override inside a bundled package manager. Base copies still require review. |
| `picomatch` 4.0.3: high | Fixed 4.0.4 (also 3.0.2 / 2.3.2 on other branches); final removal must be verified by scan. |
| `sigstore` 3.1.0: high | Fixed 4.1.1; final manager removal prepared, base remains unresolved until scanned/remediated. |
| `gzip` 1.12-1; `libacl1` 2.3.1-3; `libsystemd0` and `libudev1` 252.39-1~deb12u2; `libtinfo6`, `ncurses-base`, `ncurses-bin` 6.4-4: seven high rows | Previous scan listed no fixed versions. New OS versions must be inventoried and scanned; no package in this group is marked cleared here. |

Debian primary evidence: [Perl critical fix](https://security-tracker.debian.org/tracker/CVE-2026-13221), [zlib/minizip](https://security-tracker.debian.org/tracker/CVE-2023-45853), [remaining util-linux issue](https://security-tracker.debian.org/tracker/CVE-2026-76642), [remaining Perl issue](https://security-tracker.debian.org/tracker/CVE-2026-9538). The [official Node image guidance](https://raw.githubusercontent.com/nodejs/docker-node/main/docs/BestPractices.md) describes omitting unused package managers from production images. Node 22 is still listed as LTS in the [official release table](https://nodejs.org/en/about/previous-releases); recheck the announced security updates before any future trial or rollout.

Unresolved base or final high/critical findings keep advisory acceptance failed. A diagnostic trial can still collect HTTP/persistence evidence while reporting that failure. Do not upgrade to an unstable distribution, hide a package inventory or waive the threshold merely to obtain a green run.

## Acceptance diagnostics and retention repair

Investigation reproduced a concrete blocker in the existing Windows production build: the full extracted cold-check block failed at `script /_next/static/chunks/5930-0a7517faad12a649.js lacks SHA-256 SRI`. The homepage returned 200, static CSP manifest parity matched, nonce hydration was present and the first three asset digests matched. Ten subsequent script tags lacked integrity attributes; the first missing tag stopped the original block. Its hash exists in the build's SRI manifest. The installed Next 16.4.1 implementation, corroborated by [the official tagged source](https://raw.githubusercontent.com/vercel/next.js/v16.4.1/packages/next/src/server/app-render/get-layer-assets.tsx), emits layer script tags with a nonce but no integrity attribute. This is a supported explanation for the local failure; the lost Linux assertion still cannot be attributed conclusively. Existing Windows build provenance is not an exact-candidate Linux receipt.

SRI remains an unresolved runtime acceptance blocker. This repair does not disable its assertion, downgrade to nonce-only acceptance, rewrite HTML at the proxy or silently patch installed framework files. A compatible upstream fix or a separately reviewed, version-bound framework repair must eventually demonstrate integrity attributes and byte parity. The proposed diagnostic trial can collect other security and persistence results while retaining this failure.

The runtime harness captures stderr privately and collects bounded sanitized container logs and final container/cgroup state before removing the disposable container. Its structured `runtime-http.json`, and `failure.json` / `failure-evidence.txt` on failure, preserve response observations, assertion text/stack context, shell failure location and command, and the original exit status. Relevant response headers are allowlisted; cookies, bearer credentials, secret fields and URL credentials are redacted. Body previews are bounded and must not delay the original response stream. Static-manifest context is recorded even before the first HTTP request. Raw temporary diagnostics are excluded from artifact collection.

All 32 original embedded Node assertion lines remain in the repair; the expected nonce/CSP/SRI/header, canonical-origin, anonymous-session and disabled-provider/cron protections are not relaxed. Failed checks still exit nonzero. A missing structured runtime receipt also fails evidence acceptance rather than silently producing a green retention result.

The SRI failure is retained while independent negative-route checks continue; the original SRI error is rethrown after collecting their results. Cold HTTP failure no longer prevents independent cache priming, restart and recreation checks when the isolated app remains healthy. Phase outcomes remain separate and any failed security/cache phase fails the final runtime result. Startup, resource or isolation failure can still prevent later phases and must be reported as untested.

With the deferred SRI error, the local extracted cold block also completed login/anonymous-session checks, hostile forwarded-origin rejection, Google/Stripe login guards, OpenAI 403, privacy 503, missing/wrong cron-token 401 checks for all four routes, Open Graph PNG and native image optimization. It still exited nonzero for SRI. This is useful diagnostic evidence from an existing Windows build, with synthetic configuration only; it does not accept this source on Linux or test container restart/cache persistence.

The [local probe receipt](./local-repair-evidence/local-runtime-probe.json) distinguishes checkout HEAD, unverified existing-build provenance, the Windows working-copy checksum and canonical committed checksum. It contains no credential values. Earlier Linux evidence was not amended to attribute this newly observed failure to it.

The workflow uploads original `base-trivy.json` and `trivy.json`, sanitized runtime receipts/logs, exact source/request/lock/workflow identities, image identity, resource counters and pre-cleanup disk usage in a bundle with a SHA-256/size manifest. The pinned official artifact action executes with `always()` before runner cleanup; requested retention is 30 days, subject to repository policy. Actual upload/download remains untested until a separately authorized run. The image archive and raw diagnostics are excluded. Cleanup is limited to the exact builder/container, newly owned state volume and matching image identity from this run; no shared pruning is introduced.

## Acceptance status of this preparation

Focused local verification passed **10/10** tests using `node --test tests/coolify-rehearsal-workflow.test.mjs tests/coolify-runtime-acceptance.test.mjs`. Fixtures execute the actual evidence collectors, cleanup function and restart/recreate phase control with fake Docker: missing receipts fail, secret canaries are removed, writer failures retain private raw diagnostics, phase failure still reaches both later probes and remains nonzero, and foreign resources are preserved. Focused ESLint passed. YAML parsing, all 14 workflow Bash blocks, runtime Bash, five workflow and five runtime Python blocks, and the embedded cold Node block passed syntax checks. These fixtures are not real container lifecycle proof. [Local verification receipt](./local-repair-evidence/LOCAL_VERIFICATION.json) records the checks and probe checksum.

| Gate | Status |
| --- | --- |
| Registry manifest / Debian layer identity and inventory review | Passed; limited to recorded layer, not a scan |
| Workflow capture / ownership fixture tests | Passed locally, fake Docker only |
| Existing Windows build cold HTTP probe | Failed SRI; later negative boundaries passed in the diagnostic probe |
| Candidate Linux compilation / image scan / native memory | Untested; no new build or external run |
| Candidate Linux HTTP/security and restart/cache persistence | Untested; SRI issue remains open |
| Release, retained deployable image, public routing, Neon/recovery and provider acceptance | Untested / closed |

The new candidate has no image ID, registry digest or measured resource result. Historical 180-second compilation and 7.572 GiB peak belong only to the earlier `a0f319c…` image trial. Do not transfer those measurements or its successful build gate to this source.

## Proposed next trial — approval required, not queued

After review, refresh all deployment integration protections before either push. Publish the correction with the existing request file unchanged, confirm no build/deployment starts, then create one separate request-only commit for the exact repaired source and canonical lock checksum. Candidate/request workflow blobs must match. Do not merge application changes to `main` to make `workflow_dispatch` available.

Use the same public standard `ubuntu-24.04` Linux amd64 runner, serial BuildKit, 8 GiB memory / zero additional swap / 3 CPU, Node heap 4096 MiB, source maps retained and no retry or paid fallback. Record source/lock/workflow/image identity, build exit status/time, cgroup peak/OOM/CPU counters and disk snapshots. Builds remain off Contabo. The image remains ephemeral unless a separately authorized retention/publication step is accepted.

The proposed trial must execute the full cold HTTP/security checks with exact failure diagnostics: static CSP manifest parity, nonce hydration/rotation, required headers, SRI bytes, anonymous sessions and canonical redirects, hostile forwarded host/protocol, disabled provider/privacy gates and missing/wrong cron credentials. It must exercise native image optimization, then restart the same container and recreate it against the same app-only cache volume, verifying cache content identities and HTTP hits after both operations. A liveness response cannot substitute for any of these gates.

Run original base and final image scans with complete targets/package inventory and enforce the high/critical threshold independently of compilation. Retain original JSON plus bounded sanitized runtime evidence with hashes as downloadable artifacts **before runner cleanup**, including failed assertions and container logs before container removal. Download artifacts and raw Actions logs before expiry. Never upload the image archive, runtime credentials or unfiltered environment/inspect output. Failure remains failure even when diagnostic retention succeeds.

Public HTTPS/Traefik, real session/provider callbacks, Neon connectivity/schema/restore, natural cron receipts, external alerts, independent backups/key custody and replacement-host recovery remain separate untested release gates. All deployment, cron/provider and live-release gates stay closed.
