# Advertorial review-render handoff

Date: 16 November 2026
Branch: `codex/campaign-lab-advertorial-review-render-20261115`
Base commit: `f141097` (`Verify the single advertorial action by keyboard`)
Worktree: `C:\Users\joser\.local\ornigami-campaign-lab-advertorial-review-render`

Status: local review ready. The proposed opening and transition are implemented
only in an ignored local pilot for Session 1 to adopt or reject. No live model
calls, publishing, or hosted preview were added.

## Worktree and ownership

- This is a separate worktree from `f141097`. The existing
  `ornigami-campaign-lab-advertorial-review` worktree was left untouched.
- Session 1 owns the brief, validator, assembler, API, and pilot loader.
  Session 2 owns the renderer, CSS, and visual review.
- Session 2 did not edit `src/lib/campaign-lab/advertorial.ts`,
  `src/lib/campaign-lab/fixtures.ts`, the API, the validator, or the pilot
  loader.
- Renderer inputs were agreed in
  [the coordination note](./CAMPAIGN_LAB_ADVERTORIAL_RENDER_COORDINATION_20261115.md).

## Reader question and proposed copy

The opening now puts the coffee context back and asks the question the supplied
evidence can answer. The proposed copy is not approved publication copy; the
sources are the approved Morrow product sheet and the approved `flow-control`
lede.

| Slot | Proposed copy | Source | Status |
| --- | --- | --- | --- |
| Headline | “Why this pour-over dripper keeps the filter off the wall” | Product sheet rib sentence plus the approved story; “pour-over dripper” is the approved product noun | Proposed |
| Standfirst | “Three raised interior ribs hold the coffee filter clear of the ceramic wall.” | Product sheet: “Interior: three raised ribs that hold the filter clear of the wall.” | Proposed |
| Story beat 1 | “In the first prototype, the filter sat against the wall.” | Approved `flow-control` lede, first sentence | Approved, unchanged |
| Story beat 2 | “Morrow revised the spacing between the three interior ribs.” | Approved `flow-control` lede, second sentence | Approved, unchanged |
| Product transition | “The finished dripper uses that revised rib spacing: three interior ribs hold the coffee filter clear of the wall.” | Approved story (revised spacing) plus product sheet (three ribs hold the filter clear) | Proposed |
| Fact 1 | “Three ribs” | Product sheet | Approved, unchanged |
| Fact 2 | “Single outlet” | Product sheet | Approved, unchanged |
| Fact 3 | “Ceramic” | Product sheet | Approved, unchanged |
| Disclosure | “Paid advertisement created by Ornigami for Morrow Ceramic. Images are illustrations.” | Disclosure record plus fictional-fixture provenance | Proposed wording; legal review still required |

### Headline evaluation

**“Why this pour-over dripper keeps the filter off the wall”** is adopted for the
local review.

- It restores the coffee context the previous headline lost. The reader knows
  the category before the product block.
- It keeps the approved design fact. It does not claim flavour, extraction,
  brew time, or a comparative result.
- “Keeps the filter off the wall” is a plain-language paraphrase of the product
  sheet’s “hold the filter clear of the wall.” The standfirst and transition use
  the exact source phrase, so the precise wording is not lost.
- The trade-off is that “off the wall” is less exact than “clear of the wall.”
  If the reviewer prefers source-exact copy, the fallback is **“Why this
  pour-over dripper holds the filter clear of the wall.”**

The transition now explains how the prototype change carries into the finished
product. It does not introduce a new performance claim.

## Renderer and CSS changes

- The story is one copy block followed by one evidence row. The row contains
  the approved supporting images in role order:
  `story-opening`, `product-evidence`, `product-detail`, `product-in-use`.
- The Morrow full layout renders `product-evidence` and `product-detail` in one
  two-up row at ≥620 px and as two stacked 2:1 crops below 620 px. The one-photo
  layout renders no supporting image before the product.
- The synthetic pilot with a `product-in-use` asset renders that image in the
  same row. A single supporting image is capped at 560 px so it does not become
  a second hero.
- Each evidence image has a caption from its approved asset record:
  - “Prototype 01 · revised rib spacing.”
  - “Three interior ribs · finished cone.”
  - The pilot’s in-use caption remains “Water poured into the Morrow dripper.”
