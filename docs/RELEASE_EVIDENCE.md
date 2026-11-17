# Release evidence and open gates

Evidence is scoped to the commit, target, action and time actually observed. A local test, manual monitor dispatch, provider configuration probe or prior deployment does not prove a different target or natural workflow. This concise ledger replaces repeated task handoffs; detailed Git-tracked proofs remain in history and the verified recovery bundle. Availability of untracked local receipts is qualified below.

## Campaign Lab local-approval integration — 17 November 2026

A dedicated integration worktree started at `fbc43f6897b747f6213a6e37907c6fa8d9e9a43e` and merged `428083cb8e2d889d77927819c0529b0032de742a` (`fix: clarify local preview approval and destination states`). The merge was clean and produced `a53b37ac0871ec37cff534f518307973fc653d16`, tree `b1060fd5684635363af7e875feccda31efb46cda`, with parents `fbc43f6` and `428083c`. Before any CI was started, `git merge-base --is-ancestor` proved both `18b6f2fac2c0aa098c42bf1358d017c985afbb5c` and `428083c` are ancestors of that integration commit. A test-only follow-up, `ce1b99835fecab87eb926d2c39d98a8080f5fd36`, aligned the existing acceptance runners with current preview gates; it changed no product code. This documentation commit is the final source tip checked by the exact-SHA receipts.

### Source and artifact identity after clean install

The clean install was `npm ci --no-audit --no-fund` on Windows x64 with Node `v24.11.1` and npm `11.6.2`.

| Item | Value |
| --- | --- |
| Integration merge | `a53b37ac0871ec37cff534f518307973fc653d16` |
| Integration tree | `b1060fd5684635363af7e875feccda31efb46cda` |
| Test-harness follow-up | `ce1b99835fecab87eb926d2c39d98a8080f5fd36` |
| `package-lock.json` SHA-256 | `63c735ef9283fc20518cdc261cff793369c99c8f860f2feae7c40306d8beca02` |
| `package-lock.json` Git blob | `adf6efff9b051fb927a3971a74e996525e77fbcc` |
| Custom Next.js source tarball | `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`, 44,840,348 bytes |
| Source tarball SHA-256 | `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28` |
| Installed `node_modules/next` version | `16.4.5` (8,715 files) |
| Installed `node_modules/next` aggregate SHA-256 | `28ed4a42361f7e79ea8ececb331440f315379d73769457d1195264d0952006f7` |

`npm ls next --json` resolved the installed `next` to the local source tarball; `@sentry/nextjs` and `next-auth` deduplicated to `16.4.5`.

### Local browser and acceptance runs on the combined development build

These runs used the combined worktree's `next dev` server on `http://localhost:3100`, Windows x64, Node `v24.11.1`, Chromium `158.0.8127.18`. They are local workflow evidence, not deployed or publication approval.

| Run | Result | Key evidence |
| --- | --- | --- |
| `campaign-lab-local-approval-check.mjs` | **30 passed, 0 failed** at 375 and 1440 px | Generated revision `4b1c3fae06bc1444`; edited and approved revision `e96297b272818742`; approval recorded that exact revision; an edit cleared approval while keeping the old revision visible; Amazon/search revision `1f5e6c0adf8e9af3` kept both the provisional footer and the local-preview approval label; 0 console errors. |
| `campaign-lab-acceptance.mjs --require-approved` | **144 passed, 0 failed, 0 pending** | Both approved fixtures at 375 and 1440 px. The qualified offer edit `20% off, 27–30 November 2026, 1 December 2026` rendered exactly at revision `428d373af4`; the renamed control approved that revision; the edit invalidated approval. |
| `campaign-lab-advertorial-capture.mjs` | **200 passed, 0 failed** | Both advertorial layouts at 320, 375, 768, 1024 and 1440 px, including wrong-packshot rejection, edit invalidation and exact-revision local approval. A local Momisa pilot package was staged only under Git-ignored `.local/` to exercise the offer-only path. |

The local-approval flow also covered the unconfirmed direct URL (`Direct URL · unconfirmed`), the Amazon search/placeholder URL after confirmation (`Amazon/search placeholder · provisional`), an invalid URL, and a confirmed direct URL. The test-only follow-up kept the acceptance edit inside the safe dated-discount subset, waited for lazy advertorial images before approving, and matched the current advertorial-gap copy. Product preview, destination classification and approval behavior were unchanged.

Machine-readable results and screenshots remain under Git-ignored `.local/integration-receipts/` in the integration worktree.

### Exact-SHA CI receipts

Quality, Security and the temporary Linux/Node 22 production receipt workflow were started only after the ancestry and identity checks above. Their run links are returned with this integration record; the branch tip containing this section is the exact source those runs checked. Because adding the links here would create a different documentation-only SHA, no receipt URL is embedded in this file.

### Canary stop carried forward

The fail-closed procedure recorded below remains the tested procedure for this candidate. No accepted serving deployment or verified rollback artifact exists. If a first canary starts and any gate fails: stop promotion and new intake; remove only the canary route or set its weight to zero; return traffic only to an owner-accepted target or keep the candidate stopped and private; preserve the exact source SHA, artifact hashes, failed logs and edge state; rebuild or re-review before recovery. Do not send traffic to either unverified 16.4.5 artifact or the vulnerable 16.4.2 artifact.

### Custom Next.js patch ownership

**Unassigned.** No one has accepted ownership of rebases for `next-16.4.5-sri.patch` or retesting/publishing the app-owned artifact. `scripts/framework-prototype/build-package.mjs` still records `maintenanceOwners:'unassigned'`; this integration did not assign a name.

### Deployment boundary

Deployment, traffic changes, DNS, provider actions and production-data changes remain out of scope. This integration establishes source, local browser and exact-SHA CI evidence only.

## Integrated release audit — 17 November 2026

A dedicated integration branch, `codex/ornigami-release-integration-20261117`, was created at `18b6f2f` and merged Session 1's final commit `b839cb1` (`Default offer headlines to product name unless safe`). The merge was clean and produced combined commit `f5b5c6d517aa02148967e1dec16fd05b477a439a`, tree `ad1c0ce6ea9c8f1e98943c5789eadd5aac4c8804`, with parents `18b6f2f` and `b839cb1`. Deployment, traffic changes, provider actions and production data changes remain out of scope. GitHub records no deployment for the combined commit or for the temporary receipts commit.

### Source and artifact identity

| Item | Value |
| --- | --- |
| Combined source SHA | `f5b5c6d517aa02148967e1dec16fd05b477a439a` |
| Combined tree | `ad1c0ce6ea9c8f1e98943c5789eadd5aac4c8804` |
| Merge parents | `18b6f2fac2c0aa098c42bf1358d017c985afbb5c`; `b839cb1c1393808fcc95cccc0dd124a82483747a` |
| Custom Next.js source tarball | `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`, 44,840,348 bytes |
| Source tarball SHA-256 | `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28` |
| Prior compiled-dist tarball | `vendor/framework/next-16.4.5-ornigami-sri.1.tgz` |
| Compiled-dist SHA-256 | `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1` |

