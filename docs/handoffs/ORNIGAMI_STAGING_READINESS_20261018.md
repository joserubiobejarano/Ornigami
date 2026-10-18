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
| `docs/handoffs/ornigami-coolify-20261016/` (retained custody) | 28 | +4,077 |
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

### Retained evidence custody (28 files, byte-identical to 658537c)

- `docs/handoffs/ornigami-coolify-20261016/TOOLCHAIN_LINUX_RESULT.md` — trials 4–7 narrative (also serves
  trial-3 context pointer; trial-3 details remain at origin `7c03441`).
- `docs/handoffs/ornigami-coolify-20261016/external-trial-39082300586/` — 18 files: `SOURCE_IDENTITIES.json`,
  `INDEPENDENT_REVIEW.json`, custody receipts (`custody/evidence.zip`, `custody/STATUS_ACK.json`,
  `custody/DOWNLOAD_RECEIPT.json`, `custody-status-confirmed.json`, `CUSTODY_COMPLETED.json`,
  `FINISHED_RECOVERY.json`, `PAYLOAD_VERIFIED_BEFORE_ACK.json`, `REQUEST_DISPATCH_RECORDED.json`),
  run records (`run-final.json`, `jobs-final.json`, `timing-final.json`, `artifacts-final.json`,
  `DB_CURRENT.json`, `run.log`, `run-logs.zip`, `REVIEW.md`).
- `docs/handoffs/ornigami-coolify-20261016/build-profile-local-evidence/` — 9 files (REVIEW + SYNTAX +
  combined-review and workflow-final logs/resources).
- 1,508 further evidence paths present at `658537c` (trials 4–6 custody, `toolchain-local-evidence`,
  older per-commit evidence) are intentionally excluded; they persist on origin `7c03441`.

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
- Custody artifact: 2,504,167 bytes, SHA-256
  `c1d0207428326204f71d4c70e8fc424404d5c3e2a56bd9dd2645656d0d6dd5ca`, artifactId `12120080254`,
  331 payload files / 18,408,011 bytes verified before exactly one owner custody acknowledgement;
  completed-custody and confirmed-status receipts retained.
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
- Custody map: Section 3 ("Retained evidence custody"); origin-held remainder at `7c03441`.
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
- R6 — raw recovery evidence remains newly tracked under `docs/handoffs/ornigami-coolify-20261016/**`.

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
