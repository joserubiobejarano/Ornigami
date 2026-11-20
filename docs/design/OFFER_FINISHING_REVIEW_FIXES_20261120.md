# Offer emphasis finishing-review fixes — 20 November 2026

Bounded correction to the accepted direct-offer finishing pass. This is not a
visual redesign and does not change the review-only merge.

- Branch: `codex/ornigami-offer-finishing-review-fixes-20261120`
- Base: `12a276635dcd1547bd9323692534545e2e8430ec`
- Implementation commit: `b7cd44f8dd054ff3f2d8186cc510e74768d78e35`
- Scope: renderer CSS, emphasis color resolution, revision identity and focused
  verification. No runtime, auth, proxy, layout, dependency, budget, storage or
  central roadmap/current-state changes.

## F1 — long reviewed emphasis now wraps in every offer treatment

The base `.offerPrice` no longer uses `inline-block`/`nowrap`. Every offer
treatment now owns wrapping:

- `.offerPrice` uses inline flow, `white-space: normal` and
  `overflow-wrap: anywhere`. Product focus keeps its larger/heavier type
  treatment without owning the wrapping rule.
- `.offerText` and the closing `.closeOffer` wrap long unbroken approved text.
- The desktop closing action can shrink within the article instead of forcing
  the archive wider than its canvas.

The full approved offer and the exact reviewed substring are still rendered;
nothing is truncated, shortened or hidden.

Measured in the ordinary `/campaign-lab/offer` editor at 375 px:

| Case | Article client/scroll | Offer client/scroll | Emphasis rects outside offer |
| --- | --- | --- | --- |
| Clear default, long emphasis | 315 / 315 px | 272 / 272 px | 0 |
| Clear Product focus, long emphasis | 315 / 315 px | 272 / 272 px | 0 |
| Editorial default, long emphasis | 315 / 315 px | 272 / 272 px | 0 |
| Editorial Product focus, long emphasis | 315 / 315 px | 272 / 272 px | 0 |

At 320, 375, 768 and 1440 px, every tested case had equal article and offer
client/scroll widths and zero text rects outside the offer content box. Product
focus desktop headline-to-offer separation remained 24 px.

## F2 — pale accents resolve a readable emphasis foreground

`offerEmphasisInk` is derived from the final resolved tokens:

1. keep the reviewed `accent` when it meets 4.5:1 on the active offer
   background (accent tint, or the page for the editorial offer);
2. otherwise use the approved body `ink`;
3. otherwise use an app-owned dark/light foreground.

The reviewed accent itself, the page/surface palette and commercial content are
unchanged. Imported-palette contrast validation is unchanged and still rejects
an unreadable reviewed accent; accent-only inputs without a snapshot now receive
a readable dependent text color instead of a 1:1 result.

Reproduced input `Black Friday offer: $9`, emphasis `$9`, accent `#f4eee4`:

| Surface | Resolved emphasis ink | Contrast |
| --- | --- | --- |
| Clear, default/Product focus, 375 px preview | `#1f2a24` | 13.38:1 |
| Editorial, default/Product focus, 375 px preview | `#1f2a24` | 12.23:1 |
| Exported standalone page, 375 and 1440 px | `#1f2a24` | 13.38:1 |

Accent `#ffffff` also resolves above 12:1. Normal reviewed accents (`#9a3f25`,
`#2f5d4a`, `#234a6b`) remain the emphasis foreground.

## Version and receipts

- Template remains `single-product-offer` `1.0.1`.
- Product focus remains `1.1.0`.
- Visual direction remains `1.0.0`.
- Rendered identity is now **7**. The effective `offerEmphasisInk` participates
  only when emphasis is active. Historical v6 receipts remain readable but do
  not reproduce this pixel result.
- Receipt schema remains version 1. `appearance.offerEmphasisInk` is optional
  and additive when emphasis is active.
- Export HTML/receipt agreement checks the effective emphasis ink as well as the
  exact offer substring.

## Verification

Actual browser run on Windows x64, Chromium `158.0.8127.18`:

- 4 combinations: Clear/Editorial × default/Product focus.
- 5 cases: long phrase emphasis, `$9` with `#f4eee4`, `$9` with `#ffffff`,
  150-character unbroken text, omitted emphasis.
- 4 widths: 320×812, 375×812, 768×1024, 1440×900.
- **569 checks passed, 0 failed**; 20 render cases; 160 normal-height
  viewport/article screenshots.
- Three ZIP exports, 14 files each, revisions `1387b90006388763`,
  `7b352c6471503249` and `600caccc36fc10a9`. Each archive passed:
  receipt/HTML/render revision agreement, exact offer and emphasis text,
  preview/export wrapping and contrast agreement, packshot hash, receipt file
  hash, CRC, duplicate/path checks and complete local font/license inventory.
- Editing emphasis after approval cleared approval and disabled export; the
  regenerated/freshly approved export has a different revision and the new exact
  text.
- All Campaign Lab suites: **357 passed, 0 failed** (346 `.test.mts` + 11
  Campaign Lab `.test.mjs`). The existing campaign-eval suites added 18 more
  affected checks (375 total). TypeScript passed, focused ESLint reported no
  errors, offline build and production smoke passed.

Evidence (Git-ignored):

- `.local/emphasis-fixes/index.html` — screenshot gallery
- `.local/emphasis-fixes/results.json` — measurements and checks
- `.local/emphasis-fixes/screenshots/` — 160 captures
- `.local/emphasis-fixes/downloads/` and `extracted/` — ZIPs and audits
- `.local/emphasis-fixes-verify.mjs` — reproduction/verification script

Key normal-height captures:

- `clear-default-long-emphasis-375x812-viewport.png`
- `clear-product-long-emphasis-375x812-viewport.png`
- `editorial-default-long-emphasis-375x812-viewport.png`
- `editorial-product-long-emphasis-768x1024-viewport.png`
- `clear-default-short-pale-f4-375x812-viewport.png`
- `editorial-default-short-pale-white-375x812-viewport.png`
- `clear-default-unbroken-320x812-viewport.png`
- `clear-default-unbroken-1440x900-article.png`

The offline build's event log again recorded four denied Sentry HTTPS attempts,
as in the independent review. They were blocked; the build passed, but
network-quiet build qualification is not claimed.

## Limits

Agent-operated local Chromium evidence only. Physical devices, other engines,
native file playback, hosted deployment, publication, independent customer
usability and owner visual adoption remain unassessed. No paid calls, external
collection, deployment, account changes or publication were performed.
