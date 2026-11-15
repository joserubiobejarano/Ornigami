# Single-product advertorial — template specification

Status: proposed for implementation. This document defines the template
contract only; it does not implement the template or claim a conversion effect.

> Revision 2 contract note (15 November 2026): both layouts now end at the
> `product` block with one primary action. The `close` section and the repeated
> second action described in this original proposal are superseded. See
> [the implementation fixes](./handoffs/CAMPAIGN_LAB_ADVERTORIAL_FIXES_20261115.md)
> and [the Session 2 section contract](./handoffs/CAMPAIGN_LAB_ADVERTORIAL_SECTION_CONTRACT_20261115.md).
> Everything else in this document remains the design rationale.

- Template ID: `single-product-advertorial`
- Version: `1.0.0`
- Format: story-led, single-product advertorial
- Base: `bc58db6` on `codex/campaign-lab-integration`
- Companion documents: [research sources](./campaign-lab-advertorial-sources.md),
  [Morrow review brief](./campaign-lab-advertorial-review-morrow.md),
  [Momisa review brief](./campaign-lab-advertorial-review-momisa.md)
- Project rules read: `docs/design/RULES.md` and `docs/design/WORKFLOW.md` in
  the main checkout. Those files are not committed at `bc58db6`; this spec
  restates every rule it relies on.

## 1. Decision summary

Use the advertorial when the campaign promise is an idea, problem, or story
that must be believed before the product is useful. The page earns the product
transition through approved narrative and evidence, then makes one offer and
one action clear. It is not a longer product page and it is not a place to
invent proof.

The first implementation has two layouts:

| Layout | Material | Behaviour |
| --- | --- | --- |
| `advertorial-full` | Product hero plus at least one supporting image | Story, evidence, then product transition |
| `advertorial-one-photo` | One usable product image | Type-led opening, short story, product transition with the single image |

The single-product offer template remains the answer when the material is one
packshot, two or three facts, and an offer. The advertorial must not be used to
stretch that material into a story.

### Research basis

Three live advertorials were inspected on 15 November 2026: a New York Times
paid post for Rolex, a Guardian Labs paid recipe for Sainsbury's, and a
brand-hosted Clarifion advertorial. All three put the commercial label before
the story and none put a buying action in the first screen. Their first actions
ranged from “after a complete recipe” to “after a long argument”; one had no
buying action at all. The sources and measurements are in
[the source notes](./campaign-lab-advertorial-sources.md).

This spec adapts that observed sequencing to Ornigami's rule that the product
and action must be clear on mobile. It does not claim that a late action, a
longer page, or a story opening increases conversion. The only honest
conversion test is a same-ad split against the offer page.

## 2. What the format must do

1. Put the commercial relationship before the story. The disclosure is visible
   before the headline at 375 px and 1440 px.
2. Continue the exact promise that brought the reader to the page. The opening
   headline and standfirst must be traceable to the campaign creative or the
   approved story, not a new claim.
3. Earn the product transition. The product appears only after the story and
   the evidence that make it relevant.
4. Keep one product, one offer, and one destination. The action appears at the
   product transition and may repeat once at the close.
5. Work with one usable photo. A sparse asset set changes the composition, not
   the truth of the page.
6. Stay short. The full layout is capped at 420 words of marketing copy; the
   one-photo layout at 300. Extra sections are removed, not filled.

## 3. Fit decision

| Signal | Use advertorial | Use single-product offer |
| --- | --- | --- |
| Traffic | Cold or problem-aware from a story-led ad, email, or publisher placement | Offer-aware, retargeting, or marketplace traffic |
| Promise | A problem, idea, or documented change | A price, deadline, or direct product choice |
| Approved narrative | At least two story beats with a source or a released narrator | None beyond a headline and product facts |
| Images | At least one image that can carry context, detail, or use | One packshot |
| Decision | The reader must believe something before price matters | The reader already wants the product and needs terms |
| Evidence | Facts and a story that can be traced to approved sources | Product facts plus offer terms |
| Disclosure | The commercial relationship can be labelled before the story | The page is plainly an offer page; still label paid placements |

A product-selection page that lists variants and printed attributes is a
separate format, not an advertorial. It can be the right answer for a set like
Momisa, but it does not earn a story transition and should not be forced into
this template.

Do not use the advertorial when any of these is true:

