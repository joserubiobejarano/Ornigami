# Browser generation corrections — 18 November 2026

Status: synthetic, local-only verification. Not publication approval and not
real-model visual quality evidence.

- Base: `307792bdf81a4820d982a5f2a300770c1b6087ad`
- Branch: `codex/campaign-lab-browser-generation-fixes-20261118`
- Entry point: `/campaign-lab/offer`
- Local evidence: `.local/campaign-lab-browser-generation/` and
  `.local/campaign-lab-browser-generation-fixes/` (Git-ignored)

## Findings corrected

The review at
`C:\Users\joser\.local\ornigami-campaign-lab-browser-generation\.local\review-307792b\findings.json`
identified three defects. Before/after evidence is in
`.local/campaign-lab-browser-generation-fixes/before-after.json`.

### 1. Accent override preserved

The browser `browserBrief` now accepts one optional `accent` field. The parser
requires a six-digit hex color and rejects other types or values. The route
applies the validated accent to the server-created form values; the existing
catalog and `resolveBrandTheme` token logic remain server-owned. No client
catalog or token map is accepted. Missing accent keeps the existing default.

Browser evidence with `#244fae`:

- editor accent: `#244fae`
- provider request accent: `#244fae`
- returned preview/token accent: `#244fae`
- exported receipt accent: `#244fae`
- exported HTML inline treatment: `#244fae`
- invalid-output fallback accent: `#244fae`
- timeout fallback accent: `#244fae`

### 2. Export provenance and verification boundary

Browser exports now use provenance source `browser-intake` instead of
`pilot-manifest`. The receipt carries:

- `ownerConfirmed: false`;
- `assetBytesVerified: false`;
- the operator attestation (`verification` and `provenance.operatorAttestation`);
- browser-declared SHA-256;
- the local export SHA-256 and `localExportHashMatches`;
- `serverBytesVerified: false` for the packshot bytes;
- the selected accent under `preview.appearance`.

Operator checkboxes never become owner confirmation. Historical pilot receipts
remain readable because the new provenance fields are optional and pilot
receipts keep their existing shape.

### 3. Actual-byte request limit

The route now reads the request body stream and counts actual UTF-8 bytes before
JSON parsing (`src/lib/campaign-lab/generation/request-body.ts`).
`Content-Length` is only an early rejection hint. Missing or understated headers
cannot bypass the stream limit. Over-limit bodies return 413 before provider
selection. Malformed JSON still returns the existing actionable 400 response,
and the development availability gate remains first.

Actual route evidence:

- 33,619+ byte synthetic body with no `Content-Length`: **413**, no generation
  metadata.
- 40,794-byte multibyte body whose JavaScript string length is 20,794 (under the
  limit): **413**.
- Understated `Content-Length` through raw HTTP is truncated by the HTTP parser
  before the route and returns 400; a direct `Request` with the same understated
  header and full body is covered by regression and returns **413**. Neither
  path reaches generation.

## Verification

Commands:

```powershell
node --experimental-strip-types --test "tests/campaign-lab-*.test.mts"
node scripts/campaign-lab-browser-generation-check.mjs --scenario success
node scripts/campaign-lab-browser-generation-check.mjs --scenario invalid
node scripts/campaign-lab-browser-generation-check.mjs --scenario timeout
node scripts/campaign-lab-browser-generation-check.mjs --scenario stale
npx tsc --noEmit
npx eslint <changed files>
npm run build
```

Focused results:

- Campaign Lab tests: **166 passed, 0 failed**.
- TypeScript, focused ESLint, and production build: passed.
- Browser success: **95 checks passed** across two synthetic briefs.
  - Harbor Field, accent `#244fae`: revision `497330608cb5957b`.
  - Morrow, accent `#5b3f8c`: revision `25c1d96d89c65313`.
  - Exact offer, destination, facts, packshot SHA-256, and alt text survived.
  - Fresh local approval and export produced
    `campaign-lab-harbor-field-travel-bottle-497330608c.zip`.
  - Receipt source `browser-intake`; owner false; asset bytes unverified; local
    export hash matched.
- Invalid output: **39 checks passed**; fallback `invalid`; accent preserved.
- Timeout: **39 checks passed**; fallback `timeout`; accent preserved.
- Stale response: **43 checks passed**; delayed response did not replace the
  previous preview, and the fresh revision kept the selected accent.
- Fixture-based sparse and long-copy HTTP generation checks still passed.
- Shared design-harness script still passed for both fixtures.

Browser evidence:

- `.local/campaign-lab-browser-generation/success/report.json`
- `.local/campaign-lab-browser-generation/invalid/report.json`
- `.local/campaign-lab-browser-generation/timeout/report.json`
- `.local/campaign-lab-browser-generation/stale/report.json`
- `.local/campaign-lab-browser-generation/success/final-1440.png`
- `.local/campaign-lab-browser-generation/success/harbor-field-social-bundle/`
- `.local/campaign-lab-browser-generation-fixes/before-after.json`

## Remaining limitations

- Only the local-test provider was exercised. No paid or real model call was
  made, so real-model visual quality remains unassessed.
- Packshot bytes stay in the browser. The server validates declared metadata and
  the local export recalculates the exported SHA-256, but the server never
  verifies the original image bytes.
- Understated `Content-Length` behaves differently at raw HTTP (parser truncation
  before the route) and direct request construction (route returns 413). Neither
  reaches generation.
- No new templates, dependency changes, publication, deployment, or push were
  included.
