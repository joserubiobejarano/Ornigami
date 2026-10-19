# Ornigami staging readiness handoff — 2026-10-18

Reviewable staging-readiness package for the recovered Coolify/tooling lineage (experiment head `658537c`),
composed for independent review. Nothing is pushed, deployed or dispatched by this handoff.

## 1. Goal and status

**Goal.** Recover the verified tooling/framework lineage of experiment head `658537c` onto a reviewable
branch; resolve (or bound) the CVE-2026-111142 / CVE-2026-111141 Debian advisory-coverage and maintenance
blockers; and hand off the resulting state — branch composition, provenance, verification records,
operational implications, bounded next-trial proposal and remaining blockers — for independent review
before any staging deployment is considered.

**Status.**
- Branch `codex/ornigami-staging-readiness-20261018` is composed locally on main `92d819f`.
- The experimental range `f6e26a1..658537c` is carried per-commit; the recovered operative tree is
  byte-identical to `658537c` except three reconciled files (Section 3).
- All platform/tooling identity hashes verified locally against the retained trial-7 custody records
  (Section 5). All 87 candidate-scope tests passed locally on this branch (Section 6).
- No push, no deployment, no registry/DNS/SQL/schema/host/provider action, no third-party message.
- The image rehearsal workflow cannot run from this branch (trigger is bound to the experiment branch
  name only; no dispatch surface — verified in Section 2).

**Central conflict resolution.** Main's `Dockerfile` is the "Inactive preparation" shape
(`node:22.23.3-trixie-slim@sha256:6b25e0bf3aaee33c18ba3c5d1b71646df1ba485a2a5500fd8376a3be3d110812`,
`syntax=docker/dockerfile:1.7`); this branch replaces it with the trial-verified distroless/SRI candidate
preserving the operative `# syntax=ornigami-frontend` recipe-bound build. Main wins for app/feature files
and policy docs (e.g. `src/lib/env.ts` keeps main's QR_MAIL_* schema; ROADMAP/OPERATIONS/deploy-vps docs
untouched). The candidate tree wins for platform/tooling identity files (Section 3).

## 2. Branch and HEAD state

- Base: main `92d819f`.
- Branch: `codex/ornigami-staging-readiness-20261018`.
- Content HEAD (verified 2026-10-18): `e756606` — "feat: recover remaining operative
  framework-prototype tooling directory" (full SHA `e756606242cecae709a3dcd45aedafdc94515192`).
- This handoff is committed as the commit immediately following `e756606` (branch tip); only this file.
- Working tree clean at both verifications (`git status --short --branch`); no conflict markers in the
  tree (searched for `<<<<<<<`/`>>>>>>>`; none).

Source range: `f6e26a1..658537c` = 15 commits (14 non-merge + 1 merge). Carried: 11 non-merge commits.
Skipped as empty-after-pruning: 3. Merge, not cherry-picked: 1. Branch-side commits: 3 + this handoff.

### Commit mapping (source → branch)

| # | Source (experiment) | Branch commit | Carry |
|---|---|---|---|
| 1 | `bc4e3b1` "Request one fresh-DB minimal-base Linux diagnostic" | `572ee15` | carried (same subject); handoffs pruning changes patch context, so it shows as unpaired in range-diff |
| 2 | `3b47c36` "Preserve npm bootstrap regression results and all full-trial payload logs" | — | skipped: 38 changed paths pruned (37 handoffs-evidence files + its `.gitattributes` line) |
| 3 | `2648495` "retain complete minimal-base Linux trial and security holds" | — | skipped: 25 changed paths pruned (24 + attr line) |
| 4 | `929c830` "Construct and gate bounded patched BuildKit and Dockerfile tooling" | `f9ddf55` | carried, modified by pruning; tooling `.gitattributes` rules moved into `17f89ce` |
| 5 | `929c8301`+`bc4e3b1` merge `bfc0cde` "Integrate consumed trial request lineage for forward tooling publication" | — | merge commit, no unique tree delta (merge resolution touches `.gitattributes` only); its effect is reproduced by carrying rows 1 and 4 sequentially |
| 6 | `7a24156` "Request one tooling-only Linux trial for bfc0cde" | `d524330` | exact carry (range-diff `=`) |
| 7 | `84d46b9` "fix(toolchain): validate compiler link objects separately from executables" | `59ff8c6` | carried with the original message; range-diff pairing is broken by the `17f89ce` insertion in the branch sequence (carry identity covered by the tree-level check in Section 3) |
| 8 | `7b8b901` "retain original finished and local verification logs" | — | skipped: 5 changed paths pruned |
| 9 | `88fb665` "ci: request tooling-only compiler object repair trial" | `fcdfb87` | exact carry |
| 10 | `7e73ed6` "preserve strict observations and clean owned compiler caches" | `b9c806d` | carried with the original message (range-diff pairing separated by newly inserted commits) |
| 11 | `ee92324` "ci: request final bounded tooling verification after observer and cache fixes" | `ba2de28` | exact carry |
| 12 | `d54e111` "break tooling gate CLI import cycle and retain passing scans" | `36249f6` | carried with the original message (adds `stage-index.mjs`) |
| 13 | `65ccca1` "docs(staging): prepare private proxy profile for explicit review" | `6cbc61d` | exact carry |
| 14 | `7c03441` "ci: request owner-extended tooling compatibility trial" | `feb5818` | exact carry |
| 15 | `658537c` "Preserve verified tooling trial and bind approved staging origin" | `2b301c2` | carried, modified: retains only `658537c`'s own 28 handoffs files; drops 1,508 earlier-range evidence paths |

Branch-side commits, newest first:

| Branch commit | Content |
|---|---|
| `17f89ce1f88e3d6b78dc767f57b924ff925f495b` | `.gitattributes` only: line-ending rules re-landed for the recovered tooling lineage (`scripts/framework-prototype/**` incl. `*.patch` and `official-db-manifest.json -text`, `deploy/coolify/toolchain/**`) |
| `d1b174a61e0c142a66a0d9777a7c3078b6ac8116` | candidate platform identity: `package.json`, `package-lock.json`, `vendor/build-tools/npm-11.21.1.tgz`, `vendor/framework/*`, `next.config.ts`, `deploy/coolify/runtime-probes.mjs`, `.dockerignore` whitelist, vendor/lock attributes, `tests/coolify-runtime-acceptance.test.mjs`, plus 6 operative scripts re-landed during alignment |
| `e756606242cecae709a3dcd45aedafdc94515192` | remaining operative `scripts/framework-prototype/` files from `658537c` (28 files incl. `next-16.4.2-sri.patch`, overlay sources, `bounded-local.ps1`, docs/templates) + `official-db-manifest.json -text` attribute line |
| (this commit) | this handoff file only |

Excess-amendment note: an invalidated accidental amend `0bf4295` of `7a24156` is orphaned in reflog
only; `d524330` carries its content with the correct restored message.

### Workflow dispatch surface (none from this branch)

`.github/workflows/ornigami-image-rehearsal.yml` triggers only on
`push` to `codex/ornigami-sri-local-prototype-f-20261016` with `paths: [.github/build-requests/ornigami.json]`;
no `workflow_dispatch`, no `schedule`. The single job `build-validate-scan` re-verifies
`github.ref == refs/heads/codex/ornigami-sri-local-prototype-f-20261016`, `github.event.created == false`,
repository `joserubiobejarano/Ornigami`, public repo, run_attempt 1; `permissions: statuses: read`
(read-only). It builds the exact commit referenced by `.github/build-requests/ornigami.json`
(`sourceSha=65ccca1d534f5951120b5ddfe9d04b9288745d7e`, lock hash `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815`),
so a future trial intentionally points the request at a new source SHA on the bound branch (Section 8).

## 3. Changes by file (92d819f..e756606)

Totals: **109 files changed, 14,170 insertions, 245 deletions.**

| Tree | Files | Delta |
|---|---|---|
| `scripts/framework-prototype/` | 48 | +3,969 |
| `docs/handoffs/ornigami-coolify-20261016/` (28 at historical composition; 3 sanitized files remain tracked after Block 4B) | 28 historical | +4,077 historical |
| `deploy/coolify/` | 13 | +3,401 / −10 |
| `tests/` | 9 | +1,262 |
| `.github/` (workflow + build request) | 2 | +1,099 |
| `vendor/` (npm tgz, framework tgz, README) | 3 | +3 |
| root/platform (Dockerfile, next.config.ts, package.json/lock, .gitattributes, .dockerignore) | 6 | modified |

Added: `Dockerfile` flow files `deploy/coolify/{build-profile.json, toolchain/recipe.json,
toolchain/apk-lock.json, toolchain/locks/*.go.{mod,sum}}`, `deploy/coolify/runtime-probes.mjs`,
`deploy/coolify/PRIVATE_STAGING_PROPOSAL.md`, `deploy/coolify/compose.private-staging.proposed.json`,
`.github/build-requests/ornigami.json`, `.github/workflows/ornigami-image-rehearsal.yml`.

Operative tooling file recovery by carrying commit:
- `f9ddf55` (from `929c830`): `serial-scan-driver.mjs`, `analyze-docker-archive.mjs`,
  `cleanup-owned-images.mjs`, `extract-tool-sources.py`, `observe-buildkit.mjs`,
  `official-db-publication.mjs`, `tool-image.mjs`, `toolchain-build.mjs`, `toolchain-contract.mjs`,
  `toolchain-probe.mjs`, `toolchain-runtime.mjs`;
- `59ff8c6` (from `84d46b9`): `elf-closure.mjs`;
- `36249f6` (from `d54e111`): `stage-index.mjs`;
- `2b301c2` (from `658537c`): `build-profile.mjs`;
- `d1b174a`: `bounded-scan-worker.mjs`, `frozen-db-admission.mjs`, `linux-fixture-trial.sh`,
  `minimal-parent-policy.json`, `scan-image-stages.mjs`, `verify-minimal-parents.mjs`;
- `e756606`: 28 files incl. `next-16.4.2-sri.patch`,
  `overlay/{subresource-integrity-plugin.ts.source, next-runtime.webpack-config.js.source}`,
  `bounded-local.ps1`, `admission-only*`, `browser-tools/package{,-lock}.json`, evidence-workflow templates,
  `official-db-manifest.json`, docs/templates.

### Reconciliation exceptions vs 658537c (intentional)

```
git diff 658537c HEAD -- package.json package-lock.json next.config.ts Dockerfile \
  deploy/coolify/toolchain deploy/coolify/build-profile.json deploy/coolify/runtime-probes.mjs \
  deploy/coolify/PRIVATE_STAGING_PROPOSAL.md deploy/coolify/compose.private-staging.proposed.json \
  tests/coolify-runtime-acceptance.test.mjs .github/build-requests/ornigami.json \
  .github/workflows/ornigami-image-rehearsal.yml scripts/framework-prototype vendor
```
Verified empty (byte-identity) on the branch for all listed paths.

Only three operative files differ, by design:
1. `deploy/coolify/linux-runtime-acceptance.sh` (modified): keeps main's simpler in-container mechanics
   and drops the candidate's probe-based forms — cgroup capture via busybox `sh -c` reading
   `/sys/fs/cgroup/{memory,cpu,pids}*` instead of `node /app/deploy/coolify/runtime-probes.mjs cgroup`;
   runtime UID via plain `id -u` instead of `runtime-probes.mjs uid`; disk via `df -Pk` instead of
   `runtime-probes.mjs disk`; candidate's native-image-formats probe block removed (report failure gates
   are HTTP/cache checks only). `runtime-probes.mjs` remains built into the image per candidate Dockerfile
   (`COPY ... ./deploy/coolify/runtime-probes.mjs`, line 95) for future re-adoption.
2. `.dockerignore` (modified): candidate whitelist `!deploy/coolify/runtime-probes.mjs` retained, plus
   main-side repo-only entries (`migration-sources/`, `assets/brand-originals/`, `Audits/`).
3. `.gitattributes` (modified): candidate operative rules kept; lines for pruned evidence directories
   (all external-trial dirs except `39082300586`, `toolchain-local-evidence`, older evidence dirs) and
   out-of-tree lineage artifacts (`scripts/coolify-image-rehearsal.sh`, `tests/fixtures/framework-sri/**`)
   dropped; main-side rules (`scripts/*.sh`, `deploy/coolify/*.sh`, `Audits/*`, `migration-sources/**`,
   `tests/fixtures/contracts/*.sql`, `scripts/sql/*.sql`) kept; vendor/lock rules
   (`vendor/framework/*.tgz -text`, `package-lock.json text eol=lf`) kept.

### Evidence custody — current tracking corrected per Block 4B

At the reviewed starting HEAD the directory contained 28 tracked files. After Block 4B, only three reviewed sanitized Markdown summaries/reviews remain tracked. The other 25 original files were first copied byte-for-byte to owner-restricted, Git-ignored private custody, verified, and then removed from the worktree: 18 structured JSON execution/provenance/custody/API/resource records, one raw run log, two stdout captures, two zero-byte stderr files and two ZIP archives. The Markdown summaries are not presumed safe by extension; each retained narrative was reviewed, and its custody claims were corrected to point to the protected copy.

- Tracked sanitized trial narrative: `docs/handoffs/ornigami-coolify-20261016/TOOLCHAIN_LINUX_RESULT.md` (trials 4–7 and trial-3 context pointer).
- Tracked sanitized staging-profile review: `docs/handoffs/ornigami-coolify-20261016/build-profile-local-evidence/REVIEW.md`.
- Tracked sanitized trial-7 review: `docs/handoffs/ornigami-coolify-20261016/external-trial-39082300586/REVIEW.md`.
- Protected private copy of all 28 original files, preserving the original relative tree: `.local/recovery/ornigami-r6-private-evidence-20261019/original-tree/`. Its private `INDEX.json` maps each original absolute/relative path to its protected destination, original worktree SHA-256, protected-copy SHA-256, byte count, reviewed Git blob object ID, path-filtered Git object ID, text attribute, classification and verification result. The index also records ZIP member counts/aggregate metadata without exposing member contents.
- Private-copy verification: all 28/28 SHA-256 and byte-count comparisons passed. Destination and index inherit an owner-only ACL (one allow entry for the current account); `/.local/` ignore coverage was verified. The source checkout directory had broader inherited ACLs. Git object IDs are recorded separately from worktree SHA-256: the two evidence subtrees are marked `-text`; the top-level trial Markdown uses default text handling with `core.autocrlf=true`, so its normalized Git blob identity is not represented as its raw-byte SHA-256.
- Historical Git objects, old refs and existing recovery bundles/archives were not rewritten, deleted or pruned. The private copy is additional custody; the three Markdown files are the current tracked sanitized documentation. Later references in this handoff to raw filenames such as `SOURCE_IDENTITIES.json` and `INDEPENDENT_REVIEW.json` are historical provenance pointers to entries in the private index, not claims that those JSON files remain tracked.
- Other older evidence was already excluded from this 28-file restored tree and remains only at the historical origin/recovery sources described in prior notes; Block 4B does not broaden that recovery set.

## 4. Coverage and maintenance findings (CVE-2026-111142 / CVE-2026-111141)

**CVE-2026-111142 — zziplib out-of-bounds read, crafted ZIP central directory.**
- Affected: zziplib ≤ 0.13.80; function code paths in `zzip/mmapped.c` (upstream
  `gdraheim/zziplib` `zzip/mmapped.c` ~L420-L497 and `#L323-L352`).
- CWE-125 (out-of-bounds read). Published 2026-10-15.
- Severity: CVSS 4.0 6.8 (MEDIUM); CVSS 3.1 base 5.5 (MEDIUM). Local availability-only impact
  (crafted archive can crash a consumer, e.g. an archive/scan process); no privilege or data-loss claim.
- Recorded references: `hackmd.io/@haind-pwn/zziplib-zip-central-directory-oob-read` (technical
  write-up), VulnCheck advisory record, osv.dev `AZL-108272`, Red Hat Bugzilla 2553744 (NEW).
- Debian security tracker (checked 2026-10-18): **undetermined** for bookworm (`0.13.72+dfsg.1-1.1`),
  trixie (`0.13.78+dfsg.1-0.1`), forky/sid (`0.13.78+dfsg.1-0.2`). Sibling **CVE-2026-111141** is likewise
  undetermined in the same suites. No upstream fix release as of 2026-10-18.

**Scanner visible gap (verified directly against the exact official DB).**
- Evidence: `docs/handoffs/ornigami-coolify-20261016/toolchain-local-evidence/EXACT_ADVISORY_QUERY.json`
  at origin ref `7c03441` (pruned locally per custody decision; not carried here): direct inspection of
  the trivy DB shows the `zziplib` package bucket present but the requested advisory absent
  (`packageBucketPresent: true`, `requestedAdvisoryPresent: false`). Consequence: the exact official DB
  routes this CVE via no Debian 12/13/14 advisory set, so scanners cannot produce a finding for the
  Debian-tracked zziplib version no matter how fresh the DB is. Frozen-DB freshness admission passes
  without resolving this hold; the hold is recorded as `coverageHold: true` in
  `SOURCE_IDENTITIES.json` and in the trial-6/7 narratives.

**Why this stays an explicit blocker (policy).**
- No suppression, reclassification or local DB fork is permitted: original findings must be preserved
  unchanged (trial-6/7 discipline: BuildKit 410 packages → 2 UNKNOWN/1 MEDIUM/1 LOW; frontend 69 →
  1 UNKNOWN; Go advisory refs GO-2026-5932 x/crypto OpenPGP unmaintained, CVE-2026-61801/runc MEDIUM
  fixed 0.4.1, CVE-2026-10722/ebpf LOW fixed 0.22.0 all reported untouched).
- Overall security acceptance is therefore structurally false until a Debian advisory exists (and is
  consumed by trivy-db), or an upstream zziplib release changes Debian's undetermined status.

**Maintenance follow-up (unfiled).** An upstream follow-up (trivy-db/Debian tracker notification plus
tracking of the eventual fix) remains an unfiled draft; no issue number exists — any earlier mention of
`trivy-db#701` is unverified and must not be cited as filed. Filing requires the owner's authorization
for third-party messages (current posture: none permitted).

## 5. Candidate provenance and identity

Recovery identities (verified on this branch's worktree against origin-held custody records):

| Artifact | SHA-256 | Binding |
|---|---|---|
| `package-lock.json` (496,110 B) | `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815` | `.github/build-requests/ornigami.json` `packageLockSha256`; `SOURCE_IDENTITIES.json` |
| `vendor/build-tools/npm-11.21.1.tgz` (3,329,270 B) | `dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b` | Dockerfile RUN checksum gate (`/tmp/ornigami-npm.tgz` must hash exactly this) |
| `vendor/framework/next-16.4.2-ornigami-sri.2.tgz` (44,857,205 B) | `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f` | trial-7 `SOURCE_IDENTITIES.json` |
| `deploy/coolify/toolchain/recipe.json` (8,473 B) | `505476d99302f481cf408ef85a70bef679b7651b102f590dbfa2db9737353548` | `SOURCE_IDENTITIES.json`; Dockerfile `# syntax=ornigami-frontend` named-context recipe |
| `deploy/coolify/toolchain/apk-lock.json` (51,666 B) | `8c399fa5ff05ba2e457e131ba457e7ede365314e656208ff7d48209be1e233dd` | `SOURCE_IDENTITIES.json` |
| `deploy/coolify/build-profile.json` | `6d63cba596943eaa0d68de4b6f0eda8aa4e470b22d65b3885a2d18a62c5e748b` | branch verification (`origin: https://staging.ornigami.com`) |
| `deploy/coolify/toolchain/locks/buildkit.go.mod` / `.go.sum` | `014c3b0c23b0bbd6acc9e1139334fd17e09f772a043e680b3d120c115c7206d0` / `d40412f5434135074fa85bb1b78e9a9cde508e878572ad3939482183425b726c` | `SOURCE_IDENTITIES.json` |
| `deploy/coolify/toolchain/locks/runc.go.mod` / `.go.sum` | `70292419f5c176b4799a69310914534623833fedcb0e71c290762dda4e236e1c` / `7ba3a64b71b454005fb051aa13c3586fd44afea43b8e507f36ec127ed2d3a186` | `SOURCE_IDENTITIES.json` |
| `deploy/coolify/toolchain/locks/cni.go.mod` / `.go.sum` | `c3ae49c9c82de44d3af192997e7bca9a66c9b5b5a61069d977456b7596527c15` / `6a5c9a01cf07ad995e068e6d41d0260317cf4d66a43b7e3bed06547973de7557` | `SOURCE_IDENTITIES.json` |

Toolchain contract: `d37daa5bedc8ee357bea90f02ac2f8e34b8af243f1c16a149334dd3b666531e1`
(`SOURCE_IDENTITIES.json`).

Trial-7 (run 39082300586, attempt 1; source `65ccca1d534f5951120b5ddfe9d04b9288745d7e`,
request `7c03441e0872e0417762ea96d3b60a97be98a413`) identity:
- BuildKit tool image `ornigami-tool-buildkit:65ccca1d534f5951120b5ddfe9d04b9288745d7e`,
  image config `sha256:8dca6c9a2a63c363f6a946b28ee3d1dcdb7f45248e470ac3608ea156a848dc1b`.
- Frontend tool image `ornigami-tool-frontend:65ccca1d534f5951120b5ddfe9d04b9288745d7e`,
  image config `sha256:d63b52477262e8a132e3c20e061134eea067a1b7c506e4c68b848bdeb1f6c345`;
  frontend OCI manifest `sha256:57122ca6b725a0c96f2202b1a52ea896f8b470654a839e21990e02d6d872208c`;
  frontend binary `sha256:4c827ee5910208a1c8a530b8509d6a512e70a26b4ddb523efdcd7492669d84fc`.
- Trial-6 (run 39081325144) additionally recorded BuildKit config
  `sha256:fc20ac93782a4fe3ddb38c1387af8defa85b26a1559635d8dac1c9aeb41d2fc5` for the same assembled tooling.
- Eight compiled binaries hash-bound in `INDEPENDENT_REVIEW.json` (`compiledBinaries`): `buildkitd`,
  `buildctl`, `dockerfile-frontend`, `buildkit-cni-{bridge,firewall,host-local,loopback}`, `buildkit-runc`.
- Historical custody receipt summary (sanitized): the original archive was 2,504,167 bytes; 331 payload files / 18,408,011 bytes were hash/source/request/workflow bound before one owner custody acknowledgement. Exact archive digest, platform artifact identifier, per-file hashes and completed/status receipts remain in the protected private inventory/copies, not tracked documentation.
- Scope flags: `"scope": "tooling-only; not overall security acceptance"`, `"coverageHold": true`,
  `securityAcceptance: false` (in both custody records); observerRows 62; compiler peak
  2,848,010,240 bytes within 8 GiB/3 CPU/zero-swap; compatibility probe peak 126,009,344 bytes;
  compiler UID/GID 1001:1001 verified; module-cache cleanup exit 0; final cleanup read-backs verified
  exact owned builder/state-volume/tool containers/images/root absence with unchanged daemon projection.

Staging origin binding (built-time and runtime must match the approved profile):
- `deploy/coolify/build-profile.json`: `origin: https://staging.ornigami.com`.
- `linux-runtime-acceptance.sh` rejects a mismatching image-origin label before creating resources
  (hard equality against `https://staging.ornigami.com`).
- `scripts/framework-prototype/build-profile.mjs` exports `approvedOrigin = 'https://staging.ornigami.com'`;
  `tests/build-profile.test.mjs` rejects non-identical origins (path/userinfo/port/443 forms).
- Owner accepted `https://staging.ornigami.com` with existing Traefik and separate HTTPS BasicAuth
  (`build-profile-local-evidence/REVIEW.md`). The old rehearsal-origin image is rejected: public env
  variables are baked at build time, so `rehearsal.invalid` images cannot be promoted with runtime
  overrides.

## 6. Verification performed (as-run, not re-run) and reviewer commands

Recorded local verification (2026-10-18, 8 GiB-class machine, bounded budgets honored; serial
diagnostics 2 GiB/1 CPU, runtime budget 768 MiB/0.75 CPU/zero swap, 300-minute campaign ceiling
respected; no VPS compilation):

- Clean tree, branch mapping, and commit attribution (Section 2 commands).
- `sha256` checks of the identity files (Section 5 values), including the 44.9 MB framework tarball,
  matched the retained trial-7 `SOURCE_IDENTITIES.json` and the Dockerfile request bindings.
- Blob-level identity to `658537c` for every operative candidate file (Section 3 command; exceptions =
  the three documented reconciliations).
- `node --test` over the nine candidate-scope test files: `tests/build-profile.test.mjs`,
  `tests/toolchain-contract.test.mjs`, `tests/tool-image.test.mjs`, `tests/cleanup-owned-images.test.mjs`,
  `tests/owned-observation-race.test.mjs`, `tests/toolchain-cache-cleanup.test.mjs`,
  `tests/compiler-link-objects.test.mjs`, `tests/coolify-rehearsal-workflow.test.mjs`,
  `tests/coolify-runtime-acceptance.test.mjs` — **87 tests passing** on `e756606`.
- Workflow trigger audit: no dispatch surface from the readiness branch (Section 2).
- Conflict-marker and secrets scan of the tree: clean; no `.local/` recovery paths committed;
  compose proposal carries no credential values.

Reviewer re-run recipe (Windows PowerShell, local only):

```powershell
git -C . status --short --branch
git -C . log --oneline 92d819f..HEAD
git -C . range-diff f6e26a1..658537c 92d819f..HEAD
git -C . diff --name-only 658537c HEAD -- package.json package-lock.json next.config.ts Dockerfile `
  deploy/coolify/toolchain deploy/coolify/build-profile.json deploy/coolify/runtime-probes.mjs `
  deploy/coolify/PRIVATE_STAGING_PROPOSAL.md deploy/coolify/compose.private-staging.proposed.json `
  tests/coolify-runtime-acceptance.test.mjs .github/build-requests/ornigami.json `
  .github/workflows/ornigami-image-rehearsal.yml scripts/framework-prototype vendor
Get-FileHash -Algorithm SHA256 package-lock.json, vendor/build-tools/npm-11.21.1.tgz, `
  vendor/framework/next-16.4.2-ornigami-sri.2.tgz, deploy/coolify/toolchain/recipe.json, `
  deploy/coolify/toolchain/apk-lock.json, deploy/coolify/build-profile.json
node --test tests/build-profile.test.mjs tests/toolchain-contract.test.mjs tests/tool-image.test.mjs `
  tests/cleanup-owned-images.test.mjs tests/owned-observation-race.test.mjs `
  tests/toolchain-cache-cleanup.test.mjs tests/compiler-link-objects.test.mjs `
  tests/coolify-rehearsal-workflow.test.mjs tests/coolify-runtime-acceptance.test.mjs
```

Limits on this verification: it is local and static/behavioral only; it does not re-execute any Linux
trial or rebuild images, and it does not change any acceptance state (tooling-only acceptance remains
`false` for overall security; see Section 8 grid).

## 7. Operational implications and rollback

What flips on this branch:
- `Dockerfile` becomes the distroless/SRI candidate recipe: `# syntax=ornigami-frontend` with a
  recipe-bound local OCI named context (no registry fallback); signed-versus-exact distroless parents
  `gcr.io/distroless/nodejs22-debian13:debug-nonroot@sha256:b4b14a0dec7ab24661758de61f452cc1bed82619b8cf744000f2aae05c22aeb5`
  (build-base) and `...:nonroot@sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c`
  (runner); npm gate at `npm-11.21.1.tgz` hash; UID 1000 provisioning; build-arg gates
  (`ORNIGAMI_SOURCE_SHA` 40-hex, fixed heap/optimization flags, `ORNIGAMI_CONTAINER_BUILD=true`),
  rehearsal-only synthetic secrets (`AUTH_SECRET=rehearsal-only-synthetic-build-secret-not-for-use`,
  `rehearsal.invalid` provider placeholders) — build-time only, never for use.
- `next.config.ts` adds container-build gates keyed on `ORNIGAMI_CONTAINER_BUILD` (single CPU, memory
  optimizations, optional webpack worker) and enables `experimental.sri: { algorithm: "sha256" }`.
- Runtime expectations in `linux-runtime-acceptance.sh`: 768 MiB memory and swap caps (805306368 bytes),
  0.75 CPU (750000000 nano CPUs), pids 128, read-only rootfs, network `none`; staging origin label must
  equal the approved profile before any resource is created.
- `.github/build-requests/ornigami.json` and the rehearsal workflow are added on the branch but dormant:
  triggers depend on the experiment branch name (Section 2), so merging this branch to main introduces
  no runnable CI surface; a future trial must deliberately craft the request commit (Section 8).

Deployment artifacts: `deploy/coolify/PRIVATE_STAGING_PROPOSAL.md` +
`deploy/coolify/compose.private-staging.proposed.json` (unapproved preparation, hostile to activation by
design): app router on `staging.ornigami.com` through the installed proxy's existing HTTPS
entrypoint/resolver, app-scoped BasicAuth via
`${ORNIGAMI_PRIVATE_AUTH_USERS:?Set the approved staging-only bcrypt access record}` (no credential in
tree), forwarded-client header sanitization (`X-Real-IP`, `X-Vercel-Forwarded-For`,
`CF-Connecting-IP`, `Forwarded`) with fixed `X-Forwarded-Host/Proto`, `removeheader: true`,
`coolify` external network. It must be combined only with `compose.coolify.yaml`, never with the public
Traefik overlay; no unprotected parallel router (including Coolify-generated routing) may exist. Actual
acceptance must separately prove HTTPS/private-access denial, header/Host defenses, app login and tenant
isolation, resources, persistence and recovery; the local JSON syntax check is not a Compose render or
host pass.

Rollback:
- Compose-level: do not activate the proposal (it is inert); removing any rendered instance restores the
  published origin routing.
- Branch-level: `git checkout main` restores the "Inactive preparation" `Dockerfile`
  (`node:22.23.3-trixie-slim`) and un-couples the candidate platform files; document-level and tooling
  additions are inert.
- Scope guard: nothing here authorizes registry/DNS/SQL/schema/host/provider actions; no image was
  published and no accepted retained image exists; `rehearsal.invalid` images are non-deployable through
  the proposal regardless.

Maintenance debt noted deliberately: `deploy/coolify/runtime-probes.mjs` ships in the image but the
branch acceptance script no longer calls it (Section 3). This preserves byte-identity with the
candidate's Dockerfile while documenting a probe-adoption decision for the next trial (slim in-container
ambiguity gate kept, probe path available for re-enablement).

## 8. Bounded next-trial proposal and retention proposal

Acceptance grid after trial-7 (tooling-only, source `65ccca1d…`, this lineage):

| Stage | Result (trial-7) |
|---|---|
| `original-base`, `original-runtime-base` | passed (23 MEDIUM / 8 LOW each, preserved, unsuppressed) |
| `build-base`, `deps`, `builder`, `prod-deps`, `runner` | skipped (application-dependent roles) |
| `buildkit` tool | passed (410 pkgs: 2 UNKNOWN / 1 MEDIUM / 1 LOW) |
| `dockerfile-frontend` tool | passed (69 pkgs: 1 UNKNOWN) |
| nine-role aggregate / overall security acceptance | **false** (aggregate requires all roles) |
| compatibility probe (native Alpine RUN, network disabled) via real external frontend + rebuilt BuildKit/runc | passed (scratch-export marker) |
| resource observations | passed (peak 2,848,010,240 B; probe 126,009,344 B; zero OOM; zero swap; pids bounded) |
| Debian zziplib advisory-coverage hold (CVE-2026-111142/111141) | **open** |

Historical acceptance facts: trial-3 (run `39069347358`, source `f6e26a1`) previously passed the
application/runtime/browser/SRI application-dependent set on the pre-recovery lineage; trials 4–7
(runs `39079613841`, `39080624875`, `39081325144`, `39082300586`) passed tooling scans but skipped all
application roles. Campaign consumption: **7/7 dispatches, 39/300 charged minutes, zero reserved —
261 minutes remain**; the trial-7 extension was the owner-authorized one-dispatch extension.

Proposal (requires explicit owner authorization; nothing is dispatchable without it):
1. **One combined tooling + application + browser trial** at this branch's HEAD (or its documented
   successor), intended to close the combined acceptance: full nine-role application build/scans, the
   browser regression role, and the low-cost re-run of the four tooling roles against the bound official
   DB under the existing frozen-admission machinery. The combined form was chosen because the tooling
   side is already proven and cheap to re-run, while splitting tooling/application would spend two
   dispatches for one acceptance. Bound: a single workflow run, one request commit against the
   `.github/build-requests/ornigami.json` contract (the trigger branch stays
   `codex/ornigami-sri-local-prototype-f-20261016`; the request's `sourceSha` would be re-bound to this
   branch tip via the already-proven single-change request pattern). Any combined run that has to change
   content will do so through a reviewed commit on this branch first.
2. Declared-cap extension: with 7/7 dispatches consumed and 261 minutes unreserved, the campaign rule
   ("no further dispatch is authorized without an explicit cap extension") applies. A combined run must
   fit the workflow job's 40-minute timeout; the tooling portion has consistently charged ≤ ~7 minutes
   per trial, so the binding constraint is the application/browser roles. The trial proposal ships with
   the cap-extension request attached rather than embedded.
3. Retention proposal: continue the 28-file custody pattern for the branch (retained files remain
   byte-identical custody records plus this handoff); on a successful combined trial, add its
   `external-trial-<run>/` custody subset and fold its narrative into the retained
   `TOOLCHAIN_LINUX_RESULT.md`-style record; no deletions from origin (`7c03441` stays intact); journal
   the custody hashes the same way (original ZIP SHA-256 + payload-manifest verification before the single
   acknowledgement).

Constraints honored through the campaign: 8 GiB/3 CPU build, 2 GiB/1 CPU serial diagnostics,
768 MiB/0.75 CPU runtime budget, zero swap, 300-minute ceiling, no VPS compilation, no registry upload.
These observations do not guarantee headroom.

## 9. Remaining blockers (dependency order)

1. **CVE-2026-111142 / CVE-2026-111141 Debian advisory gap (external; highest priority).** No Debian
   advisory for either CVE (undetermined in bookworm/trixie/forky-sid, checked 2026-10-18); upstream
   zziplib fix not yet released; the exact official trivy DB therefore cannot route the advisories.
   Resolves when: upstream patches land → Debian publishes updates → the official DB is refreshed and
   the frozen-DB admission machinery consumes the new exact DB. Local alternatives (suppress, fork the
   DB, edit records) are prohibited by policy and not offered.
2. **Maintenance/community follow-up filing (requires third-party messaging authorization).** The
   upstream follow-up remains an unfiled draft (see Section 4); it should be filed once messaging is
   permitted, referencing the verified upstream paths, published dates, Red Hat Bugzilla 2553744 and
   osv.dev AZL-108272 — and explicitly without claiming any issue-number existence for the advisory.
3. **Combined-acceptance trial authorization (owner).** Section 8's single combined trial requires both
   an owner authorization for the cap extension (261 unreserved minutes are insufficient under the
   campaign rule) and a decision on the request/branch binding. This is the only remaining in-repo
   engineering path to close application-dependent acceptance for the recovered lineage.
4. **Merge/retention decisions (owner + reviewer).** Independent review of this handoff and the branch
   (Section 2 mapping), then a merge-authorization decision; retention/journal follow-ups follow the
   trial outcome (Section 8 item 3). Custodial authorization for extending evidence beyond the 28-file
   subset also rests here; the deployment proposal stays gated on its own keys
   (bcrypt record, BasicAuth env) and on the specialized acceptance items listed in Section 7.

## 10. Suggested ROADMAP/evidence updates (proposals only — nothing edited)

No ROADMAP.md, OPERATIONS.md or external campaign record was modified by this handoff. For a future
owner-approved update, propose these lines (handoff text only):

- ROADMAP.md (tooling/staging row, readiness state):
  "2026-10-18 — Tooling lineage recovered: `codex/ornigami-staging-readiness-20261018` recreates
  experiment `658537c` byte-identically (3 documented reconciliations) with 87 candidate-scope tests
  passing; handoff `docs/handoffs/ORNIGAMI_STAGING_READINESS_20261018.md`; gates open: CVE-2026-111142
  Debian advisory (undetermined in Debian 12/13/14), combined acceptance trial authorization."
- RELEASE_EVIDENCE.md (continuation row): note campaign state 7/7 dispatches, 39/300 minutes charged,
  261 unreserved minutes, combined-trial proposal pending authorization; readiness branch tip
  recomputed per handoff; custody retained at origin `7c03441` and in the readiness branch's 28-file
  evidence subset.
- Add a dated coverage-watch line for CVE-2026-111142/111141 with the re-check date and the unfiled
  upstream follow-up note ("do not cite a number for trivy-db until the issue actually exists").

Evidence limits for these suggestions: they quote only facts verified in Sections 2–5/8, avoid any
external-campaign edits, and require the owner's action before landing.

## Appendix — quick reference

- Branch mapping/identity commands: Sections 2 and 6.
- Provenance hash table: Section 5.
- Custody map: Section 3 ("Evidence custody — current tracking corrected per Block 4B"); origin-held remainder at `7c03441`.
- CVE details and scanner-gap evidence: Section 4.
- Workflow non-dispatch proof: Section 2 ("Workflow dispatch surface").
- Deployment gates and rollback: Section 7.
- Trial grid and campaign budget facts: Section 8.
- Dependency-ordered blockers: Section 9.

## Independent review notes — 18 October 2026

Review baseline: branch `codex/ornigami-staging-readiness-20261018`, HEAD `0f86241`.
**Disposition: changes required before merge or any further external trial.** These notes do not
authorize implementation, publication, dispatch, registry, DNS, SQL, deployment or provider actions.
The reviewer changed only this appended section; the original handoff remains above for provenance.

### Verified facts and review limits

- Initial working tree was clean. The selected operative-path comparison against `658537c` listed in
  Section 3 is empty. The recovered custody subtree contains 28 tracked files. The image workflow
  has a push/path/ref restriction to the historical prototype branch and no workflow_dispatch or
  schedule trigger. No local review finding contradicts those specific claims.
- Independently reran the nine test files listed in Section 6: 87 passed, 0 failed, 0 skipped,
  exit 0. These tests do not establish candidate runtime-image compatibility or combined acceptance.
- No image build, Linux trial, actual-host check, remote-publication audit or provider action was
  performed. This is a focused source/contract review, not an exhaustive review of every recovered
  toolchain implementation or archived payload.
- Fresh primary-source reads still show both Debian CVEs as undetermined:
  https://security-tracker.debian.org/tracker/CVE-2026-111142 and
  https://security-tracker.debian.org/tracker/CVE-2026-111141.
  This does not freshly verify the contents of any particular Trivy DB artifact.

### R1 [P1] Runtime acceptance is incompatible with the selected final image

`Dockerfile` selects the non-debug `distroless/nodejs22-debian13:nonroot` runner, while
`deploy/coolify/linux-runtime-acceptance.sh:131` executes `sh -c`, line 616 executes `id -u`,
and line 1055 executes `df` inside it. The runner stage does not copy these utilities from the
debug build stage. The UID command is an unconditional failure before the HTTP/native acceptance
can complete; cgroup capture also cannot run as written. Keeping main's old mechanics is not a
valid reconciliation for this changed runtime base.

Required: make the harness operate against the selected image using the existing Node probes or
an equivalently justified mechanism, preserving strict metrics, UID/GID and failure evidence.
Do not add shell utilities or change the image/security policy merely to hide the mismatch.
Add a meaningful regression for the actual harness-to-runtime command contract, including failures.
Source: https://github.com/GoogleContainerTools/distroless#debug-images.

### R2 [P1] Seven-format native acceptance was removed but remains required

The recovered `runtime-probes.mjs` implements `image-formats`, but the active runtime harness
never calls it and has no native-format failure gate. The workflow still requires
`runtime/native-image-formats.json` at `.github/workflows/ornigami-image-rehearsal.yml:766`.
Consequently, even after R1 is fixed, a successful harness cannot supply the required evidence and
the full workflow must reject it. Existing tests pass because fixtures synthesize this report or
stub runtime commands; their pass does not verify the producer/consumer contract.

Required: restore actual seven-format execution, platform/native evidence and failure propagation
on the candidate; cover missing/failed format evidence without weakening the workflow's gate.
Do not present removed checks as an intentional acceptable reconciliation in Sections 3/7.

### R3 [P1] Proposed combined trial still selects tooling-only execution

`deploy/coolify/toolchain/recipe.json:194` has `trialScope: tooling`; workflow lines 94–99 derive
the trial scope from that recipe, and application build/runtime/browser/aggregate steps require
`full`. Section 8's sourceSha-only request proposal against this HEAD therefore skips the intended
application acceptance. `tests/toolchain-contract.test.mjs` also pins the actual recipe to tooling.
The request contract additionally requires sourceSha to equal the request commit's first parent;
publishing an arbitrary sourceSha on the existing prototype head is not sufficient.

Required: prepare a reviewed full-scope successor (or a precise separately reviewable patch if
blocked), update relevant contract tests, enumerate every required role, and document an executable
source/publication/request ancestry plan. Distinguish the 24-minute work deadline from the 40-minute
job timeout. Keep all publication/dispatch gates closed and counters unchanged.

### R4 [P1] Evidence custody is not an accepted-image retention proposal

Section 8 item 3 retains logs and custody records; it never specifies retention of the accepted
application image. The current workflow has no registry publication path and cleans owned images.
The campaign therefore still lacks a concrete mechanism to preserve a passing ephemeral image and
independently pull it. This was an explicit deliverable, not a task to defer until after success.

Required: reconcile `ORNIGAMI_STAGING_DECISIONS.md` and the delivery plan into an exact conditional
image-retention proposal: private GHCR destination/access model, scoped publication/read identities,
explicit permissions and visibility, 2 GiB transferred/4 GiB retained bounds, all acceptance gates
before publication, tested-to-published config/layer/manifest equivalence, independent digest pull
and smoke checks, failure cleanup, and rollback availability. Keep evidence custody separate.
Prepare local code only where justified; do not create credentials, publish or pull registry images
under this review. Record exactly what owner authorization would later be needed.

### R5 [P1] Operational maintenance/recovery decision is still missing

Section 4 substitutes an upstream-message draft for operational ownership; Section 9 omits the
independent adoption hold. `ORNIGAMI_MAINTENANCE_DECISION.md` explicitly leaves backup operation and
security/advisory response unassigned. Filing an upstream report does not resolve those duties.
The active package replacement also remains an experiment, not accepted ongoing maintenance.

Required: assess a realistic solo-operator path, identify concrete duties, protected references,
restore/security-response gaps and supported fallback options, and record an explicit go/no-go.
Do not invent staff, unattended agent monitoring, an SLA, adoption approval or a mandatory new hire.
Reconcile stale framework/patch identities in external planning documents through proposed corrections
in this handoff, without editing external records. Coverage closure must retain all allowed routes
in `ORNIGAMI_SECURITY_CLOSURE.md`, including authoritative corrected/withdrawn/not-affected evidence;
do not claim an upstream release plus Debian update is the only possible resolution.

### R6 [P2] Raw recovery evidence was reintroduced into the tracked candidate

The branch adds `docs/handoffs/ornigami-coolify-20261016/**` with raw `run.log`, stdout/stderr and
ZIP custody payloads. The current roadmap says raw evidence stays private, and the original task
required references to protected evidence rather than copying raw material into Git. Historical
tracking at the experiment ref does not authorize restoring it to the consolidated candidate.
This finding is about the storage contract; no secret leak is asserted by this review.

Required: preserve and byte-verify necessary evidence in an owner-restricted Git-ignored location,
retain sanitized summaries/hashes/provenance pointers, and remove newly restored raw payloads from
the proposed tracked tree. Do not destroy the historical bundle, rewrite Git history or upload it.
Update custody statements to distinguish historical refs, private recovery and sanitized documents.

### Required follow-up handoff

Keep working on this branch. Address R1–R6 separately with focused checks, then append a response
mapping each finding to changed files, commits, verification and remaining external blockers.
Do not erase these review notes or turn an unresolved item into a pass. Retain the original deadline,
coverage/adoption holds, exhausted 7/7 dispatch allowance and provider/job/deployment boundaries.
The next reviewer needs exact final HEAD and candidate identities, a bounded proposal ready for
decision, and a clear statement that no combined image or actual-host acceptance is yet established.

## Block 1 response — 18 October 2026

This block addresses findings R1 and R2 only. Baseline: `0f86241` plus the reviewer notes above
(retained verbatim as commit `355c408`). No trial scope, runtime base, security gate, credential,
publication or provider state was altered. R3–R6 remain open and unimplemented.

### R1 — runtime command contract repaired

Changed file: `deploy/coolify/linux-runtime-acceptance.sh` (repair commit `82efefb`).

- Cgroup capture (`:132`): replaced the in-container `sh -c 'for path in …'` loop with
  `docker exec … node /app/deploy/coolify/runtime-probes.mjs cgroup`. The probe emits all ten
  `==key==\n<value>` metrics and exits nonzero when any is missing or empty. The post-capture
  required-metric check and `assert_cgroup_metrics` limits validation
  (`memory.max=805306368`, `memory.swap.max=0`, `cpu.max="75000 100000"`, `pids.max=128`,
  `oom/oom_kill=0`, positive peak) are unchanged.
- Runtime identity (`:613`): replaced `docker exec … id -u` with the `uid` probe, which fails
  unless runtime UID **and GID** are exactly 1000:1000; the `== 1000` host-side check remains.
- Runtime disk evidence (`:1089`): replaced in-container `df -Pk / /tmp /app/.next/cache … || true`
  with the `disk` probe (`fs.statfsSync` over `/`, `/tmp`, `/app/.next/cache`); the stale
  `|| true` was dropped so a failed in-container disk probe now fails the run. The host-side
  `df -Pk / "$report_root"` capture (runner VM, not the image) is unchanged.
- No in-container `sh`, `id` or `df` invocation remains; every other in-container command was
  already `node`-based and stays so.
- Preserved unchanged: container creation/restart/recreate sequence, cache-volume identity and
  persistence checks, Docker limit/security assertions, error-context recording, sanitized failure
  evidence (`failure.json`, `failure-evidence.txt`), receipt redaction, cleanup receipts and
  owned-resource removal.

### R2 — seven-format native acceptance restored

Changed file: `deploy/coolify/linux-runtime-acceptance.sh`. No workflow change; no workflow gate
was weakened or duplicated.

- New block (`:623–658`, after the tmp-write probe, before the inspect-limits check):
  runs `docker exec "$name" node /app/deploy/coolify/runtime-probes.mjs image-formats >…/native-image-formats.json 2>…/native-image-formats.stderr`,
  then sanitizes non-empty stderr into `native-image-formats-error.txt` and removes the raw file.
- Host-side structural validation of the receipt: `result=passed`; exactly seven checks in the
  order `png, jpeg, webp, avif, gif, tiff, svg-input`, each `passed`; runtime platform evidence
  `linux/amd64` plus node/openssl/glibc versions; non-empty `loadedNativeObjects`.
- Missing, empty, malformed, partial, failed or wrong-platform evidence each: record error
  context, write a `{result:"failed", exitStatus, diagnostic:"native-image-formats-error.txt"}`
  receipt over the invalid file, and set `native_formats_failed=true`.
- The final acceptance gate (`:1097`) now blocks on `native_formats_failed` in addition to
  cold-HTTP and image-cache persistence; the pass report records
  `native_image_formats_evidence=native-image-formats.json`.
- The semantics: `image-formats` performs six real encode→resize→decode round trips
  (png/jpeg/webp/avif/gif/tiff; AVIF additionally verifies AV1-in-HEIF metadata), one SVG-input
  transform, and platform evidence from process report plus `/proc/cpuinfo` (glibc, SSE4.2).
- Consumer contract: the workflow's `runtime/native-image-formats.json` collection-and-success
  requirement at `ornigami-image-rehearsal.yml:766` is preserved exactly; the harness now produces
  the required file so the gate no longer fails every successful run.
- Shipping path: the probe is copied into the runner at `Dockerfile:95`
  (`COPY … /app/deploy/coolify/runtime-probes.mjs`), is the only `deploy/coolify/**` object
  whitelisted by `.dockerignore`, and `sharp` (`package.json:61`) ships with the prod deps copied
  at `Dockerfile:85`.

### Regressions added

`tests/coolify-runtime-acceptance.test.mjs` (six new tests; file now has 11):

1. Static contract: the four probe invocations must exist, and in-container `sh`, `id -u`, `df`
   must not reappear.
2. Cgroup capture: logged probe invocation; complete counters pass; a metric lost from the
   output fails with `Cgroup metric … is missing`; a failing probe fails the capture.
3. Identity: logged uid probe; `1000` passes, `1001` exits with the UID error.
4. Disk evidence: logged disk probe; in-container `df -Pk` asserted absent; failing probe
   exits nonzero.
5. Native evidence: eight modes end-to-end — one executed passing receipt plus empty stdout,
   non-JSON, fewer than seven formats, a failed format entry, foreign platform, a probe exit 3
   with stderr, and a silent probe exit 7 — each asserting the failure receipt,
   `native_formats_failed=true`, a real nonempty sanitized diagnostic that the receipt reference
   resolves to, and no raw stderr left; the pass mode asserts the byte-preserved receipt, passed
   status, an unchanged false failure flag, successful continuation and no fabricated error
   evidence. *(Corrected in the Block 1 close-out below: the original text listed a pass mode and
   "seven modes" that were not executed and omitted the silent probe case.)*
6. Final gate: native-format failure alone exits nonzero with the retained-observations
   message; a fully checked pass completes.

### Checks and results

- `bash -n deploy/coolify/linux-runtime-acceptance.sh` → syntax OK.
- Nine candidate-scope suites, the same files the reviewer ran: `node --test
  tests/{build-profile,toolchain-contract,tool-image,cleanup-owned-images,owned-observation-race,toolchain-cache-cleanup,compiler-link-objects,coolify-rehearsal-workflow,coolify-runtime-acceptance}.test.mjs`
  → 93 passed, 0 failed, 0 skipped (review baseline 87 + 6 new regressions).
- Full tree `node --test tests/*.test.mjs` → 135 passed, 0 failed (the 41 external-scope tests
  from main included).

### Explicit limits

- **No Linux image was built and no container was executed in this block.** The runtime
  compatibility fix and native acceptance restore are contract restorations verified against
  deterministic probes and static extracts; Linux-image acceptance and actual-host acceptance
  remain **not performed**.
- The probe's in-image behaviour (including `sharp`'s native binding under the `nonroot` user
  and glibc/SSE4.2 reporting) is exercised by probes and validated structurally, but was not
  executed against a real Distroless image here; exercising it belongs to a future combined
  trial. **No combined trial is authorized: dispatch allowance is exhausted at 7/7 and any
  future combined trial requires explicit new owner authorization.** *(Phrase corrected from
  "still-authorized combined trial decision" in the Block 1 close-out below.)*

### Superseded reconciliation statements

- Original Section 3 recorded `deploy/coolify/linux-runtime-acceptance.sh` as intentionally
  diverging from `658537c` (main's in-container cgroup/id/df mechanics). R1 reverses that
  element: the harness once again uses the candidate's probe mechanics for cgroup, uid and disk.
  Post-fix differences versus `658537c` are strictly additive: (a) added host-side structural
  validation of native evidence (the candidate marked any exit-0 probe output as passed),
  (b) failure-gate label/message wording and a pass-path evidence pointer, (c) cosmetic flag
  ordering. The `.dockerignore` divergence remains unchanged.
- Original Section 7 listed the unused `deploy/coolify/runtime-probes.mjs` in the image as
  documented debt for the next trial. The harness half of that debt closes here; the remaining
  trial debt is unchanged and tracked under R3/R4.

### Remaining review findings (unchanged; not implemented in Block 1)

- R3 — `deploy/coolify/toolchain/recipe.json:194` still selects `trialScope: tooling`, so the
  Section 8 combined-trial proposal would still skip application acceptance; a reviewed
  full-scope successor plus request-ancestry plan is still required.
- R4 — no accepted-image retention mechanism yet (private GHCR destination/access model,
  publication gates, transfer/retention bounds).
- R5 — operational maintenance/recovery go/no-go owner decision still missing.
- R6 — current storage correction is recorded in Block 4B: three sanitized Markdown files remain tracked; 25 raw/structured payloads have verified owner-restricted private copies. Historical Git objects remain intact.

No new external residue was introduced: no dispatch, no image, no registry, no provider access;
campaign counters remain 7/7 dispatches and 39/300 minutes consumed with the no-further-dispatch
limit in force.

### Block 1 state

- Branch: `codex/ornigami-staging-readiness-20261018`.
- Commits this block: repair `82efefb`, reviewer-note retention `355c408`, this response (tip).
- Final HEAD: the commit appending this response is the worktree tip at close; its exact sha is
  in the Block 1 delivery message above the two pinned commit hashes. Worktree clean at close.
- Handoff path: `docs/handoffs/ORNIGAMI_STAGING_READINESS_20261018.md`.

## Block 1 independent follow-up review — 18 October 2026

Reviewed HEAD `f6cfd8dec46fc2290e2314cb28c9696adba1d7c1` against `0f86241`.
Initial worktree clean; changed implementation/test scope is limited to the runtime harness and
its tests. The Node-based cgroup/identity/disk calls repair the identified Distroless command
mismatch, and actual image-format execution plus the final native failure gate are restored.
R3–R6 remain open. **Disposition: two small follow-ups required to close Block 1.**

Independent verification: Bash syntax check passed; the nine candidate-scope test files passed
93/93, zero failures/skips, exit 0. This review did not repeat the broader 135-test run, build an
image, execute a runtime container or perform external actions. Only these review notes were edited.

### B1.1 [P2] Failure receipt can point to a nonexistent diagnostic

At `deploy/coolify/linux-runtime-acceptance.sh:644` and `:651`, failure receipts always name
`native-image-formats-error.txt`. That file is created at lines 654–657 only if the Docker probe
wrote nonempty stderr. With an exit-0 probe returning empty/malformed/partial/wrong-platform JSON,
the Python validator emits its reason to the outer harness stderr rather than the probe stderr
file. The failed native receipt therefore points to an absent file, and the invalid JSON is
overwritten. A probe exiting nonzero without stderr has the same dangling reference.

Required: retain a bounded, sanitized reason for both validator failures and silent probe failures,
and make each diagnostic reference resolve to a real nonempty file (or use an explicit truthful
alternative). Preserve existing sanitization and the fail-closed gate. Update the regression that
currently asserts the diagnostic file is absent for validation failures. Verify a silent nonzero
probe as well as malformed/partial evidence. No actual acceptance result should change to passed.

### B1.2 [P2] Claimed native-evidence success case is not executed

In `tests/coolify-runtime-acceptance.test.mjs`, the test named "native image format evidence gates
acceptance on every failure mode" builds `nativePassing` but its scenario loop includes only five
invalid-output cases and one nonzero probe case. It never includes a `passed` scenario.
Consequently `scenario !== "passed"` is always true and the success assertions are unreachable.
The separate final-gate test simply presets failure flags; it does not execute the successful
native producer/validator path. The Block 1 response's claim of seven modes including a pass is
therefore inaccurate.

Required: execute a valid seven-format receipt through the actual extracted native block, with
`native_formats_failed=false` initialized as in the real harness. Assert preservation of the valid
receipt, the passed status, an unchanged false failure flag, no fabricated error file, and successful
continuation. Retain the negative cases and correct the handoff's claims to match executed checks.

### Next bounded task

Address only B1.1 and B1.2 on the current branch. Append a short response with commits and focused
results; preserve all prior review notes. Do not start Block 2/R3 yet. Correct the phrase
"still-authorized combined trial decision" above to make clear that a future combined trial still
requires new authorization; the allowance remains exhausted at 7/7 dispatches. No image build,
external trial, publication, registry action, deployment or provider action is authorized here.

## Block 1 close-out response — 18 October 2026

This response closes B1.1 and B1.2 only, on the baseline `f6cfd8dec46fc2290e2314cb28c9696adba1d7c1`.
Reviewer notes above are retained verbatim (commit `6a8b194`). Block 2 and R3–R6 remain open.

### B1.1 — failed receipts now resolve to a real diagnostic (fixed)

Changed file: `deploy/coolify/linux-runtime-acceptance.sh` (close-out commit `bffe572`).

- The Python receipt validator now captures its own stderr to
  `native-format-validation.err` (`:624`), so a validator rejection retains its reason instead of
  emitting it only to the outer harness stderr.
- After the block: probe stderr (if any) is sanitized into `native-image-formats-error.txt`; the
  validator reason (if any) is sanitized and appended to the same file; if a failed receipt would
  still reference a nonexistent diagnostic (validator exit with no captured reason, or a silent
  nonzero probe), the harness synthesizes one truthful bounded line —
  `Native image format validation rejected the receipt; no reason line was captured
  (validator exit N).` or `Native image format probe failed with exit status N and wrote no
  diagnostic output.` — and routes it through the same `sanitize_file` bounding/redaction.
- Every failure branch therefore ends with `native-image-formats-error.txt` real, nonempty and
  sanitized, so each `{result:"failed", exitStatus, diagnostic:"native-image-formats-error.txt"}`
  reference resolves; the receipt overwrite on failure replaces invalid probe output with the
  truthful failure receipt while the validator's reason is retained in the diagnostic.
- Fail-closed behaviour unchanged: any failure still sets `native_formats_failed=true` and blocks
  the final gate; nothing on the success path changes to passed. Raw `native-image-formats.stderr`
  and `native-format-validation.err` are always removed after sanitization; the collected
  `native-image-formats-error.txt` stays bounded by `sanitize_file` (64 KiB read, 120 lines ×
  2000 chars) and the synthesized text is a fixed short template plus an exit status.
- Surfacing preserved: a nonempty diagnostic is still printed to the console once; probes that
  fail with stderr behave exactly as before.

### B1.2 — the passing receipt is now executed (fixed)

Changed file: `tests/coolify-runtime-acceptance.test.mjs` (same commit `bffe572`).

- The native-evidence regression (renamed "native image evidence executes the passing receipt and
  gates every failure mode") now runs eight scenarios through the actual extracted native block:
  `evidence-passed` (the valid seven-format receipt), the five validator rejections
  (empty, non-JSON, missing formats, failed format, foreign platform), a probe exit 3 with stderr,
  and a new silent probe exit 7 with no stderr.
- The pass path now asserts, as required: the valid receipt is byte-preserved
  (`readFileSync(...) === nativePassing`) and parses to the same object; the report records
  `native_image_formats=passed`; `native_formats_failed` stays `false` (flag marker asserted);
  execution continues past the block (`native_block_continued=true` asserted); no error evidence
  file is fabricated; no raw stderr/validation file remains.
- The failure paths now assert the diagnostic resolution required by B1.1: the error file exists,
  is nonempty, is bounded, and matches each scenario's specific reason (per-scenario patterns
  pin the validator messages and the synthesized silent-probe wording); the failure receipt's
  `exitStatus` matches the actual exit (1 for validator rejections, 3 and 7 for probes).
- Existing negative cases are retained: the still-sampled cgroup/identity/disk contract tests,
  the final gate test (native failure alone blocks; all-pass completes), the static no-shell
  contract, and the original phase/exit tests are unchanged and passing.

### Handoff corrections applied

- Regressions list item 5 corrected in place: it previously claimed "seven modes … pass" that were
  not executed; it now lists the eight executed modes and flags the correction.
- The phrase "still-authorized combined trial decision" in the Explicit limits section is
  corrected in place: no combined trial is authorized; the dispatch allowance remains exhausted
  at 7/7 and any future combined trial requires explicit new owner authorization.
- The "93 passed, 0 failed" claim remains accurate: the suite count is unchanged (11 tests in the
  runtime-acceptance file; the same scenario loop now runs 8 native modes).

### Executed checks

- `bash -n deploy/coolify/linux-runtime-acceptance.sh` → syntax OK.
- Focused: `node --test tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs`
  → 54 passed, 0 failed, 0 skipped (11 runtime-acceptance + 43 workflow).
- Broadened because the harness blob changed: the nine candidate-scope suites
  (`tests/{build-profile,toolchain-contract,tool-image,cleanup-owned-images,owned-observation-race,toolchain-cache-cleanup,compiler-link-objects,coolify-rehearsal-workflow,coolify-runtime-acceptance}.test.mjs`)
  → 93 passed, 0 failed, 0 skipped.
- No Linux image built, no container executed, no actual-host acceptance, no external actions;
  campaign counters remain 7/7 dispatches and 39/300 minutes with no further dispatch authorized.

### Remaining limits

- The in-image probe behaviour (sharp native binding, glibc/SSE4.2 reporting) is still verified
  only against fixture receipts and static extracts; exercising it needs a future combined trial
  under new authorization.
- B1.1's silent-probe synthesis is covered by the new exit-7 regression at the block level; the
  final gate and restart/recreate behavior are covered by their existing tests.
- Block 2 (R3–R6 responses) is not started in this close-out.

### Block 1 close-out state

- Branch: `codex/ornigami-staging-readiness-20261018`.
- Commits this follow-up: reviewer-note retention `6a8b194`, B1.1+B1.2 fix `bffe572`, and this
  response (tip; exact sha in the delivery message).
- Worktree clean at close; handoff path `docs/handoffs/ORNIGAMI_STAGING_READINESS_20261018.md`.

## Block 2 response — 18 October 2026

Addresses R3 only, on the reviewed baseline `24c1003bb5b109266a06d6a834db467e1dea7b91`.
Prior review notes retained verbatim. R4–R6 remain open, and **preparing full scope authorizes
no execution**: no push, merge, dispatch, image build, registry, credential, DNS, SQL, host or
provider action was performed; the request file still binds the historical tooling-only source.

### R3 — full combined scope selected on the candidate

- `deploy/coolify/toolchain/recipe.json` (`0f755e8`): `"trialScope": "tooling"` → `"full"` — a
  single-field change. `buildContractSha256` is untouched (`contractDigest` covers only the
  `contract` object), all pinned bases/binaries/apk/frontend expectations are untouched, and
  `loadToolchainRecipe` validates `full` as an allowed value
  (`scripts/framework-prototype/toolchain-contract.mjs:9`).
- `tests/toolchain-contract.test.mjs`: the real-recipe pin now asserts `trialScope === 'full'`
  (test renamed "…pins full combined scope…"), and `fixture()` forces the fixture recipe back to
  `trialScope = 'tooling'` before saving, so the historical tooling-only gate-CLI behaviour —
  `passed tooling prerequisites only` prerequisites, `tooling-only preflight` skipped
  application stages, aggregate still `failed` — remains covered on the fixture boundary.
- No workflow change is needed. The scope is derived inside `Validate inputs` from the
  **candidate tree** (`workflow:95–99`: default `full` when the recipe file is absent;
  `jq -er '.trialScope | select(. == "tooling" or . == "full")'` otherwise), so a marker-only
  request child cannot carry scope; the marker can only point at a source commit. With the
  candidate recipe at `full`, every application phase activates exactly as written:
  image build (`:318`), disconnected Linux runtime acceptance (`:409`), bounded browser
  regressions (`:449`), intermediate nine-role scan collection (`:573`), the complete all-stage
  security/native/resource aggregate gate (`:584`), build-resource cgroup rejection (`:592`),
  base advisory threshold (`:679`), evidence capture (`:691`), custody verification (`:928`)
  and owned cleanup (`:954`). The tooling-only branches (`tooling probe :306`, disabled
  application roles) remain available for any future tooling-only recipe value, and the
  `tooling-scope-status.txt` record (`:727`) continues to state
  `security_acceptance=false` / `coverage_hold=true` across scopes by design: the holds are in
  force regardless of trial outcome and are not claims about the aggregate gates.

### Enforcement preservation and verification (task 3)

Missing or failed required evidence cannot become a pass; this was verified by execution of the
existing candidate tests rather than new special cases:

- Aggregate admission: all nine required stages (`original-base`, `original-runtime-base`,
  `build-base`, `deps`, `builder`, `prod-deps`, `runner`, `buildkit`, `dockerfile-frontend`)
  must exist exactly once with unique valid names; every stage needs zero HIGH/CRITICAL with no
  suppressions; a missing parent scan stage fails the gate (`toolchain-contract.test.mjs`
  "parent scan/native/resource gates" failure test); step-gate steps run under `always()` with
  set -e so a failed collection fails the job instead of the summary.
- Runtime evidence: on a successful runtime outcome a missing/empty `runtime-http.json` or
  `native-image-formats.json` (plus the three cgroup files) marks `runtime_evidence_missing=1`
  (`workflow:751–773`) and fails; failure outcomes additionally require failure diagnostics
  (`:774–781`); Block 1 (B1.1/B1.2) guarantees the native receipt and its real diagnostic.
- Scan/resource/custody gates: zero-CRITICAL/HIGH base advisory threshold (`:689`), build-OOM
  and cgroup counter rejection (`:677`), owner local evidence custody check must pass before
  cleanup (`:928`), and owned builder/image cleanup is verified rather than assumed (`:954`).
- Historical tooling-only behaviour preserved: `tooling` remains a valid recipe value, the
  tooling probe and tooling-prerequisite writes branch on it, and the fixture-level test asserts
  the skip logic; the trigger branch and its historical trial evidence remain untouched.

### Focused results (verification)

- `bash`/JSON syntax: recipe parses as valid JSON; no shell files changed this block, so no new
  `bash -n` surface (Block 1's `bash -n` evidence is unaffected and unchanged).
- `node --test tests/toolchain-contract.test.mjs tests/coolify-rehearsal-workflow.test.mjs`
  → 52 passed, 0 failed, 0 skipped (contract 9 + workflow 43).
- Block 1 runtime/workflow evidence is reused unchanged: no runtime harness, probe or test file
  was modified in Block 2.

### Exact candidate identities (for a future trial decision)

- Recipe: new sha256 `ff6d35d96897a4a13b564a387d689b9aa32e7c2c0328650e5018e1aa7be9a9a9`
  (prior `505476d99302f481cf408ef85a70bef679b7651b102f590dbfa2db9737353548`);
  trialScope now `full`; all other recipe fields unchanged.
- Package lock: `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815` — unchanged,
  so the existing lock binding remains valid for the candidate.
- Workflow blob (git): `5013b5ef82e36c29105b821dc13cf93b842fa25e` — unchanged by this block.
- Build request file `.github/build-requests/ornigami.json`: unchanged, still
  `{sourceSha: 65ccca1d534f5951120b5ddfe9d04b9288745d7e, packageLockSha256: 4591e2dd…815}`
  binding the historical tooling-only source; Block 2 does not move it.
- Full-scope candidate commit: `0f755e8950f8c1c2cb9d40a2164fbf286c3f80b1` on
  `codex/ornigami-staging-readiness-20261018` (parent `24c1003…`). Later docs-only commits do
  not alter recipe/lock/workflow identities; the exact trial-time candidate is chosen by the
  authorizing owner at that point and bound into the marker.

### Future source/publication/request ancestry plan (documented, NOT executed)

All of the following is owner-authorized work in the future; nothing here has been executed.

1. Prerequisites before ANY preparation of a dispatch: explicit new dispatch authority
   (7/7 dispatches and 39/300 minutes consumed; 0 reserved; no automatic extension), an
   owner-decision path to resolve the CVE-2026-111142/111141 Debian coverage hold (fresh
   timestamps or zero counts do not waive it; no suppression/filter/mirror), the R4
   image-retention decision (private GHCR destination/access model and publication gates), and
   the R5 maintenance/solo-operator go/no-go. The delivery plan requires the combined trial
   "only after prerequisites and new dispatch authority", and the security closure explicitly
   notes no full trial is justified until those are resolved.
2. Candidate publication: publish the candidate commit (tree = this branch's reviewed tip at
   authorization time, including the full-scope recipe) to the trigger branch
   `codex/ornigami-sri-local-prototype-f-20261016`. A branch move that does not change
   `.github/build-requests/ornigami.json` does not trigger the workflow (paths filter
   `workflow:7–8`), so publishing the candidate is dispatch-inert.
3. Request commit: a single-parent, marker-only child R of the candidate that changes ONLY
   `.github/build-requests/ornigami.json`, with exact keys
   `{sourceSha: <candidate 40-hex sha>, packageLockSha256: 4591e2dd…815}`. Pushing R to the
   trigger branch is the only dispatch trigger. The workflow then enforces, at admission
   (`workflow:50–87,88–116`): push event on exactly that branch; `event.created == false`;
   repository `joserubiobejarano/Ornigami` public; `run_attempt == 1`; `github.workflow_ref`
   equals the workflow on that branch at that commit; request sha equals `github.sha`; request
   commit has exactly one parent equal to `sourceSha` and changes only the request file;
   `sourceSha` is an ancestor of the request; the committed package-lock blob hash equals the
   request value; candidate and request commit carry an identical workflow blob; detached exact
   candidate checkout is clean; required files present; recipe scope re-derived from the
   candidate (`full` now). Permissions stay `statuses: read` only
   (`workflow:10–11`); concurrency single-run group (`:13–15`).
4. Capacity and gate constraints carried into the trial: 8 GiB/3 CPU tooling build, 2 GiB/1 CPU
   serial diagnostics, 768 MiB/0.75 CPU runtime, zero swap, the 300-minute total ceiling,
   frozen-DB admission with zero-HIGH/CRITICAL thresholds and no suppression; role coverage is
   all nine scan roles, seven native image-format checks, nine browser groups,
   SRI/corruption and HTTP/auth checks, restart/recreation/cache identity, resources, custody,
   failure evidence and owned cleanup (delivery-plan acceptance exit).

### Work deadline versus job timeout (task 5) — corrected per B2.1

*(Corrected in place on 18 October 2026 per review finding B2.1. The superseded wording is
recoverable at commit `5085938` and is described in the review notes below.)*

- **Enforced phase bounds.** The 24-minute work deadline (`workflow:39`,
  `ORNIGAMI_WORK_DEADLINE_EPOCH = start + 1440 s`) is consumed as a hard, enforced bound by
  the BuildKit image build — `build_timeout = deadline − now` asserted positive (`:336–337`)
  and applied through `timeout --signal=TERM --kill-after=30s` (`:344`); the browser
  regression — `min(deadline − now, 900 s)` with an explicit ≥60 s floor (`:465–467`) applied
  through `timeout --signal=TERM --kill-after=20s` (`:477`); and the scan stages —
  `serial-scan-driver.mjs` bounds every spawned scan command by
  `min(180 s, remaining deadline)` and hard-fails when the deadline is missing, invalid or
  exhausted (`serial-scan-driver.mjs:12`, `:42`, with additional deadline-clamped ≤180 s
  waits at `:44` and `:79` and a hard-fail disk-reserve check at `:50`); the tooling probe
  bounds each wait the same way (`toolchain-probe.mjs:34`).
- **The runtime start check is not a timeout.** `workflow:416` checks once that ≥150 s remain
  before the runtime step may start — a pre-start admission condition that fails the step when
  violated — and then `:419` invokes the harness with no overall timeout or deadline argument.
  The harness does not consult `ORNIGAMI_WORK_DEADLINE_EPOCH`, and its per-request and
  per-operation timeouts are not an overall runtime budget: a slow or hung native probe or
  Docker operation inside the runtime phase can continue past the work deadline, bounded only
  by the job ceiling below.
- **The 40-minute job ceiling.** `timeout-minutes: 40` (`workflow:22`) is the only bound that
  covers everything the phase bounds do not: runtime overrun, and every tail step (evidence
  capture, summary, upload, custody verification, cleanup).
- **Cleanup and custody outcomes are execution-conditioned, not guaranteed.** `always()` on
  the tail steps expresses when they may run, not a reserved budget or a completion
  guarantee. Only two tail commands are individually bounded (`timeout 15s docker system df`,
  `:793`; `timeout 15s du -sb`, `:797`); the owned-cleanup step runs direct Docker
  inventory/removal commands without per-command timeouts. If the job is terminated at the
  40-minute ceiling, the artifact-upload, owner-custody and owned-resource-absence receipts
  are unproved and must remain unproved — they are missing, not satisfied.

Unresolved pre-dispatch risk (recorded, not fixed): runtime and tail budgeting are
unresolved. An overall runtime budget, per-step tail bounds or an explicitly reserved
collection window would be engineering changes to the harness or workflow and would require a
separately reviewed scope before any future run. This block implements none of them, and
nothing here authorizes a dispatch.

### Remaining gates

- R4 (accepted-image retention), R5 (maintenance go/no-go) and R6 (raw recovery evidence
  tracking) are open and were not addressed.
- The coverage/adoption holds, exhausted dispatch allowance, provider/host/deployment
  boundaries and the 300-minute ceiling remain exactly as before; nothing in this block implies
  that preparing full scope, or this document, authorizes executing the plan above.

### Block 2 state

- Branch: `codex/ornigami-staging-readiness-20261018`.
- Commits: R3 selection `0f755e8`, this response (tip; exact sha in the delivery message).
- Worktree clean at close; handoff path `docs/handoffs/ORNIGAMI_STAGING_READINESS_20261018.md`.

## Block 2 independent review — 18 October 2026

Reviewed HEAD `508593892bf472b1802f9647d897fd24215a3f6b` against `24c1003`.
The full-scope field change is correct; the contract hash and other recipe inputs are unchanged,
and the historical tooling-only fixture remains covered. Independently reproduced 52/52 focused
contract/workflow tests, zero failures/skips, exit 0; whitespace check passed. Recipe/lock SHA-256
and workflow Git blob match the Block 2 identities above. Initial working tree was clean. No
external action or implementation change was made in this review; only these notes were appended.

### B2.1 [P2] Timing/cleanup guarantees exceed what the workflow enforces

The Block 2 timing section says the 24-minute deadline bounds the resource-consuming window,
that the runtime start check prevents starvation of collection, that tail steps are individually
bounded, and that productive phases cannot consume the tail. These are stronger guarantees than
the implementation provides:

- `.github/workflows/ornigami-image-rehearsal.yml:416` checks for 150 seconds remaining once, then
  line 419 invokes the runtime harness without an overall timeout or deadline argument. The harness
  does not consult `ORNIGAMI_WORK_DEADLINE_EPOCH`; per-request HTTP timeouts are not an overall runtime
  budget. A slow/hung native probe or Docker operation can continue past the work deadline.
- Tail storage probes sometimes use `timeout 15s`, but not every collection/cleanup command does.
  The owned-cleanup step includes direct Docker commands. `always()` expresses execution conditions,
  not a reserved execution budget or a guarantee that cleanup completes before job termination.
- The 40-minute job ceiling bounds the job; a forced termination does not prove artifact custody,
  owned-resource absence or an orderly cleanup. Those receipts must remain unproved if interrupted.

Required follow-up is documentation only in this block: qualify the timing section to describe
the actual enforced bounds, identify runtime/tail budgeting as an unresolved pre-dispatch risk,
and state that any required engineering correction needs a separately reviewed scope before a
future run. Do not claim all tail steps are individually bounded or that the start threshold
guarantees cleanup time. Keep the successful scope selection and 52-test evidence intact.

No timeout implementation or dispatch is requested by this finding. Append a short response and
stop for review. R4–R6 and all existing coverage/adoption/dispatch holds remain open.

## B2.1 response — 18 October 2026

Documentation only, on the reviewed baseline `508593892bf472b1802f9647d897fd24215a3f6b`;
review notes retained verbatim in a separate retention commit.

- Corrected in place: the "Work deadline versus job timeout (task 5)" section of the Block 2
  response now carries a correction marker at its heading, and the superseded wording remains
  recoverable at commit `5085938`.
- The corrected statements were re-verified against the implementation this round:
  enforced build/browser/scan bounds (build `timeout` at `workflow:344`; browser `timeout` at
  `:477` with floor/cap at `:465–467`; scan commands deadline-clamped to ≤180 s each with a
  hard fail on a missing, invalid or exhausted deadline, `serial-scan-driver.mjs:12`/`:42`,
  additional clamped waits `:44`/`:79` and the disk-reserve hard fail `:50`;
  `toolchain-probe.mjs:34`) are now distinguished from the runtime start check — a one-time
  ≥150 s admission condition (`:416`) followed by a harness invocation with no overall timeout
  (`:419`), with the harness consulting no work deadline and per-request timeouts not
  constituting an overall budget — and from the 40-minute job ceiling (`:22`), which is the
  only bound on runtime overrun and on every tail step.
- Removed claims: that the runtime start threshold prevents starvation of collection, that
  every tail operation is individually bounded, and that the work deadline keeps productive
  phases out of the tail. The tail is now described truthfully: `always()` conditions are not
  budgets, only the two 15 s storage probes (`:793`, `:797`) are individually bounded, the
  owned-cleanup step runs direct Docker commands without per-command timeouts, and
  upload/custody/cleanup receipts must remain unproved if the job is terminated at the
  ceiling.
- Runtime/tail budgeting is recorded as an unresolved pre-dispatch risk; correcting it would
  be an engineering change requiring a separately reviewed scope before any future run. No
  timeout implementation was made in this block and none is requested by the finding.
- The full-scope scope selection (`0f755e8`) and the 52/52 focused contract/workflow evidence
  are untouched: no code, workflow, harness or test file changed in this correction, and the
  Block 1/B1.1 close-out evidence is unaffected.
- Verification: `git diff --check` clean; no test rerun (documentation-only change). No push,
  merge, dispatch, build, registry, deployment or provider action; R4–R6 and the
  coverage/adoption/dispatch holds remain open.

## Block 3 proposal — R4 conditional accepted-image retention

**Scope and status.** This is a documentation-only proposal for review. It addresses R4 only; R5 maintenance/go-no-go and R6 raw-recovery-evidence tracking remain open. It does not authorize a build, dispatch, registry operation, credential/account/package change, deployment or provider action. Campaign allowance remains exhausted at 7/7 dispatches, 39/300 charged minutes and zero reserved; coverage/adoption holds remain in force.

### Established facts

- The current rehearsal workflow has no registry publication or image-retention path and removes owned images. Its workflow-level permission is only `statuses: read` (`.github/workflows/ornigami-image-rehearsal.yml`). It does not declare `packages: write` or `packages: read`; there is no publication identity or separate pull identity in the workflow.
- Prior planning records say the existing CLI authentication lacks `read:packages` and `write:packages`; a package-list request returned 403. That does not establish package visibility or access. No token value was read or exposed, and no permission was changed.
- No accepted application image exists, and there is no verified rollback image. The previously observed 1.70 GB uncompressed image / 1.74 GB Docker archive is not a compressed-transfer measurement.
- B2.1 establishes that runtime is admitted once at a ≥150-second remaining-work threshold but has no overall timeout/deadline; the 40-minute job ceiling is the only overall bound on runtime overrun and tail work. `always()` does not reserve tail time or guarantee evidence upload, custody, cleanup or completion. Only two storage probes are individually bounded at 15 seconds; owned cleanup has direct Docker commands without per-command timeouts. On forced termination, custody and owned-resource absence remain unproved.

### Proposed choices (not verified access or approval)

- Destination: dedicated private package `ghcr.io/joserubiobejarano/ornigami-staging`, Linux/amd64, with immutable digest as the retained/deployment reference. Keep package access granular and owner-controlled. Because the source repository is public, do not rely on repository-linked inherited access; verify the package's explicit access list and anonymous pull rejection before any future eligible run. Proposed access is not evidence that the package exists, is private, or is accessible as intended.
- Publisher: the exact approved GitHub Actions workflow run using its repository-scoped `GITHUB_TOKEN`; the package ACL must explicitly allow the repository, while the reviewed workflow/job code constrains where that token is exercised. Add only `packages: write` at publication-job scope and `contents: read` only if the chosen checkout/action path requires it. Keep other jobs at their existing minimum permission. A protected, scoped publication credential is a fallback only if owner-approved and separately configured; never request or record its value. The current `statuses: read` permission is insufficient for publication and must not be changed under this review.
- Independent reader: a distinct owner-controlled, read-only deployment identity with package read access, kept outside the publisher job (prefer the eventual protected deployment secret/reference). For a clean independent pull-verification context, grant only `packages: read` to that identity. Do not reuse the publisher identity as proof of independent access.
- Conditional publication: owner approval must explicitly cover publishing and retaining the one exact image produced by the exact reviewed source tree, workflow, recipe, lock/tool/framework inputs and approved runtime origin, conditional on every gate below passing. The final digest may be unknown at approval time; the approval must name the immutable candidate contract and authorize only that single accepted output. No tag-only promotion, rejected diagnostic/tooling image, retry rebuilt from changed inputs, or unreviewed rebuild is covered.
- Publication gates, all required before upload: fresh compatible official vulnerability database with required coverage/adoption holds resolved; all nine required scan roles and seven image-format checks pass with zero HIGH/CRITICAL; production npm audit passes; complete native, HTTP/auth, CSP/SRI and corruption checks pass; all nine browser groups pass; restart/recreation/cache-persistence and resource limits pass; runtime/profile/source identities match the reviewed candidate; evidence is captured and failure state is clear. Historical tooling-only or earlier application passes do not substitute for this combined acceptance. A failed, incomplete, interrupted or rejected run may preserve non-image failure evidence under its separate custody rules but must not publish an application image.
- Bounds: at most 2 GiB cumulative compressed layer bytes transferred across publication and independent pull, measured from exact compressed layer blobs (sum of descriptor sizes; count every retransmission/retry again) and checked against the actual registry manifest before push and the pull plan before independent retrieval. At most 4 GiB retained in total across the newly accepted image and one compatible, independently verified rollback. Measure retained bytes by summing unique compressed layer blob sizes referenced by the retained manifests, plus manifest/config objects for quota accounting; check both byte totals and registry/package included quota/cost state before and after transfer. Check current included runner/artifact allowance and current GHCR policy at implementation time; historical “free” observations are not a current price/quota guarantee. Abort before transfer if either bound, quota, access, or zero-dollar condition cannot be verified; abort/stop if actual transfer or retention exceeds a bound or incurs/risks unapproved cost. Do not put image layers in Actions artifacts. Do not delete a rollback automatically to make room.
- Equivalence evidence: before upload, record the tested image ID, semantic config, local manifest/platform, each uncompressed layer diffID, compressed layer size/digest and source/build identity. After upload, record the immutable registry manifest digest, config digest, compressed layer digests/sizes, and compare semantic config and every uncompressed diffID to the tested image; verify each compressed blob digest against the published manifest. This links tested config/layers to published manifest without trusting a mutable tag. Separately preserve scan/SBOM, source, lock, framework/tool, DB, clock and recipe evidence.
- Independent verification: use the separate read-only identity in a clean isolated runner context to pull by immutable digest, check manifest/config/platform/layer digests and diffIDs, then run only a bounded smoke of the accepted runtime/native startup path without rebuilding. Bound the pull and smoke to an explicit implementation-time deadline inside the job budget. A tag lookup, publisher-side pull, or smoke against a rebuilt image is not independent proof.
- Ordering — **corrected per B3.1**: **Before dispatch**, resolve coverage/adoption and profile/source prerequisites, freeze the exact reviewed candidate contract, verify the planned transfer/retention maxima and pre-run access/quota/cost checks, and obtain explicit conditional owner authorization for that candidate contract, required gates, maximum bounds, publication and independent pull. Do not dispatch without that authorization. **During the run**, complete all acceptance gates and capture tested-image identities; measure actual compressed transfer, retained total, quota/cost and remaining bounded runtime/tail budget; then verify the already-existing authorization covers this exact candidate, every required gate and these measured bounds. If authorization is absent, ambiguous or does not cover them, do not publish and do not wait for approval: enter the failure path. Only after this match may the exact accepted image be published; then independently pull by digest and verify equivalence plus bounded smoke; durably record publication/pull evidence and verify durable custody; only on success follow the success cleanup sequence below. If a gate, publication, pull, smoke or custody check fails, use the failure sequence below. Keep the accepted image and any compatible verified rollback; no unattended deletion or global cleanup.
- Failure/abort behavior — **corrected per B3.2**: on failed acceptance, authorization mismatch, upload/publication, independent pull, digest/config/diffID comparison or smoke, immediately prohibit deployment/promotion and any changed-input retry. Record the exact candidate, known publication state/digest (or that it is unknown), measured transfer/quota state and bounded sanitized failure evidence. Within the pre-reserved tail window, attempt durable evidence custody and record whether it succeeded. After that attempt terminates, run the separately approved exact-owned ephemeral cleanup sequence below even when acceptance or retention failed; cleanup does not depend on a successful pull or new owner approval. **Ordinary retention failure with custody present:** clean only positively identified run-owned ephemeral containers, networks, volumes and failed/unaccepted local image/build resources covered by prior cleanup authorization; verify absence by exact IDs/ownership labels and record receipts. **Missing custody:** make the bounded custody attempt, preserve local evidence through that attempt, then perform only safe, positively identified exact-owned cleanup if already authorized; mark custody and cleanup receipt status explicitly, and do not claim durable preservation or success when absent. **Uncertain ownership:** do not remove the ambiguous resource; retain its identifiers and observations in available evidence, report cleanup unresolved, and leave it for separately authorized recovery. **Interrupted execution/job ceiling:** no further sequence step is guaranteed; missing publication, custody, cleanup or absence receipts remain unproved, and later recovery must use a separately authorized exact-owner path. This cleanup never deletes remote package versions or any accepted current/rollback image; record any known remote residue and its bytes as retained/unverified for later disposition. If there is no verified compatible rollback, record rollback unavailable; do not fabricate one, exceed the 4-GiB cap, or implicitly delete an existing accepted/rollback image to make room. If the cap cannot accommodate the proposed retained set, stop before upload for a new owner decision.
- B2.1 dependency: before implementation or any dispatch, a separately reviewed engineering change must establish an enforceable runtime bound and bounded/reserved collection, upload, independent-pull, custody and cleanup windows that fit the 40-minute ceiling. A one-time 150-second admission check is insufficient. Conditional approval must be decided before the runner starts; never wait indefinitely for chat/owner approval on a paid or expiring runner. If no safe remaining tail window exists, skip publication and preserve the retention failure as unresolved rather than weakening acceptance or claiming `always()` guarantees completion.
- Cleanup sequence (B3.2; success and failure): perform exactly one pass within the implementation's separately reviewed, explicitly reserved tail deadline: no promotion/publication retries, one bounded evidence-custody attempt on failure, at most one removal attempt per exact-owned ephemeral resource, and one absence read-back per target. Every operation must have an enforceable per-command timeout and stop by the reserved tail deadline; timeout is an incomplete result, not success. First stop promotion/publication retries and ensure bounded sanitized outcome facts are in the evidence bundle; second confirm and record the durable evidence/custody result (the failure path has already made its one custody attempt) while preserving the local evidence bundle through that attempt; third compare candidate cleanup targets against the run's pre-recorded exact resource IDs/ownership labels and the already-approved cleanup scope; fourth remove only matching ephemeral runner-owned resources; fifth read back those exact IDs/labels to verify absence and record each outcome. Never include registry package/version deletion, or deletion of any accepted current image or compatible rollback image (local or remote), in this sequence. On the successful path, enter this sequence only after acceptance, publication, independent pull/smoke and durable custody all pass; on the failure path, run it after the bounded custody attempt regardless of that attempt result. If custody fails, ownership is ambiguous, a command times out, or the job is interrupted, preserve available evidence, mark the affected receipt/unresolved resource explicitly, and make no success claim. Cleanup remains subject to B2.1's unresolved engineering risk; this proposal does not claim the current workflow can guarantee the sequence completes.

### Missing evidence and owner approvals

- Verify whether the proposed GHCR package exists; its private visibility, explicit granular ACL, owner control, anonymous pull rejection, publisher write access and independent reader access. None is established by the old CLI/API observations.
- Owner must approve the exact package/destination and ACL model; conditional single-image publication and independent read verification; the minimal job permission grant (`packages: write`, plus only necessary `contents: read`); the independent read identity and its protected reference; zero-dollar/quota criteria; exact cleanup behavior; and treatment of a run with no verified rollback. Any credential/account/package creation or ACL change is a separately scoped future action, not approved here.
- Before that approval is actionable, resolve the active security coverage/adoption holds, candidate/runtime profile and combined acceptance prerequisites; produce a reviewed source/workflow/recipe identity; and close the B2.1 runtime/tail-budget design. Current package size, included quota, billing state and policy must be checked at that time.

### Approval checklist

- [ ] Exact private GHCR destination, owner control, granular ACL, anonymous denial, and publisher/read identities verified.
- [ ] Owner approves the single-output conditional publication contract, required minimal permission change, separate read identity, no-cost/quota gates and bounded exact-owned cleanup.
- [ ] Security coverage/adoption and all combined application acceptance prerequisites are closed for the exact reviewed candidate.
- [ ] 2-GiB compressed-transfer and 4-GiB retained-image calculations, registry quota/cost and rollback compatibility are evidenced.
- [ ] B2.1 runtime and tail work have enforceable bounds; no runner approval wait is required.
- [ ] Independent digest pull, equivalence evidence, bounded smoke, durable custody and interruption behavior are reviewed.

### Future implementation checklist (separate scope; not authorized by this proposal)

- [ ] Review and approve exact source/workflow/recipe/profile identities and the minimal per-job permissions; implement publication and separate read-verification identity paths only in a reviewed change.
- [ ] Add preflight gates for acceptance receipts, exact image identity, compressed transfer, total retained bytes, access, current quota/cost and remaining bounded job/tail time; fail closed.
- [ ] Implement immutable-digest publication, manifest/config/layer/diffID evidence, separate-identity digest pull and bounded no-rebuild smoke.
- [ ] Implement durable evidence/custody receipts and exact-owned cleanup with explicit interruption outcomes; do not treat `always()` as a completion guarantee.
- [ ] Review focused workflow/contract tests and all failure-path evidence before any dispatch; obtain fresh owner dispatch and registry-operation authority after existing holds are resolved.
- [ ] Stop before any registry/account/credential/package operation unless its separately required owner authorization is in place. No registry operation, build, dispatch or test is part of Block 3.

## Block 3 independent review — 19 October 2026

Reviewed the uncommitted 49-line Block 3 proposal on HEAD
`430fa7bc1d1e0219f129a42f403accf6288e3b4e`. Only the handoff was modified before review;
`git diff --check` passed. The proposal covers the R4 destination/access, acceptance gates,
transfer/retention limits, image equivalence, independent pull, custody and implementation
dependencies. No tests, build, registry/account inspection or external mutation was performed.
Primary GitHub Container Registry/access documentation was read; actual package access and
credentials remain unverified. **Disposition: two documentation corrections before closing R4.**

### B3.1 [P2] Put conditional approval before the runner in the ordered procedure

The Ordering bullet currently puts passing acceptance at step 2 and obtaining conditional
approval at step 4, while the B2.1 dependency correctly requires approval before the runner starts.
The procedure is therefore inconsistent and could recreate an approval wait after an ephemeral
image is built. "Already-scoped" approval does not resolve the difference between obtaining
authorization and checking that existing authorization covers the exact tested output.

Required: separate pre-run prerequisites/owner authorization from in-run execution. Obtain
conditional authority against the exact reviewed candidate contract before dispatch; during the
run, verify that existing authority still matches the candidate, gates and measured bounds. If it
does not, do not publish or wait for new approval. Stop through the documented failure path.
The final image digest may be recorded after build; no human approval wait is introduced.

### B3.2 [P2] Define bounded cleanup when acceptance or retention fails

The happy-path ordering allows exact-owned cleanup "only then" after successful independent
pull and custody, but the failure bullet does not specify a terminal path for an ordinary,
completed upload/pull/smoke failure while the runner remains available. It discusses diagnostics
and interruption recovery, leaving the reader to infer whether cleanup must wait for successful
retention or a later authorization. Successful retention is impossible on that branch.

Required: add an explicit failure sequence: prohibit deployment/promotion; record exact known
publication state and bounded sanitized failure evidence; attempt the separately required durable
evidence/custody checks within the reserved budget; perform already-authorized, exact-owned
ephemeral-resource cleanup and read back absence, without waiting for successful pull or a new
owner decision. Distinguish failure/missing custody and ambiguous resource ownership from ordinary
retention failure; preserve evidence and report unresolved states under the existing custody
policy rather than inventing a success. Do not implicitly delete remote package versions or an
accepted/rollback image. Registry residue must be recorded as unverified, with its accounting and
later disposition explicit. A job killed before receipts still leaves outcomes unproved.

### Next bounded task

Correct B3.1/B3.2 in the proposal and append a short response. Preserve existing proposal and
review provenance through explicit correction markers/Git history. Documentation only: no
implementation, tests, registry operation, credential change, dispatch, build or deployment.
Keep R5/R6, B2.1 engineering risk and all coverage/adoption/dispatch holds open. Commit the
reviewed proposal plus corrections/review notes and stop for review. No new owner decision is
needed to prepare these corrections; actual external authority remains a future decision.

## Block 3 corrections response — B3.1/B3.2

Documentation-only corrections to the R4 proposal, preserving the independent review notes above:

- **B3.1 corrected:** conditional owner authorization is now a pre-dispatch prerequisite against the exact reviewed candidate contract, gates and proposed bounds. In-run checks compare that existing authorization with the exact candidate and measured bounds; a mismatch stops publication through the failure path, without waiting for a runner-side decision.
- **B3.2 corrected:** success and failure paths now have distinct, bounded evidence/custody and exact-owned ephemeral-cleanup sequences. Ordinary retention failure does not block already-authorized cleanup; missing custody is recorded as unproved; uncertain ownership is left untouched for separately authorized recovery; interrupted execution leaves absent receipts unproved. Remote package versions and accepted/rollback images are explicitly excluded from cleanup.
- B2.1 runtime/tail engineering risk remains unresolved. R5–R6, coverage/adoption holds and the exhausted 7/7 dispatch, 39/300 charged-minute, zero-reserved campaign allowance remain open. No workflow, registry, credential, build, dispatch, deployment or provider action was taken; no tests were run.

## Block 4A — R5 maintenance/recovery assessment

**Scope.** Documentation-only assessment of ongoing maintenance and recovery for the experimental framework/toolchain and private staging. R5 only; R6 raw-recovery tracking is not started. No operational adoption is inferred from test results or Jose's primary accountability. Coverage/adoption holds remain active; campaign capacity is exhausted at 7/7 dispatches, 39/300 charged minutes, zero reserved.

### Established facts and identity check

- The package lock is `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815` (also recorded unchanged in the handoff\'s Block 2 candidate identity section). The candidate contains the local Next package `16.4.2-ornigami-sri.2` at `vendor/framework/next-16.4.2-ornigami-sri.2.tgz` (44,857,205 bytes; SHA-256 `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f`) and patch `scripts/framework-prototype/next-16.4.2-sri.patch` (22,865 bytes; SHA-256 `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5`). Both local hashes match `ORNIGAMI_MAINTENANCE_DECISION.md` and the retained trial-7 source identities.
- `deploy/coolify/toolchain/recipe.json` declares build-contract SHA-256 `d37daa5bedc8ee357bea90f02ac2f8e34b8af243f1c16a149334dd3b666531e1`; recomputing the canonical contract digest with the repository's `contractDigest` function matched it. The recipe currently says `trialScope: full`. Its raw file SHA-256 is `ff6d35d96897a4a13b564a387d689b9aa32e7c2c0328650e5018e1aa7be9a9a9`; this is a separate file identity and must not be substituted for the embedded contract identity.
- That contract binds two experimental images/tooling roles, including BuildKit `v0.34.0-ornigami-exp.1`, the Dockerfile frontend, runc/CNI binaries, pinned Go/module/source/APK inputs, base-image digests and bounded build settings. These inputs, the custom Next package/patch, package lock and their compatibility/security evidence need change review and revalidation as a unit; they are not upstream-maintained releases.
- **Planning hash reconciliation:** no stale Next archive, Next patch or toolchain-contract hash was found in the four reviewed external records. The hashes in the maintenance decision match the checkout. Proposed clarification for future reconciliation: preserve those three values, identify the separate raw recipe-file hash when a whole-file identity is intended, and continue to label trial `39082300586` as tooling-only compatibility/security evidence—not application acceptance, a support commitment or adoption approval. Do not edit external planning records in this block.
- **Local provenance README — correction proposed per B4A.2:** `vendor/framework/README.md:3` currently lists stale archive SHA-256 `3ebe019c4b83a48469956f0ca255f03be22272599127c86d87e1e2daa3519a81` and patch SHA-256 `41708142d05f1d6ff1383b090a48c72fce09b69e25a44cd1586b39fa55580db6`. Propose changing only those documentation values to the verified archive SHA-256 `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f` and patch SHA-256 `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5`; preserve the README's local-experiment/no-adoption/no-SLA warning. The package and patch bytes were verified and are not changed here. This local README discrepancy is distinct from the correctly scoped finding that the four reviewed external planning records contain no stale framework hashes.
- Maintenance decision (18 October, “Accepted accountable primary” and “Still genuinely missing”) records Jose's primary accountability, while explicitly leaving backup operation and security/advisory response unassigned and operational adoption held. Delivery plan (“Go/no-go, fallback and launch handoff”) says primary accountability does not fill those duties. The explicit acceptance sources are `ORNIGAMI_MAINTENANCE_DECISION.md`, “Still genuinely missing” (a real backup operator and an actual person/service accepting security/advisory response), and `ORNIGAMI_DELIVERY_PLAN.md`, “Go/no-go, fallback and launch handoff” plus its post-staging checklist (primary accountability does not fill the gaps; independent backup/restore and monitoring are required). The delivery plan also requires a usable solo-operator procedure (“Done means”).
- No accepted application image, verified rollback image, deployed Ornigami staging application or demonstrated restoration exists in the reviewed evidence. Block 3 is a conditional retention proposal only. The staging origin is a planning model; DNS, credentials, rendered routing and deployment remain unexecuted. The Neon target is empty/unconnected and its existing LocalLift mapping must first be reconciled. B2.1 remains unresolved: the current workflow does not enforce an overall runtime bound or guarantee tail collection, custody, upload or cleanup; `always()` is not a completion guarantee.

### Responsibility and acceptance gaps

| Duty | Established ownership/evidence | Proposed solo operating arrangement (not accepted) | Missing evidence and explicit acceptance needed |
|---|---|---|---|
| Security/advisory review and update decisions | Jose is recorded as primary accountable owner, but primary accountability is not explicit acceptance of these operating duties. No monitoring cadence or response SLA is in place; the official coverage hold remains active. | One explicitly accepted operator checks official framework, toolchain, OS/base and application advisories weekly; records triage and affected pinned inputs; decides to hold/stop or request a bounded full revalidation. Review changes only against the exact source/lock/patch/recipe contract; no automatic update or silent fork. | The owner must explicitly accept the solo operator duty, weekly cadence, escalation/stop rules and lack of continuous response. Evidence of a real review log, decision path and changed-input validation remains absent. |
| Backup verification and restoration | No accepted backup/recovery procedure, restore evidence, accepted application image or verified rollback exists. | The same operator makes an encrypted off-host data/config/evidence backup before every release or destructive change, checks integrity after creation, and runs a restore rehearsal quarterly in an isolated target. Record source/image digests, config-reference inventory, backup identity, restore observations and smoke outcome. This is independent technical evidence if the backup is outside the live host/account and restore target is isolated; it is not independent human review. | No accepted backup destination/key reference, inventory, recovery artifact or successful restore/rollback receipt exists. Owner must accept responsibility for operating and testing the recovery path and the residual self-verification risk. |
| Protected credentials and recovery access | No staging credentials or deployment are established; no protected-reference inventory or recovery exercise is evidenced. | Keep secret values in an owner-controlled protected store. Maintain separate technical identities/permissions for routine release, read-only image pull, backup creation and elevated restore/break-glass; one operator may use these distinct roles, with elevation only for recovery and an auditable access record. Keep a separately recoverable encrypted key/reference path that is not stored only on the host. | Exact references, owners, expiry/rotation and recovery steps are not inventoried or exercised. Owner must accept the role access model and loss/compromise recovery procedure. No secret values belong in this handoff. |
| Monitoring, incident response and stopping exposure | No accepted staging monitor, responder or availability commitment exists; no application is deployed. No unattended Codex monitoring is offered. | The same operator checks staging health and protected-access boundaries weekly and reviews official advisories at that cadence; this is manual monitoring, not continuous surveillance or an SLA. On a credible critical vulnerability without a validated fix, suspected credential compromise, image/config provenance mismatch, failed integrity/restore check, or unexpected exposure, stop staging exposure using a previously tested and authorized stop path, preserve sanitized evidence, and do not resume until the relevant gate is re-established. | The stop path, signals, access and evidence procedure have not been exercised on an accepted deployment. Owner must accept the manual cadence and the possibility that an incident between checks is detected late. |
| Accepted-image retention and compatible rollback | R4 defines a conditional private-GHCR proposal only. No package/access verification, accepted image, independent pull, restore proof or compatible verified rollback exists. | After all holds/gates and explicit R4 approval, preserve the exact accepted image by immutable digest and one compatible independently pull-verified rollback when available. The operator uses a separate read-only pull identity and checks custody/restore evidence; no automatic deletion. | R4 owner authorization, package/access/quota evidence, accepted image, successful independent digest pull and restore/rollback evidence remain missing. B2.1 runtime/tail risk also remains unresolved and cannot be waived by this proposal. |

### Solo-operator proposal and recommendation — corrected per B4A.1

The practical choice is one explicitly accepted operator with separated duties and technical access roles, or the existing operational-adoption hold. The current portfolio instruction does not require a second human. `VPS_DELIVERY_PLAN.md`, “Scope and operating discipline,” directs: “Do not repeatedly ask Jose to name staff he has said do not exist. Present concrete solo-operator maintenance/recovery choices and their residual risk for explicit acceptance; do not invent a second maintainer or silently waive the current operational-adoption hold.” The application maintenance decision requires actual acceptance of security/advisory responsibility and a real backup/recovery duty; it does not expressly say those duties must be assigned to different people. A sole operator can be the actual accepting person if the owner explicitly accepts that arrangement. This assessment does not assign duties to Jose or infer acceptance from his recorded primary accountability.

**Option A — solo operator, for explicit owner acceptance.** The owner designates one operator to perform the weekly advisory and health review, maintain the change/stop log, create and integrity-check encrypted off-host backups before releases or destructive changes, run a quarterly isolated restore rehearsal, and use separate least-privilege technical roles for release, read-only pull, backup and break-glass restore. The operator stops exposure on the trigger conditions in the table, records the incident and recovery state, and resumes only after the affected security, integrity and acceptance gates pass. At each review, the operator checks protected-reference availability and expiry; rotate or recover access through the documented protected path, never through values copied into logs or this handoff. An actual retained image/rollback and data/configuration restore receipt are prerequisites before claiming recoverability.

This option has explicit limits: it provides no 24/7 monitoring, no response SLA, no independent human review, and no cover while the sole operator is unavailable or incapacitated. A weekly manual check may miss an issue for days; loss of the operator’s access or capacity can delay stopping exposure and restoration indefinitely. Separate credentials and clean-target restore evidence improve technical separation but do not create another person. The owner must explicitly accept these duties, cadence, access model and absence/incapacity risks; acceptance alone does not substitute for actual backup, restore, image-retention or staging evidence.

**Option B — maintain the existing hold and use the allowed fallback.** Do not operationally adopt or expose the experimental stack while duties or evidence remain unaccepted. Continue only bounded independent preparation. Prefer supported upstream inputs after they pass the same full validation matrix; if the portfolio cutoff is missed, follow the already documented all-three-app Vercel transition decision with its own migration, cost and cutover approvals. No automatic transition is authorized.

**Recommendation remains NO-GO** for operational adoption and private staging readiness until an option is explicitly accepted and the required evidence exists. For Option A, the owner must explicitly accept that one operator performs the enumerated duties and risks, rather than merely confirm primary accountability. Still missing are the protected backup/key references and access-recovery exercise; at least one successful isolated data/config restore; accepted-image custody and independent pull; compatible rollback/restore evidence when available; an exercised stop-exposure path; and resolution of coverage/adoption and B2.1 engineering holds. No second human is required by the cited portfolio instruction, and none is being invented here. If the owner does not accept Option A’s limits, Option B preserves the hold.

### Supported fallback paths already in the delivery plan

If no acceptable operational-ownership path exists, the delivery plan says to report that boundary and use supported upstream/portfolio options; do not create another supply chain or polish an unsupported fork. Prefer supported upstream corrections and retire maintained replacements only after equivalent official inputs pass the same full validation matrix. If the staging cutoff is missed, the documented portfolio fallback is the all-three-app Vercel transition decision, with its own exact scope and remaining gates; it is not automatic and authorizes no live-service change. These are planning options, not actions taken or adoption decisions.

## Block 4A independent review — 19 October 2026

Reviewed HEAD `76a6dfda535470d7323eb7ed5b3d98850f1248af` against `f0b7608`.
Initial working tree clean; only the handoff changed. Whitespace check passed. Independently
verified archive/patch/lock/recipe file hashes and recomputed the declared toolchain contract
digest; the values in Block 4A match the current bytes. No test suite or external action was run.
The present NO-GO conclusion is supported by unaccepted operational responsibilities and absent
recovery/image evidence. **Two assessment corrections remain before closing this block.**

### B4A.1 [P1] Present concrete solo-operator choices instead of a staff-or-fallback binary

`C:/Users/joser/Desktop/VPS/VPS_DELIVERY_PLAN.md:43` explicitly instructs:
"Do not repeatedly ask Jose to name staff he has said do not exist. Present concrete solo-operator
maintenance/recovery choices and their residual risk for explicit acceptance; do not invent a
second maintainer or silently waive the current operational-adoption hold."

The assessment instead proposes an operator independent of the primary release decision and asks
the owner to identify an independent person/service or take a fallback. The cited application
documents require real accepted backup/security duties and independent recovery/verification,
but the quoted passages do not explicitly require a different human from the primary. Treating
that as an established separation-of-personnel rule is an unsupported interpretation. The generic
alternative "change the current independent-responsibility acceptance" is not a practical solo
operating option and does not satisfy the portfolio's instruction.

Required: read the portfolio plan alongside the maintenance decision; distinguish independent
copies/restore verification, separate technical access roles and accepted duties from distinct
people. If a separate-human requirement is retained, quote its exact authority and mark any
ambiguity rather than inventing it. Present at least one concrete solo-operator proposal with
backup/key custody, bounded security/health review, restore/recovery checks, absence/incapacity
limits, stop-exposure rules and residual risks, alongside the already permitted hold/fallback
choice. Describe duties Jose would need to explicitly accept without assigning them now or
claiming the proposal closes restore/adoption evidence. Keep NO-GO until required acceptance
and evidence actually exist. Replace the staff-or-fallback owner question with a decision on
these concrete choices; do not ask for a decision before the options are reviewable.

### B4A.2 [P2] Record the stale local framework provenance README

The "no stale hashes in the four reviewed external records" statement is scoped and need not be
retracted. However, local `vendor/framework/README.md:3` still advertises archive SHA-256
`3ebe019c4b83a48469956f0ca255f03be22272599127c86d87e1e2daa3519a81` and patch SHA-256
`41708142d05f1d6ff1383b090a48c72fce09b69e25a44cd1586b39fa55580db6`, unlike the actual files and
Block 4A's correctly measured `ba4c69f5...fff17f` / `7d38e144...57f5`. The provenance assessment
should flag this discrepancy and propose the exact documentation correction. This is not evidence
that the verified package bytes changed or that the external maintenance record is stale.

Required follow-up remains documentation only in the handoff: record the local README discrepancy
and proposed correction, without changing dependencies, package bytes, external planning records
or the README in this block. No adoption, policy change, role assignment, implementation or
dispatch is authorized by these review notes. Preserve R6, B2.1 and all independent gates.

## Block 4A corrections response — B4A.1/B4A.2

Documentation-only corrections to the R5 assessment; the independent review notes above are preserved:

- **B4A.1 corrected:** replaced the second-person-or-fallback framing with a concrete solo-operator option, including weekly manual advisory/health reviews, pre-change encrypted off-host backup and integrity checks, quarterly isolated restore checks, protected key custody, distinct technical access roles, stop-exposure triggers, and explicit absence/incapacity limits. The existing hold/upstream/Vercel fallback remains available. No duties are assigned to Jose; the NO-GO remains until the owner explicitly accepts the duties/risks and required recovery/adoption evidence exists. The portfolio instruction does not require different people; technical and evidence independence is distinguished from human separation.
- **B4A.2 corrected:** recorded the stale hashes in `vendor/framework/README.md` and proposed exact verified replacements. The README, package bytes and external planning records were not changed. The statement about the four external planning records remains limited to those records.
- R6, B2.1 engineering risk, coverage/adoption holds and exhausted campaign allowance remain open. No tests or external actions were performed.

## Block 4B — R6 response

**Disposition: current-tree storage correction completed; historical evidence preserved.** This block addresses only R6 storage in the proposed tracked tree. The 28 files present at the reviewed starting HEAD were classified by content and type; all were copied before removal.

- **Retained tracked:** three reviewed Markdown summaries/reviews: `docs/handoffs/ornigami-coolify-20261016/TOOLCHAIN_LINUX_RESULT.md`, `build-profile-local-evidence/REVIEW.md`, and `external-trial-39082300586/REVIEW.md`. Their custody wording now points to protected copies. Exact private archive digest and platform artifact ID were removed from the tracked custody summary; sanitized trial counts/results and scoped source provenance remain.
- **Removed from current tracking after copy verification:** 25 files: 18 structured JSON execution/provenance/custody/API/resource records, one `.log`, two `.stdout`, two empty `.stderr`, and two `.zip` payload archives. No JSON was retained solely because it was JSON; the reviewed narrative files are the only items retained under the evidence subtrees.
- **Protected custody:** `C:\Users\joser\Desktop\Projects\Ornigami\.local\recovery\ornigami-r6-private-evidence-20261019\original-tree\` preserves the original relative paths and all 28 original files. `INDEX.json` in the same private root maps original paths to protected destinations and stores per-file byte counts, worktree SHA-256 values, Git blob/path-filter object IDs, text attributes, content classification, copy verification and aggregate ZIP member metadata. It contains no payload contents and is Git-ignored.
- **Verification:** all 28 original-to-copy byte counts and SHA-256 values matched before deletion and were rechecked after deletion. The source was the absolute workspace path `C:\Users\joser\Desktop\Projects\Ornigami\docs\handoffs\ornigami-coolify-20261016\`. The protected destination resolved inside `.local/recovery`; its directory, copied files and index have an owner-only ACL with one allow entry for the current account. The source tree had broader inherited ACLs. `git check-ignore` confirmed the root `.gitignore` rule `/.local/` covers the private files and index.
- **Git identity distinction:** worktree SHA-256 is the byte-copy check. Git blob object IDs and path-filtered IDs are separately recorded in the private index. The two nested evidence subtrees have `.gitattributes` `-text`; the top-level `TOOLCHAIN_LINUX_RESULT.md` uses default text handling with `core.autocrlf=true`. No Git blob ID is presented as a worktree SHA-256.
- **Historical provenance:** the starting commit and prior Git objects/refs, experiment-origin evidence, recovery bundles and existing archives were not rewritten, deleted or pruned. Raw material may still be reachable through those historical refs by design; this R6 response only removes it from the current proposed tracked tree. References in earlier handoff notes to original receipts/files are historical pointers; the Section 3 custody map distinguishes the current tracked summaries from the new private copies.
- **Sanitized result and limitations:** 3 narrative/review files remain tracked; 25 raw/structured files have verified private copies. This is a same-workstation, owner-ACL copy; device encryption, off-host replication, future readability and independent human verification were not established. The protected inventory is the detailed private path/hash record. The roadmap and external campaign records were not changed.

No application tests were needed. No R6-adjacent implementation, provider, registry, dispatch or deployment action occurred. Coverage/adoption holds and the exhausted 7/7 dispatch, 39/300 charged-minute, zero-reserved campaign allowance remain active. R5, R4 and B2.1 remain as previously recorded.

## Block 5A — runtime deadline

**Scope:** enforce an overall deadline for runtime acceptance only. This does not close B2.1's separate overall tail-budget risk and does not claim actual Linux-image acceptance.

- **Admitted workflow behavior:** the runtime step now rejects missing, malformed, exhausted, or less-than-150-second `ORNIGAMI_WORK_DEADLINE_EPOCH` input before invoking the harness. The workflow continues to use the existing 24-minute work deadline; no workflow permissions, acceptance gates, or campaign allowance changed.
- **Deadline calculation:** the harness requires `ORNIGAMI_WORK_DEADLINE_EPOCH` for both admitted and standalone use. It derives the acceptance cutoff as the supplied work deadline minus a fixed 120-second harness cleanup reserve. At the workflow's 150-second admission floor this leaves at least 30 seconds for acceptance; less time is rejected. The original work deadline is the harness cleanup cutoff. A standalone invocation without a valid epoch, or with less than 150 seconds remaining, fails before runtime work and must not be treated as an acceptance attempt.
- **Bounded work and termination:** each Docker CLI call is clamped to the earlier of 20 seconds or the active phase deadline, with TERM followed by KILL after two seconds. Runtime-phase Docker command timeout is a failing acceptance condition even for diagnostic calls whose ordinary errors are tolerated. The existing seven-format/native, HTTP/auth/SRI, resource, restart/recreation, and cache checks remain required; timeout cannot pass a gate. The 120-second reserve bounds only the harness's own diagnostic/cleanup phase, not later workflow evidence collection, upload, custody, or cleanup steps.
- **Owned-resource handling and evidence:** runtime container and cache-volume creation carry a unique run identity. If `docker run` is interrupted before returning its container ID, cleanup may recover identity only by matching the run label and exact inspected image ID; the volume is removable only when its run label matches. Removal continues to use exact IDs/names and is followed by daemon inventory read-back. Mismatched or unavailable identity is preserved, not removed. The report records the runtime deadline, cleanup deadline, timeout flags, and cleanup outcomes. If forced termination, daemon uncertainty, or the outer job cutoff prevents diagnostic custody or authoritative absence read-back, those outcomes remain unproved and the attempted acceptance fails; available runner logs and receipts do not convert missing cleanup evidence into success.
- **Verification:** Bash syntax check passed for `linux-runtime-acceptance.sh` and `runtime-deadline.sh`. The combined focused command `node --test tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs` passed 58/58 (14 runtime-harness tests and 44 workflow tests), including normal helper completion, missing/invalid/exhausted budget rejection, actual TERM-resistant child termination, interrupted container identity recovery, and existing runtime/cleanup gate regressions. `git diff --check` passed. No image build, workflow dispatch, deployment, registry operation, or application test sweep was performed.
- **Remaining limitation:** B2.1 remains open. The new reserve does not prove that workflow-level evidence capture, artifact upload, custody, or later owned cleanup complete within the 40-minute job ceiling; `always()` is not a completion guarantee. An interrupted runner may still leave those receipts missing. No tail-budget redesign or retry behavior is included.

Implementation commit: `1c6348f941f5b1f5aa42523f578ba0b2cd621496`. This Block 5A handoff update is committed separately; both commit IDs are reported in the final status. Coverage/adoption holds remain active, campaign allowance remains exhausted at 7/7 dispatches, 39/300 charged minutes, zero reserved, and no actual Linux-image acceptance is claimed.

## Block 5A independent review — 19 October 2026

Reviewed HEAD `62e3efb2b8cec245bd3f9b88003e4e7a9ee51012` against `a7dc37c`.
Initial worktree clean. Independently reproduced 58/58 runtime/workflow tests with zero
failures/skips; both Bash syntax checks and the whitespace check passed. No Docker daemon,
container/image, external workflow, provider or registry action was used in this review.
Only these review notes were edited. **Disposition: implementation follow-up required.**

### B5A.1 [P1] Per-Docker-call timeouts do not enforce an overall phase deadline

`runtime-deadline.sh` computes cutoffs but has no phase-wide watchdog/supervisor. Only callers
of `ornigami_deadline_run` are interrupted. In the harness, Docker and the health-check sleep
use that helper; host-side Python validation/receipt generation, sanitization, host filesystem
commands and other shell work do not. An unresponsive host-side child can therefore run beyond
the runtime cutoff or the claimed 120-second harness cleanup cutoff. The final runtime check
only detects lateness if execution eventually reaches it. In cleanup, setting the helper phase
does not bound the intervening Python/sanitization work either. This is distinct from the already
deferred outer workflow tail: the harness itself is not globally bounded yet.

Required: enforce a real overall runtime cutoff and a bounded harness termination/cleanup window,
covering host-side work and child processes as well as Docker CLI calls. Preserve identity-fenced
cleanup and truthful missing-receipt outcomes when a hard stop prevents completion. Do not assert
that killing a Docker client proves its daemon-side exec stopped or that resources were removed;
use exact-owned cleanup/read-back or record those facts as unproved. Add short, real-child
regressions for stuck host-side work during acceptance and cleanup, not only a direct helper
invocation. Keep outer workflow tail redesign outside this follow-up.

### B5A.2 [P2] Timeout accounting is lost across command substitutions

The timeout helper sets shell variables, but many actual invocations execute under `$(...)`,
including image/identity inspection, health state and cleanup inventories. Bash runs these in
subshells; their variable assignments do not update the parent. A local reproduction using the
actual helper and a one-second cap produced:

`substitution_exit=124 parent_command_timeout=false parent_deadline_timeout=false`

The existing TERM-resistant-child regression invokes the helper directly, so it does not detect
this. Required command failures may still fail acceptance through their exit status, but timeout
flags written to the report/cleanup receipt can falsely remain clear. Do not equate this with
proof of a passing acceptance; it is a concrete timeout-accounting/diagnostic defect.

Required: propagate timeout observations reliably to the parent across the actual invocation
forms, preserving stdout for JSON/identity output. Add regressions for a timed-out command
substitution and an actual harness receipt/failure path, alongside successful substitutions.
Keep ordinary tolerated command errors distinct from timeouts and preserve fail-closed behavior.

### Required bounded follow-up

Address B5A.1/B5A.2 only on this branch; append a response with focused checks, changed behavior,
commits and remaining limitations. Preserve previous review notes. No new external action,
image build, workflow dispatch, registry operation, resource/policy expansion or deployment.
All coverage/adoption/dispatch holds and the separate outer tail-budget risk remain active.

## Block 5A corrections response — B5A.1/B5A.2

- **B5A.1 corrected:** the harness now runs its complete acceptance worker under a phase-wide
  supervisor. It reserves the existing 120-second harness cleanup window and bounds worker
  termination with TERM followed by KILL. Host-side work and child processes are in the supervised
  process group; the cleanup phase itself is included. Forced termination fails acceptance. If a
  Docker CLI operation times out, cleanup receipts mark affected resource absence as unproved:
  killing the client does not establish that daemon-side work stopped. Exact identity-fenced cleanup
  and daemon read-back remain required where execution permits.
- **B5A.2 corrected:** command and supervisor timeout observations are appended to a private
  out-of-band state file and synchronized by the parent, so command substitutions retain their
  stdout while timeout accounting survives subshells. Ordinary nonzero exits, including an ordinary
  exit code 124, remain distinct from timeout events. Timeout/interruption fields reach failure and
  cleanup receipts when those writers can complete.
- **Focused verification:** `node --test tests/coolify-runtime-acceptance.test.mjs
  tests/coolify-rehearsal-workflow.test.mjs` passed **61/61** (17 runtime and 44 workflow tests),
  including real stuck children during acceptance and cleanup, stdout/timeout substitution cases,
  ordinary failure distinction, and a timed-out substitution producing a truthful cleanup receipt
  with absence unproved. Bash syntax checks passed for both runtime shell files; `git diff --check`
  passed. No application tests, external image build, dispatch, deployment, registry or provider
  action was run.
- **Limitations and holds:** B2.1's outer workflow tail-budget engineering risk remains unresolved;
  this change bounds the harness, not later evidence collection/upload or all workflow cleanup.
  Forced termination can prevent custody and authoritative absence read-back; those outcomes remain
  unproved and acceptance fails. No actual Linux-image acceptance is claimed. Coverage/adoption holds
  remain active and campaign allowance remains exhausted at 7/7 dispatches, 39/300 charged minutes,
  zero reserved.

Implementation commit: `5ba6b65`. Handoff/review-notes commit: `766a104`; the independent review
notes above are preserved.

## Block 5B1 — tail-budget design

**Status: design only; current tail is not bounded and feasibility is not established.** The existing
24-minute work deadline is anchored in `Initialize evidence bundle`; the job ceiling remains 40
minutes. The following is a proposed envelope from that work cutoff (`T0`), not measured performance:

| Remaining phase | Deadline from T0 | Termination allowance | Required evidence | Failure behavior |
|---|---:|---:|---|---|
| Evidence capture and manifest validation | T0+3m | 15s inside phase; shell children TERM/KILL | Bounded failure/success manifest, required receipts and safe-file hashes | Incomplete capture fails; retain any manifest/partial receipts; continue only to bounded upload attempt. |
| Artifact upload | T0+5m (2m phase) | 15s internal stop allowance; 2m Actions step cap is final guard | Successful action outcome, artifact ID and digest | Interrupted/failed upload means no durable artifact/custody claim; no retry in this block; retain runner evidence until teardown. |
| Upload report and owner custody gate | T0+10m (5m phase) | 30s for final bounded API call/write | Exact run/attempt/request/artifact/digest owner acknowledgment and status receipt | Stop polling at deadline; absent/mismatched acknowledgment is custody-unproved and acceptance fails. |
| Workflow-owned cleanup and read-back | T0+12m (2m phase) | 30s finalization; per Docker call at most 10s plus TERM/KILL allowance | Exact IDs/labels, removal outcomes, absence read-back and daemon identity/configuration comparison | On timeout or uncertain identity, preserve the resource; record cleanup/absence unproved and fail. Never infer daemon completion from a killed client. |
| Runner/action overhead margin | T0+12m to T0+16m | 4m unallocated | Tail summary and job result where available | No new work; if the hard job ceiling interrupts this margin, every missing result stays unproved. |

The four phase caps total 12 minutes, leaving a nominal four minutes before `T0+16m`. All
termination allowances are inside their phase caps. Use one absolute deadline source and monotonic
remaining-time checks; stop starting a phase or operation unless its worst-case command allowance,
termination allowance and finalization margin fit. Shell work and each child command need explicit
timeouts with TERM then bounded KILL. Actions steps need positive integer `timeout-minutes` as an
outer guard; the design should keep shell/API internal deadlines earlier, since an Actions step kill
does not guarantee its own cleanup or produce a completion receipt. Current GitHub documentation
allows `timeout-minutes` on `run` and `uses` steps and specifies process termination at the step
limit ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax));
it does not turn a killed step into proof of completed upload or cleanup.

**Evidence and feasibility basis.** The private recovered `external-trial-39082300586/timing-final.json`
records 410 runner seconds for the whole historical run (charged as seven minutes). It contains no
per-phase tail durations. Local resource-review receipts report about 36–40 seconds for their
individual synthetic checks; those are not end-to-end workflow or tail timings. Thus all phase caps
above are estimates, not timing proof. The current workflow gives custody polling up to ten minutes
(60 ten-second waits), leaving at most six nominal minutes for capture, upload, cleanup and overhead
in the 16-minute interval; current Docker inventory/removal and tooling cleanup calls have no
per-command caps. The proposed reduction to a five-minute custody window and the 12-minute tail may
be implementable, but neither owner response latency nor capture/upload/cleanup completion within
these budgets is evidenced. Runner startup and action overhead also consume the nominal margin.
Treat feasibility as **unverified / no-go for dispatch** until the implementation proves deadline
arithmetic and a later authorized run produces phase timing receipts; existing campaign and
coverage/adoption holds prohibit that run now.

**Failure ordering.** Capture a bounded failure manifest before cleanup when time permits; missing
receipts, failed manifest validation or interrupted upload never become a pass. Attempt custody only
against verified artifact identity; if upload failed there is no artifact custody to acknowledge,
so record custody unavailable and preserve the local bundle through the bounded attempt/runner
teardown. Then perform only the already-authorized workflow-owned cleanup against recorded exact
IDs and labels. A hung Docker inventory/removal, missing read-back or identity drift leaves the
resource present/absence unknown and cleanup failed; do not remove ambiguous resources. Preserve the
existing owner custody-before-cleanup ordering and exact-owned checks. Stop early if the remaining
budget cannot fit the next bounded phase plus its termination/finalization reserve.

**R4 dependency.** The conditional accepted-image publication, independent digest pull and bounded
smoke verification in the R4 proposal are not present in this workflow and have no allocation in
this tail envelope. Before any future dispatch, they require their own measured transfer/pull/smoke
budgets, evidence and failure handling within the same job ceiling. If those cannot fit without
reducing other acceptance gates or consuming the cleanup/overhead reserve, the combined workflow is
infeasible and publication must remain disabled; no registry behavior is authorized here.

**Smallest next implementation block (proposed Block 5B2):** add a shared absolute tail deadline
and per-phase deadline/remaining-budget helper; wire it only into evidence capture, upload, custody
polling and existing exact-owned cleanup, preserving the 40-minute ceiling and all gates. Bound
every shell/API/Docker/tooling child, reserve termination time, and fail closed on timeout, missing
custody or uncertain ownership. Focused tests should cover budget arithmetic/early-stop decisions,
real hung capture and cleanup children, timed-out Docker inventory/removal with absence unproved,
interrupted/missing upload and custody receipts, successful exact-owned read-back, and workflow step
timeouts/order. Do not include R4 publication/pull implementation until separately budgeted and
approved. No workflow or script changes, tests, dispatch or external action were made in Block 5B1.

## Block 5B2A — bounded evidence capture

- **Deadline foundation:** the initialization step still creates the existing 24-minute
  `ORNIGAMI_WORK_DEADLINE_EPOCH` once. It now writes a small mode-restricted helper and exports
  fixed absolute offsets from that cutoff for capture (+3m), upload (+5m), custody (+10m), cleanup
  (+12m) and the nominal reserved end (+16m). The helper validates the epoch and GNU `timeout`,
  rejects malformed/exhausted budgets, and resolves a phase deadline as the earlier of its local
  cap and its absolute cutoff-relative deadline. Later phases can source the same helper/deadlines;
  they are not bounded by this change.
- **Evidence capture:** the capture step has an Actions three-minute outer timeout and runs its
  complete host-side capture body and descendants under a process-group supervisor. Its cutoff is
  `min(capture start + 180s, work cutoff + 180s)`. Twenty seconds remain inside that deadline for
  TERM/KILL and a bounded failure receipt. A timeout fails the step, preserves any available files,
  moves a prior manifest to `manifest.partial.json`, and writes an explicit failed manifest stating
  that partial evidence is unverified. Capture manifest validation, redaction, private evidence
  boundaries and required-receipt gates remain in place.
- **Verification:** `node --test tests/coolify-runtime-acceptance.test.mjs
  tests/coolify-rehearsal-workflow.test.mjs` passed **65/65** (17 runtime and 48 workflow tests).
  Regressions exercised deadline initialization/offsets, missing/malformed/exhausted input, early
  and late resolution, the absolute cutoff, normal capture, missing evidence, and a real
  TERM-resistant child hung during host-side capture. The hung-child path terminated the child and
  retained an explicit failed partial-evidence receipt. Workflow test execution syntax-checked the
  extracted initialization and capture Bash scripts. `git diff --check` passed. No image build,
  dispatch or external operation occurred.
- **Scope remaining:** upload, custody polling and workflow-owned cleanup still have no new bounds
  or verification from this block. R4 publication, independent pull and smoke remain unimplemented
  and unbudgeted. **B2.1 remains open** until those tail phases are separately implemented,
  tested and shown to fit; no actual Linux-image acceptance is claimed. The 40-minute job ceiling,
  campaign exhaustion and coverage/adoption holds are unchanged.

## Block 5B2B — bounded upload and custody

- **Upload admission and limit:** the workflow reuses the initialization-time
  `ORNIGAMI_WORK_DEADLINE_EPOCH` and resolves upload to the earlier of the local two-minute cap
  and work-cutoff+five-minutes, reserving 15 seconds for termination/finalization. GitHub Actions
  accepts positive whole-minute step timeouts, so the upload action uses a conservative one-minute
  limit; admission requires that full minute plus the reserve to fit and otherwise fails with
  `admitted=false`, skipping upload. This avoids rounding a fractional remainder upward. The
  supported whole-minute constraint is documented in [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps-timeout-minutes).
- **Report and custody window:** report and custody share one deadline set at report start:
  `min(report start + 300 seconds, work cutoff + 600 seconds)`. Custody uses only the remainder;
  it does not receive a fresh five-minute window. The report step has a one-minute Actions outer
  timeout plus the shared supervisor with its 15-second termination reserve. Custody has a
  five-minute Actions outer timeout, while the supervisor, API calls and sleeps obey the shared
  absolute deadline and reserve 40 seconds for stopping and final outcome recording. Each `gh api`
  call has a 15-second cap and two-second KILL allowance; polling sleeps are at most ten seconds and
  are clamped to the remaining worker window.
- **Custody identity and outcome:** custody still runs only after successful upload and requires
  numeric artifact ID and lowercase SHA-256 digest. It polls the existing commit-status endpoint
  for the exact run/attempt context, request commit, artifact ID/digest description, successful
  state and repository-owner creator. No acknowledgment is written by the workflow. API errors,
  hung calls, missing outputs, mismatches, skipped/failed uploads and deadline exhaustion fail
  closed; no matching owner receipt means custody remains unproved. The uploaded diagnostic
  artifact is never an application-acceptance result.
- **Snapshot and local receipts:** capture finishes before upload and the artifact input directory
  is not changed by later steps. Upload reporting and custody outcomes are written under a separate
  runner-local mode-700 directory with mode-600 files, and summary text is appended only to the
  step summary. These later receipts are not represented as uploaded contents. When a failure or
  skip reaches the report step, it records custody unavailable; if runner interruption prevents
  finalization, absent receipts remain unproved.
- **Verification:** 12 focused runtime/workflow tests passed, including the new admission, fake
  upload-action, immutable-snapshot, failed/skipped/missing-output, exact/mismatched-owner,
  short-deadline and hung-API cases, plus existing real-child deadline and capture regressions.
  The workflow test harness syntax-checks the extracted Bash scripts before execution. `git diff
  --check` passed. Only fake local actions/APIs were used; no live upload or API request occurred.
- **Limitations:** upload/custody durations have no live timing evidence. The artifact is diagnostic
  only. Workflow-owned cleanup is unchanged and still lacks its own bounded implementation and
  verification; combined tail feasibility remains unproved. **B2.1 remains open** pending cleanup
  implementation and combined tail-budget verification. R4 publication/pull/smoke remains out of
  scope and unbudgeted. Campaign allowance remains exhausted (7/7 dispatches, 39/300 charged
  minutes, zero reserved); coverage/adoption holds remain active. No image acceptance is claimed.
- **Commit:** workflow changes, focused regressions and this response were first committed as
  `6067f2aefa151aa7c640d043ace182b36504b96a`.

Implementation commit: `f190c7c`. This handoff response is committed separately.

## Block 5B2B independent review — 19 October 2026

Reviewed HEAD `54712b48ede007e6a072991b468971c6287042fb` against `d95d37c`.
Initial working tree clean; whitespace check passed. Exact custody matching and separation of
post-upload local receipts from the uploaded directory are preserved in source. No live upload,
API call, container/image or external action was performed. Only these notes were edited.
**Disposition: follow-up required before closing this block.**

### B5B2B.1 [P2] Report supervisor can outlive its one-minute Actions guard

The `Report downloadable evidence` step declares `timeout-minutes: 1`, but resolves
`upload-report 300 600 15` and passes that shared deadline directly to
`ornigami_tail_supervise`. On an early start, its worker may run for about 285 seconds before
the internal termination handling starts. A hung summary/file operation therefore reaches the
Actions one-minute kill first, bypassing the proposed orderly report termination and final
failure receipt. The shared five-minute report/custody window is correct; using that entire
window as the report's own internal work timeout is not.

Required: preserve the original shared report/custody deadline, but give reporting a separate
local deadline inside its one-minute Actions limit, including bounded termination and receipt
finalization. Custody must still consume only the original shared window's remainder; do not
restart the five-minute allowance after reporting. Test a genuinely stuck reporting child and
assert bounded termination, truthful report outcome and an unchanged shared custody deadline.

### B5B2B.2 [P2] Broader focused verification is not green; investigate markerless timeout

Independent command:
`node --test --test-timeout=90000 tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs`
exited 1. The test `tail supervisor enforces the absolute deadline and terminates a TERM-resistant
real child` failed at `tests/coolify-rehearsal-workflow.test.mjs:563`: expected
`rc=124 event=capture|timeout`, actual `rc=124 event=`. An isolated rerun of that same test passed
(1/1), establishing an intermittent failure rather than a consistently reproducible assertion.
This review did not reproduce the agent's exact Windows stall, and does not claim this block
introduced the supervisor behavior.

Required: diagnose why an expired supervisor can return without the expected out-of-band event
under the full test context, including late starts/worker initialization races. Verify that a
missing event cannot leave timed-out capture presented as complete; the capture fallback currently
selects `supervisor_timeout` from that event. Preserve the distinction from ordinary worker errors
and exit 124. Fix the implementation or test setup as evidence warrants; do not merely remove the
assertion, hide failed tests behind a name filter or enlarge production budgets. Run the broader
runtime/workflow set with bounded execution and retain sanitized results. If a platform limitation
remains, describe its precise scope and why the required behavior is still unverified.

### Next bounded task

Address B5B2B.1/B5B2B.2 only, then append a response with commits, exact test commands/results and
remaining limits. Do not start workflow-cleanup or registry implementation. All existing holds,
resource/job ceilings and the unverified combined tail-budget status remain in force. No live
upload/API operation, owner acknowledgment, dispatch, build, publication or deployment is authorized.

## B5B2B.1/B5B2B.2 response — 19 October 2026

### B5B2B.1 — report deadline

The report step now saves the original `upload-report` phase deadline as the shared report/custody
cutoff, then independently bounds report work to the earlier of `report start + 45 seconds` and
that shared cutoff. The supervisor reserves 15 seconds from its active-work window and bounds
termination escalation to at most seven additional seconds. The resulting 45-second report
envelope leaves at least eight seconds for final receipt writing and 15 seconds before the
one-minute Actions guard. The shared five-minute cutoff is unchanged; custody reads and consumes
only its remainder. Insufficient local time produces a failed report receipt and leaves custody
pending/unavailable.

A real child-process regression hangs inside report-worker code while ignoring TERM. It verifies
the child stops, the report receipt records supervisor timeout, and the shared deadline exported
for custody is identical before and after report execution.

### B5B2B.2 — markerless timeout and late-start handling

The supervisor now scopes events to a unique invocation, records normal worker exits separately
from timeout events, and records an explicit before-start timeout when its budget is already
exhausted. If GNU `timeout` returns 124/137 without either marker, the parent records
`marker_missing` and classifies the outcome as timed out. A normal worker exit 124 remains a worker
failure, not a timeout. Capture uses this parent outcome rather than searching for a possibly
missing/stale event, so markerless timeouts produce a failed capture receipt/manifest and cannot be
reported complete. A regression injects the markerless return into the actual capture step and
checks the failed manifest. The real-child deadline test also uses a 12-second test-only budget;
the previous five-second setup left roughly one second after reserve and raced child initialization.
Production deadlines were not enlarged.

The first unfiltered suite run exposed a separate stale-clock assertion in the phase-budget test
(71/72): it computed elapsed budget from a timestamp captured before resolver startup. The test now
checks its invariant directly through reserved work seconds and retains the original absolute-cutoff
fixture. The rerun passed.

Checks executed:

- Focused regressions: `node --test --test-timeout=90000 --test-name-pattern='report supervisor stops|tail supervisor enforces|tail supervisor classifies|markerless supervisor timeout|evidence capture bounds|bounded custody' tests/coolify-rehearsal-workflow.test.mjs` — **6/6 passed**.
- Broader runtime/workflow set: `node --test --test-timeout=90000 tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs` — **72/72 passed**, 87.7 seconds.
- `git diff --check` — passed. Workflow shell blocks exercised by the suite passed their `bash -n` checks.

The suite runs locally on Windows with Git Bash and fixture/fake Actions interfaces. It does not
verify a hosted Actions runner's exact timeout scheduling, a Linux staging image, or combined live
tail timing. B2.1 remains open for workflow cleanup and combined tail-budget verification. Existing
coverage/adoption/dispatch holds remain active. No live upload/API call, acknowledgment, dispatch,
build, registry, provider, deployment, push or merge occurred.

**Commit:** pending local commit of workflow supervisor/report changes, focused regressions and this
response.

## Block 5B2C — bounded workflow cleanup

The workflow-owned cleanup step now resolves its deadline from the existing
`ORNIGAMI_WORK_DEADLINE_EPOCH`: it uses the earlier of the two-minute local cap and the absolute
work cutoff plus twelve minutes, while reserving 30 seconds. Its two-minute Actions timeout remains
an outer guard. The initial private receipt setup is bounded; the complete cleanup worker, including
host commands and both child cleanup scripts, runs under the tail supervisor. The supervisor
reserves up to 15 seconds for TERM/KILL escalation, leaving time for a bounded failure receipt
writer. If startup budget is exhausted, the worker is interrupted, or final receipt evidence is
missing, cleanup fails and resource absence/daemon state is recorded as unproved.

Every workflow-shell Docker call is limited to at most ten seconds plus a two-second TERM/KILL
allowance, further shortened to fit the remaining deadline and reserve. The child image cleanup
helper and toolchain cleanup share the same absolute cutoff and a ten-second maximum per Docker
call; they use bounded GNU `timeout` with TERM, two-second KILL escalation and an outer process
timeout. A mode-restricted runner-temp marker survives command substitutions and tells later
cleanup code to stop issuing Docker calls after timeout/interruption. It prevents absence read-back
from being recorded as verified after uncertain daemon work. Inventory failure, removal no-op,
identity drift and daemon configuration mismatch continue to fail cleanup. Exact IDs, labels,
attached-volume checks and daemon identity/configuration comparison remain in force. No global
prune, ambiguous resource removal or remote package deletion was added.

The cleanup receipt and Docker uncertainty marker are local runner-temp outcomes, outside the
already-uploaded evidence directory. Cleanup records the prior custody step outcome; it follows the
bounded custody attempt and does not wait for a second acknowledgment. A failed or skipped custody
step remains a failed/absent gate in the workflow result even if local cleanup succeeds.

Verification:

- Focused cleanup/workflow regressions: `node --test --test-timeout=30000 --test-name-pattern='cleanup preserves foreign|cleanup removes only exact|actual cleanup workflow fails on|cleanup stops a TERM-resistant|cleanup supervisor terminates hung host|descendant cleanup Docker calls|cleanup supervisor bounds an interrupted tooling|cleanup fails closed|cleanup treats a worker interrupted|upload and custody workflow retains' tests/coolify-rehearsal-workflow.test.mjs` — **14/14 passed**. This covers normal exact-owned cleanup, ownership mismatch, no-op removal, unavailable inventory, hung Docker/host/tooling children, exhausted absolute budget and interrupted finalization.
- Unfiltered runtime/workflow suite: `node --test --test-timeout=180000 tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs` — **78/78 passed**, 121.2 seconds.
- JavaScript syntax: `node --check scripts/framework-prototype/cleanup-owned-images.mjs`, `node --check scripts/framework-prototype/toolchain-build.mjs`, and `node --check tests/coolify-rehearsal-workflow.test.mjs` — passed. Workflow shell blocks exercised by the workflow harness passed `bash -n`.
- `git diff --check` — passed.

The bounds and failure paths were exercised locally on Windows with Git Bash and fake Docker/tooling
children. Hosted Actions scheduling, Docker daemon behavior on the staging runner, and combined
end-to-end tail timing remain unverified; the two-minute Actions limit is only an outer guard, not
proof a forcibly terminated runner writes receipts. B2.1 stays open pending authorized hosted timing
evidence. R4 accepted-image publication, independent pull and smoke verification remain
unimplemented and unbudgeted. Coverage/adoption and campaign holds remain active. No dispatch, image
build, live provider/API operation, push, merge or deployment occurred.

**Commit:** pending local commit of the bounded workflow cleanup implementation, regressions and
this response.

## Block 5B2C independent review — 19 October 2026

Reviewed HEAD `bd84490e7dbff66f615341f9a3c93139f2d6365f` against `a9b97d2`.
Initial worktree clean. Independently ran the unfiltered runtime/workflow suites plus the directly
affected owned-image and toolchain-cache cleanup suites: **93/93 passed**, zero failures/skips,
exit 0 (111.5 seconds). Both changed JavaScript modules passed `node --check`; whitespace check
passed. No actual Docker, registry, provider, hosted workflow or deployment action occurred.
Only these notes were edited. **Disposition: one implementation correction required.**

### B5B2C.1 [P1] Child cleanup ignores ordinary GNU timeout exit statuses

`scripts/framework-prototype/cleanup-owned-images.mjs`, `workflowCleanupDocker`, marks uncertainty
only for `result.error`, `result.signal` or a null status. GNU `timeout` normally reports an expired
command as numeric status 124 (or 137 after KILL), with Node's `error` and `signal` both null.
Those cases therefore return without updating `ORNIGAMI_CLEANUP_UNPROVED_FILE`.

Independent local fixture reproductions against the actual helper showed:

- Direct helper: `exitStatus=124`, `timeoutRecorded=false`.
- Through actual `cleanupOwnedImages`: `removalExit=124`, `absenceVerified=true`,
  `timeoutRecorded=false`, with one further Docker inventory call after the timed-out removal.

The overall image-removal result still fails; this review does not claim it became a successful
cleanup. The defect is that uncertain daemon work does not fence subsequent child cleanup calls,
and a receipt can claim verified absence contrary to the required timeout policy. The shell
wrapper already handles numeric 124/137; the child helper used by image/toolchain cleanup does not.
Existing green tests do not exercise this status-only child-helper timeout path.

Required: classify GNU timeout status 124/137 as uncertain in the deadline-enabled child helper,
persist the shared marker, and prevent subsequent Docker operations/read-backs from claiming
absence. Keep normal non-timeout errors and standalone behavior explicitly defined. Add tests
for status 124 and 137 with null error/signal, a successful call, a normal non-timeout error, and
the actual owned-image cleanup receipt/fencing path. Verify that the toolchain cleanup uses the
same corrected helper. Do not weaken existing failure or exact-ownership checks.

### Next bounded task

Address B5B2C.1 only. Preserve all prior notes and append a response with changed behavior,
commits, focused checks and remaining limitations. No new tail phase, registry implementation,
resource/permission/job-limit change or external operation is requested. B2.1 live feasibility,
R4 implementation and all coverage/adoption/dispatch holds remain open. Local code/tests and
commits are authorized by the follow-up prompt; this review itself changes no implementation.

## B5B2C.1 response — GNU timeout classification

In the deadline-enabled path, `workflowCleanupDocker` now treats numeric GNU `timeout` statuses
124 and 137 as uncertain even when Node reports no `error` or `signal`. It appends the existing
shared `ORNIGAMI_CLEANUP_UNPROVED_FILE` marker; later helper calls are fenced before invoking
Docker. `cleanupOwnedImages` records `absenceVerified: false` and stops before inventory read-back
when the marker shows uncertain work. The toolchain cleanup imports this helper and assigns it to
its Docker invoker, so the same classification and fence apply there.

Successful deadline-enabled calls remain successful without a marker. Ordinary non-timeout
nonzero results remain caller-visible failures and do not create the timeout marker; existing
removal handling/read-back behavior remains in force for those results. Standalone calls without
`ORNIGAMI_CLEANUP_DEADLINE_EPOCH` continue invoking `docker` directly and do not classify a
numeric status as GNU-timeout evidence.

Focused cleanup/workflow regressions passed **10/10** (including status 124/137 with null
error/signal, success, ordinary failure, standalone behavior, existing ownership/no-op/inventory/
daemon checks, and the actual timed-out owned-image fencing/receipt path). `node --check` passed for
the helper, toolchain module and test file. Source inspection confirmed toolchain cleanup uses the
corrected helper. `git diff --check` passed. No actual Docker, provider, registry, hosted workflow
or deployment operation occurred. Hosted timing, daemon-side cancellation and live cleanup remain
unverified; timeout leaves absence unproved, and B2.1, R4, coverage/adoption and dispatch holds
remain open.

The correction, focused regressions and this response are included in the local commit reported
below.

## Block 5C — combined local tail verification

Added one end-to-end local workflow test using the real capture, upload-admission, report, custody
and cleanup shell blocks with fake upload, owner API, and Docker services. It verifies the captured
manifest and file hashes, copies only the captured evidence into the fake artifact snapshot,
requires an exact successful owner tuple for that artifact, and then checks exact-owned container,
volume, image, and daemon read-backs. Report, custody, and cleanup receipts remain in runner-temp
outcomes and are absent from both the uploaded snapshot and capture evidence.

For a bounded integration fixture, the existing work cutoff is advanced to 120 seconds before the
test’s phase work begins. The initialized helper then derives the expected fixed cutoffs from that
same source: capture +180s, upload +300s, custody +600s, cleanup +720s, reserved end +960s. The test
checks the upload phase’s two-minute cap and 15-second reserve, and checks that reporting sets one
shared report/custody deadline equal to the earlier of its local five-minute cap and the original
work-cutoff-plus-ten-minute deadline. Custody consumes that value; cleanup reuses the same work
cutoff and does not reinitialize or extend it. Existing focused regressions continue to exercise
report/custody and child cleanup termination reserves, late starts, exhausted budgets and timeout
receipts.

Verification:

- Combined sequence: `node --test --test-timeout=60000 --test-name-pattern='combined local tail preserves one deadline' tests/coolify-rehearsal-workflow.test.mjs` — **1/1 passed**.
- Unfiltered suite: `node --test --test-timeout=240000 tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs` — **81/81 passed**, zero failures/skips, 128.7 seconds. This includes capture failure/timeout, upload failure/missing outputs/interruption, missing/mismatched/timed-out custody, late/exhausted phase budgets, and cleanup timeout with absence unproved.
- `node --check tests/coolify-rehearsal-workflow.test.mjs` and `git diff --check` — passed. Workflow blocks exercised by the harness pass `bash -n` before execution.

This is local sequencing evidence with fake services. It does not verify hosted Actions scheduling,
real upload/API behavior, daemon cancellation, hosted timing, or actual Linux-image acceptance.
No production feature or budget changed. B2.1 remains open; R4 publication/pull/smoke remains
unimplemented and unbudgeted; coverage/adoption and campaign holds remain active.

**Commit:** the combined test, preserved independent-review notes and this verification record are
included in the local commit reported below.

## Block 5C independent review — 19 October 2026

Reviewed HEAD `c6d43cc78708937783cb4544ba9361cdbc12dbad` against `39d7be3`.
Initial working tree clean; only tests and the handoff changed. Independently reran the new
combined sequence: 1/1 passed, exit 0. JavaScript syntax and whitespace checks passed. The prior
review notes are now committed. The reported unfiltered 81-test run was not repeated in this
review; no production files changed. Only these notes were edited. **Disposition: combined
happy-path verification accepted; required combined failure coverage remains incomplete.**

### B5C.1 [P2] Exercise failure propagation through the combined sequence

The new test at `tests/coolify-rehearsal-workflow.test.mjs:612` exercises one successful sequence.
It explicitly sets `UPLOAD_OUTCOME=success` and later `CUSTODY_STEP_OUTCOME=success`. Existing
phase-level negative tests remain valuable, but do not exercise the cross-step environment,
outcome propagation, shared deadline and cleanup ordering after an earlier phase fails. Block 5C
was explicitly requested to verify those combinations as well as success.

Required: reuse the combined fixture for a small parameterized set of actual-workflow failure
sequences, without building a new Actions engine or changing production features:

- Failed/interrupted capture followed by a bounded diagnostic upload/custody/cleanup path.
  Diagnostic custody may be verified, but the failed capture gate must remain failed; it must
  never be represented as application or complete-capture acceptance.
- Failed/skipped upload or missing artifact identity: reporting reflects the observed outcome,
  no fake verified custody is assigned, and bounded exact-owned cleanup still follows the
  existing workflow conditions/failure policy.
- Missing/mismatched/timed-out custody: propagate its real failure/skipped outcome into cleanup,
  retain unproved custody, and verify no second wait or fresh shared budget is introduced.
- A late/exhausted downstream budget and a cleanup timeout reached after earlier phases:
  preserve the original work cutoff, do not start unsafe work, and leave affected absence
  receipts unproved. Use controlled short fixture clocks/budgets, not long real waits.

Drive downstream outcomes from the observed phase results and existing workflow conditions,
rather than assigning success unconditionally. Check that post-upload local outcome receipts
stay outside the uploaded snapshot on both successful and failing paths. Keep inherited
negative unit tests; the task is to close the missing sequence-level assertions, not rerun
every old audit. Correct the handoff to distinguish newly integrated failure coverage from
phase-level coverage. If a production defect is found, document it and stop as originally scoped.

No live operation, registry implementation, production-budget change or dispatch is authorized.
All existing holds and unverified hosted timing/image-acceptance boundaries remain active.

## B5C.1 response — combined failure sequences

The combined fixture is now reusable across failure paths. It runs the actual capture, upload
admission, report, custody and cleanup blocks; the fake upload action’s exit/outputs determine the
upload outcome, custody runs only when the observed upload action succeeds, its result determines
the cleanup custody input, and cleanup follows the workflow’s unconditional cleanup condition.
No Actions engine or production code was added or changed.

Combined coverage now includes: failed capture followed by successful diagnostic upload and exact
custody (the manifest remains incomplete and failed, and the report says diagnostic custody is not
application acceptance); failed upload and admission-skipped upload (custody remains skipped or
unavailable); successful action with missing artifact identity (custody fails before API lookup);
missing, mismatched and timed-out owner acknowledgments (unproved custody followed by cleanup); a
fake-clock report/custody cutoff exhaustion followed by cleanup admission failure (no new shared
deadline, API lookup or cleanup Docker operation starts); and a bounded Docker child timeout after
successful earlier phases (cleanup fails, and its receipt says later resource absence and daemon
completion are not claimed). Failure-path report, custody and cleanup receipts are asserted outside
the evidence directory and any fake uploaded snapshot.

The controlled tests shorten the original work cutoff while retaining the same derived offsets;
custody uses the existing short-budget fixture, and timed cleanup retains the 30-second
finalization reserve and 10-second Docker call limit. The shared report/custody deadline is checked
across phases, and cleanup is checked for a second custody/API wait. Existing phase-level tests
remain responsible for detailed capture interruption/markerless timeout, upload interruption,
supervisor termination, ownership mismatch, exact removal/read-back, and individual budget
boundaries. The combined test adds cross-phase propagation and ordering evidence rather than
replacing those checks.

Verification:

- Combined success and failure sequences: `node --test --test-timeout=240000 --test-name-pattern='combined local tail preserves one deadline|combined failure sequence' tests/coolify-rehearsal-workflow.test.mjs` — **10/10 passed**, zero skips, 79.3 seconds.
- Unfiltered suite: `node --test --test-timeout=300000 tests/coolify-runtime-acceptance.test.mjs tests/coolify-rehearsal-workflow.test.mjs` — **90/90 passed**, zero skips, 209.9 seconds.
- `node --check tests/coolify-rehearsal-workflow.test.mjs` and `git diff --check` — passed.

No production defect was found. These are local sequencing checks with fake upload, owner API and
Docker services. Hosted scheduling/timing, real upload/API behavior, daemon-side cancellation and
Linux-image acceptance remain unverified. B2.1, R4 publication/pull/smoke, coverage/adoption and
campaign holds remain open. This response and its focused test are included in the local commit
reported for B5C.1.

## Block 6A — coverage checkpoint

**Checked:** 2026-10-19 10:32–10:33 UTC (12:32–12:33 Europe/Madrid). This bounded, read-only
checkpoint did not run scans, pull/publish a database, contact maintainers, or change policy.

**Primary source findings (current pages checked at the time above):**

- [Debian tracker: CVE-2026-111142](https://security-tracker.debian.org/tracker/CVE-2026-111142),
  [CVE-2026-111141](https://security-tracker.debian.org/tracker/CVE-2026-111141), and the
  [zziplib package tracker](https://security-tracker.debian.org/tracker/source-package/zziplib)
  show bookworm 0.13.72+dfsg.1-1.1, trixie 0.13.78+dfsg.1-0.1 and forky/sid
  0.13.78+dfsg.1-0.2 as **undetermined for both CVEs**. These are Debian's current package
  status and versions; they do not assert affected or not affected.
- The existing third-party [Trivy DB #701 discussion](https://github.com/aquasecurity/trivy-db/pull/701)
  (not Ornigami's local draft/report) records its
  closure on 19 October after Debian corrected the malformed 111142 tracker annotation from a
  bare `undetermined` value to `<undetermined>` (Salsa commit `9e144b7b`). The Trivy maintainer
  says the corrected feed is in vuln-list-debian and scheduled builds pass. The same maintainer
  states that trivy-db skips `<undetermined>` entries; #701's proposed behavior to retain an
  unknown/unfixed package advisory was closed because it changes that policy. Thus the correction
  fixes feed/build handling, not the unresolved package applicability or scanner routing. CVE-111141
  was already represented as `<undetermined>` in the Debian feed according to the
  [related Trivy DB #700 discussion](https://github.com/aquasecurity/trivy-db/pull/700).
- The official [scheduled Trivy DB run 39208577322](https://github.com/aquasecurity/trivy-db/actions/runs/39208577322)
  on `main` (`cbebf2e`) was triggered 19 October at 06:12 UTC and reports **Success**. Its
  [workflow definition](https://github.com/aquasecurity/trivy-db/blob/cbebf2e/.github/workflows/cron.yml)
  schedules six-hour builds and publishes to registries when `skip_publish` is false. Since this
  was a scheduled trigger, the input was not set and its default is false; the successful run is
  evidence that the scheduled workflow, including its upload step, completed. The run page exposes
  no resulting manifest/layer digest or package-record readback. Publication success and freshness
  therefore establish neither that these package records were included nor that scanners can route
  them.
- The [upstream zziplib repository](https://github.com/gdraheim/zziplib) and immutable source
  references in the CVE records were checked for relevant current advisories/releases. No upstream
  corrected, withdrawn, not-affected, or fixed-release determination for these CVEs was found in
  this bounded review. This absence is not a vendor determination. CVE.org's record page did not
  expose readable record data in this browser check; Debian's tracker remains the authoritative
  package-status source used here.

**Comparison with closure requirements and exact-database evidence:** Debian has corrected the
111142 feed syntax, but both CVEs remain undetermined in Debian's current tracker. The upstream
proposal to put undetermined advisories into the official DB was not accepted; no authoritative
assessment now resolves the package as affected, fixed, withdrawn, or not affected. The historical
read-only exact-DB inspection documented above remains bound to the previously inspected digest
`sha256:10584ede500597f516f0d5f4ab750c125999dc0359995a4494ab6cb12e700730`; it found no zziplib
advisory routing for 111142 in Debian 12/13/14. It is not evidence about the 19 October publication
or the current tag. **Exact-current-DB verification was not performed**: no registry read/pull or
database query was run in this checkpoint. No fresh timestamp or zero-finding scan is treated as
coverage.

**Conclusion — HOLD REMAINS.** The fresh evidence removes the reported malformed-feed/build failure
for CVE-2026-111142, but does not close advisory coverage for either CVE. The missing evidence is
either (a) authoritative Debian/upstream corrected applicability, fixed, withdrawn, or not-affected
status that resolves the exact package/version scope without suppressing a finding; or (b) an
officially accepted coverage-preserving handling of undetermined entries, followed by a successful
official publication and independent read-only verification of the exact manifest/layer and
Debian package/vulnerability records for all relevant releases. Preserve every original finding
and the strict freshness gate. Do not adopt PR #701's rejected semantics, suppress either CVE, or
infer coverage from the successful scheduled run.

**Next action:** retain the hold and do not repeat a trial. At the next authorized checkpoint, use a
safe read-only method to bind the current official DB digest and query both zziplib package buckets
and CVE records for Debian 12/13/14; in parallel, accept only authoritative status or an official
publisher-supported resolution. Keep the draft upstream report local under the existing owner
decision. Adoption/dispatch holds remain active; allowance is 7/7 dispatches, 39/300 charged
minutes and zero reserved. Private staging deadline remains 31 October 2026, 23:59 Europe/Madrid.

## Block 6B — deployment-path decision brief

**Established state.** The portfolio plan sets a 31 October 2026, 23:59 Europe/Madrid cutoff and
already records an all-three-app Vercel fallback instead of another automatic VPS extension. The
coverage hold remains; no combined accepted/retained Ornigami image or usable VPS deployment exists;
dispatch allowance is exhausted. This brief changes no policy or service.

| Path | Decision facts and remaining work |
| --- | --- |
| **Continue existing VPS path under hold** | **External evidence:** resolve both CVE routes with authoritative affected/fixed, withdrawn or not-affected evidence, or an official coverage-preserving DB path; then bind the exact published manifest/layer and verify Debian package/CVE records. B6A found neither current DB content nor a status resolution. The successful scheduled build is not coverage proof. The 7/7 campaign is exhausted, so a new bounded dispatch authority would be required before combined Linux acceptance. **Local/host work:** reconcile current-main source against the historical custom framework/tools; finish an exact candidate/profile and budgeted retention plan; refresh shared-host capacity/access and reconcile the existing LocalLift Vercel/Neon mapping; only after prerequisites, run the full security/native/browser/runtime/resource matrix, retain and independently pull the accepted image, then execute separately approved data/profile/DNS/Coolify steps and actual-host recovery checks. No image or host change is useful before the hold changes. In the meantime, useful work is read-only source/config/provenance and project/data mapping plus review of concrete acceptance evidence. **Owner decisions:** explicit solo-operator duty/risk acceptance or continued adoption hold; conditional retention and protected-access approvals; and new campaign authority. |
| **Prepare portfolio Vercel fallback** | This is for **all three apps**, not an Ornigami-only switch. Ornigami's tracked `next` dependency is a local `vendor/framework/next-16.4.2-ornigami-sri.2.tgz`; the Dockerfile uses the custom named frontend/distroless profile and Compose carries read-only filesystem, CPU/memory, network/cache, and disabled-job controls. These controls do not transfer automatically to a managed target. `next.config.ts` enables SRI and security headers and requires `NEXT_PUBLIC_APP_URL=https://ornigami.com` for `VERCEL_ENV=production`; decide and verify the exact staging/production project, origin, auth callbacks, secrets by protected reference, security headers/SRI and build/runtime behavior against the chosen target. `vercel.json` declares privacy, Review Booster and Replies cron routes; keep automatic jobs disabled until the separately approved scheduler gates pass and ensure no old/new scheduler overlap. Reconcile the current LocalLift Vercel/Neon project and data mapping first: preserve the existing Neon arrangement, current VPS/QR/Zoisial services and all data; no new database, destructive migration, or cutover until backup/restore, schema, access, routing and rollback are proved. Remaining gates include the same advisory coverage and custom-framework maintenance/recovery decision, exact privacy/data/tenant acceptance, auth and real staging flows, security/performance/resource evidence, monitoring, and billing/usage and cutover approvals. Vercel does not resolve those gates. Unverified: exact Ornigami project/settings, target plan/usage/cost, framework compatibility/support, current LocalLift data bindings, and portfolio cutover timing/cost. Wider owner decisions include project mapping for all three apps, QR PostgreSQL/media migration and restore, paid-plan/usage controls, actual VPS billing commitments, and a no-overlap retirement/cutover sequence. |

**Recommendation and owner decision.** Keep operational adoption **NO-GO** and do not request a repeated omission check, build, or dispatch under the exhausted allowance. By **20 October 2026, 17:00 Europe/Madrid**, decide whether to (A) keep the VPS objective conditional on authoritative coverage, explicit solo-operator acceptance, fresh dispatch authority and pre-approved retention all becoming available in time, or (B) keep the hold and authorize only read-only preparation of the already documented all-three Vercel fallback. Recommendation: select B for preparation now while preserving existing services/data; it is not a Vercel deployment, spending, migration or waiver. Recheck evidence once at that checkpoint. The portfolio go/no-go remains **31 October 2026, 23:59 Europe/Madrid**; any actual cutover, spending, provider, database or policy action requires its own concrete approval. No new staff are proposed.

## Block 6C — Ornigami fallback inventory

**Scope and evidence labels.** This inventory uses current Ornigami repository files at the reviewed starting
HEAD and existing local planning/evidence records only. No provider account, secret value, project setting,
deployment or live data was queried. “Historical” below means a dated observation in those records, not a
claim about current service state. The portfolio fallback remains a decision path, not a hosting authorization.

| Current evidence | Target requirement | Missing verification or change | Required approval |
| --- | --- | --- | --- |
| `package.json` uses `file:vendor/framework/next-16.4.2-ornigami-sri.2.tgz`; the lock resolves `node_modules/next` to that file with integrity metadata. The archive SHA-256 checked for this inventory was `ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f`, not the `3ebe019c4b83a48469956f0ca255f03be22272599127c86d87e1e2daa3519a81` recorded in `vendor/framework/README.md`. The companion patch is present at `scripts/framework-prototype/next-16.4.2-sri.patch`; its checked SHA-256 was `7d38e144d5f09908161bf90418fe2e6c4daf6f82bc43d244bbb8ccb0861b57f5`, not the `41708142d05f1d6ff1383b090a48c72fce09b69e25a44cd1586b39fa55580db6` recorded in the README. The Dockerfile uses the custom `ornigami-frontend` syntax and custom image recipe. **Correction B6C.1:** the patch is not missing; both README checksum discrepancies remain provenance findings only. | Build the selected Vercel target from the exact reviewed source, lock and framework bytes; establish supported build/runtime behavior and retain advisory, SRI/CSP, scan and maintenance evidence. Hosting choice does not close the custom-framework adoption/security hold. | Reconcile archive/lock/README/patch provenance and decide whether the exact custom framework remains the candidate. No framework substitution or adoption is implied. A future Vercel compatibility block must first review the installed framework guidance and current platform requirements. | Owner accepts the exact candidate, maintenance duties and remaining security/advisory gates; separate coverage/adoption hold stays in force. |
| `src/proxy.ts` sets an enforced `Content-Security-Policy` built with a per-request nonce for matched requests/responses. `next.config.ts` separately adds standard security headers and, in production, a `Content-Security-Policy-Report-Only` Trusted Types policy from `src/lib/security-headers.ts`; it throws when `VERCEL_ENV=production` unless `NEXT_PUBLIC_APP_URL=https://ornigami.com`. `src/auth.ts` restricts redirects to the configured base origin and safe paths; OAuth requires configured Google client credentials. `.env.example` documents variable names/placeholders only. **Correction B6C.1:** only the Trusted Types policy is report-only; the proxy CSP is enforced. These are source facts, not hosted-header acceptance. | Decide the exact Vercel environment/origin and configure Auth.js/OAuth callbacks, HTTPS, private access and secrets through protected settings. Verify cookies, sign-in/reset/email links, enforced CSP and report-only Trusted Types/SRI behavior and negative cross-origin behavior on that target. | The production guard conflicts with using a Vercel production environment for `https://staging.ornigami.com`; no staging exception is approved. Exact target project, domain, preview/production settings, callbacks, access control and secret references are unknown. Coolify’s separate HTTPS BasicAuth/Traefik header-trust plan has no automatic Vercel equivalent. | Owner selects staging versus production role/origin, access method and callback registrations; explicitly accepts the private-access model and any necessary reviewed origin-guard adaptation. Do not change the production guard in this inventory. |
| App config depends on external Neon (`DATABASE_URL`); checked deployment docs contain no database URL or branch. `neon/README.md` defines 001–042 migration order and compatibility rules; operations require paused schedules, drained leases and exact-target restore/schema checks. | Bind the already intended Ornigami environment to its exact existing database/project/branch and compatible schema, with isolated backup/export and proven restore before connecting or migrating. Preserve current services and all data. | Historical `docs/PRIVACY.md` records a dedicated Ornigami LLC Neon Free organization with no projects and a separate existing personal project. Existing LocalLift Vercel/Neon mapping is called out in planning but no exact project/branch/data map or restore receipt is present here. Current live binding, region, plan, snapshots, schema version and restore capability are unknown. No database query was made. | Owner identifies and approves the exact existing project/branch, data scope, access role, backup/restore plan and migration pairing. No new database, data copy or migration is authorized. |
| `vercel.json` declares three schedules (privacy, Booster and Replies). `deploy/coolify/scheduled-tasks.json` separately records all three disabled; the VPS plan keeps all automatic jobs off for private staging, Replies closed with AI disabled. `.env.example` marks OpenAI off and payment/provider settings as placeholders/default-off. | Ensure no Vercel schedule activates or overlaps a separately owned scheduler during fallback preparation or cutover. Verify provider sends, payments, registration, destructive/privacy jobs and other guarded features remain disabled until their individual gates pass. | The committed Vercel cron declarations are deployment behavior, unlike the disabled Coolify inventory. Target schedules, timezone, secrets, any existing scheduler and platform activation semantics are unknown. Default-off variables alone do not prove every external side effect is blocked. | Owner explicitly approves any future schedule and provider activation separately, including the single primary scheduler and overlap/rollback sequence. Until then jobs and live integrations remain disabled. |
| Coolify Compose prepares one internal-port container with read-only root, dropped capabilities, no-new-privileges, init, CPU/memory/PID limits, tmpfs/cache, health check and restart behavior. These are file-level controls, not observed host acceptance. | Demonstrate Vercel-equivalent or compensating isolation, resource/runtime limits, process/restart behavior, cache handling, ingress, health, logs/alerts and abuse/cost controls for the selected project. | Managed Vercel controls differ from container controls; no target limits, logs/retention, alert delivery, deployment protection or cost controls have been checked. Historical `docs/PRIVACY.md` says the existing Vercel team was observed on Hobby and describes dated retention observations; it also records a Neon company org observation. These are not current plan/settings, DPA, retention or billing evidence. | Owner accepts current applicable agreement/data processing, privacy/retention, monitoring/access design and usage/spend limits after exact project and plan are verified. Wider portfolio approval is needed for paid-plan and cost/cutover choices. |
| The portfolio plan names **QR Loyalty, Ornigami and Zoisial** as the three applications. Ignored `.vercel/project.json` has nonempty project/org/name fields and its local project name matches LocalLift, not Ornigami. The local integration records include an August linkage metadata file and an October project-list record naming LocalLift; the related inspection record is inconclusive. **Correction B6C.1/B6C.2:** LocalLift is a historical local linkage lead for Ornigami’s existing Vercel/Neon mapping, not a fourth portfolio application or proof of current provider state. | Define data/config/secret custody, tested recovery and compatible rollback for Ornigami; coordinate only through the separately approved **QR Loyalty / Ornigami / Zoisial** portfolio plan so existing services are not interrupted or duplicated. | Local metadata and historical records do not establish the current live project/environment, Neon binding, QR/media migration evidence, deployment receipt, tested restore or portfolio cutover. Whether the historical LocalLift-linked project/database is still active and whether it is the intended Ornigami target remain unverified. | The owner’s missing target decision is whether/when to select the already documented all-three-app transition and, for Ornigami, which environment/origin to target. Project binding, spend and cutover approvals are required only before their corresponding provider/paid/cutover actions. Existing services/data preservation is already the standing portfolio constraint and is not reopened here. |

**Distinction and conclusion.** Verified current-file facts are the local framework reference and integrity metadata,
origin guard, enforced nonce CSP, separate report-only Trusted Types policy, auth redirect logic, three Vercel cron
declarations, Coolify-only runtime profile, migration/runbook requirements and feature defaults above. Historical
local linkage is indicated by the ignored Vercel metadata and dated integration records naming LocalLift; neither
establishes current provider settings or the intended target. Unknowns include current Vercel team/project/plan/
domains/protection/cron/billing/log settings and the current LocalLift/Neon binding, agreements, retention and
recovery. Controls that Coolify supplies through its container, Traefik and disabled-task configuration need
target-specific Vercel verification or an explicitly accepted alternative; they do not transfer by deploying the
same source. Vercel does not resolve custom-framework maintenance, advisory coverage, privacy, recovery, billing or
provider acceptance. **Operational adoption remains NO-GO and all existing coverage/adoption/provider holds remain
active.**

**Correction B6C.2 — bounded offline follow-up proposal.** After independent review, one local-only block can
reconcile exact archive and patch hashes against the lock/README, perform static checks of the selected app's
origin/auth/header/SRI configuration and identify the cron declarations that must stay inactive. Limit it to
60 minutes, no code/config edits, build, credentials, project/database access, provider calls or deployment;
produce a sanitized provenance/config report and stop on any identity mismatch. This work does not require
provider project mapping, spending approval or a new owner decision. Target-specific build, access, data and
cost checks remain separate and cannot proceed on these offline results alone.

**Owner decisions still missing.** Select whether/when to use the already documented all-three-app transition
at the portfolio checkpoint; if selected, choose Ornigami's target role/origin (`staging.ornigami.com` or
`ornigami.com`). Approve a spend ceiling before any paid action and the exact project/data binding before any
provider connection or migration. No decision is needed to preserve current services/data; that remains the
standing constraint. These choices do not waive coverage, adoption, security, privacy, maintenance or recovery
gates and do not authorize action by themselves.

**Block 6C corrections — close-out.** B6C.1 corrects the enforced CSP versus report-only Trusted Types distinction,
identifies the present companion-patch path and records both README checksum discrepancies, and names QR Loyalty,
Ornigami and Zoisial consistently. B6C.2 records only the sanitized historical LocalLift linkage finding and
its limits, and replaces the blanket owner-input prerequisite with the bounded 60-minute offline proposal plus
separate genuine target/spend/provider decisions. No implementation or provider action occurred. `git diff
--check` is the only verification required; NO-GO, coverage/adoption/provider and campaign holds remain active.

## Independent review — Block 6C (2026-10-19)

Reviewed documentation commit `a5fa8e917d20e9d0856eab828272153f14daa0f5` against the relevant local source and portfolio plan. The inventory appropriately preserves NO-GO and the existing holds, but needs the following documentation corrections before close-out. No implementation or provider action was performed during this review.

**B6C.1 — Correct security, provenance and portfolio facts.** `src/proxy.ts` sets an enforced `Content-Security-Policy` using `buildContentSecurityPolicy(nonce)` for matched requests/responses. `next.config.ts` separately adds the production report-only Trusted Types policy from `src/lib/security-headers.ts`; describing production CSP generally as report-only is incorrect. These are source-level facts, not hosted-header acceptance. The companion patch exists at `scripts/framework-prototype/next-16.4.2-sri.patch`; its absence from the archive directory is not a missing-patch finding. Reuse the earlier documented provenance discrepancy and identify the actual patch path. The portfolio fallback covers **QR Loyalty, Ornigami and Zoisial**, as named in `C:/Users/joser/Desktop/VPS/VPS_DELIVERY_PLAN.md`; LocalLift is an unresolved existing Ornigami project/database mapping, not another portfolio application. Correct the inventory and its conclusions consistently without changing source, framework bytes or the README.

**B6C.2 — Use available local mapping evidence and distinguish actual decision gates.** Ignored `.vercel/project.json` exists and contains nonempty project ID, organization ID and project name fields (values deliberately not reproduced). Existing historical integration records are also local leads. Inspect only the minimum sanitized metadata needed to describe the historical linkage, without copying identifiers, credentials or raw logs into tracked documentation. Local metadata is not proof of current provider settings or the intended target. Record precisely what remains unknown and ask the owner only for missing information or a target selection. An approved spend ceiling and target selection are needed before applicable spending/provider/target-specific actions; they are not prerequisites to reversible offline provenance and static compatibility checks. Preserving current services and data is already an explicit portfolio constraint and does not need reconfirmation. Replace the blanket precondition on all local follow-up work with a small offline verification scope and separately listed owner decisions. Do not start implementation as part of this correction block.

Review verification: relevant source/config and portfolio records inspected; local linkage field presence checked without disclosing values. Documentation-only review; no tests, provider queries, builds, dispatches or deployments performed. Existing campaign, coverage, adoption and hosted-acceptance limitations remain unchanged.

**B6C.1/B6C.2 response — corrected and closed for independent review.** The inventory now distinguishes the
enforced nonce CSP from the report-only Trusted Types policy, records the actual patch path and current hashes
against the README values, and consistently names QR Loyalty, Ornigami and Zoisial as the portfolio apps. It
records the ignored local LocalLift linkage and dated list/inspect evidence without identifiers, and does not
present that history as current provider verification or target intent. The next proposed work is a bounded
60-minute offline provenance/static-compatibility check; only portfolio/target selection, spend approval before
paid action, and project/data binding before provider connection or migration remain decision gates. No
implementation or provider action occurred. NO-GO and all existing holds remain active.

## Block 6D — offline Ornigami fallback compatibility assessment

**Scope.** Local-only review of package metadata, application source/configuration and installed Next.js guidance
at HEAD `44e741e5cc646dcd20dbab1b47833b3344b4e01f`. No build, test, provider lookup, database access or target
selection was performed. The checks below establish source/configuration behavior only; they do not establish
Vercel compatibility, hosted headers, private access or runtime acceptance.

| Area | Verified local evidence | Compatibility constraint / missing proof |
| --- | --- | --- |
| Framework bytes | `package.json` and `package-lock.json` resolve `node_modules/next` to `vendor/framework/next-16.4.2-ornigami-sri.2.tgz`. Recomputed archive SHA-512 integrity matched the lock metadata. Its previously recorded SHA-256 disagreement with `vendor/framework/README.md` remains the documented provenance discrepancy, not a lock-integrity mismatch. The patch is at `scripts/framework-prototype/next-16.4.2-sri.patch`; its reproducibility relationship to the archive has not been demonstrated. | Lock integrity proves the archive bytes match the lock's integrity value; it does not prove the patch can reproduce those bytes or establish platform support for this modified framework. Do not treat prior README checksum findings as newly discovered blockers. |
| Origin and auth | `next.config.ts` rejects `VERCEL_ENV=production` unless `NEXT_PUBLIC_APP_URL` is exactly `https://ornigami.com`. `src/lib/app-base-url.ts` prefers that configured URL, otherwise derives an origin from forwarded host/protocol or request URL. `src/auth.ts` restricts Auth.js redirect destinations to the base origin and sanitized return paths. | A Vercel production environment targeting `staging.ornigami.com` would hit the guard. A preview environment or production origin has not been selected. Correct forwarded-origin handling, Auth.js base URL, OAuth callback registration, cookie behavior and private-access policy require target-specific verification. No origin or guard change is proposed. |
| CSP, Trusted Types and SRI | `src/proxy.ts` creates a per-request nonce and sets enforced `Content-Security-Policy` on request and response for matched requests. `next.config.ts` adds `Content-Security-Policy-Report-Only` containing the Trusted Types policy in production. It enables `experimental.sri.algorithm = sha256`. `package.json` build script explicitly invokes `next build --webpack` before the static CSP-hash generator. Installed docs `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` label SRI experimental, document App Router availability, and describe Proxy-generated nonces for dynamic rendering; the installed Proxy guide says Proxy defaults to Node.js and cannot set a route `runtime` option. | These local statements do not prove deployment headers or that target build behavior preserves SRI, generated hashes, nonce propagation, dynamic rendering, or report-only reporting. The installed docs contain framework guidance, not Vercel platform acceptance. Verify the exact chosen build command/output and request/response headers in a later authorized target-specific step. |
| Scheduled jobs and guards | `vercel.json` declares privacy at `0 3 * * *`, Booster at `7 * * * *`, and Replies at `11 */4 * * *`. Each route checks `CRON_SECRET`; Replies additionally returns unavailable when `OPENAI_ENABLED` is not true. Privacy applies deletion only when both `PRIVACY_RETENTION_ENABLED` and `PRIVACY_RETENTION_APPLY` are true (and its cleanup has further internal guards). `OPENAI_ENABLED=false` and the two retention flags are default-off in `.env.example`; Coolify's separate schedule inventory remains disabled. | `CRON_SECRET` authenticates a request; it does not remove or disable a declared schedule. The retention flags prevent apply-mode cleanup but do not prevent scheduled invocation. `OPENAI_ENABLED=false` closes the Replies handler but does not disable its Vercel schedule. Booster has no equivalent global private-staging schedule-off flag in the inspected route; its route-level auth, DB lease and business eligibility checks are not a global staging kill switch. Preventing automatic private-staging runs therefore requires a separately reviewed target schedule configuration that omits/disables all three jobs, or a separately reviewed and verified environment-level gate covering every route. No such change is made here. |

**Assessment.** The local framework archive/lock identity check passed. The patch-to-archive reproducibility remains
unproved; the README checksum discrepancies remain previously recorded. The production origin guard, target-specific
Auth.js/OAuth settings, emitted security headers/SRI behavior and automatic scheduler suppression are concrete
compatibility items. The actual target is unselected. No claim is made that any of these controls work on a Vercel
deployment. All coverage, adoption, campaign, provider and NO-GO holds remain active.

**Unresolved questions.** The owner has not selected the portfolio fallback or the Ornigami target role/origin.
The related Block 6C decisions remain: preserve existing services/data; approve spend before any paid action; and
approve exact project/data binding before provider connection or migration. None is needed for the local assessment
above, and none is granted by it.

**Proposed next block.** After independent review, a bounded local-only implementation/verification block may
prepare a target-neutral staging profile that keeps all three cron declarations inactive, then verify the exact
framework/build provenance and origin/auth/CSP/Trusted Types/SRI behavior with focused local checks. It must not
change the production origin guard without a separate decision and must stop before provider configuration,
database access or deployment. Target-specific host/runtime acceptance remains a later separately authorized gate.

**Verification record.** Archive SHA-512 matched `package-lock.json`; prior SHA-256 discrepancies were reused as
known findings. Relevant installed framework docs and local routes/config were inspected. `git diff --check`
passed; no tests, build or external action was needed. Review remains bounded by static/local evidence only.

## Block 6E — explicit schedule-free private-staging config

**Official support check (2026-10-19).** Vercel's [CLI global options](https://vercel.com/docs/cli/global-options)
document `--local-config` as selecting a local `vercel.json` path and list it as a global CLI option. The
[project configuration reference](https://vercel.com/docs/project-configuration/vercel-json) defines `crons` as
optional configuration. Vercel's [Cron Jobs overview](https://vercel.com/docs/cron-jobs) says schedules can be
declared in `vercel.json` or through the Build Output API and are invoked against the production deployment.
Its [management guide](https://vercel.com/docs/cron-jobs/manage-cron-jobs) says cron jobs can be deleted by
removing configuration and redeploying, or disabled in project settings. This supports an explicitly selected
alternate local config with no `crons` declaration. It does **not** let this repository prove or change remote
schedule state; selection for a Git-connected deployment was not established here.

**Files and selection.** Added `vercel.staging.json`, containing only the Vercel schema reference and no
`crons` property. Default `vercel.json` and all three existing schedules are unchanged. The documented future
CLI selection form is `vercel --local-config vercel.staging.json ...`; it was not executed and is not a deployment
authorization. The CLI option selects config only, not project identity. Since ignored `.vercel/project.json`
contains the historical LocalLift linkage, any future authorized CLI operation must also specify the separately
owner-approved target explicitly (for example with `--project`); this block does not name or expose that target.
The file itself does not configure a private domain, access protection, environment variables or origin.

**Local validation.** Added `scripts/validate-vercel-staging-config.mjs`. It checks that the default config still
contains exactly the three accepted path/schedule pairs and that the staging config contains no `crons` property
and remains minimal. `node scripts/validate-vercel-staging-config.mjs` passed.
`node --check scripts/validate-vercel-staging-config.mjs` passed. `git diff --check` passed. No build, provider request,
deployment, project change, cron mutation, or route call was made.

**Limits and remaining decisions.** No `crons` property in this selected file means no automatic schedule is
declared by this local config. It does not disable schedules already registered remotely, prevent manual calls to
the routes, or prove that a later deployment uses this file. The handlers' `CRON_SECRET` checks authorize calls;
they are not schedule switches. The official docs also identify dashboard disablement and redeployment-based
removal as remote controls; neither was used. Although no active Build Output API cron declaration was found in
the inspected tracked repository paths, no build output was generated, so none is evaluated. A selected staging
deployment must not be assumed to preserve the existing production project's cron state; target separation and
remote schedule read-back require a separately reviewed, explicitly authorized operation. NO-GO and all existing
coverage, adoption, campaign, provider and deployment holds remain active.

Owner decisions remain the Block 6C/6D items: whether/when to select the portfolio fallback; the Ornigami target
role/origin and exact Vercel project; approval of any spend before paid action; and project/data binding before any
provider connection or migration. No owner decision is required to run the local configuration validator.

## Block 6F — selected staging-origin local verification

**Selected direction.** The owner delegated the choice to the reviewer. Select preparation of the existing
portfolio Vercel fallback, with Ornigami private staging first at `https://staging.ornigami.com`, using the
Vercel Preview environment. This is an origin/environment choice only; no existing project is selected or
approved, and it authorizes no provider connection or deployment. This later selection supersedes the earlier
Block 6C/6D statement that the direction/origin remained unselected. Preserve current services/data, NO-GO and
all coverage, adoption, campaign, provider and deployment holds.

**Files and checks.** `tests/vercel-preview-origin.test.mts` loads the actual `next.config.ts` in a VM with
isolated environment variables and harmless Sentry/security-header stubs. Preview with the selected staging
origin loads successfully. Production with `https://ornigami.com` loads; Production with the staging origin or
without an app URL throws the existing canonical-origin error. The existing
`tests/auth-session-callbacks.test.mts` now uses the selected staging base URL: relative and same-origin
absolute return paths preserve that origin; external, network-path and unsafe backslash/encoded/path forms
resolve to the staging dashboard. No production configuration or application logic changed.

Focused verification passed: `node --experimental-strip-types --test tests/auth-session-callbacks.test.mts tests/vercel-preview-origin.test.mts`
— **3/3 tests passed**; `node --check` passed for both test files;
`git diff --check` passed. Installed framework guidance under `node_modules/next/dist/docs/` was reviewed;
no build was run. An initial test assertion failed on cross-realm object prototypes; comparing the relevant
primitive configuration value fixed the test setup. No application defect was found.

**Limits and unresolved work.** These are local source/configuration tests, not proof of OAuth provider
callback registration, Preview project settings, private access protection, Vercel compatibility, hosted
headers, runtime behavior or live sign-in. The Vercel target project remains unselected. Remote cron state,
database/project binding, recovery, privacy, security/advisory coverage, maintenance, billing and cutover remain
separate decisions and acceptance gates. No provider, database, network or credential access was used.

## Block 6G — read-only Vercel staging-target discovery

**Check time and method.** Read-only Vercel CLI/API metadata was checked on 2026-10-19 (Europe/Madrid) using the authenticated CLI already available in this checkout. The observed CLI version was 58.9.1. `whoami`, team/project listing, project metadata/domain reads, project-protection display, environment-variable listing and the cron-list command were used only as reads. No token or environment-variable value was retrieved, printed or recorded. No deployment, route, database, DNS or provider state was changed. The selected staging origin and all existing NO-GO, coverage, adoption, campaign, provider and deployment holds remain unchanged.

**Verified provider facts (sanitized).** The authenticated current team scope exposes one team and three projects, with no further project-list page. Only that team scope is verified: an attempted personal-scope listing did not succeed, so this is not an exhaustive account-wide inventory. The ignored `.vercel/project.json` historical LocalLift link resolves to an existing project in the accessible team scope. That project has no Git Integration repository link, although it is assigned the production domain `ornigami.com`; `staging.ornigami.com` is not assigned to any of the three projects in the accessible scope. Its project root uses the default root directory, but it has no Git-derived production branch metadata. The only Git-linked project in this scope points to a different repository; the remaining listed projects have no Git link. No project is verified as Git-integrated with this checkout. This does not, by itself, disqualify an explicit CLI deployment: Vercel CLI can select a project directly, while source provenance and the exact project selection must be established independently.

The existing project assigned `ornigami.com` is the strongest existing project to investigate because of that domain binding, but its identity as the current Ornigami production project is not established. It is the historical LocalLift-linked project, not a verified repository match. Its production-domain assignment is a material reason to avoid treating it as a staging target without an owner-confirmed production/service binding and explicit isolation review.

**Correction marker — 2026-10-19 (B6G.1).** The accessible team’s live billing metadata reported **Hobby** at the original check time. Read-only protection metadata for the domain-owning project reported Vercel Authentication with deployment type `All`; password protection was not configured. Current official Vercel documentation says All Deployments protection is available on all plans, and Vercel Authentication does not require a paid add-on. Password Protection is separate: it is unavailable on Hobby and has distinct Pro/Enterprise pricing. Therefore Hobby plus Vercel Authentication with All Deployments is not a documented plan conflict. The exact user roster, effective access, exceptions and bypass configuration were not queried. If the reported All setting is effective, its documented scope includes production URLs; whether/how it currently affects the `ornigami.com` service is unverified. This observation alone does not establish effective privacy, application availability or production continuity.

Environment-variable metadata for the historical project returned 29 names, with no values read. Names and scopes were:

- **Development, Preview and Production:** `AUTH_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `OPENAI_API_KEY`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_PROJECT`, `SENTRY_PUBLIC_KEY`, `SENTRY_VERCEL_LOG_DRAIN_URL`.
- **Preview and Production:** `ALLOW_DASHBOARD_WITHOUT_GBP`, `AUTH_URL`, `CRON_SECRET`, `EMAIL_FROM`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `REPLY_TO_EMAIL`, `RESEND_API_KEY`, `STRIPE_PRICE_BOOSTER_ANNUAL`, `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_COMPLETE_ANNUAL`, `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`, `STRIPE_PRICE_REPLIES_MONTHLY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Production only:** `RESEND_WEBHOOK_SECRET`.

These are key names and declared scopes only. Their values, equality across scopes, validity, use and database/provider bindings were not inspected. In particular, the presence of database, authentication, OAuth, payment, mail and AI key names in Preview scopes makes this project unsuitable for staging until Preview values and data/service isolation are separately verified.

The read-only `vercel crons ls` command for the historical linked project returned three configured cron records; its result did not establish enabled/disabled status. It did not trigger a route. The tracked production `vercel.json` still declares three schedules, while `vercel.staging.json` declares none; that local omission does not disable a schedule already registered remotely. Vercel’s current [Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) allow at most daily schedules, so the existing hourly and four-hour declarations also need plan-aware review before any deployment. Remote active status remains unknown.

**Official platform constraints checked 2026-10-19.** Vercel’s [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) says All Deployments protection is available on all plans, and Vercel Authentication with that scope does not require a paid add-on; password protection is a separate paid/unavailable-on-Hobby feature. The [CLI project reference](https://vercel.com/docs/cli/project) documents project listing/inspection and that omitting an action from `vercel project protection` displays current settings. The [environment CLI reference](https://vercel.com/docs/cli/env) documents listing environment metadata separately from pulling values. The [cron CLI reference](https://vercel.com/docs/cli/crons) describes `crons ls` as a configuration listing; Vercel’s [cron management guide](https://vercel.com/docs/cron-jobs/manage-cron-jobs) identifies the Dashboard Cron Jobs view for active status. For branch-specific custom-domain assignment, Vercel’s [alias documentation](https://vercel.com/docs/cli/alias) requires the deployment to be associated with the configured Git branch: Git Integration supplies this automatically, while CLI deployments can use Git metadata. Vercel CLI can separately select a project with `--project` ([global options](https://vercel.com/docs/cli/global-options)). The distinct [Preview Deployment Suffix feature](https://vercel.com/docs/deployments/preview-deployment-suffix) is Pro/Enterprise and requires an active team domain using Vercel nameservers; that feature is not the same as assigning a custom domain to a Preview branch. None of these documented capabilities proves the current project’s source, access, production binding or staging suitability.

**Recommendation and blocker.** Do not select any existing project as the staging target yet. The domain-owning project is a candidate for further read-only investigation, not an approved or verified target: production currently owns `ornigami.com`, `staging.ornigami.com` is unassigned, Preview scopes contain sensitive service-key names, and source provenance, exact project selection, effective access, production binding, Preview isolation, cron enabled status and target suitability remain unverified. The Git-linked project points to a different repository, but the absence of Git Integration on another project is not by itself proof that CLI deployment is impossible. No production change, project creation, linking, DNS change or deployment is authorized.

**Smallest next block / remaining owner input.** Provide read-only visibility to any personal Vercel scope that should be part of this inventory, then perform one bounded read-only confirmation of the exact project/source path intended for Preview: production/service binding; Git Integration repository and branch if that route is chosen, or exact CLI project selection plus source provenance if CLI deployment is considered; actual Preview access roster, exceptions and bypasses; production/Preview environment separation; and active cron status. The owner must confirm whether the domain-owning project is in fact the existing Ornigami production/service project and whether it may be evaluated for Preview without changing production. The current plan/protection combination is not a blocker by itself. If neither Git Integration nor an explicitly reviewed CLI path establishes the correct source and destination with isolation, no eligible target is verified. Do not add/link a project or use the production-domain project for staging without a later explicit decision and review.

**Verification and limits.** Sanitized project/domain/environment/protection/cron summaries above were derived from authenticated read-only calls; private project identifiers and raw provider output are omitted. The current plan observation is account metadata at the check time, not a guarantee of future billing. No hosted Preview behavior, effective access or exceptions, variable values, cron enabled state, production service continuity or candidate approval is established. `git diff --check` passed; no application tests were run.

## Independent review — Block 6G (2026-10-19)

Reviewed commit `a374cd87360a26c0c9c916c2264ef47edd01eb36`, its documentation-only diff and current official platform documentation. Working tree and diff checks were clean before these review notes. This review did not independently repeat the authenticated provider inventory; provider observations above remain the implementing agent's dated report.

**B6G.1 — Correct the claimed protection/plan mismatch.** The current [Deployment Protection reference](https://vercel.com/docs/deployment-protection#all-deployments) explicitly says All Deployments protection is available on all plans. It also states that Vercel Authentication for All Deployments does not require a paid add-on; password protection has separate plan/pricing restrictions. Consequently, the reported Hobby plan and Vercel Authentication deployment type `All` do not establish the claimed documentation conflict. Correct the protection paragraph, platform-constraints summary, recommendation and next-block scope consistently, with a dated correction marker. Remove the inferred plan/protection discrepancy as a blocker; retain effective access, exceptions/bypasses, production service binding, Preview environment isolation, cron state and target suitability as unverified. Do not infer verified privacy or service continuity from the setting alone, and do not change provider settings or select a deployment target in this correction block.

Follow-up scope should distinguish Git Integration (needed for branch-specific automatic domain assignment) from source provenance for an explicitly selected CLI deployment. Missing Git linkage alone does not prove a project can never be a CLI target; source identity, correct project selection and isolation must still be demonstrated. Preserve the conclusion that no safe staging target has yet been verified, without inventing Git linkage as a universal eligibility requirement.

Correction block: handoff documentation only; no authenticated provider calls or implementation work needed. Preserve NO-GO and all existing holds. No further owner input is needed to correct these statements.

## Block 6G corrections — close-out response (2026-10-19)

- **B6G.1 — protection/plan:** Corrected the Block 6G facts, platform summary, recommendation and next-block scope. Current official [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) makes All Deployments available on all plans and says Vercel Authentication with this scope has no paid add-on; Password Protection is separate and unavailable on Hobby. The previously asserted Hobby/All plan conflict is withdrawn. The reported protection setting still does not prove effective access, roster, exceptions/bypasses, production binding or uninterrupted service.
- **Git-linkage eligibility:** Corrected the wording to distinguish automatic branch-domain association supplied by Git Integration from explicitly selecting a Vercel project for a CLI deployment. Vercel documents project selection through `--project` and requires branch association/Git metadata for branch-specific domain assignment ([CLI project selection](https://vercel.com/docs/cli/global-options), [CLI deployment and alias behavior](https://vercel.com/docs/cli/alias)). Missing Git linkage alone is not a universal CLI disqualifier. Source provenance, exact project selection, branch association when needed, Preview isolation and target suitability remain unproved.

No authenticated provider call or implementation change was made. The original review notes remain above unchanged; NO-GO and all coverage, adoption, campaign, provider and deployment holds remain active. `git diff --check` passed; application tests were unnecessary for this documentation-only correction.

## Block 6H — read-only Preview access assessment (2026-10-19)

**Scope and check.** Read-only authenticated Vercel metadata was checked on 2026-10-19 (14:04 Europe/Madrid), limited to the existing domain-owning candidate already described in Block 6G. No project listing beyond that candidate, personal-account discovery, route request, credential/environment-value access, or provider change was performed. The Vercel CLI project-member query returned zero direct project-member records. The access-summary and access-groups queries each exited with status 1; their provider error text was not retained, so the reason and any inherited/group memberships are unavailable. No personal identifiers are recorded.

**Configured protection versus observed access.** The latest successfully interpreted protection metadata remains the 2026-10-19 Block 6G read: Vercel Authentication, scope `All`; password protection was not configured. A narrow SSO-filtered protection query in this block did not yield a safely interpretable fresh scope value. Its response shape also included a `protectionBypass` member; that member was not inspected, printed or recorded, and no further protection query was made. Accordingly, `All` is the last reported configuration, not a new verification in this block. Current official [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) defines All Deployments as covering all URLs, including production, and Vercel Authentication as limited to Vercel users with suitable access rights. If that reported scope remains configured and the staging hostname is later assigned to this candidate, it would nominally be in scope. Block 6G reported `staging.ornigami.com` unassigned across the accessible team’s projects; this block did not re-read domain assignment, so it is not currently verified as an assigned hostname. No request was made to test enforcement. These settings therefore do not establish effective privacy or which people can successfully access a deployment.

**Access roles and exceptions.** The empty direct project-member result does not establish that no team users can access the project. Official [Vercel project CLI documentation](https://vercel.com/docs/cli/project) says team Owners and Members have access to every project; the live team roster and role counts were not available through the attempted summary calls. Project-level inherited access, role groups and the actual set of suitably authorized Vercel users remain unknown. Configured exceptions and bypass status are also unknown: Vercel documents [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), which can bypass Vercel Authentication when a secret is presented; [OPTIONS Allowlist](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/options-allowlist), which exempts matching preflight requests; [Shareable Links](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links), which can permit external access to specific branch deployments; and [Deployment Protection Exceptions](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions), which can make listed Preview domains public. None was safely inspected for this project. No secret value was recorded. Whether any exception, shareable link, automation bypass, or preflight allowlist is configured cannot be inferred from the reported `All` scope.

**Conclusion and next block.** The candidate’s last reported policy would cover Preview URLs and, conditionally, the intended staging hostname if assigned to that project, but the current exception state, authorized-user set, hostname binding and actual enforcement are unproved. The candidate remains unapproved; operational readiness remains **NO-GO**, with all coverage, adoption, campaign, provider and deployment holds active. The smallest next block is one secret-safe, read-only Dashboard review of this candidate’s project/team access roles and Deployment Protection Access settings: capture only role counts and enabled/disabled states for exceptions, shareable links, automation bypass and OPTIONS allowlist; never open, copy or export secret values. Confirm staging-domain assignment from the same candidate’s domain list. This would establish configured policy and binding only; any effective-access claim would still require a separately authorized behavioral check.

No application tests were run. The dated provider observations are configuration metadata, not behavioral evidence. No target is selected or approved, no Vercel deployment or staging access was tested, and NO-GO and all existing holds remain in force.

## Independent review — Block 6H (2026-10-19)

Reviewed documentation commit `5e060c311b3df5eb80dd901b6ff6dea5e5c9a8a0`; HEAD and clean working tree matched the report, and the committed diff passed `git diff --check`. No provider queries or implementation changes were performed by this reviewer. The report correctly distinguishes historical settings, unavailable metadata and untested enforcement, but the requested current Preview access assessment remains incomplete.

**B6H.1 — Close the metadata-access gap with an actionable result.** The failed access-summary/access-group calls have no retained diagnostic, so their status alone cannot establish whether the problem was command syntax, endpoint support, authorization or another condition. Do not infer missing owner permissions or require an upgrade from these exits. In one bounded read-only follow-up, use the proposed Dashboard inspection through an already authenticated session if available, or a documented metadata-only CLI/API alternative. Record only sanitized role counts, protection scope, exception/bypass configuration states and the candidate's staging-domain assignment. Do not retrieve or expose bypass secrets, shareable URLs, credential values or personal identifiers. If a read is unavailable, retain a bounded sanitized error code/message or describe the exact inaccessible Dashboard view and the minimum user action required. Distinguish unavailable from disabled and configured policy from actual enforcement. Stop with a precise blocker if the session or permitted metadata is insufficient; do not repeat an identical undocumented failed query. Preserve target-unapproved/NO-GO and every existing hold.

## B6H.1 response — Preview metadata access gap (2026-10-19)

**Check and scope.** HEAD at start was `5e060c311b3df5eb80dd901b6ff6dea5e5c9a8a0`; the only pre-existing worktree change was the independent-review note above, which is preserved here. No account/project settings were changed, and no secrets, bypass tokens, shareable URLs, environment values or credentials were read or recorded.

**Dashboard result.** The in-app Dashboard session opened to a personal-projects overview rather than the domain-owning candidate’s team project. I stopped without selecting or inspecting any project and closed that tab. It cannot provide the requested candidate metadata in its current scope. No personal identifiers or unrelated project details are included here.

**CLI diagnostics.** `vercel project --help` and the help for both access subcommands confirmed supported syntax. A PowerShell wrapper initially passed arguments incorrectly; two resulting CLI invocations fell through to deployment preflight and returned `deploy_failed` with the sanitized reason that the Hobby cron schedule exceeds the daily limit. Neither returned a deployment success or deployment identifier; no build/deployment result beyond that failed preflight is claimed. The invocation error is recorded so it is not mistaken for an access-metadata result.

After correcting the invocation, the documented linked-project metadata reads returned:

- `vercel project access-summary --json`: exit 1, `reason=not_authorized`, message `Invalid team plan`. The [Vercel CLI project reference](https://vercel.com/docs/cli/project) says this role-count summary requires the Access Groups entitlement. This is not a syntax error. The endpoint provided no role counts; the exact entitlement/account context is not established, and no upgrade is requested.
- `vercel project access-groups --json --limit 100`: exit 1, `reason=forbidden`, message that listing access groups is not permitted. This is an authorization denial for that endpoint, not evidence that groups are absent or disabled.

The bounded diagnostics contained no retained identifiers or secret values. The most recent direct project-member listing reported zero direct project-member records, but that does not enumerate inherited team roles. Current role counts remain unavailable. No repeat protection query was made because the earlier response included a `protectionBypass` field and a safe field-only command is not documented.

**Requested fields and present limits.** No current refresh was obtained for the protection method/scope, exception configuration, shareable-link state, automation-bypass state, OPTIONS allowlist or staging-domain assignment. These are **unavailable**, not disabled. The last interpreted provider record remains Block 6G’s 2026-10-19 report of Vercel Authentication with `All` scope and `staging.ornigami.com` unassigned in the accessible team project set. That is historical to this response and does not verify current configuration or enforcement. The target project remains unapproved.

**Minimum user action / next step.** Provide an already authenticated Dashboard view scoped directly to the domain-owning candidate under its owning team, or make that candidate’s project Settings > Deployment Protection and Domains views available to the current read-only reviewer session. No credentials or tokens need to be shared. A team owner may need to supply an authorized read-only view if the current identity cannot see those settings; no plan upgrade is presumed. The next bounded read should record only the protection method/scope, role counts, enabled/disabled states for exceptions/shareable links/automation bypass/OPTIONS allowlist, and whether the staging hostname is assigned. If the Dashboard cannot expose those states without revealing secrets, leave them unavailable. Configured settings still would not prove enforcement.

This response is documentation-only. `git diff --check` is required before commit; no application tests apply. NO-GO, target-unapproved status and all existing coverage, adoption, campaign, provider and deployment holds remain active.

## Independent review — B6H.1 response (2026-10-19)

Reviewed commit `fec621afa55a40291f15585d89b3c14c1411b580`; HEAD, initial clean worktree and diff checks matched the report. The current official CLI project reference confirms that access-summary requires the Access Groups entitlement. Its denial does not establish that every read-only access inspection is unavailable. This reviewer did not repeat authenticated reads or inspect private command logs.

**B6H.2 — Document the out-of-scope deployment attempts precisely.** The two accidental deployment-preflight invocations crossed this block's read-only boundary even though they reportedly failed. Preserve the disclosure. From existing evidence only, record sanitized effective executable/argument lists, approximate times if available, the argument-forwarding mistake, retained failure/exit evidence and whether any local linkage/config files changed. Do not replay either invocation. Distinguish no returned success/ID from independently established absence of any remote deployment record or other effect; mark the latter unknown unless already evidenced. Clarify that documentation-only describes the committed file changes, not every action attempted during the session. State the concrete prevention for follow-up work: use Dashboard navigation only for the next metadata inspection, with no Vercel CLI wrapper or deployment command. No new tooling implementation is requested.

**B6H.3 — Do not infer an access blocker from the Dashboard landing page.** An authenticated personal-projects landing view is not itself evidence that the owning team's candidate cannot be reached. Read-only navigation to the already identified team/candidate is within the authorized inspection scope and does not require examining unrelated personal projects. Attempt that navigation through the Dashboard using existing local candidate references; do not change account membership, project settings or credentials. Ask the user for an authenticated view or additional visibility only if navigation establishes an actual sign-in requirement, missing team/project or access-denied result. Record the exact blocker without exposing private identifiers. Keep unavailable fields unverified and all existing holds active.

## B6H.2–B6H.3 response — evidence disclosure and direct Dashboard inspection (2026-10-19)

**B6H.2 — Existing evidence about the accidental preflight.** No command was replayed. Retained tool history shows the Vercel CLI executable (`vercel`, version 58.9.1) was called through a PowerShell wrapper with intended argument arrays `project access-summary --json` and `project access-groups --json --limit 100`. The wrapper declared a parameter named `$Args` and invoked `& vercel @Args`; that name collides case-insensitively with PowerShell's automatic `$args` variable, so argument forwarding failed. The captured CLI output showed root deployment behavior (`Deploying [candidate]`) rather than either documented project-access subcommand; the exact OS-level argv was not separately recorded. Both calls exited 1 and returned `status=error`, `reason=deploy_failed`; the sanitized error said Hobby permits only daily cron schedules and rejected `7 * * * *` as more frequent. Neither returned deployment success or an ID. This does **not** verify that no remote deployment record or other effect exists; that remains unknown because no independent deployment-history read was made and the commands were not replayed.

The later commit `fec621afa55a40291f15585d89b3c14c1411b580` changed only this handoff. At the start of this follow-up, the only worktree change was the independent-review note preserved above. No historical pre/post snapshot of ignored Vercel cache/linkage files is available, so whether an ignored local file was touched during the failed preflight is unknown. The accidental attempts are disclosed here: “documentation-only” describes the file change, not every action attempted in the earlier session. This follow-up used Dashboard navigation only for provider inspection and made no CLI invocation.

**B6H.3 — Direct candidate inspection.** Using the existing local project reference (its project name matched the candidate route), I navigated directly to that candidate's project settings and owning-team Members view; I did not open unrelated project cards or deployment routes. The current Dashboard pages were reachable without a sign-in, missing-project or permission error. No setting was changed.

- **Protection method/scope:** Vercel Authentication with **Standard Protection** was selected in the current project settings. This differs from Block 6G's earlier `All` observation; the discrepancy is unresolved, and no change was made during this inspection. Current official [Deployment Protection documentation](https://vercel.com/docs/deployment-protection) defines Standard Protection as protecting deployments except production domains. Preview deployments are therefore within the reported scope. The Dashboard's Password Protection control was disabled and unchecked.
- **Team roles:** the owning-team Members view showed one team member in total, with the role **Owner (1)**. No other team-role rows were present. Personal identifiers are omitted.
- **Project roles:** the project-members view did not expose a role-count/list result. Its project-role assignment controls were disabled and the page stated that project-role assignment is Enterprise-only. Project-specific counts are unavailable, not zero.
- **Automation bypass:** the settings page displayed one masked `Click to show` secret control and an `Add Secret` control. This indicates a configured entry; the value was not opened, copied or recorded, and validity or use was not tested.
- **OPTIONS allowlist:** the project settings displayed **Disabled** with the control unchecked.
- **Deployment exceptions:** the section showed an Add Domain control but no exception-domain rows or explicit empty-state confirmation. Treat exception status as unavailable rather than disabled.
- **Shareable links:** the project settings section showed explanatory text only, with no safe project-level count/status. No shareable URL was opened or copied; configured link status remains unavailable.
- **Staging hostname:** the candidate's current Domains view contained no `staging.ornigami.com` assignment. Other domain values are omitted. If assigned later as a nonproduction Preview domain, the currently displayed Standard Protection scope would include it; no such assignment exists in the inspected list.

These are configured UI states, not behavioral evidence. No application route was requested, so effective enforcement, actual access for any user, and the practical effect of the masked bypass entry remain unverified. The candidate remains unapproved; NO-GO and all coverage, adoption, campaign, provider and deployment holds remain active. No application tests were needed; `git diff --check` is required before commit.

## Block 6I — read-only deployment-history reconciliation response (2026-10-19)

Using the authenticated Dashboard, I inspected only the already identified `locallift` candidate’s deployment list and Domains page. I did not open deployment details, deployment/application URLs, routes or logs, and made no changes.

- **Accidental CLI preflights:** retained incident evidence identifies the date as 2026-10-19 but contains no clock times or deployment IDs. The visible deployment history contained no 2026-10-19 entries; its newest visible deployment was dated 2026-10-05. Therefore no history record could be matched to either preflight. This bounded list observation does not prove that no remote deployment record or other effect exists.
- **Production source identity:** the newest visible Ready row carrying the Production environment/alias was created **2026-10-05 00:03 CEST**. Dashboard metadata identifies a GitHub-backed deployment from the Ornigami repository, branch `main`, commit `e21249e`. The candidate Domains page lists `ornigami.com` as assigned to Production. Together these identify the latest visible Production deployment and its recorded source. The inspected list did not expose a direct custom-domain-to-deployment ID binding without opening deployment details, so the exact currently serving deployment is not independently proven beyond the Production association shown in those views.
- **Scope and limits:** older Preview and Production rows were also visible, but were not opened. No failure or missing row was treated as proof of absence. The deployment history may be incomplete or subject to retention; this inspection establishes only what was visible in the candidate’s Dashboard list on 2026-10-19.

**Small next block:** if exact incident correlation is still needed, recover timestamps from retained local tool history without replaying the commands, then perform a narrowly time-bounded Dashboard history check. If exact serving-deployment binding is required, inspect only safe domain-assignment metadata in the Dashboard without opening deployment details or logs. Target approval, NO-GO and all existing coverage, adoption, campaign and operational holds remain unchanged.

## Block 6J — read-only existing Neon target inventory response (2026-10-19)

**Historical local evidence.** The existing handoff and privacy records describe a dedicated Ornigami LLC Neon Free organization that was empty at the time of the recorded review, plus a separate existing personal project. Local integration records are summarized as an August linkage metadata file and an October project-list record naming LocalLift; the related inspect record is inconclusive. The portfolio delivery plan says the approved Free staging target is empty/unconnected and requires reconciling the existing LocalLift Vercel/Neon mapping first. These are historical planning observations, not current provider state; they do not give a Neon project name or branch that can be safely matched.

**Current Dashboard observation (2026-10-19).** The authenticated Neon Console opened the currently selected personal-project organization and reported five projects. Its visible/accessibility metadata did not identify a project as Ornigami or LocalLift. The account menu did not expose the historically documented Ornigami LLC organization. I did not open any project, branch, SQL/data view, or project action. No relevant project/branch metadata could therefore be verified: project correspondence, branch names/roles, parentage, default-branch designation, and any current production/staging pairing remain unknown. I did not infer an application database binding from the Vercel project or the existence of a separate Neon branch.

**Blocker and next step.** The available Dashboard scope does not identify the existing LocalLift-linked Neon project, and the local records lack its exact Neon project/organization name. The owner must provide the non-secret organization and project name for the existing Ornigami/LocalLift database, or make that organization visible in the authenticated read-only Dashboard session. Then a single read-only check can inspect only that project’s branch names, roles, parent/default designation, and any documented environment pairing. No database query, branch creation, data copy, configuration change, or spend occurred. No target is selected; existing services/data, NO-GO, coverage/adoption and all other holds remain unchanged.

## Block 6K — Local Lift database mapping and staging-isolation assessment (2026-10-19)

**Owner clarification and Dashboard evidence.** The owner confirms that Ornigami uses the Neon project named **Local Lift**. The authenticated Dashboard shows that matching project in the personal Projects organization (personal organization label omitted); this verifies its organization context for the owner-confirmed mapping. This was a scoped match, not an account-wide duplicate-name search; no other projects were opened. The project is in AWS Europe Central 1 (Frankfurt), on the Free plan. Dashboard branch metadata reports exactly one branch: `production`, marked **Default**, with no parent listed. It is the root/default branch; no staging or other non-default branch is present. Dashboard metadata shows that this branch does not expire automatically.

**Recovery evidence and limits.** The branch’s Backup & Restore view reports a **six-hour history window**. This is available point-in-time history metadata, not a tested restoration, durable backup, export, or recovery proof. No restore action was taken and no database contents were viewed. The six-hour window is not evidence of a suitable staging recovery plan or long-term retention.

**Isolation assessment.** No existing branch is a credible isolated staging candidate: the only branch is named `production` and is the project default. That provider role is not proof of which application environment currently connects to it, nor did this review inspect its contents. A new ordinary Neon branch would, by default, branch from the project’s default branch; Neon describes branching as a copy-on-write clone. It therefore initially exposes the parent’s data unless an approved sanitization process is applied and verified. Neon documents a separate anonymized-branch API as **Beta**; its availability for this project/plan, masking rules, completion behavior, and suitability for this application were not verified. See the official [Create branch reference](https://api-docs.neon.tech/reference/createprojectbranch), [Neon branching use cases](https://api-docs.neon.tech/reference/use-cases), and [Create anonymized branch reference](https://api-docs.neon.tech/reference/createprojectbranchanonymized). Neither a branch name nor the existence of masking functionality establishes sanitized contents, safe integrations, or acceptance.

**Local staging requirements.** `vercel.staging.json` declares no cron schedules; the production `vercel.json` retains three. The staging file’s omission does not disable already registered remote schedules or prevent manual calls. Prior Vercel metadata (Block 6G) listed `DATABASE_URL`, `AUTH_SECRET`, Google client credentials, `NEXT_PUBLIC_APP_URL`, and `OPENAI_API_KEY` in Development/Preview/Production scopes; `AUTH_URL`, `CRON_SECRET`, Stripe credentials/price IDs, `RESEND_API_KEY`, `EMAIL_FROM`, and `REPLY_TO_EMAIL` in Preview/Production; and `RESEND_WEBHOOK_SECRET` in Production only. Names/scopes do not prove values, equality, validity, or target binding. Preview therefore needs a confirmed isolated non-production database binding, staging-origin Auth.js/OAuth configuration and callback registration, and no production credential reuse. Keep `OPENAI_ENABLED` unset/false even if an API-key name is configured; mail and payments must remain disabled or use separately approved non-delivering/test-only integrations. Keep automatic jobs off and verify the actual target’s scheduler state separately.

`neon/README.md` requires applying available migrations in numeric order without renumbering, checking the installed state on existing targets and applying only reviewed missing migrations. It specifically requires pausing/draining intake and jobs, deploying schema before matching consumers, and verifying lifecycle/suppression wrappers for 039–042. `docs/OPERATIONS.md` requires independently matching the approved Neon branch and target before any role mutation. No schema, role, application `DATABASE_URL` binding, staging auth callback, service mode, scheduler state, sanitization result, or restore was verified in this block.

**Recommendation and next block.** Do not use the existing `production` branch for Preview, and do not create a plain child branch under the current no-copy/hold constraints. The smallest next block is an offline staging-data and service-isolation gate: define a synthetic or reviewed masking dataset from the local schema, specify target-specific Preview settings and disabled-service checks, and establish a verifiable restore/cleanup receipt. The one unresolved owner decision before any provider action is whether a temporary production-derived branch for anonymization is acceptable; if not, staging needs an explicitly approved synthetic-data source/target. Only after that decision and independent review should a separately scoped request consider creating a named staging branch in Local Lift, with no Preview application binding until sanitization, isolation, migration compatibility, scheduler-off, and recovery evidence pass. Existing services and data remain untouched. NO-GO and all coverage, adoption, campaign, provider, and deployment holds remain active.

## Block 6L — synthetic staging fixture and isolation checks (2026-10-19)

**Decision and scope.** The owner selected wholly synthetic staging data. No production copy, production-derived anonymization branch, provider operation, database connection, SQL execution, migration, project/branch creation, or environment-file read occurred. The existing A20 local ephemeral fixture helper was reviewed for migration ordering, synthetic identities, and private credential handling, but was not reused as a staging seed: it activates review agents, creates review-reply state, and its local runtime fixture includes fake provider configuration. This fixture is deliberately narrower.

**Files and coverage.** `neon/fixtures/ornigami-staging-synthetic.sql` contains five deterministic synthetic records across `users`, `profiles`, `businesses`, `business_members`, and `reviews`: one fictional owner/workspace and one fictional review. Values use reserved `example.test` names and a synthetic review identifier. No password hash, operational integration credential, connected Google/GBP record, active business agent, draft intended for delivery, subscription/payment state, mail record, queued send, schedule, or provider identifier is seeded. `scripts/staging-synthetic-fixture-core.mjs` and `tests/staging-synthetic-fixture.test.mjs` enforce the exact ordered transaction grammar: five expected INSERT statements, one row per table, fixed approved columns and literal values, and no trailing statement or clause. Exact literals bind the seeded user, business, membership, and review references. The validator also checks referenced migration table/column declarations and rejects unsupported SQL tokens, expressions, functions, and mutation clauses. This remains a deliberately narrow grammar for this one fixture, not a general SQL parser.

This is an offline structural check of the fixture text against local migration source, not SQL parsing by PostgreSQL, migration execution, database state inspection, application login, dashboard rendering, or runtime acceptance. The fixture cannot authenticate a user: it intentionally has no password hash or other sign-in credential. A separately controlled synthetic login credential must be provisioned for any later login test. A seeded review is display data only and does not prove that Google/GBP, payments, mail, AI, or scheduler integrations are disconnected in a deployment. Existing environment variable names/scopes recorded in Block 6K remain unverified as to values or binding; future Preview configuration must explicitly leave production provider credentials out and keep `OPENAI_ENABLED` unset/false, sending/payment paths disabled, and automatic schedules off. Omitting schedule or integration rows here does not enforce those environment controls or disable manual route calls.

**Schema-only target guidance (checked 2026-10-19).** Current official [Neon schema-only branch documentation](https://neon.com/docs/guides/branching-schema-only) marks the feature **Beta** and says Console and API creation are supported; Neon CLI support is future work. It describes a new root branch containing schema but no source data. A schema-only branch has no parent/shared history and cannot be reset from a parent. The Console creation flow offers automatic deletion (default one day; options one hour, one day, seven days, or disabled), while API-created branches have no expiration by default. Neon also warns that restoring a schema-only branch copies both schema and data from a source; restoration could therefore reintroduce data and is not an acceptable routine recovery assumption for synthetic-only staging. The docs list root-branch quotas that vary by plan and shared Free-plan storage limits. No claim is made that this Beta feature is enabled or available for the Local Lift project, that its current Free-plan quota has room, or that a schema-only branch would meet this app's migration/recovery requirements. The Local Lift Dashboard facts in Block 6K remain unchanged: only the `production` default branch was observed, and no staging branch exists.

**Application boundary and next block.** Before any future application, independently approve and verify the exact empty/schema-only target and its migration state; review the complete numbered migration chain and triggers/constraints; then apply schema before this seed under a separately authorized controlled procedure, provision a synthetic login credential outside tracked files, and verify service-disabled configuration and absence of schedules/queued delivery on that isolated target. The smallest next block is a reviewed staging-target provisioning-and-seed plan that first checks schema-only Beta availability/root quota/expiry and migration compatibility read-only, then requests separate authorization before any branch creation or SQL application. No provider or database action is authorized here. Existing services/data are preserved. NO-GO and all coverage, adoption, campaign, provider, and deployment holds remain active.

**Verification.** `node --test tests/staging-synthetic-fixture.test.mjs` passed 5/5 offline structural cases. No database, build, provider, auth, or application runtime was exercised. `node --check scripts/staging-synthetic-fixture-core.mjs`, `node --check tests/staging-synthetic-fixture.test.mjs`, and `git diff --check` passed before commit. This block establishes a reviewable fixture and static isolation checks only.

## Independent review — Block 6L (2026-10-19)

Reviewed commit `a084ae425c5e50814b34aabffd4fb74f0a438459`; initial worktree was clean. Independently reran the five fixture tests, both JavaScript syntax checks and `git diff --check`, all passing. Relevant table declarations/defaults were inspected, but SQL was not executed. The checked-in seed is synthetic on inspection and the missing login credential is honestly disclosed; the new validator does not yet enforce its stated boundary.

**B6L.1 — Validate complete statements and every fixture row.** Two in-memory text mutations were independently accepted with `ok: true`: (a) inserting a second `users` row with a distinct synthetic UUID and `other@outside.invalid`, while retaining the expected owner row; (b) appending `ON CONFLICT (id) DO UPDATE SET name = 'Changed'` to the existing owner insert. No SQL was executed. The first passes because expected identity markers are merely searched globally and duplicate/additional table inserts are permitted. The second passes because the INSERT regex checks only the prefix and does not validate the remaining VALUES statement. Thus the current tests do not establish rejection of all non-approved identity values or mutative SQL as claimed in the handoff.

Implement a bounded full-consumption grammar for this deliberately small literal fixture, or use a suitable existing parser; do not build a general SQL security framework. Enforce expected row/table counts, actual row values/approved identities and cross-row owner/business references. Reject trailing clauses, extra statements/rows, expressions/function calls and nonliteral SQL outside the approved fixture grammar. Add regressions reproducing both accepted mutations and representative inconsistent ownership references; retain the passing canonical fixture and existing negative coverage. A disclaimer about not executing PostgreSQL does not replace these advertised offline checks. Update the handoff to describe the exact verified boundary and remaining execution/runtime limits. Preserve the synthetic-only decision, missing-login-credential limitation and all existing holds. No provider action or SQL execution is needed for this correction.

**B6L.1 response — full-consumption validation (2026-10-19).** Replaced prefix matching with a bounded tokenizer/parser for only the checked-in fixture grammar. It requires `BEGIN;`, exactly one INSERT each in the approved order for `users`, `profiles`, `businesses`, `business_members`, and `reviews`, exactly one row in each, fixed column order, exact synthetic literals, then `COMMIT;` and end-of-input. This rejects additional users or rows, outside identities, `ON CONFLICT` clauses, expressions/functions, unrelated statements, and trailing tokens. The pinned row values enforce user-to-business ownership, membership, and review references. Migration declarations are checked for every referenced table and seeded column, including the later-added review `business_id`.

Added regressions for the reported additional `other@outside.invalid` user, appended `ON CONFLICT ... DO UPDATE`, inconsistent owner/member/review references, expressions/functions and trailing clauses. Existing delivery-table, credential-field, non-reserved-domain, DDL/update/schedule and migration-column regressions remain. `node --test tests/staging-synthetic-fixture.test.mjs` passed 9/9; both `node --check` syntax checks and `git diff --check` passed. These are text-level grammar/schema-source checks only: SQL was not executed and PostgreSQL validity, target state, authentication, integration isolation, dashboard behavior, and runtime acceptance remain unproved. The synthetic-only decision, absent login credential, NO-GO and all existing holds remain unchanged.

## Block 6M — local migration and synthetic-fixture execution (2026-10-19)

**Execution.** Added `scripts/staging-synthetic-postgres-check.mjs` as a repeatable local-only harness. It creates a uniquely named temporary PostgreSQL cluster, database, role and random password; strips inherited project/PG connection settings and never reads `.env` files. The server binds only to `127.0.0.1`. Before applying migration SQL, the helper checks the connected database name, loopback server address, port, `listen_addresses`, and `data_directory` against its newly initialized cluster path. It then discovers available migration files and applies them in numeric order, runs the offline fixture validator, applies the fixture, and checks row counts, ownership references, null login/integration fields, active-agent/schedule state, and integration/delivery/job-state table counts. Password values are never printed.

**Result and provenance.** Command: `node scripts/staging-synthetic-postgres-check.mjs`. Runtime versions: Node `v24.11.1`; PostgreSQL server, `psql`, and `pg_config` `17.9`. All **39 available canonical migration files** applied successfully to the verified disposable local cluster. After migrations and before fixture execution, the five fixture tables each had zero rows. After fixture execution, `users`, `profiles`, `businesses`, `business_members`, and `reviews` each had exactly one row. The expected synthetic owner, profile, business, owner membership and review references were read back successfully. The user has `password_hash IS NULL` and `email_verified IS NULL`; the business has no Stripe customer, Google review URL, rebooking URL, or email sender binding. Twenty inspected integration, agent, delivery-queue and cron-state tables remained at zero before and after the fixture; there were zero active agents and zero active `pg_cron` jobs. The cluster was stopped with `pg_ctl`, its unique temporary directory was removed, and the helper reported cleanup complete. The random password was never printed; the final helper output omits generated database/role names and the temporary data-directory path.

Three initial harness attempts stopped before migration application: Windows process pipes caused `pg_ctl start` to wait to timeout; the next rejected PostgreSQL's CIDR-formatted loopback address; the third queried application tables before migrations had created them. Each attempt cleaned its own temporary cluster. These were harness/setup defects, not canonical migration failures; the final run above passed without modifying migrations or application behavior.

**Verification and limits.** `node --check scripts/staging-synthetic-postgres-check.mjs`, `node --test tests/staging-synthetic-fixture.test.mjs` (9/9), and `git diff --check` passed. This proves local PostgreSQL 17.9 migration/fixture execution and selected local read-back only. It does not establish Neon schema-only availability, target compatibility, Vercel bindings, application login/dashboard behavior, runtime service isolation, hosted schedules, recovery, or staging acceptance. The absent login credential remains intentional. NO-GO and all existing coverage, adoption, campaign, provider and deployment holds remain active.

**Next block.** After independent review, perform a separately authorized target-provisioning gate: read-only confirm schema-only branch availability/quota/expiry and the exact Local Lift target, then separately authorize any isolated branch creation, migration/seed application, synthetic login provisioning, Preview binding and service-isolation verification. No provider or database action is authorized by Block 6M.
## Block 6N — Neon staging provisioning feasibility and proposal (2026-10-19)

**Verified Dashboard facts (read-only, 2026-10-19).** Using the authenticated Neon Console, I navigated to the owner-confirmed **Local Lift** project. It is on the Free plan in AWS Europe Central 1 (Frankfurt). Its branch list showed only `production`, marked Default, with no parent; there is no staging branch. The branch list showed one branch total. Project settings showed PostgreSQL **17**, a 6-hour history window, default compute autoscaling from 0.25–2 CU and scale-to-zero after five minutes. At the later branch-list inspection the production compute showed Active; activity state is time-varying and is not evidence of sustained availability. The project usage panel showed, **since 2026-10-02**, 13.37 CU-hours compute, 35.05 MB Postgres storage, 849.75 kB history and 10.57 MB network transfer. The Console stated that usage metrics may be delayed by up to an hour and are not updated for inactive projects. The organization-context projects summary showed aggregate usage since 2026-10-02 of 171.86 CU-hours, 0.32 GB storage, 0 GB history and 0.1 GB network transfer. That is an aggregate snapshot, not a guaranteed complete or current balance; no SQL or connection details were opened.

I opened (but did not submit) the New Branch dialog. It offered **Branch schema only — Beta** and stated “no data will be included”; the dialog also showed production as the selected schema source and displayed 1.07 GB remaining space. The auto-delete control offered Never, 1 hour, 1 day, 7 days, and Custom (up to 30 days). I selected no creation options and canceled the dialog. No branch or project was created or modified. The displayed remaining-space value is treated as a UI estimate, not a durable quota guarantee.

**Current official capability and limits.** Neon’s [schema-only branch guide](https://neon.com/docs/guides/branching-schema-only) marks this feature Beta and supports Console/API creation (CLI support is future work). The chosen parent supplies schema only; the resulting branch is an independent root with no parent or shared history. Reset-from-parent is unavailable, and Neon documents that restoring a schema-only branch copies both schema and data from the restore source. The guide gives Free-plan limits of 3 roots/project and 1 GB per schema-only branch; its documented Console expiry choices are shorter than the Custom (up to 30 days) option currently visible in this project’s dialog. Recheck expiry at any separately approved creation because the live UI and guide differ.

The current official [Neon plan documentation](https://neon.com/docs/introduction/plans), checked 2026-10-19, states Free limits of 10 branches/project, 100 CU-hours/project per billing month, up to 2 CU, 1 GB Postgres storage/project, 20 GB Postgres storage across all Free-plan projects, and 5 GB public network transfer/project per billing month. All computes in one project count toward that project's compute allowance. Compute and network allowances reset each billing period; storage is a continuous limit. On Free, exhausting project compute or public-network transfer suspends that project's computes until reset or upgrade. Hitting either the project storage cap or account-wide storage cap makes storage-increasing operations fail until space is freed or the plan is upgraded. The current official [schema-only guide](https://neon.com/docs/guides/branching-schema-only) describes the feature as Beta, with no source data copied; the resulting branch is an independent root, and Free permits up to three roots/project and 1 GB per schema-only branch. With one observed root/branch, published counts leave two root slots and nine branch slots, subject to rechecking at creation. These counts do not reserve compute, network or storage for production. The dialog's 1.07 GB remaining-space estimate does not override published caps.

**Shared headroom and reserve.** The project snapshot (13.37 CU-hours, 35.05 MB storage and 10.57 MB network since Oct 2) is accumulated use, not a balance. The aggregate snapshot is also delayed and does not establish the amount or trend attributable to each project. The Dashboard did not provide a reliable forward production usage rate, a guaranteed remaining monthly compute/network balance, or a reserved production allocation. A staging root in Local Lift would draw from the same 100-CU-hour project compute allowance, the same 5-GB/project network allowance, the 1-GB/project storage ceiling and the 20-GB account-wide storage ceiling as applicable existing workloads. These are provider-enforced plan limits; a branch-specific 10-CU-hour/100-MiB stop is not. Storage-only schema creation avoids copying production rows but does not isolate capacity. At the Free compute/network limit, production computes in that project can be suspended; at either storage ceiling, storage-increasing production writes can fail. The current evidence does **not** justify a production reserve, so NO-GO remains for creating a staging branch in the shared Local Lift project.

**Monitoring and expiry.** The authenticated project Monitoring page exposed short-window charts (including last-hour/last-day ranges); the plan documentation lists one day of monitoring history. The Free plan does not include metrics/log export or spending notifications, and the page indicated export requires an upgrade. These are dashboard observations, not provider-enforced staging thresholds or alerts. If an independently approved staging target is later considered, an operator would check project and account usage immediately before each staging session, immediately after each session, and once per active day; record the timestamped usage and compute state; and recheck expiry and usage before cleanup. Treat a usage reading as stale if its timestamp is more than one hour old or absent. Stop staging work before its proposed allocation is reached, whenever a metric is stale/unavailable, whenever usage plus forecast staging demand would cross a documented production reserve, or whenever the production reserve cannot be calculated. The prior proposal contains no numeric staging network allocation; one must be measured against forecast and explicitly approved before use. Do not begin or resume shared-project staging unless compute, network, project storage and account storage all have current measured headroom after the explicit reserve; if a metric is unavailable, preserve NO-GO. Neon enforces published plan caps, not this operator cadence or reserve. The live dialog's Custom auto-delete (up to 30 days) supports proposing an expiry at the cutoff; its exact date/time must be rechecked at approval. The one-day dashboard history is not durable evidence or a recovery guarantee.

**Conditional creation request for independent approval — not submitted.**

- **Name:** `ornigami-staging-synthetic` (verify uniqueness again at approval time).
- **Project/region/plan:** Local Lift, Frankfurt, existing Free plan.
- **Mode and source:** Console **Schema only (Beta)**, with `production` selected solely as the schema source. Neon says no rows are copied. Expected result is a new independent root with no parent/shared history; the production branch itself is not changed.
- **Expiry:** Custom auto-delete at **2026-10-31 23:59 Europe/Madrid**, matching the staging cutoff and within the currently displayed 30-day maximum. Abort if the live picker cannot represent this exact time.
- **Resource/cost ceiling:** remain on Free; no plan upgrade, paid add-on or paid overage. One additional root/branch only. The previously proposed 0.25-CU/10-CU-hour/100-MiB staging caps are operator-monitored limits only and do not protect production or reserve capacity. They may be used only after an operator has measured all current project/account usage and a production reserve for compute, network and storage has been explicitly justified and approved. For each resource, the precondition is: current usage plus the full proposed staging demand plus the documented production reserve stays below the provider limit, with headroom for metric lag. If the current billing-period balance, storage scope, reserve or monitoring freshness cannot be established, do not create the branch in Local Lift. Provider-enforced ceilings remain 100 CU-hours/project/billing month, 5 GB public network transfer/project/billing month, 1 GB Postgres storage/project and 20 GB Postgres storage across Free projects; branch/root counts and maximum compute are separate limits, not a capacity reserve.
- **Preservation check:** record sanitized pre-create project/branch counts, production default/root identity, region, plan, compute and expiry metadata. After any separately approved creation, read back the exact project and new branch identity, confirm the new root has no parent and the original production branch remains default and unchanged; stop on any discrepancy. Do not restore from production.

**Migration-state gate.** A schema-only branch is data-free, **not an empty database**: its schema is inherited from production. Local Lift's currently observed PostgreSQL major is 17, matching the major used by the local PostgreSQL 17.9 migration/fixture verification. That removes the prior major-version uncertainty only; it does not prove hosted compatibility, minor-version equivalence or schema equivalence. The local migration guidance says to apply each available migration once in numeric order, but the repository has no generic applied-migration ledger; the local harness applied the 39 available migrations to an empty database. Therefore do not replay those migrations over inherited objects and do not label the proposed target “empty.” Schema comparison remains unperformed. Its exact later scope is a separately authorized schema-only target, followed by controlled read-only access limited to that exact staging branch's catalog metadata; compare normalized schema objects and migration signatures with the expected result of the canonical local migration chain on PostgreSQL 17, capture only a sanitized pass/fail/difference summary, and do not query production catalogs or rows. No connection string or credential may enter the repo, logs or handoff. Before any later writes, verify exact target project/branch/database identity and PostgreSQL major. If a future observation finds a different major, treat it as **untested**, not incompatible: first run the canonical migration and fixture checks against a disposable local PostgreSQL instance matching that major. Only the local result can establish whether the tested chain/fixture works on that major; it cannot establish hosted acceptance. Keep the separate inherited-schema equivalence gate regardless of major. If the local matching-major check fails, the inherited schema differs, or comparison cannot establish the baseline, stop before writes. Do not replay clean-database migrations on inherited objects or infer that a new Neon project is required solely from version uncertainty.

**Staged verification, recovery and cleanup.** After separate approvals, verify the new branch’s exact identity/root status, selected project version, and data-free creation result using metadata and bounded aggregate/catalog checks; never inspect production rows. Establish the schema baseline before SQL. For this Local Lift schema-only proposal, if catalog comparison proves equivalence to the canonical 042 result, apply only the synthetic fixture; do **not** replay the migration chain. If the schema is not equivalent, stop before writes. For the alternative dedicated empty PostgreSQL 17 project, verify that it has no application objects or rows, then apply the 39 migrations in numeric order and the fixture. In either path, check expected synthetic-only rows and relationships, and confirm no usable login, integration credentials, queued delivery or active schedules. Keep Vercel binding and synthetic login provisioning as later scopes. Preserve sanitized receipts and rebuild from the reviewed schema-only creation path plus canonical repository artifacts if recovery is needed; do not use restore/reset from production, which can reintroduce source data. At explicitly authorized cleanup, verify the recorded project ID, branch ID and exact name before removing only this staging root; read back that it is absent and production remains. Never delete or reset production.

**Recommendation and remaining decisions.** The Console exposes a supported no-row creation mode, and Local Lift has published root/branch-count headroom. However, the live usage snapshots and available monitoring do not establish current safe headroom or a justified production reserve across project compute/network/storage and account storage. The shared-Local-Lift proposal is therefore **NO-GO for creation or SQL**. The exact remaining evidence is a fresh, correctly scoped usage/billing-period view for Local Lift compute and network, fresh project and all-project storage totals, an explicit production reserve based on owner-approved service needs, and a monitoring/stop procedure that leaves sufficient margin for up-to-one-hour metric lag. If those cannot be supplied on the current plan, this shared-project proposal remains held; do not infer that a new project is required from the observed PostgreSQL major. Local Lift is PostgreSQL 17, matching the locally tested major; if a later target observation differs, run the migrations and fixture against matching-major disposable local PostgreSQL before concluding compatibility. The separate inherited-schema equivalence check remains mandatory even with a matching major. A dedicated empty project is only a separate option for future review and approval, not an automatic fallback. Owner approval is still required for Beta schema-only mode, source-schema inheritance, expiry/resource ceilings, monitoring responsibility and any later SQL, Vercel binding, synthetic login, or cleanup. No SQL, creation, binding, login or recovery test was performed in this block. NO-GO and every coverage, adoption, campaign, provider and deployment hold remain active.

## Independent review — Block 6N (2026-10-19)

Reviewed commit `a503dbd976d74ea756a0fc0757176c880760051d`; initial worktree was clean and committed diff checks passed. Official schema-only guidance supports the independent-root/no-row and restore caveats. The reviewer did not repeat authenticated Dashboard observations. The conditional proposal properly remains NO-GO; close the following planning gaps before presenting it for creation approval.

**B6N.1 — Include shared production capacity in the resource gate.** The [current Neon plan reference](https://neon.com/docs/introduction/plans) states that all computes in a project contribute to its compute usage, Free compute/network allowance exhaustion suspends compute, and storage-limit exhaustion blocks storage-increasing operations. Limits include 5 GB public network transfer/project and 20 GB aggregate Free-account Postgres storage, in addition to the project limits already recorded. The proposed 10 CU-hour / 100 MiB staging caps are operator-monitored and do not reserve capacity for production or isolate production from shared-limit exhaustion. Correct the resource proposal to state these consequences explicitly and require measured shared headroom plus a justified production reserve, a defined monitoring cadence and stop condition, and account/project storage and network checks. If the relevant metrics or an adequate production reserve cannot be established, preserve NO-GO for this shared-project proposal; do not treat staying on Free as proof that current services are protected. Do not invent a production usage rate or claim monitoring is provider-enforced.

**B6N.2 — Distinguish untested PostgreSQL versions from incompatibility.** Local PostgreSQL 17.9 success establishes only that tested version; observing a different Local Lift major would establish an untested target, not incompatibility. Add matching-major local migration/fixture validation as the first candidate response to a version mismatch, keeping hosted acceptance separate. A new dedicated project remains an unselected, separately authorized alternative, not a consequence required merely by PG17-only test evidence. Preserve the inherited-schema comparison gate: matching a major alone does not prove schema compatibility, and clean-database migrations must not be replayed blindly over inherited objects.

Correction/preflight follow-up may inspect provider metadata read-only and update this proposal, but must not create a branch/project, execute production/catalog SQL, retrieve secrets, bind Vercel or spend money. Where schema equivalence cannot be established from currently authorized evidence, describe the exact later comparison scope and keep it unverified. All existing holds remain active.

## B6N.1–B6N.2 correction response (2026-10-19)

- **B6N.1:** Rechecked Local Lift and the owner-context usage summary read-only in the authenticated Dashboard. Local Lift shows 13.37 CU-hours, 35.05 MB Postgres storage and 10.57 MB network since Oct 2; the aggregate panel shows 171.86 CU-hours, 0.32 GB storage and 0.1 GB network since Oct 2. Neon warns metrics may lag by an hour and are not updated for inactive projects. These are usage observations, not remaining balances or a justified production reserve. The proposal now separates provider-enforced Free caps from operator checks, describes shared-limit consequences, sets a before/after-session plus daily monitoring cadence and stop rules, and retains **NO-GO** because the Dashboard did not establish production reserve or reliable headroom. Live Monitoring offered short ranges, but Free lacks export and spending notifications; these do not enforce the proposed guardrails.
- **B6N.2:** Local Lift settings expose PostgreSQL 17, matching the major used by the successful local PostgreSQL 17.9 chain/fixture run. This removes current major-version uncertainty only. The proposal now treats any future major mismatch as untested and calls for matching-major disposable local verification before drawing compatibility conclusions. Inherited schema equivalence remains unverified and is a distinct, later, read-only staging-branch catalog-comparison gate; migration replay over inherited schema remains prohibited.

**Sources and limits.** Dashboard checked 2026-10-19; current official [Neon plans](https://neon.com/docs/introduction/plans) and [schema-only branch allowances](https://neon.com/docs/guides/branching-schema-only) checked 2026-10-19. No provider settings were changed; no branch/project was created; no SQL, connection details or production rows were accessed. Expiry controls were inspected and the creation dialog canceled. Existing reviewer notes above are preserved. Synthetic-only data, current services, NO-GO and all coverage, adoption, campaign, provider, deployment and spending holds remain in force.

## Block 6O — isolated empty staging-target proposal (2026-10-19)

**Existing-target reconciliation.** Historical [privacy records](../PRIVACY.md#accounts-and-agreement-evidence) say the dedicated Ornigami LLC Neon organization was Free and had no projects on 2026-10-13. The portfolio plan calls the approved Free staging “empty/unconnected,” but also prohibits creating a new database. Read together with Block 6J, this records an empty company organization/staging intent, not a named reusable Neon project or database. In the authenticated Dashboard session checked 2026-10-19, the organization selector exposed only the personal “Jose” organization; the company organization was not listed. I did not open unrelated projects or inspect any database. Therefore **no reusable target is verified**. The company org and any project in it are unverified, not established absent. Minimum access prerequisite: an authorized company organization owner must make the Ornigami LLC organization visible to this read-only Dashboard session (or provide a company-authorized reviewer with access) so project identity, existing target candidates, plan, project quota and account storage can be checked before creation.

**Proposed target (not selected or created).** If that scoped check finds no suitable empty/unconnected project, request one dedicated empty project owned by the existing Ornigami LLC Neon organization. This is an explicit exception to the portfolio’s current **no-new-database** constraint; the previous empty-organization approval does not itself approve project creation. Proposed identity: project `ornigami-private-staging-pg17-20261019`; one provider-created default root and default database only, with no extra branches, services or copied data. Proposed region is **AWS Europe Central 1 (Frankfurt)**, matching the current Local Lift region and keeping this synthetic test target in the EU; Neon’s official [regional page](https://neon.com/demos/regional-latency) lists Frankfurt for Neon Postgres. This does not establish Vercel region alignment, data-residency compliance or production suitability. Select **PostgreSQL 17** to match the major used in local PostgreSQL 17.9 migration/fixture verification. If the company Dashboard does not offer Frankfurt, PG17 or the Free plan at creation, stop for a new reviewed proposal; do not silently substitute a region, version or paid plan. Exact name uniqueness and organization ownership must be checked before create.

**Plan and resource envelope.** Current official [Neon plans](https://neon.com/docs/introduction/plans), [compute configuration documentation](https://neon.com/docs/manage/endpoints/), and [current CLI project-creation documentation](https://neon.com/blog/just-landed-in-the-neon-cli) were checked 2026-10-19; no CLI was run. Official material describes Free as $0/month, with up to 100 CU-hours/project/billing month, 1 GB Postgres storage/project, 20 GB Postgres storage across Free projects, 5 GB public network transfer/project/billing month, up to 2 CU, and five-minute scale-to-zero; Neon documents fixed computes from 0.25 CU and PG17 project creation. The Free project allowance is 100 projects and the per-project allowance is 10 branches; the target would use one project/root. These are platform limits, not staging budgets. Proposed compute is fixed **0.25 CU** with scale-to-zero after **5 minutes**; operator stops work at **10 CU-hours**. Proposed operator caps are **100 MiB** Postgres storage and **100 MiB** public network transfer. Provider caps remain 1 GB storage/project and 5 GB network/project; Neon does not enforce these smaller staging budgets. No paid overage, upgrade, payment-method change or billing plan selection is in scope.

The 20 GB Free storage ceiling is shared across Free projects. Before creation, require a fresh organization/account usage read showing **at least 1.1 GB available** under that aggregate ceiling: reserve 1 GB for existing company workloads and up to 100 MiB for staging. Reconfirm after creation and before each SQL/write session; stop before the staging cap or reserve is approached. This 1 GB reserve is a proposed operator policy, not a provider reservation. Current company-org project count, storage use, Free eligibility and remaining project quota are unknown because the org is inaccessible; these gates are not passed. If fresh totals, a 1.1 GB reserve or an empty project slot cannot be demonstrated, do not create. A dedicated project separates its compute and network quotas from Local Lift’s project-level quotas, but it still shares the Free account-wide storage ceiling and does not remove Neon account/service/privacy risks.

**Ownership, agreements and expiry.** The proposed owner is the Ornigami LLC company organization, operated by an authorized company organization admin; the current admin role and membership are not verified. The local privacy record says company acceptance was under Neon’s Product Schedule and incorporated MCSA/DPA framework, but no separate electronically executed DPA copy was captured. Neon’s current [Product-Specific Schedule](https://neon.com/platform-terms), last updated 2026-10-14, states that a person accepting for a company represents authority to bind that company and that fees depend on the selected plan and usage. Before project creation, the owner must confirm current agreement scope, authority, applicable DPA/subprocessor terms, and that Free/$0 remains selected. Use only the approved synthetic fixture (`example.test` identities); never copy production data. Synthetic-only data does not waive company/provider terms or make later real-person processing approved. Frankfurt is a proposed location, not a legal/privacy determination.

The required cleanup target is **2026-10-31 23:59 Europe/Madrid**. No project-level automatic expiry has been verified; the documented expiry control is for branches, not proof of project TTL. Use a manual, owner-approved cleanup. Preserve a private record of exact company organization, project ID, exact name, region, plan and creation date. At cleanup, first stop any authorized client use, then re-read and match organization plus project ID/name/region, confirm this exact project contains only the intended synthetic staging state, and delete only that project. Read back that its project entry is absent and the company organization remains. If identity is ambiguous, unexpected data/resources appear, access is unavailable, or deletion/read-back fails, stop and report; do not delete by name alone, touch another project, or claim that every provider-retained backup/residual copy has expired. Any non-synthetic retention/residual-copy period remains unverified and must be resolved before real data is introduced.

**Ordered verification proposal (no SQL or binding authorized here).**

1. Restore read-only access to the company organization. Inspect only its project list and aggregate usage/plan metadata. Determine whether a suitable empty target already exists; if so, verify exact organization/project identity and do not create another. Otherwise verify Free eligibility, unique proposed name, project quota, Frankfurt/PG17 selection, fresh storage usage and the 1.1 GB reserve.
2. After separate creation approval, create only the named Free project with Frankfurt, PostgreSQL 17, one default root/database, 0.25 CU compute and five-minute scale-to-zero. Read back organization, project ID/name, plan, region, major version, root/default status and compute settings. Stop on any mismatch; do not retain or expose connection details.
3. Before schema writes, use a separately authorized, controlled project-scoped read-only catalog check to confirm the new target has no application-owned tables/data beyond provider defaults. Record a sanitized empty-baseline result. Do not query Local Lift or any production catalog/data. If the baseline is not empty or exact identity cannot be proved, stop.
4. In a later separately reviewed SQL block, apply the 39 canonical migrations in numeric order to this empty PostgreSQL 17 target only; verify each migration completes and record sanitized applied-state evidence. Then run the offline fixture validator and apply `neon/fixtures/ornigami-staging-synthetic.sql` once. Do not create login credentials, integration bindings, queued work, schedules or provider credentials.
5. Read back expected synthetic users/business/membership/review relationships, absence of database-stored integration-binding records (where modeled) and actionable delivery rows, and usage against the operator caps. Preserve sanitized receipts without connection strings, row dumps or secret values. Database read-back does not prove that external credentials, Vercel variables or provider accounts are absent, nor does it establish application login or runtime isolation.
6. Keep the project unbound: no Vercel Preview variable, login credential, route invocation or application deployment is included. Request those as separate scopes only after this database baseline is reviewed.
7. At the cleanup date, follow the exact-owned manual deletion/read-back procedure above. Preserve the final sanitized receipt and report any unresolved provider residual-retention question.

**Exact approval request — pending independent review; not authorization to act.** Approve an explicit exception to the portfolio no-new-database rule to create exactly one Neon Free project named `ornigami-private-staging-pg17-20261019` in the existing Ornigami LLC organization, only after organization access, no-reusable-target status, Free/project quota, Frankfurt/PG17 availability and the 1.1 GB aggregate-storage reserve are verified. The requested provider mutations are: (1) create that one project with one default root/database, Frankfurt and PostgreSQL 17; (2) set or confirm its compute at fixed 0.25 CU with five-minute scale-to-zero; and (3) on 2026-10-31 23:59 Europe/Madrid, manually delete only the recorded exact project after ownership checks and perform absence read-back. No upgrades, paid usage, extra project/branch, SQL migration/fixture, credentials, Vercel binding, route call, deployment or change to Local Lift is included. Migration/fixture SQL requires a later separate approval after empty-baseline verification. If the company org is not made accessible or any precondition fails, no creation request can proceed. No provider mutation was performed in Block 6O. All existing NO-GO, coverage, adoption, campaign, deployment, privacy and operational holds remain active.

## Block 6P — company staging-target eligibility check (2026-10-19)

**Correction to Block 6O access status.** At 2026-10-19 15:02 UTC, the authenticated Neon Dashboard was open to the Ornigami LLC organization. The organization People view showed one member, with the current account holding **Admin**; personal identity details are omitted. This supersedes Block 6O’s then-current-session access blocker. No account or project setting was changed.

**Current company-org facts.** Billing shows the organization on Neon **Free ($0/month)**. The project list contains two company projects; I inspected only `ornigami-fictional-staging`. The other project was not opened. The Ornigami candidate is in AWS Europe Central 1 (Frankfurt), was created 2026-10-18, and has one branch. Its default branch is `fictional-staging`, marked Default, with Never expiration. Project/branch metadata shows one Postgres database and one compute, PostgreSQL **17**, default compute **0.25 CU**, and six-hour history retention. This candidate already satisfies the proposed region, major-version and default-compute settings without any creation flow. No new project was created, and no new-project option selector was opened or claimed selectable.

The Dashboard usage panels, observed 2026-10-19, report for this candidate since Oct 13: 0.03 CU-hours, 30.92 MB Postgres storage, 7.83 MB history, and 0 network transfer. The company-project overview reports 0.05 CU-hours, 0.06 GB storage, 0.02 GB history, and 0 GB network transfer for the same period. The UI warns that metrics may be delayed by an hour and are not updated for inactive projects. Project settings show no object storage currently used. These are Dashboard metrics, not a fresh catalog baseline or proof that the database has no application data.

**Quota scope and headroom.** The current [official Neon plan documentation](https://neon.com/docs/introduction/plans), checked 2026-10-19, lists Free at 100 projects, 10 branches per project, 100 CU-hours per project/month, 1 GB Postgres storage per project, **20 GB account-total storage across Free projects**, 5 GB public network transfer per project, and up to 2 CU. The company Dashboard shows two projects and the organization-scoped usage above. That organization view does not establish all Free-project storage or project count across the account, or whether any other organization’s projects are included in the displayed total. Therefore the earlier proposed 1.1 GB account-wide storage headroom and production reserve are **not verified**. Do not calculate aggregate headroom by subtracting the company-only 0.06 GB from the 20 GB account cap. Current account-wide usage, the exact aggregation scope, metric freshness for inactive projects, and a justified reserve for existing workloads remain unproved. The existing candidate is already provisioned, so there is no reason to create another project to establish eligibility; no additional capacity is assumed available for writes.

**Target reconciliation and recommendation.** Block 6O’s local evidence documented an approved empty staging intent and an empty company organization as of 2026-10-13, but it did not identify this project by name or prove that the current project is the approved empty target. The live project name and setup make `ornigami-fictional-staging` the only inspected, credible existing Ornigami candidate; they do **not** establish its approval history or emptiness. Its reported 30.92 MB storage is nonzero, but that metric alone cannot distinguish provider/application defaults from application data. No Tables, SQL Editor, database contents, connection details, or credentials were inspected.

**Recommendation — reuse conditionally; do not create a replacement.** Keep this project as the candidate and supersede Block 6O’s proposed new-project creation as the immediate next step. Before any migration, fixture, application binding or write, obtain owner confirmation that this exact existing project is the intended/approved company staging target, then perform a separately authorized, project-scoped read-only catalog/baseline check proving the target contains no application-owned schema/data beyond documented provider defaults. Record exact organization/project/branch identity and a sanitized baseline result. If identity, approval or empty-baseline proof fails, stop; do not use this project or create another. In that case the Block 6O explicit no-new-database exception request remains required and must be reviewed again with fresh account-wide quota/headroom evidence. No SQL or baseline query was run in Block 6P.

**Remaining gaps and next action.** Account-wide Free-project usage/count and storage headroom are not evidenced by the organization-scoped view; the company production reserve is not justified; the current candidate’s empty baseline and prior approval mapping remain unverified; and agreement/privacy acceptance remains governed by the prior hold. The smallest next block is an owner-confirmed, read-only eligibility baseline for this exact existing candidate, preceded by a current account-wide usage-scope check that does not inspect unrelated database contents. Only after that review should a separately scoped SQL block apply migrations and the synthetic fixture. All NO-GO, coverage, adoption, campaign, deployment, privacy and operational holds remain active.

## Block 6Q — read-only staging candidate baseline (2026-10-19)

**Scope and target confirmation.** The owner delegated target selection for this read-only check. In the authenticated Neon Dashboard, I opened only the Ornigami LLC organization’s `ornigami-fictional-staging` project and its `fictional-staging` default branch. The branch overview and selected SQL Editor route matched that exact project/branch; the editor URL selected database `ornigami_staging`. The project remains Free, Frankfurt and PostgreSQL 17 per its Dashboard metadata. No production/Local Lift route or project was opened. Provider IDs, connection strings and credentials are intentionally omitted.

**Read-only catalog checks.** In the SQL Editor for that exact selected database, I ran two bounded transactions: each began `READ ONLY`, set transaction-local `statement_timeout` to **5 seconds**, queried catalog metadata, and ended with `ROLLBACK`. The first returned database identity `ornigami_staging`, server version **PostgreSQL 17.11** (`server_version_num` 170011), and the catalog listings. The second returned explicit aggregate counts and empty inventories. Both completed successfully; observed query execution was about 0.1 seconds. The queries read no application/customer rows, defaults, function bodies, connection details or credentials, and ran no DDL/DML.

Results: the only non-system schema is `public`; it has **0** relations of the inspected table, partitioned-table, view, materialized-view, sequence, foreign-table and index kinds; **0** non-system routines; and **0** custom composite, domain, enum or range types. The only installed extension is `plpgsql` 1.0 in `pg_catalog`. PostgreSQL documents `public` as present in each new database ([PostgreSQL 17 schema documentation](https://www.postgresql.org/docs/17/ddl-schemas.html)); Neon documents `plpgsql` as active by default in every Neon database ([Neon extension overview](https://neon.com/blog/ten-most-popular-postgres-extensions)). These observed defaults are not application-owned migration objects. No application-owned schema, relation, routine, custom type or non-default extension was found in the inspected catalog scope. No migration ledger or canonical migration object exists in the inspected relation inventory.

**Conclusion.** The exact selected target has a clean application-object catalog baseline and is suitable as an **empty application baseline for later canonical migrations**, subject to the remaining approvals and capacity gate. This is catalog evidence, not proof about every possible provider-internal object, non-catalog payload, external service, Vercel binding, runtime or recovery behavior. No migration or fixture was applied, no login was provisioned, and no staging acceptance is claimed. Selecting this project for the delegated read-only check does not by itself satisfy operational adoption, privacy/agreement, or write authorization.

**Usage/capacity and remaining gaps.** The company organization’s usage panel, refreshed after the checks, still reports since Oct 13: **0.05 CU-hours, 0.06 GB storage, 0.02 GB history and 0 GB network transfer** across its visible organization scope. The panel warns that metrics may lag by up to an hour and do not update for inactive projects. This does not establish account-wide Free-project totals or safe account storage headroom; the 20 GB account-total Free storage limit and exact account aggregation scope remain as recorded in Block 6P. The existing production reserve, provider/privacy agreement acceptance, coverage hold and adoption hold also remain unresolved.

**Next SQL scope — proposed, not authorized.** First review this baseline and establish fresh, correctly scoped account-wide capacity evidence plus the required production reserve and existing owner/policy approvals. Only after those gates are satisfied and a separate write authorization is given, apply the **39 canonical migrations in numeric order** to this exact empty-baseline database, recording each result; then run the existing offline fixture validator and apply the synthetic fixture once. Do not copy Local Lift data, add credentials/integrations, create login access or activate delivery work. Stop on any target identity change, unexpected pre-existing object, migration error or capacity/approval gap. No writes occurred in Block 6Q. All NO-GO, coverage, adoption, campaign, deployment, privacy and operational holds remain active.

## Block 6R — final pre-write assessment and migration request (2026-10-19)

**Correction to Block 6Q capacity wording.** Its reference to a “required production reserve” is not established for this dedicated project’s compute/network: Neon Free allowances are per project, and no cited policy requires reserving Local Lift’s project-specific CU-hours or network transfer for this separate project. Do not carry that reserve forward. The remaining capacity gate is actual headroom under the 1 GB per-project Postgres storage cap and the shared 20 GB Free storage total, whose account aggregation/usage remains unresolved.

### Read-only capacity finding

**Verified target.** Reuse only `Ornigami LLC / ornigami-fictional-staging / fictional-staging / ornigami_staging`, PostgreSQL **17.11**, Frankfurt. Block 6Q’s bounded read-only catalog check is the reported empty application baseline; it found no application-owned objects in its stated catalog scope. The current Neon Dashboard organization usage panel covers the two projects visible under Ornigami LLC and reports since Oct 13: **0.05 CU-hours, 0.06 GB Postgres storage, 0.02 GB history, 0 GB network**. The panel warns of up to one hour’s delay and no updates for inactive projects. The inspected staging project’s current Dashboard figures are **0.03 CU-hours, 30.92 MB Postgres storage, 7.83 MB history, 0 GB network**. These are recent observations, not a forecast or a complete account-wide total.

**Limit scope.** Neon’s current [Free plan documentation](https://neon.com/docs/introduction/plans) states 100 CU-hours **per project per month**, 1 GB Postgres storage per project, 5 GB public network transfer per project, and **20 GB storage total across all Free projects/account**. Compute and network exhaustion suspend compute; the per-project compute/network budgets therefore do not draw on Local Lift’s budgets. No additional Local Lift compute/network reserve is required for this separate project. No project creation or upgrade is proposed. Storage is the shared constraint: the official text says “all Free projects” and “account total,” while this Dashboard exposes only Ornigami LLC’s two-project scope. It does not establish whether the account-total ceiling spans separate organizations under the same login, nor how much storage other Free projects consume. Thus the **0.06 GB organization figure is not sufficient evidence of remaining shared storage headroom**. Exact aggregate scope and current total remain unresolved; do not infer them from an organization view or the project’s 30.92 MB. No arbitrary production reserve is imposed; require a fresh account-scope total/headroom confirmation before writes and stop if the total cannot be established. Official Free limits are provider-enforced; usage-panel readings are delayed observations, not a protective quota reservation. Dashboard monitoring should be checked immediately before and after the bounded write, and stopped if storage headroom is unclear or any per-project cap/compute/network exhaustion warning appears. No upgrade, overage, or production-impacting action is authorized.

### Policy and approval boundary

The historical [staging decision record](../../../../VPS/projects/ORNIGAMI_STAGING_DECISIONS.md), entry “empty fictional Neon project,” says this empty fictional project was separately authorized and created. The [delivery plan](../../../../VPS/projects/ORNIGAMI_DELIVERY_PLAN.md), lines 17 and 55, prohibits a **new** database, production-data copy, and database move; it directs review of the current 39 migrations in numeric order for an empty approved target and explicitly says a prepared manifest authorizes no SQL. Its dated phase schedule places isolated SQL/profile scopes after accepted-image review (delivery plan lines 14–15; `docs/ROADMAP.md` lines 14–19). No accepted application image currently exists. Therefore existing project creation approval is not migration/seed approval, and a run now would depart from the planned sequence. **No blanket prohibition on synthetic-only schema initialization was found**, but execution before image acceptance needs an explicit owner-approved sequencing exception; otherwise wait for that sequence. Request only the specific database writes below. The CVE coverage hold in `ORNIGAMI_SECURITY_CLOSURE.md` blocks security acceptance; that source says security acceptance does not itself authorize database writes. The separate maintenance/adoption hold in `ORNIGAMI_MAINTENANCE_DECISION.md` governs operational adoption and assigned backup/security duties. Neither is silently waived or represented as closed by a database-only request; no app deployment, service activation, or adoption follows from SQL approval. Privacy/agreement requirements remain those in the existing delivery plan and are not accepted by this request.

### Frozen local inputs for a later approved run

The repository currently contains **39** `neon/migrations/*.sql` files. SHA-256 values below were computed from current worktree bytes on 2026-10-19, in numeric application order. They are a review manifest, not migration execution evidence; recompute and compare immediately before any authorized run. `018` is intentionally absent and `029`–`030` are reserved per `neon/README.md`. The fixture is also byte-hashed. Do not execute if any path, byte hash, target identity, or approved scope differs.

| Order | Migration | SHA-256 |
|---:|---|---|
| 1 | `001_initial.sql` | `868c315a8fedfb11c02c1cde4630a866e0e1b3f46b0e42526e7a6008c494d269` |
| 2 | `002_auto_reply_profiles.sql` | `7dac93ff5f898ad4ab4996e6c4f43fa46ed0476e4033ba81cabc0861686af51a` |
| 3 | `003_business_foundation.sql` | `6e6d4f3b868777c916952a5462a08b7de01a11336b9068de93951aa8f2036488` |
| 4 | `004_review_booster_tables.sql` | `d09d4ae69a00b027cb4b4c589fe0ab6e77f7a74e5fe63a982a3ef2e2fd3570bc` |
| 5 | `005_business_agent_billing_fields.sql` | `26b4fa1c8f7604f5f8906e0ea2ab205faf2e318d9f927c3c53cddd7850f75a5b` |
| 6 | `006_public_demo_events.sql` | `a43aaab33b0a9c4a6eeed844fd1669e511b1ba3d38a5c09ad183bd877e5f371e` |
| 7 | `007_review_booster_unsubscribes.sql` | `2d78e5a5a1b19111feede22353c333584103314370a5aa9af305dd4a67f106f0` |
| 8 | `008_pricing_plans.sql` | `799c4fa51100ae3c716b91ea4b897ce2b4d9d4eb0514e61d088038b9e7e97408` |
| 9 | `009_review_booster_error_reason.sql` | `54d6f6c8bc6bdfbfb4bee065b4885a53a4d28e98cf79ff9a8e982d74032fb47a` |
| 10 | `010_review_booster_retries.sql` | `8c9ba0b556e327849439e5f6dce510ff391fbaad5037f593eedcbbacf53db313` |
| 11 | `011_review_link_clicks.sql` | `1dbfc78651bbd7a093c94c948d54decbebab5c4d64f7d081f9eb46bde7d4ccef` |
| 12 | `012_cron_runs.sql` | `ebe756348a26054692721ef41120a8865e96498f1fb6a6fe794eadab4ecf9116` |
| 13 | `013_review_business_tenancy.sql` | `c2c2de5ad7a70b46275eccfa69f14ff9c9005e5cb36ef697a64e1950cc57efdd` |
| 14 | `014_security_hardening.sql` | `d65ea199e4871b8dcd8ca9b5e93b2acfb301aabc02b04b7a652b93de18293846` |
| 15 | `015_stripe_usage_periods.sql` | `c9bcf0f1df53641dc455a04992bc98c5f8738caff4b0a617844d72c6c8bc3d5c` |
| 16 | `016_remove_legacy_plan_taxonomy.sql` | `7a5fb81d1292ce49d0088bdeba179b0d1f5871e9c42cfd7ad9e30a5d83e1c4a3` |
| 17 | `017_team_invitations.sql` | `8c7d0b0b1e71c323c166ac0989bb7f0f01c82a59d4dc045fe44f75b18a430628` |
| 18 | `019_billing_lifecycle.sql` | `631a9232859abc279cc99b38c6c565f2303741d9729e4107fdf4c5bc4de9dd93` |
| 19 | `020_account_recovery.sql` | `a0c3d5f80497f838d4995ff251764480393fd858987b68e049d2035246d93583` |
| 20 | `021_workspace_invitations.sql` | `fe981ebf24456b566e1c458eadd8d88aa8924634faaa857f06a34c353c0aade1` |
| 21 | `022_booster_delivery_quotas.sql` | `ba688b32d4dbd91c788e6969b668a4990e46adc72fb1456da637ff9064473def` |
| 22 | `023_booking_intake.sql` | `d553a2fca06312085ac17ce10ecad62c8e907d8561644449b3d19e9b69a0d0eb` |
| 23 | `024_review_draft_policy.sql` | `2edf30e87a57c786ea7b9c44a5491f601377946d0c637a897f7a7bd7ea3f2c11` |
| 24 | `025_email_delivery_events.sql` | `aa1a7338347a6b1d5406465049a031c68a2a7c39dc689f104e8be0e697614d60` |
| 25 | `026_privacy_account_lifecycle.sql` | `6ef1b7ba60f4e19cdf95a2ce47713f0322e57ae50e1f26933f7762d4b7a293b0` |
| 26 | `027_cron_operations.sql` | `5692530b02b2556cd947bf71170539947e2f9c3a5ab9afeef2faa2e68c901b9d` |
| 27 | `028_dashboard_pagination.sql` | `398634729e50833af45c7f51b43bb70a3e96e5af08184896a4b8f894651bf6e1` |
| 28 | `031_google_location_selection.sql` | `2e7e30895e192e495cd6e6a728864c3208a0128e479e54a81c72cef5a761d356` |
| 29 | `032_workspace_bootstrap.sql` | `5750ae172fe05c6e92749df874036e810237a9b4a3552eddea977fb6d67625c7` |
| 30 | `033_account_lifecycle_auth_team.sql` | `c2c833de2cf1956254b0c73cef7413748db27e5a0dd5dcaf00b122d1575efa99` |
| 31 | `034_account_lifecycle_billing.sql` | `e2eee15110102111e043850b575a638713f3afe586af0c0f90c0b7279eff2b15` |
| 32 | `035_account_lifecycle_replies.sql` | `b422b9a395ba9aa707b31148f28cb096d3889395a0f793b18d909941ca248bdf` |
| 33 | `036_account_lifecycle_booster.sql` | `e809f974f12f5f91560bb5d9ee0e0adfd4bd801111cbb321e7f51e38ac702df7` |
| 34 | `037_account_lifecycle_finalization.sql` | `2928907c27ad1ad7d283509d56169f91f506b095782617af7f49ac3189a04c59` |
| 35 | `038_booster_intake_lifecycle.sql` | `26ee67bd2109fa0560eafe0b7fee5b9eeb2c30dd092f46f4c4cda3c08684b2df` |
| 36 | `039_billing_lease_duplicate_alias.sql` | `41a03078c04dcb519529155f51807343c60fa01635bf6b52b2f90c701a5a268a` |
| 37 | `040_permission_evidence.sql` | `b67af001059d0bdd014468bf3e77fac01377614a5fb0608ec905e73779ccad46` |
| 38 | `041_guarded_retention.sql` | `c4ee478b646983a4dd25389345e06ec3b20d3309994258613e693827bd5a028d` |
| 39 | `042_cron_expected_jobs.sql` | `b063b0274634a9a188ccf03b93590b4e896a2f94019b5fdd72844bfab77242a7` |

Fixture `neon/fixtures/ornigami-staging-synthetic.sql` SHA-256: `2d53d5a6f0be9aab44151f6ceda2b8a4c7ac8e09965742ad865b72f1ba05283e`.

### Bounded procedure and exact request

**Proposed execution order (no work in this block).** After independent review, explicit write approval, and the storage-scope precondition below:

1. Read-only preflight: re-confirm the organization, project, branch, database and PostgreSQL 17.11 identity from Dashboard plus the selected SQL Editor; if any differ, stop. In a short `READ ONLY` transaction with a statement timeout, repeat Block 6Q’s catalog baseline checks. Require the same empty application-object baseline before any write. Verify current usage and the effective Free storage aggregation scope; require enough actual headroom under the 1 GB project and 20 GB shared Free limits for this run, with no plan upgrade or assumed production reserve. If the total cannot be established, stop before SQL.
2. Recompute SHA-256 for all 39 listed files and the fixture. Compare exact path/count/order/hash with this handoff and the separately approved manifest; any mismatch means stop. Validate the fixture with `node --test tests/staging-synthetic-fixture.test.mjs` offline; do not treat that as database evidence.
3. Apply one migration at a time in numeric order, including 039–042, using the documented migration procedure and preserving each script’s transaction behavior. Stop at the first nonzero/error result. Record sanitized filename/hash, prior successful filenames/hashes, failure status and read-only post-failure object inventory. Do not continue to the next migration, retry, edit the target, roll back by ad hoc DDL, drop/reset the database, or seed after a failure. Preserve partial schema for review; any repair/restore requires a new exact scope and approval.
4. Only after all 39 succeed, apply the exact fixture once. It contains 1 synthetic user, profile, business, membership and review in one explicit transaction; it has no password hash, provider binding, queued delivery, active agent or schedule and cannot authenticate. Re-run the offline literal-fixture validator first. Read back only aggregate expected counts and reference-consistency checks; confirm zero integration bindings/usable credentials, active agents, queued sends and active schedules. Do not print row contents. A mismatch fails the run and stops further changes.
5. Capture before/after Dashboard usage and sanitized SQL receipts. If an error, timeout, identity drift, partial transaction, usage threshold/limit warning, or read-back mismatch occurs, stop immediately and report what is known versus unproved. Do not claim rollback or recovery from the Free six-hour history setting; no restore was tested and no snapshot is authorized here. Preserve the failed state and its exact migration/fixture receipts for review; do not retry or delete. If recovery is later needed, first verify a usable pre-run point still exists in the target’s history, then obtain separate exact approval for the point-in-time restore and verify the restored target identity/catalog afterward. If that point is unavailable or unverified, leave the partial target untouched pending a separately reviewed recovery plan. No automated cleanup or project deletion is in scope.

**Approval request — database-only initialization.** Owner approval is requested for exactly these hosted SQL mutations, and nothing else: on `Ornigami LLC / ornigami-fictional-staging / fictional-staging / ornigami_staging` (PostgreSQL 17.11), apply the 39 hash-pinned canonical migrations in the table above in numeric order, then insert the hash-pinned synthetic fixture once, subject to the preflight and stop rules above. This uses the existing separately approved project and reported empty baseline; it creates no project/branch, does not copy production data, and changes no provider settings. Approval is **not executable** until fresh account-wide Free-storage scope/headroom is evidenced. The delivery plan schedules isolated SQL after accepted-image review; if the owner wants this database-only initialization earlier, the same approval must expressly approve that sequencing exception. Otherwise wait until the documented sequence. Login/password provisioning, integration credentials, Vercel binding, mail/payments/AI, cron/schedules, application deployment, DNS, production changes, restore operations, project cleanup/deletion, policy waivers and operational adoption are excluded.

**Outstanding evidence and status.** Obtain one sanitized Neon usage/billing confirmation that resolves whether the 20 GB Free storage aggregate crosses organizations for this account and reports the total used/headroom across all applicable Free projects; no unrelated database contents are needed. Keep the metrics’ up-to-one-hour lag in the preflight. If Neon cannot expose a complete read-only aggregate, the minimum next action is an owner/Neon support confirmation of that aggregation scope and usage total; do not guess or run the SQL. Separately, the owner’s explicit scoped approval (and, if before accepted-image review, explicit sequencing exception) is still required. No hosted SQL, provider mutation, credential access, deployment, or spending occurred. The empty baseline is suitable for the proposed later migration run but is not migration, application, recovery, security, staging, or runtime acceptance. Coverage, adoption, campaign and deployment holds remain active.

## Independent review — Block 6R (2026-10-19)

Reviewed commit `ad37c94c0ed319b9a3c4b12398d5621e3afd2ee5`; initial working tree was clean and committed diff checks passed. Independently recomputed every migration and fixture SHA-256 from filesystem bytes. The prior staging decision record supports separate authorization of the existing empty fictional project; the proposal correctly distinguishes that from SQL write approval. No provider queries or hosted SQL were performed during this review.

**B6R.1 — Correct and fully verify the frozen manifest.** The row for `009_review_booster_error_reason.sql` records a 63-character digest, `54d6f6c8bc6bdfbfb4bee065b4885a53a4d28e98cf79ff9a8e982d74032fb47`. The actual SHA-256 is `54d6f6c8bc6bdfbfb4bee065b4885a53a4d28e98cf79ff9a8e982d74032fb47a`. The final `a` is missing. The other 38 migration hashes and the fixture hash match. Correct the row with a dated correction record, then validate the complete table against the actual ordered migration list: exactly 39 unique paths, matching numeric order, no omissions/extras, every digest exactly 64 lowercase hexadecimal characters, and every digest equal to the corresponding file bytes. Validate the fixture digest too. Parse all manifest rows before checking hash syntax so a malformed hash cannot silently remove a row from verification. No migration/fixture file should change. Preserve the account-storage evidence blocker and separate scoped write/sequencing approval requirements. Do not execute hosted SQL or proceed on the malformed manifest.

### B6R.1 correction — 2026-10-19

Corrected the `009_review_booster_error_reason.sql` manifest digest by restoring its final `a`. Parsed every Markdown manifest row before validating any digest syntax, then compared the complete ordered table against all available migration files and their SHA-256 hashes.

Verification passed: **39 rows, 39 unique paths, exact file-set and numeric-order correspondence, zero omissions/extras/duplicates; every digest is 64 lowercase hexadecimal characters and matches its file bytes.** The fixture digest also has the required syntax and matches `neon/fixtures/ornigami-staging-synthetic.sql`. No migration or fixture changed. `git diff --check` passed. The shared Free-storage aggregation/headroom blocker, separate scoped write approval, and pre-accepted-image sequencing approval remain; no hosted SQL or provider action occurred. All prior coverage/adoption and other holds remain active.

## Block 6S — shared Free-storage scope check (2026-10-19)

**Official documentation checked (2026-10-19).** Neon’s [plan documentation](https://neon.com/docs/introduction/plans) states that Free includes 1 GB Postgres storage per project and a 20 GB total “across all projects” / “account total.” It does not explicitly define whether “account” means one organization/billing account or all organizations accessible to one Neon user. Neon’s [organization guidance](https://neon.com/docs/manage/orgs-manage) says each organization selects its own plan and manages its own billing. The [organization usage API guide](https://neon.com/docs/manage/orgs-api-consumption) describes usage queries scoped by `org_id` over projects belonging to that organization; it does not resolve whether the Free 20 GB ceiling crosses organizations. No authenticated API or CLI was used.

**Dashboard scope and current evidence.** At **2026-10-19 15:29 UTC** (17:29 Europe/Madrid), the authenticated account/org switcher showed Ornigami LLC as the only organization entry visible in this session. Its plan is Free. Its Projects page listed **2 projects**: the selected Ornigami staging target and one additional project. No other project was opened. The organization usage panel reported, since Oct 13, **0.05 CU-hours, 0.06 GB storage, 0.02 GB history and 0 GB network**. The page explicitly warns metrics may lag by one hour and are not updated for inactive projects. The project-list storage column displayed `-` for both entries; one project’s compute was last active 19 minutes earlier and the other 2 days earlier. Thus the visible organization total has no complete per-project breakdown and may omit or stale the inactive project’s storage. The billing page displays Free entitlements per project but no account-wide storage ledger. These observations do not establish the complete used total or the headroom.

**Scope conclusion and precise blocker.** Official records establish organization-specific billing and organization-scoped project usage, but do not explicitly tie the Free “account total” to that same organization scope. The visible switcher and two-project list are evidence for this organization only, not proof that the full Free aggregate includes only those projects. Even assuming organization scope, the storage dashboard’s inactive-project warning and unavailable (`-`) project sizes prevent a complete current total. **Shared-storage capacity is therefore still unestablished; do not run the bounded migration/fixture request.**

**One question for Neon/account administration:** “For the Ornigami LLC Free plan, does the 20 GB Postgres storage total apply to all projects in this organization, or across all organizations belonging to the Neon user/account? Please provide a timestamped, complete read-only storage-usage report that identifies the applicable scope and includes every Free project in it, including inactive projects, with the metric time/lag and any excluded or unavailable projects.” The minimum evidence is Neon’s explicit scope definition plus that complete timestamped total and coverage; no database contents, secrets, or project credentials are needed. No support message has been sent.

The migration manifest and fixture hashes are unchanged and remain verified by B6R.1. The existing exact migration/seed request is unchanged, including the separate owner write approval and explicit sequencing exception if run before accepted-image review. Storage evidence is not a pass; no SQL, migration, provider change, deployment or spending occurred. All existing holds remain active.

## Block 6U — conservative Free-storage capacity bound (2026-10-19)

**Correction to Blocks 6S–6T.** Their request for a Neon support response is superseded for the capacity decision below. No support clarification is needed if the complete visible account-organization inventory and the documented per-project hard caps yield a sufficient conservative bound. The historical observations in 6S–6T remain accurate; this correction does not claim exact used storage or resolve Neon’s “account total” terminology.

**Current official limits.** Neon’s [Free plan documentation](https://neon.com/docs/introduction/plans), checked 2026-10-19, states 1 GB Postgres storage per Free project and a 20 GB total across all Free projects/account. Neon’s [organization guidance](https://neon.com/docs/manage/orgs-manage) says each organization selects its own plan and manages its own billing. The [organization usage API guide](https://neon.com/docs/manage/orgs-api-consumption) describes project usage under an `org_id`; its documented user-organization listing is the way to enumerate organizations accessible to a user. These sources leave “account total” versus organization terminology imprecise, so the bound below includes every Free project in every organization visible to the authenticated account.

**Authenticated inventory (metadata only).** At approximately **2026-10-19 15:37–15:38 UTC**, the account organization switcher showed exactly two existing organizations, both marked Free: `Jose` and `Ornigami LLC`. The selector’s organization search was empty; both entries and the “Create organization” option were visible, with no additional entries or pagination. The project list for `Jose` reported **5 Projects** and displayed all five rows: `QR-Loyalty`, `Workflows`, `Contentor`, `Contactor`, and `Local Lift`. The `Ornigami LLC` project list reported **2 Projects** and displayed both rows: `ornigami-fictional-staging` and `zoisial-fictional-staging`. Each organization list had an empty project search, matched its displayed project count, and showed no pagination. No unrelated project detail, database contents, secrets, or credentials were opened. This is the complete inventory visible to the authenticated user across both available Free organizations; the extra projects are included only as metadata in the conservative capacity calculation.

**Usage freshness and completeness.** On the same visit, `Jose` showed **0.32 GB storage** since Oct 2, 2026; `Ornigami LLC` showed **0.06 GB** since Oct 13, 2026. The dashboard warned that metrics may be delayed by one hour and are not updated for inactive projects. Several project-list storage cells displayed `-`; at least one project had last been active a month earlier. The displayed sum of 0.38 GB is therefore not used as an exact or complete measurement. It is unnecessary for the conservative bound. No account-wide numeric usage ledger was exposed.

**Conservative calculation.** The verified inventory contains **7 Free projects total** across every organization visible to this authenticated account (5 + 2). At the documented per-project maximum, aggregate Postgres storage is at most **7 × 1 GB = 7 GB**, including the existing `ornigami-fictional-staging` project exactly once. This is **13 GB below** the 20 GB aggregate ceiling even if that ceiling spans both organizations. If Neon applies the aggregate separately to each organization, the corresponding maxima are 5 GB and 2 GB, also below 20 GB. This inventory-based upper bound remains valid despite stale/missing per-project usage metrics, provided the 1 GB cap applies to every Free project as Neon documents and the account switcher represents all organizations accessible to this authenticated account. No larger unlisted scope was visible.

**Selected staging project capacity.** The exact target `Ornigami LLC / ornigami-fictional-staging / fictional-staging / ornigami_staging`, PostgreSQL 17.11, remains the sole target. Its project overview, observed at approximately **15:38 UTC**, reported **30.92 MB Postgres storage** since Oct 13, one branch, and a **1 GB per-project** Free storage limit. The Dashboard metric is subject to the up-to-one-hour delay caveat; the branch had been active within the preceding hour. The displayed figure implies roughly **0.97 GB** nominal project headroom. The proposed migration/fixture scope has no separate expected-byte estimate, so bound its staging allocation at the full remaining project allowance and stop if a fresh pre-write usage check cannot confirm it remains below 1 GB. The aggregate 7 GB upper bound already includes up to 1 GB for this project and does not add it twice. No additional SQL size query was necessary for this read-only capacity finding; B6R’s final exact-target, read-only catalog and usage preflight remains required before any separately approved writes.

**Capacity conclusion and owner request.** The documented limits plus the complete visible two-organization inventory establish conservative shared-storage headroom for the existing bounded request: at most 7 GB across the verified Free projects against 20 GB, and the selected project is below its 1 GB cap. This resolves the storage-evidence blocker for planning, not write authority. Owner approval is still requested only for the existing B6R scope: on `Ornigami LLC / ornigami-fictional-staging / fictional-staging / ornigami_staging`, apply the **39 hash-verified canonical migrations in numeric order**, then apply the **hash-verified synthetic fixture once**, subject to B6R’s exact-identity, refreshed empty-baseline, usage, validation, stop-on-error, partial-failure, read-back, and recovery conditions. No project/branch creation, production data, credentials, integrations, login provisioning, Vercel binding, schedules, deployment, DNS, restore or cleanup is included. The delivery plan places isolated SQL after accepted-image review; because no accepted image exists, approval to execute now must explicitly approve that sequencing exception. Otherwise wait for the planned sequence. Coverage, adoption, campaign, deployment, privacy and all other holds remain active. No SQL, provider mutation, manifest edit, message or spending occurred.

## Block 6T — Neon storage clarification assessment (2026-10-19)

**Evidence supplied.** The response field in the request contains only `[INSERT RESPONSE]`; no Neon answer, usage report, source, timestamp, metric coverage or freshness information was provided. There is therefore no new evidence to assess, and the applicable aggregation scope or available storage headroom cannot be confirmed.

**Single missing evidence item.** Obtain one authoritative Neon/account-administration clarification package that (a) defines whether the 20 GB Free Postgres storage total applies per organization/billing account or across organizations under a Neon user/account, and (b) gives the timestamped total storage used by every Free project included in that scope, explicitly accounting for inactive projects and metric lag. The B6S organization view (0.06 GB reported since Oct 13, up to one-hour lag, inactive-project metrics not updated, and project storage fields unavailable) is not a substitute for that complete evidence.

Until that evidence is supplied and establishes headroom, the bounded migration/fixture request is not ready for execution. Its existing exact target, 39 verified migration hashes, fixture hash, stop conditions, separate owner write approval and sequencing-exception requirement are unchanged. No SQL, provider action, message, credential access or spending occurred. All existing holds remain active.

## Block 6V — initialize isolated synthetic staging database (2026-10-19)

**Authorization and scope.** The owner explicitly approved the database-only initialization of the existing target and the sequencing exception to run before accepted-image review. This authorization covered only the 39 frozen canonical migrations followed by the one synthetic fixture. It did not authorize project/provider changes, login or integration credential provisioning, Vercel binding, schedules, deployment, DNS, restore, deletion, paid actions, Local Lift access, or any waiver of readiness policy. Coverage, adoption, campaign, security, privacy, maintenance, accepted-image and deployment holds remain active.

**Fresh preflight.** At approximately **15:38 UTC** (17:38 Europe/Madrid), the authenticated Neon Dashboard showed **Ornigami LLC / `ornigami-fictional-staging` / `fictional-staging`**, Frankfurt, Free plan, PostgreSQL 17, one branch and one database. The SQL Editor was scoped to **`ornigami_staging`**; a bounded read-only query returned database `ornigami_staging`, PostgreSQL **17.11** (`170011`). The same `public`-only application catalog baseline was refreshed under a read-only transaction with a five-second statement timeout: **0 non-system relations, 0 non-system routines and 0 custom types**, with only the provider/default `plpgsql` extension. The organization, project, branch and database names remained consistent throughout the run.

The project usage panel before writes reported since Oct 13: **30.92 MB Postgres storage, 7.83 MB history, 0.03 CU-hours and 0 kB network**; the Free project storage cap is 1 GB. The panel showed no limit warning. B6U’s conservative account inventory bound remains at most **7 GB** across the seven visible Free projects against the documented 20 GB aggregate ceiling; it includes this project once. The Dashboard panel has up-to-one-hour lag and does not update inactive projects, so these figures are observations rather than reserved capacity.

**Frozen input verification.** Immediately before execution, the full handoff table was parsed before digest validation and matched all **39 unique migration paths** to the numeric-order filesystem list, with no omissions, duplicates or extras. Every digest was 64 lowercase hexadecimal characters and matched file bytes. The fixture digest `2d53d5a6f0be9aab44151f6ceda2b8a4c7ac8e09965742ad865b72f1ba05283e` also matched. No migration or fixture file changed. The offline validator passed **9/9 tests before migration execution and again 9/9 after all migrations succeeded**.

**Per-file hosted outcomes.** Each file was submitted once as a separate SQL Editor execution, in the listed order, using its complete reviewed script; each returned “Statement executed successfully.” The frozen manifest above is the exact digest mapping for every filename below. No error, timeout or uncertain execution occurred; the sequence stopped only after all 39 successes.

| Order | Migration | Outcome |
|---:|---|---|
| 1 | `001_initial.sql` | Succeeded |
| 2 | `002_auto_reply_profiles.sql` | Succeeded |
| 3 | `003_business_foundation.sql` | Succeeded |
| 4 | `004_review_booster_tables.sql` | Succeeded |
| 5 | `005_business_agent_billing_fields.sql` | Succeeded |
| 6 | `006_public_demo_events.sql` | Succeeded |
| 7 | `007_review_booster_unsubscribes.sql` | Succeeded |
| 8 | `008_pricing_plans.sql` | Succeeded |
| 9 | `009_review_booster_error_reason.sql` | Succeeded |
| 10 | `010_review_booster_retries.sql` | Succeeded |
| 11 | `011_review_link_clicks.sql` | Succeeded |
| 12 | `012_cron_runs.sql` | Succeeded |
| 13 | `013_review_business_tenancy.sql` | Succeeded |
| 14 | `014_security_hardening.sql` | Succeeded |
| 15 | `015_stripe_usage_periods.sql` | Succeeded |
| 16 | `016_remove_legacy_plan_taxonomy.sql` | Succeeded |
| 17 | `017_team_invitations.sql` | Succeeded |
| 18 | `019_billing_lifecycle.sql` | Succeeded |
| 19 | `020_account_recovery.sql` | Succeeded |
| 20 | `021_workspace_invitations.sql` | Succeeded |
| 21 | `022_booster_delivery_quotas.sql` | Succeeded |
| 22 | `023_booking_intake.sql` | Succeeded |
| 23 | `024_review_draft_policy.sql` | Succeeded |
| 24 | `025_email_delivery_events.sql` | Succeeded |
| 25 | `026_privacy_account_lifecycle.sql` | Succeeded |
| 26 | `027_cron_operations.sql` | Succeeded |
| 27 | `028_dashboard_pagination.sql` | Succeeded |
| 28 | `031_google_location_selection.sql` | Succeeded |
| 29 | `032_workspace_bootstrap.sql` | Succeeded |
| 30 | `033_account_lifecycle_auth_team.sql` | Succeeded |
| 31 | `034_account_lifecycle_billing.sql` | Succeeded |
| 32 | `035_account_lifecycle_replies.sql` | Succeeded |
| 33 | `036_account_lifecycle_booster.sql` | Succeeded |
| 34 | `037_account_lifecycle_finalization.sql` | Succeeded |
| 35 | `038_booster_intake_lifecycle.sql` | Succeeded |
| 36 | `039_billing_lease_duplicate_alias.sql` | Succeeded |
| 37 | `040_permission_evidence.sql` | Succeeded |
| 38 | `041_guarded_retention.sql` | Succeeded |
| 39 | `042_cron_expected_jobs.sql` | Succeeded |

Migration `018` remains intentionally unused; `029`–`030` remain reserved as documented. No migrations were retried or edited.

**Fixture and bounded read-back.** After all migrations succeeded, the same validator passed 9/9, then the hash-matched `neon/fixtures/ornigami-staging-synthetic.sql` was submitted **once** with its complete explicit transaction. SQL Editor reported success. A five-second read-only transaction returned only aggregate counts and reference checks: **1 user, 1 profile, 1 business, 1 owner membership and 1 review**, plus one complete user/profile/business/owner-membership/review reference chain. The exact synthetic user row had **no password hash**; its password-reset and email-verification-token counts were zero. No credential or row values were returned.

Database-only isolation counts were all zero: Google connection/location/selected-location rows; booking credentials; Stripe customer bindings, provisioning, checkout intents and subscriptions; active/trialing/past-due business-agent rows; follow-up visits/messages; durable Booster delivery rows; review replies; pending invitations; unresolved checkout work; running cron runs; active cron leases; and cron-unit cursors. The seeded account therefore has no password credential and the database contains no integration bindings or actionable delivery work in these inspected tables. Migrations 001 and 014 create the schema and set legacy verification defaults; no login was provisioned or tested. External environment variables/provider credentials and hosted Vercel schedule state were not inspected. SQL shows no active database job/lease/cursor; it does not prove external schedule configuration or hosted behavior.

**Post-write usage and schema evidence.** The refreshed Dashboard panel after writes still displayed **30.92 MB Postgres storage, 7.83 MB history, 0.03 CU-hours and 0 kB network** since Oct 13. It was unchanged from preflight and remains subject to the one-hour metric lag; it is not evidence of zero storage growth. A separate read-only SQL measurement after writes returned `pg_database_size` **10,616,832 bytes**, with **60 public relations, 121 public routines and 2 installed extensions**. This is a database-local size measurement, not Neon’s billed storage metric; no comparable database-size query was taken before writes. The read-only transactions were rolled back/closed. No restore point was tested, and no recovery claim is made.

**Verification, limitations and next step.** The exact database identity/version was rechecked in the final read-only SQL result. No database content rows or secrets were exposed, and no other project was accessed. These results establish successful SQL initialization and synthetic structural read-back only. They do not establish login, application behavior, Vercel binding, hosted access privacy, runtime/security acceptance, backup/restore, accepted-image review, or operational adoption. Independently review this initialization record and manifest linkage next; any login credential, integration, Vercel binding or deployment requires a separate reviewed scope. Keep NO-GO and every existing hold in force.

Local verification: `node --test tests/staging-synthetic-fixture.test.mjs` passed 9/9 before and after migration execution; `git diff --check` is run for this handoff. No application build/tests, production access, provider setting changes, deployment, DNS, restore, deletion or spending occurred. Database-only SQL writes were the sole hosted changes in Block 6V.

## Block 6W — Vercel Preview isolation and binding plan (2026-10-19)

**Recommendation, not deployment approval.** Reuse the existing `locallift` Vercel project only as a conditional Preview candidate, for Preview branch `codex/ornigami-staging-readiness-20261018`. Block 6I's latest visible Ready Production-alias deployment (2026-10-05) records the Ornigami GitHub repository, branch `main`, commit `e21249e`; `ornigami.com` was assigned to Production in the inspected Domains view. This is deployment-source evidence, not proof of the currently serving deployment's exact binding or of a live Git Integration/current Production Branch setting. The remote existence/linkage of the proposed Preview branch is unverified. `staging.ornigami.com` was not assigned in the last inspected domain list. Do not create another project or change the production origin guard. The candidate remains unapproved.

| Area | Required Preview configuration for the dedicated staging branch | Source behavior / remaining condition |
|---|---|---|
| Database | Remove generic Preview `DATABASE_URL` before adding branch-specific `DATABASE_URL` for `Ornigami LLC / ornigami-fictional-staging / fictional-staging / ornigami_staging`. Never allow generic Preview fallback. | Block 6V established migrations and the synthetic fixture on that target, but no Vercel binding exists. Verify the branch-resolved target by a redacted identity check before a first app deployment. If staging preparation fails, keep only a verified staging binding or no binding; never restore an unknown generic value. |
| App/auth origin | Remove generic Preview `NEXT_PUBLIC_APP_URL` and `AUTH_URL`, then set branch-specific `NEXT_PUBLIC_APP_URL=https://staging.ornigami.com` and `AUTH_URL=https://staging.ornigami.com`. Keep Production values unchanged. | `next.config.ts` rejects a noncanonical Production origin and accepts Preview configuration; the redirect callback is in `src/auth.ts` and constrains returns to Auth.js `baseUrl`. `src/lib/auth.ts` is the session/require-user wrapper. OAuth callbacks still require provider registration if Google is enabled. Local tests in Block 6F do not prove hosted behavior. |
| Session | Remove generic Preview `AUTH_SECRET` and any legacy `NEXTAUTH_SECRET` fallback, then set a newly generated staging-only branch-specific `AUTH_SECRET`; do not reuse Production or record the value. Keep `TOKEN_ENCRYPTION_KEY` absent while Google token storage is disabled. | Separate session secrets prevent Preview and Production from sharing signed sessions. This is a Vercel configuration value, not a synthetic user's login password. If preparation fails, retain only the verified staging secret or no Preview secret; do not permit unknown generic fallback. |
| Google sign-in / GBP | Set `ORNIGAMI_PRIVATE_STAGING_MODE=true` only as a branch-specific Preview variable; do not configure it generically. Remove generic Preview `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. In this mode, omit the Google Auth.js provider, reject GBP/OAuth integration routes before provider work, and allow the synthetic dashboard without a GBP binding. | **Code prerequisite:** `src/auth.ts` currently requires both Google values while constructing the provider, and `ALLOW_DASHBOARD_WITHOUT_GBP` is not read by runtime code. Activate mode only when `VERCEL_ENV=preview`, the exact flag is true, and Vercel's [`VERCEL_GIT_COMMIT_REF`](https://vercel.com/docs/environment-variables/system-environment-variables) equals the selected branch. Production keeps its current provider/routes and existing Production credentials; no global default-off switch or Production credential removal. Other Preview branches are not switched into staging mode, but without separately verified branch values, removing generic Preview credentials may break Auth.js initialization as well as Google/GBP flows. |
| Mail | Remove Preview `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `REPLY_TO_EMAIL` and any `QR_MAIL_*` enrollment values; set `QR_MAIL_ENABLED=false`. | `src/lib/qr-mail.ts` requires exact `QR_MAIL_ENABLED=true` plus a complete enrollment before authorization; auth email availability also requires the key, sender and enrollment. This prevents configured sending when absent/false, but registration/reset flows are unavailable. Do not substitute real mail credentials. |
| Stripe | Remove Preview `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and all six `STRIPE_PRICE_*` values. | `src/lib/stripe.ts` lazily requires a secret key before constructing the client; absent price IDs fail closed in `src/lib/billing/plans.ts`. Billing flows will be unavailable. No Preview value may be assumed test-mode or harmless. |
| AI | Set `OPENAI_ENABLED=false`; remove Preview `OPENAI_API_KEY`. | `src/lib/openai-feature.ts` enables paid AI only for exact string `true`; `src/lib/openai.ts` checks that gate before creating a client. This is an existing default-closed control. |
| Cron / jobs | Use only `vercel.staging.json` (no `crons`); remove Preview `CRON_SECRET`. Keep default `vercel.json` and Production schedules unchanged. | `scripts/validate-vercel-staging-config.mjs` checks the two configs. `src/lib/cron-auth.ts` rejects requests if the secret is absent, so cron handlers return unauthorized. Vercel documents that [Cron Jobs run on Production deployments](https://vercel.com/docs/cron-jobs/quickstart), not Preview; no schedules does not block manual route calls, and no hosted schedule state was checked. |
| Telemetry | Remove Preview `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` and `NEXT_PUBLIC_SENTRY_DSN` unless an explicitly approved staging-only telemetry destination and privacy scope are chosen. | Prior metadata listed these names in Preview/Production scopes; values were not read. They are not needed for synthetic display acceptance. Telemetry behavior without a DSN was not exercised here. |

Vercel documents that branch-specific Preview variables override generic Preview variables with the same name ([environment variables](https://vercel.com/docs/environment-variables)). The recorded candidate has generic Preview `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL` and integration variables; a legacy generic `NEXTAUTH_SECRET` was not listed but must be checked by name. Values were deliberately not read. Remove generic Preview `DATABASE_URL`, both session-secret names, `NEXT_PUBLIC_APP_URL` and `AUTH_URL`, as well as the listed generic service variables, before adding verified staging-branch values. This means a missing/removed branch override fails closed rather than falling back to unknown database, session or origin values. These removals affect future builds for **all** Preview branches, not Production; other Preview branches may lose database, login, origin and provider functionality until independently reviewed/configured. Existing Preview deployments retain their already-built environment. Inventory and explicitly accept this Preview-wide impact before changes. Treat existing deployments with inherited settings as untrusted and do not use them until protection/exception/bypass state is verified; deleting project variables does not rewrite them or revoke any provider credential.

**Synthetic login, separate database write.** Block 6M verified this fixture user's `email_verified` is null; migration 001 defines it nullable without a default, and migration 014 only backfills users that exist when that migration runs. The fixture is inserted afterward and omits the column. `src/auth.ts` credential authorization requires a valid normalized email, a password accepted by `isValidAuthPassword` (8–72 UTF-8 bytes), non-null `password_hash` and `email_verified`, and a bcrypt match; it also enforces email/IP rate limits. A pending privacy-deletion account receives a restricted deleting session rather than a normal dashboard session, so provisioning requires `privacy_deletion_requested_at IS NULL`; the JWT callback rechecks the current account and `auth_version` on each session. A fresh bounded read-only check must confirm the exact fixture ID/email, both credential fields still null, no deletion request, expected `auth_version`, and no reset/verification token rows; stop on any mismatch. After a separate database-write approval, generate a random password outside the repository, validate it against the application policy, hash it with `bcryptjs` cost 10 (same as `src/app/api/auth/register/route.ts`), and execute one transaction that row-locks and updates only this exact synthetic user, sets `password_hash` and `email_verified=now()`, updates `updated_at`, and increments `auth_version`. Require the prior credential fields null and `privacy_deletion_requested_at IS NULL`; commit only when exactly one row changed, otherwise roll back without retry. This is an explicit verification-state exception for the fictional `.example.test` account because mail is disabled; it does not change general email-verification policy. Never send/log plaintext or hash. Read back only boolean credential/verification/deletion state and version; perform one private login smoke check without clearing rate-limit state, then sign out. Store the password only in the owner's private credential store for the approved staging test window. On exposure, failed preparation or staging retirement, revoke it by clearing only this fixture user's hash and incrementing `auth_version`; confirm login fails, preserve other lifecycle state, and remove the saved password. Stop if deletion lifecycle is pending; do not provision, reset or restore a pending/deleting account.

**Private hostname and source binding.** Keep Standard Vercel Authentication on Preview. The latest prior inspection found Standard Protection, one team Owner role, one masked automation-bypass entry, and unavailable exception/shareable-link state; this is configured metadata, not proof of enforcement. Standard Protection covers deployment URLs except production domains ([Deployment Protection](https://vercel.com/docs/deployment-protection)); Vercel Authentication is distinct from paid password protection. Before assigning the hostname, recheck exceptions, shareable links, bypass scope and authorized team membership. Do not expose or copy the bypass secret. If the bypass or exceptions cannot be shown not to expose staging, stop before assigning `staging.ornigami.com`. Assign that hostname only to the approved Preview branch/deployment, then verify unauthenticated access is blocked and intended owner access succeeds. Existing evidence does not establish current DNS, hostname assignment, effective access, or whether removing a project-level bypass would affect Production automation.

The project had no recorded Git Integration, so automatic branch-domain assignment is not established. Vercel's branch-specific domain workflow uses a linked repository/branch ([Git deployments](https://vercel.com/docs/git)). Before choosing that route, verify the exact Ornigami repository, root and existing Production branch; linking a repository and any automatic-build implications require separate approval. CLI `--project` and `--local-config` can select the known project and `vercel.staging.json` ([CLI global options](https://vercel.com/docs/cli/global-options)), but source provenance and safe hostname assignment still need verification. No method is authorized or selected for deployment in this block.

**Bounded follow-on sequence.** (1) Independently review this corrected plan and refresh read-only source, protection, Preview-variable and existing-deployment metadata. (2) Implement the branch-scoped `ORNIGAMI_PRIVATE_STAGING_MODE` gate, requiring `VERCEL_ENV=preview`, the exact flag and `VERCEL_GIT_COMMIT_REF=codex/ornigami-staging-readiness-20261018`; verify this system variable is exposed before deployment. Focused tests must prove the selected Preview omits Google auth, rejects GBP routes and supports the synthetic dashboard without GBP, while Production retains current Google/GBP behavior. For ordinary Preview without the matching branch/mode, preserve legacy behavior when its own verified Google configuration is available; generic Preview key removal may break Auth.js initialization elsewhere and must be explicitly accepted or separately configured. (3) With separate provider approval, remove generic Preview database/session/origin/service values first; verify they are absent without exposing values. Then add the exact branch-specific staging database, origin, fresh session secret and private-staging flag. Do not remove the branch values during rollback unless absence of generic fallback has been verified. (4) With separate approval, link the verified repository/branch if required; confirm the current Production source and branch association before this can trigger builds. (5) After protection/bypass review, separately assign `staging.ornigami.com` and verify unauthenticated denial and intended authorized access. (6) Separately authorize the one synthetic-user database update if login is needed. A first deployment remains a distinct approval after all preceding source, configuration and privacy gates. No deployment is currently approved.

**Failure quarantine and rollback.** Stop all new staging-branch builds/deployments immediately; do not promote, alias, share or retry. Do not assign/use the staging hostname. If it was assigned, remove only that association. Preserve Standard Authentication and verify no exception, shareable link or bypass exposes the affected Preview URL; until verified, treat the URL as potentially accessible and stop rather than claim quarantine. Keep only branch-specific database, session and origin values verified for staging; otherwise remove an unsafe override only after confirming the corresponding generic Preview `DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` and `AUTH_URL` entries are absent. With those generic fallbacks absent, an unbound Preview must fail closed rather than inherit unknown database, session or origin values. Never restore generic values as rollback. Keep Production values, `ornigami.com`, Production schedules, database contents and services untouched. Existing Preview deployments retain their old environment snapshot and remain untrusted until access controls are verified; project-variable deletion alone does not change or sanitize them or revoke provider credentials. If old Preview deployments cannot be proven inaccessible or safely isolated without affecting Production, stop and request a separately reviewed project/environment decision. A failed staging preparation is not a reason to weaken isolation.

**Exact future approval request (not granted here).** Keep the actions separate:

1. **Vercel configuration authorization:** on `locallift` only, remove generic Preview `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET` if present, `NEXT_PUBLIC_APP_URL`, `AUTH_URL` and the Preview integration variables listed in the table; this affects future builds for all Preview branches. Then add branch-specific Preview `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, `ORNIGAMI_PRIVATE_STAGING_MODE=true`, `OPENAI_ENABLED=false`, `QR_MAIL_ENABLED=false` and a newly generated staging-only `AUTH_SECRET`. Session-secret generation/storage is a provider configuration secret action; it is not a user-password/database credential action. This does not authorize a build or deployment.
2. **Source/access authorization:** only after source and protection checks, link the verified Ornigami repository/branch if required and assign `staging.ornigami.com` to that Preview target, including only the necessary DNS validation. No production branch/domain/schedule edits or Production environment changes.
3. **Synthetic login authorization, separate and optional:** approve one transaction on the exact synthetic user setting `email_verified` and bcrypt `password_hash` under the guarded procedure above, with auth-version invalidation and private credential custody. This creates a user login password; it is not part of Vercel session-secret generation and is not included in (1) or (2).
4. **First deployment:** requires its own later approval after the local feature gate, provider configuration, source, access and isolation evidence are independently reviewed.

No item above is authorized by this plan. Do not mutate Production environment variables/domains/schedules, existing service data, the initialized database beyond the separately requested synthetic-user transaction, or adoption status.

**Unresolved decisions and limits.** Confirm the exact source repository/root and current Git Integration/Production branch; the exact currently serving custom-domain deployment remains unproved even though Block 6I records the latest visible source; Preview-wide variable-removal impact; whether the old masked bypass can be scoped without affecting Production; exception/shareable-link state; authorized staging users; domain/DNS ownership; and approval for the separate synthetic login operation if needed. The previous Vercel variable-name snapshot is historical and values remain unknown. No provider or database reads/changes, secret retrieval, builds, deployment, DNS action, credential creation, tests or spending occurred for Block 6W. Database initialization closes none of the coverage, security, runtime, access, maintenance, adoption or campaign holds; staging and deployment remain NO-GO.

## Independent review — Block 6W (2026-10-19)

Reviewed commit `d5d989834f3b13f45088684dde3fad875d45cb36`; initial worktree and committed diff checks were clean. Inspected the auth callback, migrations, fixture, service helpers and current official Vercel variable inheritance documentation. No provider queries, hosted SQL or implementation changes were made during review. The Google credential initialization prerequisite is real, but the plan needs the following corrections before implementation or provider approval.

**B6W.1 — Correct synthetic-login preconditions.** `src/auth.ts` rejects credential login unless both `password_hash` and `email_verified` are present. Migration 001 defines a nullable `email_verified` without a default. Migration 014 backfills users present when that migration runs; it does not establish an insert default. The synthetic user is inserted only after all migrations, and the fixture omits `email_verified`; Block 6M explicitly verified it null. Therefore the claim that this fixture user was created with a verified-email default is incorrect, and updating only its password hash would leave login blocked. Correct the plan to require a fresh bounded read-back of the exact user's verification state, followed by a separately approved, synthetic-account-only provisioning procedure covering every required login precondition and relevant lifecycle guards. Do not modify the fixture, real users, mail verification policy or hosted database in this correction block. Keep password material outside tracked files and output.

**B6W.2 — Make rollback safe under Preview inheritance.** Vercel documents branch-specific Preview variables as overrides of generic Preview variables. The plan retains generic Preview `DATABASE_URL` and `AUTH_SECRET` while proposing staging branch overrides, yet rollback says to remove the branch's variables. That can expose a subsequent staging build to inherited, unverified database/session bindings. Correct rollback and the approval request so failure stops further staging builds/deployments and prevents fallback to unverified generic values. Preserve or restore only verified safe staging bindings, or quarantine the staging path until a reviewed isolation mechanism exists; do not call variable removal alone a safe rollback. Explicitly cover both database and session-secret inheritance. Do not change any provider values now. Resolve the request's contradictory wording that both proposes a fresh `AUTH_SECRET` and excludes credential creation: distinguish the proposed staging session-secret generation/configuration from separately excluded user-password provisioning.

**B6W.3 — Reconcile existing evidence and code scope.** Block 6I already records a visible Production deployment from the Ornigami repository, branch `main`, commit `e21249e`; exact currently serving custom-domain/deployment binding remained unproved. Reuse that dated evidence rather than calling every production source identity unknown, and distinguish deployment source metadata from a live Git Integration. Redirect callback logic is in `src/auth.ts`; `src/lib/auth.ts` is the session/require-user wrapper. Correct the reference. Define the Google/GBP gate proposal so the selected private Preview fails closed without silently disabling established Production authentication/integrations; any intentional Production behavior change requires an explicit separately reviewed scope. This block requests planning corrections only, not implementation.

## B6W.1–B6W.3 corrections — 2026-10-19

**Correction markers.** The Block 6W login text now treats `email_verified` as null for the fixture account; login requires normalized valid email, password policy compliance, non-null verification and password hash, matching bcrypt hash, and no pending privacy deletion. A future exact-account transaction must set verification and a bcrypt hash under guards, update the timestamp/version, and verify status without returning credentials. The future approval request separates staging `AUTH_SECRET` generation/configuration from optional synthetic-user password provisioning.

The preparation order now removes generic Preview database, session, origin and service fallbacks before staging overrides are added. A failed setup stops new staging builds, never assigns/promotes the staging hostname, and retains only verified branch-specific staging bindings or no binding. Existing unverified Preview deployments are kept out of use; quarantine is not claimed until Standard protection, exceptions, shareable links and bypass scope are verified. Deleting an override is safe only after generic fallback absence is independently verified; old deployments keep their prior environment snapshots. Production values remain unchanged.

Block 6I's dated latest-visible Production deployment source (`main`, commit `e21249e`) is reused without claiming that it is the exact deployment currently serving `ornigami.com` or proves current Git Integration settings. The redirect callback source is corrected to `src/auth.ts`. `ORNIGAMI_PRIVATE_STAGING_MODE=true` is proposed only when Preview environment and exact `VERCEL_GIT_COMMIT_REF` branch identity also match; it must omit Google auth, reject GBP/OAuth routes and permit the synthetic no-GBP dashboard. Production code paths and existing Production credentials remain unchanged. Removing generic Preview Google values may affect other Preview branches and is an explicit project-wide Preview impact requiring review.

**Next engineering block: private-Preview mode only.** Implement the branch-scoped Google/GBP gate and synthetic dashboard-without-GBP behavior; do not provision a hosted login or change provider configuration in that block. Add focused tests proving: (1) selected Preview mode initializes Auth.js without Google credentials/provider only when environment, exact flag and branch ref all match; (2) wrong/missing branch ref or a different Preview remains outside the staging mode; (3) GBP/OAuth endpoints fail closed before external calls; (4) synthetic dashboard renders without a GBP binding; (5) an ordinary Preview without the matching mode preserves its existing code path when valid Google settings are supplied; and (6) Production retains the current Google provider and route behavior even if the private-staging flag is accidentally present. After independent review, handle Vercel variable mutations, repository/domain linkage, synthetic password transaction, and first deployment as separate approvals in the order already listed in Block 6W.

No application/configuration edits, provider calls, hosted SQL, secret retrieval, password/session-secret generation, builds, deployment, DNS or spending occurred in this correction. `git diff --check` is required; all NO-GO, coverage, security, privacy, adoption, campaign and deployment holds remain active.

## Block 6X — private Preview Google/GBP gate (2026-10-19)

Implemented the Block 6W gate in source only. The shared server-side predicate in `src/lib/private-preview.ts` is true only when `VERCEL_ENV` is exactly `preview`, `ORNIGAMI_PRIVATE_STAGING_MODE` is exactly `true`, and `VERCEL_GIT_COMMIT_REF` is exactly `codex/ornigami-staging-readiness-20261018`.

In that mode, `src/auth.ts` constructs Auth.js without the Google provider and does not call `getRequiredEnv` for either Google credential. Credentials authentication remains unchanged. The Next.js proxy rejects authenticated requests to every `/api/google/**` route with 503 before the route handler can reach a Google provider or integration read/write; the covered route families are connection/disconnect, location list/sync/selection, OAuth start/callback, replies, and review sync/process-pending. Unauthenticated requests continue to the existing route authentication response. The proxy's existing deleting-account restriction runs first. The Google-backed `/api/cron/review-replies` route preserves its cron authorization check, then returns unavailable before database, provider, lifecycle or AI work. Google cleanup in privacy/deletion flows remains unchanged.

For authenticated dashboard users, matching Preview skips the GBP connection lookup and the proxy's GBP-dependent redirect, while the dashboard page still runs `requireUser`, strict business/tenant access and existing lifecycle checks. The synthetic dashboard renders its data and presents Google as disabled without a connection CTA. Outside the exact predicate, the original Google provider and dashboard connection step are retained. Production remains outside the predicate even if the staging flag and branch ref are accidentally present. No Google or business authorization rules were weakened; existing route-level tenant/ownership checks still apply when those routes are enabled.

**Verification.** The focused command `node --experimental-strip-types --test tests/private-preview-google-gate.test.mts tests/a12-cron-routes.test.mts tests/a08-google-ownership.test.mts tests/auth-core-session.test.mts tests/a11-restricted-proxy-contract.test.mts tests/a02-disconnected-access.test.mts` passed **46/46** tests. Coverage includes absent Google credentials in matching mode; missing/wrong environment, flag and branch values; production/ordinary Preview provider retention; all 11 Google route paths rejected before handler work; unauthorized cron and authenticated cron behavior; unauthenticated API 401; deleting-account 403; existing cross-tenant/owner route restrictions; and rendered synthetic dashboard behavior with zero GBP lookup and no Google CTA. `tsc --noEmit`, focused ESLint on changed source/tests, and `git diff --check` passed.

**Limitations and remaining work.** This does not set Vercel variables, establish that the Preview uses this repository/ref, verify protection/domain binding, provision a login password or session secret, test hosted behavior, perform a build/deployment, or close any readiness hold. The staged synthetic account still has no usable login credential; existing user/session lifecycle and tenant authorization remain required. Production and generic Preview provider behavior were tested locally with fixture credentials only. No provider/database network access occurred.

Verification note: an initial test invocation used `npx tsx` when that utility was not installed locally; npm attempted an ephemeral `tsx` install/run. No project dependency, lockfile or tracked configuration changed. All final tests were rerun with Node's built-in TypeScript test runner, without adding a project dependency.

Changed files: `src/lib/private-preview.ts`, `src/auth.ts`, `src/proxy.ts`, `src/app/(dashboard)/dashboard/page.tsx`, `src/app/api/cron/review-replies/route.ts`, `tests/private-preview-google-gate.test.mts`, and default-off predicate mocks in `tests/a02-disconnected-access.test.mts` and `tests/a12-cron-routes.test.mts`. No provider configuration, credentials, hosted database or external records changed. All NO-GO, coverage, security, privacy, adoption, campaign and deployment holds remain active.

## Block 6Y — current Preview configuration request (2026-10-19)

**Read-only refresh.** On 2026-10-19 the authenticated Dashboard showed the existing `locallift` candidate in a Hobby personal scope. Its Git settings say the project is not connected to a Git repository. Its Environments view has no Production branch configured and assigns Preview to “All unassigned git branches.” The domain list showed `ornigami.com` assigned to Production and did not show `staging.ornigami.com`. These are current candidate settings, not proof of the exact deployment presently serving Production. Block 6I’s historical latest-visible Ready deployment still records the Ornigami repository, branch `main`, commit `e21249e` (2026-10-05); that historical deployment metadata does not imply a current Git Integration. Earlier protection observations are reused, not re-tested here.

The branch-specific Preview selector listed other branches but not `codex/ornigami-staging-readiness-20261018`; searching it offered a typed “Use …” option. This shows the Dashboard control can express that string as a branch-specific scope, but does **not** prove a matching remote ref exists or that the candidate can deploy it: the project currently has no linked repository. No repository linking or branch push was attempted. The selected branch therefore remains remotely unverified and no branch deployment is currently established.

**Current environment-variable names and scopes (values not read).** The complete visible list had 19 rows:

- Preview plus Production: `AUTH_URL`, `EMAIL_FROM`, `REPLY_TO_EMAIL`, `ALLOW_DASHBOARD_WITHOUT_GBP`, and all six `STRIPE_PRICE_*` names: `STRIPE_PRICE_COMPLETE_ANNUAL`, `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_BOOSTER_ANNUAL`, `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`, `STRIPE_PRICE_REPLIES_MONTHLY`.
- All Environments (including Preview and Production): `NEXT_PUBLIC_APP_URL`, `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, `NEXT_PUBLIC_SENTRY_DSN`.
- Production only: `RESEND_WEBHOOK_SECRET`.
- Not present in this current list: `DATABASE_URL`, `AUTH_SECRET`, legacy `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `OPENAI_API_KEY`, Stripe secret/webhook/publishable keys, and `QR_MAIL_*` enrollment variables. Earlier Block 6G names/scopes are historical and are superseded for this candidate by this dated inventory. No removal is requested for an absent name. Vercel’s automatic system-variable exposure control was enabled; `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF` are system metadata, not project variables to add manually.

**Exact proposed variable diff, still unapproved.** Vercel documents that a branch-specific Preview value overrides a same-name generic Preview value, and that variable changes apply to new deployments, not existing deployment snapshots ([environment-variable scopes and branch overrides](https://vercel.com/docs/environment-variables)). Before any staging deployment, request approval for these changes on `locallift` only:

| Change | Exact names and scope | Reason / impact |
|---|---|---|
| Remove Preview scope, retain Production | `AUTH_URL`, `EMAIL_FROM`, `REPLY_TO_EMAIL`, `ALLOW_DASHBOARD_WITHOUT_GBP`, the six listed `STRIPE_PRICE_*` values | Removes inherited origins, senders, billing catalog and inert GBP toggle from all future Preview branches. `ALLOW_DASHBOARD_WITHOUT_GBP` is not a runtime control; its removal is hygiene only. |
| Change All Environments to Production + Development, removing generic Preview | `NEXT_PUBLIC_APP_URL`, `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, `NEXT_PUBLIC_SENTRY_DSN` | Keeps Production and Development scope as currently configured while excluding generic Preview inheritance. No staging telemetry destination is approved; staging does not need source-map upload credentials or Sentry runtime configuration for synthetic-display acceptance. |
| Confirm absent; no removal | `DATABASE_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` (already Production-only), `CRON_SECRET`, Stripe secret/webhook/publishable keys, `OPENAI_API_KEY`, all `QR_MAIL_*` enrollment names | Recheck names/scopes before change. If an unexpected Preview-scoped binding exists at execution time, stop and request a revised diff rather than silently expanding this authorization. |
| Add branch-specific Preview only for `codex/ornigami-staging-readiness-20261018` | `DATABASE_URL` bound to the already initialized synthetic staging database; `AUTH_URL=https://staging.ornigami.com`; `NEXT_PUBLIC_APP_URL=https://staging.ornigami.com`; `ORNIGAMI_PRIVATE_STAGING_MODE=true`; `OPENAI_ENABLED=false`; `QR_MAIL_ENABLED=false`; a newly generated staging-only `AUTH_SECRET` | This explicit branch scope prevents generic Preview fallbacks. `DATABASE_URL` and `AUTH_SECRET` are secret values: bind the approved target and generate/store the secret directly in the Dashboard without reading values back. Session-secret generation/configuration is part of this future provider mutation; it is distinct from and does not authorize a synthetic user's password/verification transaction. No other Preview branch gets the private-staging flag. |

Production scopes, Production domain, Production schedule configuration, Local Lift production data/services and the production origin guard are to remain unchanged. The Preview-wide removals would affect **all future Preview branches**, not just staging; ordinary Preview deployments could lose current origin, email, billing and telemetry configuration. This consequence requires explicit acceptance and may break those branches until separately configured. Existing deployments retain their previous environment snapshots and are not sanitized, revoked or made safe by variable changes; treat them as untrusted until separately quarantined by verified access controls. If the Preview-wide impact is unacceptable, do not apply this diff to the shared candidate: return with a separately approved isolation design rather than retaining unknown generic database/session/provider fallbacks.

**Deployment/config selection and blockers.** The checked-in `vercel.staging.json` contains only the schema declaration and no `crons`; the default `vercel.json` and its Production schedules remain intact. Official Vercel CLI documentation supports selecting a local config with `--local-config`/`-A` ([global options](https://vercel.com/docs/cli/global-options)). Official system-variable documentation says `VERCEL_GIT_COMMIT_REF` is the branch of the commit the deployment was triggered by ([system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)). **Correction in Block 6Z:** installed CLI source and the official CLI-v28 changelog now support using an actual local Git checkout as deployment provenance without a Git Integration; the remaining uncertainty is hosted propagation/resolution, not absence of a source path. Do not pass a hand-written `VERCEL_GIT_COMMIT_REF` as a substitute. No CLI command was run.

Branch-scoped variables are technically expressible in the Dashboard, but cannot be relied on until the true branch ref is available to deployments. No staging domain is currently listed on this project. Domain assignment, DNS, repository linking and any deployment remain separate approval scopes. Before first deployment also verify Preview protection and intended authorized access, exception/bypass state, staging hostname ownership, the redacted runtime database identity, automatic schedules absent for the staging config, and safe failure behavior. A config-only change neither proves hosted protection nor disables manual cron-route calls.

**Bounded rollback/quarantine.** If configuration preparation fails, stop all new builds/deployments for the staging path; do not alias, promote, expose, retry or use the hostname. Keep Production values and services untouched. Do not remove a staging database/session override if doing so could expose an inherited generic fallback. The current inventory shows no generic Preview `DATABASE_URL`, `AUTH_SECRET` or `NEXTAUTH_SECRET`; verify those absences again immediately before any change. If any generic binding appears, abort and obtain a revised approval that removes it before staging overrides are added. Preserve a verified staging binding or leave the scope unbound and fail closed; never restore an unverified generic value. Existing deployment snapshots remain untrusted; variable deletion alone is not a quarantine. Do not claim quarantine until protection and all bypass/exception paths are re-verified.

**Exact next approval request (configuration only).** Approve the Preview-wide scope removals and exact branch-specific additions in the table above on `locallift`, including generating/storing a new staging-only `AUTH_SECRET`; authorize no changes to Production scopes. Before execution, require a fresh name/scope diff confirming the inventory, explicit acceptance that all future Preview branches lose those generic settings, confirmation of the target database binding by identifier without revealing its connection string, and a source/provenance solution that supplies the real expected branch identity. This request does **not** authorize repository linking, database SQL, user-password/verification provisioning, login credentials, builds, deployment, domain/DNS changes, cron changes, or spending. If the genuine Git branch identity or safe Preview-wide impact is not resolved, stop without applying the configuration. Keep the first deployment separately approved after these prerequisites and protection checks.

**Sources and status.** Dashboard observations above were made read-only on 2026-10-19. Current official documentation checked the same day: [Vercel environment variables](https://vercel.com/docs/environment-variables), [CLI global options](https://vercel.com/docs/cli/global-options), and [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables). No values, secrets, deployment/application URLs, routes or provider mutation were accessed. No build, push, deployment, DNS, SQL, credential generation or spending occurred. This block does not approve the candidate, establish the currently serving Production deployment, prove remote branch existence, hosted privacy, or close readiness holds. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign and deployment holds remain active.

## Block 6Z — offline CLI source-provenance assessment (2026-10-19)

**Finding and correction.** The CLI route is supported by current official docs and the installed CLI implementation; the Git-disconnected Dashboard state is not itself a source-provenance blocker. This supersedes Block 6Y's suggestion that a separate Git Integration/remote-ref solution is likely required. It does not prove hosted environment resolution or authorize a deployment.

**Installed implementation inspected, without invoking the CLI.** The installed Vercel CLI package is version `58.9.1` (`package.json:3`, metadata only). In `dist/commands/deploy/index.js:773–828` and `1549–1606`, deployment creation calls `createGitMeta(...)` and passes the returned object as `gitMetadata` to the deployment request. In `dist/chunks/chunk-4IFEBYTL.js:54979–55026`, `createGitMeta`:

- Finds the local Git root using `git rev-parse --show-toplevel`.
- Reads `.git/config`; if the selected Vercel project has a linked repository, it looks for a matching remote, otherwise it falls back to the local `origin` URL. The remote URL can be omitted if unavailable.
- Gets latest commit information and dirty state from the local checkout. The returned metadata includes `commitRef` (the local commit's branch), `commitSha`, remote URL, commit author/message, dirty flag and local project root.
- Passes that metadata to deployment creation. This is actual local repository/commit state, not a constructed `VERCEL_GIT_COMMIT_REF` environment value. `--env` and config environment fields are separate paths; neither is needed or proposed for system branch identity.

The local project checkout is on the requested branch, has a configured `origin` remote (URL withheld), and the source tree was clean at this inspection. No matching remote-tracking ref is present in the local refs. The independent reviewer reports that `origin` has no matching published branch; that remote check was not repeated. The CLI source reads branch and commit from local Git and packages the local working source, so a published remote branch is not required to construct/send CLI Git metadata or upload this local checkout. Use a clean committed checkout to ensure the reported SHA identifies the deployed source; do not deploy a dirty tree. The remote repository identity embedded in metadata should be confirmed against the reviewed Ornigami source before any authorized deployment.

**Platform mapping and limits.** The official [CLI v28 changelog](https://vercel.com/changelog/vercel-cli-v28) states that CLI-created deployments now include Git metadata (introduced in CLI 25.2.0). Current [system environment variable docs](https://vercel.com/docs/environment-variables/system-environment-variables) define `VERCEL_GIT_COMMIT_REF` as the branch for the deployment-triggering commit. Current [Preview variable docs](https://vercel.com/docs/environment-variables) support a branch-specific Preview scope, with branch values overriding matching generic Preview values. Together with the installed implementation sending local `commitRef`, this supports the expected path: a CLI Preview deployment carries the checkout's genuine branch metadata, allowing Vercel to associate it with the matching branch-specific Preview configuration. That final server-side mapping from CLI metadata to the runtime system variable and variable resolver is not proven solely by local source/docs and must be verified on one separately approved deployment. Do not claim it has already selected the staging variables or activated `isPrivatePreview()`.

**Explicit selection.** Official docs support `vercel deploy --target=preview` for Preview; `--project` (project name or ID) or the `VERCEL_PROJECT_ID` variable selects a project; `--scope` can select the account/team; and `--local-config`/`-A` chooses a local `vercel.json` ([deploy options](https://vercel.com/docs/cli/deploy), [global options](https://vercel.com/docs/cli/global-options)). For a future approved operation, use the exact verified project ID and scope rather than ambient project linkage, explicit Preview target, and `vercel.staging.json`. The staging config contains no `crons`; it leaves production `vercel.json` untouched. The command must not use `--prod`, manually set `VERCEL_GIT_COMMIT_REF`, or fall through to implicit target selection. No CLI invocation, `vercel link`, environment download, build or deployment occurred in this block. A manual CLI deployment creates only the explicitly requested deployment; without Git Integration it does not establish automatic push-triggered builds.

**Recommended route.** Prefer one manually initiated CLI Preview deployment from the clean local checkout, without connecting Git Integration or pushing the unpublished branch. Local Git metadata supplies the real branch/commit provenance; explicit CLI flags select the existing candidate, Preview target and staging JSON. The missing published origin ref is therefore not, by itself, a blocker to this CLI route. The project/source linkage, exact root and intended remote identity must still match the reviewed Ornigami repository, and no custom domain alias is part of this route.

**Runtime proof required after separate approval.** On the single deployment, inspect sanitized Vercel deployment metadata for Preview environment, exact branch and full commit SHA; verify that runtime reports the exact expected system branch value without exposing secrets; and verify branch-specific Preview resolution using only safe, non-secret markers plus the app's existing private-mode behavior. Confirm `DATABASE_URL` resolves only to the initialized synthetic staging target by a redacted identity check, confirm `VERCEL_ENV=preview`, and exercise the private Preview predicate/Google gate without opening access or invoking integration providers. If branch metadata, variable selection, target identity or gate result differs, stop: do not alias, retry, promote, change the system variable manually, or deploy with production target. Existing Vercel Authentication and protection/bypass state, domain assignment, session-secret binding and all other 6Y prerequisites remain separate evidence. Local inspection alone does not establish hosted behavior.

**Exact next approval scope.** First, the owner must separately approve or reject Block 6Y's Preview configuration diff; this block does not grant that approval. After the approved configuration is applied and independently verified, request authorization for **one** manual CLI Preview deployment using the exact verified project ID/scope, clean commit on `codex/ornigami-staging-readiness-20261018`, `--target=preview` and `--local-config vercel.staging.json`, followed only by the bounded read-only metadata/identity/gate checks above. This deployment approval excludes Git Integration/repository linking, push, custom-domain alias/DNS, Production target/promotion, hosted SQL, credential retrieval, login-password provisioning, schedule changes, retries and spending. If the runtime proof fails, pause for review without cleanup or mutation beyond a separately approved scope.

**Sources and limits.** Official Vercel sources checked 2026-10-19: [CLI v28 changelog](https://vercel.com/changelog/vercel-cli-v28), [CLI deploy](https://vercel.com/docs/cli/deploy), [CLI global options](https://vercel.com/docs/cli/global-options), [environment variables](https://vercel.com/docs/environment-variables), and [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables). Installed source was read locally; CLI version came from package metadata and the executable was not run. No provider state, secrets or environment values were read or changed. All existing NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — configuration preflight stopped for revised diff (2026-10-19)

**Stop condition.** The starting HEAD was `3ff3bb842ec94d184284d8b6f0b117ad92d98a36` on `codex/ornigami-staging-readiness-20261018`, with a clean worktree. The authenticated Dashboard still identified the candidate as `locallift`, with `ornigami.com` on Production and no Git Integration. Before any save, the current variable inventory was refreshed by names and scopes only. It differs materially from Block 6Y's 19-row snapshot: the current UI exposes 29 variable rows, including unexpected generic Preview bindings and new All Environments bindings. Per the stop condition, no environment-variable scope or value was changed. No database connection string was retrieved, no `AUTH_SECRET` was generated, and no deployment action occurred. The edit form opened for `AUTH_URL` was canceled without saving.

**Refreshed inventory (names and scopes only; values withheld).** The previously recorded entries remain: Production-only `RESEND_WEBHOOK_SECRET`; Production + Preview `AUTH_URL`, `EMAIL_FROM`, `REPLY_TO_EMAIL`, `ALLOW_DASHBOARD_WITHOUT_GBP`, six `STRIPE_PRICE_*` variables, plus `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_SECRET_KEY`; and All Environments `NEXT_PUBLIC_APP_URL`, seven Sentry names (`SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, `NEXT_PUBLIC_SENTRY_DSN`), plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL`. `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, and QR mail enrollment names were not present in the visible list. Secret/config values were never revealed or copied. This inventory supersedes the stale “absent” statements in Block 6Y for the names above; Production and Development values remain uninspected.

**Revised Preview-only scope diff for owner review; not applied.** Relative to the previously approved Block 6Y diff, add these exact scope edits:

- Remove Preview, retaining the current Production scope/value: `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`.
- Change All Environments to Production + Development (remove generic Preview while preserving the existing Production and Development assignments/values): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `AUTH_SECRET`, `DATABASE_URL`.

The refreshed full diff is therefore to remove Preview from 15 Production + Preview rows (the ten Block 6Y names plus the five new names above), and change 13 All Environments rows to Production + Development (the eight Block 6Y names plus the five new names above). Keep the single Production-only `RESEND_WEBHOOK_SECRET` unchanged. The seven branch-specific additions remain the Block 6Y proposal: staging `DATABASE_URL`, `AUTH_URL=https://staging.ornigami.com`, `NEXT_PUBLIC_APP_URL=https://staging.ornigami.com`, `ORNIGAMI_PRIVATE_STAGING_MODE=true`, `OPENAI_ENABLED=false`, `QR_MAIL_ENABLED=false`, and a newly generated staging-only `AUTH_SECRET`. The newly observed All Environments `DATABASE_URL` and `AUTH_SECRET` make the removal of generic Preview fallback an explicit prerequisite: first change those to Production + Development, verify Preview is absent, then create their exact branch-specific Preview entries. Do not expose or reuse their existing values.

**Approval boundary and next action.** The owner’s Block 6Y approval does not cover these newly present variable scopes. Request approval for the two added name groups and the resulting 15-row/13-row Preview isolation diff before resuming provider edits. After that approval, refresh the project inventory again and stop if it has changed; then apply only the fully approved scope diff, verify Production/Development scopes remain, and bind only the selected synthetic staging database plus a new branch-only session secret. Until then, all Block 6Y variable edits remain unapplied. Existing deployment snapshots are unchanged and untrusted; this inspection does not sanitize or revoke them. No Vercel variable was saved, deleted, rotated or created. No database secret, application credential, build, CLI, Git link, push, deployment, domain, SQL, schedule or spending action occurred. All existing NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — authorized configuration attempt stopped (2026-10-19)

**Preflight completed.** Starting HEAD was `d0edde94ac2bd708d817e298ecf9df05dbd07d61` with a clean worktree on the requested branch. The authenticated Dashboard still showed `locallift`, `ornigami.com` assigned to Production, and no Git Integration. In Project variables, environment filter was `All Environments`, type was `All Types`, status was `All Variables`, and no pagination/load-more control was present; scrolling the full list yielded the 29 names and scopes recorded in the preceding Block 7A preflight section. The Shared tab reported no linked shared variables. Thus the refreshed project-variable inventory matched the revised 29-row approval. Values were not read.

**Stopped before any configuration change.** I opened the `AUTH_URL` edit form, whose persisted scope was `Production and Preview`. I toggled Preview off in the form, but the Dashboard save interaction did not produce the expected verifiable persisted result; the editor subsequently showed an inconsistent Development selection. I canceled the editor, re-read the row, and it still showed the original `Production and Preview` scope. I did not retry the save or proceed to another variable. No other scope edit was attempted, and no Preview-only variable was added. No generic fallback was removed; the existing `DATABASE_URL`, `AUTH_SECRET` and other listed values remain as before.

The database connection string was not retrieved or transferred. A fresh `AUTH_SECRET` was not generated. No value or secret was revealed, logged, copied, screenshotted or committed. Since no staging variable or deployment was created, no new staging resource exists to remove; the fail-closed response is to stop configuration work and all staging deployments until the scope editor/save behavior has been reviewed. Existing deployments and their environment snapshots remain unchanged and untrusted; this operation did not quarantine them.

**Result and next step.** No provider configuration changed. The original authorization remains exact, but execution is paused because the first scope edit could not be safely applied and verified in the Dashboard. Resume only after an independently reviewed, reliable UI operation is established; then refresh names/scopes once more, apply each approved scope edit individually with read-back, verify all 15 Preview removals and 13 All Environments-to-Production/Development changes, and only afterward bind the seven approved branch-specific values. Preserve Production/Development values and Production-only `RESEND_WEBHOOK_SECRET`. Do not retrieve the connection string, generate the session secret, retry the UI operation, deploy, or perform other provider work until that review. No SQL, user-password provisioning, Git linking, push, build, CLI, deployment, domain/DNS change, schedule change, promotion or spending occurred. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — resumed configuration partial stop (2026-10-19)

**Preflight and `AUTH_URL` resolution.** Starting HEAD was `7b88776b8a060382ca0ef631daa1be4f53f4f7c6`, on the requested branch with a clean worktree. The refreshed `locallift` Project-variable view had All Environments, All Types and All Variables selected, no pagination control, and no linked Shared variables. Its 29 names/scopes matched the revised authorization. In the labeled `AUTH_URL` editor, Production was checked, Preview checked and Development unchecked. I unchecked Preview, confirmed Production checked / Preview unchecked / Development unchecked, closed the picker, and saved once. After reloading and reopening, both the row and editor showed Production only. Its value was not changed. This resolves the earlier save/read-back issue for this variable.

**Saved scope changes and read-back.** The other 14 Production + Preview rows were each changed to Production only and read back immediately: `EMAIL_FROM`, `REPLY_TO_EMAIL`, `ALLOW_DASHBOARD_WITHOUT_GBP`, `STRIPE_PRICE_COMPLETE_ANNUAL`, `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_BOOSTER_ANNUAL`, `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`, `STRIPE_PRICE_REPLIES_MONTHLY`, `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_SECRET_KEY`. Together with `AUTH_URL`, all 15 approved rows now read Production only. Production stayed selected and Development stayed unselected in these editors. The Production-only `RESEND_WEBHOOK_SECRET` was not edited.

Of the 13 All Environments rows, only `NEXT_PUBLIC_APP_URL` was changed and read back as Production + Development, with Preview unchecked. No value was changed. The remaining 12 still read All Environments: `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL`.

**Stop condition and partial state.** The `SENTRY_PUBLIC_KEY` row is integration-managed: its menu offered Manage Connection and Rotate Integration Secrets, but no Edit action. I did not enter the integration workflow or change/rotate it. Because the approved 13-row isolation diff cannot be completed safely through the available scope editor, I stopped without editing any further variable. In particular, generic Preview `DATABASE_URL` and `AUTH_SECRET` remain assigned through All Environments, so Preview fallback absence is not established. None of the seven branch-specific staging variables was added; the Neon connection string was not retrieved and no new `AUTH_SECRET` was generated or stored.

During the interrupted UI sequence a Redeploy confirmation dialog appeared. I canceled it; no Redeploy action was submitted. No build, deployment, SQL, credential provisioning, Git link, domain/DNS, schedule, promotion or spending action occurred. Existing deployments and their environment snapshots remain unchanged. The partial scope edits do not sanitize those deployments and do not establish effective branch resolution or staging readiness.

**Next action and holds.** Stop all staging-branch deployment activity. Obtain an independently reviewed, supported method to change the integration-managed `SENTRY_PUBLIC_KEY` scope without rotating its value or altering the Sentry integration, or revise the approved plan before any further provider change. Then refresh the complete names/scopes inventory and obtain explicit review of this partial state. Do not add branch-specific bindings or retrieve/generate secrets until all generic Preview fallbacks are verified absent and the seven-variable addition can be completed safely. No value or secret was revealed, logged, copied, screenshotted or committed. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — ordinary scopes complete; Sentry isolation assessed (2026-10-19)

**Inventory refresh and ordinary scope edits.** Starting HEAD was `4744b80144ba982b618469cf07e4724a8a3524af`, on the requested branch with a clean worktree. The authenticated `locallift` Project variables view still contained the expected rows. The five remaining ordinary entries were each found at All Environments, had an Edit action, and were changed only by unchecking Preview. After reload, all five read Production + Development: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL`. Their values were not revealed or changed. Together with the prior `NEXT_PUBLIC_APP_URL` change, this completes the six non-Sentry All Environments-to-Production/Development rows. Generic Preview database/session, Google and OpenAI fallbacks are therefore absent from those variable scopes. Previously completed 15 Production-only rows and Production-only `RESEND_WEBHOOK_SECRET` were not edited in this block.

**Sentry ownership and current scope.** All seven Sentry rows were refreshed and read as All Environments: `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, and `NEXT_PUBLIC_SENTRY_DSN`. Each row links to the Sentry integration and offers Manage Connection, Rotate Integration Secrets, Copy to Clipboard, View History and Delete; none offers ordinary Edit. No value was revealed, copied, rotated or changed.

Read-only Manage Connection navigation opened the project’s Sentry resource settings. The Dashboard labels the integration as Sentry, the resource type as `observability`, and the connected project as `locallift` (one connected project shown). Its `Allowed Environments` control currently selects **All environments**. The only other supported choice displayed is **Production environment only**; there is no Production + Development option and no per-variable environment selector. The UI explains that All environments permits connection across environments and keeps secrets readable in the Dashboard/CLI. Production-only would exclude both Preview and Development and propagate the resource’s secrets as Sensitive environment variables, no longer readable in the Dashboard/CLI. The settings page also has resource-level Save, Rotate Secrets and Delete controls. None was used. No unrelated connected project was shown, but this view does not establish effects on separate Sentry resources or other integration instances.

**Result and remaining decision.** Ordinary Preview fallbacks are removed, but the seven Sentry integration variables remain All Environments, so complete Preview isolation is not established. The supported resource-level Production-only choice does not preserve Development and changes secret visibility; the existing approval does not authorize that broader integration mutation. No supported control was found that excludes Preview while preserving Production, Development, existing credential values and the Sentry resource unchanged. No branch-specific staging variable was added, and the Neon connection string was not retrieved; no new session secret was generated.

**Next action / approval request.** Keep staging builds and deployment stopped. The owner must decide whether to authorize the Sentry resource’s Production-only setting with its stated Development and Sensitive-variable effects, or keep the integration unchanged and separately approve review of a supported narrower isolation design. Do not use variable overrides, rotate, disconnect, delete or save integration settings without that decision. After the Sentry path is resolved, refresh the scopes once, then separately resume the seven approved branch-specific additions. Existing deployments retain their prior environment snapshots. No deployment, build, SQL, Git linking, push, domain/DNS, schedule change, promotion or spending occurred; all NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — authorized Sentry isolation attempt stopped (2026-10-19)

**Fresh scope inventory.** Starting HEAD was `8186a96b673b38fedc15433c1ddde2290781358c`, on the requested branch with a clean worktree. The refreshed `locallift` Project variables view matched the reviewed 29-row state: the 15 formerly Production + Preview rows remain Production only; `RESEND_WEBHOOK_SECRET` remains Production only; six non-Sentry rows (`NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL`) read Production + Development; and the seven Sentry rows remain All Environments. Values were not read. This confirms the approved generic database/session, Google and OpenAI Preview fallbacks are absent; the seven Sentry integration scopes still include Preview pending the authorized resource-level setting.

**Sentry target refresh.** Manage Connection again opened the Sentry `observability` resource (`sentry-pink-lantern`) for `locallift`; the Connected Projects section showed one connected project, `locallift`. No additional connected project or different resource appeared. The Allowed Environments controls were unchanged: All environments selected, with only Production environment only as the alternative. The displayed effects matched the prior review: Production-only excludes Preview and Development and propagates the resource secrets as Sensitive, unreadable in the Dashboard/CLI. No Rotate, Delete, Disconnect or Change Configuration action was used.

**Save attempt and read-back.** Under the new owner authorization, I selected Production environment only once. The resource’s scope-specific Save control remained disabled. I did not use the separate resource-name Save button or another configuration path. After reloading the settings page, All environments was selected again. The change therefore did not persist; the seven variable rows still read All Environments. No Sentry setting or propagated variable scope changed. No secret was displayed, retrieved or copied.

**Stopped before staging bindings.** Because Sentry Preview propagation remains, the requested isolation gate is not complete. None of the seven staging-branch variables was added; the Neon connection string was not retrieved, and no staging-only `AUTH_SECRET` was generated. No deployment, build, SQL, login provisioning, Git linking, push, domain/DNS, schedule change, promotion or spending occurred. Existing deployment snapshots remain unchanged.

**Exact blocker and next action.** The Dashboard permits a local radio selection but disables the corresponding Save control and reverts it on reload. Obtain a supported, authorized Dashboard path that makes this exact resource-level Allowed Environments change saveable, or have the owner perform that one setting and provide a read-back for independent verification. Do not use the broader Change Configuration flow, per-variable overrides, rotation or deletion as a workaround. Once the Production-only setting and all seven propagated scopes are verified after reload, refresh generic fallback scopes and only then resume the seven already-approved branch-specific additions. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7A — Sentry verified; branch bindings stopped (2026-10-19)

Starting HEAD was `b0aa3e1f34f3bd64e5fc644fa996eeefe225cd15` on `codex/ornigami-staging-readiness-20261018`, with a clean worktree. After the owner reported saving Allowed Environments, I reloaded the `locallift` Project variables view and independently reopened the same Sentry resource through Manage Connection. Its saved setting read **Production only**; the connected project remained `locallift`. A fresh variable-list read showed all seven propagated Sentry variables at Production only: `SENTRY_PUBLIC_KEY`, `SENTRY_OTLP_TRACES_URL`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_VERCEL_LOG_DRAIN_URL`, and `NEXT_PUBLIC_SENTRY_DSN`. Thus those variables exclude Preview and Development. The approved generic Preview fallbacks also remained absent: `DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, and `NEXT_PUBLIC_APP_URL` read Production + Development; the previously Production-only rows remained Production-only. Values were not inspected.

**Branch-specific save blocked.** I refreshed the Neon connection dialog in the selected company project and confirmed its selected branch, database and role were `fictional-staging`, `ornigami_staging` and `ornigami_staging_owner`. The connection string passed in-memory format checks for PostgreSQL, that role, the exact database path and required SSL/channel-binding parameters. I then prepared only the approved `DATABASE_URL` entry with the custom Preview branch scope `codex/ornigami-staging-readiness-20261018`, excluding Production and Development. Vercel rejected Save with: `Project "locallift" does not have a connected Git repository.` The dialog remained unsaved. I closed it and reloaded the variable list; no branch-specific binding was saved. The existing generic `DATABASE_URL` remains Production + Development. No other staging variable was added.

**Credential handling incident.** The connection string was inadvertently rendered in a diagnostic tool result while checking the rejected form. Its value is intentionally omitted here and must be treated as exposed. The unsaved form was discarded, in-memory copies were cleared, and the browser clipboard was cleared; no database query or connection was made. No credential rotation was authorized or performed. Do not reuse that connection string: before a later binding, rotate/reissue the staging database role credential through an explicitly authorized secure procedure, then transfer the new value directly without diagnostics that render it. No `AUTH_SECRET` was generated or stored.

No SQL, login provisioning, Git linking, push, build, deployment, DNS/domain change, schedule change or spending occurred. Existing deployments and Production scopes were not changed. The seven staging bindings remain unconfigured. The immediate blocker is the disconnected Git source: resolve and independently review a permitted branch-specific configuration path before any retry; Git linking remains outside this authorization. Then separately authorize safe replacement-credential handling. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Independent review — Block 7A credential incident and binding rejection (2026-10-19)

Reviewed commit `9021a0dc25fa9311b975ff251c43736bb55d71cf`; initial worktree was clean and committed diff checks passed. Only the sanitized handoff was inspected; this reviewer did not retrieve the credential, open raw diagnostics, repeat provider reads or make mutations. The report appropriately discloses the exposure and the unsaved binding. Configuration remains incomplete.

**R7A.1 — Contain the exposed credential before source-path work.** Prioritize invalidation of the exposed `ornigami_staging_owner` password in the exact existing company project `ornigami-fictional-staging`, branch `fictional-staging`, database `ornigami_staging`. Do not defer containment until a deployable branch-binding route exists. Clearing a clipboard, form or in-memory value does not revoke the credential or remove the diagnostic/tool record. Obtain explicit authorization for this precise password reset; no broader credential rotation, role recreation, database reset, grant change or Production/Local Lift action is included. Establish a handling method that cannot return the replacement in a diagnostic, tool result, screenshot, clipboard or tracked file before performing it; if unavailable, have the owner reset it directly. Record sanitized provider outcome/time and the known scope of exposure, not the value. Password reset must not be described as proof that existing authenticated sessions were terminated; retain that limitation or separately scope exact-role session containment if needed. No old credential may be reused for binding. Do not claim all historical tool-output copies were erased. Hosted data integrity and absence of misuse have not been established by this report.

**R7A.2 — Narrow the earlier CLI conclusion using the observed rejection.** Block 6Z supports sending genuine local Git metadata for a manual CLI deployment. It did not prove that branch-specific variable creation succeeds on a Git-disconnected project. The observed Vercel rejection now establishes a separate configuration-path blocker. Update the operative plan accordingly; do not claim metadata support alone resolves the branch-variable prerequisite. After credential containment, investigate only documented supported configuration options before requesting any Git connection or deployment. Do not repeat the failed secret-bearing save, invent system-variable overrides, link Git, broaden variables to generic Preview or perform deployment experiments under the existing authorization.

## Block 7A — exposed staging role password reset (2026-10-19)

**Authorized target and procedure.** After the owner authorized only this reset, I verified the Neon Dashboard organization `Ornigami LLC`, project `ornigami-fictional-staging`, branch `fictional-staging`, database ownership `ornigami_staging`, and exact role `ornigami_staging_owner`. Neon’s [Manage roles documentation](https://neon.com/docs/manage/roles) says Console reset generates a new password, displays it in a follow-up modal, and applies immediately; the old password stops working on the next connection. Before acting, I established a handling path that did not read the follow-up modal contents, take a screenshot, use Copy/Download, place the value on the clipboard, or write it to diagnostics or tracked files.

**Outcome.** At approximately 2026-10-19 17:23 UTC (19:23 Europe/Madrid), I confirmed the exact-role reset and clicked Reset once. Neon presented the post-reset password modal; I dismissed it with Escape without inspecting its contents. The Dashboard returned to the exact target role list. No replacement password was retrieved or retained for Vercel binding. No other role, credential, database, branch or provider setting was changed.

**Limits.** Per Neon’s documented behavior, the old password is no longer accepted on a new connection after reset. This does not establish that existing authenticated database sessions were terminated; none were terminated or inspected. The reset does not prove there was no credential misuse or that database contents are unchanged. Historical diagnostic/tool-output copies of the prior exposed value were not erased or verified absent. No SQL or database connection was made.

**R7A.2 correction and next prerequisite.** Block 6Z’s CLI evidence establishes support for genuine local Git metadata on manual CLI deployments only. It does not establish that branch-specific environment variables can be created without Git Integration. The observed Vercel rejection—`Project "locallift" does not have a connected Git repository.`—is a separate unresolved prerequisite. Do not repeat the secret-bearing save or assume CLI metadata resolves variable creation. The next review should investigate supported configuration paths offline; Git linking and deployment remain separate, unauthorized scopes. The replacement database password was not used or bound. All NO-GO, coverage, security, privacy, maintenance, adoption, campaign, provider and deployment holds remain active.

## Block 7B — supported isolated Preview configuration route (2026-10-19)

**Decision.** Use Vercel Git Integration for a future isolated Preview on the existing `locallift` project, subject to separate approval of the source-link and build-control mutations below. Do not use one-off CLI environment injection as the configuration route. No provider state was changed, and no CLI command, build, deployment, credential operation, SQL or push was performed in this assessment.

**Why the CLI route is not selected.** Current [CLI deploy documentation](https://vercel.com/docs/cli/deploy) documents `--env KEY=value` for runtime values and `--build-env KEY=value` for build-time values. The current [global options documentation](https://vercel.com/docs/cli/global-options) documents `--target`, `--local-config`, and explicit project selection with `--project`, `VERCEL_PROJECT_ID`, or `.vercel/project.json`. These options can select Preview, the local `vercel.staging.json`, and `locallift` without connecting Git Integration. However, supplying a secret as a literal flag value would put it in process arguments and creates unacceptable exposure risk.

The installed Vercel CLI is 58.9.1. Read-only source inspection found that deployment code parses `--env`/`--build-env`; an argument containing only a key is resolved from the CLI process environment, with a log of the key but not its value (`dist/commands/deploy/index.js`, `addProcessEnv`, and `dist/chunks/chunk-4IFEBYTL.js`, `parseEnv`). The same source’s `createGitMeta` reads the actual local Git root/config, origin or project-matching remote, latest commit/ref/SHA and dirty state. Official [CLI v28 release notes](https://vercel.com/changelog/vercel-cli-v28) also establish that CLI-created deployments send Git metadata. This confirms genuine local provenance is available in the installed implementation; it does **not** make the bare-key environment form a documented public contract, establish that deployment runtime receives the required `VERCEL_GIT_COMMIT_REF`, or prove Vercel applies branch-specific variables to a Git-disconnected project. The observed Dashboard rejection remains dispositive for the latter. No fabricated system variable or command-line secret is acceptable. A private parent-process environment may reduce argument exposure, but the public contract and the full diagnostics/logging path are not established well enough to rely on it for this staging gate.

**Selected route and exact configuration implications.** Git Integration is the documented route that provides branch-tracked Preview deployments, genuine Vercel Git system metadata, and branch-specific Preview variables ([environment variables](https://vercel.com/docs/environment-variables)). Vercel documents `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF` as system values available at build and runtime ([system variables](https://vercel.com/docs/environment-variables/system-environment-variables)); the latter is the triggering Git branch. The existing private-mode gate therefore remains unchanged and must see `VERCEL_ENV=preview`, `ORNIGAMI_PRIVATE_STAGING_MODE=true`, and `VERCEL_GIT_COMMIT_REF=codex/ornigami-staging-readiness-20261018` from Vercel’s deployment context. The selected remote branch was previously reported absent; a later approved push of the reviewed branch is a prerequisite. That push under an active Git Integration may automatically start a deployment.

Vercel documents root `vercel.json` configuration for Git deployments ([configuration reference](https://vercel.com/docs/project-configuration/vercel-json)), while `--local-config vercel.staging.json` is a CLI option. No official Git-deployment mechanism was found for selecting an alternate filename. Thus the exact Git route cannot consume `vercel.staging.json` by name: prepare a reviewed commit on the selected staging branch whose root `vercel.json` contains the staging-safe configuration (no `crons`), while leaving the Production branch’s `vercel.json` and schedules untouched. Keep `vercel.staging.json` as the reviewed source/reference if useful, but do not claim Git Integration selects it. This branch-specific root-config change is implementation work and must be reviewed before it is pushed.

Branch-scoped values can then be created in `locallift` for Preview branch `codex/ornigami-staging-readiness-20261018`, without adding generic Preview fallbacks. The reviewed seven names remain: `DATABASE_URL` (exact initialized synthetic database), `AUTH_URL=https://staging.ornigami.com`, `NEXT_PUBLIC_APP_URL=https://staging.ornigami.com`, `ORNIGAMI_PRIVATE_STAGING_MODE=true`, `OPENAI_ENABLED=false`, `QR_MAIL_ENABLED=false`, and a fresh staging-only `AUTH_SECRET`. The existing generic Preview fallbacks were read as absent; Sentry was independently read back as Production-only. Recheck both immediately before any future mutation. Do not change Production or Development values/scopes. Vercel documents environment values as encrypted at rest, applied to new deployments, and visible to users with project access; Dashboard entry avoids command-line arguments. A protected secret-entry session must be used, with no value in shell history, CLI arguments, screenshots, logs, diagnostics, clipboard history or tracked files; verify names and scopes after save without revealing secret values. Never retrieve the reset Neon password in this block. The reset modal was dismissed, so its replacement is not available for binding; any future connection string must be obtained through a separately approved secure reissue/transfer step. The previously exposed string must not be reused. The historical incident does not establish that existing sessions ended, that no misuse occurred, or that historical diagnostic copies were erased.

**Automatic-build and Production risks.** Vercel’s [Git deployment documentation](https://vercel.com/docs/git) says pushes to branches automatically create Preview deployments and pushes/merges to the Production Branch create Production deployments. The current Production Branch setting must be freshly read and preserved; do not guess or change it. Before linking, separately approve a narrowly reviewed build filter that permits the exact staging branch and the existing Production branch while skipping other Preview branches. Vercel documents an [Ignored Build Step](https://vercel.com/docs/project-configuration/project-settings) script/custom command that can inspect build-time system variables, and documents exit `1` as continue-build and `0` as cancel. This is a possible control, not a verified setting on `locallift`; canceled builds still count against deployment quotas. Its exact script, behavior for manual/redeploy paths, and Production preservation must be reviewed and verified before the integration is enabled. Alternatively, the documented [`git.deploymentEnabled`](https://vercel.com/docs/project-configuration/git-configuration) configuration can disable deployments by branch, but it is read from repository configuration and must not be assumed to protect the initial connection/push before a reviewed config commit is present. Do not rely on either control without confirming the actual project setting and testing the selected branch behavior under a separately approved deployment scope.

**Proposed sequence, stop conditions and approvals.** (1) Read-only refresh the exact `locallift` identity, repository eligibility, Production Branch, automatic-build controls, protection/domain state, and all Preview variable scopes. Stop if these differ from the reviewed state. (2) Review a branch-only source change making root `vercel.json` staging-safe and a build filter that preserves the verified Production branch and allows only the designated staging Preview; review resulting effects on all other branches. (3) Obtain explicit approval to connect `locallift` to the exact Ornigami repository, configure that build filter, and publish the exact staging branch. These are provider/source mutations and may trigger builds; linking approval must identify those effects. (4) Separately approve creation of only the seven branch-specific Preview values, including a secure fresh database-credential transfer/reissue and generation/storage of a staging-only session secret. If any generic Preview fallback, unexpected integration variable, or changed Production setting appears, stop and quarantine; never broaden to generic Preview. (5) Only after configuration read-back, separately approve one Preview deployment from the exact branch/commit. Verify sanitized deployment metadata confirms Preview, the exact branch and full SHA; verify runtime reports the intended staging origin/database identity without exposing secrets; verify private protection and no cron schedules; verify Production domains, variables, schedules and current deployment remain unchanged. Any provenance, binding, privacy, identity, protection or isolation mismatch means fail closed: do not assign the staging hostname, promote, or retry without review.

The immediate approval needed is **not** deployment approval: authorize (or decline) the exact Git Integration connection to the identified repository and the reviewed branch/build filter, with its automatic-build effects. The separate branch-variable/credential transfer and first Preview deployment approvals remain outstanding. This decision closes no coverage, maintenance, security, privacy, acceptance, adoption, campaign or deployment hold; private staging remains NO-GO.

## Independent review — Block 7B (2026-10-19)

Reviewed commit `aba404f76229bacb719eaee916c79b5d0fc16810`; initial worktree was clean and committed diff checks passed. Official Vercel docs support root-config Git deployments and the stated ignored-build exit codes. No authenticated reads, CLI invocation, provider changes or implementation were performed by the reviewer. The Git route is a candidate, but its activation/approval sequence needs correction before requesting a connection or push.

**R7B.1 — Keep setup inert until the first deployment is authorized.** The proposed filter permits staging builds, and step (3) connects Git/publishes the branch before step (4) creates its required Preview variables, while step (5) reserves deployment approval for later. A push or connection-triggered build can therefore run before configuration, access and deployment approval. Separate preparation from activation: first prepare concrete local controls; then propose a separately approved setup state that blocks every application build before any link/push; only after configuration/protection read-back and separate first-deployment approval should an exact staging-only activation be considered. Do not say connection/push is "not deployment approval" while allowing it to start an application deployment. If initial connection effects cannot be controlled or established, keep linking NO-GO. Ignored Build Step creates canceled deployment records and consumes quota; it is not proof that no provider deployment record exists, nor an access/security boundary. Record those effects in any setup approval request.

**R7B.2 — Preserve current Production without enabling new Production automation.** This project is currently Git-disconnected and the last recorded UI had no configured Production Branch. Historical deployment metadata for `main` does not establish an existing Git build policy. A filter allowing Production would introduce automatic Production builds rather than merely preserve the current served deployment. Do not enable them under a Preview-only request. Distinguish the existing served Production deployment/domain from a newly selected Git Production Branch, and include any required new branch-setting mutation explicitly in a later approval. Keep Production application builds disabled during this staging-only setup unless separately authorized.

**Reviewable next work.** Prepare the exact inactive/setup and later staging-only filter recipes and a local test matrix before asking for provider permission. A project-level setup guard must not depend on a script present only on the unpublished staging branch: absent files or unexpected command exit codes can otherwise cause continuation (Vercel uses exit 1 to continue). Test missing/unknown refs, Production, other Preview branches, the selected Preview, and failure behavior. Preserve the production branch's source/configuration and do not create a remote branch, link Git or activate a build while preparing these local artifacts. The branch-only schedule-free root config remains preparatory work, not authorization to publish/deploy it. No new credential retrieval is needed for this correction. All existing holds and incident limitations remain active.

## Block 7B correction — inactive setup and Preview-only activation (2026-10-19)

**R7B.1/R7B.2 correction markers.** This section supersedes Block 7B’s earlier order that linked/published before all Preview configuration was ready and its suggestion to permit a Production build. The current served Production deployment/domain is to remain as-is; this Preview-only plan does not select a new Git Production Branch and does not authorize new Production application builds. The local production `vercel.json` and its schedules remain unchanged in this block.

**Prepared state 1 — setup, no application builds.** The documented setup recipe is the existing Vercel Dashboard project setting: `locallift` → Settings → Build and Deployment → Ignored Build Step → **Don't build anything**. Set and read back this built-in mode before any Git connection or branch push; it does not depend on a file in the unpublished staging branch. Keep the Git Integration disconnected, add no remote branch, and do not use manual deploy/redeploy actions. Vercel documents this mode as never issuing a new build. Its ignored-build flow runs when a deployment enters `BUILDING`; canceled attempts create deployment records and count against deployment quotas/concurrent build slots. Therefore “setup” means application build code is skipped, not that no deployment record, build-step execution, or quota use can occur, and the setting is not deployment access protection.

**Linking remains blocked.** Current Vercel docs describe the Ignored Build Step control and its execution after a deployment enters `BUILDING`, but do not establish that this setting can be saved while the project is Git-disconnected or that it is guaranteed to govern the first connection-triggered event before any application build. No Dashboard setting was changed or tested here. Until a read-only project-specific pre-link read-back and authoritative first-link behavior establish that the built-in guard is effective before connecting, do not link `locallift`, push the branch, or request that mutation. If the setting is unavailable before linking, or Vercel cannot establish its initial-link ordering, stop and keep Git disconnected. Any future setup authorization must explicitly accept possible canceled deployment records/quota use while prohibiting an application build.

**Prepared state 2 — later exact-Preview activation recipe.** The tested inline recipe is in [`scripts/vercel/preview-only-ignored-build-step.sh`](../../scripts/vercel/preview-only-ignored-build-step.sh). After Git is connected under the separately verified setup state, the reviewed staging configuration and branch-only variables are read back, private deployment protection is verified, and a separate first-deployment approval exists, the proposed Ignored Build Step **Custom** value is the file’s command line, pasted inline (the Dashboard must not call a branch-only script):

```sh
if [ "${VERCEL_ENV-}" = "preview" ] && [ "${VERCEL_GIT_COMMIT_REF-}" = "codex/ornigami-staging-readiness-20261018" ]; then exit 1; else exit 0; fi
```

Vercel defines exit `1` as continue the application build and exit `0` as cancel. The recipe continues only the exact selected Preview branch. Every other Preview branch, Production (even if its ref happens to match), Development, unknown environments, absent/empty refs and mismatches return `0`. Production application builds remain disabled; no Git Production Branch is selected by this plan. The current served Production deployment/domain is preserved independently of any future Git branch configuration. The staging branch’s planned root `vercel.json` must be schedule-free; it is not replaced or published here, and the Production branch’s root config is not edited.

This is a pre-build filter, not private access protection. Vercel documents that canceled attempts still consume deployment quota. Its docs also describe an option to bypass the Ignore Build Step during a manual redeploy; manual deployment/redeploy and any bypass path remain prohibited. The exact Custom value must be read back byte-for-byte against the reviewed recipe before activation. If it differs, cannot be read back, or an invocation result is not exactly `0` or `1`, leave the setup mode at **Don't build anything** and stop. Vercel documentation differs in describing unexpected command statuses ([Project Settings](https://vercel.com/docs/project-configuration/project-settings) describes `0`/`1`; the [troubleshooting guide](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel) says `1` or greater continues); the tested recipe itself has only `0`/`1` outcomes for the exercised inputs, but this does not prove platform handling of interpreter, configuration, or infrastructure errors. Preserve the inactive setup guard until the exact command is confirmed and any such platform failure behavior is resolved.

**Local control and test evidence.** `tests/vercel-preview-build-gate.test.mjs` reads the command from the prepared recipe file and invokes that exact text with Bash, rather than reproducing the condition in test code. `node --test tests/vercel-preview-build-gate.test.mjs` passed 6/6: exact selected Preview continues; other Preview, Production, Development, unknown/missing environment and branch values cancel; the recipe parses as Bash and produces no output. `bash -n scripts/vercel/preview-only-ignored-build-step.sh` passed. These are local command checks only; they do not prove Vercel Dashboard persistence, initial-link behavior, deployment records, production serving, private access, or hosted enforcement.

**Corrected order and approval boundaries.** (1) Read-only establish that the built-in no-build setting is available on disconnected `locallift`, read back the saved setting, and establish its first-link behavior. If either is unavailable, linking remains NO-GO. (2) Only under separate approval, set/read back **Don't build anything**, then separately authorize the exact Git connection; understand that a canceled record/quota use may occur. Do not select a Git Production Branch. (3) Keep the built-in guard active while separately approved source preparation/push and branch-specific configuration are reviewed and read back, including the schedule-free staging root config, exact Preview variables, credentials, origin and private access. A push may create canceled records but must not run application build code. (4) Keep all Production application builds disabled. (5) Only after gates pass, obtain distinct approval to replace the inactive setting with the exact tested Custom recipe and to initiate one deployment from the exact selected Preview branch/commit. This activation changes which future push can build; it is not a deployment approval by itself. Trigger no build until the separate deployment approval is explicit. Verify sanitized Preview/ref/SHA metadata, runtime target, private protection, no schedules, and unchanged Production deployment/domain/scopes. Any unexpected Production build path, protection bypass, mismatched ref/config or uncertain result returns the project to the inactive guard and stops work.

The immediate unresolved prerequisite is evidence that **Don't build anything** can be established and is effective before the first Git-link event on this disconnected project. No provider mutation, Git link, push, build, deployment, credential operation or hosted check occurred. All existing NO-GO, coverage, security, privacy, maintenance, adoption, campaign and incident limitations remain active.

## Block 7C — inactive setup guard saved and verified (2026-10-19)

**Exact project and initial read.** In the authenticated Dashboard, `locallift` → Settings → Git stated “This Project is not connected to a Git repository.” No Git provider or repository control was used. Settings → Build and Deployment → Ignored Build Step initially had Behavior **Automatic**. The Project Settings control was available and editable while disconnected; the built-in **Don’t build anything** option was visible. No restriction or dependency on Git linking was displayed.

**Authorized setting and persisted result.** Selected **Don’t build anything** and saved once. Reloaded the settings page and expanded the Ignored Build Step → Project Settings section. Behavior remained **Don’t build anything**, the disabled Command field read `exit 0`, and Save was disabled. Returned to Settings → Git, which still said the project was not connected to a Git repository. No other setting was changed. No Redeploy prompt appeared; no deployment action was requested or performed. The page stayed on settings with no visible error or unexpected effect. Deployment history was not inspected, so no claim is made about deployment records.

**Documented behavior, inference and untested limit.** Current [Vercel Project Settings documentation](https://vercel.com/docs/project-configuration/project-settings) describes Ignored Build Step as a project setting. It states that the command runs when a deployment enters `BUILDING`, that `0` cancels the deployment/build step, and that `1` continues the build. It describes **Don’t build anything** as never issuing a new build and separately states canceled attempts count against deployment quotas and concurrent build slots. Vercel’s [Git deployment documentation](https://vercel.com/docs/git) says branch pushes create deployments. Together, these facts support the inference that subsequent Git-triggered attempts for this project will use the saved project-wide guard and cancel before application build code. This has not been tested with a Git-triggered deployment. The docs do not establish whether a first Git connection itself triggers an attempt or whether its initial event is guaranteed to pass through this guard before any application build; that behavior remains untested. The setting is not access protection and may be bypassed for a manual redeploy by unchecking the project guard.

**Next recommendation and boundary.** Keep the verified **Don’t build anything** setting in place and Git disconnected. Send this result for independent review; only a later, separately scoped decision to link should proceed if the initial-link path is accepted as adequately controlled. Otherwise retain the block and obtain authoritative clarification before linking. No Production Branch was selected, no staging branch/config was published, and no activation recipe was installed. Existing served Production, credentials, Preview variables, domains and schedules were not changed. All other holds and incident limitations remain active.

## Block 7C — inactive setup guard established (2026-10-19)

**Project and starting state.** In the authenticated Vercel Dashboard, the selected `locallift` project’s Settings → Git page stated: “This Project is not connected to a Git repository.” The page offered provider connection controls; none was used. Settings → Build and Deployment → Ignored Build Step initially showed **Automatic**. The setting editor was available while Git remained disconnected; no blocking restriction or confirmation prompt appeared.

**Authorized change and read-back.** I selected the built-in **Don’t build anything** behavior, whose visible command was `exit 0`, and saved once. After reloading the page and reopening the Project Settings section of Ignored Build Step, the Behavior control still showed **Don’t build anything**, the command field showed `exit 0`, and Save was disabled. I returned to Settings → Git; the project still stated it was not connected to a Git repository. No repository, branch, build, deployment, redeploy or other project setting was changed. No Redeploy prompt appeared. The page remained in settings after save; I did not inspect deployment history, so this is not a claim about deployment records or other remote effects.

**Scope of evidence.** Vercel’s [Project Settings documentation](https://vercel.com/docs/project-configuration/project-settings) describes Ignored Build Step as a project setting, states the selected command runs when a deployment enters `BUILDING`, and defines `0` as immediately canceling the deployment/build step and `1` as continuing the build. It also states canceled attempts count toward deployment quotas and concurrent build slots, and notes that an operator can bypass the setting when redeploying. Based on that documented project-level behavior, the saved `exit 0` setting should cancel subsequent Git-triggered build attempts before application build work once those attempts pass through Ignored Build Step. That is an inference from the documented setting scope and execution point; no Git-triggered build was run to test it. The setting does not promise the absence of deployment records, does not protect access, and can be bypassed on a manual redeploy.

**Initial-link limitation and next action.** Documentation does not establish whether connecting Git itself triggers an event that bypasses or precedes this guard, nor does this read-only verification test that first-link path. Therefore Git linking remains blocked pending independent review of this result and resolution of the initial-link behavior. Keep **Don’t build anything** in place; do not select a Production Branch, connect Git, publish a branch, activate the Preview-only command, or deploy. A future approved activation remains subject to exact Preview-branch control, configuration and private-protection read-back, and separate deployment approval. All prior holds and credential-incident limitations remain active.

## Block 7D — controlled Git connection under inactive guard (2026-10-19)

**Pre-connection checks.** In the authenticated Dashboard I confirmed the selected project was `locallift`. Settings → Build and Deployment → Ignored Build Step → Project Settings read **Don’t build anything**, with the disabled command `exit 0`. The Settings → Git page stated that the project had no connected repository. The Production card showed a Ready deployment created 5 October 2026 from `main` at commit `e21249e`; `ornigami.com` and the project’s Vercel alias were associated with it. The connected GitHub namespace already listed the exact `joserubiobejarano/Ornigami` repository. No new GitHub scope/install request or broader permission prompt appeared; I did not open “Add GitHub Scope.”

**Authorized connection and read-back.** I selected Connect for that repository once. Vercel reported “Connected Git Repository successfully.” After reloading Settings → Git, the project showed `joserubiobejarano/Ornigami` as connected. No other repository was selected. A fresh read-back of Ignored Build Step still showed **Don’t build anything** and `exit 0`; it was not edited. No branch was manually selected or changed. The post-link Overview still showed the same Ready Production deployment from `main` / `e21249e`, with `ornigami.com` and the same Vercel alias. The Overview stated that pushing to `main` updates Production. This is the current dashboard indication of the Production branch; because the pre-link disconnected project had no branch setting to compare, the UI does not establish whether `main` was automatically assigned by this connection. No claim is made that any branch-setting state changes the already served deployment.

**Deployment-history check and limits.** The project Deployment history showed no connection-time record in the inspected view; its newest visible record remained the 5 October Ready Production deployment. The view retained author/Production/status filters, and a canceled-only Production query returned no results. The Overview’s visible Active Branches entries were older Preview deployments. No new application build was observed and no attempt required cancellation. This bounded Dashboard check does not prove that no remote deployment/preflight record exists outside the visible filters/history; it also does not establish that the first connection event is always stopped before application build code. No deployment, redeploy, promotion, branch publication, configuration, domain, credential, database, schedule or quota-setting action was performed. The owner accepted possible canceled/preflight records and quota use for this connection.

**Status.** Git is connected and the no-build guard remains persisted. The link is setup only: application build/deployment activation remains unauthorized. Production remains associated with the pre-existing deployment/domain shown above. First-link guard behavior remains untested; connection-triggered deployment effects remain bounded by the inspected metadata. Keep the guard in place and stop for independent review before any configuration, branch-setting or activation work. No other hold is lifted; all coverage, security, privacy, maintenance, adoption, campaign, credential-incident and deployment limitations remain active.

## Block 7E — local Git-based staging configuration (2026-10-19)

**Branch-only configuration change.** On this staging branch, root `vercel.json` now exactly matches the reviewed minimal `vercel.staging.json` (schema declaration only). It has no `crons` property. This makes the Git-consumed root config schedule-free for a future staging-branch deployment. `vercel.staging.json` remains unchanged as the reference. The private-Preview application gate and its tests/recipe are unchanged. No provider configuration or project-wide build guard was changed.

**Validation changes.** Updated `scripts/validate-vercel-staging-config.mjs` to read Git-consumed root `vercel.json`, require it to be minimal and cron-free, and compare it with the reviewed staging reference. The obsolete assertion that this branch’s root config must retain all Production schedules is removed. Added `tests/validate-vercel-staging-config.test.mjs` for the passing minimal config, rejection of both empty and populated cron declarations, and rejection of unreviewed root settings.

**Commands and results.** `node scripts/validate-vercel-staging-config.mjs` passed. `node --check scripts/validate-vercel-staging-config.mjs` and `node --check tests/validate-vercel-staging-config.test.mjs` passed. `node --test tests/vercel-preview-build-gate.test.mjs` passed 6/6; `node --test tests/validate-vercel-staging-config.test.mjs` passed 3/3. Git Bash `-n scripts/vercel/preview-only-ignored-build-step.sh` passed. `git diff --check` passed. No build or deployment was run.

**Rollback and Production boundary.** A reviewed local `git revert` of the Block 7E commit restores the previous root file and its three Production cron declarations. Do not merge or cherry-pick this branch-specific root-config change into Production without a separate review of scheduler ownership, cron behavior and Production schedule implications. No push/publication is authorized here; the remote Vercel project remains under its existing **Don’t build anything** / `exit 0` guard. The schedule-free file is not yet deployed, and local validation does not establish hosted schedule or runtime behavior.

**Remaining gates.** Branch publication, branch-setting changes, Preview variables, access/protection verification, activation of the exact-Preview build gate, and any deployment remain separately unauthorized. The synthetic database has no usable login credential; do not retrieve or handle database credentials in this block. This commit closes only local config preparation/validation. All readiness, coverage, security, privacy, maintenance, adoption, campaign and deployment holds remain active.

## Block 7F — controlled staging-branch publication (2026-10-19)

**Pre-publication checks.** The local branch was `codex/ornigami-staging-readiness-20261018`, at reviewed HEAD `62e03a3b3233d9b5e15aa7dfe778901c7952d431`, with a clean worktree. `origin` resolved to the exact repository `https://github.com/joserubiobejarano/Ornigami`. Before publication, `git ls-remote --heads origin refs/heads/codex/ornigami-staging-readiness-20261018` returned no ref; no divergent remote branch existed. In the authenticated Vercel Dashboard, Settings → Git showed that `locallift` remained connected to `joserubiobejarano/Ornigami`. Settings → Build and Deployment → Ignored Build Step → Project Settings showed **Don’t build anything**, with command `exit 0`. The Production overview showed Ready on `main` at `e21249e` (`e21249e971177a9c70c9a5534f4c8c6ff317cd79`), associated with `ornigami.com` and `locallift-indol.vercel.app`.

**Publication.** Published exactly the reviewed commit with `git push --no-follow-tags origin 62e03a3b3233d9b5e15aa7dfe778901c7952d431:refs/heads/codex/ornigami-staging-readiness-20261018`. No other refspec, tag, force option or `main` update was used. A subsequent `git ls-remote --heads origin refs/heads/codex/ornigami-staging-readiness-20261018` returned `62e03a3b3233d9b5e15aa7dfe778901c7952d431`; local HEAD remained the same reviewed commit at that point.

**Vercel activity and post-publication read-back.** The Dashboard showed one Preview record for the exact staging branch and exact SHA, created 19 October 2026 at the displayed clock text `17:54:30` (timezone unverified). Its state was **Canceled**; Vercel stated: “The deployment was canceled because the Ignored Build Step command is configured to skip this build.” The record had no build duration. This is evidence of the canceled preflight record, not an application build or runtime test. No application build was observed, so no cancellation action was needed. The fresh post-publication overview still showed the same Ready Production deployment on `main` / `e21249e` and the same two domain associations. The settings read-back still showed **Don’t build anything** / `exit 0`. No build was activated, and no manual deployment, redeploy, promotion or guard change occurred.

**Evidence limits and next gates.** These Dashboard reads cover the visible branch record and current Production association at inspection time; they do not establish privacy, staging variables, login readiness, application/runtime acceptance, or that every provider-side effect is absent. The canceled Preview record has deployment metadata, but no application build was performed. The documentation added by this block is a later local commit and was intentionally not pushed; therefore the remote staging branch remains at the published SHA above. Remaining gates include configuration and access/protection review, exact-Preview build-gate activation under separate approval, synthetic login provisioning, accepted-image/runtime review, and separately approved application deployment. All existing readiness, coverage, security, privacy, maintenance, adoption, campaign and deployment holds remain active.

**Local handoff verification.** `git diff --check` passed. No application tests were run for this documentation-only record.

### Independent review — R7F.1: clarify the publication record timestamp

The reviewer independently confirmed that the remote staging ref resolves to `62e03a3b3233d9b5e15aa7dfe778901c7952d431`, that the later handoff commit is local only, and that the worktree was clean before this note. Publication identity passes review. The narrative records the Vercel record at `17:54:30 Europe/Madrid`, whereas the published commit records `19:50:28 +0200` on the same date. Those timestamps imply a deployment record preceding its source commit. Verify the displayed time and its timezone from retained sanitized evidence or a read-only metadata inspection; correct the narrative with a correction marker. Do not assume the display used UTC. If the timezone cannot be established, retain the observed clock text and explicitly mark the timezone/normalized time unverified. This documentation issue does not contradict the independently verified remote SHA or establish a publication/build-control defect. No push, deployment retry or provider mutation is required to resolve it.

## Block 7G — non-secret branch-specific Preview settings (2026-10-19)

**R7F.1 correction (2026-10-19).** The previous Block 7F sentence attributed the displayed clock text `17:54:30` to Europe/Madrid without retained evidence sufficient to verify that timezone. A fresh read-only visit to the exact Vercel deployment detail showed only a relative age (`23m ago` at inspection); the detail exposed no absolute timestamp or timezone. The corrected Block 7F record therefore retains `17:54:30` only as previously observed display text and marks its timezone and normalized instant unverified. The Dashboard metadata now confirms the canceled record still identifies Preview, the exact branch and SHA, and states it was skipped by the Ignored Build Step. It does not resolve the timestamp comparison with the Git commit time.

**Pre-change verification.** The authenticated Dashboard identified `locallift` connected to `joserubiobejarano/Ornigami`. Settings → Build and Deployment → Ignored Build Step → Project Settings showed **Don’t build anything** selected and command `exit 0`. The refreshed variable list displayed 19 existing entries and no generic Preview-scoped rows. Sentry variables remained Production-only. The five requested names had no conflicting entry scoped to the staging branch. `NEXT_PUBLIC_APP_URL` already had a separate Production and Development entry; its existing value/scopes were left intact. The Preview Branches selector listed `codex/ornigami-staging-readiness-20261018`.

**Authorized settings and read-back.** Added five non-secret Config variables exclusively to Preview branch `codex/ornigami-staging-readiness-20261018`; each save was followed by a page reload and value/scope read-back:

| Variable | Verified value | Verified scope |
| --- | --- | --- |
| `AUTH_URL` | `https://staging.ornigami.com` | Preview branch `codex/ornigami-staging-readiness-20261018` only |
| `NEXT_PUBLIC_APP_URL` | `https://staging.ornigami.com` | Preview branch `codex/ornigami-staging-readiness-20261018` only; existing Production and Development entry preserved |
| `ORNIGAMI_PRIVATE_STAGING_MODE` | `true` | Preview branch `codex/ornigami-staging-readiness-20261018` only |
| `OPENAI_ENABLED` | `false` | Preview branch `codex/ornigami-staging-readiness-20261018` only |
| `QR_MAIL_ENABLED` | `false` | Preview branch `codex/ornigami-staging-readiness-20261018` only |

The five saved rows reappeared after reload with Preview scope paired to the exact branch; no generic Preview fallback was introduced. The complete pre-change inventory had no generic Preview rows, and the only pre-existing matching name, `NEXT_PUBLIC_APP_URL`, retained its Production and Development entry. Other Production and Development scopes were not edited. The post-change Ignored Build Step read-back still showed **Don’t build anything** / `exit 0`. No redeploy prompt was accepted and no build/deployment action occurred.

**Limitations and remaining gates.** No `DATABASE_URL`, `AUTH_SECRET`, login credential or other secret was retrieved, generated, changed or saved. No SQL, push, build, deployment, promotion, domain/DNS, integration or guard change occurred. The local branch and remote staging ref remain at the expected staging SHA; this handoff commit is local only. These settings do not prove that a later deployment resolves the branch values at runtime, that the private Preview is protected, or that the application passes acceptance. Synthetic login provisioning, database/session binding, runtime identity and private-access verification, build-gate activation, accepted-image review and separately approved deployment remain outstanding. All readiness and deployment holds remain active.

**Local handoff verification.** `git diff --check` passed. No application tests were needed for this provider-configuration and documentation block.

## Block 7H — configure staging secrets through the CLI (2026-10-19)

**Scope and identity.** This block used installed Neon CLI 4.14.3, Vercel CLI 58.9.1 and Node.js 24.11.1; no installation or upgrade occurred. The local branch was `codex/ornigami-staging-readiness-20261018` at `ef2181e84ca454ca96dc65b829e4fc360da26d66`; the published staging ref still resolved to `62e03a3b3233d9b5e15aa7dfe778901c7952d431`. Vercel project inspection identified `locallift` in its existing owner scope. The authenticated Neon CLI metadata uniquely matched Organization `Ornigami LLC` (`org-orange-band-18388903`), project `ornigami-fictional-staging` (`dawn-lake-13525647`), branch `fictional-staging` (`br-young-voice-bamzc53o`), database `ornigami_staging` (`53061`) and role `ornigami_staging_owner`. No SQL or database connection test was run.

**Preflight and supported transfer.** The installed help confirmed the Neon command accepts explicit project, branch, role, database and required-SSL options. Vercel CLI help confirmed `env add` accepts the exact Preview branch, project, `--visibility secret`, `--sensitive`, and stdin when `--value` is omitted. A local dummy-only child-process check captured successful stdout and failure stderr privately, confirmed the dummy bytes were absent from arguments, and made no provider mutation. The first guarded preflight stopped before credential retrieval because its parser treated Vercel's `target` array as a scalar and included an unsupported read-only analytics option. A separate sanitized metadata read confirmed exactly the five existing Preview Config entries on the requested branch; the harness was corrected and rerun successfully before retrieving anything. No write was attempted by the failed preflight.

The Neon CLI stdout was captured in process memory and never forwarded. Its single returned URL was parsed privately and accepted only when it identified the selected role and database, used a Neon hostname and required SSL; project and branch were supplied explicitly by their verified IDs. A fresh `AUTH_SECRET` was generated from 32 cryptographically random bytes in process memory. Each value was sent only through the child process stdin to an explicit `vercel env add` invocation; neither value appeared in command arguments, console output, files, environment dumps, screenshots or this handoff. Child stdout/stderr were captured in memory and only fixed, value-free statuses were emitted. No reset, reuse of the previously exposed password, environment pull, or raw error output occurred.

**Saved settings and read-back.** `DATABASE_URL` and `AUTH_SECRET` were each added once, with `preview`, `--git-branch codex/ornigami-staging-readiness-20261018`, `--project locallift`, the verified owner scope, `--visibility secret`, `--sensitive` and noninteractive confirmation. No overwrite/force option was used. Each save was followed by a metadata-only read-back. The final Preview inventory contained exactly seven entries: the five prior Config variables and these two Secret variables, all exclusively on the exact branch. The Dashboard reload showed the Secret classification for both new entries and the exact Preview branch scope. The five Config entries remained `config`, Preview-only and branch-scoped; their values were not revealed or downloaded in this block, and the prior Block 7G value read-back remains the recorded source for those values. No generic Preview entry or conflicting Preview `DATABASE_URL`/`AUTH_SECRET` existed before the writes.

A strict post-write check initially reported a Production/Development scope mismatch because it expected each shared variable's metadata target to contain only one environment. A sanitized follow-up read showed the existing `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` entries still have their pre-existing combined Production/Development scopes; this run did not write to those entries. The five staging Config values and existing Production/Development values were not retrieved during this follow-up. No Production or Development scope was changed.

**Guard and limits.** After the saves, the Dashboard still showed **Don’t build anything** selected with command `exit 0`. No redeploy prompt was accepted; no build, deployment, promotion, push, SQL, login provisioning, domain/DNS, schedule, integration or unrelated variable change occurred. The metadata responses were parsed locally and only names, targets and classifications were emitted; no plaintext or secret value was returned in tool output. Runtime branch resolution, connection identity from an application process, authentication, private-access enforcement and application acceptance remain untested. Configuration does not close the existing coverage, security, privacy, maintenance, adoption, campaign or deployment holds. The prior credential incident limitations remain: the old exposed password had been reset, but that is not evidence of terminated sessions or absence of misuse; no historical diagnostic copies are claimed erased.

**Remaining gates.** This block authorizes and completes only the two staging Secret bindings. Do not retrieve or provision a synthetic-user password, run SQL, activate the build gate, build, deploy, redeploy, promote or alter domains. Runtime binding and accepted-image review require their separately reviewed scopes and approvals. The Vercel project remains under the inactive guard, and the local handoff commit is not pushed.

**Local handoff verification.** `git diff --check` passed. No application tests or connection tests were run. The post-write Preview metadata read-back found 7/7 expected branch entries; Production/Development metadata showed the existing combined scopes; the final guard read-back remained **Don’t build anything** / `exit 0`.

## Block 7I — isolated local Preview build verification (2026-10-19)

**Candidate and isolation.** Preflight confirmed branch `codex/ornigami-staging-readiness-20261018`, local documentation-only HEAD `619b73e5334f8c7e7451370c3b34d91a4a4f4a5d`, published candidate `62e03a3b3233d9b5e15aa7dfe778901c7952d431`, and no tracked or untracked changes. A detached temporary Git worktree was created at the published candidate SHA. It contained no `.vercel`, `.next`, `node_modules`, or dotenv files; `.env.example` was the only tracked dotenv-named file. The original worktree build output was not used or modified.

**Framework and dependencies.** Node.js was `v24.11.1` (`win32-x64`), npm `11.6.2`, candidate Next.js `16.4.2`, React/React DOM `19.2.9`, and TypeScript `5.9.3`. The repository-installed Next.js in the original checkout was an older `16.3.8`, so the `building.md` guide was read from the candidate's exact vendored `next-16.4.2-ornigami-sri.2.tgz` archive (same guide present after installation). The archive is 44,857,205 bytes and its SHA-512 exactly matches the `package-lock.json` `node_modules/next` integrity (`17BrG8dBp5eMwEyf8YEr2+bSB94tOFV3DVcDkBEIi91FM40Va7Dzsa0OK2jIEBQHhaNqjbSxdG0lb/sIlmIwEA==`). Sanitized `npm ci --no-audit --no-fund` completed successfully (`655 packages`); the lockfile was not changed and no dependency upgrade was performed.

**Build environment and command.** The build child process received `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=codex/ornigami-staging-readiness-20261018`, `ORNIGAMI_PRIVATE_STAGING_MODE=true`, `AUTH_URL=https://staging.ornigami.com`, `NEXT_PUBLIC_APP_URL=https://staging.ornigami.com`, `OPENAI_ENABLED=false`, `QR_MAIL_ENABLED=false`, and a one-run disposable `AUTH_SECRET`. It received no `DATABASE_URL`, Google, Stripe, mail, OpenAI or Sentry credential; database access was not needed. The runner used a temporary home, npm config/cache and environment allowlist, with a 15-minute child-process bound. It invoked the unchanged normal script `npm run build` (`next build --webpack && node scripts/generate-static-csp-hashes.mjs`), without container-only tuning.

The build **exited 0** in about one minute: Next compiled successfully, completed TypeScript, generated all 24 static pages, and generated 2 static CSP hashes. No database or application integration access was required. The source imports `next/font/google`; this build produced Google font assets. Outbound access was not separately blocked or traced, so this run cannot establish that font resolution was cache-only. No Google Business Profile credentials or calls were used; whether the public Google Fonts endpoint was contacted is unverified and must be accounted for in review of the “no external service actions” constraint.

**Artifact and focused checks.** The generated `.next/static-csp-hashes.json` has 2 entries and exactly matches hashes recomputed from the 2 generated static HTML pages. Server instrumentation is present. The Next SRI manifest has 322 entries: 66 point to source-map files that were not emitted, and, among the 256 referenced emitted files, one digest mismatch was found for `static/pCo1QsISbvf5Ttudv9nVh/_ssgManifest.js`. This is an unresolved SRI artifact finding; it is not waived by the successful build or by the SRI helper unit tests. The existing `tests/sri-production-check.test.mjs` passed all 6 tests, which test its checker logic but do not validate this build's runtime script tags.

Focused tests passed: `tests/private-preview-google-gate.test.mts` (7/7), the selected private Preview review-replies cron test in `tests/a12-cron-routes.test.mts` (1/1), `tests/validate-vercel-staging-config.test.mjs` (3/3), and `tests/sri-production-check.test.mjs` (6/6), for 17/17 assertions. The private Preview test process ran without ambient Vercel mode variables because its cases provide their own modes; the application build separately used the exact requested Preview metadata. An initial test invocation inherited the Preview values and failed one ordinary-mode case because the harness merges ambient variables; the isolated rerun passed. No broad test suite or runtime acceptance was run.

**Limitations and next steps.** This is a local build result only. It proves neither hosted Vercel compatibility nor runtime secret/database binding, privacy, login, recovery, rollback, external-access controls or staging acceptance. Before any hosted build/deployment decision, independently review (1) the `_ssgManifest.js` digest and absent source-map entries, identify and fix the smallest finalization/manifest accounting defect without weakening SRI checks, and repeat artifact verification; (2) the untraced `next/font/google` build-time network behavior, using an explicitly reviewed public-font fetch or vendored local fonts if zero external access is required. Preserve the existing inactive Vercel build guard and all prior readiness holds. No provider configuration, secrets, SQL, login, push, hosted build, deployment, redeploy, gate, domain or DNS action occurred.

**Cleanup and handoff verification.** Only the temporary worktree and temporary runner/cache/artifacts created for this block were removed. `git diff --check` passed before the local handoff commit. The candidate checkout's tracked status remained clean; the original working tree contained only this appended handoff record. No application/framework fix was implemented.

## Block 7I follow-up — 19 October 2026

**Checkpoint and attempt reconciliation.** Continued on `codex/ornigami-staging-readiness-20261018` at source SHA `f55170f5ec7e9472e4726e422943570690a874b3`; the application tree matches published candidate `62e03a3b3233d9b5e15aa7dfe778901c7952d431`. [Correction R7I.3] The earlier preparatory runner accepted `install`, `build` and `checks` modes. It did include a build command, but the only retained output is from install (`npm ci --ignore-scripts`, 600,000 ms bound; 655 packages in 59 seconds, empty stderr). No build or artifact result was retained from that attempt, and its checks selection differs from the final rerun. The earlier Block 7I statement that temporary resources were all removed was too broad. The exact prep worktree/root has since been removed and its registration verified absent. The prior final-run evidence was unavailable, so the distinct bounded rerun below supplies the final retained evidence; it does not retroactively verify the earlier attempt.

**Isolated final rerun.** Created `%TEMP%/ornigami-block7i-rerun-20261019/candidate` from `f55170f5ec7e9472e4726e422943570690a874b3`; no dotenv, `.vercel`, private recovery evidence, or pre-existing build/install output was copied. Node v24.11.1, npm 11.6.2, Next 16.4.2, React/React DOM 19.2.9 and TypeScript 5.9.3 were used. The 44,857,205-byte vendored Next archive SHA-512 matches the lock integrity. `npm ci --no-audit --no-fund` (lifecycle scripts enabled) exited 0 within 900,000 ms. With only the exact synthetic private Preview settings, disposable in-memory AUTH_SECRET, no DATABASE_URL, and no provider credentials, the unmodified normal `npm run build` exited 0 within 900,000 ms. This was the normal script `next build --webpack && node scripts/generate-static-csp-hashes.mjs`. The build runner had to be force-stopped after recording child exit 0 because its proxy sockets kept the helper alive; the helper had no remaining child process.

**Network and guides.** Before any source change was considered, the exact installed Next 16.4.2 building, CSP and `productionBrowserSourceMaps` guides were read from `node_modules/next/dist/docs/`. The production guide says browser source maps are disabled by default unless enabled. [Correction R7I.4] The rerun record describes a loopback proxy policy allowing CONNECT only to `fonts.googleapis.com:443` and `fonts.gstatic.com:443`, denying other CONNECT destinations, with `NODE_USE_ENV_PROXY=1`. The retained event log records zero CONNECT events for either font host and six denied CONNECT events for `o1.ingest.sentry.io:443`. These are proxy observations; they do not prove system-wide egress enforcement or rule out connections that bypassed the proxy. The runtime proxy log records zero events during the two HTTP inspections. No complete system/network trace is retained.

**R7I.2 artifact/runtime disposition.** The final SRI manifest has 322 entries: 256 files exist, of which 255 digests match; one existing file mismatches, and 66 entries are absent. [Correction R7I.3] The absent entries are 65 `.js.map` files and one `.css.map` file (`static/css/27f0ccbdac66f318.css.map`), all under `.next/static`; their full paths and all manifest-entry hashes remain in [ORNIGAMI_BLOCK_7I_FOLLOWUP_20261019.json](ORNIGAMI_BLOCK_7I_FOLLOWUP_20261019.json). The separate count of 144 refers to source-map files present in the completed `.next` tree; a path/type inventory for those 144 was not retained. The prior explanation based only on Next's production default was incomplete. The checked-in `next.config.ts` wraps Next with `withSentryConfig`, sets `widenClientFileUpload: true`, and does not specify `sourcemaps.deleteSourcemapsAfterUpload`. The locally installed and locked `@sentry/nextjs` version is 10.69.0. Its `build/cjs/config/webpack.js` enables `source-map` for server and `hidden-source-map` for client production compilations when maps are not disabled; when the client deletion option is unset, it defaults `deleteSourcemapsAfterUpload` to true. `build/cjs/config/getBuildPluginOptions.js` selects `.next/static/**/*` files matching `.js.map`, `.mjs.map`, `.cjs.map` and `.css.map` for deletion after upload. This source-level wrapper behavior is consistent with the 66 absent static map entries and explains why the Next default alone was not a sufficient explanation. It is a plausible mechanism, not an observed upload/deletion trace: retained output does not establish that Sentry uploaded or deleted these files. The absent maps are non-executable. The only digest mismatch remains `.next/static/rTxqHisr3zO3jgLrcC-MD/_ssgManifest.js` (expected `sha256-b1tKoA0vjWrtmTW0cYBr96zvRk0MHTkCYOX+J/gAxn4=`, emitted `sha256-Z49s4suAsf5y/GfnQSvm4qtq2ggxEbZPfEDTXjy6XgA=`). Next writes it during later build finalization. The candidate uses App Router only. No application/framework change or weakening of executable-asset SRI is justified by these findings.

The retained runtime check inspected two HTTP HTML responses (`/` and `/login`) and fetched/checked the 31 initial same-origin script references present in those responses (15 and 16). Both returned 200; the reported script-byte SRI checks, security-header checks and nonce-bound CSP checks passed for those responses and references. This was not browser execution: it did not test JavaScript execution, hydration, client navigation, dynamic/lazy chunks, interaction flows or full application acceptance. It does not establish that a browser would make no other requests or that all executable assets in every application state pass SRI/CSP.

**Cleanup, correction and limitations.** The earlier preparatory root and this rerun root were each validated as descendants of their identified `%TEMP%` roots before removal; only their exact worktree registrations and roots were removed. The unrelated `glowing-planet` worktree was preserved. This is local build/runtime evidence only. It does not establish hosted Vercel build behavior, secret/database binding, login, rollback, external privacy or staging acceptance. The remote `Don’t build anything` / exit 0 guard and all prior holds remain; no provider action, database access, hosted credentials, push, deployment, guard activation or login provisioning occurred.

## Block 7I independent review — 19 October 2026

**Disposition and independently checked evidence.** Reviewed completed HEAD `f55170f5ec7e9472e4726e422943570690a874b3` on `codex/ornigami-staging-readiness-20261018`, against baseline `619b73e5334f8c7e7451370c3b34d91a4a4f4a5d`. The initial main worktree was clean; the complete baseline diff adds only the 18-line Block 7I handoff. Application files also match published candidate `62e03a3b3233d9b5e15aa7dfe778901c7952d431`. Independently recomputed the vendored archive's 44,857,205-byte size and SHA-512: both match Block 7I and the lockfile. Locked Next/React/React DOM/TypeScript identities and the normal build script match the narrative. The reported build success, 17 passing tests, CSP result and SRI counts are implementer-reported results, not independently reproduced here. No provider/Dashboard verification, secret retrieval, database access, build or test rerun was performed by this reviewer. The explicit unresolved SRI and network limitations are appropriately disclosed; this is not staging acceptance.

**R7I.1 [P2] — Cleanup claim is contradicted by remaining Block 7I resources.** `git worktree list --porcelain` still registers `C:/Users/joser/AppData/Local/Temp/ornigami-block7i-4cc2b9ee467d4fbda8ec54476bfd19d8/candidate` at the published SHA. That directory exists and has a clean tracked status, installed `node_modules` (including `next/package.json`), and no `.next` directory. Its parent still contains `run-sanitized.ps1`, `npm-cache`, `node-compile-cache`, and install stdout/stderr logs. Thus a clean original worktree does not establish completion of temporary-resource cleanup. Acceptance: identify and reconcile all attempts/resources belonging to this block; after retaining only reviewed, credential-free evidence, remove only those resources and their Git worktree registration. Resolve and verify each absolute deletion target stays inside the identified temporary root; preserve unrelated worktrees. Record actual cleanup results and correct the earlier completion claim. Reviewer left these resources untouched.

**R7I.2 [P2] — Reconcile the final execution evidence with the surviving runner.** The remaining `run-sanitized.ps1` clears the child environment and supplies the requested synthetic Preview settings, but its install command is `npm ci --ignore-scripts --no-audit --no-fund`, its build timeout is 600,000 ms (10 minutes), and its checks selection differs from the final reported 17-test selection. Only install logs remain there (`added 655 packages in 59s`; empty stderr); no final build logs, artifact report or final runner was found in this block's remaining temporary root. This may be an earlier attempt, rather than the reported final runner; it does not prove the final narrative false. It does prevent independent confirmation of the final install lifecycle policy, 15-minute timeout, artifact checks and test invocation from that evidence. Acceptance: distinguish preparatory and final attempts, correct any inaccurate claims, and retain a compact sanitized final command/environment-name/timeout record plus exit statuses and machine-readable artifact results. Record source SHA, archive/lock identity, manifest and emitted-file hashes, missing-file paths and digest mismatches; do not retain credential values, dotenv files or raw ambient environment. If the original final evidence cannot be recovered safely, label it unavailable and use one bounded isolated rerun under the next expressly authorized local scope. A documented failing artifact check is a valid finding; do not convert it into a pass or claim the historical run independently verified.

**Next bounded local scope proposed, not executed by this review.** Resolve the reported `_ssgManifest.js` mismatch and classify the 66 absent source maps from reproducible final build artifacts before choosing a fix. Establish which files are requested/executed and why maps were removed; do not assume every absent map is a browser SRI failure. Any local fix must preserve strict integrity for executable assets and preserve CSP/private Preview behavior. Use the exact normal build with isolated synthetic settings, contain or explicitly account for build-time public font/network activity, retain sanitized evidence, and finish the cleanup above. No hosted credentials, live database/provider access or changes, push, deployment, guard activation, login provisioning or staging acceptance is authorized by this review. The remote no-build guard and all prior holds remain required. The credential reset still establishes neither session termination nor absence of misuse.

## Block 7I follow-up independent review — 19 October 2026

**Checked state and disposition.** Reviewed HEAD `51cdd90fa582923659b065c3641e03546c5c085b` on the required branch. The complete diff since `f55170f5ec7e9472e4726e422943570690a874b3` changes only the handoff and new JSON inventory; application files still match the published candidate. The sole initial unstaged change was the preserved prior review notes. Both identified temporary roots are now absent and neither worktree is registered; unrelated `glowing-planet` remains. R7I.1 cleanup is resolved. Independently checked the inventory's internal accounting: 322 unique entries, 256 existing, 255 matching, one `_ssgManifest.js` mismatch and 66 missing maps. All 31 listed script references across the two HTTP responses map to matching inventory entries; the two static CSP hash sets agree. This checks retained report consistency, not the deleted build bytes or an independently repeated build. The retained command results report build exit 0 and 19 passing tests. No application correction is required by the checks reviewed here; the manifest mismatch remains real and scoped, not an all-artifacts SRI pass. Two documentation/evidence corrections follow; neither requires another build merely to fix wording.

**R7I.3 [P2] — Correct the attempt history and source-map explanation.** The previously inspected preparatory runner explicitly accepted `install`, `build`, and `checks` modes and had an `npm run build` branch; the new handoff and JSON assertion that it had "no build mode" is false. Say no build output was retained there, without claiming the runner lacked the capability. The inventory's 66 missing entries comprise **65 `.js.map` files and one `.css.map`**, `static/css/27f0ccbdac66f318.css.map`; correct "all ... .js.map" in both records. Finally, the exact Next guide's default does not establish why this wrapped build has absent maps: `next.config.ts` uses `withSentryConfig`; installed and locked `@sentry/nextjs` are both 10.69.0, whose `build/cjs/config/webpack.js` enables production source maps (`source-map` server / `hidden-source-map` client) and defaults client `deleteSourcemapsAfterUpload` to true when not explicitly set. Its `getBuildPluginOptions.js` selects static map files for deletion. Acceptance: correct these facts in the response/JSON with a correction marker; cite the applicable wrapper path and distinguish source-supported explanation from an observed deletion trace. Maps remain non-executable; no source-map generation, upload, deletion, SRI or application setting change is requested.

**R7I.4 [P2] — Keep network and runtime conclusions within the retained evidence.** The JSON retains proxy policy and connection events, but not the full sanitized child environment-name list or runner/checker implementation; `NODE_USE_ENV_PROXY=1` alone does not document all clients' proxy configuration. The exact vendored Next font fetcher uses its own proxy agent selected from `https_proxy`/`HTTPS_PROXY` or `http_proxy`/`HTTP_PROXY`. Zero recorded font proxy events establishes zero observed requests through that proxy; an environment proxy is not independent system-wide egress enforcement. Likewise, the retained runtime result is HTTP HTML/script-response inspection for `/` and `/login`; it contains no browser execution, hydration, navigation or dynamic-chunk request trace. Acceptance: add safely recoverable environment names/proxy/mock configuration and verification method if available (no secret values), or explicitly mark them unavailable and narrow claims to observed proxy events and the 31 initial HTML script references. Do not claim all outbound access was blocked/traced, that the browser made no other requests, or that full application executable SRI/CSP acceptance is established. Keep the supported result that these two responses and their fetched script bytes passed the reported checks. No retrospective proof or new network/build run is required to state these limits accurately.

**Review boundaries.** This reviewer performed local read-only inspection and report consistency checks, plus this handoff append only. No tests/build, provider/Dashboard inspection, credential retrieval or mutation occurred. Hosted access protection, runtime binding/authentication, recovery/rollback and all prior acceptance holds remain outside this local result. The no-build guard has not been independently reverified in this review and must remain active.

## Block 7I close-out corrections — 19 October 2026

The review notes above are preserved as historical review records. The following `[Correction R7I.3]` and `[Correction R7I.4]` markers amend the implementation narrative; they do not rewrite the reviewer’s contemporaneous findings. This documentation-only close-out used local source/configuration inspection and consistency checks only. No build or test was rerun.

**R7I.3 resolved — preparatory runner and source-map accounting.** The prep runner supported install, build and checks modes; only its install output survived. The inventory has 65 missing JavaScript maps and one missing CSS map. Exact local source inspection of locked/installed `@sentry/nextjs` 10.69.0 and `next.config.ts` shows client source-map generation and default post-upload deletion behavior for static map files, while the normal build configuration does not explicitly override `deleteSourcemapsAfterUpload`. This is a source-supported explanation consistent with the missing paths, not proof that an upload or deletion occurred. The 144 map files reported present elsewhere in `.next` remain a run-time count only; their detailed path/type inventory was not retained. The SRI inventory remains intact, including all 66 missing paths and the unresolved `_ssgManifest.js` mismatch. No settings were changed.

**R7I.4 resolved — evidence scope and unavailable details.** The 33-name build child allowlist is recorded in the JSON, recovered from the sanitized temporary runner configuration inspected during the earlier execution; that runner source was removed during scoped cleanup. The recorded names include `NODE_USE_ENV_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`, `https_proxy`, `http_proxy`, `NO_PROXY` and `no_proxy`; the loopback proxy policy, two allowed font hosts and observed event outcomes are retained. Actual proxy values and its ephemeral port are unavailable. The project checker remains at `scripts/sri-production-check.mjs`; the temporary runtime wrapper and the full temporary runner source are unavailable. Local Next font-fetcher source shows its lookup order is `https_proxy`/`HTTPS_PROXY`, then `http_proxy`/`HTTP_PROXY`; this is source behavior, not proof of which values the build consumed. No system-wide egress enforcement or complete direct-connection trace is retained. Network findings are limited to observed proxy events. Runtime findings cover two HTTP responses and their 31 initial script references, not browser execution, hydration, navigation, dynamic chunks or full application acceptance.

The two relevant local Preview responses and referenced script bytes passed the recorded checks; the generated static CSP hashes match the recorded static HTML. The manifest mismatch remains unresolved as an artifact finding. Hosted build/acceptance, authentication and runtime secret/database binding, recovery/rollback, external privacy, security, coverage, maintenance/adoption and deployment gates remain open. The remote Vercel `Don’t build anything` / exit 0 guard and all prior holds remain active. No provider/database access or mutation, hosted credential use, push, deployment, login provisioning or guard activation occurred.

## Hosted Preview acceptance plan — approval required (2026-10-19)

**Purpose and authority.** This is a proposed sequence and evidence standard for a single private hosted Preview of published candidate `62e03a3b3233d9b5e15aa7dfe778901c7952d431` from branch `codex/ornigami-staging-readiness-20261018`. It records no provider action and grants no deployment, build-gate, credential, database, login, domain, or other provider authorization. The current Vercel `Don’t build anything` / `exit 0` guard and all coverage, security, privacy, maintenance/adoption, campaign, and deployment holds stay active until separately resolved and explicitly authorized. The local build and Block 7I evidence do not close those holds.

### Established facts

- The handoff records Vercel project `locallift` linked to `joserubiobejarano/Ornigami`. The last recorded guard read-back was `Don’t build anything` / `exit 0`; the independent Block 7I review did not recheck it. Refresh its state before any future action.
- Block 7H recorded seven Preview entries scoped only to the exact staging branch: `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `ORNIGAMI_PRIVATE_STAGING_MODE`, `OPENAI_ENABLED`, `QR_MAIL_ENABLED`, `DATABASE_URL`, and `AUTH_SECRET`. The two latter entries were classified Secret; the five prior entries were Config. Their values are not reproduced here. The recording proves metadata/configuration at that time, not what a future deployment receives at runtime.
- The recorded synthetic database target is Neon organization `Ornigami LLC`, project `ornigami-fictional-staging`, branch `fictional-staging`, database `ornigami_staging`, role `ornigami_staging_owner`. Block 7H did not connect to it. No current binding or runtime database identity has been established.
- The account has a synthetic user/fixture but no usable login credential. No successful login has been established. The private Preview code path is intended to omit Google auth, block Google/GBP and review-replies cron integrations, and use synthetic dashboard data; hosted behavior remains unverified.
- Block 7I retained local evidence for two HTTP HTML responses (`/` and `/login`) and their 31 initial script references. Those responses and script bytes passed the recorded checks, and recorded static CSP hashes matched the HTML. This is not browser execution, hydration, navigation, dynamic-chunk coverage, hosted SRI/CSP acceptance, or full application acceptance.
- The 322-entry local artifact inventory records 256 existing files, 255 matching digests, one unresolved `_ssgManifest.js` digest mismatch, and 66 missing maps (65 `.js.map`, one `.css.map`). Maps are non-executable; the Sentry wrapper provides a source-supported explanation consistent with their absence, not an observed upload/deletion trace. The manifest finding remains open and must not be waived by weakening executable-asset SRI.
- Local network evidence is limited to observed proxy events. It does not establish system-wide egress blocking or a complete direct-connection trace. No hosted acceptance, external-access protection, recovery, or rollback has been demonstrated.

### Preconditions and execution order

The sequence below separates settings and evidence available before a deployment exists from candidate-specific checks that require its URL. Keep Production and its domains untouched; do not attach `staging.ornigami.com` or alter DNS. The target is one immutable Preview for the published candidate SHA. All existing holds remain: in particular, no Vercel Preview acceptance, app rollback, runtime binding, authentication, SRI/CSP acceptance, or readiness gate is established by this plan.

1. **Read-only capability and identity review.** Confirm the local branch and candidate SHA. In the Vercel project, inspect the repository link, exact current build/ignore-build setting, setting scope, protection options, deployment/trigger controls, immutable commit metadata, concurrent-event behavior, deployment-disable/delete semantics, and Production target. Read metadata only for the seven branch-scoped variable names/targets/classifications and the named Neon synthetic target; do not retrieve values or connect. Verify whether `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, and `VERCEL_GIT_COMMIT_SHA` are available and trustworthy in the ignore-build command, whether an already-published immutable SHA can be selected without pushing, and whether a unique one-shot/serialized trigger and immediate guard restoration are supported. These provider capabilities are not established by local evidence and must be verified read-only before approval or mutation. Record sanitized evidence and timestamps. Any identity drift, missing control, or unsupported capability is a stop; do not probe by changing a setting or triggering a build.
2. **Configure and verify protection before candidate creation.** Under separate owner approval, set Preview deployment protection for the project to require authentication restricted to the specifically named owner/operator accounts. Verify the setting’s Preview scope and saved state through provider metadata before triggering anything. If an existing harmless protected deployment/resource is available, use it to test anonymous denial and authorized access; the canceled candidate attempt is not a running resource and proves nothing about access control. If no such resource exists, record that candidate URL checks remain pending until after creation. Do not share any candidate URL. If the provider cannot protect immutable Preview URLs before creation, stop.
3. **Resolve rollback and define first-trial containment.** No accepted hosted staging app or usable staging rollback target is established. Mark **application rollback unavailable**; retain the rollback/readiness hold and do not invent a target. Section 7’s accepted OCI image/rollback requirements describe the separate Coolify/image-delivery path; they do not create a Vercel rollback target or waive its gates. Read-only review must establish whether that existing gate blocks this Preview and obtain an explicit owner disposition before proceeding. If a first Preview is separately allowed despite rollback remaining unavailable, approve this exact containment procedure in advance: (a) immediately restore the project’s exact prior `Don’t build anything` / `exit 0` setting to prevent new admissions; (b) independently disable/delete only the exact candidate deployment and confirm its immutable URL no longer serves application content, while retaining Preview protection; (c) confirm no alias/domain was created and no other deployment was touched; (d) preserve sanitized receipts and stop all further Preview triggers. Guard restoration alone is not containment of a deployment already admitted. Read-only capability review must verify that disable/delete revokes the immutable URL; if it does not, identify a provider-supported exact candidate isolation action before any creation. This containment limits exposure; it does not restore an earlier application or satisfy rollback acceptance.
4. **Approve the build gate and deployment together before triggering.** Vercel’s Ignore Build Step decides whether a Git event continues into a build; allowing the candidate event also creates/proceeds with its Preview deployment. They are coupled in this proposal. Before any trigger, the owner must separately approve both (i) the exact temporary setting change and its project-wide mutation scope, and (ii) creation of this exact Preview deployment plus the containment procedure. Merely approving a setting change does not authorize the trigger. The proposed command is:

   ```sh
   if [ "${VERCEL_ENV-}" = "preview" ] \
     && [ "${VERCEL_GIT_COMMIT_REF-}" = "codex/ornigami-staging-readiness-20261018" ] \
     && [ "${VERCEL_GIT_COMMIT_SHA-}" = "62e03a3b3233d9b5e15aa7dfe778901c7952d431" ]; then
     exit 1
   else
     exit 0
   fi
   ```

   Under the recorded Vercel convention, exit 1 continues and exit 0 cancels. The current repository helper checks only Preview environment and branch, so it is insufficient for this candidate and is not proposed for use or modification. The proposed predicate must be verified read-only against provider documentation/settings before any approval; if the SHA variable is absent, mutable, or not evaluated for this hook, do not substitute branch-only matching. The setting itself may be project-wide even though this predicate admits only the exact Preview/ref/SHA tuple; confirm how all other refs/environments, including Production and every other branch, evaluate to exit 0. A project-wide setting mutation is not a branch-scoped mutation.

   The candidate already exists on the published ref; do not push to create an event. Before approval, read-only provider capability review must establish a supported trigger that selects the immutable SHA `62e03a3b3233d9b5e15aa7dfe778901c7952d431`, not “latest” on a mutable branch. It must also establish whether the provider can serialize/deduplicate events for that commit and how a single admitted event is identified. The predicate admits every duplicate event for the same tuple and has no attempt counter. Thus the one-attempt bound is **procedural, not technically enforced by this command** unless a supported one-shot trigger or equivalent concurrency control is verified. For a strict one-attempt requirement, absent that capability is a stop. If the owner explicitly accepts a procedural limit instead, document that residual duplicate/concurrency risk in the approval; do not describe the attempt as technically one-shot.

   Only after both approvals and all preconditions, invoke the verified immutable-SHA trigger once. Record its event/deployment ID and ignore-step result. Restore the exact prior `Don’t build anything` / `exit 0` setting as soon as the provider confirms the target event has passed the ignore step, then read back the restored setting before waiting for build completion. Verify read-only beforehand that restoring the setting does not cancel or alter the already-admitted build. If a duplicate or concurrent event appears, restore the guard immediately, contain each exact candidate deployment under the approved procedure, stop, and do not retry. If trigger identity, result, or restoration cannot be established, stop and treat outcome as unknown. The promised repository build is unchanged `npm run build`; capture the resulting deployment ID, immutable URL, SHA, Preview environment, command/settings, and sanitized outcome. A wrong/unknown SHA, wrong environment, extra admitted event, failed restoration, or ambiguous state is not acceptance.
5. **Post-creation candidate access checks.** Only after a deployment exists and its URL/ID are recorded, test that exact immutable URL from logged-out/private and authorized browser contexts. Expected: unauthenticated request is challenged/denied before application HTML; named authorized operator can reach it. Confirm the protection policy still applies to this URL and no alias/custom domain bypass exists. If either test fails, execute only the pre-approved containment procedure; do not regard protection-setting metadata or a different resource’s test as candidate-specific proof.
6. **Verify environment binding without disclosure.** Confirm the deployment metadata resolves all seven expected variables only in Preview for the exact branch; inspect names, scopes, and classifications, never values. The reviewed private Preview path must report/use `VERCEL_ENV=preview`, the exact `VERCEL_GIT_COMMIT_REF`, and `ORNIGAMI_PRIVATE_STAGING_MODE=true`. Verify that `DATABASE_URL` resolves to the named synthetic target without printing, copying, hashing, or logging its value. Use only an existing reviewed read-only health/identity check; if none exists or its side effects are uncertain, stop rather than add an endpoint or run SQL. Expected: a non-mutating check identifies only the synthetic database and role, with no Production data reachable. Any mismatch, disclosure, write-capable path, or ambiguity is a stop and containment trigger.
7. **Verify authentication and disabled integrations.** Confirm unauthenticated application routes are denied/redirected and Google sign-in is absent in private mode. Positive synthetic-user authentication requires separate approval for the existing synthetic account’s credential setup; without it, mark positive-auth acceptance blocked. If authorized, use only agreed synthetic read-only routes. Capture browser requests and sanitized logs showing no Google/GBP, review-replies cron, OpenAI, QR mail, Stripe, Sentry, or scheduled invocation. Any live integration call, unexpected credential, real-user/data exposure, or write is a stop and containment trigger.
8. **Run browser SRI/CSP checks.** From the authorized protected browser session, exercise `/`, `/login`, and agreed synthetic dashboard navigation. Capture console, response headers, CSP violations, and all network requests, including dynamic chunks. Verify each requested executable JavaScript response against its integrity digest; require no missing/incorrect integrity, SRI rejection, CSP bypass/violation, or unexpected external executable. Existing two-response/31-initial-script evidence is baseline only. `_ssgManifest.js` remains unresolved: if referenced/requested and rejected by strict SRI, fail and contain. Do not remove integrity metadata, broaden CSP, suppress errors, or exclude executable assets. If not requested, retain that exact evidence but keep the artifact mismatch open; any artifact correction needs separate application review.
9. **Acceptance, observation, and recovery.** Accept only if identity, pre- and post-creation protection, environment binding, required authentication, disabled integrations, browser SRI/CSP, agreed read-only workflows, and required recovery gates all pass with sanitized receipts. Observe for a pre-agreed period for unexpected calls, errors, or writes. On any failed/unknown gate, exposure, SRI/CSP error, Production identity, real data, or loss of protection: stop, use the separately approved containment action, preserve evidence, do not promote/alias/retry, and report rollback unavailable unless an independently verified application recovery target exists. Passing this Preview is not Production approval and does not clear other readiness holds.

### Evidence and decision matrix

| Check | Passing evidence and expected result | Failure / stop handling |
| --- | --- | --- |
| Deployment identity | Provider receipt ties immutable deployment ID/URL to `locallift`, exact repository, branch, candidate SHA, and Preview environment; Production record unchanged. | Wrong or ambiguous target/SHA/environment: stop before app use; preserve deployment metadata and keep protection on. |
| Access protection | Policy receipt names authorized identities; logged-out request is challenged/denied; authorized request succeeds; URL not shared before protection. | Public HTML, bypass, unavailable policy, or unexpected access: revoke/disable Preview by the approved procedure; no build/exposure until corrected and separately authorized. |
| Configuration and synthetic DB | Metadata-only branch scope for the seven names; no values emitted; reviewed read-only app check identifies only `ornigami-fictional-staging / fictional-staging / ornigami_staging / ornigami_staging_owner`. | Missing/wrong scope or identity, disclosure, or write-capable check: stop; no value repair or SQL; seek exact separate authorization. |
| Authentication and integrations | Unauthenticated denial; approved synthetic login succeeds if authorized; browser/log evidence shows no forbidden provider, cron, mail, payment, AI, or telemetry call. | No usable credential means positive authentication remains blocked; unexpected call/write/real data means stop and restore protected state. |
| Browser SRI/CSP | Browser capture covers requested initial and dynamic executable assets; all JavaScript integrity checks pass against response bytes; CSP enforced without violations/bypass. | Any requested bad/missing digest, CSP violation, or mismatch linked to `_ssgManifest.js`: fail. Keep strict SRI; no acceptance until separately reviewed correction. |
| Acceptance and rollback | All prior gates pass; sanitized receipts and observation results retained; known prior private Preview and exact recovery action are available. | Any failed/unknown gate or unavailable rollback: no acceptance/promotion; execute only pre-authorized protection restoration, then report remaining uncertainty. |

### Proposed provider mutations — separate owner authorization required

No mutation is authorized by this document. The proposed package is limited to the following, with each item independently confirmed in the live provider UI before execution:

| Proposed action | Exact scope and intended state | Risk and reversal | Required authorization |
| --- | --- | --- | --- |
| Enable Preview access protection | Vercel project `locallift`, Preview deployments only, restricted to named owner/operator accounts, applied before any application deployment is exposed; no custom domain or Production policy change. | Risk: authorized reviewers may be locked out or a Preview may remain reachable if policy is misapplied. Reverse by disabling/deleting only the candidate Preview or restoring the recorded prior Preview protection policy; never make it public as a workaround. | Owner must approve the exact access mode, named accounts, Preview-only scope, verification, and reversal operator. If Vercel cannot enforce that scope, no deployment. |
| Temporarily set the Ignore Build Step predicate | Vercel project `locallift` setting (potentially project-wide mutation) to the exact `VERCEL_ENV=preview`, exact branch ref, and exact candidate SHA predicate in step 4; all other tuples return exit 0. This proposal requires future read-only confirmation that Vercel supplies/evaluates the SHA variable and that the setting behaves as described. | Risk: project-wide setting affects every event; unsupported/missing variables, duplicates, or concurrency can admit an unintended build. Restore the recorded exact `Don’t build anything` / `exit 0` setting immediately after the target event passes the hook, read it back, and verify the admitted build continues. If any capability is unavailable, do not mutate. | Owner must approve the exact command, project-wide setting scope, allowed tuple, attempt-limit semantics, event handling, restoration point, and residual risk. Separate approval is also required for deployment creation/trigger. |
| Trigger one candidate Preview deployment | Only a provider-supported immutable-SHA trigger for the exact published SHA after protection, capability review, and containment preconditions pass. No push, mutable “latest” ref, promotion, alias, domain, DNS, schedule, or Production change. | Risk: build and deployment are coupled; duplicate/concurrent event or wrong ref may create an exposed deployment. Before trigger, authorize exact candidate containment: restore guard, disable/delete only candidate deployment(s), verify URL no longer serves app content, retain protection, and confirm no aliases. This is containment only; no application rollback target exists. | Owner must separately approve this exact hosted creation/trigger after readiness holds are dispositioned, plus the exact containment procedure. If the provider cannot prove exact-SHA trigger and effective containment, do not trigger. |
| Synthetic login credential setup, only if required | Existing synthetic user on the named synthetic staging database only; no real user, no Production auth, no Google OAuth. No account or credential is provisioned by this plan. | Risk: credential may be exposed or session state may persist; reversal requires separately reviewed credential reset/revocation and session invalidation, neither assumed. | Separate explicit owner approval must identify the synthetic account, credential delivery method, one-time scope, session cleanup, and recovery. Without it, positive authenticated acceptance remains blocked. |

The seven recorded branch-scoped environment entries are not proposed for modification. If read-only refresh finds them missing, changed, or mis-scoped, stop and prepare a separate exact change request; do not retrieve or replace secret values. No database mutation, SQL, integration activation, login creation, custom-domain/DNS change, Production change, push, promotion, or guard activation occurs through this documentation. The no-build guard stays active until separately approved changes are actually authorized; once a future approved trigger has passed the predicate, restore and verify the exact prior guard immediately. Do not interpret guard restoration as disabling an admitted deployment. Approval for a setting, trigger, login setup, or any other step does not authorize the rest or waive an existing readiness hold. If no previous staging deployment exists, application rollback remains unavailable and its hold remains open even if first-trial containment is separately approved.

### Owner decisions required before proceeding

1. Approve or reject the Preview-only access-protection mode, exact authorized accounts, and its verification/reversal procedure.
2. After read-only capability verification, approve or reject the exact proposed Ignore Build Step predicate, acknowledging that the setting may be project-wide while the predicate admits only one Preview/ref/SHA tuple. Decide whether a procedural attempt limit is acceptable or a technically one-shot/serialized trigger is mandatory; if required controls are unsupported, retain the guard and stop.
3. Separately approve or reject one immutable-SHA trigger that couples build and deployment, after readiness holds have an explicit disposition. Approve the named operator and exact first-trial containment action. A rollback target is not established; decide whether the existing rollback hold blocks this Preview or requires a separate prerequisite task. Do not treat containment as rollback.
4. Decide whether positive authenticated-user acceptance is required now. If yes, separately approve the narrowly scoped synthetic-user credential plan above; if no, record authentication acceptance as blocked rather than passed.
5. Decide whether the lack of an existing accepted staging deployment/rollback target blocks any first Preview. If not blocked for a single trial, explicitly accept that application rollback remains unavailable and its hold stays open; approve containment only, not rollback.

No decision in this list is inferred from prior local work or earlier approvals for unrelated staging/database tasks. Until the applicable decisions are explicit and the corresponding prerequisites are evidenced, make no provider change or hosted deployment.

## Hosted Preview acceptance plan independent review — 19 October 2026

**Reviewed state.** Reviewed `577614b9e4456250d8e2563d8a4cd95aa8f7ae5a` on `codex/ornigami-staging-readiness-20261018` against `54f999a1c6f2529c714f091aac1763cd2a840f7a`. Initial worktree was clean; the complete diff adds only the 61-line plan. The plan correctly preserves prior holds, distinguishes reported evidence from unverified runtime behavior, retains strict SRI, and grants no provider authority. No provider/Dashboard inspection, credential retrieval, build or test was performed by this reviewer. Two planning defects require correction before the plan is used to request execution approval.

**R7J.1 [P2] — Remove the first-Preview sequencing cycle and separate containment from rollback.** Steps 2–3 require testing/recording the candidate's immutable URL and deployment ID before step 4 permits its build, and require an acceptable prior private Preview before creating the first accepted hosted Preview. The checkpoint establishes no accepted hosted staging application or verified rollback. The mutation table and owner decision 5 repeat that prior-Preview requirement without providing a first-trial path; asking the owner to name a target does not establish one. A canceled publication record is not a running application acceptance target. Acceptance: describe protection policy/capability evidence obtainable before creation separately from candidate-specific logged-out/authorized URL checks after creation. If a harmless existing protected resource can validate the policy, identify it without implying it proves the future candidate's protection. Define a separately approved first-trial containment action (e.g. exact candidate disable/delete plus guard restoration) when no prior staging target exists; mark application rollback unavailable and preserve its acceptance hold. If prior rollback is mandatory under an existing gate, cite that gate and describe the prerequisite task instead of a circular deployment sequence. Do not invent an accepted prior Preview, waive existing holds, or treat guard restoration alone as disabling an already running deployment. Make any build/deployment coupling explicit and require both applicable approvals before triggering it.

**R7J.2 [P2] — Specify how the exact-SHA, one-attempt build exception would be bounded.** The proposal promises one attempt at `62e03a3b3233d9b5e15aa7dfe778901c7952d431` but supplies no exact proposed setting/command or trigger mechanism. The existing `scripts/vercel/preview-only-ignored-build-step.sh` allows every Preview build on the named branch; it checks neither `VERCEL_GIT_COMMIT_SHA` nor attempt count. Temporarily enabling that recipe would not itself enforce the promised SHA/one-attempt boundary. Step 4 also says not to proceed when the platform cannot scope the exception, while the mutation table allows a separately approved project-wide setting change; distinguish a project-wide setting's mutation scope from the environments/refs permitted by its predicate. Acceptance: document the exact proposed ignore-build setting/predicate and supported immutable-candidate trigger, what actually enforces SHA/environment/ref selection, how duplicate/concurrent events are handled, and the observable restoration point. State honestly whether the one-attempt limit is procedural or technically enforced. Include a stop/fallback if the available controls cannot meet that scope; do not activate a guard, change the script, push, or deploy to discover this. Keep Production and other branches excluded, and retain separate owner approval for the exact setting mutation and hosted creation. Provider details not established by local evidence must remain prerequisites for a future read-only capability check, not asserted capabilities.

**Required follow-up scope.** Correct the plan locally using current sanitized evidence and focused source inspection, retain these review notes, and present a coherent first-trial proposal with exact authorization boundaries. No provider/database access or mutation, credentials, new application implementation, tests/builds, push or deployment is authorized by this review. The current remote no-build guard must remain active; no owner decision is needed merely to repair the document.

## Vercel capability review — 19 October 2026 [Correction R7K]

**Scope and evidence custody.** Read-only review completed on `codex/ornigami-staging-readiness-20261018` at local HEAD `3f9fafb60d549ad26fd20c3fce28f82b9f9fd5f5`, for published candidate `62e03a3b3233d9b5e15aa7dfe778901c7952d431`. Vercel observations were made approximately **2026-10-19 19:30–19:36 UTC** using Vercel CLI **58.9.1** and the authenticated Vercel Dashboard. No deployment URL was opened; no application request, setting change, build, trigger, deployment, deletion, environment-value read, intentional credential retrieval, or database access was performed. One credential-shaped value was returned inadvertently, as disclosed below. Sanitized command/status record: `vercel --version` exit 0; `vercel project inspect locallift` exit 0; `vercel ls locallift --json --limit 100` exit 0; `vercel project protection locallift --json` exit 0 (raw response omitted because it contained a credential-shaped value); Dashboard pages read: project overview, Git, Environments, Build and Deployment, Deployment Protection, and Project Members. `.vercel/project.json` was read for its project link only. No raw environment/config JSON was added to the handoff or a local evidence file.

**Credential handling note.** A read-only `vercel project protection locallift --json` response unexpectedly included a credential-shaped automation-bypass value as a JSON property. Its value is not reproduced here or saved to a file, but it did appear in the command transcript. Treat the value as potentially disclosed. The response was not retained verbatim; the current bypass inventory and status therefore remain unconfirmed. No revocation or rotation was performed because that changes provider state and is outside this review. The owner should decide separately whether to revoke/rotate the potentially disclosed bypass credential before any Preview exposure.

### Observed provider state

- The linked Vercel project is **`locallift`**, in the **Jose Rubio’s projects** Hobby team, linked in the Dashboard to **`joserubiobejarano/Ornigami`**. Project settings report Next.js and build command `npm run build` (with `next build` also listed as the framework alternative).
- The current **Project Settings** Ignore Build Step selector showed **“Don’t build anything”** selected. This confirms the no-build guard is currently active at project settings scope. The Dashboard’s Production Overrides context is separately exposed; its command field was disabled and its override value was not established, so no claim is made about any deployment-specific override. Vercel documents exit 0 as immediately canceling a deployment and exit 1 as continuing the build. The prior handoff read-back recorded the selected command as `exit 0`; no setting was changed in this review.
- The Git settings page showed the connected repository above. The Environments page showed **Production branch `main`**, with `ornigami.com` as primary domain plus four additional domains, and **Preview tracking all unassigned Git branches** with no Preview custom domain. No domain or branch setting was changed. The latest Production record in the read-only deployment list was **Ready** at `e21249e971177a9c70c9a5534f4c8c6ff317cd79` on `main`. The exact candidate SHA/ref appeared as a **Canceled** deployment on `codex/ornigami-staging-readiness-20261018` (Dashboard deployment record ID `qWt13KtyMu2ephQWbQqmabGAwWxq`). It is not a running application or rollback target.
- The project’s Deployment Protection page showed **Vercel Authentication** with **Require Log In** checked and **Standard Protection** selected. Its text says visitors must be logged in to Vercel and members of the team. The project is Hobby; the Vercel Auth method is available on all plans. This is a **team-membership gate**, not a preview-specific named-account allowlist. The Project Members page directs management to team settings; no personal member inventory was retained. The owner must decide whether every current/future eligible team member is an acceptable Preview viewer.
- The Dashboard showed no configured Deployment Protection Exception domains. The page also exposes Shareable Links and Protection Bypass for Automation, both of which Vercel documents as ways to bypass normal deployment protection. Existing shareable-link state was not enumerated, and the bypass state could not be safely verified after the credential-shaped response. Therefore Standard Protection policy is observed, but effective access coverage has unresolved bypass paths until the owner completes that review. No candidate URL was requested.

### Documented behavior and capability assessment

| Topic | Evidence and finding | Status for this project |
| --- | --- | --- |
| Protection scope | Vercel’s [Deployment Protection guide](https://vercel.com/docs/deployment-protection) says Standard Protection covers deployment and Preview URLs while leaving Production domains public. The project currently selects Standard Protection, Require Log In, and Vercel Authentication. Vercel Authentication admits Vercel users who are members of the team; it does not configure a per-deployment named-account allowlist. | Immutable Preview URLs are covered by the selected policy in principle. The exact effective policy remains conditional on team membership, shareable links, bypass credentials, and exceptions. Current configured exception list appeared empty; bypass inventory is unresolved. |
| Build-hook metadata | The [System Environment Variables reference](https://vercel.com/docs/environment-variables/system-environment-variables) lists `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, and `VERCEL_GIT_COMMIT_SHA` as system variables available at build time. The [Ignored Build Step documentation](https://vercel.com/docs/project-configuration/project-settings) says the command can access build-time system variables; Vercel’s [Ignored Build Step guide](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel) gives environment/ref examples. System-variable auto-exposure must be enabled. | The proposed env/ref/SHA predicate is supported by documented variable names, subject to verifying that auto-exposure is enabled and these values are populated for the selected redeploy hook. The current auto-exposure setting and actual hook values were not read. |
| Exact-SHA trigger | The [Git deployment guide](https://vercel.com/docs/git) documents Dashboard **Create Deployment → Targeted Deployment** using an exact commit SHA. However, [Project Settings](https://vercel.com/docs/project-configuration/project-settings) says if that SHA has already been deployed, Vercel returns the last matching deployment instead of creating a new one. This candidate already has a Canceled deployment record at that exact SHA. | Targeted-SHA creation is documented but is not a reliable fresh-attempt trigger for this SHA; it may return the existing Canceled record. Do not use it to promise a retry. |
| Exact redeploy and Ignore Build Step | Vercel’s [redeploy CLI guide](https://vercel.com/docs/cli/redeploy) supports rebuilding an existing deployment by deployment ID or URL. Project Settings documents that dashboard Redeploy can skip the Ignore Build Step only by unchecking **Use project’s Ignore Build Step**. | The supported exact-source proposal is Dashboard Redeploy of candidate deployment ID `qWt13KtyMu2ephQWbQqmabGAwWxq`, with **Use project’s Ignore Build Step left checked**. Unchecking it bypasses the guard and is excluded. Redeploy was not triggered; exact behavior on this Canceled record remains untested. |
| Guard scope and predicate | Vercel’s Ignore Build Step setting is project configuration, not a branch-scoped setting. Its hook runs when a deployment enters `BUILDING`; exit 0 cancels and exit 1 continues normally. Proposed predicate: `if [ "${VERCEL_ENV-}" = "preview" ] && [ "${VERCEL_GIT_COMMIT_REF-}" = "codex/ornigami-staging-readiness-20261018" ] && [ "${VERCEL_GIT_COMMIT_SHA-}" = "62e03a3b3233d9b5e15aa7dfe778901c7952d431" ]; then exit 1; else exit 0; fi`. | The project-wide mutation would admit only this tuple if all variables are present and trustworthy; every other branch and Production event would be canceled during the exception window. This can block unrelated/urgent builds, including Production. The prior helper script checks only Preview/ref and is not suitable. |
| Attempts and concurrency | The predicate has no counter or one-shot state. Vercel documents canceled runs count against deployment quota and concurrent build slots; no official one-shot or deduplication guarantee for repeated manual redeploys was found. A duplicate for the same SHA also satisfies the predicate. | One-attempt cap is procedural, not technically enforced. Strict single-attempt/concurrency control is unsupported by the verified evidence. A strict one-attempt requirement is a stop unless a supported serialized/one-shot control is established read-only. |
| Guard restoration after admission | Documentation says the hook is evaluated at `BUILDING` and exit 1 lets that build continue normally. It does not explicitly state whether changing the project setting after admission can alter an already-running build. | Restoration impact on an admitted build is unresolved. Do not claim that immediate restoration is non-interfering until Vercel documents or otherwise read-only establishes that behavior. Meanwhile restoration cannot be treated as a way to stop an admitted build. |
| Candidate containment by deletion | Vercel [Managing Deployments](https://vercel.com/docs/deployments/managing-deployments) and [`vercel remove`](https://vercel.com/docs/cli/remove) document deletion/removal by deployment ID or URL; deletion prevents instant rollback and may break integration links. The [`DEPLOYMENT_NOT_FOUND` reference](https://vercel.com/docs/errors/deployment_not_found) lists deletion as one reason a deployment is not found. | Exact candidate deletion is a documented provider operation, but this review did not delete it or request its URL. The docs do not expressly guarantee immediate invalidation of all immutable-URL content/cache paths; exact URL cessation remains unverified. Deleting/restoring the guard cannot be called a proven containment/rollback result without this confirmation. |

### Supported proposal and precise blockers

The only documented no-push retry path identified is to **redeploy the existing Canceled candidate deployment by its immutable deployment ID**, while keeping Vercel’s **Use project’s Ignore Build Step** option checked. This is coupled: once the hook returns 1, Vercel continues that build and creates/proceeds with its Preview deployment. Both the project-setting change and this exact redeploy/deployment require separate explicit owner approval before triggering. The proposed project-wide predicate is the exact env/ref/SHA command in the table; while installed, it cancels every other build event, including `main`. The current `Don’t build anything` setting must be restored as soon as the candidate hook result is confirmed, with an immediate read-back, but whether that restore changes an already admitted build is not documented and remains a prerequisite.

This is **not presently a strict one-attempt execution plan**: repeated or concurrent redeploys for the same tuple all pass the predicate, and Vercel’s documented create-by-SHA path may return this already-Canceled deployment instead of starting a new one. No one-shot mechanism was established. If the owner requires a technically enforced one attempt, no supported path is established and the guard must remain active. If the owner accepts a procedural one-attempt risk, they must explicitly accept duplicate/concurrency risk and project-wide cancellation of every non-candidate event before considering the two separate approvals.

For containment, the only exact documented provider operation found is deleting the exact candidate deployment and keeping Standard Protection active; guard restoration prevents subsequent qualifying build events but does not stop an already admitted build. Official documentation indicates a deleted deployment is no longer found, but the exact immutable URL was not checked. Therefore **first-Preview containment is not fully verified**. Before any candidate creation, obtain authoritative confirmation that deletion revokes the immutable URL and establish an approved, post-delete URL check (which will be a future application request); otherwise do not create the candidate. Application rollback remains **unavailable**, the existing rollback/readiness hold remains open, and containment is not rollback.

### Owner decisions after this review

1. Decide whether to revoke/rotate the potentially disclosed automation-bypass credential. No secret value is included here; no rotation was performed.
2. Decide whether Vercel team membership is an acceptable access policy for the Preview or whether to hold Preview work until a separately reviewed account-restriction method is approved. Do not treat a shareable link or bypass secret as equivalent protection.
3. Decide whether the project-wide predicate’s procedural attempt limit, duplicate/concurrency risk, and temporary cancellation of all non-candidate events are acceptable. If strict one-attempt enforcement is required, leave the guard active pending a supported one-shot/serialized control.
4. Keep the existing rollback/readiness hold unless a separate owner-reviewed disposition authorizes a first trial with containment only. Before that trial, obtain the deletion/immutable-URL guarantee and authorize the exact post-delete URL check.
5. Only after these decisions and all existing readiness holds are dispositioned, separately approve the exact predicate-setting change and the one redeploy of the canceled deployment ID. This review itself authorizes neither action.

**Official documentation used.** [Deployment Protection](https://vercel.com/docs/deployment-protection); [methods to bypass Deployment Protection](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection); [Project Settings / Ignore Build Step](https://vercel.com/docs/project-configuration/project-settings); [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables); [Deploying Git Repositories with Vercel](https://vercel.com/docs/git); [redeploy CLI](https://vercel.com/docs/cli/redeploy); [Managing Deployments](https://vercel.com/docs/deployments/managing-deployments); [vercel remove](https://vercel.com/docs/cli/remove); [DEPLOYMENT_NOT_FOUND](https://vercel.com/docs/errors/deployment_not_found). These are documentation claims current at review time, not a substitute for runtime acceptance.

No provider state changed. The current `Don’t build anything` guard, `locallift` repository association, Production branch/domains, and all previous holds remain unchanged. No environment-variable values, database access, application URLs, login provisioning, build, push, or deployment were used. The sole credential-related exception was the accidentally returned protection-bypass value described above; it was not copied into the handoff or another local evidence file, and no further credential data was inspected.

## Vercel capability review independent review — 19 October 2026

**Reviewed state and limits.** Reviewed `6d637b71b9769f1a8a92babbd00b10df5241b017` on the required branch against `3f9fafb60d549ad26fd20c3fce28f82b9f9fd5f5`. The initial worktree was clean; the complete diff adds only the 47-line capability review. Committed diff whitespace checks passed. Official Vercel documentation independently supports the core Standard Protection, ignore-build exit-code/system-variable and redeploy-option descriptions. The review correctly leaves actual hook metadata, concurrency enforcement, restoration behavior, URL cessation and application rollback unverified. Dashboard observations remain implementer-reported; this reviewer did not repeat them or open the credential-bearing transcript. The capability assessment is useful, but the secret-bearing response breached the requested no-credential-output boundary and requires incident follow-up before the work can be treated as safely closed.

**R7K.1 [P1] — Prioritize containment of the potentially disclosed project-wide bypass credential.** The incident is appropriately disclosed without reproducing its value, but treating revocation/rotation as an optional staging-exposure decision understates its potential scope. Vercel's [Protection Bypass for Automation documentation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) states available secrets can bypass protection on all deployments in a project until revoked, and that regenerating/deleting one affects existing deployments/consumers of its build-time environment value. The no-build guard does not revoke an existing bypass credential or protect already deployed resources from its use. Current credential status, affected protected URLs, consumers and any misuse remain unverified; do not infer absence of impact from the canceled staging candidate or the absence of a separate evidence file. Acceptance: prioritize a narrow owner-approved invalidation plan for only the affected `locallift` automation-bypass credential, with exact target identification by safe non-secret metadata, existing-consumer/Production impact, and whether revocation alone is sufficient. Do not generate a replacement unless separately necessary and authorized. If the credential cannot be identified safely without exposing values or broadening the action, stop for an exact owner decision. Keep any independent credential-status/misuse/session questions explicitly unresolved; do not claim containment merely because a value is not repeated here. No provider mutation is authorized by this review.

**R7K.2 [P2] — Establish safe protection-metadata handling before further provider reads.** Do not rerun `vercel project protection locallift --json` into the transcript, reopen secret-bearing diagnostics, or capture the protection response in screenshots/raw logs to identify the target. A metadata endpoint can return credentials, including secrets encoded in object keys. Acceptance: prepare a supported handling method that captures raw responses and error streams privately, emits only a fixed allowlist of proven non-secret metadata/statuses, and never emits arbitrary keys, values, URLs, headers or raw errors. Document unavailable evidence honestly rather than retrieving the secret again. Before any further provider read under a new task, validate the handling method locally with synthetic secret-bearing success/error responses (including secret-shaped object keys); no hosted credential or provider call is needed for that validation. Retain only the sanitized method/result record. This is a bounded prerequisite to incident containment, not approval for a new capability campaign or deployment.

**Next scope and owner boundary.** Prepare the safe, exact credential-containment procedure first, retain these notes and the incident record, and request explicit owner authorization only for the identified provider mutation after its impact and verification method are reviewable. Keep the remote no-build guard and all prior holds active. No build, redeploy, login, database, domain, unrelated credential or provider action is authorized. Do not request or record the exposed value. This reviewer modified only this handoff and did not retrieve credentials or mutate provider state.

## Automation-bypass credential containment preparation — 19 October 2026

**Correction / scope marker.** This section responds to R7K.1 and R7K.2. The two independent review notes above are preserved unchanged. No provider, application, deployment, database, or repository credential was accessed during this follow-up. No value from the earlier response was reopened, copied, or used. The incident remains *potential disclosure; current validity, use, and misuse unknown*. This preparation is not revocation approval.

### Established evidence and limits

- Official Vercel documentation says multiple Protection Bypass for Automation secrets may exist per project; each can bypass Deployment Protection across all project deployments until revoked. A generated secret may be assigned to `VERCEL_AUTOMATION_BYPASS_SECRET`; Vercel says revoking/deleting or regenerating it invalidates previous deployments' copied value. Replacing it for ongoing use requires a redeploy. The system variable is documented as available at build and runtime. These statements mean a protected Production deployment or its automation consumer can be affected if it relies on the particular credential; they do not establish that Production is protected or that any current consumer uses it. The candidate build guard does not revoke an existing token.
- Vercel documents that bypass tokens can avoid Vercel Authentication, Password Protection, Trusted IP checks, and certain firewall/bot checks for protected requests. The impact is access to protected deployments and protected request paths; revocation does not delete deployments, modify application data, or itself change build/Production configuration.
- The Vercel CLI installed locally is version 58.9.1 (Node.js 24.11.1). `vercel project protection --help` documents that disabling automation bypass requires `--protection-bypass-secret`. Local CLI source (`dist/commands-bulk.js`, around lines 58214–58255) constructs a targeted revoke request with `regenerate: false` and the supplied secret. Thus the CLI mutation requires the credential value as an argument. Do not use that path: argument/history/process inspection could expose the value again. This source inspection is local and makes no provider request.
- Existing sanitized incident notes do not retain a safe per-secret identifier, creation note, or other locator. The previous response's secret-key value was deliberately not recorded. No current inventory, label, consumer list, selected system-variable secret, or misuse status was checked in this follow-up. Therefore the affected row is **not yet safely and uniquely targetable from retained evidence**.

Official references: [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) (multiple secrets, optional notes, project-wide deployment scope, revocation/regeneration effects, and system-variable behavior); [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables). The local CLI help and source establish only the installed CLI's argument and request behavior, not a guarantee about future provider UI/API behavior.

### Proposed narrow containment procedure — not authorized or executed

1. **Identify only from non-secret metadata.** A separately authorized operator opens the `locallift` project's Deployment Protection settings and the Protection Bypass for Automation list. Do not reveal, copy, export, screenshot, or compare any secret value. Match the affected entry using a pre-existing non-secret note or other safe row metadata that uniquely ties it to the incident, corroborated by an independent owner-maintained record. Vercel documents optional purpose notes but does not document a stable per-secret ID in the material reviewed here. Do not infer identity from position/order, the active system-variable designation, or a count alone. If the entry has no unique non-secret locator, stop before mutation; the missing prerequisite is an owner-supplied, independently corroborated safe locator or a separately approved broader credential incident action. Do not revoke all entries as a substitute for exact targeting.
2. **Obtain exact owner authorization.** The approving project/team owner must review the identified non-secret row metadata, the unknown consumer/Production impact, the verification limits, and approve one action: revoke/delete only that existing `locallift` automation-bypass entry, without regenerating it, creating a replacement, changing the system-variable selection, or disabling the feature project-wide. This task grants no such authority.
3. **Execute through the Dashboard only, if the safe locator exists and the owner approves.** In the project Deployment Protection settings, use the row-level revoke/delete control for that one matched entry. Do not use the CLI because its targeted revoke requires the secret in argv; do not use regenerate, “replace environment variable,” project-wide disable, or a bulk action. If the UI does not present an unambiguous row-level action or requires disclosure of the value, stop and return for a separately reviewed safe mechanism.
4. **Verify and retain sanitized evidence.** Re-read the same row metadata and confirm the identified entry is absent/revoked; confirm remaining automation-bypass entries remain present and unchanged to the extent the UI exposes that safely. The helper described below can retain only project identity and aggregate counts from a future read. Record timestamp, operator, project name/ID, status, before/after aggregate counts, and an owner-approved non-secret target label only if that label is already known safe. Do not retain raw JSON, screenshots, arbitrary notes, property names, values, URLs, headers, or error text. If the UI/read fails, the target remains ambiguous, counts do not change as expected, or unrelated entries change, stop; do not retry a mutation blindly. Obtain owner review and use the provider's audit/event record through a separately approved, safely redacted method.
5. **Treat access verification conservatively.** A sanitized row removal/aggregate count change supports that the provider setting changed, but it does not prove the old credential is rejected at every deployment. Do not send the credential in a test request. A future owner-authorized verification may use an anonymous request to an already approved protected URL to confirm the protection challenge remains, without credentials; that verifies the default protection path, not complete invalidation or absence of prior use. No application request was made here.

**Revocation versus replacement.** Revoking the identified credential is the proposed containment action and is sufficient to invalidate that credential according to Vercel's documentation. A replacement is not presumed necessary and is excluded from this proposal. If an owner later establishes that a legitimate consumer must retain bypass access, replacement generation, consumer delivery, and any redeployment are separate changes requiring their own scope, impact review, safe secret handling, and explicit owner authorization. Existing deployments that captured the revoked value are documented as invalidated for that value; consumers using it may lose access to protected deployments, potentially including Production-related automation. Other independent bypass entries and deployment availability are not intentionally changed by a row-level revocation.

### Safe metadata capture prepared and locally validated

Added [`scripts/vercel/protection-metadata-sanitizer.mjs`](../../scripts/vercel/protection-metadata-sanitizer.mjs). It is a fixed-command wrapper for a future, separately authorized read of `vercel project protection locallift --json`. It runs from the system temporary directory (so it does not load this repository's `.vercel` link or dotenv files), captures both child output streams in memory, excludes `VERCEL_AUTOMATION_BYPASS_SECRET` from the child environment, accepts no secret argument, writes no raw capture, and emits only these fixed fields: status, validated `prj_…` project ID, fixed project name `locallift`, total bypass-entry count, automation-bypass-entry count, and (for CLI failure) numeric exit status. It never emits arbitrary object keys, entry values, notes, URLs, headers, or raw errors. Parse/schema/launch failures collapse to fixed status strings. The wrapper's counts describe inventory only and **cannot identify the affected entry**. It has not been run against Vercel and is not authorization for a provider read.

Synthetic local validation imported the pure sanitizer function and exercised four cases: success containing a secret-shaped property key and secret-like nested values; CLI/provider error; malformed JSON; and unrecognized schema. Assertions confirmed only allowlisted output and that neither the synthetic key nor value appeared in emitted JSON. Result: `synthetic_validation_pass`, 4 cases, no sentinel emitted; process exit 0. `node --check scripts/vercel/protection-metadata-sanitizer.mjs` exited 0. No hosted request was made. The source schema facts used are the already retained sanitized field names plus the local CLI implementation's `scope === "automation-bypass"` selection; future schema drift fails closed. The optional note is intentionally not output because user-authored metadata cannot be assumed non-secret.

**Outstanding prerequisites / decisions.** Before any mutation, the owner must (a) supply or approve a safe, independent locator that uniquely matches the incident entry without revealing a value; (b) authorize only its row-level revocation after accepting that current consumers and any Production-related impact are unknown; and (c) name an operator and confirm Dashboard row-level revoke is available without revealing the value. If (a) cannot be met, exact targeting remains unavailable and the procedure stops. Separately unresolved: whether the credential is still active, whether it has been used, whether any consumer relies on it, whether a different entry is selected for the system variable, and whether any protected Production resource was exposed. This work changes none of the prior readiness holds or the remote no-build guard.