- The only inputs are a packshot, a product name, and a discount.
- No approved story beat exists, or the only story is the campaign headline.
- The narrative needs a testimonial, rating, clinical result, or performance
  figure that the customer has not supplied and cleared.
- The offer, destination, media rights, or narrator release is unconfirmed.
- The reader is already offer-aware and a story would add friction.
- The product is regulated and the claims have not had the required review.

## 4. Customer inputs

Every row marked **blocks** prevents publication, not preview.

| Input | Required | Used by | Blocks if missing |
| --- | --- | --- | --- |
| Brand tokens, wordmark, legal entity | Yes | Masthead, footer | Yes |
| Campaign source (ad, email, publisher unit) with its exact promise | Yes | Opening headline and standfirst | Yes |
| Audience and awareness stage | Yes | Fit decision and review | No |
| Objective and primary action label | Yes | Product transition and close | Yes |
| Product name and product noun | Yes | Product transition | Yes |
| Offer terms, market, start/end, conditions | Yes | Product transition and close | Yes |
| Destination URL | Yes | Both actions | Yes |
| Approved opening copy: headline and standfirst | Yes | Opening | Yes |
| Two or three approved story beats with source document, quote, reviewer, date | Yes | Story | Yes |
| Narrator name, role, and signed release, if any first-person copy is used | Conditional | Story and byline | Yes |
| Two or three approved product facts with source document, quote, reviewer, date | Yes | Evidence and product | Yes |
| One to four approved images with role, source, rights, alt text, crop note, SHA-256 | Yes | Opening, evidence, product | Yes |
| Disclosure label, sponsor name, explanation, and placement | Yes | Disclosure | Yes |
| Campaign-specific prohibited claims | Yes | Validation | Yes |
| Locale and legal review contact | Yes | Disclosure and claims | Yes |
| Publication surface and URL | Yes | Disclosure and approval | Yes |

The customer may supply approved copy as text or as a signed document. Ornigami
does not turn an unapproved draft into an approved fact. Missing evidence is
shown as a specific missing input in the editor; it is never filled by the
generator.

## 5. Evidence model

### 5.1 Approved story beats

A story beat is a short, approved block of narrative. It is not free copy and
the generator may only select its ID.

```ts
type StoryBeatRole = "opening" | "turn" | "resolution";

type ApprovedStoryBeat = {
  id: string;
  role: StoryBeatRole;
  text: string;
  source: {
    document: string;
    quote: string;
    reviewedBy: string;
    reviewedOn: string;
  };
};
```

Rules:

- Two beats minimum for `advertorial-one-photo`; three maximum for either
  layout.
- Each beat has a source quote from a brand document, a signed interview, or a
  released first-person statement. "The campaign says so" is not a source.
- The generated draft may reorder beats only within the approved arc
  (`opening` before `turn` before `resolution`). It may not merge, shorten, or
  rewrite them.
- A beat that contains a number, date, result, comparison, origin, or material
  claim also needs that claim in the approved fact set.

### 5.2 Facts

Facts reuse the existing `ProductFact` shape: ID, label, value, and source
document/quote/reviewer/date. The advertorial renders at most three. A fact is
eligible only when its source quote contains the value or directly supports it.

The page may not add a proof line, rating, review count, award, guarantee,
deadline, performance figure, or "as seen in" mark that is absent from the
approved set.

### 5.3 Narrator

A narrator is optional. If the story uses "I", "we", or a named person's
experience, the brief needs the narrator's name, role, and a release on file.
The narrator's portrait is optional and uses the `story-opening` role. A
fictional narrator or a composite customer is not allowed.

### 5.4 Images

Each image has one role and one job. The role is part of the approved asset
record, not a styling choice made at render time.

### 5.5 Disclosure

The disclosure has an exact label, sponsor, explanation, and repeat rule.

```ts
type Disclosure = {
  label: "Advertisement" | "Advertorial" | "Paid Post" | "Paid content";
  sponsor: string;
  explanation: string;
  repeatAtClose: boolean;
};
```

Rules:

- The label is chosen by the publication surface and reviewed by the customer's
  legal contact. The template does not choose a weaker label to fit the design.
- The label and sponsor appear before the headline in the DOM and in the visual
  order.
- `explanation` names who created or paid for the content. It is not hidden in
  a tooltip or a footer-only link.
- If `repeatAtClose` is true, repeat the same label and sponsor, not a
  paraphrased version.

### 5.6 Offer and destination

