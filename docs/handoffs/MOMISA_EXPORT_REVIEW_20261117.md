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

The pilot path now writes a `provenance` object into the export receipt:

- `source: "pilot-manifest"`, the pilot ID and status;
- the exact rendered offer, destination, and approved price values;
- the manifest source paths for each value;
- the asset's rights record with `reviewedBy`, `reviewedOn`, and source;
- the packshot asset ID, content hash, and reviewed asset record;
- an explicit `missingEvidence` list.

The manifest has no named reviewer identity/date for the offer, destination, or
approved price, so those fields stay `reviewedBy: null`, `reviewedOn: null`, and
the receipt lists them as missing. The asset rights and packshot retain their
existing reviewed record. `verification` remains the existing
browser-offer-shaped field and is `null` on the pilot path; `provenance` is the
new additive field.

Compatibility: `offerPrice` and `provenance` are optional. Receipts without
them keep their previous shape and still pass the HTML/receipt agreement check.
The optional approved-price meta tag is checked only when the receipt contains
it.

## Verification

`node scripts/momisa-export-review.mjs --url http://localhost:3130` drove the
real preview, approval, export, download, extraction, offline open, and review:
**199 checks passed, 0 failed**.

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

Measured editor/export article pixel differences: **0.61% at 320 px, 1.49% at
375 px, and 2.03% at 1440 px**. The captures and measurements are in the local
bundle. The differences are rasterization/shell-rounding level; the computed
typography, image treatment, order, offer, and destination match.

### Edited offer with two currency amounts

The normal editor flow was exercised again with an offer containing both a
discount amount and a second currency amount:

1. edit the Offer field;
2. Generate preview;
3. review the regenerated preview;
4. Approve preview locally;
5. Export approved page.

The edited receipt records the exact edited offer, the same approved final-price
substring, the same destination, and the same packshot. The rendered page
emphasises only the reviewed final price; the other currency amount is not
wrapped by the price span. The receipt and rendered emphasis agree. The edited
export is in `bundle-edited/` with its own receipt and revision.

No visual change was introduced to the approved revised B. The original review
bundle is preserved at `.local/momisa-review-bundle-before-provenance/` for
comparison; the only new “visual” artifact is the intentional edited-offer
exercise.

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
- The article-level pixel diffs above come from rasterization/shell rounding,
  not from changed copy, type, image treatment, or order.

## Local artifacts

- `.local/momisa-review-bundle/index.html` — updated review bundle
- `.local/momisa-review-bundle/bundle/index.html` — offline approved export
- `.local/momisa-review-bundle/bundle-edited/index.html` — offline edited-offer
  export
- `.local/momisa-review-bundle/bundle/receipt.json` and
  `bundle-edited/receipt.json` — approval, provenance, font, and file receipts
- `.local/momisa-review-bundle/bundle/fonts/NOTICE.txt` — bundled font notice
- `.local/momisa-review-bundle/report.json` / `report.md` — checks and
  differences
- `.local/momisa-review-bundle/captures/` — editor, export, edited-offer, zoom,
  focus, and regression captures
- `.local/momisa-review-bundle/*.zip` — downloaded export archives
- `.local/momisa-review-bundle-before-provenance/` — previous review bundle kept
  for comparison

All Momisa inputs, the pilot manifest, captures, and the review bundle remain
under Git-ignored `.local/` storage. No publication, deployment, or live Amazon
navigation is part of this change.
