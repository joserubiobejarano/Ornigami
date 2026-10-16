# Portable framework and evidence-capture repair — local results

Exact locally committed candidate: **`a069cd4d6232f57c72e1a8d7af2349bb707f0474`**, branch `codex/ornigami-sri-portable-local-20261016`, worktree `.local/framework-prototype/ornigami-app-portable`. It descends from the historical request commit and leaves `.github/build-requests/ornigami.json` unchanged. No push, external runner, registry, VPS, deployment or provider operation was performed. A read-only Vercel check at **21:41:08 UTC** still returned `link: null` and the same production deployment `dpl_AXyNVgUpoPPhczSUjpxrURtp9JfE`. The hold remains; no restoration was attempted. QR staging and shared infrastructure were not changed.

## Immutable identities

Canonical identities below come from the committed Git blobs, not Windows line-ending guesses. [Full identities](./portable-repair-evidence/IDENTITIES.json) include blob IDs, sizes, recipe/configuration/checker hashes and fixture/browser lock checksums; [package provenance](./portable-repair-evidence/PACKAGE_IDENTITY.json) pins the package's complete build recipe.

| Input/output | Identity |
| --- | --- |
| Exact application candidate | `a069cd4d6232f57c72e1a8d7af2349bb707f0474` |
| Official Next 16.4.2 source | `2864b1772c37242a9b40ab4d366eb7d368c2a070` |
| Source tree after independently applying the full patch | `2683cc1fc4df83fbfe49df739e8a5a57801e2a58` |
| Official package SHA-256 | `44ad2c420d30f7d1a8e4c511759c57eb40ccbbc36213a1bf32b1698bcebd3a1d` |
| Frozen upstream dependency lock SHA-256 | `69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6` |
| Full source patch SHA-256 | `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5` |
| `next-16.4.2-ornigami-sri.2.tgz` SHA-256 | `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f` |
| Package SHA-512 integrity | `sha512-17BrG8dBp5eMwEyf8YEr2+bSB94tOFV3DVcDkBEIi91FM40Va7Dzsa0OK2jIEBQHhaNqjbSxdG0lb/sIlmIwEA==` |
| Application lock SHA-256 | `060925fca2813f36357b6ce2459485b0367e33be848ffc253977aca96dbbb350` |
| Workflow Git blob | `e323959ad1edd6f69269b4fd2d568e1aa48f4afe` |
| Workflow canonical SHA-256 | `4c222b649853d37b3b64b5a89e11aa97fb5caf1b42a6e075ae03e1fa4e309219` |
| Official npm 11.21.1 archive SHA-256 | `dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b` |

The new source patch includes `packages/next/next-runtime.webpack-config.js`. It converts generated CommonJS external requests to module separators in source, before the compiler emits all four actual production renderer bundles. VM tests use both Windows/POSIX path implementations on the actual committed configuration overlay; the recipe requires that overlay to match production build source. Package admission and a separate AST audit check actual cold-installed bundle imports. The [independent temporary-index patch check](./portable-repair-evidence/PATCH_APPLY.json) passed against the exact upstream commit and verified configuration byte parity. Source maps remain intact. No installed dependency patch, opaque-output replacement, HTML rewrite, skipped assertion or source-map removal was used.

The packaging recipe now records its initial bytes and refuses a mid-build edit. Diagnostic build **H** is preserved but excluded from accepted provenance because its recipe was edited while running. Frozen-recipe builds **I/J** used separate generated directories, reseeded `dist` from the verified official archive and rebuilt targets serially. They produced **identical complete 44,857,205-byte archives**, 8,695 payload files and 2,745 source maps. [Reproduction receipt](./portable-repair-evidence/REPRODUCIBILITY.json) and [complete payload hashes](./portable-repair-evidence/PAYLOAD_MANIFEST.json) retain the proof. Upstream dependencies were reused from the pinned frozen installation; this is Windows same-environment reproduction, not an independent-machine/Linux rebuild of the framework, native dependencies or entire upstream project.

## Regression and resource evidence

