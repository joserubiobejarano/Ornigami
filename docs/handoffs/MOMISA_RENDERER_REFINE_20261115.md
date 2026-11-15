# Momisa renderer refinement — 15 November 2026

Branch: `codex/momisa-renderer-refine-20261115`
Base: `ab42ea8` (`codex/campaign-lab-integration`)
Worktree: `C:/Users/joser/Desktop/Projects/Ornigami-momisa-renderer`
Route used for verification: `http://localhost:3400/campaign-lab?fixture=momisa-glow-box`

This work refines the existing `single-product-offer` renderer. It does not
change the template ID/version, brand tokens, destination, preview warning, or
fact-group contract. Session 1 owns required fact groups; those types, IDs,
selection, and fact source attributes were not changed.

## Before

The Momisa pilot used the supplied Glow Box packshot inside the arch frame. The
arch mask clipped the box's top corners. The offer block also rendered a small
`OFFER` eyebrow above the discount, repeating what the discount already said.

Measured before at 375 px:

- headline 120–190 px
- offer block 307–351 px
- Amazon action 380–432 px
- packshot 454–784 px
- image loaded at 2500 × 2500
- no document or preview overflow
- CTA reachable by keyboard

Before captures are Git-ignored at:

```text
.local/momisa-refine/before-375-first-screen.png
.local/momisa-refine/before-375-full.png
.local/momisa-refine/before-375-preview.png
.local/momisa-refine/before-375-product-crop.png
.local/momisa-refine/before-1440-*.png
.local/momisa-refine/before-600-narrow-pane-*.png
.local/momisa-refine/before-metrics.json
```

## Changes

- **Arch treatment:** for a blended packshot (`imageBlend: multiply`), the
  image is now inset inside the arch surface and the frame no longer clips the
  image. The arch remains as the brand backdrop; the packshot's rectangular
  corners survive. This is scoped with the existing `imageBlend` token so
  Morrow's arch image treatment is unchanged.
- **Packshot aspect:** blended packshots use the approved asset aspect at narrow
  widths (square for the Momisa packshot) and the editorial 4:5 field on
  desktop. This keeps the full box, wordmark, variant names, and `3 SHEET MASKS`
  count visible without stretching.
- **Mobile hierarchy:** the editorial image now comes before the lede and offer
  on mobile and in the editor's narrow pane. The order is product label,
  headline, packshot, lede, promotion, action. The offer and CTA remain in the
  first viewport.
- **Redundant label:** removed the `Offer` eyebrow. The offer block now contains
  only the discount text. Added `data-role="offer"` and `data-role="action"` for
  stable checks; existing fact `data-*` attributes are untouched.
- **Desktop:** the same inset packshot and label removal apply. The image stays
  in the left column and the support/action stays in the right column.
- **Narrow editor pane:** the square asset aspect applies between 480 and 719 px
  of preview width, so the 600 px pane shows the full box rather than a
  top/bottom crop.

## After

Measured after at 375 px:

- headline 107–177 px
- packshot 203–526 px
- offer 620–690 px
- Amazon action 702–754 px
- all four inside the 812 px first viewport
- no document or preview overflow
- CTA focus visible
- image loaded at 2500 × 2500

At 1440 px: headline 142–219, packshot 267–763, offer 483–553, action 565–617,
all inside the 900 px viewport.

At the 600 px editor pane: the packshot is a full 478 × 478 square, rather than
a 500 × 330 top/bottom crop.

After captures are Git-ignored at:

```text
.local/momisa-refine/after-375-first-screen.png
.local/momisa-refine/after-375-full.png
.local/momisa-refine/after-375-preview.png
.local/momisa-refine/after-375-product-crop.png
.local/momisa-refine/after-1440-*.png
.local/momisa-refine/after-600-narrow-pane-*.png
.local/momisa-refine/after-metrics.json
```

## Verification

```powershell
npx tsc --noEmit
npx eslint src/components/campaign-lab/campaign-page.tsx scripts/campaign-lab-momisa-check.mjs
node --experimental-strip-types --test `
  tests/campaign-lab.test.mts `
  tests/campaign-lab-generation.test.mts `
  tests/campaign-lab-pilot.test.mts

$env:CAMPAIGN_LAB_PLAYWRIGHT="C:\Users\joser\Desktop\Projects\Ornigami\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs"

node scripts/campaign-lab-momisa-check.mjs `
  --url http://localhost:3400 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json `

node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3400 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved

node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3400 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json
```

Results:

- TypeScript: clean.
- ESLint: clean.
- Focused campaign-lab tests: 28/28 passed.
- Momisa focused browser check: 46/46 passed at 375 and 1440 px.
- Existing fictional-fixture acceptance: 144 passed, 0 failed, 0 pending,
  0 unassessed.
- Momisa proposed-manifest acceptance: 58 passed, 0 failed, 14 pending. Pending
  checks are the unconfirmed offer, destination, asset metadata, alt text, and
  packaging label checks. They are not passes.

The acceptance and focused checks cover offer and CTA visibility, image loading
and natural dimensions, text legibility and contrast, keyboard focus, exact
destination, overflow, approval invalidation, and console errors. The focused
check also verifies the first-screen image, offer, and action positions.

## Visual judgment

**Verified improvement:** the box's top corners are visible at 375, 600, and
1440 px. The wordmark, Vitamin C / Deep Collagen / Hyaluronic Acid, and
`3 SHEET MASKS` remain readable. On mobile the packshot now appears before the
lede and offer, so the product is recognized first, while the discount and
Amazon action still fit in the first screen. Removing the `OFFER` eyebrow
reduces a redundant line and moves the promotion slightly up.

**What still needs work:** at 1440 px the arch reads as a backdrop around a
rectangular packshot rather than a single continuous image shape. That is the
trade-off for preserving the box corners without changing brand tokens. At
375 px the packshot is legible but the small printed count is near the limit of
mobile readability. A future approved crop that trims more white margin, or a
packshot-specific image-treatment token, could make the product larger without
changing the arch shape.

## UX / DX / AX

- **UX:** the mobile sequence is product, promotion, action; the offer and CTA
  remain in the first viewport, and the packshot is no longer clipped. Checked
  against the Momisa focused browser check and the existing acceptance suite.
- **DX:** the change is limited to the shared renderer and one test selector; the
  template manifest, brand tokens, generation path, and fact contract are
  unchanged. Checked with TypeScript, ESLint, and the focused tests.
- **AX:** the renderer still exposes the brief, template, layout, section order,
  approved facts, revision, and generation status. Added `data-role` hooks make
  the offer and action stable for checks without changing visible copy.

## Local-only inputs

The Momisa pilot manifest, source brief, approved packshot, acceptance manifest,
and all captures remain under `.local/` and are Git-ignored. No brand input or
image capture is committed.
