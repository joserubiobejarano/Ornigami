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

**Verified Dashboard facts (read-only, 2026-10-19).** Using the authenticated Neon Console, I navigated to the owner-confirmed **Local Lift** project in the account’s personal projects context. The project is on the Free plan in AWS Europe Central 1 (Frankfurt). Its branch list showed only `production`, marked Default, with no parent; there is no staging branch. The branch list showed one branch total. Project settings showed a 6-hour history window and compute defaults of 0.25–2 CU with scale-to-zero after five minutes. The current production compute was suspended at inspection. The Console did not expose this project’s PostgreSQL major version in the project settings/compute views inspected; no SQL or connection details were opened.

I opened (but did not submit) the New Branch dialog. It offered **Branch schema only — Beta** and stated “no data will be included”; the dialog also showed production as the selected schema source and displayed 1.07 GB remaining space. The auto-delete control offered Never, 1 hour, 1 day, 7 days, and Custom (up to 30 days). I selected schema-only/custom options only to inspect them, then canceled the dialog. No branch or project was created or modified.

**Current official capability and limits.** Neon’s [schema-only branch guide](https://neon.com/docs/guides/branching-schema-only) marks this feature Beta and supports Console/API creation (CLI support is future work). The chosen parent supplies schema only; the resulting branch is an independent root with no parent or shared history. Reset-from-parent is unavailable, and Neon documents that restoring a schema-only branch copies both schema and data from the restore source. The guide gives Free-plan limits of 3 roots/project and 1 GB per schema-only branch; its documented Console expiry choices are shorter than the Custom (up to 30 days) option currently visible in this project’s dialog. Recheck expiry at any separately approved creation because the live UI and guide differ.

The [Neon plan page, updated 2026-10-13](https://neon.com/docs/introduction/plans) gives Free limits of 10 branches/project, 100 CU-hours/project/month, up to 2 CU, 1 GB Postgres storage/project and a 6-hour history window. The live project view showed one branch/root, so the published root allowance leaves two root slots and the branch allowance leaves nine total branch slots before another branch is created. The schema-only dialog’s 1.07 GB display is not used to raise the published 1 GB project/branch cap. The production branch list showed 13.37 CU-hours, but no accounting interval or remaining monthly balance was shown; do not infer available compute from that number. The project’s monthly usage and exact remaining storage must be rechecked immediately before any creation. Neon’s official [Postgres 17 announcement](https://neon.com/blog/postgres-17) confirms PG17 availability; its [current changelog](https://neon.com/blog/category/changelog) says newly created projects now default to PG18. A schema-only branch cannot select a different project major version. Local migration/fixture execution is verified only on PostgreSQL 17.9.

**Conditional creation request for independent approval — not submitted.**

- **Name:** `ornigami-staging-synthetic` (verify uniqueness again at approval time).
- **Project/region/plan:** Local Lift, Frankfurt, existing Free plan.
- **Mode and source:** Console **Schema only (Beta)**, with `production` selected solely as the schema source. Neon says no rows are copied. Expected result is a new independent root with no parent/shared history; the production branch itself is not changed.
- **Expiry:** Custom auto-delete at **2026-10-31 23:59 Europe/Madrid**, matching the staging cutoff and within the currently displayed 30-day maximum. Abort if the live picker cannot represent this exact time.
- **Resource/cost ceiling:** remain on Free; no plan upgrade, paid add-on or paid overage. One additional root/branch only. Before creation, verify current project usage. For the staging compute, request 0.25 CU fixed with five-minute scale-to-zero; cap staging use at **10 CU-hours** and added Postgres storage at **100 MiB** as operator-monitored limits. These are proposal limits, not provider-enforced per-branch budgets; stop and seek review before exceeding either. The published Free project ceilings (100 CU-hours/month, 1 GB project storage, 3 roots, 10 branches) remain the hard outer bounds.
- **Preservation check:** record sanitized pre-create project/branch counts, production default/root identity, region, plan, compute and expiry metadata. After any separately approved creation, read back the exact project and new branch identity, confirm the new root has no parent and the original production branch remains default and unchanged; stop on any discrepancy. Do not restore from production.

**Migration-state gate.** A schema-only branch is data-free, **not an empty database**: its schema is inherited from production. The local migration guidance says to apply each available migration once in numeric order, but the repository has no generic applied-migration ledger; the local PostgreSQL 17.9 harness applied the 39 available migrations to an empty database. Therefore do not replay those migrations over inherited objects and do not label the new branch “empty.” Before any SQL in a separately authorized block, first verify the target project/branch/database identity and PostgreSQL major, then make a private, read-only catalog/schema comparison against the expected result of the canonical migration chain. Record only a sanitized comparison result. Proceed with the synthetic fixture only if the inherited schema is demonstrably compatible with the canonical chain and the expected version is supported. If the target is PG17, a matching schema may be recorded as a verified schema-equivalent baseline through migration 042; that is not evidence the migrations ran on Neon. If the schema differs, the major version is incompatible, or the comparison cannot establish the baseline, stop before writes. Do not “fix” this by applying migrations on top.

**Staged verification, recovery and cleanup.** After separate approvals, verify the new branch’s exact identity/root status, selected project version, and data-free creation result using metadata and bounded aggregate/catalog checks; never inspect production rows. Establish the schema baseline before SQL. For this Local Lift schema-only proposal, if catalog comparison proves equivalence to the canonical 042 result, apply only the synthetic fixture; do **not** replay the migration chain. If the schema is not equivalent, stop before writes. For the alternative dedicated empty PostgreSQL 17 project, verify that it has no application objects or rows, then apply the 39 migrations in numeric order and the fixture. In either path, check expected synthetic-only rows and relationships, and confirm no usable login, integration credentials, queued delivery or active schedules. Keep Vercel binding and synthetic login provisioning as later scopes. Preserve sanitized receipts and rebuild from the reviewed schema-only creation path plus canonical repository artifacts if recovery is needed; do not use restore/reset from production, which can reintroduce source data. At explicitly authorized cleanup, verify the recorded project ID, branch ID and exact name before removing only this staging root; read back that it is absent and production remains. Never delete or reset production.

**Recommendation and remaining decisions.** The Console exposes a supported no-row creation mode and the current Free project has published root/branch headroom, so a conditional schema-only root is technically feasible for isolation from production rows. It is **not ready for creation or SQL**: the Local Lift PostgreSQL major version and current monthly resource balances are unverified, and inherited schema equivalence to the canonical 042 result is unknown. The smallest next block is an independently reviewed, read-only preflight of those three items and the exact expiry/usage controls. If Local Lift is not PostgreSQL 17 or its inherited schema cannot be safely baselined, the concrete alternative is a separately approved dedicated empty Neon project explicitly set to PostgreSQL 17; that would avoid inherited schema and allow the full migration chain, but changes project/account mapping and resource ownership and is not selected here. Owner approval is still required for the Beta schema-only mode, source-schema inheritance, stated resource caps/expiry, and any later SQL, Vercel binding, synthetic login, or cleanup. No SQL, creation, binding, login or recovery test was performed in this block. NO-GO and every coverage, adoption, campaign, provider and deployment hold remain active.