The offer and destination are campaign facts, not draft slots. Both actions use
the same exact destination, action label, and offer text. The template never
creates a second offer, urgency line, coupon, or "learn more" link.

## 6. Template contract

### 6.1 Manifest

```json
{
  "id": "single-product-advertorial",
  "version": "1.0.0",
  "name": "Single product advertorial",
  "format": "Story-led single-product advertorial",
  "requiredInputs": [
    "brandId",
    "productName",
    "productNoun",
    "offer",
    "destinationUrl",
    "actionLabel",
    "disclosure",
    "openingId",
    "storyBeatIds",
    "productTransition",
    "assetAssignments"
  ],
  "allowedAssetRoles": [
    "story-opening",
    "product-detail",
    "product-in-use",
    "product-evidence",
    "product-hero"
  ],
  "layouts": {
    "advertorial-full": {
      "requiredAssetRoles": ["product-hero"],
      "allowedSectionOrders": [
        ["disclosure", "opening", "story", "evidence", "product", "close"],
        ["disclosure", "opening", "story", "product", "close"]
      ],
      "maxStoryBeats": 3,
      "maxFacts": 3,
      "maxImages": 4
    },
    "advertorial-one-photo": {
      "requiredAssetRoles": ["product-hero"],
      "allowedSectionOrders": [
        ["disclosure", "opening", "story", "product", "close"]
      ],
      "maxStoryBeats": 2,
      "maxFacts": 2,
      "maxImages": 1
    }
  },
  "limits": {
    "headline": 90,
    "standfirst": 200,
    "storyBeat": 280,
    "productTransition": 200,
    "disclosure": 140,
    "byline": 80,
    "caption": 120,
    "offer": 180,
    "actionLabel": 40,
    "maxWordsFull": 420,
    "maxWordsOnePhoto": 300
  }
}
```

The manifest is additive. `single-product-offer` v1.0.0 and its section IDs,
layouts, and tests stay unchanged.

### 6.2 Layouts and section orders

| Section | Job | Full | One photo |
| --- | --- | --- | --- |
| `disclosure` | Label the commercial relationship before the story | Required, first | Required, first |
| `opening` | Headline and standfirst that continue the campaign promise | Required | Required |
| `story` | Approved narrative beats | 2–3 beats | 2 beats |
| `evidence` | Facts and a supporting image with a caption | Required when a supporting image or fact needs its own band | Folded into `product` |
| `product` | Product name, transition sentence, product image, offer, first action | Required | Required |
| `close` | Repeat offer and action; no new claim | Required | Required |

The full layout may omit `evidence` when the three facts fit beside the product
without turning the transition into a wall of copy. The one-photo layout never
creates an `evidence` section; its facts sit in the product block.

### 6.3 Types

Add these as a separate module, not by widening the existing `SectionId`.

```ts
type AdvertorialLayoutId = "advertorial-full" | "advertorial-one-photo";

type AdvertorialSectionId =
  | "disclosure"
  | "opening"
  | "story"
  | "evidence"
  | "product"
  | "close";

type AdvertorialAssetRole =
  | "story-opening"
  | "product-detail"
  | "product-in-use"
  | "product-evidence"
  | "product-hero";

type AdvertorialOpening = {
  id: string;
  headline: string;
  standfirst: string;
};

type AssetAssignment = {
  role: AdvertorialAssetRole;
  assetId: string;
};

type AdvertorialBrief = CampaignBrief & {
  format: "advertorial";
  openings: readonly AdvertorialOpening[];
  storyBeats: readonly ApprovedStoryBeat[];
  narrator?: {
    name: string;
    role: string;
    source: string;
    releaseOnFile: boolean;
  };
  disclosure: Disclosure;
  productTransition: string;
  assetAssignments: readonly AssetAssignment[];
};

type AdvertorialPlan = {
  openingId: string;
  layout: AdvertorialLayoutId;
  sections: AdvertorialSectionId[];
  storyBeatIds: string[];
  factIds: string[];
  assetAssignments: AssetAssignment[];
};

type AdvertorialDraft = {
  templateId: "single-product-advertorial";
  templateVersion: "1.0.0";
  layout: AdvertorialLayoutId;
  layoutReason: string;
  sections: AdvertorialSectionId[];
  headline: string;
  standfirst: string;
  story: ApprovedStoryBeat[];
  facts: ProductFact[];
  productTransition: string;
  disclosure: Disclosure;
  assetAssignments: AssetAssignment[];
};
```

