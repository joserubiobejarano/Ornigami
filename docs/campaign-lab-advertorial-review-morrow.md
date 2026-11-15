# Review brief — Morrow Ceramic (full material)

Campaign: Morrow Ceramic pour-over dripper
Purpose: review the proposed `single-product-advertorial` template against a
campaign that has enough approved material to support the format.
Status: design review ready. Not publication ready until the brand source
documents for the story and each fact are attached to the runtime brief.

Companion documents: [specification](./campaign-lab-advertorial-spec.md),
[research sources](./campaign-lab-advertorial-sources.md),
[Momisa offer-only brief](./campaign-lab-advertorial-review-momisa.md).

## Why this campaign fits the format

The campaign has a specific change to explain, not just a discount:

- A named product with a visible design detail.
- An approved story about a first prototype and revised rib spacing.
- Three product facts that can support the story.
- Four approved image roles: product hero, prototype evidence, interior
  detail, and use.
- One simple offer and one destination.

That is enough for a short advertorial. It is not enough for a long-form
pre-sell, and the brief must not be stretched into one.

## Fixed campaign inputs

| Field | Value |
| --- | --- |
| Brand | Morrow Ceramic |
| Product name | Morrow ceramic pour-over dripper |
| Product noun | pour-over dripper |
| Campaign angle | Flow control: the ribs hold the filter clear of the wall |
| Audience | People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower |
| Objective | Explain the rib design and lead to the dripper page |
| Offer | Free shipping through 30 November 2026 |
| Destination | `https://example.com/morrow` |
| Action label | See the dripper |
| Template | `single-product-advertorial` v1.0.0 |
| Expected layout | `advertorial-full` |

These values are exact. A draft that changes the offer, destination, action
label, product name, or asset identity fails review.

## Approved opening copy

Use the existing approved opening, not a new headline. The standfirst is the
campaign question from the source email; the two story beats are the two
approved sentences in the `flow-control` lede.

- ID: `flow-control`
- Headline: “Why Morrow revised the rib spacing inside its ceramic pour-over
  dripper” (71 characters)
- Standfirst: “What changes when your first pour is slower?” (43 characters)
- Story beat 1: “In the first prototype, the filter sat against the wall.”
- Story beat 2: “Morrow revised the spacing between the three interior ribs.”

The opening is a story opening, not an offer opening. The offer appears only at
the product transition and the close.

## Evidence map

| Item | Approved value | Source to attach | Render rule |
| --- | --- | --- | --- |
| Story beat 1 | “In the first prototype, the filter sat against the wall.” | The first sentence of the approved `flow-control` lede; attach the brand story document or approved interview transcript with reviewer and date | Exact approved text; no paraphrase |
| Story beat 2 | “Morrow revised the spacing between the three interior ribs.” | The second sentence of the approved `flow-control` lede; same source as beat 1 | Exact approved text; no added result |
| Fact `ribs` | Interior — Three ribs | “Interior: three raised ribs that hold the filter clear of the wall.” Approved product sheet | Value exactly “Three ribs” |
| Fact `outlet` | Outlet — Single outlet | “Outlet: one centred outlet.” Approved product sheet | Value exactly “Single outlet” |
| Fact `body` | Body — Ceramic | “Body: glazed ceramic.” Approved product sheet | Value exactly “Ceramic” |
| Image `morrow-ceramic-dripper-front` | Product hero | Approved fixture SVG, SHA-256 `e55dfa1a7b6b734f5aa01f21db623720c4fe7f7a49af70fa3e00f74ed602054d` | Product block; full pack and `MORROW` label visible |
| Image `morrow-prototype` | Product evidence | Approved fixture SVG, SHA-256 `340d84ef43beaa1a52c2fb04e376ba716c58988fa07d14117497520fb3e25548` | Story or evidence band; caption names `PROTOTYPE 01` |
| Image `morrow-ribs` | Product detail | Approved fixture SVG, SHA-256 `200082d2ee10c8ab17678973db47d6835e8b5550a5fd2f8890ab94394dcdb901` | Beside the `ribs` fact; caption names the three interior ribs |
| Image `morrow-pour` | Product in use | Approved fixture SVG, SHA-256 `c7dfbcace4ff3c2061da9ebe361fafe937eeb9ad945d27885758af770bdca69b` | Optional story or transition image; no performance claim |
| Disclosure | Advertisement · Morrow Ceramic | Publication and legal confirmation | Before the headline; repeat at close only if required |

