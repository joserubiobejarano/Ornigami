# Framework decision packet — 16 October 2026

Follow-up: the owner approved a bounded local experiment, explicitly excluding production adoption and any maintenance SLA. [The completed local prototype](./LOCAL_FRAMEWORK_PROTOTYPE.md) records source/package identities, fresh app/browser results, reproduction and remaining Linux/adoption gates. The decision and observations below remain the historical approval basis; they do not authorize publication, external execution or release.

Decision requested: approve a bounded **local implementation** of an app-owned Next distribution, conditional on accepting its maintenance ownership. No framework patch or dependency change has been implemented. No build, external trial, publication, host mutation or provider operation was performed for this packet. Waiting for a verified upstream fix remains the alternative if ownership is declined.

## Verified baseline and live protections

Started clean at documentation HEAD `814589168b4b6365295c5a944d7b43d40cc79e45`, branch `codex/ornigami-coolify-preparation-20261016`, in the separate preparation worktree. The latest tested executable candidate remains `193a795de330a2cfef47a45571c29cbe3c0c8b69`; this documentation does not create a tested replacement. Canonical application lock SHA-256 remains `b7335ef2e1163bf36afcf48309c3eaab68ea4731909a6bc4c981b0a0ea048ed1`. Existing evidence and unrelated work are preserved.

Read the central VPS app/gap records, repository instructions, installed Next CSP/self-hosting guides, and latest app handoffs. QR Loyalty is deploying: no SSH command, build, service, shared setting or infrastructure change was made. Read-only browser inspection through the already available private tunnel confirmed Coolify 4.4.6 and the existing Ornigami project `vqkyv5dpjpjazuknkgyunioi`, fictional-staging `d9ixeysd9tajcavvibltt3is`, **zero resources**. No duplicates were created.

Publication is **blocked**. The live linked Vercel project `locallift` reports Git deployment creation **enabled**; a preparation-branch hold is **not verified**. Production branch `main` and zero deploy hooks do not establish preview-branch safety. Local `vercel.json` is insufficient. GitHub Apps include Vercel, Netlify and CodeRabbit; repository webhooks are empty and workflows were enumerated. Netlify's historical inventory is not a fresh integration check. Before any separately approved push, verify effective live Vercel/Netlify rules and all Apps/workflows again; stop on uncertainty. Coolify's empty environment currently has no app autodeploy resource. No integration setting was changed.

Sanitized observations and official metadata are retained in [framework-decision-evidence](./framework-decision-evidence/OBSERVATIONS.json); byte checksums are in [SHA256SUMS.json](./framework-decision-evidence/SHA256SUMS.json). Earlier publication receipts describe their own time, not current clearance.

## Recommendation and supported alternatives

| Option | Evidence and disposition |
| --- | --- |
| Stock Next 16.4.2 with documented webpack SRI | Official documentation still labels SRI experimental and webpack-only. The verified official package's layer and component emitters omit `integrity`, matching the earlier 16.4.1 failure. An upgrade alone is not a fix. |
| Wait for an upstream stable fix | Preserves upstream ownership. Release remains blocked until an exact official package passes the same server/browser/corruption tests. Track supported releases; do not adopt an untested canary or downgrade for a presumed fix. |
| App-owned, narrowly patched 16.4.2 distribution | Recommended route if named maintainers accept ownership. Repair server emission **and** asynchronous browser loading, rebuild actual production bundles, pin package bytes and prove regressions. Source review supports feasibility, not a passing implementation. |
| Public webpack SRI plugin alone | A client-loader integration may help implementation, but does not repair the framework's server emitters or establish compatibility with its final asset transforms. Not a complete demonstrated alternative. |

Nonce-only acceptance, removed assertions, unsafe CSP allowances and Traefik response rewriting do not satisfy the reviewed contract. A framework migration would need separate architecture approval and evidence; no supported drop-in alternative was established here.