The generator proposes IDs and structure. The server assembles `AdvertorialDraft`
from the approved brief. The generator never returns headline, standfirst,
story, transition, disclosure, offer, destination, or asset text.
`CampaignBrief.copy` is not used by the advertorial; the selected
`AdvertorialOpening` and approved story beats are authoritative.

Asset typing: either widen `AssetRole` additively with the four new roles, or add
`AdvertorialAsset = Omit<ApprovedAsset, "role"> & { role: AdvertorialAssetRole }`.
The existing `single-product-offer` manifest keeps allowing only `product-hero`,
so its validation does not change.

### 6.4 Validation

`validateAdvertorialBrief` runs before generation. `validateAdvertorialDraft`
runs before preview. Both return section-labelled issues.

Required rejections:

- Missing or empty disclosure, sponsor, or explanation.
- A disclosure label outside the allowed set.
- A story beat ID that is not approved, a beat with no source quote, or a beat
  that exceeds its limit.
- A first-person story without a narrator release on file.
- More than the layout's story-beat, fact, or image maximum.
- A fact, offer, destination, action label, product name, or asset hash that
  differs from the campaign brief.
- A missing `product-hero` asset, an unreviewed asset, empty alt text, or a
  rights note that still says pending.
- An image role that the layout does not allow.
- A section order outside the manifest.
- A `product` section without offer and action, or a `close` without both.
- An action link inside `opening`, `story`, or `evidence`.
- A second destination, a second offer, or more than two actions.
- A one-photo draft with a `story-opening`, `product-detail`, or
  `product-in-use` assignment, or an empty image frame.
- A full draft with fewer than two images, unless the brief explicitly selects
  the one-photo layout.

### 6.5 Generation boundary

The existing generation route may return a plan only when the brief declares
`format: "advertorial"` and every required input is present. Otherwise it
returns a specific `not-applicable` reason and the editor recommends
`single-product-offer`.

A valid plan:

1. Names an approved opening ID.
2. Names a layout and an allowed section order.
3. Selects approved story-beat IDs in arc order.
4. Selects approved fact IDs.
5. Assigns approved asset IDs to allowed roles.
6. Contains no copy.

Invalid output leaves the previous valid preview usable and names the failing
section. It never silently falls back to an offer page with advertorial labels.

### 6.6 Revision and approval

The revision hash includes template ID/version, layout, section order,
disclosure, narrator, story beats, facts, product transition, offer,
destination, action label, product name, asset content hashes, and resolved
brand tokens. Any edit clears approval. Publishing consumes an approved
revision, and a failed publish preserves the previous live page.

## 7. Section evidence requirements

| Section | Required evidence | May render | Must not render |
| --- | --- | --- | --- |
| `disclosure` | Commercial relationship source; exact label and sponsor | Label, sponsor, short explanation | A hidden footer-only label; a weaker label chosen for design |
| `opening` | Campaign source promise; approved headline and standfirst | Headline, standfirst, optional opening image | A new statistic, guarantee, or product claim |
| `story` | Two or three approved beats with source quotes; narrator release if first person | Approved beats and optional captions | A composite customer, invented biography, or unsourced number |
| `evidence` | Approved fact sources; image source, rights, alt, caption | Two or three facts; detail or evidence image | A rating, review count, award, or performance claim |
| `product` | Product name source; approved transition; approved packshot; offer terms; destination | Product name, one-sentence transition, image, offer, first action | A second CTA, urgency line, coupon, or marketplace badge |
| `close` | Same offer, destination, and action label | Offer and action repeated | New copy, new deadline, or a different destination |

If a section has no evidence, remove the section or choose the offer template.
Do not fill it with brand voice.

## 8. Image roles

| Role | Job | Must show | Must not imply | Fallback |
| --- | --- | --- | --- | --- |
| `story-opening` | Establish the world, problem, person, or change | A real scene or person that the story names; a caption if the link is not obvious | That the product caused an outcome the page cannot prove | Type-led opening |
| `product-detail` | Prove one approved fact | The detail the adjacent fact names, legible at 375 px | A performance result or a material claim absent from the fact | Fact band only |
| `product-in-use` | Show scale or ritual | The product in a real use the customer approved | A result, comparison, or safety claim | Omit; do not stage a fake use |
| `product-evidence` | Document a prototype, source, or test | The document or object and its visible label | A test result the document does not state | Omit |
| `product-hero` | Recognise the product and carry the transition | The full pack, wordmark, variant, and visible label | A variant or count the pack does not show | Required; without it the format is not a fit |

