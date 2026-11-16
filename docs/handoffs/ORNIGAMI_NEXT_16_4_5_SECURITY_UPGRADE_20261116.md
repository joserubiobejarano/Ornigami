# Next.js 16.4.5 security upgrade review — 16 November 2026

Status: **local review, not production-adopted.** The patched artifact builds
and the CSP/browser smoke passes, but the production SRI check still fails on
App Router chunk integrity. This is an unresolved blocker.

- Branch: `codex/ornigami-next-security-upgrade`
- Base: `e4246c0`
- Commit: `1a34225`
- Worktree: `C:/Users/joser/.local/ornigami-next-security-upgrade`

## Official advisory and selected release

Source: [Next.js November 2026 security release](https://nextjs.org/blog/november-2026-security-release).

- Active LTS patched release: **16.4.5**.
- Maintenance LTS patched release: 15.5.29.
- Previous vendored package: 16.4.2, inside the affected range.
- Official tarball: <https://registry.npmjs.org/next/-/next-16.4.5.tgz>
- Official SHA-256:
  `a9b934c4deda237c1a269da4e68be28f39c7c5e07296a891e0a8346ce847ef97`
- Official integrity:
  `sha512-rmdfsWosjTUO+6R0S3KokoIk6Kj0sWDRTe86tZHdqaWH/oXq/udX3/4xb+YQi7aWbyEFoglDU54kaifLCdXbBw==`

The selected November advisories include GHSA-mfr8-8qww-v76h,
GHSA-vc7v-qv4w-wrv8, GHSA-rhh4-g77r-r9qj, GHSA-pc58-hwjq-p385,
GHSA-f3mh-rxg3-f5g2, and GHSA-7qx7-33qx-rqx2.

## Vendor inspection

The 16.4.2 vendor used `scripts/framework-prototype/next-16.4.2-sri.patch`.
That patch adds fail-closed App Router script integrity, dynamic JSONP chunk
integrity, RSC client chunk integrity, and a portable build configuration.

The official 16.4.5 package still has the upstream SRI gaps:

- `subresource-integrity-plugin.js` only emits a manifest; it does not attach
  integrity to dynamic chunks.
- All four compiled RSC clients still use `integrity: void 0`.
- App Router script paths do not fail closed when an integrity entry is missing.

The original 16.4.2 patch cannot be applied wholesale: the production App Router
runtime bundles changed between releases, and rebuilding Next.js source was not
performed. The delivered artifact keeps the verified official tarball as its
base and applies a minimal compiled-dist patch:

- patched integrity plugin
- patched RSC client chunk integrity
- patched App Router script/route paths
- added `script-integrity.js`
- patched bundled `app-page.runtime.prod.js` script integrity and manifest
  fallback

## Artifact provenance

Artifact: `vendor/framework/next-16.4.5-ornigami-sri.1.tgz`

- SHA-256:
  `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1`
- Integrity:
  `sha512-uDmdR/NXRq1NirQSMwNWALAdBKzALbqUwrcwCCUlwq57lQAxF/FcLy8ZP5i9HRCZxHKv6t5NfxL2mU6h6UKd8g==`
- Patch:
  `scripts/framework-prototype/next-16.4.5-sri.dist.patch`
- Patch SHA-256:
  `56afe56380e26493464ef7b6c76ad07b85ba684e825bb671ce7abcb20d5b9593`
- Provenance: `ORNIGAMI_PROVENANCE.json` inside the archive and
  `next-16.4.5-ornigami-sri.1.identity.json` beside it.

## Verified locally

- Clean install from `package-lock.json`: passed.
- Production build with `npm run build`: passed on 16.4.5.
- `scripts/production-smoke.mjs`: passed.
- `scripts/a19-csp-runtime-smoke.mjs`: passed on 8 routes plus a 404.
- `npm run test:security`: 7 passed.
- Browser navigation on `/` and `/login`: both `200`, CSP nonce present and
  rotating, no browser console/page errors.
- Campaign Lab development gates on the production build:
  - `/campaign-lab` → `404`
  - `POST /api/campaign-lab/generate` → `404` with
    `{"ok":false,"message":"Campaign Lab is unavailable."}`

## Unresolved SRI blocker

Production SRI receipt: `.local/sri-patched.json`.

- `/`: 15 same-origin scripts, **10 missing integrity**.
- `/login`: 16 same-origin scripts, **11 missing integrity**.

Missing files are App Router chunks such as:

```text
/_next/static/chunks/5930-0a7517faad12a649.js
/_next/static/chunks/9441-5bc7bdd6d4037f75.js
/_next/static/chunks/1518-823041558f779953.js
/_next/static/chunks/app/layout-ede629f144c105a0.js
/_next/static/chunks/app/page-64065a13a8cc4c6a.js
```

The official 16.4.5 build showed the same class of failure: 10 of 15 home-page
scripts lacked integrity. The remaining emission path is inside Next's bundled
App Router runtime. A safe fix requires rebasing the full source patch and
rebuilding the production App Router bundles, or an upstream release that
attaches integrity to those server-emitted chunk tags.

Do not treat this artifact as meeting Ornigami's SRI requirement yet. The package
is local-only, `adopted: false`, with maintenance ownership unassigned.

## Commands

```powershell
npm ci
$env:NODE_ENV='production'
# plus the local CI placeholder environment used by production smoke
npm run build

node scripts/production-smoke.mjs
node scripts/a19-csp-runtime-smoke.mjs
npm run test:security

node scripts/sri-production-check.mjs `
  --repo <absolute-repo> `
  --node <absolute-node> `
  --source-sha <clean-commit> `
  --output .local/sri-patched.json
```

Browser evidence and receipts remain in ignored `.local/` storage.
