# Advertorial review fixes — 15 November 2026

Status: local, deterministic review fixes. No renderer CSS or live provider work.

- Branch: `codex/campaign-lab-advertorial-review-fixes-20261115`
- Base: `f141097` on `codex/campaign-lab-advertorial-review-20261115`
- Worktree: `C:/Users/joser/.local/ornigami-campaign-lab-advertorial-review-fixes`
- Ownership: this session owns the brief, layout selection, validation, API, and
  editor form state. Session 2 owns the renderer and CSS.

## Reproduced failures before the fix

1. **Unrendered product-in-use image.** The `review-advertorial` pilot returned
   `review-hero` and `review-use` from the API in `advertorial-full`, but the
   article DOM contained only `review-hero`. Approval was allowed.
2. **Product swap.** A direct advertorial request with
   `productName: "Harbor Field travel bottle"` returned `200` and kept the
   Morrow headline, story, and dripper image.
3. **Distinct opening IDs.** A valid pilot with offer opening `offer-rib` and
   advertorial opening `advertorial-question` crashed on first load with
   `The Synthetic workflow review campaign fixture is invalid`.
4. **Fact stress.** A one-photo fixture with a 27-fact required group built a
   preview, reported fit, and accepted the layout.

## What changed

### 1. Image placement contract

`ADVERTORIAL_MANIFEST.imagePlacements` is now the single placement contract:

| Layout | Roles the verified renderer places |
| --- | --- |
| `advertorial-full` | `product-evidence` (story row 1), `product-detail` (story row 2), `product-hero` (product) |
| `advertorial-one-photo` | `product-hero` (product) |

`story-opening` and `product-in-use` remain valid approved library roles but
have no placement in either layout. They are never sent in
`preview.assets`. Fit reports them in `unusedImages` with the asset ID, role,
and the exact placement list for the selected layout. The editor shows an
**Approved image not used** notice even when the selected layout otherwise
fits.

Auto layout counts only placeable roles. A pilot with a packshot and
`product-in-use` therefore selects `advertorial-one-photo` instead of `full`.
Requesting `full` explicitly fails with the full layout's image requirement and
offers the compatible one-photo layout.

`calculateAdvertorialRevision` includes the placement contract and fact
presentation, so changing a slot changes the revision.

### 2. Product identity binding

`AdvertorialBrief.approvedProductName` carries the fixture's approved product
name. `validateAdvertorialBrief` rejects any other product name with a
`productName`-field identity issue. The API route also resolves the fixture's
default format when `format` is omitted, so a direct request cannot bypass the
advertorial path and reach the offer builder.

Legitimate offer and destination edits still work. The offer page keeps its
existing editable product-name behavior.

### 3. Format-specific opening form state

- `createFormValues` selects the default format first, then initializes
  `openingFocus` from that format's own options.
- `openingFocusForFormat` and `openingOptionsForFormat` are shared helpers.
- The editor remembers the last valid opening per format and restores it when
  switching back. Switching formats always clears approval.
- The opening select renders the selected format's options only.

Verified first load, switching to offer, switching back, and approval
invalidation on the distinct-opening pilot.

### 4. Fact presentation and one-photo intake

- `ADVERTORIAL_MANIFEST.factPresentation` records the verified product-block
  fact presentation: at most **3** facts in both layouts.
- Required groups remain atomic. A group of up to three renders whole; a group
  above three is rejected rather than truncated.
- The error names the group, its fact count, the layout capacity, and asks for a
  whole group or a compatible layout. The fit path uses the same evaluation and
  offers `compatibleLayout` when one exists.
- The generic "approved image roles beyond the product packshot" demand was
  removed from the advertorial intake checklist. One approved packshot is
  sufficient for the one-photo intake when the story and evidence are present.

## Verification

### Unit and static checks

- `npx tsc --noEmit`: passed.
- Focused ESLint on changed files: passed.
- Campaign-lab tests: **67 passed, 0 failed**.
  - placement filtering and unused-image explanation
  - product identity rejection and legitimate offer/destination edits
  - distinct opening initialization
  - 27-fact one-photo rejection
  - existing offer template behavior

### API

```powershell
node scripts/campaign-lab-advertorial-api-check.mjs --url http://localhost:3100
```

- **8/8 passed**: base preview, wrong packshot, wrong product name, implicit
  advertorial wrong name, wrong role, offer/destination edits, complete fact
  group in one-photo, full layout end.

### API assignments vs actual DOM

```powershell
node scripts/campaign-lab-advertorial-contract-check.mjs `
  --url http://localhost:3100 `
  --fixture review-distinct `
  --brand review-distinct `
  --opening advertorial-question `
  --offer-opening offer-rib `
  --advertorial-opening advertorial-question `
  --expect-layout advertorial-one-photo `
  --expect-unused review-use
```

- **14/14 passed** on `review-distinct`; the same probe passed **10/10** on
  `review-advertorial`. The distinct run includes:
  - first load selects `advertorial-question`
  - switching to offer selects `offer-rib` and clears approval
  - switching back restores `advertorial-question` and keeps approval cleared
  - API preview and editor render the same revision
  - API asset IDs exactly match article DOM asset IDs
  - the unused `review-use` image and reason are shown
  - one primary action and a product-block ending
  - no browser console errors

### Editor and regression captures

```powershell
node scripts/campaign-lab-advertorial-capture.mjs -u http://localhost:3100
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/offer-regression-manifest.json `
  --only sparse,long-copy `
  --out .local/campaign-lab-acceptance/offer-regression-approved `
  --require-approved
```

- Advertorial capture: **200 passed, 0 failed** at 320, 375, 768, 1440 and the
  1024 editor pane. One 320 px approval check was observed flaky once while the
  dev server was warming; the clean rerun passed all 200.
- Offer-page acceptance: **144 passed, 0 failed, 0 pending**.
- Invalid edits keep the last usable preview; the wrong-packshot probe keeps the
  last Morrow revision and clears approval.

### Fact stress

`.local/probes/fact-stress.mts` builds one-photo with a 27-fact required group.
Observed after the fix:

```json
{
  "ok": false,
  "fit": false,
  "layout": "advertorial-one-photo",
  "issues": [
    {
      "field": "advertorialLayout",
      "message": "Required fact group \"the stress group\" has 27 facts, but the Advertorial, one photo product block can present at most 3. Keep the group whole or choose a layout that supports it."
    }
  ]
}
```

## Contract note for Session 2

The renderer's current verified slots are the contract above. No renderer or CSS
files were changed. If Session 2 adds a slot for `product-in-use`,
`story-opening`, or a fourth fact, update
`ADVERTORIAL_MANIFEST.imagePlacements` / `factPresentation` first so fit,
assembly, API assignments, and DOM stay aligned.

## Remaining gaps

- `product-in-use` and `story-opening` remain unrendered roles. They are now
  explicit warnings, not silent drops. Adding slots is a renderer change.
- Both layouts support three facts because that is the verified product-block
  presentation. A larger required group has no compatible advertorial layout
  and recommends the offer template.
- Session 2 still owns visual review of the one-photo unused-image notice and
  the product-block fact count.
- No live provider, publishing, persistence, or real-brand source was used.
