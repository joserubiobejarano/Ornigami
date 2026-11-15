# Blind campaign review

Run: compare-api

This sheet is blind. It does not say which draft came from the generator and which is the deterministic baseline.

## How to score

1. Open each draft's mobile and desktop capture. Do not open `comparison-index.md`, `comparison.json`, `report.md`, or `blind-key.json` yet. Capture labels are neutral; the provider mapping stays in `provider-map.json`.
2. Score each visual dimension from 0 to 2: 0 failed or unsupported, 1 workable with edits, 2 ready to use.
3. Record the page you would approve, the first change you would make, the number of edits to approval, and the time to approval.
4. Only after all visual scores are recorded, open the automated comparison and note factual or functional gate failures separately. Never average a gate failure into a visual score.

Visual preferences are not factual failures. A draft can look better and still fail an exact offer, destination, asset, or claim check. If the automated comparison says the drafts are identical, say so rather than inventing a preference.

## 1. Sparse campaign: one photo, few approved facts

**Campaign.** Harbor Field · Harbor Field travel bottle · Direct offer

**Approved offer.** 20% off, 27–30 November 2026 · **Destination.** https://example.com/harbor-field · **Action.** Shop on Amazon

**What a visitor should see at 375 px**
- The product name, the 20% offer, and Shop on Amazon are all readable without horizontal scrolling.
- The offer terms sit next to the action, not in a separate footer the visitor must hunt for.
- The single photo does not push the action below the second screen.
- The page does not look empty or over-decorated because only two facts exist.

**What a visitor should see at 1440 px**
- The composition uses the wide canvas without stretching the copy into an unreadable measure.
- The product crop keeps the HARBOR FIELD and 500 ML label readable.
- The action and terms remain visually paired; no second competing action appears.
- Any repeated action or offer is short and earns its repeat.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Notes:

- Which draft would you ship, and why?
- Would you fall back to the other draft? Why?
- Name one strength to preserve in each draft.

**Reviewer decision (record after visual scoring, before opening the automated index)**

- Page I would approve: A / B / neither
- What I would change first:
- Edits to approval (count):
- Time to approval (minutes):
- Would I fall back to the other page? Yes / No / Not applicable

Capture slots (neutral labels; provider mapping is in `provider-map.json`):
- Draft A: `captures/sparse-offer/A/mobile.png`, `captures/sparse-offer/A/desktop.png`
- Draft B: `captures/sparse-offer/B/mobile.png`, `captures/sparse-offer/B/desktop.png`

## 2. Richer campaign: different brand, clear product angle, extra evidence

**Campaign.** Morrow Ceramic · Morrow ceramic pour-over dripper · Flow control: the ribs hold the filter clear of the wall

**Approved offer.** Free shipping through 30 November 2026 · **Destination.** https://example.com/morrow · **Action.** See the dripper

**Automated comparison: the two drafts are identical.** No copy, section-order, or evidence difference was found. Note whether the captures show any difference at all.

**What a visitor should see at 375 px**
- The first screen states a product angle, not a generic brand slogan.
- The extra evidence is visible within the first two screens; it is not hidden behind a tab or a decorative gallery.
- The offer and See the dripper are still reachable without scrolling past an image stack.
- The page reads as longer and more evidence-led than the sparse campaign, without becoming a wall of copy.

**What a visitor should see at 1440 px**
- The image sequence has roles: product recognition, then detail or story evidence, then use.
- Crops preserve the ribs, outlet, or prototype label that the copy refers to.
- The editorial composition uses the width for a deliberate measure and image rhythm, not a centered mobile column.
- The offer and action remain visually paired and are not displaced by the added evidence.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Notes:

- Which draft would you ship, and why?
- Would you fall back to the other draft? Why?
- Name one strength to preserve in each draft.

**Reviewer decision (record after visual scoring, before opening the automated index)**

- Page I would approve: A / B / neither
- What I would change first:
- Edits to approval (count):
- Time to approval (minutes):
- Would I fall back to the other page? Yes / No / Not applicable

Capture slots (neutral labels; provider mapping is in `provider-map.json`):
- Draft A: `captures/rich-angle/A/mobile.png`, `captures/rich-angle/A/desktop.png`
- Draft B: `captures/rich-angle/B/mobile.png`, `captures/rich-angle/B/desktop.png`

## 3. Intent change: same brand, product, assets, and offer; different campaign angle

**Campaign.** Morrow Ceramic · Morrow ceramic pour-over dripper · Ritual: a slower first pour

**Approved offer.** Free shipping through 30 November 2026 · **Destination.** https://example.com/morrow · **Action.** See the dripper

**Automated comparison: the two drafts are identical.** No copy, section-order, or evidence difference was found. Note whether the captures show any difference at all.

**What a visitor should see at 375 px**
- The first screen promises the slower first pour, not the rib mechanism that led the richer campaign.
- The offer, destination, action label, and product image identity are unchanged from the richer campaign.
- The new opening is not a synonym swap; a reader can tell the campaign emphasis changed.
- The page still reads as Morrow Ceramic and does not reuse the richer campaign's first screen.

**What a visitor should see at 1440 px**
- Section emphasis follows the ritual angle while the same approved evidence remains available.
- The layout may change, but the same product and assets are recognizable.
- The offer and action are still paired and unchanged.
- The two Morrow pages would not be mistaken for duplicates if placed side by side.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Notes:

- Which draft would you ship, and why?
- Would you fall back to the other draft? Why?
- Name one strength to preserve in each draft.

**Reviewer decision (record after visual scoring, before opening the automated index)**

- Page I would approve: A / B / neither
- What I would change first:
- Edits to approval (count):
- Time to approval (minutes):
- Would I fall back to the other page? Yes / No / Not applicable

Capture slots (neutral labels; provider mapping is in `provider-map.json`):
- Draft A: `captures/intent-change/A/mobile.png`, `captures/intent-change/A/desktop.png`
- Draft B: `captures/intent-change/B/mobile.png`, `captures/intent-change/B/desktop.png`

## Factual and functional gate review (complete after scoring)

| Case | Gate | Result | Evidence |
| --- | --- | --- | --- |
| | | | |

Gate results come from `report.md`. A gate failure is a release blocker, not a visual preference. A green automated check never proves that the pictured packaging is the approved product.