Every image has reviewed alt text, source, rights, crop note, dimensions, and a
content hash. Decorative images are not used. A caption names what is visible;
it does not repeat the alt text or the adjacent fact.

### 8.1 One-photo layout behaviour

The one photo is the `product-hero`. It is not cropped into a fake lifestyle
image and it is not repeated in the opening.

- Mobile: the opening is type-led. The single photo appears in the `product`
  section at its natural aspect ratio, `object-fit: contain`, on the brand
  surface. The full pack and printed label stay inside the frame at 375 px.
- Desktop: the product block is a two-column split. The image gets 5 of 12
  columns and is not stretched to the viewport width. The copy gets 6 columns
  with one empty gutter column.
- The page uses two story beats and two facts. There is no evidence band and no
  image caption that pretends the packshot is evidence of use.
- If the only usable image is a detail or in-use photo without a recognisable
  pack, the format is not a fit. Use the offer template or ask for a packshot.

## 9. Mobile outline

Target: 375–430 px. The first screen is approximately 812–844 px tall. The
order below is the DOM order. It shows the full layout; the one-photo layout
removes the opening image, the detail image, and the evidence band.

```text
┌──────────────────────────────────────────────┐
│ ADVERTISEMENT · MORROW CERAMIC               │  disclosure strip, 36–40px
├──────────────────────────────────────────────┤
│ Morrow                                       │  masthead, 52–56px
├──────────────────────────────────────────────┤
│ Why Morrow revised the rib spacing           │  h1, 2–4 lines, no CTA
│ inside its ceramic dripper                   │
│                                              │
│ What changes when your first pour            │  standfirst, 2–3 lines
│ is slower?                                   │
├──────────────────────────────────────────────┤
│ [ story-opening image, 4:5 or 3:2 ]          │  optional; first screen may
│ Caption naming the scene, if needed.         │  show only the top of it
├──────────────────────────────────────────────┤
│ In the first prototype, the filter sat       │  story beat 1
│ against the wall.                            │
│                                              │
│ Morrow revised the spacing between the       │  story beat 2
│ three interior ribs.                         │
├──────────────────────────────────────────────┤
│ INTERIOR      OUTLET        BODY             │  fact band, 2–3 facts
│ Three ribs    Single outlet Ceramic          │
│                                              │
│ [ product-detail image ]                     │  optional; caption names
│ Three raised interior ribs.                  │  the visible detail
├──────────────────────────────────────────────┤
│ Morrow ceramic pour-over dripper             │  product h2
│ A ceramic dripper with three interior ribs   │  approved transition
│ and a single outlet.                         │
│                                              │
│ [ product-hero image, contain, 4:5 ]         │  the only image in the
│                                              │  one-photo layout
│ Free shipping through 30 November 2026       │  offer, next to action
│ [ See the dripper ]                          │  FIRST BUYING ACTION
├──────────────────────────────────────────────┤
│ Free shipping through 30 November 2026       │  close, no new claim
│ [ See the dripper ]                          │  same destination
├──────────────────────────────────────────────┤
│ Morrow · Advertisement · © 2026              │  footer; repeat disclosure
└──────────────────────────────────────────────┘
```

Notes:

- The disclosure is the first visible line. It is not a badge floating over the
  image and it is not below the headline.
- The first screen may end inside the opening image. It must not contain a
  buying action. The first action appears at the product transition, normally
  in the second or third screen.
- The standfirst does not repeat the headline. It adds the one fact or tension
  the headline cannot carry.
- The story beats are short paragraphs, not cards. No eyebrows such as "The
  problem" or "The solution".
- The fact band uses a rule and spacing, not badges or icon tiles.
- The offer sits directly above the action. The action is full-width and at
  least 48 px tall.
- The close repeats the offer and action only. It does not repeat the product
  name or a second summary.

## 10. Desktop outline

