# Browser offer generation and campaign context — 18 November 2026

Status: synthetic, local-only verification. Not publication approval and not
real-model visual quality evidence.

- Base: `07fec67109fce5147dcf38790ca17b928ce0093b`
- Branch: `codex/campaign-lab-browser-generation-20261118`
- Entry point: `/campaign-lab/offer`
- Local evidence: `.local/campaign-lab-browser-generation/` (Git-ignored)

## Reproduced gaps

The review findings at
`C:\Users\joser\.local\ornigami-campaign-lab-design-harness\.local\review-07fec67\findings.json`
were reproduced before the change:

- `CampaignLab` returned the deterministic browser preview through `localOnly`
  before reaching the generation route or provider.
- The actual pilot validator accepted `audience: 42` and
  `objective: { goal: "Synthetic" }`; brief assembly then threw
  `value?.trim is not a function`.

Reproduction evidence:
`.local/campaign-lab-browser-generation/reproduction-07fec67.json`.

## Browser brief contract

The normal `/campaign-lab/offer` flow now posts a bounded `browserBrief` to the
existing `POST /api/campaign-lab/generate` route. The request is defined and
validated in `src/lib/campaign-lab/browser-offer-brief.ts`.

- Only the known browser brief fields are accepted: schema version, brand and
  product text, audience/objective, offer, destination, approved fact rows, asset
  metadata, operator confirmations, and review date.
- Unknown fields are rejected. A client-supplied catalog, provider, environment,
  fixture ID, or executable configuration is not accepted.
- The route validates the browser brief, constructs the browser fixture and
  catalog on the server with the existing `buildBrowserOfferCatalog`, derives the
  same `CampaignFormValues`, and calls the shared `runCampaignGeneration`.
- The existing request builder, guidance pack, provider selection, proposal
  validation, deterministic fallback, revision identity, approval gate, and
  export path are reused.
- The packshot `File` and object URL stay in the browser. The request carries only
  declared metadata: file name, dimensions, alt text, rights, and the locally
  computed SHA-256. The server validates the metadata shape but does not claim to
  verify the image bytes.
- Returned previews are hydrated with the local object URL for rendering,
  approval, and export. Response metadata records `ownerConfirmed: false` and
  `assetBytesVerified: false`. The intake checkboxes remain operator
  attestations, not owner confirmation.

## Campaign context validation

Audience and objective now use one shared parser and a 240-character limit for
each field (`src/lib/campaign-lab/campaign-context.ts`).

- Missing or empty fields remain compatible with older briefs.
- Non-text values and overlong values return actionable field errors.
- Values are trimmed but never truncated.
- Validation is applied to browser requests, prepared briefs, persisted draft
  submission, pilot source/runtime manifests, form validation, and direct service
  entry. Browser request validation additionally hits the actual route boundary.

The browser intake helper paragraph that described context “traveling with the
brief” was removed. The remaining note is concise: context is optional, used to
choose the opening, and never rendered.

## Verification

Commands:

```powershell
node --experimental-strip-types --test "tests/campaign-lab-*.test.mts"
npx tsc --noEmit
npx eslint <changed files>
npm run build
```

Focused results:

- Campaign Lab tests: **155 passed, 0 failed**.
- `npx tsc --noEmit`, focused ESLint, and `npm run build`: passed.
- Browser success scenario: **70 checks passed** across two synthetic briefs:
  - Harbor Field paid-social brief: `493748a894e47163`, `generated`,
    `local-test`.
  - Morrow email brief: `74befa64d8670f5a`, `generated`, `local-test`.
  - Requests contained only `browserBrief` and `requestId`, with distinct
    audience/objective values, no fixture ID, no client values, no catalog, and
    no asset source/object URL.
  - Offer, destination, facts, packshot SHA-256, and alt text survived in the
    preview and export receipt.
  - Fresh local approval and export produced
    `campaign-lab-harbor-field-travel-bottle-493748a894.zip`; HTML and receipt
    revision, offer, destination, packshot and all receipt checks agreed.
- Invalid-output browser scenario: **29 checks passed**, fallback `invalid`,
  provider mode `local-test`, exact commercial identity retained.
- Timeout browser scenario: **29 checks passed**, fallback `timeout`, provider
  mode `local-test`, exact commercial identity retained.
- Stale-response scenario: **33 checks passed**. A delayed first response was
  invalidated by an edit; the previous preview stayed intact and the fresh
  generation produced a new revision.
- Malformed browser context at the actual API boundary returned **422** with
  `Audience must be text` and `Campaign objective must be text`.
- Existing fixture-based HTTP generation check still passed with preserved offer,
  destination, asset, alt text, audience, objective, harness and guidance
  versions.

Browser evidence and captures:

- `.local/campaign-lab-browser-generation/success/report.json`
- `.local/campaign-lab-browser-generation/invalid/report.json`
- `.local/campaign-lab-browser-generation/timeout/report.json`
- `.local/campaign-lab-browser-generation/stale/report.json`
- `.local/campaign-lab-browser-generation/success/final-1440.png`
- `.local/campaign-lab-browser-generation/success/<export>.zip` and extracted
  `harbor-field-social-bundle/`

Reproduce with a local-test dev server:

```powershell
node scripts/campaign-lab-browser-generation-check.mjs --scenario success
node scripts/campaign-lab-browser-generation-check.mjs --scenario invalid
node scripts/campaign-lab-browser-generation-check.mjs --scenario timeout
node scripts/campaign-lab-browser-generation-check.mjs --scenario stale
```

## Remaining limitations

- Only the local-test provider was exercised. No paid or real model call was
  made. The browser evidence proves request construction, routing, fallback,
  approval, and export, not real-model selection or visual quality.
- Packshot bytes remain browser-held and are not server-verified. The SHA-256 is
  planning and identity metadata from the browser reader, not a server receipt.
- The stale-response check used a deliberately delayed browser response and an
  edit that invalidated the request. It does not simulate every transport race.
- No new templates, arbitrary CSS generation, publication, deployment, accounts,
  billing, dependency changes, or pushes were included.
