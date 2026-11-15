# Campaign Lab advertorial fixes — 15 November 2026

Status: local, deterministic implementation. No live model calls, publishing, or
hosted preview were added.

- Branch: `codex/campaign-lab-advertorial-impl-20261115`
- Worktree: `C:/Users/joser/.local/ornigami-campaign-lab-advertorial-impl`
- Base: `8e4a605`
- Session ownership: Session 1 owns the brief, validator, assembler, API, and
  local pilot loader. Session 2 owns the renderer and visual review.
- Contract for Session 2:
  [section contract handoff](./CAMPAIGN_LAB_ADVERTORIAL_SECTION_CONTRACT_20261115.md)

## Findings and fixes

### 1. Wrong packshot accepted

The assembler replaced the campaign's approved `product-hero` assignment with
the editor's `assetId`, so a Harbor Field bottle could become the Morrow
dripper's packshot.

Now:

- `assignmentsForLayout` reads only the campaign's approved
  `advertorial.assetAssignments`. It never injects `values.assetId`.
- `validateAdvertorialBrief` requires `values.assetId` to equal the approved
  `product-hero` assignment.
- Every assigned asset must exist, be reviewed, have alt text, rights, a
  SHA-256 hash, match its assignment role, and belong to the campaign brand.
- Draft validation re-checks that every draft assignment is one of the
  campaign's approved role/asset pairs.
- Asset issues map to the form's `assetId` field. The API returns `422` and no
  preview, so the editor keeps its last usable preview.

A supporting image (for example `morrow-ribs`) is also rejected when used as the
packshot. Legitimate offer and destination edits keep the approved packshot and
produce a new revision.

### 2. Opening edits reused a revision ID

`calculateAdvertorialRevision` did not include the draft headline or standfirst.
It also omitted most presentation tokens and asset dimensions/crops.

The fingerprint now covers:

- template ID/version, layout, layout reason, section order;
- brand name, wordmark, descriptor, headline mode, detail title;
- every resolved brand token (colors, fonts, weight, tracking, label case,
  radii, hero mode/order, detail surface, image blend, wordmark mark);
- product name, product noun, offer, action label, exact normalized
  destination, required fact groups, opening focus, source campaign record;
- headline and standfirst;
- disclosure, narrator, story beats, facts, product transition;
- approved disclosures and asset assignments;
- asset ID, brand, role, `src`, width, height, content hash, alt text, caption,
  crop, and effective image blend.

Changing the headline or standfirst now changes the revision. Editing any field
in the editor already clears approval; a fresh `Approve preview` is required.

### 3. Fit disagreed with generation

Fit checked only the brief; generation also assembled and validated a draft.
The one-photo layout therefore claimed the full three-fact Morrow brief fit and
then generation rejected it for dropping `body`.

Now fit and generation call one `evaluateAdvertorial` pipeline:

1. validate the brief for the requested layout;
2. assemble the draft for that layout;
3. validate the draft, including required fact groups;
4. resolve approved assets.

Required fact groups are atomic. `maxFacts` is the optional-fact capacity; a
required group renders whole even when it exceeds that number. The full Morrow
brief therefore shows all three facts in both layouts. The one-photo layout
shows them in the product block because it has no evidence section.

If a requested layout truly cannot hold the brief (for example the full layout
with one approved image), fit names the reason and returns a
`compatibleLayout`. The editor offers a one-click switch to that layout before
falling back to the offer template. Automatic layout also chooses the one-photo
composition when the full layout has fewer than two approved images.

### 4. Local pilot loader rejected supporting roles and did not validate editorial inputs

The runtime loader and `scripts/load-campaign-lab-pilot.mjs` now share
`src/lib/campaign-lab/pilots/pilot-manifest.ts`.

- Assets may use all approved advertorial roles: `product-hero`,
  `story-opening`, `product-detail`, `product-in-use`, `product-evidence`.
- Asset records carry `brandId`, `caption`, and `crop` through to the manifest.
- Advertorial editorial inputs are validated when supplied: openings, story
  beats with source document/quote/reviewer/date, narrator release, disclosure,
  product transition, preferred layout, and role/asset assignments.
- A `sourceCampaign` record with channel, promise, source document, reviewer,
  and review date is required with advertorial editorial. It is written to the
  private manifest and shown in the editor under **Source campaign promise**
  for editorial review.
