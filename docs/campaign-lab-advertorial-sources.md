# Advertorial research sources

Research date: 15 November 2026. This note records what was actually visible on
three live advertorials, what was measured, and which conclusions are design
judgments rather than conversion evidence. No external design tool was invoked.
The in-app Chromium browser and a local Playwright Chromium run were used only
to read pages and capture measurements.

## Scope and method

- Pages: three live advertorials with different commercial relationships.
- Viewports: 390 × 844 (mobile) and 1440 × 900 (desktop), plus one 1000 × 700
  in-app browser read for DOM section positions.
- Evidence: rendered text, DOM order, bounding boxes measured from the top of
  the document, links, image alt text, and full-page captures.
- Captures and raw JSON stay under `.local/advertorial-research/` (Git-ignored).
- No analytics, heatmaps, A/B results, or conversion data were available. No
  page's conversion performance is claimed here.

The repository `AGENTS.md` at `bc58db6` contains only the generated Next.js
agent block; it adds no design rules. The project design rules were read from
the main checkout at
`C:/Users/joser/Desktop/Projects/Ornigami/docs/design/RULES.md`,
`WORKFLOW.md`, and `BENCHMARK.md`. Those files are untracked in that checkout
and are not present at `bc58db6` in this repository. The spec restates the rules
it uses instead of copying the files into this branch. See "Rules applied"
below.

## 1. NYT Paid Post — Rolex, “Piyush Tewari & Building Communities”

- Original: <https://www.nytimes.com/paidpost/rolex/piyush-tewari-and-building-communities.html>
- Publisher: The New York Times / T Brand Studio
- Sponsor: Rolex
- What could be inspected: the complete paid post, disclosure, hero, interview
  text, image sequence, and the series navigation at the end. The page loaded
  behind a privacy dialog; the dialog was dismissed without accepting tracking.
- Sections observed, in order:
  1. NYT masthead.
  2. Rolex logo and `PAID POST` bar.
  3. Disclosure paragraph.
  4. Hero portrait of Piyush Tewari.
  5. Campaign title, “REWRITING THE RULES of Modern Leadership”.
  6. Interview introduction and Q&A.
  7. Four editorial images.
  8. Series navigation to the other Rolex paid posts.

**Disclosure.** Above the hero, before the story: a `PAID POST` bar with the
Rolex logo, then “This content was created by T Brand Studio and Rolex to
highlight exceptional individuals, true leaders in their own field. This content
was created and produced independently of The New York Times news and opinion
staff.” This is the clearest of the three examples: sponsor, producer, and
independence statement are all before the first image.

**Mobile reading sequence.** Header → sponsor/`PAID POST` → disclosure → hero
image at 194 px → campaign title at 761 px → story. The title is below the first
screen fold at 844 px; the first screen is disclosure, portrait, and the start of
the campaign title.

**Transition to the product.** There is no product transition in the commercial
sense. The product is a watch visible in the portraits, and the page closes with
links to more Rolex stories. The page earns attention through a named person and
a reported interview; the brand association is the conversion.

**Images.** Four images at 390 px: portrait (340 × 383), second portrait
(330 × 413), wide scene (320 × 180), and a closing image (330 × 233). All four
had empty `alt` attributes in the inspected DOM. Their job is credibility and
atmosphere, not product proof. The watch is incidental.

**First buying action.** None. No price, offer, product link, or purchase
action was present. The only links were the series navigation and NYT
navigation.

**Observation vs guess.** `[Observed]` Disclosure precedes the story; no
commerce action exists. `[Judgment]` The format works here because the story is
independently credible and the brand association is the point. `[Hypothesis]`
This page would not suit a direct-response offer without a new product block;
that was not tested.

## 2. Guardian Labs — Sainsbury’s, “Recipes from FEED” mazesoba recipe

- Original: <https://www.theguardian.com/recipes-from-feed/2026/aug/14/jimi-famurewas-sausage-egg-and-shiitake-mazesoba-recipe>
- Publisher: The Guardian / Guardian Labs
- Sponsor: Sainsbury’s
- What could be inspected: the complete recipe article, paid-content strip,
  sponsor credit, byline, ingredient list, method, and the retail link. The
  consent dialog covered the first capture; it was hidden for a second capture
  without changing page content.

**Sections observed, in order:**

1. Guardian header and navigation.
2. `Paid content` strip with an `About` link and the Guardian Labs mark, above
   the hero image.
