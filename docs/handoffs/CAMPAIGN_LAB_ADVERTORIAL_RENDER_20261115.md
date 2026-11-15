# Advertorial renderer refinement — handoff

Date: 15 November 2026
Branch: `codex/campaign-lab-advertorial-render-20261115`
Base commit: `8e4a605` (`docs: name the offer-only brief's advertorial gaps`)
Worktree: `C:\Users\joser\.local\ornigami-campaign-lab-advertorial-render`

Status: local review ready. Proposed copy is implemented in the Morrow fixtures
for review, not approved for publication. No live model calls, publishing, or
real-brand fixture were added.

## Worktree note

The requested path,
`C:\Users\joser\.local\ornigami-campaign-lab-advertorial-impl`, was already a
worktree at `8e4a605` but contained uncommitted edits from another session
(including `showClose` and pilot-manifest work). Those changes were left
untouched. This refinement lives in the separate worktree named above so the
two sessions do not overwrite each other.

Session 1's shared brief and section contract remain the source of truth in
`docs/campaign-lab-advertorial-spec.md`. This work does not edit that spec or
`docs/campaign-lab-advertorial-review-morrow.md`.

## What changed

- Both layouts now follow one story: **why the filter sits away from the wall**.
  The headline asks that question, the standfirst answers it with the approved
  rib fact, and the product transition carries the same answer into the product.
- The full layout no longer renders a separate evidence band or an opening
  image. The prototype image sits beside the prototype paragraph and the rib
  detail sits beside the rib-revision paragraph. The two approved facts sit
  with the product. The section order is the contract's allowed
  `fullWithoutEvidence` order:
  `disclosure → opening → story → product → close`.
- The atmospheric pour image is no longer assigned to the full advertorial. It
  did not support a specific paragraph, and it was the main cause of the
  tablet-height stack. The approved asset record remains in the library.
- The one-photo layout is type-led from the first line. Its only image is the
  approved packshot in the product block.
- The disclosure is one compact block at the top: wordmark, `Advertisement`
  label, and one explanation that names the sponsor, creator, paid status, and
  the fact that the images are illustrations. It is not repeated at the close
  or in the footer.
- Captions, visible fact labels, the separate masthead row, the close
  disclosure, the footer disclosure, and the `Body — Ceramic` fact row were
  removed. `Ceramic` remains in the approved product name. Fact labels survive
  for screen readers through visually hidden text.
- The product action and close action still use the contract's single primary
  action: `See the dripper` at `https://example.com/morrow`. No secondary
  action, destination, or offer was added.
- The capture runner now checks 320, 375, 768, 1440, and a 1024 px editor pane,
  and records first-action position, disclosure size, contrast, overflow,
  image count, action count, and keyboard focus.

## Proposed copy and sources

These are proposed copy, not approved publication copy. The underlying facts
are transcribed from the approved Morrow product sheet and the approved
`flow-control` story in the fixture. A reviewer must approve the arrangement
before adoption.

The supplied evidence answers **why the filter sits away from the wall**: the
product sheet says three raised ribs hold it clear. It does not answer “what
changes when your first pour is slower?”; there is no approved flavour,
extraction, brew-time, or performance evidence for that. The proposal therefore
replaces the unanswered pour-speed question with the question the evidence can
actually answer.

This deliberately departs from the Morrow review brief's instruction to reuse
the existing approved opening. It is a review-only proposal and must not be
treated as approved copy until the brand source document, reviewer, and date are
attached.

