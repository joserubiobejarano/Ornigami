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
  `dcd421b4e8bb6d99f200de5ed0afbc6d3483079f24b9fa9ac8e303bd3f2376e0`
- Integrity:
  `sha512-dv1sqpTweYLePSG8ZaspI0hW3WEErQ30YVMzGKXyg93WbIT98Fod5VxwCdFEss8L5f8Lz31F4Pq9Basgh+YRng==`
- Patch: `scripts/framework-prototype/next-16.4.5-sri.dist.patch`
- Patch SHA-256:
  `c40a81e15818b34250b12c08f1902828f108cf13b25d802331e5c816995f6b19`
- Provenance: `ORNIGAMI_PROVENANCE.json` inside the archive and
  `next-16.4.5-ornigami-sri.1.identity.json` beside it.

The official 16.4.5 package still contains the upstream SRI gaps: its plugin
only emits a manifest without attaching integrity to dynamic chunks, its RSC
clients pass `integrity: void 0`, and its App Router script paths do not
fail closed on a missing manifest entry. The artifact keeps the verified official
tarball as its base and applies only the minimal compiled-dist repairs needed for
Ornigami's SRI/CSP acceptance. It is **not** an upstream release and does not
reproduce upstream's full source build or release pipeline. Adoption and
maintenance ownership remain unassigned.
