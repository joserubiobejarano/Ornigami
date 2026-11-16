# Safe direct-offer headlines - 17 November 2026

Status: local, development-only. This is not publication approval.

- Branch: `codex/campaign-lab-safe-offer-headlines-20261117`
- Base: `40800aa` (`Derive conditional offer headlines from the current brief`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/safe-offer-headline`
- Entry point: `/campaign-lab/offer`

## Reproduced before

At both 375 and 1440 px, the browser intake produced this preview for:

```text
20% off, members only
```

| Headline | Offer next to CTA | Status | Revision |
| --- | --- | --- | --- |
| `20% off the bottle.` | `20% off, members only` | confirmed | `09de39da017fc216` |

The headline claimed a 20% discount without saying the offer was limited to
members. The exact offer was already correct next to the CTA, so the defect was
the headline claim rather than the terms block.

The same shortening occurred for `20% off, US customers only` in the Node
reproduction. The existing conditional detector knew about thresholds, codes,
exclusions and purchase requirements, but not membership or regional words.

Evidence:

```text
.local/offer-intake-review/browser-before/
  before-membership-375.png
  before-membership-1440.png
  result.json
```

## Fix

### Default to the product name

Automatic offer-led headlines are now reserved for a narrow, fully parsed
subset: one percentage or currency discount, optionally followed by a plain
date window.

The renderer still shortens:

```text
20% off
20% off, 27-30 November 2026
20% off through 30 November 2026
$10 off, 27-30 November 2026
```

Everything else uses the product name:

```text
20% off, members only
20% off, US customers only
20% off orders over $50
50% off your first order when you spend $75 or more, excluding gift cards and sale items
Free shipping on orders over $75
20% off with code SAVE20
Buy one, get one free
20% off everything
20% off, 27-30 November 2026, while stocks last
20% off, 27-30 November 2026, online only
```

The old 68-character shortcut that removed the product noun is gone. If a
candidate headline is still longer than 180 characters, the product name is the
fallback. No valid intake offer can produce an over-limit headline.

### Exact offer stays by the action

The exact offer continues to render immediately before the primary CTA in the
hero and next to the closing action. The headline is not used to carry the full
terms.

### Operator hint

The intake now states the rule under the Offer field:

> Automatic headlines only shorten a simple discount, optionally dated. Any
> other terms keep the product name, and the exact offer stays beside the CTA.

## Browser verification

Chromium 158.0.8127.18, exact viewports 375 x 900 and 1440 x 1000. Each case
started from the browser intake with a real local packshot upload and all offer,
destination and media confirmations checked.

| Case | Width | Offer length | Headline | Offer next to CTA | Status | Revision |
| --- | ---: | ---: | --- | --- | --- | --- |
| Membership | 375 | 21 | `Harbor Field travel bottle` | exact | confirmed | `df3ac54bbd74e94f` |
| Membership | 1440 | 21 | `Harbor Field travel bottle` | exact | confirmed | `df3ac54bbd74e94f` |
| Regional | 375 | 26 | `Harbor Field travel bottle` | exact | confirmed | `db0f29075148c041` |
| Regional | 1440 | 26 | `Harbor Field travel bottle` | exact | confirmed | `db0f29075148c041` |
| Minimum spend | 375 | 23 | `Harbor Field travel bottle` | exact | confirmed | `ee441d7dcba82720` |
| Minimum spend | 1440 | 23 | `Harbor Field travel bottle` | exact | confirmed | `ee441d7dcba82720` |
| Dated discount | 375 | 28 | `20% off the bottle.` | exact | confirmed | `0456a71e3f79051c` |
| Dated discount | 1440 | 28 | `20% off the bottle.` | exact | confirmed | `0456a71e3f79051c` |
| 180-character conditional | 375 | 180 | `Harbor Field travel bottle` | exact, 180 chars | confirmed | `e26ea96ed3b37651` |
| 180-character conditional | 1440 | 180 | `Harbor Field travel bottle` | exact, 180 chars | confirmed | `e26ea96ed3b37651` |

The four required checks were:

- **Membership:** `20% off, members only` uses the product name; the exact
  membership qualifier remains next to the CTA.
- **Regional eligibility:** `20% off, US customers only` uses the product name;
  the exact region remains next to the CTA.
- **Minimum spend:** `20% off orders over $50` uses the product name; the
  threshold remains next to the CTA.
- **Simple dated discount:** `20% off, 27-30 November 2026` keeps the short
  offer-led headline; the exact date window remains next to the CTA.

Every measured page had `documentScrollWidth` equal to the viewport width
(375 or 1440) and `canvasScrollWidth` equal to the canvas client width
(315 or 924). There was no horizontal overflow at either width.

### 180-character boundary

The 180-character conditional offer:

```text
50% off your first order when you spend $75 or more, excluding gift cards and sale items, plus free returns for the launch season and future refills ordered directly from our team.
```

rendered at both widths with:

- headline `Harbor Field travel bottle` (26 characters);
- the exact 180-character offer next to the CTA;
- status `confirmed`;
- no overflow.

A 181-character offer was rejected by the intake with `Use 180 characters or
fewer.` and no preview rendered.

### 50%-off to free-shipping revision

Starting with the confirmed 50% offer at either width:

```text
50% off your first order when you spend $75 or more, excluding gift cards and sale items
```

| Step | Headline | Offer next to CTA | Status | Dirty | Revision |
| --- | --- | --- | --- | --- | --- |
| Confirmed | `Harbor Field travel bottle` | exact 50% terms (88 chars) | confirmed | false | `3955f850213eac2f` |
| Edit to `Free shipping on orders over $75` without regenerating | `Harbor Field travel bottle` | still the rendered 50% terms | confirmed | true | `3955f850213eac2f` |
| Generate the free-shipping revision | `Harbor Field travel bottle` | `Free shipping on orders over $75` | preview | false | `4f2ead9d7bc6a928` |

Before regeneration, the pending block showed:

```text
Pending edits - not rendered
The preview and footer still describe revision 3955f85021. Approval is cleared
for pending edits. Generate preview to validate these values.
OFFER Offer provisional - Free shipping on orders over $75
```

After regeneration, the footer and preview badge said `preview` because the
edited offer no longer matched the confirmed intake terms. The exact
free-shipping offer was next to the CTA.

## Captures

```text
.local/offer-intake-review/browser-after/
  after-membership-375.png
  after-membership-1440.png
  after-regional-375.png
  after-regional-1440.png
  after-minimum-spend-375.png
  after-minimum-spend-1440.png
  after-dated-375.png
  after-dated-1440.png
  after-anniversary-180-375.png
  after-anniversary-180-1440.png
  after-fifty-off-confirmed-375.png
  after-fifty-off-confirmed-1440.png
  after-fifty-off-pending-free-shipping-375.png
  after-fifty-off-pending-free-shipping-1440.png
  after-free-shipping-revision-375.png
  after-free-shipping-revision-1440.png
  after-over-180-rejected-375.png
  *-preview.png
  result.json
```

The `*-preview.png` files crop to the campaign page so the headline, offer, CTA
and footer status can be reviewed without the editor chrome. The `result.json`
file records each measured headline, offer length, DOM order, status, revision,
viewport width, scroll width and canvas width.

## Checks

- Focused Campaign Lab tests: **27 passed, 0 failed**.
- TypeScript: passed.
- Focused ESLint: passed.
- Full suite: **1047 passed, 3 failed**. The three failures are in
  `tests/staging-synthetic-fixture.test.mjs` and reproduce unchanged at base
  `40800aa` in the existing `direct-offer-conditional` worktree. They are not
  caused by this change.
- Browser verification: membership, regional, minimum spend, dated discount,
  180-character boundary, 181-character rejection, and the 50% to free-shipping
  revision all passed at both inspected widths.

## Operator rehearsal

### Momisa inputs are still pending

No confirmed Momisa promotion terms and market, direct Amazon product listing,
or packshot permission were available. The existing local Momisa package still
contains:

- a `30% off` Black Friday placeholder offer;
- an Amazon search URL, not a direct listing;
- a packshot marked pilot use only with media rights pending.

Therefore no real Momisa terms were used for the rehearsal.

### Fixture

A clearly labeled fixture was used instead:

```json
{
  "label": "FIXTURE ONLY — pending Momisa inputs",
  "productName": "Momisa Glow Box rehearsal fixture",
  "brandName": "FIXTURE preview — not Momisa",
  "offer": "FIXTURE — 20% off, members only",
  "destinationUrl": "https://example.com/fixture-direct-listing-not-amazon",
  "packshot": "public/campaign-assets/harbor-field-bottle.webp",
  "rights": "PENDING — no Momisa packshot permission"
}
```

The full fixture is at
`.local/offer-intake-review/operator-rehearsal/fixture.json`. The packshot is a
synthetic Harbor Field bottle, not a Momisa image. The preview footer and brand
both say the run is a fixture.

### Rehearsal result

One operator rehearsal ran at 1000 px in local Chromium. The operator entered
the fixture, confirmed the offer and destination, deliberately left media rights
unconfirmed, opened the preview, added a `, US only` market qualifier, regenerated,
approved the provisional revision, returned to intake, re-confirmed the offer,
and opened the preview again.

Where the operator hesitated, needed help, or made a manual correction:

1. **Offer terms have no structure.** There is one free-text Offer field. Market,
   membership, threshold and dates must all be encoded by hand. The operator had
   to decide the exact wording before the preview could be reviewed.
2. **The product-name fallback needs a per-offer explanation.** The new intake
   hint explains the general rule, but the preview does not say that this
   particular members-only offer triggered it. The operator had to infer that
   `Momisa Glow Box rehearsal fixture` was intentional, not a missing headline.
3. **A valid direct URL is labelled like a search page before confirmation.**
   The fixture's direct `example.com` URL was shown as
   `Search/placeholder - provisional` until the destination confirmation was
   checked. The same label covers a merely unconfirmed direct URL, so the
   operator could not tell whether the URL itself was wrong.
4. **Pending edits are clear, but still need a second action.** Adding
   `, US only` cleared approval and showed the old preview plus a pending block.
   The operator had to regenerate before the new market qualifier appeared
   anywhere in the page. The pending block said this correctly.
5. **Approve preview is enabled on a provisional revision.** The footer said
   `Preview - offer provisional`, but the button still says `Approve preview`.
   The operator could read that as publication approval. It needs to stay
   visibly a local-only action.
6. **Returning to intake clears the offer confirmation.** The revised offer and
   destination were preserved, but the exact-offer confirmation was cleared
   (`offer: false`, `destination: true`, `rights: false`). The operator had to
   re-check the offer before the next preview could be confirmed.
7. **Offer confirmation and packshot permission are separate blockers.** After
   re-confirming the offer, the preview remained `preview` because media rights
   were still pending. The operator had to understand that fixing the offer did
   not clear the media block.

Evidence:

```text
.local/offer-intake-review/operator-rehearsal/
  fixture.json
  rehearsal-00-filled-intake.png
  rehearsal-01-initial-preview.png
  rehearsal-02-pending-market-correction.png
  rehearsal-03-revised-preview.png
  rehearsal-04-approved-provisional.png
  rehearsal-05-back-to-intake.png
  rehearsal-06-reconfirmed-preview.png
  rehearsal.json
```

The rehearsal is a local workflow observation only. It does not validate Momisa
terms, a Momisa listing or Momisa media rights.

## Remaining issues

- The headline fallback is safe but not explained per offer. A future hint could
  name the triggering qualifier (membership, region, threshold, code) or offer an
  approved operator headline override.
- The destination summary conflates an unconfirmed direct URL with a
  search/placeholder URL under one label.
- `Approve preview` remains enabled for provisional rendered revisions. This is
  deliberate in the current local workflow, but the copy could make the
  local-only boundary clearer.
- The intake still has no structured promotion-term fields, so operators must
  keep membership, market, threshold and dates in one offer line.
- Momisa is still a preview pilot. Do not publish the fixture or the existing
  Momisa package until the owner confirms the final terms and market, the direct
  Amazon listing, and the packshot permission.

## UX / DX / AX

- **UX:** The unsafe `20% off the bottle.` claim is gone. Ambiguous offers now
  use the product name, and the exact offer stays immediately before the CTA.
  The intake hint sets the expectation before the preview opens.
- **DX:** The positive allowlist is simpler to audit than a growing denylist.
  `safeOfferHeadlineLead` is deterministic and directly testable; the 180-character
  fallback remains a hard invariant.
- **AX:** The page keeps the same semantic structure. The headline is a heading,
  the exact offer is text in the offer block, and the CTA remains a link with its
  existing new-tab warning. No live region or status semantics changed.
