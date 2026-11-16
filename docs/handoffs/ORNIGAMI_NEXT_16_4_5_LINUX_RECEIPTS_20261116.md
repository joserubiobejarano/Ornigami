# Next.js 16.4.5 Linux SRI receipts — 16 November 2026

Status: **target-platform receipts passed; release is conditional.** The exact
16.4.5 candidate tarball built and passed SRI, CSP, home/login, and Campaign Lab
gates on Ubuntu 24.04 x86_64 with Node `v22.23.3`. No Linux rebuild was needed.
The repo's full dependency audit still fails on pre-existing application
dependencies. No verified rollback artifact passes the same gates.

- Candidate code: `6f188c2`
- Receipt commit: `697e322` (adds the temporary Linux workflow and updates the
  stale fixture-pin test)
- Branch pushed for CI: `codex/ornigami-next-sri-linux-receipts`
- Worktree: `C:/Users/joser/.local/ornigami-next-sri-linux-candidate`
- Target: Ubuntu 24.04, Linux x86_64, Node `v22.23.3`, npm `10.9.9`
- Browser: Google Chrome `157.0.8103.50` via Playwright `1.61.0`
- Candidate artifact:
  `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`
  - SHA-256: `65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`

## Advisory check and final pin

Official sources:

- [November 2026 security release](https://nextjs.org/blog/november-2026-security-release)
  (published 3 November 2026): patched Active LTS **16.4.5**, Maintenance LTS
  15.5.29.
- GitHub advisory ranges still list `16.4.5` as the patched version, including
  GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, GHSA-rhh4-g77r-r9qj,
  GHSA-vvgp-ww4w-46vf, GHSA-pc58-hwjq-p385, GHSA-f3mh-rxg3-f5g2, and
  GHSA-7qx7-33qx-rqx2.
- [Next.js v16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6)
  (published 9 November 2026) is an LTS backport of bug fixes only: route
  handler response compression, Turbopack dev GC, and a Tailwind pin. It has no
  security content and no advisory lists it as a patched target.

The final pin is therefore the **16.4.5 SRI source candidate**, not 16.4.6.
16.4.6 is a later stable release but does not improve advisory coverage, and the
SRI patch would need a fresh rebase and target receipts because the bundled
`app-page.runtime.prod.js` changed between 16.4.5 and 16.4.6. Adopt 16.4.6 only
as a follow-up after the SRI patch is rebased and retested; it is not a release
blocker for the November advisories.

## Target-platform receipts

CI run: <https://github.com/joserubiobejarano/Ornigami/actions/runs/43972965433>
(receipt commit `697e322`; artifact `sri-linux-receipts`).

| Gate | Result |
| --- | --- |
| `npm ci` | passed |
| `npm run build` | passed; 24 static pages |
| `scripts/sri-production-check.mjs` | **passed**, 31 same-origin scripts across 2 pages |
| `/` | `200`, 15/15 scripts with valid integrity |
| `/login` | `200`, 16/16 scripts with valid integrity |
| nonce rotation | distinct nonces across pages |
| `production-smoke.mjs` | passed |
| `a19-csp-runtime-smoke.mjs` | passed (8 routes + 404, nonce/CSP rotation, Trusted Types) |
| `npm run test:security` | 7 passed |
| Quality checks (`npm test`) | passed after fixture-pin test update |
| `/campaign-lab` | `404` |
| `/campaign-lab/offer` | `404` |
| `POST /api/campaign-lab/generate` | `404`, `{"ok":false,"message":"Campaign Lab is unavailable."}` |

The SRI receipt records `nextVersion: 16.4.5`, no errors, and no page issues.
Raw receipts: `.local/linux-receipts-final/`.

## Dynamic chunk and tamper fixture

The Linux run used the repository's SRI fixture and browser harness:

- Normal interaction: clicking **Load late chunk** dynamically imported
  `/_next/static/chunks/374.019880d3cded1fcc.js`.
- Before append, the script carried
  `integrity="sha256-oQuVq9tlTGZ9Xytfc8H8/mZIQQxP8LJPu45pYhbEoGw="`, a nonce, and
  `crossOrigin="anonymous"`.
- Corrupted bootstrap: response intercepted and replaced with a marker; marker
  never executed and Chromium reported an integrity/digest rejection.
- Corrupted asynchronous chunk: toggled chunk response intercepted and replaced;
  marker never executed, the dependency import settled as `rejected`, and the
  browser reported an integrity/digest rejection.
- Missing and malformed manifest entries fail closed before any chunk request.
- Missing production manifest returns HTTP `500` with the expected SRI error.
- Process restart retained valid emitted SRI.

All 9 fixture checks passed.

## Rollback rehearsal

Rollback artifact tested: prior compiled-dist candidate
`vendor/framework/next-16.4.5-ornigami-sri.1.tgz`
(SHA-256 `da0c86bee1d60f963cebba91b88a4253bfaa884dd05e26a3e74af8d1b7bab3f1`).

- Fixture build and browser run completed.
- `production-http-sri-and-csp` **failed**: missing integrity on
  `/_next/static/chunks/app/global-error-923e54f4ea4a4f4e.js`,
  `/_next/static/chunks/app/error-0067cbd20f1025a7.js`, and
  `/_next/static/chunks/app/page-f1b8ac87d477c6ec.js`.
- Restart SRI check failed for the same three App Router scripts.
- Dynamic-chunk tamper checks still passed, but the initial page SRI gate did
  not.

**No verified rollback artifact passes the same gates.** The 16.4.2 SRI artifact
is not an acceptable fallback because 16.4.2 is inside the November advisory
range; rolling back to it would fail the security baseline. Official 16.4.5
also lacks App Router chunk integrity.

## Remaining release blocker

The repository's `Security checks` workflow still fails on the full dependency
audit:

- Full audit: 14 findings (1 critical, 1 high, 12 moderate).
- Production audit: 8 findings (1 critical, 1 high, 6 moderate).
- Direct packages include `@sentry/nextjs` (critical), `zod` (high), and
  `typescript-eslint` (moderate); the rest are transitive.

These are pre-existing application dependency findings, not Next.js advisories
and not introduced by the SRI artifact. Repo policy requires zero full-audit
findings, so release remains conditional until they are remediated or an
explicit risk exception is approved. Security workflow:
<https://github.com/joserubiobejarano/Ornigami/actions/runs/43972965468>.

## Release recommendation

1. **Pin Next.js to the 16.4.5 SRI source candidate** for the November 2026
   advisory baseline. Do not pin 16.4.6 without a rebased SRI artifact and new
   receipts.
2. The target-platform Next/SRI/CSP/app gates are satisfied on Linux x64 with
   Node 22.23.3. No Linux rebuild is required.
3. **Do not release yet** until the dependency-audit blocker is resolved or
   explicitly excepted, and a named maintenance owner accepts the app-owned
   Next patch. Maintenance ownership remains **unassigned**.
4. Treat 16.4.6 as the next maintenance rebase target once the SRI patch is
   rebased and the same Linux receipts pass.
5. Keep the candidate local or in authorized CI; do not publish the modified
   package. Upstream signatures do not authenticate the changed bytes.

## Reproduce

The temporary workflow is
`.github/workflows/sri-linux-receipts.yml`. It runs on the receipt branch only
and uploads `sri-linux-receipts`. The core commands are:

```bash
npm ci
npm run build
rm -rf .next
node scripts/sri-production-check.mjs \
  --repo "$GITHUB_WORKSPACE" \
  --node "$(command -v node)" \
  --source-sha "$GITHUB_SHA" \
  --output "$EVIDENCE/sri-source-candidate.json"
node scripts/production-smoke.mjs
node scripts/a19-csp-runtime-smoke.mjs
npm run test:security
# start next on 127.0.0.1:3410 and check home/login/Campaign Lab gates
# build a copy of tests/fixtures/framework-sri against the exact tarball
# run scripts/framework-prototype/browser-regressions.mjs with /usr/bin/google-chrome
```