The compiled-dist tarball is retained only as a rehearsal artifact. It is not a verified rollback: the combined-build rehearsal again fails the production SRI gate on the `global-error`, `error` and `page` App Router chunks with `missing-integrity`. The 16.4.2 artifact remains inside the November advisory range and is not an acceptable fallback.

### Linux/Node 22 CI receipts

The exact combined SHA passed the repository's normal push CI and a separate temporary Linux receipt workflow. The receipt workflow is kept on `codex/ornigami-release-integration-receipts-20261117`; it is not part of the release branch.

| Workflow | Run | Source binding | Result |
| --- | --- | --- | --- |
| Quality checks | [43986197875](https://github.com/joserubiobejarano/Ornigami/actions/runs/43986197875), attempt 1 | Push on `f5b5c6d` | Success |
| Security checks | [43986197913](https://github.com/joserubiobejarano/Ornigami/actions/runs/43986197913), attempt 1 | Push on `f5b5c6d` | Success |
| SRI Linux receipts | [43986251374](https://github.com/joserubiobejarano/Ornigami/actions/runs/43986251374), attempt 1 | `workflow_dispatch` with `source_ref=f5b5c6d`; checked-out source recorded as `f5b5c6d` | Success |

The SRI Linux run's `headSha` is the workflow-only commit `2979305`; the checked-out source is the `source_ref` value and is recorded in the receipt artifact's `source-sha.txt`. The receipt artifact was downloaded to Git-ignored `.local/ci-receipts/sri-linux-43986251374/` and records Ubuntu 24.04 x86_64, Node `v22.23.3` and npm `10.9.9`.

Results on `f5b5c6d`:

- Dependency audits: full audit **0** findings and production audit **0** findings; both exit `0`. The repository audit policy also reports zero full/production findings, and `npm audit fix --dry-run` exits `0`.
- Quality: lint **0 errors**, 26 existing warnings; type generation passed; TypeScript `tsc --noEmit` exited `0`.
- Tests: **1,050 total, 1,036 passed, 0 failed, 14 skipped**; security unit tests **7/7 passed**.
- Clean production build: **24/24** static pages generated with the 16.4.5 source candidate; 2 static CSP script hashes generated.
- SRI: **31** same-origin scripts checked across `/` and `/login`, all with valid integrity, 0 issues; CSP nonce rotation distinct.
- CSP and smoke: production smoke passed static CSP hash parity, nonce-bound hydration/rotation, protected dashboard, Open Graph image and anonymous auth/Google/billing boundaries. A19 runtime CSP smoke passed 8 rendered routes plus a 404 nonce/CSP check, anonymous dashboard redirect and report-only Trusted Types headers.
- Home and login: both returned `200` with a CSP nonce present.
- Campaign Lab production gates: `/campaign-lab` and `/campaign-lab/offer` returned `404`; `POST /api/campaign-lab/generate` returned `404` with `{"ok":false,"message":"Campaign Lab is unavailable."}`.
- SRI fixture: **9/9** checks passed, including late-chunk integrity, tampered bootstrap and asynchronous chunk rejection, missing/malformed manifest fail-closed behavior, and restart retention. Chromium `157.0.8103.50`.
- Rollback rehearsal: the compiled-dist artifact failed the same SRI gate on three App Router chunks; `rollbackVerified=false`.

### Local browser intake on the combined build

The development-only intake was exercised from the combined worktree's dev server, not the Linux production build. Environment: Windows x64, Node `v24.11.1`, Chromium `158.0.8127.18`, viewport 1440 × 1000. This is a local workflow check; it does not establish a deployed intake, Linux browser acceptance or publication approval.

The intake used the synthetic Harbor Field bottle packshot (`7428586f0fcbd847f741ebfd1415c4ecd38ff0754c831edf6b5fc94a3a609ab2`), a direct `https://harborfield.example/...` destination, owned synthetic rights, and two approved facts (Material: Stainless steel; Capacity: 750 ml).

| Step | Observed result |
| --- | --- |
| Qualified offer `20% off, members only` | Headline `Harbor Field travel bottle`; exact offer next to CTA; revision `0959bbe7735734f2`; status `confirmed`; images ready |
| Edit to `20% off orders over $50` without regenerating | Last rendered revision and exact offer stayed visible; `dirty=true` |
| Generate the revision | Revision `23a228018c9a02f9`; headline stays the product name; exact `20% off orders over $50` next to CTA; status `preview` because the edited offer no longer matches the confirmed intake terms |
| Console errors | **0** |

Screenshots and the machine-readable result are in Git-ignored `.local/offer-intake-integration-20261117/` (`intake-qualified-offer.png`, `preview-qualified-offer.png`, `preview-pending-revision.png`, `preview-revised-offer.png`, `result.json`, SHA-256 `40d5e6be55eee6d91464b91ce5a6a3e34efc6ab613696444da04d7cf642388bc`). The production gates above confirm this development surface is not reachable in production.

### First-canary stop when there is no accepted deployment to return to

No accepted deployment of this combined candidate is established, and the only compiled-dist 16.4.5 artifact fails the same SRI gate. The historical Vercel production record was not re-checked or accepted as a rollback target in this audit. This procedure replaces the earlier "return traffic to the last accepted deployment" step for this candidate: that step presumes an accepted deployment, which does not exist here. If a first canary starts and any gate fails, use this fail-closed procedure; it is manual and must be rehearsed before any separately authorized rollout:

1. **Stop promotion and new intake.** Do not approve, generate or publish further campaign pages; keep schedulers, paid integrations and destructive jobs disabled. Do not change DNS, data or provider configuration to compensate.
2. **Take the candidate out of traffic.** Remove or disable only the canary route, or set its weight to zero. If the edge has an owner-approved static maintenance response, serve that; otherwise leave the candidate unreachable. Do not send traffic to either unverified 16.4.5 artifact or the vulnerable 16.4.2 artifact.
3. **Return traffic only to an accepted target.** If a known, owner-accepted serving deployment exists, leave it unchanged and return traffic to it. If no accepted deployment exists, keep the candidate stopped and private; **no public serving candidate is the required end state**, not a substitute application build.
4. **Preserve the failed receipt.** Keep the exact source SHA, tarball hash, failed check logs, browser/console logs, timestamps, edge state and any candidate image/artifact digest. Do not retry, delete the failed artifact or roll back the database to create a cleaner record.
5. **Recover only after review.** Rebuild from the last accepted commit/artifact, or from a newly reviewed fixed candidate, and re-run the full quality, audit, build, SRI/CSP, smoke and Campaign Lab gates. If no accepted commit/artifact exists, remain stopped until one is accepted.

### Custom Next.js patch ownership

**Unassigned.** No named maintainer currently owns rebases of `next-16.4.5-sri.patch` or retesting/publishing the app-owned artifact. `scripts/framework-prototype/build-package.mjs` still records `maintenanceOwners:'unassigned'`, and this integration did not assign a name. A named owner must accept those duties before the next Next.js maintenance rebase.

### Release recommendation

**GO for a first controlled canary from `f5b5c6d`, with deployment separately authorized and out of scope here.** The combined source passes quality, both dependency audits, the clean Linux/Node 22 production build, SRI and CSP checks, home/login smokes, Campaign Lab production gates, the SRI fixture and the local qualified-offer/revision intake. **Broad rollout remains NO-GO** until a named Next.js patch owner accepts maintenance and a tested rollback path or accepted serving target exists. Because no verified rollback artifact passes the same SRI gates, use the fail-closed stop procedure above rather than artifact rollback.

## Next.js 16.4.5 release audit — 17 November 2026

The release branch `codex/ornigami-next-sri-release-20261117` starts at `6f188c2` and carries the durable fixture-test correction from `697e322`. The temporary Linux receipt workflow is kept on the separate evidence branch `codex/ornigami-next-sri-audit-receipts-20261117`; it is not part of the release branch. Deployment remains out of scope.

The source-built candidate remains `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz` (SHA-256 `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`). The audits below were reproduced on Ubuntu 24.04 x86_64 with Node `v22.23.3` and npm `10.9.9`, matching the target Linux/Node 22 platform.

### Baseline dependency findings

Baseline `8868c12`: full audit **14** findings (1 critical, 1 high, 12 moderate); production audit **8** findings (1 critical, 1 high, 6 moderate). Package findings aggregate eight distinct advisories:

| Audit finding | Advisory ID(s) | Dependency path | Installed | Fixed | Scope |
| --- | --- | --- | --- | --- | --- |
| `@sentry/nextjs` (critical) | GHSA-mchm-gjx6-7h55 | direct dependency | `10.69.0` | `10.78.0` | full + production |
| `@sentry/bundler-plugin-core` (moderate) | GHSA-3g3m-2fjr-6pw4; GHSA-g3hv-75wg-m249 | `@sentry/nextjs` → `@sentry/bundler-plugin-core` | `5.3.0` | removed by `@sentry/nextjs` `10.78.0` | full + production |
| `@sentry/bundler-plugins` (moderate) | GHSA-3g3m-2fjr-6pw4; GHSA-g3hv-75wg-m249 | `@sentry/nextjs` → `@sentry/webpack-plugin` → `@sentry/bundler-plugins` | `10.69.0` | `10.78.0` | full + production |
| `@sentry/webpack-plugin` (moderate) | GHSA-3g3m-2fjr-6pw4; GHSA-g3hv-75wg-m249 | `@sentry/nextjs` → `@sentry/webpack-plugin` | `5.4.0` | `5.4.1` | full + production |
| `@typescript-eslint/eslint-plugin` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/eslint-plugin` | `8.71.2` | `8.73.0` | full |
| `@typescript-eslint/parser` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/parser` | `8.71.2` | `8.73.0` | full |
| `@typescript-eslint/type-utils` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/type-utils` | `8.71.2` | `8.73.0` | full |
| `@typescript-eslint/typescript-estree` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/typescript-estree` | `8.71.2` | `8.73.0` | full |
| `@typescript-eslint/utils` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/utils` | `8.71.2` | `8.73.0` | full |
| `fast-uri` (moderate) | GHSA-w74x-v6f9-j3xg; GHSA-xhq7-xmqj-769h; GHSA-wjr9-j795-jxcr; GHSA-333x-w4r6-6crp | `@sentry/nextjs` → `@sentry/webpack-plugin` → `webpack` → `schema-utils` → `ajv`/`ajv-formats` → `fast-uri` | `3.1.8` | `3.1.9` | full + production |
| `glob` (moderate) | GHSA-3g3m-2fjr-6pw4; GHSA-g3hv-75wg-m249 | `@sentry/nextjs` → `@sentry/bundler-plugin-core` → `glob`; `@sentry/nextjs` → `@sentry/webpack-plugin` → `@sentry/bundler-plugins` → `glob` | `13.0.6` | `14.0.6` | full + production |
| `minimatch` (moderate) | GHSA-g3hv-75wg-m249 | `@sentry/nextjs` → `@sentry/bundler-plugin-core` → `glob` → `minimatch`; `eslint-config-next` → `typescript-eslint` → `@typescript-eslint/typescript-estree` → `minimatch` | `10.2.6` | `11.0.9` | full + production |
| `typescript-eslint` (moderate) | GHSA-g3hv-75wg-m249 | `eslint-config-next` → `typescript-eslint` | `8.71.2` | `8.73.0` | full |
| `zod` (high) | GHSA-mrhx-c7xc-m3w5 | direct dependency (also deduplicated through `openai` and the ESLint plugin) | `4.1.12` | `4.6.7` | full + production |

### Remediation and final audit

The remediation uses targeted compatible upgrades and existing override machinery; `scripts/security-audit.mjs` and its policy remain unchanged:

- `@sentry/nextjs` `^10.69.0` → `^10.78.0`
- `zod` `^4.1.12` → `^4.6.7`
- `eslint-config-next` `16.4.1` → `16.4.5`, resolving `typescript-eslint` `8.73.0`
- `fast-uri` override `^3.1.7` → `^3.1.9`
- `glob` override `^14.0.6`, which resolves `minimatch` `11.0.9` for the remaining glob paths

On code commit `7daa47c`, both the full and production Linux audits report **zero** findings and exit `0`. The same result was repeated by the repository's `Security checks` workflow.

### Verification and release decision

On the same Linux/Node 22 target, the following passed on `7daa47c`:

- Quality checks: lint with 0 errors (26 existing warnings), type generation, TypeScript, and the full test suite (1,027 pass, 0 fail, 14 skipped).
- Production build: 24 static pages generated with the 16.4.5 SRI source candidate.
- SRI production check: 31 same-origin scripts checked across `/` and `/login`, all with valid integrity; CSP nonce rotation distinct.
- Production smoke and A19 CSP runtime smoke, including static CSP hash parity, nonce hydration/rotation, protected dashboard, and Trusted Types headers.
- Security unit tests: 7 passed.
- Campaign Lab production gates: `/campaign-lab` and `/campaign-lab/offer` return `404`; `POST /api/campaign-lab/generate` returns `404` with `{"ok":false,"message":"Campaign Lab is unavailable."}`.
- SRI fixture: all 9 checks passed, including late-chunk integrity, tampered bootstrap/chunk rejection, missing/malformed manifest fail-closed behavior, and restart retention.

**Rollback:** there is still no verified rollback artifact. The prior compiled-dist `vendor/framework/next-16.4.5-ornigami-sri.1.tgz` (SHA-256 `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1`) builds but fails the production SRI gate on three App Router chunks (`global-error`, `error`, and `page`). The 16.4.2 artifact is inside the November advisory range and is not an acceptable security fallback.

**First-rollout stop procedure:** do not switch traffic or promote the candidate if any pre-cutover gate fails. If a first canary/rollout has started, stop new intake and promotion, keep the last accepted serving deployment unchanged, and return traffic to it; do not substitute either unverified 16.4.5 compiled-dist artifact or the vulnerable 16.4.2 artifact. Preserve the failed receipt, browser logs, and exact source/artifact hashes for review. Rebuild only from the last accepted commit/artifact after the failure is understood.

**Custom Next.js patch ownership:** explicitly **unassigned**. No named maintainer currently owns rebases of `next-16.4.5-sri.patch` or retesting/publishing the app-owned artifact. Assign a named owner before the next Next.js maintenance rebase.

**Release recommendation:** **GO for a first controlled rollout from this commit, with deployment still separately authorized and out of scope here.** The audit, build, SRI/CSP, fixture, and Campaign Lab gates are clean on the target platform. Because no verified rollback artifact passes the same SRI gates, use the documented stop/hold procedure rather than artifact rollback for the first rollout, and treat broad rollout as conditional on a named patch owner and a tested rollback path.

## Expanded audit adaptation — 18 October 2026

The supplied reusable library was indexed without modifying it: 341 regular files, 243 Markdown files, 4,003 source checklist controls, 93 CSV worksheets and 4,058 worksheet rows. Its two supplied license texts are preserved byte for byte. The [audit entry point](../Audits/README.md) and [158-family register](../Audits/scenarios.csv) adapt the source to actual Ornigami product/data/host boundaries, existing A02–A24 evidence and the private-staging/customer-launch split. Missing standalone performance/SEO and external design-library coverage are explicit project supplements, not completed audits. Source inventory is comprehensive for the snapshot; semantic selection is curated, not a claim that every source control was individually assessed.

The parent defined all scenario content, applicability and gate decisions; Luna implemented the catalog generator and exact CSV. Parent review corrected module/chapter routing, source-output protection, CSV positional/explicit-empty data preservation and reference interpretation. Independent validation compared all 341 source hashes, all 4,058 CSV rows with a separate parser, both license copies, every case value against the parent specification, all candidate test/source references, and all gate/status counts. Synthetic generator checks verified quoted/multiline/escaped cells, duplicate headers, extra cells, empty records, source symlink exclusion and direct/aliased source-output rejection. Focused script lint and syntax passed. Private verification receipts remain in `.local/recovery`.

All 158 project families remain **Not verified**, with no result receipts or new application pass claims. Existing tests are candidates to inspect and reuse for exact proved facts; no complete application re-audit, Linux campaign, actual-host probe, external provider action or additional dispatch occurred. The roadmap/delivery plan schedule 81 G1 local, 10 G2 Linux and 42 G3 private-host families within the existing October windows; 16 G4 customer, eight G5 deferred-activation and one G6 operating family remain at their appropriate gates. The 31 October cutoff, coverage/adoption hold, 7/7 dispatches and 39/300 charged minutes are unchanged. Audit artifacts are excluded from Docker/Vercel deployment inputs.

## VPS campaign alignment — 18 October 2026

The owner made VPS delivery the immediate top priority. The local delivery plan, checkpoint, supervisor briefing and campaign ledger under `C:\Users\joser\Desktop\VPS\projects` were reconciled with the consolidated source and Booster-first launch scope. The milestone is accepted private fictional staging on the existing shared Contabo/Coolify VPS by **31 October 2026, 23:59 Europe/Madrid**. Public/customer launch is separate; November remains planning context without a committed enrollment date. If the cutoff is missed, the portfolio records an all-three-app Vercel transition rather than another automatic extension.

Those campaign records report full-app run `39069347358` / source `f6e26a1` passing functional/native/browser/SRI/restart/cache checks and seven app/base scan roles, but failing the then-used tooling scans. Tooling-only run `39082300586` / source `65ccca1` subsequently passed both replacement-tool scans at zero HIGH/CRITICAL, native compatibility and cleanup. These records were read for plan alignment, not re-executed or independently re-admitted in this session. They are distinct source/run receipts: no complete accepted combined approved-origin app image, independently retained accepted image or Ornigami actual-host deployment is established. Advisory coverage and operational adoption remain unresolved; the old admission-only failure below is historical rather than the current campaign checkpoint.

Campaign usage remains 7/7 dispatches, 39/300 charged minutes and zero reserved; neither date nor document changes grant another dispatch. Continuation now points to the canonical checkout, with former publisher `658537c` and experiments recoverable from the private consolidation archives. Current main includes product/mail changes that must be reconciled with any recovered candidate. Planning origin `https://staging.ornigami.com` and BasicAuth do not authorize DNS, secrets, routing, SQL, publication or deployment. Existing host health/capacity observations do not prove app-specific access, company terms or recovery acceptance. No external trial, deployment, provider send, Goal resumption or production/data change occurred during this plan update.

## October 18, 2026 — workspace and branch consolidation

The sole checkout is `C:\Users\joser\Desktop\Projects\Ornigami`, on `main`. Both external preparation/mail folders and all 14 secondary worktrees are removed. Seventy-five local branches are retired: 59 already integrated, five superseded A01/A11 proposals whose behavior is represented by current main, and 11 experimental preparation branches. Three Luna agents audited branches, files and documents, then cross-reviewed the preservation and corrections. The verified, self-contained private `history.bundle` records all 99 original refs and all 14 distinct worktree HEAD commits, including detached experiments; original refs, paths and dispositions remain indexed beside it. Retired refs must be recovered from that bundle, rather than assumed to survive Git maintenance.

The inactive Docker/Compose, gated cron adapter and SRI/runtime acceptance utilities were selectively retained from preparation head `c1df758`; experimental dependency upgrades, framework packages/patch workflows and trial-request automation were not adopted. The mail inventory is consolidated into Operations, deployment instructions into the existing VPS guide, and current mail/deployment gates reconciled across the roadmap and technical reference. Recovery retains 1,439 byte-verified local evidence files, the original Next package seed and two final custom package artifacts in `evidence.zip`; the exact upstream working patch, origin and commit are also preserved. Reproducible tool/dependency caches and superseded generated packages were discarded, with 27,857 excluded-file hashes/sizes recorded. The manifests, archive seals and cleanup receipt live under Git-ignored, owner-restricted `.local/recovery/workspace-consolidation-20261018`.

Validation: 42 focused mail, cron, runtime-receipt, SRI and VPS checks passed; Bash/Node syntax and Git whitespace checks passed. Lint has zero errors and four existing navigation warnings. This is local consolidation, not Linux image/runtime acceptance. GitHub branches and remote main remain unchanged because publishing main may trigger existing hosting; no deployment or provider action occurred.

## Coolify preparation — 16–17 October 2026

The selected launch target is Contabo US East with Coolify, but access, provisioning, and deployment remain pending. Earlier Linux experiments failed: one compilation exhausted the shared host's memory; framework trial `38964204005` completed compilation/type checks but failed Linux page collection, and its Trixie base scan reported 0 critical/54 high findings. Later preparation still recorded 43 unresolved historical highs; no accepted final image security/runtime cycle resulted. Source-built framework packages and alternative bases remain experiments, not adopted dependencies.

The 17 October admission-only trial, request `97fc2b86f2efe55683242e8b20a38a79fdebfb1e` on candidate `2ae7f60ce8edd1880b24924a0e213f34abd97ed1`, stopped before compilation: shared DB admission returned `NextUpdate-expired`; dependent Linux fixtures were skipped. The observed peak was 2,014,834,688 bytes under the admitted limits; this proves neither compiler headroom nor image/runtime viability. This request performed no application build/image scan, deployment, provider/scheduler action, or production schema change. The authorization is consumed; another external trial needs separate authorization. QR and staging were preserved. Original preparation history and private captures are retained in `.local/recovery/workspace-consolidation-20261018/history.bundle` and `evidence.zip`.

## October 16, 2026 — project and document consolidation

The checkout is directly in `C:\Users\joser\Desktop\Projects\Ornigami`. Ten completed task worktrees and the former nested `Ornigami-Agents` directory are removed after independent evidence verification. All branch refs and local-only history are preserved, including older unmerged proposals. Twenty-nine billing artifacts and 33 integration-log source mappings (26 unique log files) are indexed under private `.local/recovery/sessions`; existing recovery archives and four performance snapshots remain intact. The private `INDEX.md` and `consolidation-manifest-2026-10-16.json` map original paths to byte-verified destinations. Disposable worktree dependencies/caches, empty artifacts and exact duplicate log copies are removed. Active local configuration moves with the checkout; external operator credentials and rights records stay in place. No cloud resource or production data is changed.

Six privacy operator documents are merged into [one handbook](./PRIVACY.md), reducing `docs/` from 13 guides/templates to eight. The unsigned customer-facing addendum remains separate. Public provider observations retain their October 13 dates; consolidation does not claim a fresh account, terms or DNS verification.

Latest accepted executable source `6fe7a99f692e09e997c5368d0f063a69acdc4817` passed exact-source Quality [38427593047](https://github.com/joserubiobejarano/Ornigami/actions/runs/38427593047) and Security [38427592900](https://github.com/joserubiobejarano/Ornigami/actions/runs/38427592900), including 636/636 tests, zero skips/failures, release build and production smoke. This cleanup changes documentation and removes one obsolete local-tool path permission; it does not establish deployment or new provider acceptance. Post-move local verification passed 636/636 tests with zero skips/failures, lint with zero errors/four existing warnings, and 58 relative document paths/anchors. An independent metadata audit verified all 82 Git refs, 62 evidence mappings, eight original recovery artifacts, four local configuration files and the owner-only recovery ACL. The private cleanup receipt records these checks; temporary test databases/caches were removed after the suite stopped.

## October 13, 2026 — VPS, privacy controls and browser improvements

Reviewed branch tips based on `3022643`: VPS preparation `b881d37`, privacy evidence/free-launch controls `f0377b7`, browser performance `174ee5e`. Three bounded Luna reviews, primary review and independent follow-up loops validated the combined source. The current guides retain the lasting decisions below; dated transfer/closure/free-launch handoffs, unsent inquiry drafts and `docs/tasks` are removed. Original documents/receipts remain recoverable from those commits. The retained browser receipts were copied with working-file byte hashes verified to `.local/recovery/WAVE3_browser-performance-evidence.json` and `.local/recovery/WAVE3_browser-performance-edge-evidence.json`. No agent email, provider mutation, purchase, deployment or shared database change was performed in this integration review.

- **VPS reference:** reviewed systemd/Caddy/UTC timers, loopback authenticated dispatch, structural preflight and hash/catalog readiness checks are retained in [deploy/vps](../deploy/vps/README.md). The unused application StateDirectory/CacheDirectory grants were removed; only its reviewed Next cache path is writable. Cron locking keeps its separate state path. Runtime examples explicitly disable AI and guarded/destructive features. Actual Contabo US East/Coolify access is still pending for the intended November 2026 hosting plan; these units are not tested Coolify configuration, Linux host validation or a deployed/restore receipt. Reconcile actual host/order/budget, company agreement, control-plane/ingress/scheduler adaptation and rollback before provisioning/cutover.
- **AI and monitoring integration:** source requires exact `OPENAI_ENABLED=true` before paid model calls. Default-off reply/audit/batch requests report unavailable, scheduled Replies stops before a lease and drafts before reservation; Booster returns local static copy. Existing key configuration alone cannot opt in. Keep AI disabled under the owner's free-tier/no-billable-AI instruction. Root review found that the old all-job monitor would otherwise falsely alarm on the deliberately disabled Replies cadence. Newly allocated **042_cron_expected_jobs.sql** filters only never-run/missed-cadence expectations through the explicit core-job set plus optionally Replies; genuine failed, actionable partial and stale-running operations remain monitored. The all-three zero-argument SQL wrapper remains compatible. Required/core, duplicate, unknown and NULL validation, disabled-cadence resolution without synthetic run receipts, actual failure/stale-lease retention and reapplication are tested in disposable PostgreSQL. The release manifest/readiness map and isolated fixture now include 039–042, without changing 039–041 bytes. Keep the Replies timer disabled while AI is off; schema precedes its matching application consumer.
- **Browser comparison:** application candidate `0b1bf09`, tree `4907c3678588fc612a17618769ab057ff14783b5`, build `QJ7GIE-jPbO_V9NiMlmmz`, inventory SHA-256 `f4eef7ab2d105cce7fb43cdb0bdba78947d14a2d69d64c7269085b5771144678`. Forty local emulated samples passed integrity checks with stable source/build and unchanged synthetic owner/outsider data, no route/provider errors, and 50 draft controls per inbox sample. Settings maximum lab CLS changed from 0.1317 to 0 in both modes; connection reads dropped from two to one. Inbox median useful-content readiness changed from 4.258 to 3.919 s cold and 2.455 to 2.096 s warm, with parallel settings/location reads followed by scoped reviews. Six read-only edge scenarios verified delayed geometry, settings error/retry, disconnected owner/member permissions, multiple locations and clearing prior OAuth error. Synthetic intercepted responses were used for edge failures/connection variants. This is a descriptive local loopback/mocked-font/Pixel 7 comparison, not field CWV/INP, a physical-device/network guarantee or a statistically established speedup. The original 42 focused checks and repaired legacy UI harness preserve owner/member/locked-selection, request ordering, scope/unmount races, retries, pagination and unsaved drafts. Edge receipts now default to ignored `.local/recovery` so reruns do not recreate the handoff folder.
- **Privacy and owner constraints:** the dated account, agreement, inbound-routing and provider-retention evidence is consolidated in the [privacy handbook](./PRIVACY.md). Its October 13 observations do not prove migration, route delivery or erasure. Free-tier-only, AI-off and no-agent-email instructions remain in force; actual customer acceptance and target/provider evidence remain open.

The ten initial combined-suite failures were missing new hook/AI imports in older test harnesses; those harnesses now load the real connection hook/guard and explicitly model the enabled-AI paths without weakening existing assertions. Disabled/no-call behavior retains separate tests. Final integrated verification is scoped separately from the branch-level browser receipt and the pending actual deployment.

Final Windows/Node 24 combined suite passed **636/636, zero failures/skips** after the integration fixes; lint passed with four existing navigation warnings, seven security tests passed, and full/production dependency audits report zero findings. The manifest verified all four LF-normalized files through 042; disposable catalog/behavior tests verify the true readiness rows and reject a drifted unfiltered never-run branch. Exact integrated Linux/Node 22 Quality/Security, build and smoke are separate CI checks. These receipts do not certify actual VPS/Coolify installation, deployed cessation of AI use, live callbacks, routing or erasure.

## October 13, 2026 — follow-up session review and VPS direction

Reviewed follow-up branches based on `0bcdd8f`: mobile/browser `e6feef5`, privacy/onboarding `66de9f1`, remaining billing `8e992ab`. Three bounded Luna reviews, primary review and follow-up reviews retain the limits below. Application source, dependencies and migration bytes are unchanged by this wave; the changes add tools, tests and durable operator preparation. The two billing `.test.mjs` suites are now included in normal `npm test` discovery. Integration fixes two harness defects: provider update/cancel now validates the synthetic owner/customer, exactly one annual Booster item and this run's EUR 360/year catalog before mutation; annual creates use per-run idempotency keys and lost-create responses force uncertain/incomplete cleanup. Thirteen mock-only harness regressions passed, including valid ownership, stale mapping, wrong-run price, extra items and ambiguous creation. No provider operation was rerun to validate these fixes.

- **Mobile baseline:** 40/40 local Pixel 7-emulated samples and eight read-only interactions completed on application source `0bcdd8f`, tree `13ecccaf0729c46cc21be259c4b25f97462e8ea1`, build `jeohe97Yt4UXdcSo4fSgG`, inventory SHA-256 `1f42cec8a2c3af030d923b23a22292c7e96dfd9cc3e6f7e7be4856ba327dbf78`. A20/A23 synthetic owner/outsider data and source/build hashes were unchanged; there were no runtime/API errors or outbound provider attempts. Maximum navigation LCP was 1.388 s; settings CLS reached 0.1317 (one of five cold and two of five warm samples above 0.1). Cold inbox useful-content median/max was 4.258/4.499 s, warm 2.455/2.849 s; every measured inbox rendered 50 draft controls. Serial settings/location/review requests, repeated connection fetches and card/loading geometry are bounded optimization candidates, without claimed causal stack attribution. The configured 150 ms/1.6 Mbps/4x CPU emulation, mocked fonts, loopback database/server, cache modes and five-sample summaries do not establish physical-device/network latency, field p75, INP or sustained capacity. `pass` establishes measurement integrity, not performance-threshold closure. The original JSON was copied and hash-verified at `.local/recovery/MOBILE_BROWSER_BASELINE_2026-10-13.json`; original handoff/JSON also remain in branch history. Future runner output defaults to ignored `.local/recovery`, preventing recreation of the deleted handoff folder; reproduction is in [technical reference](./TECHNICAL_REFERENCE.md#isolated-browser-and-billing-acceptance-tools).
- **Annual and browser billing:** annual provider run `da120680-925d-4621-9056-bd399910e6d2` verified 14 trial days, EUR 360 paid conversion, a distinct paid annual renewal invoice and two 12-UTC-calendar-month service periods; its receipt reports cleanup complete. Local application run `d46558b2-00e7-4e8c-b6f0-a5859964a39a` completed annual no-card sandbox Checkout in the browser and reconciled genuine signed Stripe events through CLI forwarding to the production-built loopback app with disposable PostgreSQL/migrations through 041. Usage stayed 11/500 and owner/business trial histories stayed consumed after cancellation. Initial concurrent Checkout events included three retryable 500s from the busy reconciliation lease; CLI did not retry those events, while later distinct provider events converged. This is local Stripe-origin HTTP delivery and browser-trial acceptance, not deployed retry delivery or a paid browser/live charge. Cleanup receipts confirm owned synthetic subscription/customer/process/fixture cleanup and catalog deactivation. Three historical test products were briefly deactivated during a separate ownership audit and then restored/verified; their provenance remains unknown and no cleanup claim is made for them. The surviving ignored billing receipts are consolidated under `.local/recovery/sessions/Ornigami-Remaining-Billing`; the private index and hash manifest map former paths. Exact historical handoff pointers remain recoverable from `8e992ab`.
- **Privacy preparation:** the consolidated [privacy handbook](./PRIVACY.md) retains account observations, assisted rights and provider/backup checks. No qualifying routing receipt was recovered. Templates and source tests do not establish contracting-party acceptance, target activation, provider erasure or restore proof.
- **Hosting correction:** the owner confirmed production rollout readiness was not run because the application is moving from Vercel to a VPS whose setup is still in progress. The roadmap now targets VPS readiness/cutover, one primary scheduler and target-specific schema/application/provider acceptance. No VPS provisioning, database move, decommissioning, production migration or deployment occurred in this review. Earlier Vercel receipts remain historical; deployment-plan troubleshooting is superseded as the launch task.

The dated transfer handoffs and `docs/tasks` are removed after their lasting instructions/evidence were retained. The privacy operator guides are now combined in one handbook. Earlier snapshots below are superseded only within the scopes explicitly closed above.

Final combined Windows/Node 24 verification passed 592/592 tests with zero failures/skips, lint with zero errors/four existing navigation warnings, seven security tests and full/production audits with zero findings. Provider fixes used mocks only. Application/dependency/migration bytes match the previously accepted source, so the closed local build/load evidence was not rerun; exact integrated Linux/Node 22 Quality/Security and build/smoke are separate CI checks. No production/VPS operation is certified by these checks.

## October 13, 2026 — completed-session integration review

Reviewed branch tips: billing `c6ae889`, permission/retention `ae2bd7d`, performance `588aa15`, and operations `d826e00`, all based on `e21249e`. Three bounded Luna reviews and the primary integration review found no blocking implementation defect. Integration raises the isolated performance fixture's reviewed migration ceiling to 041 and updates only the locked `source-map-js` dependency from 1.2.1 to patched 1.2.2 ([advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)). The four handoffs and `docs/tasks` are removed after consolidating enduring instructions into the current guides; exact original handoffs and the branch-level A23 JSON remain recoverable from those Git commits.

- **Permission/retention:** evidence is required at manual/CSV/webhook admission and sending; intake/generation excludes phone/service content. Migrations 040–041 preserve lifecycle, quota, suppression, trial and unresolved-operation fences while adding guarded terminal minimization, holds and safe late callbacks. The assisted-rights register is local/private. Schema/application cutover, role review, guarded-cleanup activation, routing-receipt recovery and the controller/processor arrangement remain operator gates; see [operations](./OPERATIONS.md#retention-and-restoration).
- **Billing:** six synthetic monthly Stripe test-mode scenarios passed: trial start, no-method expiry cancellation, successful conversion, declined conversion, cancellation and Checkout API payload acceptance. Signed captured-event tests exercise the actual local webhook/reconciliation/PostgreSQL path, including replay, without a provider request. Migration 039 fixes duplicate lease acknowledgement. No interactive Checkout, deployed Stripe webhook delivery, annual-cycle or production/live billing acceptance is claimed. Synthetic clocks/customers were deleted and the product/price deactivated.
- **Natural health:** [scheduled run 38334925022](https://github.com/joserubiobejarano/Ornigami/actions/runs/38334925022) succeeded on baseline `e21249e` at October 13 02:01 UTC (04:01 Madrid), reporting healthy privacy/Booster/Replies and no alerts. `event=schedule` establishes a natural trigger; the configured hourly slot/delay and uninterrupted historical cadence are not established. This is monitor-source evidence, not the integrated application deployment.
- **A12 removal:** October 13 authenticated UI evidence in exact project `bitter-brook-23785103` showed only production parent `br-red-frost-alc3smfv` and exact child `br-noisy-shape-aly2lr5p` returned branch not found. The child credential was absent. This confirms provider absence at observation, without claiming an API status/deletion timestamp or performing a provider mutation.
- **Combined checks:** 574/574 tests passed with zero skips, including disposable PostgreSQL migration/admission/replay/retention races; lint passed with four existing navigation warnings; seven security tests passed; full and production dependency audits report zero findings after the lockfile patch. The combined production Webpack/TypeScript build and smoke passed, including CSP hash parity, nonce hydration/rotation, protected dashboard, Open Graph and anonymous auth/Google/billing boundaries. Windows Node 24.11.1/PostgreSQL 17.9 verification is distinct from Linux/Node 22 CI and deployment.
- **Combined-build performance:** executable integration source `7e8aab96890e8d0e7287000ee00f50bb53ba35cb`, tree `b4370313d1c9aa7a6611f8b8d7014d8ef2ead15e`, build ID `rxKJUvEjYGZ6Wor9ew-BS`, build inventory SHA-256 `87453d77b7a05f4d94350829137345d499559952df9d3bc6cbc9d847297ef20b`. Fresh numeric migrations through 041 and 120,000 synthetic reviews plus 120,000 visits (96,000 owner/24,000 outsider per table) were provisioned locally. Ten distinct sessions for one owner performed four ten-read waves across ten routes: 400 reads, all route all/warm p95 <=3 seconds, aggregate median 628.85 ms/p95 2029.37 ms/max 2271.08 ms, zero slow reads/errors/timeouts/blocked outbound attempts. Tracked source/build and full-row fixture snapshots were unchanged. HTML checks validate content markers; tenant-scope assertions apply to selected APIs. Windows loopback PostgreSQL/Neon bridge, local mocked-font Webpack build and complete-body HTTP timings do not establish remote Neon/Vercel latency, browser hydration/mobile lab/field CWV, ten distinct users or sustained-load capacity. The sanitized combined receipt is retained locally at `.local/recovery/A23_INTEGRATED_READ_LOAD_2026-10-13.json`; subsequent guide/handoff cleanup changes no executable source.

The October 4 sections below are historical snapshots. Closed October 13 checks supersede their open natural-health/A12/provider-test statements only within the scopes above. No production migration, guarded cleanup, account deletion, live charge or customer send is established by this review.

## Workspace cleanup and recovery

The separate October 4 cleanup removed 48 extra worktrees and the external Backups/Worktrees directories, retaining one canonical checkout. The 94 former Markdown guides were consolidated into six current guides. Seven SQL files used by tests/operator tools are relocated without changing their working-file bytes. No trial implementation, production data, cloud resource or active operator credential is changed.

Committed branch/detached history is preserved in `.local/recovery/repository-before-cleanup.bundle`; both dirty trees' staged/working changes and 14 untracked source files are preserved in `.local/recovery/uncommitted-work.zip`. The cleanup audit retains the source-document map, metadata inventories, preservation checks and verification outcomes.

**Recovery limitation:** a cleanup error removed the verified curated receipt ZIP before a rebuild that needed already-removed source files. The subsequent backup deletion left 21 selected untracked receipt copies and two legacy test transcripts unavailable. They cannot be reconstructed from hashes or metadata, and are not claimed as retained. Accepted summaries and Git-tracked evidence remain recoverable; historical pointers to those external local receipts no longer resolve. Provider-side records were not deleted. Do not recreate sends, faults or customer/provider operations merely to replace a missing local receipt.

Local verification passed 549 of 550 tests initially; the sole failure exposed an additional split-string reference to the relocated support SQL. After that path was fixed, the affected three-test support suite passed with zero skips. Lint passed with zero errors and four existing navigation warnings. This is combined local verification, not a claim of one clean 550-test run on the final commit; exact-main CI is separate.

Cleanup implementation source `b2430e607f55ad828011b00467695f765d360b16` subsequently passed exact-main Quality [37238167256](https://github.com/joserubiobejarano/Ornigami/actions/runs/37238167256) and Security [37238167186](https://github.com/joserubiobejarano/Ornigami/actions/runs/37238167186), including **550/550 tests, zero skips**, lint, type generation, TypeScript, release build and production smoke. The final evidence/roadmap revision changes documents only; it does not inherit an unobserved CI or production deployment claim. The earlier font-loader failure is historical, with its cause still unproved.

## Current gates and historical scope

Use the [roadmap](./ROADMAP.md) for current release gates and [product contracts](./PRODUCT_CONTRACTS.md) for trial, quota and enrollment rules. October 4 open A12, provider-test, performance and natural-health statements were superseded only within the October 13 scopes above. Earlier deployment receipts below remain historical; none establishes the planned VPS/Coolify cutover.

## Historical evidence ledger

| Evidence | Scope and result | Limit |
| --- | --- | --- |
| `53b3e5a` CI | All configured CI passed. | Prior commit only. |
| `84334c7` CI Quality `37234809466` | Failed in `next/font` loader; lint/tests/TypeScript passed. | Failure cause unproved; docs commit has no application-code change. |
| `84334c7` Security `37234809464` | Passed. | Does not override failed Quality. |
| `541d2fb26ce6fce87e0f510aeebb6ca14fb7a36c` CI | Candidate Quality `37226153920` and Security `37226153922`; main Quality `37226416885` and Security `37226416900`; all four passed. Integrated full suite **550/550**, zero failures/skips; lint, type generation, TypeScript, clean Webpack build, production smoke and dependency audits passed. | Exact source `541d2fb`; these passes do not establish CI on later `84334c7`. |
| GitHub health `37232136864` | Manual dispatch passed at 20:27 UTC on source `940bfde`; healthy, no alerts, no-work/succeeded summaries. | Manual, not natural schedule. |
| GitHub health `37221231299` | Latest checked natural scheduled result, old 17:37 UTC failure. | Fresh natural proof remains pending. |
| Vercel Booster and Replies | Natural scheduled receipts at 19:07, 20:07 and 20:11 UTC accepted. | Each receipt is bound to the deployment/source and time detailed below; not a future schedule guarantee. |
| Owner navigation and HTTP baseline | Four owner routes visibly loaded; 12 sequential authenticated page GETs returned 200. Dashboard full HTML median 1692.1 ms; Booster 681.1 ms; Settings alias 475.5 ms; Reviews alias 583.5 ms. | One operator account, no rows/representative volume, no concurrency, and no LCP/INP/CLS/Lighthouse evidence. |
| A17 integrated isolated release suite | Historical candidate `a98878e`; Node 22.23.3 and disposable PostgreSQL 17.9; full suite 465/465, security 7/7, lint/type/build/smoke passed. | Isolated and prior source; not current main CI or live provider acceptance. |
| Production source/deployment | `5fbbd1e` deployed Ready with `ornigami.com` alias; 21 public/gated boundary checks passed. | Dated deployment receipt, not deployment of current `84334c7`. |
| Production deployment/source | Production deployment `dpl_AZiy7NiLCB6Q8EyjVmfySZ15YAoM` was Ready for exact source `940bfdefffd28cda4607704d29c2489298d2f8e5`, alias `https://ornigami.com`. | Prior production source; no deployment claim for `84334c7`. |
| Natural Vercel Booster 19:07 | Request `vzz7b-1791140859154-d5b6bd9e271e` on Ready production deployment `dpl_FqVogNepfcKdBJbYN6hwXf8Egzsu`, exact source `541d2fb26ce6fce87e0f510aeebb6ca14fb7a36c`; Vercel request details identified `vercel-cron/1.0`. Persisted run ended `no_work` at 19:07:43.299 UTC and resolved the missed-schedule alert. | Natural scheduler receipt on this exact source/deployment; empty work is not throughput acceptance. |
| Natural Vercel Booster 20:07 and Replies 20:11 | Requests `f7bmx-1791144459106-9a94be5e1063` and `rv4lj-1791144670136-720216ab358d` on production deployment `dpl_58wqAo41N185hXQZVXaNV4qKuk7j`, source `6b3d3f0`; expanded details identified `vercel-cron/1.0`, main and production. Persisted runs ended `no_work`; paired read-only snapshot showed zero active alerts. | Natural scheduler receipts on this source/deployment only; empty work does not prove message throughput or real Google activity. |
| Current Sentry health alert | Manual health evaluation at 19:00 UTC correctly retained Booster's missed-schedule signal. Automatically High issue `151286760`, event `e8749479000c4e1e9bddcc1c3348178a`; current workflow `746029` recorded monitor `1611295`, same issue, one alert, and operator mail matched the event. SDK acknowledgement cleared transport failure count 1→0. | Manual health evaluation, not natural GitHub schedule. Sentry processed UI adds ingress IP/coarse geography; no anonymous-backend or full raw-event claim. |
| Application boundary Sentry journey | On the separate deployed synthetic preview, real Booster boundary fault produced issue `151273313`, event `d64a86881ec34284ad5d3848ad090551`, fixed sanitized error and automatic High priority; current workflow `746029` history and operator mail correlated the exact event/digest. | Preview application journey; no production fault/config change. Sentry API raw event remained inaccessible, so evidence is UI/mail/history scoped. |
| Public application journeys | Separate empty Neon project and public Vercel preview exercised email verification/reset/replay, concurrent CSV duplicate handling, send overlap (one accepted send/quota), actual application mail with signed callbacks, review/unsubscribe/booking links, unsubscribe suppression and frozen-owner send/intake denial/recovery. Nine authenticated request samples and seven real normalized CSP report responses were captured. | Deployed isolated acceptance; not customer data, production traffic, CWV/load, Google submission or real Stripe. Empty test project, fixture webhook and preview were removed; production objects preserved. |
| Privacy checkpoint | A read-only, identity-pinned DB observation recorded the October 4 03:00 UTC privacy run `succeeded`, 10 rows processed/deleted, 0 failures, all 11 outcome tables complete; checkpoint 03:00:49Z and `never_run` alert resolved. | Run row has no caller field; bounded deployment logs did not attribute the caller/target deployment. Resolved alert still retained one `alert_transport_failed`; notification delivery from that privacy alert remains unproved. No cleanup/health was triggered to create evidence. |
| Production Resend configuration | Permanent production webhook and signing-secret binding were verified; a one-time direct-provider configuration email to the operator matched exact sent/delivered callback payloads and HTTP 200 acknowledgements. Existing verified sender/reply-to and public origin matched. | This is provider transport/config evidence, not an application ledger/customer send. Do not register another endpoint or repeat setup for unchanged configuration. |
| Production support access | Production feedback-only reader was independently verified with `SELECT public.feedback` only; inbox query returned zero rows. The separate A12 child credential is disabled/removed. | Operator support access only; credential remains in established private store, not app deployment. Never use child credential as production. |
| A12 child | Exact child expiry is scheduled for October 5 16:00 UTC; child reader `NOLOGIN`, credential removed, production reader separately remains usable. | Not yet expired or deleted. |

Earlier A00/A17/A10/A12/A16/A19/A20 work packages contain detailed per-test commands, hashes and private artifact pointers. Their code, provider objects and test environments are not to be recreated merely to republish evidence. Use Git history or approved private receipts when a reviewer needs the full provenance; never copy secrets, owner email, password hashes, cookies, raw customer data, provider payloads or mailbox locators into this active ledger.

## Decision and evidence boundaries

Owner-approved trial, quota, rollout, permission, retention and performance decisions are recorded in [PRODUCT_CONTRACTS.md](./PRODUCT_CONTRACTS.md) and [OPERATIONS.md](./OPERATIONS.md). The former paid-only policy and A21 handoff are superseded/cancelled. Retention defaults are targets until implementation and deployment are proved; historic trial eligibility evidence has no arbitrary deletion deadline. Each separate gate remains independent: Google access, live payments, account deletion, uncertain provider recovery, lead cutover and unrelated proposed billing policies each retain their own acceptance boundary.