| Gate | Local result |
| --- | --- |
| Source external-handler regression / package admission / AST | **Passed: 10 tests.** Windows/POSIX production and worker external paths; compiled/server dependencies; all four cold-installed production bundles; malformed package fixture rejected for Windows imports with either quote style. |
| Workflow failure paths | **Passed: 16 tests.** Real extracted workflow shell blocks use fake Docker/cgroup fixtures. Cold missing directories, skipped runtime, attempted runtime with missing assertions, build stdout/stderr and exact exit preservation, valid counters after failed build, OOM/reset/missing counters and owned-resource cleanup are exercised. |
| Build-tool identity / all-54 coverage | **Passed: 2 tests.** Complete official npm archive SHA-256/SHA-512, target Node engine compatibility, and one-to-one coverage of every prior high finding including package paths. |
| Custody helper negative guards | **Passed: 6 fake-API tests.** No live acknowledgment or status write occurred. Custody still means identity/digest/durable bytes, not completeness or security acceptance. |
| Workflow preparation | **Passed.** YAML parsed; all 16 shell blocks pass `bash -n`; restricted branch/path trigger unchanged. No request marker changed. |
| Cold application install | **Passed**, 653 packages through pinned npm 11.21.1; no subsequent dependency edits. |
| Cold fixture / browser-tool installs | **Passed** with frozen locks and a fresh package/tools directory; browser download disabled. |
| Fictional production/browser fixture | **Passed: nine groups.** Valid hydration/late loading/navigation; real browser rejection of corrupted bootstrap/asynchronous scripts; missing/malformed manifest and browser hashes fail closed; missing manifest returns HTTP 500; independent local process restart/cache marker. Zero non-loopback page requests; cleanup passed. |
| Fresh exact-candidate Ornigami build / HTTP security | **Passed.** Clean source SHA verified by the checker; compilation/TypeScript/static generation and CSP generation completed in **74.067 seconds**. Home/login returned HTTP 200 with required headers/nonces/rotation; **31 protected script occurrences, zero missing/invalid SRI, zero external sources**, **143 application maps**, two static CSP hashes. [Exact receipt](./portable-repair-evidence/app-sri.json). |
| Actual Linux portability / runtime | **Untested.** Windows imports/static AST proof do not establish Linux execution, native memory or actual container restart/cache acceptance. |
| Fresh base/tooling/final image scans | **Untested.** No Docker engine/WSL or external runner was used. No new accepted image exists. |

There are **34 distinct focused passing tests** (33-test combined run plus the added AST regression) and nine passing browser groups. Original reports, exact assertions, relevant sanitized observations, server logs and exit codes are retained in [local evidence](./portable-repair-evidence/RESULTS.json). Earlier Windows and Linux failures remain separate and unchanged. The historical Linux 13-file partial artifact still lacks its original runner manifest; the later checksum inventory was never represented as a reconstructed runner manifest.

All local installs/builds/browser processes were serial under Windows Job Objects: **6 GiB committed process-tree memory, three CPU equivalents, 4096 MiB Node heap, 20 minutes**, admission requiring limit plus a 3 GiB physical-memory reserve and 40 GiB free disk; stops remain below 3 GiB free memory or above 20 GiB observed system-volume growth. No cap increase or paid fallback occurred.

| Operation | Seconds | Peak committed bytes |
| --- | ---: | ---: |
| Package I | 139.083 | 779,603,968 |
| Package J | 137.955 | 814,747,648 |
| Cold app install | 69.608 | 1,023,762,432 |
| Cold fixture install | 21.007 | 566,415,360 |
| Fixture build | 19.597 | 574,398,464 |
| Cold browser tools | 1.327 | 116,752,384 |
| Browser regressions | 6.419 | 573,857,792 |
| App build plus HTTP checker | 82.417 | **3,966,783,488** |

The full app check retained at least **8,515,608,576 bytes** system free memory; observed volume-growth peak **1,134,624,768 bytes**. Each supervisor receipt has exit 0 and no stop reason. These are Windows committed-memory/system-volume measurements, not Linux RSS, continuous application cache measurements or zero-OOM Linux evidence.

## Evidence-capture repairs

Initialization and capture independently create every required directory. Build output is teed directly into the artifact, with Docker/timeout and log-writer exit codes recorded separately. Capture produces explicit build/browser/runtime outcomes, hashes every available evidence file and writes a manifest even when stages are skipped or runtime assertions are missing. Missing attempted-runtime assertions still fail capture **after** writing the manifest. Builder counter validation now runs whenever the owned builder was created, even if image building fails; missing, malformed, reset or OOM counters fail with retained diagnostics. Browser scope exit codes are exported and recorded. The existing strict HTTP/security and independent container restart/recreation/cache assertions remain intact.

These paths passed fake-command execution locally; actual Linux failure-path behavior and full artifact completeness need the next separately approved trial. The artifact still precedes cleanup by design; post-cleanup observations need supplemental finished logs/summary. A custody acknowledgment cannot override a failed capture/completeness, scan, resource or runtime gate.

## All 54 base high findings

[Every affected package/path/version and disposition](./portable-repair-evidence/ALL_54_REVIEW.json), [reviewed GitHub advisories](./portable-repair-evidence/github-advisories.json) and [official npm comparisons](./portable-repair-evidence/npm-11.21.1-review.json) are retained. The candidate also commits `deploy/coolify/base-high-remediation-review.json` and `deploy/coolify/npm-remediation-candidate.json`.