3. Full-bleed food photograph.
4. Section label “Recipes from FEED”.
5. Headline and standfirst.
6. `Paid for by` and the Sainsbury’s logo.
7. `About this content` link.
8. Byline and author portrait.
9. Intro, ingredients, and method.
10. “Shop the full range of Sainsbury’s Taste the Difference ingredients” link.
11. “Watch the full episode of FEED…” link.
12. Footer disclosure.

**Disclosure.** A `Paid content` strip sits above the hero image and includes an
`About` link. The sponsor name appears after the standfirst as `Paid for by` plus
the Sainsbury’s logo. The footer says: “This content was paid for by Sainsbury’s
and produced by the Guardian Labs team.” The label is visible before the story
on mobile; the sponsor name is one screen later.

**Mobile reading sequence (390 × 844).** Image at 235 px → headline at 578 px →
standfirst at 694 px → sponsor at 830 px → author at 964 px → intro at 1,097 px →
ingredients at 1,530 px → method at 2,458 px → shop link at 3,535 px. This is an
image-first opening, not a headline-first opening.

**Transition to the product.** The recipe is the product argument: Sainsbury’s
Taste the Difference ingredients are named inside the ingredient list, then the
page offers a single link to the full range. The reader gets a usable recipe
first. The transition is earned by utility, not by a founder story or a
mechanism claim.

**Images.** One hero food photograph with descriptive alt text, the Sainsbury’s
logo, and the author portrait. No packshots and no step-by-step images. The hero
photograph does the appetite and context work; the ingredient names carry the
product.

**First buying action.** “Shop the full range…” at 3,535 px on mobile, after the
complete recipe. That is roughly 4.2 mobile screens. On desktop it measured at
3,764 px. There is no price, discount, or offer; the action is a range link, not
a buy box.

**Observation vs guess.** `[Observed]` The retail link comes after the recipe,
and the page has one hero image. `[Judgment]` The page earns the link because the
recipe is useful without the link. `[Hypothesis]` A direct offer placed earlier
would change the reading contract; it was not tested.

## 3. Clarifion — “How this grandma turned her dusty house…” advertorial

- Original: <https://about.clarifion.com/ionizer/tbl/lp4>
- Publisher: Clarifion (brand-hosted)
- What could be inspected: the complete long-form advertorial text, top label,
  headline, byline, compensation note, hero image, mechanism section, review
  section, pricing section, both calls to action, citations, and footer
  disclosures.
- This page is included as a structural example, not as an endorsement of its
  claims or evidence. Its testimonial and review practices are a caution.

**Sections observed, in order (desktop positions from the top):**

1. Small `Advertorial` bar at 0 px.
2. Clarifion logo.
3. Headline at 85 px.
4. Date and compensated-customer note.
5. Hero image of a dusty ceiling fan.
6. Long problem story.
7. “How does the Clarifion device work?” mechanism section at 2,659 px.
8. Customer-count and social-proof section at 3,514 px.
9. “Customers are spreading the word…” reviews at 4,725 px.
10. “I tested Clarifion myself…” section at 6,114 px.
11. “46% off the retail price” at 6,656 px.
12. Pricing section at 7,586 px.
13. “Clarifion’s website is currently running…” at 8,271 px.
14. First buying link at 8,810 px.
15. Closing action at 8,941 px.
16. Citations and footer disclosures.

**Disclosure.** A very small `Advertorial` bar sits at the top, above the logo.
The footer carries “THIS IS AN ADVERTISEMENT AND NOT AN ACTUAL NEWS ARTICLE,
BLOG, OR CONSUMER PROTECTION UPDATE”, plus marketing and affiliate disclosures.
The top label is easy to miss at 390 px; the footer is far from the headline.
This is a weaker disclosure pattern than the NYT or Guardian examples.

**Mobile reading sequence.** Label → logo → headline at 85 px → date →
compensation note → hero image → story. The first buying action measured at
15,825 px on a 390 px viewport, with a 17,667 px document height. The page is
roughly 18 mobile screens before the first action.

**Transition to the product.** Problem story → mechanism explanation → customer
count and reviews → “I tested it myself” → discount → price → action. The product
is named after the problem has been agitated, and the offer appears after a large
volume of proof. The transition is earned by repetition and social proof, but the
proof quality is not independently verified in the inspected page.

**Images.** The inspected images had empty `alt` attributes. The hero shows a
dusty ceiling fan, not the product. Later images support the story and reviews.
The product is not the opening image.

**First buying action.** 8,810 px on a 1000 × 700 desktop read; 15,825 px on
mobile. No action in the first screen.

**Observed claims that should not be reused.** “84% of Americans suffer from
allergy symptoms inside their own homes”, “More than 76,413 new customers”, and
“verified reviews” are presented without inspectable substantiation in the page.
The page also notes that the featured customer was compensated. These are
observations about the page, not findings about the product.

