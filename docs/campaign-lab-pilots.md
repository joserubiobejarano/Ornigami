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
  assets/
    momisa-glow-box-front.jpg # copied preview asset
```

`.local/` is Git-ignored. The app reads the generated manifest and serves only
listed assets whose bytes match the recorded SHA-256 through the development-only
pilot asset route. Keep any old loader copies out of `public/`.

## Load

```powershell
npm run campaign-lab:pilot:load
# equivalent:
node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs --pilot momisa
```

The loader reads `pilot.json`, verifies each source file, computes SHA-256 and
pixel dimensions, copies the image to the pilot's local assets directory, and writes
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
- `requiredFactGroups`, when supplied, declare fact IDs that must render
  together. Group IDs must be unique, every fact ID must reference an approved
  fact, and the group must fit a supported layout. Facts outside the groups stay
  optional and may be omitted.

  ```json
  "requiredFactGroups": [
    {
      "id": "complete-set",
      "label": "the complete set",
      "factIds": ["fact-a", "fact-b", "fact-c"]
    }
  ]
  ```
- Openings, when supplied, need unique IDs and approved copy.
- Every asset must be reviewed, use one of the approved roles (`product-hero`,
  `story-opening`, `product-detail`, `product-in-use`, `product-evidence`), stay
  under `/campaign-lab-pilots/`, include a SHA-256 hash, dimensions, alt text,
  source, rights note, and reviewer metadata. `caption` and `crop` are carried
  into the manifest when supplied. Optional `imageFit` accepts exactly
  `"contain"` or `"cover"` in both `pilot.json` and the runtime `manifest.json`.
  Source normalization and the normal CLI loader preserve an explicit choice.
  Other values (including null, wrong types and whitespace-padded strings) fail
  validation with the asset ID and allowed choices; invalid source input leaves
  the previous valid manifest untouched. Omit the field to retain historical
  defaults: product heroes use contain, other roles use cover. An arch product
  hero with contain uses the existing natural frame; cover uses compact framing.
  Effective fit/frame already participates in revision identity 6 and export
  metadata/receipts; a changed effective presentation requires fresh local approval.
  No schema or historical receipt migration is needed. An approved role is not automatically
  rendered: the advertorial placement contract in
  `ADVERTORIAL_MANIFEST.imagePlacements` decides which roles enter the API
  assignments. Unplaced roles are reported in the editor with the asset ID and
  reason.
- Advertorial editorial is optional. When `fixture.brief.advertorial` is
  supplied, the source must also provide a `sourceCampaign` record with channel,
  promise, source document, reviewer, and review date. The loader validates
  openings, at least two story beats with source quotes, narrator release for
  first-person copy, disclosure, product transition, preferred layout, and
  role/asset assignments.
- The fixture references the approved `product-hero` assignment (or the first
  hero asset for an offer-only pilot). The generation service still permits only
  approved fact IDs, layouts, section orders, and lengths.
- The loader writes `manifest.json` under the same Git-ignored pilot directory.
  It does not print source file paths, raw source documents, or the source
  promise; the editor shows the promise only for editorial review.

### Synthetic image-fit contract regression

Run `node --experimental-strip-types scripts/campaign-lab-imagefit-check.mjs`
from the builder worktree for source/runtime validation and real CLI loading.
It uses the existing approved Morrow WebP bytes with a distinct pilot-local
asset handle, keeping the approved commercial brief fixed. All generated source,
normalized records, manifests and diagnostics stay under ignored
`.local/imagefit-contract/intake/`. Invalid source preserves the last valid
manifest. `--observe --out <ignored-directory>` records behavior without asserting
the corrected contract, for a deliberate before/after reproduction.

For the editor-to-export proof, start the development server with
`CAMPAIGN_LAB_PILOT_ID=imagefit-contract`, `CAMPAIGN_LAB_PILOT_DIR` pointing to
the absolute `<out>/pilots` directory, `CAMPAIGN_LAB_GENERATION_PROVIDER=local-test`,
`OPENAI_ENABLED=false` and `CAMPAIGN_LAB_GENERATION_LIVE=false`. Then append
`--url http://127.0.0.1:<port>` to the checker. Optional
`CAMPAIGN_LAB_PLAYWRIGHT` and `CAMPAIGN_LAB_CHROMIUM` select existing installed
browser tools; the checker installs nothing. It exercises the actual server
loader and generation route, fresh editor approval, six static/inspection ZIPs,
320/375/768/1440 px captures, offline interaction, receipt/hash agreement and
effective revision changes. No route mocking or paid provider is used. An
invalid runtime manifest is ignored by the server and its asset route returns
404. Browser evidence is local Chromium automation, not physical-device or
cross-engine acceptance.

## Editorial manifest example

```json
"sourceCampaign": {
  "channel": "Email",
  "promise": "What changes when your first pour is slower?",
  "document": "Approved campaign email",
  "reviewedBy": "Ornigami content review",
  "reviewedOn": "2026-11-15"
},
"fixture": {
  "brief": {
    "advertorial": {
      "openings": [{ "id": "flow-control", "headline": "…", "standfirst": "…" }],
      "storyBeats": [
        {
          "id": "prototype-wall",
          "role": "opening",
          "text": "…",
          "source": {
            "document": "…",
            "quote": "…",
            "reviewedBy": "…",
            "reviewedOn": "2026-11-15"
          }
        }
      ],
      "disclosure": {
        "label": "Advertisement",
        "sponsor": "…",
        "explanation": "…",
        "repeatAtClose": false
      },
      "productTransition": "…",
      "assetAssignments": [
        { "role": "product-hero", "assetId": "hero" },
        { "role": "product-detail", "assetId": "detail" }
      ]
    }
  }
}
```

## Verification

```powershell
# Server generation through the real route
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night --expect generated

# Prove an incomplete provider group falls back through the real route
$env:CAMPAIGN_LAB_GENERATION_TEST_MODE="incomplete"
# restart the dev server, then:
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night `
  --expect fallback --expect-code invalid

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
opening change, required fact group visibility, revision, and approval reset.

## Current limits

- The pilot package is local-only and development-only. It is not publishing or
  persistence.
- The pilot asset rights note is a local review note, not a signed license.
- The `preview` status is an operator label. It does not make unconfirmed offer
  terms or a benchmark destination publishable.
- The single-product offer template still accepts one `product-hero` image. The
  advertorial template accepts the approved supporting roles; a pilot without
  advertorial editorial remains on the offer template. Additional pouch or
  lifestyle roles outside the approved role list remain a coverage gap.
