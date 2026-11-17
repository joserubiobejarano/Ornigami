# Direct-offer conditional headline review — 16 November 2026

Status: local, development-only fixes for the single-product offer pilot.

Follow-up: [Safe direct-offer headlines](./CAMPAIGN_LAB_SAFE_OFFER_HEADLINES_20261117.md)
replaces the conditional denylist below with a narrow, positive allowlist.

- Branch: `codex/campaign-lab-direct-offer-conditional`
- Base: `8dda4f6` (`Share offer brief and bind verification to rendered revisions`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/direct-offer-conditional`
- Entry point: `/campaign-lab/offer`

## Reproduced before

### Conditional 50% offer → free-shipping revision

Starting with:

```text
50% off your first order when you spend $75 or more, excluding gift cards and sale items
```

the preview headline was shortened to:

```text
50% off your first order.
```

That dropped the purchase threshold and the gift-card/sale-item exclusion. The
exact terms were still shown next to the CTA, but the headline hid material
conditions.

After editing only Offer to:

```text
Free shipping on orders over $75
```

the headline stayed `50% off your first order.` while the offer block showed the
free-shipping terms. The headline was frozen at intake instead of being derived
from the current brief.

The same edit exposed a status split:

- Before **Generate preview**, the article still showed the confirmed 50% offer,
  but the footer changed to `Preview · offer provisional` and the verification
  panel swapped to the pending free-shipping values.
- After regeneration, the footer and panel said provisional, but the preview
  badge and `data-preview-status` still said `confirmed`.

Evidence: `.local/offer-intake-review/direct-offer-before/verification.json`

### 180-character offer

A valid 180-character offer produced a 181-character headline:

```text
The headline is 181 characters. The limit is 180.
```

The intake accepted the offer, but no preview rendered. The generated headline
added terminal punctuation to the whole offer because the old shortcut only
worked when the offer contained `through`, `until`, `when`, or `on`.

## Fix

### Headline from the current brief

- Removed the browser intake's frozen `copy.headline`. The renderer derives the
  headline from the current brief on every revision.
- Added explicit conditional-promotion detection in `template.ts` for purchase
  requirements, thresholds, promo-code requirements, BOGO forms, exclusions, and
  similar conditions.
- A conditional promotion now uses the exact product name as the headline rather
  than shortening the offer and hiding a condition.
- A non-conditional offer keeps the existing offer-led headline behavior.
- If the generated headline would exceed the 180-character template limit, the
  renderer falls back to the product name. Every valid intake offer length from
  1 to 180 therefore renders.
- The exact offer remains next to the primary CTA; the headline is not the place
  for the full terms.

### One rendered revision for status, footer, and approval

- The intake snapshots the rendered values and the operator confirmations at the
  moment a revision is rendered.
- The verification panel, preview badge, header note, footer notice, and
  `data-preview-status` now describe that rendered revision.
- The approval button remains tied to the exact rendered revision and records
  `data-approved-revision`.
- Pending edits are shown separately as **Pending edits · not rendered**, with
  their own current values and verification status. They do not overwrite the
  rendered revision's status or footer.
- Local approval remains available for provisional rendered values.

## After evidence

### Conditional 50% → free shipping

At both 375 and 1440 px:

| Step | Headline | Offer next to CTA | Preview status | Footer | Approval |
| --- | --- | --- | --- | --- | --- |
| Confirmed 50% offer | `Harbor Field travel bottle` | exact 50% terms | confirmed | no provisional notice | approved at `682dad90ce30c62a` |
| Edit to free shipping | `Harbor Field travel bottle` | still the rendered 50% terms | confirmed | still clean; pending block shows free shipping provisional | approval cleared, button disabled |
| Generate free-shipping revision | `Harbor Field travel bottle` | `Free shipping on orders over $75` | preview | `Preview · offer provisional` | enabled, then approved at `19ffd36dac90ef3d` |

The pending block explicitly said:

```text
Pending edits · not rendered
The preview and footer still describe revision 682dad90ce.
Approval is cleared for pending edits. Generate preview to validate these values.
OFFER Offer provisional — Free shipping on orders over $75
```

That separates the rendered revision from the pending edit without letting the
pending values rewrite the footer, badge, or approval state.

### 180-character offer

The same valid 180-character offer now renders at both widths:

| Width | Headline | Headline length | Rendered offer length | Status | Overflow |
| --- | --- | ---: | ---: | --- | --- |
| 375 | `Harbor Field travel bottle` | 26 | 180 | confirmed | none |
| 1440 | `Harbor Field travel bottle` | 26 | 180 | confirmed | none |

The exact 180-character offer stays in the terms block directly above the CTA.

A unit test also builds every valid offer length from 1 through 180 and asserts
that the preview renders with a headline no longer than 180 characters.

### Confirmed → provisional → confirmed

| Step | Revision | Headline | Status | Footer | Approval |
| --- | --- | --- | --- | --- | --- |
| Confirmed conditional offer | `682dad90ce30c62a` | `Harbor Field travel bottle` | confirmed | clean | approved |
| Placeholder `30% off, placeholder terms` | `ce0c363e34d00b92` | `30% off the bottle.` | preview | offer provisional | approved |
| Return to intake | — | — | — | — | placeholder offer and destination preserved; offer confirmation cleared, destination/media confirmations retained |
| Restore confirmed offer and re-confirm | `682dad90ce30c62a` | `Harbor Field travel bottle` | confirmed | clean | approved |

The provisional step shows that the headline is generated from the current
brief, not a frozen intake value. Restoring identical confirmed content returns
the same content-addressed revision.

## Captures

Before and after article captures at 375 and 1440 px, using the matching Harbor
Field bottle packshot:

```text
.local/offer-intake-review/direct-offer-before/
  conditional-50-375-before.png
  free-shipping-375-before.png
  conditional-50-1440-before.png
  free-shipping-1440-before.png

.local/offer-intake-review/direct-offer-after/
  conditional-50-375-after.png
  free-shipping-375-after.png
  offer-180-375-after.png
  round-trip-provisional-1440.png
  conditional-50-1440-after.png
  free-shipping-1440-after.png
  offer-180-1440-after.png
  round-trip-confirmed-1440.png
```

The before captures show the stale `50% off your first order.` headline above
the free-shipping terms. The after captures show the product-name headline and
the exact terms next to the CTA.

## Checks

- TypeScript: passed.
- Focused ESLint: passed.
- Campaign Lab tests: **93 passed, 0 failed**.
- Existing offer-page regressions: **144 passed, 0 failed, 0 pending**.
  - Evidence: `.local/offer-intake-review/offer-regression-direct-offer/report.md`
- Browser verification: conditional edit, 180-character offer, and confirmed →
  provisional → confirmed round trip all passed at the inspected widths.

## Remaining direct-offer issues

- Conditional-promotion detection is heuristic. New phrasings may need an
  operator headline override; the local intake does not expose one yet.
- Deadline-only offers such as `Free shipping through 30 November 2026` still
  use the offer-led headline because no purchase requirement, threshold, or
  exclusion is present. The exact deadline remains next to the CTA.
- The browser intake remains ephemeral: refreshing clears the brief and local
  approval.
- Brand identity is currently a name/wordmark with neutral tokens; brand-token
  intake is outside this direct-offer pilot.
- Momisa remains a preview pilot with placeholder commercial inputs and pending
  media rights; those values must not be treated as publication-ready.

## UX / DX / AX check

- **UX:** The operator can see the rendered revision's exact status and footer
  while pending edits are separately labelled. Conditional headlines no longer
  hide thresholds or exclusions, and exact terms stay by the action.
- **DX:** The renderer owns headline derivation, so editor edits cannot leave a
  frozen headline behind. The intake snapshots rendered verification without
  changing the existing local editor or revision hashing.
- **AX:** The verification panel, pending block, preview badge, footer, and
  approval revision are exposed through stable data attributes and readable
  labels.
