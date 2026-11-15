# Local campaign pilots

A pilot package lets an operator load a real-brand brief and approved assets into
the existing Campaign Lab editor without committing the brand materials. It uses
the same `single-product-offer` template, generation service, fallback, approval,
and acceptance path as the fictional fixtures.

## Package layout

```text
.local/campaign-lab-pilots/momisa/
  pilot.json       # operator-authored source brief, openings, brand, asset plan
  manifest.json    # generated, hash-pinned runtime manifest

public/campaign-lab-pilots/momisa/
  momisa-glow-box-front.jpg   # copied, Git-ignored preview asset
```

`.local/` and `public/campaign-lab-pilots/` are Git-ignored. The source brief and
source images stay outside the repository. The app reads only the generated
manifest and serves the copied preview asset.

## Load

```powershell
npm run campaign-lab:pilot:load
```

The loader reads `pilot.json`, verifies each source file, computes SHA-256 and
pixel dimensions, copies the asset to the public pilot path, and writes
`manifest.json`. The command prints the asset ID, source URL, dimensions, hash,
alt text, and crop note. Re-run it after changing the brief or asset selection.

## Runtime selection

The server page and generation route call `loadCampaignCatalog()` from
`src/lib/campaign-lab/pilots/local-pilot.ts`. It merges the optional pilot brand,
fixture, and assets into the reviewed base catalog. If the manifest is absent or
invalid, the base lab remains available and the pilot is omitted. A warning names
the exact manifest problem in the server log.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `CAMPAIGN_LAB_PILOT_ID` | `momisa` | Pilot directory to load. |
| `CAMPAIGN_LAB_PILOT_DIR` | `.local/campaign-lab-pilots` | Root containing pilot packages. |
| `CAMPAIGN_LAB_PILOT_DISABLED` | unset | Set to `true` to ignore all pilots. |

The editor shows the pilot label and `preview inputs` or `confirmed inputs` in
the header. A preview pilot also shows the note from the manifest and a
`Preview · offer and destination unconfirmed` footer line in the rendered page.

## Manifest rules

- `schemaVersion` must be `1`.
- Brand tokens and the fixture brief are required.
- Approved facts need unique IDs and approved source text.
- Openings, when supplied, need unique IDs and approved copy.
- Every asset must be reviewed, use the `product-hero` role, stay under
  `/campaign-lab-pilots/`, include a SHA-256 hash, dimensions, alt text, source,
  rights note, and reviewer metadata.
- The fixture references the first approved asset. The generation service still
  permits only approved fact IDs, layouts, section orders, and lengths.

## Verification

```powershell
# Server generation through the real route
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night --expect generated

# Focused editor checks at 375 and 1440
$env:CAMPAIGN_LAB_PLAYWRIGHT="C:\Users\joser\Desktop\Projects\Ornigami\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs"
node scripts/campaign-lab-momisa-check.mjs --url http://localhost:3100 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json

# Existing acceptance runner, using the local proposed manifest
node scripts/campaign-lab-acceptance.mjs --url http://localhost:3100 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json
```

The proposed manifest keeps fixture-dependent checks pending. Do not call a
pending offer, destination, asset, alt-text, or label check a pass. The focused
check separately verifies the asset bytes/identity, first-screen hierarchy,
opening change, revision, and approval reset.

## Current limits

- The pilot package is local-only and development-only. It is not publishing or
  persistence.
- The pilot asset rights note is a local review note, not a signed license.
- The `preview` status is an operator label. It does not make unconfirmed offer
  terms or a benchmark destination publishable.
- The single-product template accepts one `product-hero` image; additional pouch
  or lifestyle roles remain a template coverage gap.