Target: 1120–1200 px content width inside a 1440 px viewport. Use a 12-column
grid with 64 px outer gutters and 24 px column gaps. The outline shows the full
layout; the one-photo layout removes the opening band, the offset detail image,
and the evidence band.

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ADVERTISEMENT · MORROW CERAMIC                          Morrow       │ disclosure + masthead
├──────────────────────────────────────────────────────────────────────┤
│ Why Morrow revised the rib spacing                     What changes  │ h1 7 cols / standfirst
│ inside its ceramic dripper                             when your     │ 4 cols, aligned to the
│                                                        first pour is │ headline's baseline
│                                                        slower?       │
├──────────────────────────────────────────────────────────────────────┤
│ [ story-opening image, full-width 21:9 or 2:1 ]                      │ optional cinematic band
│ Caption, left aligned under the image.                               │
├──────────────────────────────────────────────────────────────────────┤
│ In the first prototype, the filter sat against the wall.             │ story text 6 cols
│                                                                      │
│ Morrow revised the spacing between the three interior ribs.          │ detail image 5 cols,
│ [ product-detail image ]                                             │ offset 1 col
├──────────────────────────────────────────────────────────────────────┤
│ INTERIOR              OUTLET                BODY                     │ evidence band, tinted
│ Three ribs            Single outlet         Ceramic                  │ surface; 3 columns
├──────────────────────────────────────────────────────────────────────┤
│ [ product-hero image ]              Morrow ceramic pour-over dripper │ product split 6/6
│                                     A ceramic dripper with three     │
│                                     interior ribs and a single       │
│                                     outlet.                          │
│                                                                      │
│                                     Free shipping through 30 Nov     │
│                                     [ See the dripper ]              │ FIRST ACTION
├──────────────────────────────────────────────────────────────────────┤
│ Free shipping through 30 November 2026              [ See the dripper ]│ close row
├──────────────────────────────────────────────────────────────────────┤
│ Morrow · Advertisement · © 2026                                       │ footer
└──────────────────────────────────────────────────────────────────────┘
```

Notes:

- The wide canvas is used for a deliberate measure and image rhythm. Do not
  center a 390 px column.
- The opening image is a band, not a gallery. It appears once.
- The story text measure stays at 60–70 characters. The detail image is offset,
  not floated into the text.
- The evidence band may use the brand's dark or tinted surface, but the fact
  values remain the largest text in the band.
- The product split is 1:1. The offer and action are paired in the right column.
  The action is not pushed below the image.
- The close is a single row. The offer is left, the action right, both aligned
  to the same baseline.

## 11. Copy and redundancy rules

1. **One promise.** The headline and standfirst state the campaign promise
   once. The standfirst adds a fact or tension; it does not paraphrase the
   headline.
2. **One product introduction.** The product name appears at the transition.
   The close does not repeat it; the action label and offer are enough.
3. **One offer, twice maximum.** The offer appears with the first action and
   once at the close. It does not appear in the disclosure, opening, story, or
   evidence band.
4. **One disclosure label.** The label and sponsor appear at the top. Repeat
   them at the close only when the publication requires it. Do not add a third
   "Advertorial" badge over the image.
5. **No section eyebrows.** Remove "The problem", "The story", "The product",
   "Why it works", and similar labels. Spacing and type carry the structure.
6. **No caption echo.** A caption names what is visible. It does not repeat the
   alt text, the heading, or the adjacent fact.
7. **No helper paragraphs.** If a line only explains the layout, remove it. If
   the layout needs it, fix the layout.
8. **No second action.** No "Learn more", "Read the story", "Follow", or
   "Watch" link competes with the product action. Publisher-required legal
   links stay in the footer.
9. **No invented urgency.** No countdown, "while supplies last", stock number,
   or deadline that is not in the approved offer.
10. **No decorative proof.** No logo bar, star rating, review count, award
    badge, or "as seen in" strip unless the customer supplied the exact proof
    and its source.

## 12. UX, DX, and AX

**UX.** A reader can see that the page is an advertisement, understand the
promise, follow a short story, recognise the product, and act without hunting
for terms. An editor can change one approved opening, story beat, fact, or image
and regenerate without losing the last valid preview. Checked against the
existing editor's approval and last-valid-preview behaviour.

**DX.** The advertorial is a separate manifest and module that reuses the
existing brief, fact, asset, validation, revision, and renderer patterns. The
single-product offer template is untouched. A developer can verify the new
layout with two fixtures and roll it back by removing the template registration.
Checked against the existing `SINGLE_PRODUCT_OFFER_TEMPLATE` contract and its
focused tests.

**AX.** An agent can find the template ID, allowed roles, section orders,
limits, approved IDs, and the exact missing input from a stable error. The
generator returns a plan, not copy, and the server rejects unfamiliar IDs with a
section name. Checked against the existing plan validation and `data-*` preview
metadata.

Trade-off: the advertorial deliberately delays the first action until after the
story and evidence. That may reduce immediate clicks compared with the offer
template. It is the format's premise, not a proven conversion gain. Test it with
a same-ad split against the offer page and judge cost per purchase; do not
average a visual preference into a factual gate.

## 13. Visual review checklist

Use this at 375 px and 1440 px on the exact preview revision. Mark each item
pass, fail, or unassessed. A fail blocks release; unassessed is not a pass.

- [ ] The disclosure label and sponsor are visible before the headline without
      scrolling at 375 px and 1440 px.
- [ ] The first screen continues the campaign promise; it does not start with a
      generic brand slogan.
- [ ] No buying action appears before the product section.
- [ ] The first action has the offer terms in the same visual block.
- [ ] Both actions use the same label and destination; no third action exists.
- [ ] The product name appears once at the transition, not in every section.
- [ ] The offer appears at most twice.
- [ ] The headline and standfirst do not repeat each other.
- [ ] Every story beat is traceable to an approved source; no invented proof,
      rating, guarantee, deadline, or performance figure appears.
- [ ] Every image has a named role, reviewed alt text, and a caption only when
      the link to the argument is not obvious.
- [ ] The packshot's wordmark, variant, count, and printed label survive the
      crop at 375 px.
- [ ] The one-photo layout has no empty image frame, no fake lifestyle crop, and
      no image in the opening.
- [ ] Story text measure is 45–70 characters on mobile and 60–70 on desktop.
- [ ] The desktop composition uses the width deliberately; it is not a centered
      mobile column.
- [ ] Keyboard focus is visible on both actions; the first Tab order reaches the
      disclosure, then the story, then the product action.
- [ ] There is no horizontal overflow at 375 px, and reduced motion leaves the
      same content and actions.
- [ ] The page still reads as the brand with the wordmark hidden.

## 14. Implementation plan and acceptance

1. Add `AdvertorialLayoutId`, `AdvertorialSectionId`, `AdvertorialAssetRole`,
   `ApprovedStoryBeat`, `Disclosure`, `AdvertorialOpening`, `AdvertorialBrief`,
   `AdvertorialPlan`, and `AdvertorialDraft`.
2. Add `src/lib/campaign-lab/advertorial.ts` with the manifest, deterministic
   assembler, brief/draft validation, revision hash, and a `not-applicable`
   result for missing inputs.
3. Add `AdvertorialPage` and CSS beside `CampaignPage`. Reuse brand tokens and
   container queries; do not fork the token system.
4. Add a format selector to Campaign Lab. When the brief is not advertorial-fit,
   show the missing inputs and recommend `single-product-offer`.
5. Add fixtures: Morrow full-material, Morrow one-photo, and a negative fixture
   with a missing disclosure or unapproved story beat. Keep Momisa as an
   offer-only pilot, not an advertorial fixture.
6. Add focused tests and browser acceptance.

Acceptance:

- `npx tsc --noEmit` and the focused ESLint command pass.
- Unit tests reject every item in §6.4 with a specific section message.
- At 375 and 1440 px: no overflow; disclosure precedes the headline in the DOM
  and visually; two actions resolve to the exact destination; no action appears
  before `product`; alt text is present; packshot label is legible.
- Content checks: story beats and facts match approved sources; no forbidden
  claim; offer repeated no more than twice; no duplicate headline/standfirst.
- Revision checks: changing a story beat, fact, image, offer, or destination
  invalidates approval and requires a fresh preview.
- Manual visual checklist in §13 is completed on the exact revision.

## 15. Open decisions

- The disclosure label per surface (`Advertisement`, `Advertorial`, `Paid Post`,
  `Paid content`) needs legal and publisher confirmation. Do not let the
  template default to the shortest label.
- A narrator portrait is not a separate role in v1. Use `story-opening` until a
  real need appears.
- A sticky mobile offer bar is not part of v1. It would put the action before
  the story and weaken the format's premise.
- A full layout may omit the evidence band when the facts fit the product
  block. Reviewers should prefer the shorter page, not the fuller template.
- A detail-only photo does not unlock the one-photo advertorial. The one photo
  must be a recognisable product hero.