Primary references: [official CSP/SRI guide](https://nextjs.org/docs/app/guides/content-security-policy), [support policy](https://nextjs.org/support-policy), [exact upstream source tree](https://github.com/vercel/next.js/tree/2864b1772c37242a9b40ab4d366eb7d368c2a070). The current support policy informs monitoring, not proof that any version supplies complete SRI.

## Source, checksum and packaging provenance

Read-only inspection downloaded the official `next@16.4.2` registry tarball; it was **not installed or executed**:

| Identity | Verified value |
| --- | --- |
| Source tag / commit | `v16.4.2` / `2864b1772c37242a9b40ab4d366eb7d368c2a070` |
| Git tree | `23b64a7c37fe53a8675c17dadd80f4eb35b2f853` |
| Official package | `https://registry.npmjs.org/next/-/next-16.4.2.tgz`, 43,679,232 bytes |
| Package SHA-256 | `44ad2c420d30f7d1a8e4c511759c57eb40ccbbc36213a1bf32b1698bcebd3a1d` |
| Registry SHA-512 integrity | `sha512-r+oBJojfefUjOiWkBhXgLS+igxX/7BWyK59uHnyOyplMSLtBZ+QLP3okrdYTbrfrbrmNTVWLBPaHDX9KRaIt3w==` |
| Upstream package manager | `pnpm@10.33.0` |
| Upstream lock SHA-256 | `69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6` |

SHA-512 and SHA-1 match the registry metadata. Registry ECDSA signature verification succeeded against the official npm key endpoint; a changed signed payload must fail verification. GitHub reports the source commit signature valid. These are distinct trust statements: neither proves a reproducible upstream build. The advertised Sigstore/SLSA attestation was **not independently verified**. Selected source/package file hashes and public signing keys are retained; the 43 MB tarball and downloaded third-party source stay in ignored local inspection storage.

Focused verification passed: SHA-256/SHA-512/SHA-1 package identity, two valid registry signatures and rejection of both altered signed payloads, all 13 evidence-file checksums, JSON parsing, packet-relative links and `git diff --check`. The committed application lock is unchanged. No previous evidence, workflow/request marker, runtime assertion or application code was modified; no compilation or runtime test was repeated.

The upstream [packaging helper](https://github.com/vercel/next.js/blob/2864b1772c37242a9b40ab4d366eb7d368c2a070/scripts/pack-next.ts) is **not a ready bounded recipe**: it uses an unfrozen install, builds multiple packages and invokes native building even with `--no-js-build`. It may patch a target project. Do not run it blindly. The upstream lock and [native installer](https://github.com/vercel/next.js/blob/2864b1772c37242a9b40ab4d366eb7d368c2a070/scripts/install-native.mjs) must govern a reviewed, isolated process.

Proposed reproducible packaging contract, to implement only after approval:

1. Check out the exact source commit plus a reviewed patch commit; record both and the patch SHA-256. Pin supported Node 22.23.3, pnpm 10.33.0, builder OS/architecture/base digest and every dependency integrity. Do not adopt upstream's `.node-version` v20 hint as the runtime policy. Use frozen installation and reject lock mutation.
2. Use explicit `CI=true` and `NEXT_SKIP_NATIVE_POSTINSTALL=1`; prefetch and verify the matching official 16.4.2 SWC bindings for the selected platform. Reuse unmodified native binaries; no Rust/native build is proposed. Verify package compatibility, optional dependencies and native resolution rather than silently downloading a different binary. Disable remote build caches and unpinned lifecycle/network fetches.
3. Run the upstream JavaScript release pipeline for the Next package and its required dependencies, including production renderer compilation and required types. `pnpm --filter next build` is a starting target to validate, **not a tested complete command**. Audit generated entrypoints/exports/files and workspace dependency rewrites before packaging. Retain licenses, source maps and required compiled assets. Do not patch minified strings at startup or copy only loose emitter files.
4. Produce an allowlisted app-owned tarball, proposed path `vendor/framework/next-16.4.2-ornigami-sri.1.tgz`. Preserve internal Next 16.4.2 compatibility initially; identify the modified distribution by its explicit revision, patch/source manifest and tarball digest, never as an unmodified official release. Verify SWC/version checks before choosing a different internal version. The upstream signature does **not** authenticate modified bytes. Generate our own provenance/SBOM; do not claim upstream attestation for them.
5. Pin the local tarball and its integrity in the application lockfile. Include it before `npm ci` in both Docker dependency stages and verify Docker context inclusion. A cold install without a preexisting `node_modules` must reproduce the intended package; no public npm/GHCR publication or mutable fetch is required.
6. Perform two clean package builds in identical pinned environments. Fix workspace path, locale/timezone, source epoch and deterministic archive ordering/UID/GID/mtime/compression. Compare both per-file payload hashes and tarball hashes. Investigate nondeterminism while retaining source maps; do not normalize executable differences away. Record tool versions, install inputs, compiled production hashes and build receipts. Reproducibility is currently **untested**.

The framework monorepo's peak resources are unknown. The application's accepted external cap does not prove this new build fits. Any later remote packaging experiment needs its own exact hypothesis, resource ceiling and approval; no VPS work, paid fallback, increased limits or automatic retry follows from this proposal.

## Exact repair boundary

Server emission: update `get-layer-assets.tsx` and `create-component-styles-and-scripts.tsx` to resolve validated SHA-256 entries from the admitted production SRI manifest, preserving nonce, source, ordering and crossorigin behavior. Missing/malformed entries must fail closed in an SRI production build. Bootstrap/preinit paths that already consume the manifest remain covered by regression tests.

Production selection: `dist/server/route-modules/app-page/module.compiled.js` selects precompiled `dist/compiled/next-server/app-page.runtime.prod.js` and configuration-specific variants. Rebuild and test the variant actually used by this app; cover experimental variants if shipped/enabled, or demonstrate they are outside the supported configuration. Editing loose `dist/server/app-render` files is insufficient. Retain generated-bundle hashes and prove the standalone production server loads the repaired emitter.

Browser loading: extend the webpack-generated asynchronous script loader so it sets a validated integrity value **before** appending a script, while preserving nonce/crossorigin/React preinit semantics and failing closed on missing entries. Audit App Router navigation and lazy chunks; the separate Pages Router loader is not proof of App Router coverage. Integrate hashing after final asset transforms, including Sentry. Avoid self-referential runtime hashes: use appropriate build phases and an asynchronous-chunk hash map, then reconcile the final manifest and all emitted bytes. Prove late transforms cannot invalidate hashes. This design still requires implementation review.

## Required regressions and retained diagnostics

| Gate | Required positive and negative evidence | Current state |
| --- | --- | --- |
| Fresh package/application | Cold install from tarball/lock; two package builds; fresh app build with retained maps and static-CSP parity | Untested for proposed distribution |
| Actual production HTTP | Home/login; canonical protected-route redirect; not-found, loading/error boundaries and global-error path. Every eligible external script has correct SRI and expected nonce/crossorigin; inline scripts retain CSP authorization | Existing candidate fails: 21 script-tag occurrences / 11 unique assets |
| Browser loading | Real browser hydration, navigation and a demonstrably late-loaded chunk; correct integrity set before insertion; nonce/CSP intact | Untested |
| Corruption rejection | Separately intercept one served bootstrap asset and one asynchronous chunk, alter their bytes, retain original integrity, prove browser rejection and nonexecution using observable markers. Restore serving between cases | Untested; no weakening allowed |
| Manifest failures | Remove/malform an entry in isolated fixtures; production emission/loader must fail closed. Verify a wrong digest rejects the asset | Untested |
| Other negative security | Existing status/header/cookie/host/forwarded-header/callback/cron-auth checks unchanged; no unsafe CSP relaxation | Earlier Linux HTTP block failed; replacement untested |
| Restart and cache | Independently run stop/start and container recreation against the same app-only cache volume; verify ownership, marker persistence and actual cache reuse/regeneration separately from liveness | Untested |
| Linux image/native | Fresh amd64 image; sharp/native execution; non-root/read-only/internal-port checks; complete base/final scans; peak memory, OOM counters and disk usage | No new trial authorized |

The fresh Windows candidate compiled in 73.508 seconds; its 142 source maps and static-CSP parity were recorded, with 16 focused tests passing. That is historical compilation evidence, **not runtime acceptance**. No repeat build was run for this packet. The repaired diagnostic retention harness and independent restart/cache checks remain unchanged: exact assertion, exit code, status, sanitized relevant headers/body and container logs must survive failure **before** cleanup, with evidence downloaded before runner expiry. A liveness-only result cannot satisfy these gates.

## Maintenance acceptance

Jose is the proposed accountable decision owner. A primary framework maintainer, backup maintainer and security reviewer remain **unassigned**; adoption requires their explicit acceptance. Proposed duties: weekly supported-release/advisory review plus security announcements, critical triage within 24 hours and high triage within 72 hours, review each upstream rebase against the narrow patch, regenerate provenance and run the complete regression matrix. These are proposed service expectations, not an accepted SLA.

Never bump a version label to make a scanner finding disappear. Preserve actual upstream/component identity in SBOM and advisory triage. If maintenance or timely remediation cannot be sustained, stop release and choose waiting/migration through review. Upstream issue/PR communication needs separate authorization. Retire the custom package only when an exact supported official package passes the same full matrix and its removal is reviewed.

## Image, staging and recovery gaps

The historical Linux run built an **ephemeral** image in 180 seconds, peak 7.572 GiB, zero OOM events under 8 GiB/3 CPU/4 GiB Node heap; it failed acceptance and was not retained. Both scans reported **4 critical / 71 high** findings. All original [75 rows](./external-trial-38938062184/final-high-critical.csv), raw scans and earlier failed runs remain unchanged. There is no retained accepted deployable image.

Confirmed candidate image remediations: **none**. Trixie and npm/Corepack/Yarn removal are prepared changes requiring fresh exact-base/final scans. Remaining proposed-distro findings include `perl-base` 5.40.1-6+deb13u1 (CVE-2026-9538) and util-linux-family 2.41.5-0+deb13u1 (CVE-2026-76642, CVE-2026-78408/78409/78410). zlib/minizip component presence and the 32-bit Perl issue require actual component/ABI applicability review. Available fixed versions, empty fix fields and other affected packages remain visible in [CANDIDATE_REPAIR.md](./CANDIDATE_REPAIR.md) and [SRI_FRAMEWORK_REVIEW.md](./SRI_FRAMEWORK_REVIEW.md). Newer layer contents do not establish final-image remediation; no suppression or acceptance-threshold change is proposed.

Runtime remains a proposal: 768 MiB / 0.75 CPU, approximately 512 MiB Node heap subject to native-memory measurements, non-root, internal port 3000, dedicated app cache and existing Traefik. No new service/supervisor/proxy or host port. A dedicated fictional staging Neon identity/branch and app-scoped secret inventory must be accepted and supplied through protected references. Verify Neon service-side connection bounds and HTTP-adapter concurrency; do not claim a `pg.Pool` limit controls the current `neon()` HTTP adapter. No production data or migrations are authorized.

The owner supplied **ornigami.com**. Exact staging HTTPS hostname, aliases, DNS/TLS ownership and canonical build/runtime origins remain unaccepted. Do not infer a staging hostname or DNS authorization. Once agreed, append exactly `/api/auth/callback/google`, `/api/google/oauth/callback`, `/api/stripe/webhook` and `/api/webhooks/resend` for the respective reviewed registrations; booking intake `/api/webhooks/booking` has its separate gate. `NEXT_PUBLIC_APP_URL` build/runtime and runtime `AUTH_URL` must agree; tunnel localhost and fictional rehearsal origins cannot become provider origins. No registration or routing was changed.

Coolify control-plane backups do not cover Neon, application configuration/keys or future media. Independent encrypted copies, destination/retention, key custody, actual restore timing, external alert delivery and replacement-host proof remain open. Managed Neon recovery availability/retention must be verified for the accepted account. Cache is regenerable, not a customer-media backup. Rehearse only isolated fictional exports/restores with no provider credentials; preserve lifecycle/erasure/suppression/leases and unknown-operation fences. Keep [cutover/rollback](../../../deploy/coolify/README.md) gated on a retained compatible image and verified restore point; do not erase schema/fences during app rollback.

Booster `7 * * * *`, Replies `11 */4 * * *`, privacy `0 3 * * *` remain disabled. Preserve bounded auth/timeouts/leases/no replay/single-primary behavior; never overlap Vercel and VPS primaries. Replies/provider sends/paid AI, Contabo work, GHCR, public routing and live release remain closed.

## Precise next approval

Approve **only** the app-owned framework approach and bounded local implementation/packaging/regression work, with named maintenance/security ownership. It must produce an exact patch/package/app candidate and focused evidence for review. If declined, choose waiting for an upstream fix under unchanged assertions. This packet does not request an external trial.

After implementation passes local review, propose a **separate** exact Linux amd64 trial, retaining the accepted 8 GiB/3 CPU/4 GiB Node heap ceiling, source maps, full scans, diagnostics, browser/security and independent restart/cache evidence. Any publication first needs verified live deployment holds. Trial approval, retained registry publication, fictional staging admission, DNS/provider actions and eventual release are separate decisions.
