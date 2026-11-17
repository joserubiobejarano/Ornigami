# Momisa alternative visual direction — 17 November 2026

Status: local, development-only. This is not brand approval and not publication
approval.

- Source: commit `6906f5c` and the approved local Momisa export. The exact
  export revision and commercial values are recorded in the ignored local
  brief.
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/momisa-taste-direction`
- Branch: `codex/momisa-taste-direction`
- Experiment route: `/campaign-lab/direction` (development-only)
- Local comparison: `.local/momisa-direction/comparison/index.html`
- Momisa inputs, approved export, and captures: `.local/momisa-direction/`
  (Git-ignored)

## What was created

One alternative visual direction, presented against the approved export at
375 px and desktop with neutral A/B labels:

| Label | Direction |
| --- | --- |
| A | Reference — the approved local export, cropped from its own captures |
| B | Alternative — “Apricot Atelier” |

The comparison keeps the exact approved product, offer, Amazon destination,
facts, CTA label, and packshot. Only presentation changes.

## Direction summary

The alternative draws its character from the approved packshot instead of a
neutral offer card:

- apricot paper, deep green ink, and the pack’s rose/peach world;
- EB Garamond display type with Jost body type (on-demand Taste product-page
  deal);
- lowercase serif `momisa` wordmark, sentence-case fact labels;
- a square, hairline product field with `multiply` so the white packshot ground
  becomes the page;
- headline/offer first on mobile, image left and copy right on desktop;
- an editorial, rule-bound offer set in the display face, directly above the
  single action;
- a 2 px rectangular action instead of a pill.

The reference remains the approved product-first framed composition with Inter,
uppercase labels, the tinted offer block, and the pill action.

## Renderer and tokens

The direction uses the existing `CampaignPage` renderer and existing
`BrandTokens` for colour, display/body faces, tracking, label case, radii, image
blend, hero order, and section choice.

One optional token was added:

```ts
offerStyle?: "tint" | "editorial";
```

- Default is `tint`; existing brands and revisions are unchanged.
- `editorial` adds the rule-bound display-type offer.
- The token joins `calculateDraftRevision` only when non-default, so an
  approved revision is invalidated when the offer treatment changes.

The main editor UI is unchanged. The experiment route is isolated and returns
404 outside development.

## Files

- `src/app/campaign-lab/direction/` — local route, renderer wrapper, asset
  route, and comparison layout.
- `src/lib/campaign-lab/directions/momisa-direction.ts` — approved brief
  projection and the two token sets.
- `src/components/campaign-lab/campaign-page.tsx` and `.module.css` — optional
  editorial offer branch.
- `src/lib/campaign-lab/types.ts`, `template.ts` — optional token and revision
  participation.
- `scripts/capture-momisa-direction.mjs` — Playwright capture and local
  comparison writer.
- `tests/campaign-lab-direction.test.mts` — identity and token coverage.

## Verification

- `npx tsc --noEmit`: passed.
- Focused ESLint on the changed files: passed.
- All campaign-lab tests: **117 passed, 0 failed**.
- Capture: **45 checks passed, 0 failed**:
  - exact product, offer, destination, CTA, and facts;
  - exact packshot alt text, hash-pinned bytes, and 2500 × 2500 dimensions;
  - 315 px mobile / 924 px desktop article widths;
  - no horizontal overflow;
  - action and full product inside the first mobile screen;
  - reference Inter vs alternative EB Garamond/Jost;
  - editorial offer rules and sentence-case labels;
  - no console errors.

The reference presentation images are cropped from the approved export
screenshots. A separate renderer diagnostic differs by 3.8% at 375 px and 1.37%
at desktop, mainly image resampling and a 1 px height rounding. It is recorded
in `captures/report.json` and is not a comparison gate.

## What is not proven

- Momisa has not approved the palette, type pairing, wordmark casing, offer
  treatment, square CTA, or `multiply` product treatment.
- Only one approved packshot is available; no lifestyle, detail, pouch, or use
  image was used.
- The comparison is Chromium at device scale 1. It does not prove other
  browsers, physical devices, high-DPI, zoom, screen-reader behavior, or
  conversion.
- The alternative’s message-first mobile order is a trade-off, not a proven
  improvement. The product is fully visible in the measured first screen but is
  not the first element.
- No publication, deployment, provider call, or commit of Momisa inputs or
  captures is part of this change.

## Local review

Open `.local/momisa-direction/comparison/index.html`, then record an A/B choice
in `choice.md`. The change log and A/B key are separate so the first visual
pass stays neutral.
