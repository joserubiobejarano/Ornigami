# Momisa direction B revision — 17 November 2026

Status: local, development-only. Not brand approval and not publication
approval. The direction remains experimental until the user or Momisa selects
it.

- Source: commit `6906f5c` and the approved local Momisa export.
- Previous experiment: `a35c178` on `codex/momisa-taste-direction`.
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/momisa-taste-direction`
- Local review: `.local/momisa-direction/comparison/index.html`
- Inputs and captures: `.local/momisa-direction/` (Git-ignored)

## What changed

B retains its EB Garamond/Jost typography, apricot palette, rectangular CTA,
and desktop image-left composition. This revision changes:

- **Mobile order:** headline → product → complete offer → CTA → facts, in both
  DOM and visual order. The image now sits between the headline and the
  commercial block.
- **Price role:** the reviewed final price is a larger inline accent inside the
  same approved offer sentence. The offer text is unchanged and is not
  duplicated.
- **Packshot:** normal blending on a warm photo mat (`#fbf4ea`) with an 8 px
  inset and square hairline frame. The mobile max-height crop is removed for the
  product-second frame, so the whole square packshot shows at 320, 375, and the
  200% zoom equivalent.
- **Desktop scope:** the experiment’s 1.08 / 0.92 image-left grid is scoped to
  `.productSecond`. Existing headline-first offer layouts return to their
  previous 0.92 / 1.08 geometry.

Typography, palette, wordmark, labels, CTA shape, facts, product, offer,
destination, and packshot bytes are unchanged.

## Renderer changes

New optional `BrandTokens`:

- `mobileHeroOrder?: "support-first" | "product-second"`
- `offerPriceEmphasis?: boolean`
- `imageInset?: string`

`CampaignPage` renders a separate headline block and support block only for the
product-second experiment. The new tokens participate in
`calculateDraftRevision` only when non-default, so existing revisions remain
unchanged. The main editor UI and pilot manifest are not changed.

## Regression proof

No shipped fixture combines headline-first with the offer-led layout. The probe
uses the existing Harbor Field sparse fixture and the existing headline-first
token. “Before” was captured from a detached `a35c178` worktree; “after” is the
scoped code.

| Measurement | Before | After |
| --- | --- | --- |
| Image column | 423 px | 361 px |
| Copy column | 361 px | 423 px |
| Article height | 745 px | 672 px |

Evidence is under `.local/momisa-direction/comparison/regression/`. The existing
geometry is restored; the experiment does not leak into the shared
headline-first offer layout.

## Verification

`node scripts/capture-momisa-direction-revision.mjs`:
**85 passed, 0 failed**.

Checked at 320, 375, 1440, and a 200% zoom equivalent (720 CSS px at DPR 2):

- exact product, offer, Amazon destination, CTA label, and facts;
- exact packshot alt text, 2500 × 2500 natural dimensions, and served-byte
  SHA-256;
- article widths 260 / 315 / 924 / 652 px;
- no horizontal overflow;
- normal blending, 8 px mat, and the approved-price style;
- EB Garamond display and offer type, Jost body/action type;
- visual and DOM order headline → product → offer → action → facts at mobile
  and zoom widths;
- image left of the copy at 1440;
- first Tab reaches the exact CTA with a 3 px solid ink ring and 3 px offset;
- regression geometry restored;
- no console errors.

`npx tsc --noEmit` and focused ESLint pass. The campaign-lab test suite remains
green.

## Local review

- `index.html` — A reference, B original, B revised, responsive/interaction
  evidence, regression proof, and change table.
- `changes.md` — intentional changes and purposes.
- `limitations.md` — brand, technical, and test limits.
- `review.md` / `choice.md` — scoring and decision record.
- `neutral-original.html` — the previous neutral A/B page.

## Not proven

- Brand approval of the palette, type, lowercase wordmark, price treatment,
  photo mat, or scoped grid.
- Packaging truth against the physical box.
- Real browser zoom, Safari/Firefox, physical devices, screen readers, motion,
  conversion, or live Amazon navigation.
- A shipped headline-first offer fixture; the regression probe is the closest
  existing material.

No publication, deployment, provider call, or commit of Momisa inputs or
captures is part of this change.