**43 Debian findings remain unresolved.** Reviewed vendor records still mark Trixie vulnerable or deferred: four util-linux advisories across nine installed packages (36 rows), systemd (two), ncurses (three), ACL (one), Perl (one). Fixed unstable versions do not constitute compatible Trixie pins: util-linux 2.42.3-1/2.42.4-1, systemd 261.2-1, ACL 2.4.0-1, ncurses 6.6+20251231-1 and Perl 5.42.3-1 need broader distro/ABI/backport decisions. No unstable package mixing or OS source fork is prepared. Applicability conditions need Linux file/privilege proof; no non-root argument waives the zero-high gate. Sources: [util-linux mount](https://security-tracker.debian.org/tracker/CVE-2026-76642), [nsenter](https://security-tracker.debian.org/tracker/CVE-2026-78408), [subdir](https://security-tracker.debian.org/tracker/CVE-2026-78409), [bind mount](https://security-tracker.debian.org/tracker/CVE-2026-78410), [systemd](https://security-tracker.debian.org/tracker/CVE-2026-16742), [ACL](https://security-tracker.debian.org/tracker/CVE-2026-54369), [ncurses](https://security-tracker.debian.org/tracker/CVE-2025-69720), [Perl](https://security-tracker.debian.org/tracker/CVE-2026-9538).

**11 findings are in the original base's bundled npm**, not Yarn. Prepared change: complete, checksum-pinned **npm 11.21.1** for Docker build/prod-dependency stages and the disposable Linux fixture. Its engine range supports Node 22.23.3. Registry signatures were verified against the published keys, and cold installs/builds passed locally. Bundled replacements: brace-expansion 5.0.12 (five rows), pacote 21.5.1 (two), ip-address 10.7.2, picomatch 4.0.4, sigstore 4.1.1 and http-cache-semantics 4.3.0. Ten rows have explicit published fixed-version ranges satisfied by those versions. The HTTP cache advisory lists `<=4.2.0` as affected but no first patched version; 4.3.0 is outside the range, while explicit vendor clarification/fresh scan remain open. Npm 10.9.9 retains the affected versions; blindly selecting npm 12.2.0 also leaves affected brace-expansion/HTTP-cache versions. [Official selected metadata](https://registry.npmjs.org/npm/11.21.1), [HTTP-cache advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).

**No fresh image fix is confirmed.** The original Node base stays pinned and independently scanned; its existing **0 critical/54 high** failure is not hidden by build-base changes or final-stage package-manager removal. The npm 10→11 tooling change is an experimental compatibility result, still subject to production toolchain review. The historical **final-image 4 critical/71 high** findings remain separate and unverified. No suppression, `ignore-unfixed`, severity override or threshold relaxation was introduced.

## Proposed single future Linux trial — separate approval required

This is a concrete proposal, not permission to publish or run:

1. Refresh all live deployment watchers/holds and active operations; stop on any uncertainty. Leave Ornigami's Vercel disconnection in place; preserve QR and existing deployments/jobs. No SSH/tunnel startup or host change is part of the proposal.
2. If explicitly approved, publish **this exact candidate** to existing restricted branch `codex/ornigami-sri-local-prototype-f-20261016` without changing its existing request marker. Confirm no build/deployment started. Then push one separate request-only commit using [this exact proposed JSON](./portable-repair-evidence/PROPOSED_REQUEST.json), verifying candidate/request workflow blob equality.
3. Run once on standard public Ubuntu 24.04 Linux amd64: **8 GiB/3 CPU BuildKit, 4 GiB Node heap, maps retained**, serial build. Preserve the 768 MiB/0.75 CPU/512 MiB heap disconnected non-root runtime. No paid capacity, retry, cap increase or security exception.
4. Cover cold install/build portability, all four bundle imports/maps, complete original-base and final-image OS/language scans, pinned tooling inventory, Linux HTTP/CSP/SRI/negative checks, actual browser valid/corrupted loading, independent container restart/recreation/cache ownership/reuse, cgroup memory/OOM/CPU and disk use. Keep failing gates independent. The current original base is still expected to fail its zero-high gate; such a diagnostic run cannot establish image/release acceptance.
5. Exercise the repaired capture paths and verify the actual uploaded manifest/file coverage. Download the exact artifact before cleanup, independently check completeness, and use one separately approved owner custody acknowledgment only after identity/digest/fsync/read-back. Download finished logs/cleanup evidence immediately afterward. Custody remains separate from completeness/security acceptance.
6. Stop after the one trial, preserve failures and commit sanitized results. Retain no deployable image; GHCR/registry publication remains a later decision.

Approval would need to name candidate `a069cd4d6232f57c72e1a8d7af2349bb707f0474`, its publication plus one request-only commit/run, and one owner custody acknowledgment. No such approval is assumed. Alternatively, defer Linux work until a compatible base-remediation decision is available.

Framework adoption, primary/backup/security ownership and any maintenance SLA remain unresolved. Exact staging origin/callback acceptance for `ornigami.com`, Neon identity/bounds/secrets, independent Neon/config/media copies, key custody, external alerts and replacement-host recovery proof remain open. Deployment, cron/provider activation, registry, DNS/public routing and live release remain closed; host backups cover only the Coolify control plane.