- The product block keeps all three facts in both layouts. The required fact
  group is atomic; the one-photo optional capacity of two does not truncate it.
- The mobile fact list uses trailing `·` separators, so a wrapped line never
  begins with a divider. At ≥800 px the facts use the vertical rule.
- The dead close-section CSS was removed. The product block remains the only
  action surface.
- The images use `priority` for the first above-fold story image and the
  one-photo packshot.

### Crop and caption pairs

| Image | Mobile crop | ≥620 crop | What the crop keeps | Caption |
| --- | --- | --- | --- | --- |
| Prototype | 2:1, center 50% | 3:2, center 45% | The cone, the `PROTOTYPE 01` label and the `RIB SPACING / REVISED` note | Prototype 01 · revised rib spacing. |
| Ribs | 2:1, center 45% | 4:3, center 38% | The three raised ribs; the in-image label is partly cropped | Three interior ribs · finished cone. |
| In-use pilot image | 2:1, center | 16:9, center | The kettle, pour and dripper | Asset caption |

The ribs crop deliberately relies on the caption for the label that the tighter
crop cuts. The prototype crop keeps its label and note. This was checked in the
375 px and 1440 px captures.

## Before and after

All captures are under ignored local storage:

- `.local/campaign-lab-advertorial/before/` — base fixtures at `f141097`
- `.local/campaign-lab-advertorial/after/` — proposed local pilot, full,
  one-photo, and long-offer cases
- `.local/campaign-lab-advertorial/pilot-rehearsal/` — synthetic pilot intake
  rehearsal

The after run uses the same brief for both layouts. The one-photo run selects
the one-photo layout and removes only the supporting images.

| Viewport | Article width | Full height before → after | Full action before → after | One-photo height before → after | One-photo action before → after | Full extra space after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 320 | 260 | 1,684 → 1,629 | 1,558 → 1,503 | 1,250 → 1,330 | 1,128 → 1,207 | 299 |
| 375 | 315 | 1,703 → 1,629 | 1,577 → 1,503 | 1,170 → 1,275 | 1,048 → 1,153 | 354 |
| 768 | 684 | 1,169 → 1,102 | 1,033 → 970 | 768 → 806 | 642 → 683 | 296 |
| 1440 | 924 | 1,525 → 1,391 | 1,303 → 1,182 | 942 → 977 | 742 → 790 | 414 |
| editor pane, 1024 | 508 | 1,875 → 1,585 | 1,749 → 1,458 | 994 → 1,037 | 872 → 915 | 548 |

The one-photo page grows slightly because the opening copy now carries the
coffee context. The full page shrinks because the two oversized rows became one
tighter evidence row (or two 2:1 crops on mobile). The full layout’s additional
space is now the two captioned evidence images, not duplicated copy or a second
action.

### Long-offer case

Test string, not an approved offer:

> Free shipping through 30 November 2026 on the Morrow ceramic pour-over dripper.

This is the exact approved offer plus the approved product name, used only to
stress wrapping. Captures: `morrow-long-offer-{320,375,768,1440,editor-1024}-full.png`.

| Viewport | Height | First action | Overflow |
| --- | ---: | ---: | --- |
| 320 | 1,673 | 1,547 | none |
| 375 | 1,651 | 1,525 | none |
| 768 | 1,143 | 1,011 | none |
| 1440 | 1,435 | 1,237 | none |
| editor pane, 1024 | 1,607 | 1,480 | none |

## Visual review

### What the reader learns before the product

- The page is an advertisement, created by Ornigami for Morrow Ceramic.
- This is a pour-over dripper whose three raised interior ribs keep the coffee
  filter clear of the ceramic wall.
- The first prototype had the filter against the wall.
- Morrow revised the spacing between the three interior ribs.
- The prototype image shows `PROTOTYPE 01` and the `RIB SPACING / REVISED` note.
- The rib image shows the three interior ribs in the finished cone.
- Only then does the product block name the product, repeat that the finished
  dripper uses the revised spacing, show the packshot, all three facts, the
  exact offer and the single action.

### Fact wrap

At 320 px and 375 px the facts now read:

```text
Three ribs · Single outlet ·
Ceramic
```

The next line starts with `Ceramic`, not a divider. At 768 px the three facts fit
on one line with dots. At ≥800 px they use vertical rules.

