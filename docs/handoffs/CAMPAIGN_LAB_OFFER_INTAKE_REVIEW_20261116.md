# Offer intake review — 16 November 2026

Status: local, development-only review fixes. No publishing, provider, or loader
work.

- Branch: `codex/campaign-lab-offer-intake-review-session1`
- Session 2 base: `58752e7` (`Harden offer intake packshot reads and verification`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/violet-kiln`
- Entry point: `/campaign-lab/offer`
- Existing Momisa preview: `/campaign-lab?fixture=momisa-glow-box`

## Session 2: shared brief and exact verification

### The intake and editor share the current brief

`CampaignLab` now reports its editor snapshot to the intake through
`onEditorStateChange`. The snapshot carries the current form values, the rendered
revision, a dirty flag, and the exact values that produced that revision.

The intake mirrors product name, offer, and destination into its own form state.
Returning with **Edit brief inputs** therefore preserves the latest edited offer
and destination instead of restoring the values from the original submission.
Changing offer or destination in the editor clears that field's operator
confirmation.

### Explicit operator confirmations

The intake now has three checkboxes that bind to the exact trimmed values:

- I confirm these exact offer terms.
- I confirm this exact destination.
- I confirm these media rights.

Each checkbox stores the value it confirmed. Editing the matching field,
selecting a new packshot, or changing the matching value in the editor clears
that confirmation. A confirmation never overrides a placeholder, search URL, or
pending-rights classification: those stay provisional even when checked.

### Verification is bound to values and revision

The Commercial and media check is visible in the intake and above the preview.
It reports:

- Offer: missing / provisional / entered.
- Destination: missing / invalid / search-placeholder provisional / direct.
- Media: missing / provisional / recorded.
- The exact value for each item.
- The rendered revision and whether the displayed values are rendered or still
  pending regeneration.

Before the first preview the panel says **Not rendered yet**. When the editor has
unsaved edits it keeps the last revision, shows the current values, and labels
them **current values pending regeneration**. After **Generate preview** it shows
the new revision and its rendered values.

Local approval remains available for provisional inputs. A placeholder offer,
Amazon search destination, or pending-rights value keeps its status visible in
the verification panel and in the article footer before and after approval.

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

### Rechecked after session 2

| Case | Result |
| --- | --- |
| slow valid → corrupt | pending button disabled; corrupt error remains; submit disabled; no preview |
| slow valid → valid | latest file `morrow-ceramic-dripper.webp`; hash matches; submit enabled |
| clear while pending | no stale asset; submit stays on intake with “Choose a local packshot.” |
| corrupt → retry with valid | latest file `harbor-field-bottle.webp`; hash matches; preview opens |

Verified hashes:

```text
morrow-ceramic-dripper.webp  4a6a4811b830ccfc712da50ef589cf6c6dbc54996ec55dbf5472055f209356b7
harbor-field-bottle.webp     7428586f0fcbd847f741ebfd1415c4ecd38ff0754c831edf6b5fc94a3a609ab2
```

The preview exposes `data-asset-content-hash` and `data-asset-source`; the
approved asset record shows the final filename and rights. Evidence:
`.local/offer-intake-review/race-after-final.json`.

## Brand, copy, and article layout

- Added optional operator brand name. When absent, the preview uses a neutral
  `Preview brand` identity with neutral tokens.
- The generated brand lede is retained for brief validation but hidden from the
  article with `ApprovedCopy.hideLede`. `A bottle from Harbor Field.` no longer
  repeats the masthead or adds information.
- Offers longer than 68 characters get a concise headline cut at
  `through`, `until`, `when`, or `on`. The exact approved offer remains intact
  next to the primary action.
- In the offer-led composition, the DOM and visual order are now consistently
  headline → offer → action → facts. The old CSS `order` workaround was removed,
  so the reading order matches the visual order at narrow and wide widths.
- The repeat CTA renders only when the page earns it: editorial/long copy keeps
  the close row; short offer-led pages render one action.
- `data-role="offer"`, `data-role="action"`, `data-role="lede"`, and the asset
  identity attributes make the review deterministic.

## Confirmed → placeholder → confirmed

The full loop was reproduced in Chromium at 1440 px. Evidence:
`.local/offer-intake-review/session2/verification.json`.

| Step | Verification | Revision | Approval |
| --- | --- | --- | --- |
| Confirmed intake | offer entered, direct destination, media recorded | `0d629bbeae866b0b` | approved |
| Edit Offer to `30% off, placeholder terms` | offer provisional, `pending regeneration`; article still shows the confirmed offer | `0d629bbeae866b0b` unchanged | approval disabled |
| Generate preview | offer provisional with rendered placeholder values | `ce0c363e34d00b92` | approved; footer keeps `Preview · offer provisional` |
| Edit brief inputs | placeholder offer and original destination preserved; offer confirmation unchecked; destination and media confirmations retained | no revision | n/a |
| Restore confirmed offer and re-confirm | offer entered, direct destination, media recorded | `0d629bbeae866b0b` | approved |

Revision is content-addressed. Restoring the exact confirmed values produces the
same revision as the first confirmed preview; that is expected and helps prove
the brief is deterministic.

Editing each intake field was also checked directly: changing offer, destination,
or media rights cleared only that field's confirmation and left the other two
checked.

## Captures and two-brief verification

Both offers were checked at 375 and 1440 px with matching product names and
packshots:

| Brief | Packshot | Layout | Actions | Headline |
| --- | --- | --- | ---: | --- |
| Harbor Field travel bottle, short offer | `harbor-field-bottle.webp` | offer-led one photo | 1 | `20% off the bottle.` |
| Morrow ceramic dripper, long offer | `morrow-ceramic-dripper.webp` | offer-led one photo | 1 | `Free shipping plus a matching carafe.` |

The long offer was:

```text
Free shipping plus a matching carafe through 30 November 2026 when you order the complete pour-over set
```

At both widths, every capture reported:

- exact offer text and exact destination URL;
- the action directly after the offer (`previousSiblingRole: "offer"`);
- DOM order `headline → offer → action → facts`;
- offer and action above the facts visually as well as in the DOM;
- no lede element;
- the expected asset filename and SHA-256;
- a loaded image with non-zero natural dimensions;
- no horizontal overflow and no browser console errors.

Article-only captures with site chrome and cookie UI removed:

```text
.local/offer-intake-review/session2/
  harbor-short-375-article.png
  harbor-short-1440-article.png
  morrow-long-375-article.png
  morrow-long-1440-article.png
```

## Acceptance runner hardening

The offer acceptance runner could read the baseline before a cold-start
generation answered, because its wait predicate was already satisfied by the
pre-existing preview. That produced a spurious `approve-preview` failure and a
false unrelated-copy diff when the generated revision selected two facts instead
of the initial deterministic three.

The runner now waits for the form to leave its `aria-busy` generation state after
each valid **Generate preview** click, before reading approval or the preview
snapshot.

## Advertorial runner

Fixed all 11 `page.waitForFunction` calls in
`scripts/campaign-lab-review-acceptance.mjs` so timeout options are passed in the
third argument, not as the page-function argument. The prior session verified:

- Unused-image package: passed. `review-opening` is reported unused in full;
  `review-use` and `review-opening` are unused in one-photo.
- Broken-packshot package: failed as required. `review-hero` is `0x0`,
  `decode=false`; approval stays disabled in both layouts.

The advertorial renderer was not changed in session 2, so those results remain
the current evidence for that surface.

## Checks

- TypeScript: passed.
- Focused ESLint: passed.
- Campaign Lab tests: **89 passed, 0 failed**.
- Existing offer-page regressions: **144 passed, 0 failed, 0 pending**.
- Packshot race cases: all four expected outcomes passed.
- Confirmed → placeholder → confirmed: all steps passed.

## Remaining operator issues

Momisa remains a preview pilot. Its `30% off` offer and Amazon search URL are
placeholder commercial inputs, its media rights are pending, and it still lacks
a confirmed direct listing, approved story/disclosure, supporting media, and
confirmed pilot status. Those inputs must not be treated as publication-ready.

The browser intake remains intentionally ephemeral: refresh clears the brief and
local approval. The operator brand identity is currently a name/wordmark with
neutral tokens; brand-token intake is not part of this local entry point.

The concise long-offer headline is generated by clause splitting. An offer that
does not use `through`, `until`, `when`, or `on` may need an operator-written
headline before publication. The local intake has no headline override yet.

When the editor has unsaved changes, the verification panel shows the current
values with **current values pending regeneration** rather than pretending they
are the rendered revision. Operators must regenerate before approving the new
values.

## UX / DX / AX check

- **UX:** The operator sees the current packshot state, exact confirmations,
  rendered values and revision, a neutral or named brand preview, and approval
  tied to the exact revision; checked the offer edit/approval loop and Momisa
  pending labels.
- **DX:** The intake still builds the existing fixture/catalog shapes and reuses
  `CampaignLab`, the renderer, fact groups, and revision hash; the acceptance
  runner now waits for generation completion instead of racing a cold server.
- **AX:** Field-level errors, read-state gating, stable data attributes, native
  checkboxes with exact-value labels, and deterministic DOM/visual order make the
  browser path recoverable and reviewable.