| Slot | Proposed copy | Source | Status |
| --- | --- | --- | --- |
| Headline | “Why the filter sits away from the wall” | Approved product sheet: “Interior: three raised ribs that hold the filter clear of the wall.”; approved story beat 2 | Proposed |
| Standfirst | “Three raised interior ribs hold it clear.” | Same product-sheet sentence | Proposed |
| Story beat 1 | “In the first prototype, the filter sat against the wall.” | Approved `flow-control` lede, first sentence | Approved, unchanged |
| Story beat 2 | “Morrow revised the spacing between the three interior ribs.” | Approved `flow-control` lede, second sentence | Approved, unchanged |
| Product transition | “The dripper holds the filter clear of the wall the same way.” | Product-sheet rib sentence plus approved story | Proposed |
| Fact 1 | “Three ribs” | Product sheet: “three raised ribs that hold the filter clear of the wall.” | Approved, value unchanged |
| Fact 2 | “Single outlet” | Product sheet: “Outlet: one centred outlet.” | Approved, value unchanged |
| Disclosure | “Paid advertisement created by Ornigami for Morrow Ceramic. Images are illustrations.” | Disclosure record plus the fictional-fixture provenance in `APPROVED_ASSETS` | Proposed wording; legal/publisher review still required |

The body fact was removed from the rendered advertorial because “ceramic” is
already in the approved product name. The approved body claim is unchanged in
the fixture and still appears in the product name. The image set remains
original fictional artwork; the visible disclosure now says so.

## Before and after

All captures are under ignored local storage:
`.local/campaign-lab-advertorial/before/` and
`.local/campaign-lab-advertorial/after/`.

The article width is the preview canvas width inside the editor, not the
browser viewport. The first action is measured from the article top, matching
the editor problem in the brief.

### Full layout

| Viewport | Article width | Height before → after | First action before → after |
| --- | ---: | ---: | ---: |
| 320 | 260 | 2,700 → 1,849 | 2,260 → 1,536 |
| 375 | 315 | 2,757 → 1,868 | 2,348 → 1,555 |
| 768 | 684 | 4,096 → 1,270 | 3,755 → 1,033 |
| 1440 | 924 | 2,195 → 1,632 | 1,906 → 1,303 |
| editor pane, 1024 | 508 | 3,357 → 2,040 | 2,993 → 1,749 |

### One-photo layout

| Viewport | Article width | Height before → after | First action before → after |
| --- | ---: | ---: | ---: |
| 320 | 260 | 1,837 → 1,415 | 1,403 → 1,106 |
| 375 | 315 | 1,742 → 1,335 | 1,339 → 1,026 |
| 768 | 684 | 2,061 → 869 | 1,726 → 642 |
| 1440 | 924 | 1,219 → 1,049 | 958 → 742 |
| editor pane, 1024 | 508 | 1,812 → 1,159 | 1,454 → 872 |

The 768 px improvement comes from removing the opening band and evidence band
and placing the prototype and rib detail beside their paragraphs instead of
stacking four full-width images. The narrow editor pane remains the longest
case because its 508 px canvas still uses the single-column composition, but
its first action moved up by 1,244 px in the full layout and 582 px in the
one-photo layout.

## Visual review

### What the reader learns before the product

- **Full:** the commercial label and sponsor; the question “Why the filter sits
  away from the wall”; the answer “Three raised interior ribs hold it clear”;
  the first prototype had the filter against the wall; Morrow revised the
  spacing between three interior ribs; the prototype image visibly carries
  `PROTOTYPE 01` and `RIB SPACING / REVISED`; the rib image visibly carries
  `THREE INTERIOR RIBS`. Only then does the product block name the product,
  repeat the answer, show the packshot, and pair the offer with the action.
- **One-photo:** the same label and copy, the same two story beats, and the same
  two facts. The copy opens the article; the packshot first appears at the
  product transition. No image frame is empty.

### Evidence support

- The prototype image supports the “first prototype” paragraph and its visible
  `RIB SPACING / REVISED` note supports the revision without a caption.
- The rib image supports the sentence that names the three interior ribs. The
  fact row supports the values `Three ribs` and `Single outlet`.
- The product transition answers the question without claiming flavour,
  extraction, brew time, or a comparative result.

### Disclosure, focus, contrast, reflow

- The disclosure is one block above the headline at every width. At 375 px it
  is 57 px tall; at 768 px and 1440 px it is 38 px tall. There is no close or
  footer repeat.
