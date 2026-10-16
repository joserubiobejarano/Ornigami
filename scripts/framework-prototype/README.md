# Isolated Next SRI experiment

Current local capture-remediation branch: qualified runtime snapshot copies,
persistent pre-upload summary, explicit completeness failure and local regressions
are prepared without a build or external run. [Stage inventory/scanning](./STAGE_SCANNING.md)
is runnable against future approved archives, not integrated or executed on Linux.
Historical trial 38976049055 passed Linux functional checks and failed both scan
gates; its original artifact omissions and supplemental summary recovery remain
unchanged. Custody is independent. The older checkpoint descriptions below do not
authorize publication or adoption of this new branch.

Authorized for local experimentation only. Primary/backup/security ownership and any maintenance SLA are **unaccepted**. This isolated candidate consumes the checksum-pinned `.2` package. The request marker still references the historical failed candidate; no push or new trial is authorized. See `docs/handoffs/ornigami-coolify-20261016/PORTABLE_REPAIR_PREPARATION.md` for the current repair scope and unresolved image advisories.

The complete patch includes the production runtime build configuration. Its emitted CommonJS requests normalize host separators before bundling, and a committed readable overlay must match the actual configuration. The recipe pins its initial bytes and refuses a mid-build edit. VM regressions exercise both Windows and POSIX paths, and an additional AST audit checks all four cold-installed production bundles. This does not establish Linux runtime portability.

Official npm 11.21.1 is vendored as a complete checksum-pinned build tool, without dependency overrides; use its `bin/npm-cli.js` with verified Node 22.23.3 for cold installs. Metadata and the all-54 finding review are under `deploy/coolify/`. The unchanged original base still fails the high-advisory gate, and final-image scanning is untested.

Inputs: official Next source `2864b1772c37242a9b40ab4d366eb7d368c2a070`, official package SHA-256 `44ad2c420d30f7d1a8e4c511759c57eb40ccbbc36213a1bf32b1698bcebd3a1d`, official pnpm lock SHA-256 `69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6`, Node 22.23.3 Windows x64, pnpm 10.33.0 and Python 3.14.6. Public registry provenance is in the app handoff. `next-16.4.2-sri.patch` is the complete reviewed source delta; `overlay/` is the editable browser-plugin source used to generate that delta, not a startup patch.

Use a disposable clone with `core.longpaths=true`, `core.autocrlf=true` (the observed Windows environment), and sparse paths `packages`, `scripts`, `contributing`, `patches`. Initialize the index/check out successfully **before** applying the patch. A failed initial Windows checkout previously left an incomplete index; the first prototype's patch identity was incomplete and that artifact is superseded. Verify `git diff HEAD` against the complete patch; never derive provenance from only unstaged changes. Apply the patch with `git apply --index` so new source files participate in that identity.

Install only the frozen upstream dependencies for `next...`, using the verified pnpm tool and a dedicated store:

```text
node <verified-pnpm-10.33.0>/bin/pnpm.cjs install --frozen-lockfile --ignore-scripts --filter next... --store-dir <isolated-store>
```

Run every install/build/test through `bounded-local.ps1` with an explicit JSON spec (`executable`, `args` array, `cwd`, optional `env`). The Node launcher starts gated until Windows Job Object assignment succeeds. Descendants inherit the memory/CPU limit; closing the supervisor kills the job. Initial install used 8 GiB; subsequent work uses **6 GiB committed process-tree memory / three CPU equivalents / 4096 MiB Node heap / 20 minutes**, stop below 3 GiB system memory or above 20 GiB observed system disk growth. Admission requires limit plus 3 GiB free memory and 40 GiB free disk. No limit increase/retry loop or paid fallback. Windows does not expose Linux cgroup OOM counters; do not report zero Linux OOM events from these results.

```powershell
./scripts/framework-prototype/bounded-local.ps1 -Spec <spec.json> -Node <verified-node-22.23.3.exe> -Output <new-receipt-directory> -MemoryGiB 6
```

`build-package.mjs UPSTREAM OFFICIAL_TARBALL NEW_WORK OUTPUT_TARBALL` verifies upstream/official package/lock/full patch identities, seeds **unchanged** files from the verified official package, rebuilds source server/build outputs and all four production App Router renderer variants serially, then produces a deterministic tarball. It retains maps/licenses/official types and adds explicit experiment provenance. It also carries four small tracked Next-vendored RSC production-emitter changes into the package before production bundling. No ignored installation is edited. This is an incremental source distribution, **not** a clean rebuild of every upstream dependency, vendored React, declaration or dev bundle. Native binaries remain official dependencies. Development/Turbopack acceptance and complete upstream type/lint suites are outside this prototype's proven coverage.

Upstream watch mode and full bootstrap/native building were deliberately not started: they would launch work outside the bounded serial production experiment. Tests are owned by this app outside the upstream tree; the upstream test-generator convention is not used for these app fixtures.

Build twice with new generated work/output directories, clearing generated source `dist` each time, and compare archive plus per-file hashes. Dependencies are frozen/reused; there is no remote compiler cache. Same-environment byte reproducibility is distinct from independent-machine or Linux reproducibility. Review Windows line-ending and source-map path dependence before claiming cross-platform equality.

Copy `tests/fixtures/framework-sri` into disposable local work and add a private package manifest with exact React/React DOM 19.2.9 and `next: file:../packages/next-16.4.2-ornigami-sri.2.tgz`. Freeze the fixture lock against the exact tarball integrity, then cold `npm ci --ignore-scripts` and `next build --webpack`. The fixture uses fictional data only, no env files, database, provider credentials or Sentry token. `browser-regressions.mjs FIXTURE UPSTREAM OUTPUT` uses the frozen upstream Playwright dependency and an installed browser in a new context. All page requests outside the loopback origin are blocked. HTTP/script/digest/CSP checks, late loading, actual browser tamper rejection, manifest negatives and a separate local process restart preserve diagnostics before cleanup. A local cache marker is not container-volume or real application-cache acceptance.

The full Ornigami cold build/security checker must also pass against a separately frozen prototype application lock; the small framework fixture alone does not qualify the application or Linux image. Preserve historical failures and all new failed attempts. No source map deletion, assertion skip, advisory suppression, publication, provider call or VPS operation is part of these commands.
