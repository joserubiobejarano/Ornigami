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

Artifact: `next-16.4.5-ornigami-sri.1.tgz`

- SHA-256:
  `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1`
- Integrity:
  `sha512-uDmdR/NXRq1NirQSMwNWALAdBKzALbqUwrcwCCUlwq57lQAxF/FcLy8ZP5i9HRCZxHKv6t5NfxL2mU6h6UKd8g==`
- Patch: `scripts/framework-prototype/next-16.4.5-sri.dist.patch`
- Patch SHA-256:
  `56afe56380e26493464ef7b6c76ad07b85ba684e825bb671ce7abcb20d5b9593`
- Provenance: `ORNIGAMI_PROVENANCE.json` inside the archive and
  `next-16.4.5-ornigami-sri.1.identity.json` beside it.

The official 16.4.5 package still contains the upstream SRI gaps: its plugin
only emits a manifest without attaching integrity to dynamic chunks, its RSC
clients pass `integrity: void 0`, and its App Router script paths do not fail
closed on a missing manifest entry. The artifact keeps the verified official
tarball as its base and applies the minimal compiled-dist repairs found so far.

**Known unresolved gap:** the production SRI check still reports missing
integrity on several App Router chunk scripts (10 on `/`, 11 on `/login` in the
local receipt). The remaining emission path is inside Next's bundled App Router
runtime and was not safely reconstructed from the 16.4.2 patch. This artifact is
not production-adopted. It is **not** an upstream release and does not reproduce
upstream's full source build or release pipeline. Adoption and maintenance
ownership remain unassigned.
