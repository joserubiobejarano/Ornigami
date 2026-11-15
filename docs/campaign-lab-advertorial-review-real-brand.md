# Review brief — real-brand advertorial test

Status: **pending**. No real-brand fixture has been added and no real-brand
capture has been produced. The supplied material does not meet the advertorial
contract's evidence, rights, and offer requirements.

Companion documents:
[advertorial spec](./campaign-lab-advertorial-spec.md),
[research sources](./campaign-lab-advertorial-sources.md),
[Morrow review brief](./campaign-lab-advertorial-review-morrow.md),
[renderer refinement handoff](./handoffs/CAMPAIGN_LAB_ADVERTORIAL_RENDER_20261115.md).

## Why this test is separate

The Morrow case is a fictional fixture. It is useful for structure and visual
behaviour, but it cannot test whether a real brand's source material survives
the template. A real-brand test needs a documented story the brand will stand
behind, approved claims, media rights, final commercial terms, and a direct
destination. Those are the inputs that fail first in practice.

## Candidates reviewed

### 1. Guardian Labs / Sainsbury's — “Recipes from FEED” mazesoba

Documented in [research sources](./campaign-lab-advertorial-sources.md):
<https://www.theguardian.com/recipes-from-feed/2026/aug/14/jimi-famurewas-sausage-egg-and-shiitake-mazesoba-recipe>

What is usable for a test brief:

- The public page structure: paid-content strip, sponsor credit, hero image,
  headline, standfirst, byline, recipe, and one retail link.
- The measured reading sequence: hero at 235 px, headline at 578 px, sponsor at
  830 px, intro at 1,097 px, ingredients at 1,530 px, method at 2,458 px, retail
  link at 3,535 px on a 390 × 844 mobile viewport.
- The observation that the retail link comes after the useful recipe and that
  the page uses one hero image, not a gallery.

What is not usable:

- The Sainsbury's name, logo, product names, recipe text, or photography. No
  media licence or brand approval is on file for this project.
- There is no single-product offer, price, shipping term, or direct product
  destination. The page's only action is a range link, not a buy action.
- The “story” is recipe utility, not a documented product-design story with a
  source quote and a reviewer/date.

This candidate is useful as a **structural reference**, not as a fixture. It
cannot supply the real-brand test's assets or offer.

### 2. NYT / Rolex — “Piyush Tewari & Building Communities”

Documented at
<https://www.nytimes.com/paidpost/rolex/piyush-tewari-and-building-communities.html>

What is usable:

- The disclosure pattern: `PAID POST`, sponsor, producer, and independence
  statement before the hero.
- The observation that the page has no buying action and no product transition;
  the brand association is the conversion.

What is not usable:

- The Rolex name, logo, portraits, interview text, or photography. No licence is
  on file.
- There is no product offer, price, terms, or direct destination. It is not a
  single-product advertorial.

This candidate is a disclosure and pacing reference, not a test fixture.

### 3. Momisa Glow Box — local pilot

Available in ignored local storage at
`.local/campaign-lab-pilots/momisa/`.

What is available:

- One real packshot, `momisa-glow-box-front`, with a recorded crop, alt text,
  and a pilot-only rights note.
- Three printed mask variant names, a count, and “for all skin types.”
- A preview offer and an Amazon search destination.

What is missing:

- A documented brand story with an approved source quote, reviewer, and date.
- Approved product claims beyond the printed package text.
- Confirmed final offer and a direct product listing. The 30% offer and Amazon
  search URL are benchmark placeholders.
- Confirmed media rights. The asset record says “Pilot use only. Confirm Momisa
  media rights before publication.”
- Supporting image roles beyond the packshot. The one-photo layout would be the
  only possible fit, and the current material would still need a story.

Momisa therefore remains on `single-product-offer`. It is not a valid
real-brand advertorial test yet.

## Specific gap

To run the real-brand test, the operator must supply all of the following for
one named brand and product:

1. A documented story with a source document, exact quote, reviewer, and date.
2. Two or three approved story beats transcribed from that source.
3. Approved product facts with a source document and exact source text.
4. A final offer with its terms, a direct destination, and an action label.
5. A disclosure label and sponsor confirmed for the publication surface.
6. A reviewed packshot plus at least one supporting image role with confirmed
   media rights, alt text, crop notes, and content hashes.
7. A statement that the images may be used in a paid advertorial, not only in a
   product listing or organic post.

Without items 1–7, the template either blocks publication or would present
unapproved claims and terms. The test is therefore **pending**, not skipped for
convenience.

## When the inputs arrive

1. Put private brand assets and the pilot manifest under ignored
   `.local/campaign-lab-pilots/<brand>/`.
2. Use the same `single-product-advertorial` manifest and the same capture
   runner as Morrow. Do not fork the renderer.
3. Keep the first run in the one-photo layout if the packshot is the only
   approved image. Use the full layout only when at least one supporting image
   has a named role and rights.
4. Capture 320, 375, 768, 1440, and the narrow editor pane. Keep the captures in
   `.local/` and out of Git.
5. Review the same questions as the Morrow handoff: what the reader learns
   before the product, how the evidence supports it, where the first action
   appears, and whether focus, contrast, and reflow hold.
6. Do not publish or commit private assets, captures, or unconfirmed commercial
   terms.

## What this brief does not claim

- It does not claim that the Guardian, NYT/Rolex, or Momisa pages convert.
- It does not grant rights to any brand's text, logo, or photography.
- It does not treat the public structure observations as approved copy.
- It does not replace legal review of the disclosure label or the offer terms.