**Observation vs guess.** `[Observed]` The label is small; the action is very
late; images lack alt text; the page relies on testimonial volume. `[Judgment]`
The structure is a direct-response pre-sell, not an editorial advertorial; its
evidence discipline is not a model for Ornigami. `[Hypothesis]` Shortening it
would probably change its persuasion, but no test data was available.

## Cross-case observations

| Question | NYT / Rolex | Guardian / Sainsbury’s | Clarifion |
| --- | --- | --- | --- |
| Disclosure position | Above hero, `PAID POST` + explanation | Above hero, `Paid content` strip; sponsor after standfirst | Tiny top `Advertorial`; full text in footer |
| First screen commerce | None | None | None |
| Opening element | Disclosure then portrait | Hero image then headline | Micro-label, logo, headline |
| Product transition | Brand association; no product block | Branded ingredients inside a useful recipe | Product after problem, mechanism, reviews, price |
| First buying action | None | 3,535 px mobile / 3,764 px desktop | 15,825 px mobile / 8,810 px desktop |
| Image job | Credibility and atmosphere | Appetite and context | Problem visual and testimonial support |
| Alt text | Empty on inspected images | Present | Empty on inspected images |
| Proof source | Reported interview | Recipe utility and named ingredients | Compensated story, reviews, citations |

### What the sample supports

- `[Observed]` All three put the commercial label before the headline or at the
  very top of the page. None hides it only in the footer, although Clarifion’s
  top label is much weaker than the other two.
- `[Observed]` None puts a buying action in the first screen. The earliest
  buying action in the sample is after a complete recipe; the latest is after a
  long argument.
- `[Observed]` The opening image is not a packshot in any of the three. It is a
  person, a finished dish, or the problem. The packshot, when it appears, comes
  later.
- `[Observed]` Each page earns the transition differently: credibility (Rolex),
  utility (Guardian), or problem agitation and volume of proof (Clarifion).
- `[Judgment]` A story or utility has to be worth reading on its own. When it is
  not, the page becomes a long sales page with a label, as Clarifion shows.
- `[Judgment]` The strongest pattern for Ornigami is the Guardian structure:
  one clear image, a useful argument, named product facts, and one retail link
  after the argument. It fits a short page and a single product better than the
  NYT campaign series or the Clarifion pre-sell.
- `[Hypothesis]` Delaying the action may improve completion but does not
  necessarily improve conversion. The only honest test is a same-ad split
  against the offer page, judged on cost per purchase. This research did not
  measure that.

### What the sample does not support

- No claim that a longer page, a story opening, or a late CTA increases sales.
- No claim that a particular image count, word count, or disclosure style is
  optimal.
- No claim that the Clarifion claims are true or that its testimonial practice
  is acceptable.
- No claim that a mobile capture at one moment represents the page's current or
  personalized state.

## Rules applied

Quoted from `docs/design/RULES.md`:

- “Every visible line earns its place by communicating the offer, answering a
  question, helping someone act, providing evidence, or giving necessary terms
  or feedback.”
- “Give each page one primary action. Repeat it only where useful. Connect the
  first screen to the promise that brought the visitor there. Make the product
  and action clear on mobile. Show offer terms next to the action when they
  affect the decision.”
- “Let the format guide the sequence. An advertorial earns the product
  transition through a story.”
- “Use only approved facts, media, quotes, prices, terms, and destinations.”
- “Leave out decorative eyebrows, repeated introductory lines, badges, icon
  grids, gradients, and animation unless they have an identifiable job in this
  campaign.”
- “**UX** — Can a visitor understand and act? Can an editor change one thing
  without losing approved work? **DX** — Does the change use a reviewed
  component or a reusable template variant? Can a developer verify it and roll
  it back? **AX** — Can an agent find the relevant inputs, select valid
  components, and recover from an error with a clear explanation?”

The workflow's select/direct/verify steps supplied the structure for the fit
decision, the section evidence table, and the review checklist.

## Limits

- Pages were inspected once, on 15 November 2026. They may change or be removed.
- Consent overlays, personalization, and dynamic ad units can change the first
  screen. Measurements are from the rendered state described above.
- Bounding boxes are CSS pixels from the top of the document, not viewport
  impressions. They are useful for sequence, not for a performance claim.
- No screen reader, physical device, slow connection, or reduced-motion test was
  performed on the researched pages.
- No conversion, revenue, or engagement data was inspected. Every conversion
  statement here is a hypothesis, not a finding.
- The Clarifion page is a negative example for evidence and disclosure quality.
  It is not a template to copy.
