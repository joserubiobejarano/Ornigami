# Blind campaign review sheet

Use this blank form when a generated blind sheet is not available, or keep it
beside the generated `<run>/blind-sheet.md`. The evaluator fills the same fields
and randomizes draft labels per case.

Run:
Pack: `campaign-lab-eval`
Template: `single-product-offer`
Reviewer:
Date:

## Rules

1. Open each draft's mobile and desktop capture. Do not open `comparison-index.md`,
   `comparison.json`, `report.md`, or `blind-key.json` yet. The captures use
   neutral labels; `provider-map.json` stays separate.
2. Score each visual dimension 0–2: 0 failed or unsupported, 1 workable with
   edits, 2 ready to use.
3. Record which draft you would approve, the first change you would make, the
   number of edits to approval, and the time to approval.
4. Only after all visual scores are recorded, open the automated comparison and
   fill the separate factual and functional table. Never average a gate failure
   into a visual score.
5. Name one strength to preserve in each draft.

## Sparse campaign

Expected at mobile width: product, 20% offer, and action readable without horizontal
scrolling; offer terms near the action; image does not bury the action; page
does not read as empty.

Expected at desktop width: deliberate wide composition; product label crop readable;
action and terms paired; no competing action; repetition earns its place.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Fallback preferred? Notes:

## Richer campaign

Expected at mobile width: product angle on the first screen; extra evidence within the
first two screens; offer and action not buried by the image stack; longer than
sparse without becoming a wall of copy.

Expected at desktop width: image roles read as recognition, evidence, detail, use;
crops preserve the ribs, outlet, or prototype label; width used deliberately;
offer and action paired.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Fallback preferred? Notes:

## Intent change

Expected at mobile width: first screen promises the slower first pour, not the rib
mechanism; offer, destination, action, and image identity unchanged; opening is
not a synonym swap; page still reads as Morrow.

Expected at desktop width: section emphasis follows the ritual angle; same product and
assets recognizable; offer and action unchanged; the two Morrow pages are not
duplicates.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Fallback preferred? Notes:

## Failure and revision

Compare the revised page with the last valid page. Expected at mobile width: the
unsupported-claim error is specific and the previous draft is visible; the
missing-destination message is next to the field; the revised offer and
destination are readable and the old values are gone; the page still fits.

Expected at desktop width: the revision is localized; headline, image, and facts do
not churn; the old destination is absent from every link; approval visibly
changes to not approved; no second action or duplicated offer.

| Draft | Campaign fit | Brand fit | Visual hierarchy | Repetition | Edits to approval | Ship? |
| --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | |
| B | | | | | | |

Fallback preferred? Notes:

## Reviewer decisions

Record these after visual scoring. Use the neutral capture labels. The provider
mapping stays in `provider-map.json` and is not part of this decision.

| Case | Page I would approve | First change I would make | Edits to approval | Time to approval (minutes) | Fall back to the other page? |
| --- | --- | --- | --- | --- | --- |
| Sparse | A / B / neither | | | | Yes / No / N/A |
| Richer | A / B / neither | | | | Yes / No / N/A |
| Intent change | A / B / neither | | | | Yes / No / N/A |
| Failure and revision | A / B / neither | | | | Yes / No / N/A |

## Factual and functional gate review

Complete after the visual scores. A gate failure is a release blocker, not a
visual preference.

| Case | Offer exact | Destination exact | Asset identity | Claims traceable | Missing input blocked | Revision applied | Approval invalidated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sparse | | | | | | | | |
| Richer | | | | | | | | |
| Intent change | | | | | | | | |
| Failure and revision | | | | | | | | |
| Trap | | | | | | | | |

Packaging truth: the automated checks can prove path, bytes, alt text, and page
text. A human must read the printed label in the crop. Record the Fernway 1 L /
0.8 L mismatch as a factual packaging failure if it is present.
