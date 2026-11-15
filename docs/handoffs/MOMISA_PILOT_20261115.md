# Momisa pilot handoff — 15 November 2026

## Branch and run

- Branch: `feat/momisa-campaign-pilot`
- Base: `5118497` (`feat: verify approved campaign openings in the integrated lab`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/momisa-pilot`
- Route: `http://localhost:3100/campaign-lab?fixture=momisa-glow-box`
- Pilot ID: `momisa`
- Reference: the **V6 Impeccable landing page** scored 10/10 in the Momisa
  landing benchmark. Its warm paper, Georgia display type, arch packshot, brown
  action, and early offer/action hierarchy drive this visual direction. The
  advertorial C page (23/25) is the secondary reference for the product/evidence
  sequence.

Use `localhost`, not `127.0.0.1`. Next blocks its dev resources on the literal
loopback address in this setup. If Turbopack reports the existing
`next/font/google` resolution error, use `npx next dev --webpack --port 3100`.

## What changed

- Added a local pilot catalog loader. A Git-ignored pilot package can merge one
  brand, fixture, and approved asset into the reviewed base catalog.
- Added `scripts/load-campaign-lab-pilot.mjs` and
  `npm run campaign-lab:pilot:load`. The loader verifies source files, pins
  SHA-256 and dimensions, copies assets into the Git-ignored public pilot path,
  and writes the runtime manifest.
- The page and `POST /api/campaign-lab/generate` load the same catalog, so the
  editor, deterministic builder, provider validation, and renderer agree.
- Added catalog-aware brand/asset helpers while keeping the base fixtures and
  approved fixture manifest unchanged.
- Added token-driven detail-band colors so Momisa can keep the V6-like light
  evidence band; base Harbor Field and Morrow colors are unchanged.
- Added token-driven image blend and wordmark-mark controls. Momisa uses
  `multiply` so the white packshot ground becomes the peach art surface, and it
  omits the generic mark.
- Added a visible `Preview · offer and destination unconfirmed` footer line for
  preview-status pilots, plus editor header/note labels.
- The generator now receives `openingFocus` and the local test provider uses it
  to choose different approved facts. The operator selects the approved opening;
  the product, offer, destination, and asset identity stay fixed.
- Added `scripts/campaign-lab-momisa-check.mjs`, reading only the local proposed
  acceptance manifest, to verify both widths, the first-screen hierarchy,
  opening changes, the offer/destination revision, old-value removal, and
  approval reset.

The full pilot brief and source assets are local and Git-ignored:

```text
.local/campaign-lab-pilots/momisa/pilot.json
.local/campaign-lab-pilots/momisa/manifest.json
.local/campaign-lab-pilots/momisa/acceptance.json
public/campaign-lab-pilots/momisa/momisa-glow-box-front.jpg
```

The committed code and handoff do not contain the source image or the full local
brief JSON.

## Approved-input record

### Asset identity

| Field | Verified value |
| --- | --- |
| Asset ID | `momisa-glow-box-front` |
| Source | `C:/Users/joser/Desktop/Projects/Momisa/IMG/Box.jpg` |
| Dimensions | 2500 × 2500 |
| SHA-256 | `6b5521df6d67249ff7c50a2ff88836a655720dcd27779de2eed0ef2ac3974211` |
| Role | `product-hero` |
| Alt text | “Momisa Glow Box in peach packaging, printed with Vitamin C, Deep Collagen and Hyaluronic Acid and 3 sheet masks for all skin types, photographed on a white background.” |
| Crop | 4:5 portrait, centered, `object-fit: cover`, `mix-blend-mode: multiply`; trims white side margins and keeps the full box, wordmark, flower, and printed mask names visible. |
| Review | `Ornigami pilot review`, 2026-11-15 |
| Rights | **Pending Momisa confirmation.** Pilot use only. |

The source image visibly names Vitamin C, Deep Collagen, Hyaluronic Acid,
`3 SHEET MASKS`, and `For all skin types`. The image is a product packshot; it is
not proof that the pictured package is the current physical pack.

### Pouch filename corrections

Visual inspection confirmed the supplied filenames are reversed for two pouches:

| Printed pouch wording | Supplied file | SHA-256 |
| --- | --- | --- |
| Vitamin C Sheet Mask | `IMG/Collagen-Mask.jpg` | `fc4a1a3ce98f0f5587fba42c62512617a3e55487153c367a3e6f3e3d54d943e1` |
| Deep Collagen Sheet Mask | `IMG/Vitamin-Mask.jpg` | `6948453dfdc2f6d1de2ac09782823d8ee321d326cb9a98eb23efc2238e7e6d93` |
| Hyaluronic Acid Sheet Mask | `IMG/HA-Mask.jpg` | `169e8d84e38711ea105cd159e9df4e6fa6b7137360158fa8815857ec1332df0d` |

Only the box packshot is approved for the current single-product template. The
pouch photos support the fact sources and are not rendered as separate assets.

### Approved facts used

| Fact ID | Value | Source |
| --- | --- | --- |
| `contents` | 3 sheet masks | `Box.jpg`: `3 SHEET MASKS / For all skin types` |
| `vitamin-c` | Vitamin C sheet mask | `Collagen-Mask.jpg`: `VITAMIN C Sheet Mask` |
| `deep-collagen` | Deep Collagen sheet mask | `Vitamin-Mask.jpg`: `DEEP COLLAGEN Sheet Mask` |
| `hyaluronic-acid` | Hyaluronic Acid sheet mask | `HA-Mask.jpg`: `HYALURONIC ACID Sheet Mask` |
| `skin-types` | For all skin types | `Box.jpg`: `For all skin types` |

No outcome, rating, testimonial, endorsement, origin, price, deadline, or
performance claim is rendered.

### Offer, destination, and opening status

- Offer: `30% off the Momisa Glow Box for Black Friday` — **benchmark input,
  not confirmed by Momisa.**
- Destination: `https://www.amazon.com/s?k=Momisa+Glow+Box+sheet+masks` —
  **preview search URL, not a direct listing.**
- Status: `preview` in the pilot manifest. The editor and rendered footer label
  the result as a preview with unconfirmed offer and destination.
- Approved openings: `mask-night` (“Your mask night, sorted.”),
  `three-masks` (“Three masks. One Glow Box.”), and `routine`
  (“A mask for each night.”). The full approved copy is in the local
  `pilot.json`; each is within the template’s headline and lede limits.
- The local test provider demonstrates evidence emphasis:
  - `mask-night` selects `contents`, `skin-types`, `hyaluronic-acid`;
  - `three-masks` selects `vitamin-c`, `deep-collagen`, `hyaluronic-acid`;
  - `routine` selects `contents`, `vitamin-c`, `hyaluronic-acid`.

## Verification

### Commands

```powershell
npx tsc --noEmit
npx eslint src/app/campaign-lab src/app/api/campaign-lab src/components/campaign-lab src/lib/campaign-lab tests/campaign-lab-pilot.test.mts scripts/load-campaign-lab-pilot.mjs scripts/campaign-lab-momisa-check.mjs scripts/campaign-lab-generation-check.mjs
node --experimental-strip-types --test tests/campaign-lab.test.mts tests/campaign-lab-generation.test.mts tests/campaign-lab-pilot.test.mts
```

Focused checks:

```powershell
npm run campaign-lab:pilot:load

node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night --expect generated
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening three-masks --expect generated

$env:CAMPAIGN_LAB_PLAYWRIGHT="C:\Users\joser\Desktop\Projects\Ornigami\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs"
node scripts/campaign-lab-momisa-check.mjs `
  --url http://localhost:3100 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json
```

Existing acceptance suite:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Momisa proposed-manifest run:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json
```

### Results

- TypeScript: clean.
- ESLint: clean.
- Focused campaign-lab tests: **28/28 passed** (12 template, 12 generation, 4
  pilot catalog/opening/fallback).
- Existing approved-fixture acceptance: **144 passed, 0 failed, 0 pending, 0
  unassessed** at 375 and 1440 px for the two base fixtures.
- Momisa proposed-manifest acceptance: **58 passed, 0 failed, 14 pending** at
  375 and 1440 px. The pending checks are the offer, destination, asset path,
  SHA-256, alt text, product name, and label checks that require confirmed
  Momisa metadata. They are not passes.
- Focused Momisa browser check: **46/46 passed**:
  - preview status is `preview`;
  - the first campaign screen at 375 px contains the headline (top 107 px),
    offer (277–291 px), action (367–419 px), and full packshot (441–771 px) in
    an 812 px viewport;
  - at 1440 px the headline, offer, action, and 532 px-high packshot are all
    inside the first 900 px;
  - generation uses `story-led` and the editorial layout;
  - changing the approved opening changes the headline and evidence facts while
    preserving offer, destination, and asset;
  - an offer/destination revision removes the old values, keeps the asset,
    clears approval, and requires a new approval;
  - no console errors.
- HTTP generation evidence:
  - `mask-night`: generated `story-led`, facts `contents, skin-types,
    hyaluronic-acid`.
  - `three-masks`: generated `story-led`, facts `vitamin-c, deep-collagen,
    hyaluronic-acid`.
- Full `npm test`: **970/975 passed**. The three reproducible failures are the
  pre-existing `tests/staging-synthetic-fixture.test.mjs` parser checks, which
  also fail on the base commit. The other two full-run failures were
  load-sensitive Coolify/owned-observation checks; both files pass **25/25** in
  isolation. No campaign-lab or Momisa pilot test failed.

## Captures

Committed under `docs/handoffs/momisa-pilot-20261115/`:

- [initial-375-first-screen.png](./momisa-pilot-20261115/initial-375-first-screen.png)
  — 375 px first campaign screen: product, offer, action, and packshot.
- [generated-approved-375-full.png](./momisa-pilot-20261115/generated-approved-375-full.png)
  — the actual editor at 375 px, including the brief controls and approved
  preview.
- [generated-approved-375-preview.png](./momisa-pilot-20261115/generated-approved-375-preview.png)
  — generated and approved Momisa preview.
- [opening-changed-375-preview.png](./momisa-pilot-20261115/opening-changed-375-preview.png)
  — approved opening changed; headline and evidence changed, fixed inputs did
  not.
- [revision-pending-approval-375-preview.png](./momisa-pilot-20261115/revision-pending-approval-375-preview.png)
  — new 25% offer and destination revision before approval.
- [revision-pending-approval-1440-full.png](./momisa-pilot-20261115/revision-pending-approval-1440-full.png)
  — editor showing the same revision as not approved, with the Approve action
  available only after the new preview.
- [revision-approved-1440-full.png](./momisa-pilot-20261115/revision-approved-1440-full.png)
  — editor and approved revised page at 1440 px.
- [generated-approved-1440-full.png](./momisa-pilot-20261115/generated-approved-1440-full.png)
  — editor and approved generated page at 1440 px.
- [evidence-summary.json](./momisa-pilot-20261115/evidence-summary.json) —
  focused 46-check names/results, first-screen measurements, both HTTP
  generation proposals, and acceptance counts. The full local brief and raw
  reports remain Git-ignored.

The raw Momisa acceptance report and all per-state captures remain under
`.local/momisa-acceptance/` and `.local/momisa-focused-check/` (Git-ignored).

## Inputs still needed from Momisa

1. **Direct listing**: the Amazon URL or ASIN for the Glow Box. The current
   search URL is a preview placeholder.
2. **Offer terms**: confirm 30%, eligible marketplace, start/end dates, price
   basis, coupon or Prime requirements, and any disclosure wording.
3. **Media rights**: written permission to use `Box.jpg` and the pouch photos,
   and confirmation that `Box.jpg` shows the current pack, variant, and count.
4. **Claim review**: confirm the printed mask names, “3 sheet masks”, and “For
   all skin types” may be surfaced. We intentionally did not render the pouch’s
   outcome language.
5. **Brand kit**: confirm the wordmark treatment, type fallback, colors, and
   whether a logo/typeface must replace the plain serif wordmark.
6. **Asset roles**: decide whether a second approved role (pouch or lifestyle)
   is needed. The current single-product template accepts one `product-hero`
   image.
7. **Approval of the exact crop and alt text** for the packshot at 375 and
   1440 px.

## UX / DX / AX

- **UX:** The pilot opens as a labeled preview, the first mobile campaign screen
  carries product, offer, action, and packshot, and an opening change or offer
  revision is visibly pending re-approval. Checked against the existing base
  fixture acceptance and the new focused pilot checks.
- **DX:** A Git-ignored manifest and one loader command add a brand without
  changing the template, provider adapter, or approved base fixtures. Checked
  against the base catalog tests and the existing acceptance suite.
- **AX:** The fixture, pilot, preview status, opening, sections, fact IDs,
  revision, and asset record are exposed in the editor and DOM. The loader
  rejects incomplete or unsafe pilot manifests with a specific reason.

## Quality limits

- The pilot package is local-only and Git-ignored. A clean checkout cannot
  reproduce the Momisa render until the operator supplies the local package.
- The offer and Amazon search destination remain benchmark inputs. The preview
  label is not publication approval.
- The template still supports only one `product-hero` asset; pouch and lifestyle
  images are evidence for fact verification, not rendered roles.
- The focused check proves DOM/asset identity, positions, offer removal, and
  approval reset. It does not prove packaging truth, screen-reader behavior,
  physical-device rendering, zoom, motion, or conversion.
- Momisa proposed acceptance leaves 14 fixture-dependent checks pending by
  design. Do not report them as passed.
- No live provider call was made; generation quality and model choice remain
  unassessed for this pilot.
- Turbopack dev still hits the pre-existing font-resolution issue in this
  worktree; webpack dev was used for verification.