### Disclosure, focus, contrast, reflow, destination

- Disclosure is one block above the headline at every width: 76 px at 320,
  57 px at 375, 38 px at 768/1440.
- Contrast: disclosure line **12.23:1**, explanation **5.34:1**, action
  **8.92:1**.
- One action only, in the product block. Destination is exactly
  `https://example.com/morrow`; label is exactly `See the dripper`.
- Keyboard focus is visible on that action with a 3 px ink ring and 3 px offset.
- No article overflow at 320, 375, 768, 1440, or the 508 px editor pane.
- All three fact IDs render in both layouts. The full layout renders
  `product-evidence`, `product-detail`, `product-hero`; the one-photo layout
  renders `product-hero` only.
- The full and one-photo runs have the same headline, story text, facts, offer
  and action at every viewport. The review runner fails if that parity breaks.

### Full layout justification

The full layout adds **one evidence row**: two approved, captioned images. It
does not add copy, a second offer, a second action, or a separate evidence band.
The one-photo remains the pacing reference at every viewport. The full layout's
extra height is now 296–414 px on the measured widths (548 px in the narrow
508 px editor pane), down from 401–881 px before this pass.

## Real-brand test

No real-brand source story or licensed asset set was available. The real-brand
test remains **pending**. The exact gap is recorded in
[`docs/campaign-lab-advertorial-review-real-brand.md`](../campaign-lab-advertorial-review-real-brand.md).

A synthetic pilot (`review-advertorial`) was run twice through the normal pilot
intake as a mechanics rehearsal, not as a real-brand test:

- Incoming promise: “Why the filter sits away from the wall.”
- Material claims: the three product-sheet facts and the two approved story
  beats.
- Approved roles: `product-hero` and `product-in-use`.
- Offer: “Free shipping through 30 November 2026.”
- Destination: `https://example.com/morrow`.
- Full run: 1,307 px at 1440, action at 1,085; roles
  `product-in-use, product-hero`; all three facts.
- One-photo run: 928 px at 1440, action at 728; role `product-hero`; all three
  facts.
- Both runs passed disclosure, fact, role, focus, reflow, destination and
  layout-parity checks.

The synthetic pilot’s fixture label was shortened locally to “Review” because a
long pilot label overflows the editor’s fixture badge at 320 px. That is an
editor-chrome issue, not an article overflow.

## Checks

- `npx tsc --noEmit`: passed.
- Focused ESLint on the renderer, scripts, and tests: passed. CSS is ignored by
  the repository ESLint config.
- Focused campaign-lab tests: **63 passed, 0 failed**.
- Editor capture runner with the Momisa pilot: **200 checks, 0 failed**.
- Review runner (`after`): **15 captures, 0 failed**; includes long-offer cases.
- Pilot-intake rehearsal: **15 captures, 0 failed**; parity passed at all five
  viewports.

## Reproduction

```powershell
# Load the proposed Morrow pilot into ignored local storage
node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs `
  --pilot morrow-review

$env:CAMPAIGN_LAB_PILOT_ID = "morrow-review"
npm run dev -- --port 3004 --hostname 127.0.0.1

node scripts/campaign-lab-advertorial-review.mjs `
  -u http://127.0.0.1:3004 --run after `
  --fixture morrow-review --onePhoto morrow-review `
  --onePhotoLayout advertorial-one-photo
```

The proposed pilot is ignored local storage:
`.local/campaign-lab-pilots/morrow-review/`. Session 1 can adopt the copy from
this handoff without taking the local pilot or its captures.

## Remaining weaknesses

- The proposed headline, standfirst, transition, and captions are fixture copy
  for review, not approved publication copy.
- The ribs image’s in-image `THREE INTERIOR RIBS` label is partly cut by the
  tighter crop; the caption carries it. A reviewer who wants the label legible
  in the image will need a less tight crop and a taller row.
- The full layout still has open space beside the two story paragraphs at 1440.
  The evidence row below fills the width, but the copy column is deliberately
  held to an editorial measure.
- The synthetic pilot’s long fixture label overflows the editor badge at 320.
  This is outside the article renderer and remains an editor-chrome issue.
- No real-brand review was possible. No screen-reader, zoom, physical-device,
  slow-network, or conversion behaviour was tested.
