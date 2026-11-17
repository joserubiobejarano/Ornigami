# Momisa revised B export review — 17 November 2026

Status: local, development-only. Not brand approval and not publication
approval. The direction remains experimental until the user or Momisa selects
it.

- Source: `0c37908`
- Branch: `codex/momisa-export-review`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/momisa-export-review`
- Install: dedicated worktree with an independent `npm ci`
- Local review bundle: `.local/momisa-review-bundle/` (Git-ignored)
- Pilot package: `.local/campaign-lab-pilots/momisa-taste/` (Git-ignored)

## Normal editor path

The revised B is available as the experimental pilot brand profile
`momisa-taste` through the normal local Campaign Lab editor:

```powershell
node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs --pilot momisa-taste

$env:CAMPAIGN_LAB_PILOT_ID='momisa-taste'
$env:GOOGLE_CLIENT_ID='local-export-id'
$env:GOOGLE_CLIENT_SECRET='local-export-secret'
$env:AUTH_SECRET='local-export-auth-secret-0123456789abcdef'
npx next dev --webpack --port 3130
```

Open:

```text
http://localhost:3130/campaign-lab?fixture=momisa-glow-box-taste
```

The editor uses the existing rendered preview, **Approve preview locally**, and
**Export approved page** flow. No separate export surface was added.

The exact approved commercial values and packshot are held in the ignored
pilot package and the exported receipt, not in this document.

## Explicit approved price

The offer emphasis no longer searches for the first currency amount. The brief
now carries an optional reviewed `offerPrice` substring. The renderer wraps
only that exact substring, and leaves the complete offer text intact.

- `findApprovedOfferPrice(offer, approvedPrice)` performs a literal substring
  lookup.
- A missing, blank, or non-matching approved price leaves the offer unstyled.
- The pilot manifest validates that `offerPrice`, when present, is an exact
  substring of `offer`.
- A focused test uses an offer with both a discount amount and two currency
  amounts, and verifies that the reviewed final price is the one emphasised.

## Font export assets

The normal Campaign Lab page loads EB Garamond and Jost through `next/font`, so
the editor preview and the export pipeline share the same font files. Pilot
tokens use concrete family names (`"EB Garamond"` / `Jost`) rather than
page-only CSS variables, so the standalone export does not depend on Next font
class variables.

Added:

- `font-licenses.ts`: EB Garamond and Jost copyright notices with the SIL Open
  Font License 1.1 text.
- `fonts/LICENSE-EB-Garamond-OFL-1.1.txt` and
  `fonts/LICENSE-Jost-OFL-1.1.txt` in the exported archive.
- `fonts/NOTICE.txt` mapping each bundled file to its family, copyright, and
  license.
- Export receipt `fonts` entries for both families.
- A focused test for both licenses.

## Verification provenance in the receipt

The pilot path now writes a `provenance` object into the export receipt. The
builder receives both the original manifest values and the exact rendered
values:

- `source: "pilot-manifest"` and the pilot ID;
- `pilotStatus`, the status recorded by the manifest;
- `status`, the effective status after comparing every rendered commercial
  input;
- the exact rendered `value` and original `sourceValue` for the offer,
  destination, and approved price;
- `changedByEditor` on each commercial field and an explicit `editorChanges`
  list containing the original and rendered values;
- the manifest source paths for each value;
- the asset's rights record with `reviewedBy`, `reviewedOn`, and source;
- the packshot asset ID, content hash, and reviewed asset record;
- an explicit `missingEvidence` list.

Confirmation is inherited only when the rendered value still matches its
approved manifest source. A confirmed pilot keeps confirmation for unchanged
fields. If the offer or destination is edited in the local editor, that field
becomes `provisional`, its original source value stays available for
comparison, and the receipt preview status becomes `preview`. Unchanged rights,
packshot, and approved-price evidence remains `confirmed`. Restoring the
original values restores inherited confirmation and removes the editor-change
entries.

The manifest has no named reviewer identity/date for the offer, destination, or
approved price, so those fields stay `reviewedBy: null`, `reviewedOn: null`, and
the receipt lists them as missing. The asset rights and packshot retain their
existing reviewed record. `verification` remains the existing
browser-offer-shaped field and is `null` on the pilot path; `provenance` is the
new additive field.

The visible provisional footer, `data-preview-status`, the receipt preview
status/notice, the exported preview-status/notice meta tags, and the rendered
footer all derive from the same comparison. The receipt also enforces agreement
between the preview status, notice, provenance values, and rendered offer,
destination, approved price, and packshot.

Compatibility: `offerPrice` and `provenance` are optional. Receipts without
them keep their previous shape and still pass the HTML/receipt agreement check.
The optional approved-price meta tag is checked only when the receipt contains
it.

## Verification

`node scripts/momisa-export-review.mjs --url http://localhost:3130
--exercise-url http://localhost:3131
--reference-bundle .local/momisa-review-bundle-before-provenance` drove the
real preview, approval, export, download, extraction, offline open, and review:
**213 checks passed, 0 failed**.

Checked:

- the approved revised B exported with EB Garamond and Jost from local files;
- the offer, Amazon destination, packshot SHA-256, approval revision, and
  receipt agree;
- the offer price span is present and the complete offer text is preserved;
- normal blending, 8 px photo-mat inset, square packshot;
- reading order headline → product → offer → CTA → facts;
- editor vs export article captures at 320, 375, and 1440 px;
- keyboard Tab to the exact CTA with the existing focus ring;
- 200% page scale (`visualViewport.scale = 2`) and the 200% browser-zoom layout
  (720 CSS px, DPR 2);
- the headline-first offer regression: image 361 / copy 423 after, versus
  423 / 361 before;
- the existing Morrow headline-first editorial fixture still loads and renders
  without overflow;
- the exported font notice and both license files exist in the archive;
- no console errors.

Measured editor/export article pixel differences: **0.61% at 320 px, 1.51% at
375 px, and 2.03% at 1440 px**. The captures and measurements are in the local
bundle. The differences are rasterization/shell-rounding level; the computed
typography, image treatment, order, offer, and destination match.

Against the preserved pre-provenance review bundle, the approved revised B
reference/current export captures are identical at the visible raster level:
**0.00% at 320, 375, and 1440 px** after allowing one 8-bit raster step. At 320
px, 19 pixels differ by one channel value (0.01%); 375 px and 1440 px have no
strict pixel differences. No copy, type, image, order, offer, or destination
change was introduced.

### Synthetic two-currency/reference-price exercise

The editor-change exercise now uses a separate synthetic product,
`review-price-exercise`, not the owner-confirmed Momisa offer. The synthetic
prices are internally consistent:

| Stage | Offer | Destination | Receipt status | Provenance |
| --- | --- | --- | --- | --- |
| Original | `20% off, was $22.50, now $18.00` | `https://example.com/synthetic-field-lantern` | `confirmed` | all commercial fields confirmed |
| Edited offer | `25% off, was $24.00, now $18.00` | original | `preview` · `Preview · offer provisional` | offer provisional; destination/price/rights/packshot confirmed |
| Edited destination | `25% off, was $24.00, now $18.00` | `https://example.com/synthetic-field-lantern/offer` | `preview` · `Preview · offer, destination provisional` | offer and destination provisional; price/rights/packshot confirmed |
| Original restored | `20% off, was $22.50, now $18.00` | original | `confirmed` | editor changes gone; confirmation restored |