The fixture is sufficient to review structure and visual behaviour. The runtime
brief still needs the story's source document, reviewer, and date. A fixture
fact is not a publication source.

## Claims boundary

Approved: the rib count, the single outlet, the ceramic body, the prototype
story, and the free-shipping offer.

Not approved and must not appear: flavour, taste, brew time, “brews in” minutes
or seconds, “faster than”, “better than”, “even extraction”, “handmade”, “made
in”, a rating, review count, award, guarantee, or a performance result.

The page may say the ribs hold the filter clear of the wall because that is the
approved story. It may not say what that does to flavour or extraction.

## Expected page

### Mobile, 375–390 px

1. Disclosure strip: `Advertisement · Morrow Ceramic`.
2. Morrow wordmark.
3. Headline and standfirst (“What changes when your first pour is slower?”).
   No action.
4. Opening image: prototype or pour. Caption only if the link to the story is
   not obvious.
5. Two story beats. Short paragraphs, no section eyebrow.
6. Fact band with `Three ribs`, `Single outlet`, `Ceramic`.
7. Detail image of the ribs beside the fact, or immediately after it.
8. Product block: product name, one-sentence transition, product hero, offer,
   `See the dripper`.
9. Close: same offer and action.
10. Footer: wordmark, `Advertisement`, copyright.

The first buying action should appear after the story and evidence, normally in
the second or third screen. It must not appear in the first screen.

### Desktop, 1440 px

1. Disclosure strip and wordmark on one top row.
2. Headline across seven columns; standfirst in four columns, aligned to the
   headline baseline.
3. Opening image as a full-width band, not a gallery.
4. Story text at a 60–70 character measure, with the detail image offset.
5. Evidence band with three facts on the brand's dark or tinted surface.
6. Product split: image left, product name and transition right, offer and
   action paired in the right column.
7. Close row: offer left, action right.
8. Footer.

The page should feel like a designed editorial page, not a stretched mobile
column. The image sequence should read recognition → evidence → detail → use,
or a deliberate subset of that sequence.

## One-photo variant

Use `advertorial-one-photo` with only `morrow-ceramic-dripper-front`.

- Drop the opening, prototype, detail, and use images. Do not crop the packshot
  into a fake scene.
- Keep two story beats and two facts: `ribs` and `outlet`.
- Put the packshot in the product block at its natural aspect ratio,
  `object-fit: contain`.
- Keep the disclosure, product name, offer, and both actions.
- The page must not show an empty image frame where the evidence image was.

The one-photo page should still make the rib story legible. If it cannot, the
brief is too thin for an advertorial and should use the offer template.

## Review checklist

- [ ] Disclosure is visible before the headline at 375 px and 1440 px.
- [ ] The opening continues the email promise (“what changes when your first
      pour is slower?”) without inventing a new claim.
- [ ] The story uses the approved beat text exactly.
- [ ] The three facts match the approved values and sources.
- [ ] No forbidden claim appears.
- [ ] The first action is after the story and evidence, not in the first screen.
- [ ] Offer terms sit next to the first action.
- [ ] Both actions use `See the dripper` and `https://example.com/morrow`.
- [ ] The product hero preserves the full pack and the `MORROW` label at 375 px.
- [ ] The rib detail is legible and is placed next to the rib fact.
- [ ] The prototype image is captioned `PROTOTYPE 01` or by its visible label.
- [ ] The use image does not imply a flavour, brew-time, or extraction result.
- [ ] The one-photo variant has no empty frame and no fake lifestyle crop.
- [ ] The page does not repeat the product name in the close or repeat the
      offer more than twice.
- [ ] The page still reads as Morrow with the wordmark hidden.

## What this review does not prove

- It does not prove that the page converts better than the offer template.
- It does not prove that the fixture SVGs are the brand's production assets.
- It does not prove that the story source is accurate; it proves that the
  template can hold an approved story.
- It does not prove screen-reader, physical-device, zoom, or slow-network
  behaviour beyond the browser checks.

## Reviewer questions

1. Does the page earn the product transition, or does it feel like a product
   page with a story bolted on?
2. Is the rib story strong enough for a short advertorial, or should this
   campaign stay on the offer template?
3. Does the evidence band add a fact the reader needs, or is it filler before
   the product?
4. Is the one-photo variant a credible page, or does it lose the reason to read?
5. Which single change would improve the page most without adding a new claim?
