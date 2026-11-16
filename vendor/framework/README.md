# Vendored framework package

Patched stable release: **Next.js 16.4.5** (Active LTS). Selected from the
official November 2026 security release because the previous 16.4.2 package was
inside the affected range for the published advisories.

Official source of truth:

- Advisory: <https://nextjs.org/blog/november-2026-security-release>
- Official tarball: <https://registry.npmjs.org/next/-/next-16.4.5.tgz>
- Official package SHA-256:
  `a9b934c4deda237c1a269da4e68be28f39c7c5e07296a891e0a8346ce847ef97`
- Official package integrity:
  `sha512-rmdfsWosjTUO+6R0S3KokoIk6Kj0sWDRTe86tZHdqaWH/oXq/udX3/4xb+YQi7aWbyEFoglDU54kaifLCdXbBw==`

## Current candidate: source-built artifact

Artifact: `next-16.4.5-ornigami-sri.source.1.tgz`

- SHA-256:
  `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`
- Integrity:
  `sha512-eX6my0Em5+3pnq7KH1ZcTjT2heQiejYpc+g7GWKBo9iZxU4wB6QTGXmxy5I0Gw3itUVnX1VcNZJEEkD8YpPNWQ==`
- Source patch: `scripts/framework-prototype/next-16.4.5-sri.patch`
- Patch SHA-256:
  `602ed6a8b3f10843009276676a997e1a60427f3d9b266a4bb70fd612f6f94965`
- Recipe: `scripts/framework-prototype/build-package-16.4.5.mjs`
- Provenance: `ORNIGAMI_PROVENANCE.json` inside the archive and
  `next-16.4.5-ornigami-sri.source.1.tgz.identity.json` beside it.

The seed is the verified official 16.4.5 tarball. The recipe:

1. asserts upstream commit `4e5335a00314be7fbb2aace5e9be56a88e64e5a8`, the
   official package SHA-256, and the upstream lockfile SHA-256;
2. applies the reviewed source patch (App Router emitters, Flight manifest,
   SRI plugin, RSC clients, script-integrity helper);
3. rebuilds the TypeScript server/build outputs and all four production App
   Router bundles from source;
4. runs the portability checker; and
5. packs deterministically (sorted paths, epoch 0, fixed modes).

This artifact fixes the prior compiled-dist candidate's gap: the initial
scripts **and** the App Router chunk scripts emitted during navigation carry
`integrity`, the webpack JSONP loader enforces chunk integrity, and the RSC
client chunk loader uses `moduleLoading.integrity`.

Build command (from the repository root, with a new empty work directory):

```powershell
node scripts/framework-prototype/build-package-16.4.5.mjs `
  .local/next-source-16.4.5 `
  .local/next-16.4.5.tgz `
  .local/build-work-1 `
  vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz
```

Required inputs:

- Upstream clone at `v16.4.5` with the source patch applied and dependencies
  installed by the frozen pnpm 10.33.0 lockfile.
- Official `next-16.4.5.tgz` with the published SHA-256 above.

The artifact keeps the official tarball as its base. It is **not** an upstream
release and does not reproduce upstream's full release pipeline. It is
local-only (`adopted: false`), maintenance ownership is unassigned, and it must
not be published.

## Superseded candidate: compiled-dist patch

Artifact: `next-16.4.5-ornigami-sri.1.tgz`

- SHA-256:
  `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1`
- Patch: `scripts/framework-prototype/next-16.4.5-sri.dist.patch`
- Patch SHA-256:
  `56afe56380e26493464ef7b6c76ad07b85ba684e825bb671ce7abcb20d5b9593`

This earlier artifact applied compiled-dist repairs on top of the official
tarball. It still emitted App Router chunk scripts without integrity (10 on `/`,
11 on `/login`) because the remaining emission path lives inside the bundled
App Router runtime. It is retained for history only; do not use it.