Each stage was regenerated, reviewed, locally approved, exported, extracted, and
checked offline. The receipt preview status/notice, `data-preview-status`, the
visible footer, the exported status/notice meta tags, and the provenance
`editorChanges` agree. The edited offer retains the original manifest offer as
`sourceValue`; the edited destination retains the original destination as
`sourceValue`. The reviewed final price remains `$18.00` and is the only price
span; `$22.50` and `$24.00` are never emphasised.

The restored revision is `e26d3830a417a254`, exactly the original synthetic
revision. The owner-confirmed Momisa bundle remains at revision
`6304d42f5d94660b` with the original offer `30% off for Black Friday, $4.94`.

## Remaining editor/export differences

- The export receipt's existing browser-offer-shaped `verification` field is
  still `null` on the pilot path. The new additive `provenance` object carries
  the manifest source, exact rendered values, asset-rights record, and the
  explicit missing reviewer identities/dates for offer, destination, and price.
  Existing receipts without `provenance` remain valid.
- The export strips editor-only data attributes and source notes.
- The export uses relative packshot/font paths and bundled font files; the
  editor uses local editor URLs and Next-served fonts.
- The editor preview is inside the editor canvas; the export uses the approved
  standalone export shell. The comparison uses article-only captures.
- A rendered offer or destination that differs from the manifest is provisional
  even after local approval. Its original manifest value remains in provenance
  for comparison; unchanged rights, packshot, and approved-price evidence stays
  confirmed.
- The article-level pixel diffs above come from rasterization/shell rounding,
  not from changed copy, type, image treatment, or order.

## Local artifacts

- `.local/momisa-review-bundle/index.html` — updated review bundle
- `.local/momisa-review-bundle/bundle/index.html` — offline approved Momisa export
- `.local/momisa-review-bundle/bundle/receipt.json` — corrected approval,
  provenance, font, and file receipt
- `.local/momisa-review-bundle/exercise-original/index.html` — synthetic original
- `.local/momisa-review-bundle/exercise-edited-offer/index.html` — synthetic
  edited-offer export
- `.local/momisa-review-bundle/exercise-edited-destination/index.html` —
  synthetic edited-destination export
- `.local/momisa-review-bundle/exercise-restored/index.html` — restored original
- `.local/momisa-review-bundle/exercise-*/receipt.json` — corrected synthetic
  approval and provenance receipts
- `.local/momisa-review-bundle/bundle/fonts/NOTICE.txt` — bundled font notice
- `.local/momisa-review-bundle/report.json` / `report.md` — checks and
  differences
- `.local/momisa-review-bundle/captures/` — editor, export, synthetic exercise,
  zoom, focus, and regression captures
- `.local/momisa-review-bundle/*.zip` — downloaded export archives
- `.local/momisa-review-bundle-before-provenance/` — previous review bundle kept
  for render comparison
- `.local/momisa-review-bundle-before-correction/` — pre-correction bundle kept
  for receipt/history comparison

All Momisa inputs, the pilot manifest, captures, and the review bundle remain
under Git-ignored `.local/` storage. No publication, deployment, or live Amazon
navigation is part of this change.
