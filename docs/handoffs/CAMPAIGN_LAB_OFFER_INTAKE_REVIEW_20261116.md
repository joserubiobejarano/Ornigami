# Offer intake review — 16 November 2026

Status: local, development-only review fixes. No publishing, provider, or loader
work.

- Branch: `codex/campaign-lab-offer-intake-review-session1`
- Base: `e4246c0`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/violet-kiln`
- Entry point: `/campaign-lab/offer`
- Existing Momisa preview: `/campaign-lab?fixture=momisa-glow-box`

## Packshot selection race

### Reproduced before

A slow valid packshot followed immediately by a corrupt PNG left the corrupt
replacement named in the form, but the stale valid file still supplied the
asset. The submit button stayed enabled and the preview opened on revision
`8e18cb347e0467f7`.

Evidence: ignored `.local/offer-intake-review/race-before.json`.

### Fixed

Every file read now carries a monotonically increasing read token. Only the
latest token may:

- create the object URL;
- set the packshot;
- clear or set the read/error state.

Older valid reads are revoked and ignored. Clearing the input invalidates a
pending read. The submit button is disabled while the current read is pending or
invalid.

### After evidence

| Case | Result |
| --- | --- |
| slow valid → corrupt | pending button disabled; corrupt error remains; submit disabled; no preview |
| slow valid → valid | latest file `morrow-ceramic-dripper.webp`; hash matches; submit enabled |
| clear while pending | no stale asset; submit stays on intake with “Choose a local packshot.” |
| corrupt → retry with valid | latest file `harbor-field-bottle.webp`; hash matches; preview opens |

Verified final hashes:

```text
morrow-ceramic-dripper.webp  4a6a4811b830ccfc712da50ef589cf6c6dbc54996ec55dbf5472055f209356b7
harbor-field-bottle.webp     7428586f0fcbd847f741ebfd1415c4ecd38ff0754c831edf6b5fc94a3a609ab2
```

The preview exposes `data-asset-content-hash` and `data-asset-source`; the
approved asset record shows the final filename and rights. Evidence:
`.local/offer-intake-review/race-after-final.json`.

## Brand, verification, and copy

- Added optional operator brand name. When absent, the preview uses a neutral
  `Preview brand` identity with neutral tokens.
- The generated lede is now brand-based and does not repeat a fact:
  `A bottle from Harbor Field.` / `A carafe from Northline Studio.`
- Removed the form copy about internal validation.
- Added an explicit Commercial and media check in the intake and above the
  preview:
  - Offer: entered / provisional.
  - Destination: direct / search-placeholder provisional / invalid.
  - Media: recorded / provisional.
- Amazon search destinations and pending-rights text set the pilot to `preview`,
  keep the verification panel visible, and add a preview footer notice. These
  remain visible through local revision approval.
- Refresh behavior is explicit: the local session clears the brief and local
  approval on refresh.

## Article layout

- On narrow screens, the exact offer and action now render before supporting
  facts in the offer-led composition. Desktop keeps the prior hierarchy.
- The repeat CTA renders only when the page earns it: editorial/long copy keeps
  the close row; short offer-led pages render one action.
- `data-role="lede"` was added for deterministic review reads.

## Two-brief browser verification

Both briefs were checked at 375 and 1440 px.

| Brief | Layout | Actions | Exact offer / destination | Asset identity |
| --- | --- | ---: | --- | --- |
| Harbor Field bottle | offer-led one photo | 1 | `20% off, 27–30 November 2026` / `https://example.com/harbor-field` | `harbor-field-bottle.webp`, hash matches |
| Northline ceramic carafe | editorial long copy | 2 | long offer / Amazon search placeholder | `morrow-ceramic-dripper.webp`, hash matches |

Additional results:

- Initial and updated revisions looked identical across widths.
- Editing Offer cleared approval and disabled the button.
- Generating and approving the updated revision succeeded:
  - Harbor `4784d0fad890bca5` → `ad4353cfb9d70fca`.
  - Northline `64306bf4f6b39106` → `3ee997b8ddfa402e`.
- Keyboard Tab reached the action with a visible 3 px focus outline.
- Provisional destination/media statuses persisted before and after approval.
- No browser console errors.

Evidence: `.local/offer-intake-review/two-briefs.json`.

## Advertorial runner

Fixed all 11 `page.waitForFunction` calls so timeout options are passed in the
third argument, not as the page-function argument.

Reruned the ignored QA packages:

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-duplicate-assignment-qa `
  --url http://127.0.0.1:3230 --no-prepare `
  --out .local/offer-intake-review/unused-image

node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --real-brand review-broken-media-qa `
  --url http://127.0.0.1:3230 --no-prepare `
  --out .local/offer-intake-review/broken-packshot
```

- Unused-image package: passed. `review-opening` is reported unused in full;
  `review-use` and `review-opening` are unused in one-photo.
- Broken-packshot package: failed as required. `review-hero` is `0x0`,
  `decode=false`; approval stays disabled in both layouts.

## Captures

Article-only captures with site/editor chrome removed:

```text
.local/offer-intake-review/captures/
  harbor-offer-375-article.png
  harbor-offer-1440-article.png
  northline-carafe-375-article.png
  northline-carafe-1440-article.png
```

At 375 px the offer and action appear before supporting facts. The long offer
keeps its editorial detail band and repeat CTA. At 1440 px the product split
keeps the packshot, offer, and action together.

## Checks

- TypeScript: passed.
- Focused ESLint: passed.
- Campaign Lab tests: **87 passed, 0 failed**.
- Existing offer-page regressions: **144 passed, 0 failed, 0 pending**.

## Remaining pilot issues

Momisa remains a preview pilot. Its `30% off` offer and Amazon search URL are
placeholder commercial inputs, its media rights are pending, and it still lacks
a confirmed direct listing, approved story/disclosure, supporting media, and
confirmed pilot status. Those inputs must not be treated as publication-ready.

The browser intake remains intentionally ephemeral: refresh clears the brief and
local approval. The operator brand identity is currently a name/wordmark with
neutral tokens; brand-token intake is not part of this local entry point.

## UX / DX / AX check

- **UX:** The operator sees the current packshot state, explicit commercial/media
  verification, a neutral or named brand preview, and approval tied to the exact
  revision; checked the existing offer edit/approval and Momisa pending labels.
- **DX:** The intake still builds the existing fixture/catalog shapes and reuses
  `CampaignLab`, the renderer, fact groups, and revision hash; checked the current
  offer fixtures and advertorial QA packages.
- **AX:** Field-level errors, read-state gating, stable data attributes, and the
  corrected wait timeouts make the browser path deterministic and recoverable.