- The disclosure line is 13.12 px in the captured editor root; the explanation
  is the same size. Measured contrast: label/wordmark **12.23:1**, explanation
  **5.34:1**, primary action **8.92:1**.
- Keyboard Tab reaches both actions in order. Both show a 3 px ink focus ring
  with 3 px offset. `focusVisible` is true for both in every captured viewport.
- No horizontal overflow was observed at 320, 375, 768, 1440, or the 508 px
  editor pane. The capture ran with reduced motion; the same copy, offer, and
  two actions remained.
- The full layout exposes three images (prototype, rib detail, packshot). The
  one-photo layout exposes one. Both use the exact destination, offer, product
  name, and action label.

### Remaining weaknesses

- At 1440 px the story paragraphs are short one-liners beside tall evidence
  images, leaving visible air under each paragraph. The images are doing the
  work; a future pass could crop them tighter only if the visible labels and
  ribs remain legible.
- The product action and close action are close together at 768 px and 1440 px.
  This is the contract's close repeat, not a second destination or label, but a
  reviewer may still prefer the shorter page. Removing the product action would
  break the contract's product-section requirement.
- The narrow 508 px editor pane still needs about two screens to reach the first
  action. It is materially shorter and reflows cleanly, but it is not as compact
  as the 768 px case.
- The proposed headline, standfirst, and transition need editorial approval.
  The underlying fact and story sources are approved fixture sources, not a
  publication source document with a named reviewer and date.
- The review does not prove screen-reader output, zoom, physical-device
  behaviour, slow-network behaviour, or conversion. It also does not prove that
  the fictional fixture artwork is production imagery.

## Repository checks

- `npx tsc --noEmit`: passed.
- Focused ESLint on changed renderer, library, fixture, test, and script files:
  passed.
- `node --experimental-strip-types --test tests/campaign-lab-advertorial.test.mts`:
  12 passed, 0 failed.
- `node scripts/campaign-lab-advertorial-capture.mjs -u http://127.0.0.1:3002`:
  119 checks passed, 0 failed.
- `node scripts/campaign-lab-advertorial-review.mjs -u http://127.0.0.1:3002 --run after`:
  10 captures, 0 failed.
- `npm test`: 991 passed, 13 failed. The 13 failures are in
  `coolify-runtime-acceptance`, `vercel-preview-build-gate`, and
  `staging-synthetic-fixture`; they are Windows `/tmp`/bash-environment and
  pre-existing staging-fixture failures, not campaign-lab advertorial failures.
  The focused campaign-lab tests pass.

## Real-brand test

The second review brief is
[`docs/campaign-lab-advertorial-review-real-brand.md`](../campaign-lab-advertorial-review-real-brand.md).
It is **pending**: the documented public cases (Guardian Labs / Sainsbury's,
NYT / Rolex) supply structure and disclosure observations only, with no media
licence, product offer, or direct destination. The private Momisa pilot has one
packshot with pilot-only rights and placeholder offer/destination, but no
documented story or approved claims. No real-brand fixture or capture was
produced. The brief records the exact inputs needed and keeps private material
under ignored `.local/` storage.

## How to reproduce

```powershell
npm ci
npm run dev -- --port 3002 --hostname 127.0.0.1
node scripts/campaign-lab-advertorial-review.mjs `
  -u http://127.0.0.1:3002 --run after
node scripts/campaign-lab-advertorial-capture.mjs `
  -u http://127.0.0.1:3002
```

Open:

- `http://127.0.0.1:3002/campaign-lab?fixture=morrow-advertorial-full`
- `http://127.0.0.1:3002/campaign-lab?fixture=morrow-advertorial-one-photo`

The proposed copy lives in `src/lib/campaign-lab/fixtures.ts`. If it is
rejected, restore the prior approved opening/transition there and rerun the
focused tests and capture runners; the renderer and section contract do not
need to change.