- Errors are specific and path-labelled, for example:
  `fixture.brief.advertorial.storyBeats[0] needs id, role, text and a complete source`,
  `fixture.brief.advertorial.disclosure needs an approved label, sponsor, explanation and repeatAtClose`,
  `fixture.brief.advertorial.productTransition is required`,
  `asset "detail" has unsupported role "lifestyle"`.
- The loader validates before copying files and validates the generated manifest
  before writing it. Source file paths, raw source documents, and the promise
  text are not printed by the loader. `pilot.json`, source images, the promise,
  and manifests stay under Git-ignored `.local/`.
- Legacy offer-only pilots without advertorial data still load.

## Section contract change

Both layouts now end at the product block:

- `advertorial-full`: `disclosure → opening → story → evidence → product`
- `advertorial-one-photo`: `disclosure → opening → story → product`

`ADVERTORIAL_MANIFEST.sectionContract` records `endsAt: "product"` and
`primaryAction: { section: "product", count: 1 }`. Draft validation rejects a
`close` section or any section after `product`. The renderer now renders the
close block only when the draft contains `close`, so the current contract
produces exactly one action in the product block. Session 2 owns the visual
review of that composition.

The existing `single-product-offer` flow is unchanged.

## Reproduction steps

Start the local server (the worktree already had one on port 3000; use port
3100 only after stopping it):

```powershell
npx next dev --webpack --port 3100
```

Wrong packshot through the real API:

```powershell
node scripts/campaign-lab-advertorial-api-check.mjs --url http://localhost:3000
```

The report at `.local/campaign-lab-advertorial-api/report.json` includes the
original request:

```json
{
  "fixtureId": "morrow-advertorial-full",
  "values": {
    "brandId": "morrow-ceramic",
    "productName": "Morrow ceramic pour-over dripper",
    "offer": "Free shipping through 30 November 2026",
    "destinationUrl": "https://example.com/morrow",
    "assetId": "harbor-field-bottle-front",
    "format": "advertorial",
    "advertorialLayout": "auto"
  }
}
```

Observed before this revision: `200` with a Harbor Field hero. Observed now:
`422`, `issues[0].field = "assetId"`, message names
`morrow-ceramic-dripper-front` as the approved packshot, and no `preview`.

Actual editor flow:

```powershell
node scripts/campaign-lab-advertorial-capture.mjs -u http://localhost:3000
```

The runner intercepts only the request body, substitutes the Harbor Field bottle,
and verifies that the rejection leaves the Morrow revision, hero image, and last
usable preview in place while clearing approval. It also switches the full
Morrow brief to the one-photo layout, checks all three fact IDs render, and
verifies that the editor explains and applies the compatible layout when the
full layout cannot hold one image.

Malformed local pilot:

```powershell
node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs --pilot bad-pilot --pilot-dir <temp-root>
```

The loader exits `2` and names each malformed editorial input and unsupported
role. It does not write a manifest.

Offer-page regression:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3000 `
  --manifest tests/fixtures/campaign-lab/offer-regression-manifest.json `
  --only sparse,long-copy `
  --out .local/campaign-lab-acceptance/offer-regression-approved `
  --require-approved
```

## Results

- `npx tsc --noEmit`: passed.
- Focused ESLint on changed files: passed.
- Campaign-lab tests: **62 passed** across advertorial, pilot, pilot-manifest,
  generation, required facts, and the existing offer/editor suite.
- API script: **6/6 passed**.
- Editor capture: **87 checks passed, 0 failed** across 375 and 1440 px.
- Offer-page acceptance: **144 passed, 0 failed, 0 pending, 0 unassessed**.
- Loader malformed-input check: exit `2`, specific errors, no manifest written.
- Existing local Momisa pilot reloaded successfully; offer-only editor path
  retained.

## Gaps and boundaries

- The Morrow fixture has one approved advertorial opening. Opening revision is
  covered by the revision unit test and the editor's generic approval reset, but
  there is no second approved opening to select in the editor. Do not add
  unapproved copy to create a UI test.
- Session 2 still owns visual review of the product-only ending, the three-fact
  product block in the one-photo layout, and the compatible-layout panel.
- The compact collection of hidden compatibility handling for old pilot
  manifests that omit `brandId` is deliberate; new manifests write it.
- No live provider, analytics, persistence, or publication path was exercised.
- The acceptance runner's pre-existing benchmark manifest conditions are
  unchanged.
