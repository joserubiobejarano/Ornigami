# Next.js 16.4.5 source-built SRI candidate — 16 November 2026

Status: **local candidate, not production-adopted.** The source-built package
passes the clean production build, CSP checks, browser script-integrity checks,
and tampered-chunk rejection. Campaign Lab production gates are closed. The
artifact is local-only (`adopted: false`) with unassigned maintenance ownership.

- Base: `ece5ca9`
- Branch: `codex/ornigami-next-sri-source-candidate`
- Worktree: `C:/Users/joser/.local/ornigami-next-sri-source-candidate`
- Candidate code commit: branch tip at the time the SRI receipt was produced
  (see the response accompanying this handoff)

## Selected release

Source: [Next.js November 2026 security release](https://nextjs.org/blog/november-2026-security-release).

- Active LTS patched release: **16.4.5**.
- Maintenance LTS patched release: 15.5.29.
- Upstream tag commit: `4e5335a00314be7fbb2aace5e9be56a88e64e5a8`.
- Official tarball: <https://registry.npmjs.org/next/-/next-16.4.5.tgz>
- Official SHA-256:
  `a9b934c4deda237c1a269da4e68be28f39c7c5e07296a891e0a8346ce847ef97`
- Official integrity:
  `sha512-rmdfsWosjTUO+6R0S3KokoIk6Kj0sWDRTe86tZHdqaWH/oXq/udX3/4xb+YQi7aWbyEFoglDU54kaifLCdXbBw==`
- Upstream lockfile SHA-256:
  `a250cafac0fc58361229688488b9af4a751dd182ab61d1cf273c62e5e5eecd1a`

Selected November advisories: GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8,
GHSA-rhh4-g77r-r9qj, GHSA-pc58-hwjq-p385, GHSA-f3mh-rxg3-f5g2,
GHSA-7qx7-33qx-rqx2.

## Patch rebase

The reviewed 16.4.2 source patch applied cleanly to 16.4.5. Only patch index
lines and hunk offsets changed. The normalized build overlay changed one
external from `next/dist/compiled/jsonwebtoken` to
`next/dist/compiled/fast-jwt`, matching 16.4.5.

- Patch: `scripts/framework-prototype/next-16.4.5-sri.patch`
- Patch SHA-256:
  `602ed6a8b3f10843009276676a997e1a60427f3d9b266a4bb70fd612f6f94965`
- Overlay SHA-256:
  `79b8b6cd0eea384fc01c18c11f431c1f970314af196a33f90dd3fd95b38ac7a8`
- Recipe: `scripts/framework-prototype/build-package-16.4.5.mjs`
- Recipe SHA-256 (recorded in provenance):
  `26cd189a5ffa54df758615e287fd267432e4d32d0dbb87e32b924eef20f0ca79`

Patch scope: App Router script emitters, Flight manifest typing, SRI webpack
plugin, the four compiled RSC clients, `script-integrity.ts`, and the portable
webpack runtime configuration.

## Artifact provenance

Artifact: `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`

- SHA-256:
  `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`
- Integrity:
  `sha512-eX6my0Em5+3pnq7KH1ZcTjT2heQiejYpc+g7GWKBo9iZxU4wB6QTGXmxy5I0Gw3itUVnX1VcNZJEEkD8YpPNWQ==`
- Bytes: `44840348`
- Inside the archive: `ORNIGAMI_PROVENANCE.json`
- Beside it: `next-16.4.5-ornigami-sri.source.1.tgz.identity.json`
- `package-lock.json` integrity:
  `sha512-eX6my0Em5+3pnq7KH1ZcTjT2heQiejYpc+g7GWKBo9iZxU4wB6QTGXmxy5I0Gw3itUVnX1VcNZJEEkD8YpPNWQ==`

The archive was verified after packing: SHA-256 and SHA-512 match the identity
file, and the archive contains the patched plugin, helper, route-module hook,
bundled App Router enforcement, and RSC `moduleLoading.integrity` support.

Reproduce with a fresh work directory:

```powershell
node scripts/framework-prototype/build-package-16.4.5.mjs `
  .local/next-source-16.4.5 `
  .local/next-16.4.5.tgz `
  .local/build-work-1 `
  vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz
```

Seed requirements: upstream `v16.4.5` clone with the source patch applied and
pnpm 10.33.0 dependencies installed from the frozen lockfile, plus the official
tarball with the published SHA-256.

## Manifest path trace

The integrity manifest reaches every script-emission path:

1. **Build → manifest.** `SubresourceIntegrityPlugin` hashes every emitted
   asset at `PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE`, tracks the post-rehash
   bytes, and at `afterProcessAssets` emits
   `server/subresource-integrity-manifest.js` and `.json`.
   Packaged lines: `dist/build/webpack/plugins/subresource-integrity-plugin.js:146-148`.
2. **Server → render options.** `RouteModule.loadComponents` parses
   `self.__SUBRESOURCE_INTEGRITY_MANIFEST` into
   `subresourceIntegrityManifest` (`route-module.js:141`) and returns it with
   the build manifests. Server output:
   `.next/server/subresource-integrity-manifest.json`.
3. **App Router initial/bootstrap scripts.** `app-render.tsx` passes the
   manifest into `create-component-styles-and-scripts.tsx`,
   `get-layer-assets.tsx`, and `required-scripts.tsx`. The packaged emitter calls
   `scriptIntegrity(renderOpts.subresourceIntegrityManifest, href)` for injected
   `<script src>` tags (`create-component-styles-and-scripts.js:29`).
4. **Flight/RSC client-reference manifest.** `route-module.js:275-278` injects
   `moduleLoading.integrity = (file) => scriptIntegrity(manifest, file)` into
   the client-reference manifest before render.
5. **Flight/RSC chunk loader.** The patched compiled clients call
   `moduleLoading.integrity(chunks[i])` in
   `prepareDestinationWithChunks` (`react-server-dom-webpack-client.node.production.js:135`),
   so every RSC chunk script receives `integrity`.
6. **Webpack JSONP loader.** The plugin adds an `IntegrityLoader` runtime
   module. The bundled runtime tables map chunk id → SHA-256 and the loader sets
   `script.integrity = __webpack_require__.ornigamiSri[chunkId]`
   (`subresource-integrity-plugin.js:60,70`). The built page's
   `webpack-*.js` contains the table and loader.
7. **Fail closed.** Missing or malformed entries throw
   `SRI: missing or malformed integrity` instead of emitting an unverified
   script.

## Verified commands and results

Clean install, build, and existing checks:

```powershell
npm ci
# NODE_ENV=production plus the local CI placeholder environment
npm run build
node scripts/production-smoke.mjs
node scripts/a19-csp-runtime-smoke.mjs
npm run test:security
```

- `npm ci`: passed (655 packages; `next@16.4.5` from the source artifact).
- `npm run build`: passed. Compiled, type-checked, generated 24 static pages.
- `scripts/production-smoke.mjs`: passed (static CSP hash parity,
  nonce-bound hydration/rotation, protected dashboard, auth/billing boundaries).
- `scripts/a19-csp-runtime-smoke.mjs`: passed on 8 rendered routes plus a 404,
  per-route nonce rotation, anonymous dashboard redirect, Trusted Types headers.
- `npm run test:security`: 7 passed.

Browser evidence (`BASE_URL=http://127.0.0.1:3302`):

- `/` → `200`, CSP nonce present, **10/10** same-origin scripts have integrity.
- `/login` → `200`, **10/10** same-origin scripts have integrity.
- Client navigation to `/about`, `/pricing`, `/review-booster`,
  `/review-replies`, `/login`: no missing integrity, no console/page errors.
  Routes share the initial client bundle, so no additional JS chunk was
  requested during those navigations; the RSC payload requests are separate.
- Dynamic loader control: webpack chunk `3342` loads successfully with no
  marker execution.
- Tampered dynamic chunk: the response body was modified with a marker. Chromium
  logged
  `Failed to find a valid digest in the 'integrity' attribute ... The resource has been blocked.`,
  the loader rejected the chunk (`Loading chunk 3342 failed`), and the marker
  never executed.

Campaign Lab production gates on the built server:

| Route | Result |
| --- | --- |
| `GET /campaign-lab` | `404` |
| `GET /campaign-lab/offer` | `404` |
| `POST /api/campaign-lab/generate` | `404`, `{"ok":false,"message":"Campaign Lab is unavailable."}` |

The production SRI receipt is written by:

```powershell
node scripts/sri-production-check.mjs `
  --repo C:\Users\joser\.local\ornigami-next-sri-source-candidate `
  --node 'C:\Program Files\nodejs\node.exe' `
  --source-sha <candidate-commit> `
  --output .local\sri-source-candidate.json
```

The receipt and browser JSON remain in ignored `.local/` storage:
`browser-sri-audit.json`, `tamper-proof.json`, and `sri-source-candidate.json`.

## Maintenance plan

1. **Track upstream.** Watch Next.js security advisories and the 16.4.x Active
   LTS line. Upstream currently has no release that attaches integrity to these
   App Router chunk tags, so this patch remains app-owned.
2. **Rebase on each release.** Re-clone the new upstream tag, apply
   `next-16.4.5-sri.patch`, resolve only semantic conflicts, and update the
   upstream commit, official tarball SHA-256, lockfile SHA-256, and overlay in
   `build-package-16.4.5.mjs`. Rename the recipe/artifact per release.
3. **Rebuild from source.** Use a new empty work directory. Do not reuse a
   prior `dist`. Confirm `PACKAGE_SHA256`, portability check, and identity file.
4. **Re-run the gates.** Clean `npm ci`, production build, SRI receipt,
   `production-smoke.mjs`, `a19-csp-runtime-smoke.mjs`, `test:security`, browser
   audit, tamper proof, and the Campaign Lab gates.
5. **Ownership.** Assign a named maintainer before adoption. Until then the
   artifact is untrusted for production and must not be published. Upstream
   signatures do not authenticate the modified bytes.
6. **Pin and verify.** Keep `package.json` and `package-lock.json` pinned to the
   artifact integrity. Verify the tarball SHA-256 in CI before install.

## Rollback plan

If the candidate fails a gate or causes a regression:

1. Stop using the branch tip; do not deploy the artifact.
2. Restore `package.json` and `package-lock.json` to the previously approved
   dependency state (`ece5ca9` or the last accepted release).
3. Remove `node_modules` and `.next`, then run a clean `npm ci` so the restored
   lockfile is authoritative.
4. Re-run `npm run build`, `production-smoke.mjs`, and the CSP smoke. Note that
   rolling back to official 16.4.5 restores the upstream SRI gap: App Router
   chunk scripts will again lack integrity, so the SRI receipt will fail.
5. If a rollback is needed only for the SRI patch, keep official 16.4.5 and
   record the accepted SRI exception explicitly; do not silently drop integrity
   from production.
6. Preserve the failed receipt and browser logs in `.local/` for review.

## Known limitations

- The recipe is an app-owned incremental source rebuild seeded by the official
  tarball; it is not a reproduction of upstream's full release pipeline.
- The source patch edits tracked vendored RSC client files. They are readable
  and reviewable, but upstream signatures do not cover the changed bytes.
- The build was produced on Windows x64 with Node `v24.11.1`; a Linux rebuild
  must produce its own identity file.
- The current app's public routes share one client bundle, so browser
  navigation does not request a new JS chunk. Dynamic chunk enforcement was
  proven with the webpack runtime loader and a tampered async chunk.
