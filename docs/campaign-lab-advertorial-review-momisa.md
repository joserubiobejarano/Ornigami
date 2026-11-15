# Review brief — Momisa Glow Box (offer-only)

Campaign: Momisa Glow Box
Purpose: decide whether the supplied Momisa materials can support an advertorial,
and if not, define the honest page they can support.
Recommendation: **do not build an advertorial from these inputs.** Use the
existing `single-product-offer` template for the campaign page. The packaging
can support a narrow **product-selection page** if Momisa approves its printed
claims; it does not support a story-led advertorial.

Companion documents: [specification](./campaign-lab-advertorial-spec.md),
[research sources](./campaign-lab-advertorial-sources.md),
[Morrow full-material brief](./campaign-lab-advertorial-review-morrow.md).

## Supplied materials

The Momisa package is local and Git-ignored. It is not committed with this
branch. The paths below are the operator's working copy:

| Material | Path | Status |
| --- | --- | --- |
| Pilot brief, brand tokens, openings, facts | `.local/campaign-lab-pilots/momisa/pilot.json` | Local, preview |
| Runtime manifest | `.local/campaign-lab-pilots/momisa/manifest.json` | Generated, local |
| Proposed acceptance manifest | `.local/campaign-lab-pilots/momisa/acceptance.json` | Local, proposed |
| Product packshot | `.local/campaign-lab-pilots/momisa/assets/momisa-glow-box-front.jpg` | Local, rights pending |
| Source pouches for claim checks | `.local/campaign-lab-pilots/momisa/source-pouches/` | Local, evidence only |

The source packshot is `C:/Users/joser/Desktop/Projects/Momisa/IMG/Box.jpg`
(2500 × 2500). Its recorded SHA-256 is
`6b5521df6d67249ff7c50a2ff88836a655720dcd27779de2eed0ef2ac3974211`. The pilot
records the rights as “Pilot use only. Confirm Momisa media rights before
publication.”

The pilot status is `preview`. The offer and destination are benchmark
placeholders, not confirmed Momisa terms.

## What the packaging actually shows

The packshot was inspected directly. The box front shows:

- `momisa` wordmark.
- `Vitamin C`
- `DEEP COLLAGEN`
- `Hyaluronic Acid`
- `3 SHEET MASKS`
- `For all skin types`
- A pink flower illustration.

The three source pouches were also inspected. Their printed front copy adds:

| Pouch | Printed claim | Printed use time | Net weight |
| --- | --- | --- | --- |
| Vitamin C | “Brightens the skin, evens out skin tone and reduces dark spots” | 20–25 minutes | 0.88 fl oz / 25 g |
| Deep Collagen | “Provides intense hydration and promotes skin elasticity by delivering collagen deep into the skin” | 30–40 minutes | 0.78 fl oz / 22 g |
| Hyaluronic Acid | “Perfect for revitalizing dry, dehydrated, or tired skin, leaving it soft and refreshed” | 15–20 minutes | 0.88 fl oz / 25 g |

Each pouch also prints an ingredient list and `Made in PRC`. The box itself does
not carry the per-mask benefit text; that text is on the individual pouches.

The packshot does not show:

- The words “Glow Box” as a product name.
- A price, discount, date, marketplace, or retailer.
- A review, rating, award, testimonial, or clinical study.
- A one-of-each mapping between the three names and the three masks.
- A night-by-night routine or a skin-concern selection chart.

The pouch filenames are reversed for at least two files (`Collagen-Mask.jpg`
shows the Vitamin C pouch; `Vitamin-Mask.jpg` shows the Deep Collagen pouch).
The printed wording, not the filename, is authoritative. The source pouch
hashes match the pilot handoff.

## Claim source table

Every claim that could appear on the page is listed with its source and whether
it may render. “Printed” means observed on the supplied packaging; it does not
mean independently substantiated or approved for advertising.

| Claim | Source | Status | May render? |
| --- | --- | --- | --- |
| `Momisa Glow Box` product name | `pilot.json` campaign name; not printed on `Box.jpg` | Supplied campaign information, not packaging evidence | Only after Momisa confirms the name |
| `momisa` wordmark | `Box.jpg` | Observed printed on the pack | Yes |
| `3 sheet masks` | `Box.jpg`: `3 SHEET MASKS` | Observed printed on the pack | Yes |
| `For all skin types` | `Box.jpg`: `For all skin types` | Observed printed on the pack | Yes |
| `Vitamin C sheet mask` | `Box.jpg` front; `Collagen-Mask.jpg` printed `VITAMIN C Sheet Mask` | Observed printed | Yes |
| `Deep Collagen sheet mask` | `Box.jpg` front; `Vitamin-Mask.jpg` printed `DEEP COLLAGEN Sheet Mask` | Observed printed | Yes |
| `Hyaluronic Acid sheet mask` | `Box.jpg` front; `HA-Mask.jpg` printed `HYALURONIC ACID Sheet Mask` | Observed printed | Yes |
| The box names the three variants | `Box.jpg` front names all three; `3 SHEET MASKS` | Supported by the front of the pack | Yes, as a description; do not claim one of each without confirmation |
| Vitamin C brightens, evens tone, reduces dark spots | `Collagen-Mask.jpg` printed front | Printed claim, not approved for this campaign | No in the current pilot; only after Momisa claim review |
| Deep Collagen hydrates, promotes elasticity, delivers collagen | `Vitamin-Mask.jpg` printed front | Printed claim, not approved for this campaign | No in the current pilot; only after Momisa claim review |
| Hyaluronic Acid revitalizes dry, dehydrated, or tired skin | `HA-Mask.jpg` printed front | Printed claim, not approved for this campaign | No in the current pilot; only after Momisa claim review |
| Usage times: 20–25, 30–40, 15–20 minutes | The three pouches | Printed directions, not approved for this campaign | No in the current pilot; only after review |
| `30% off the Momisa Glow Box for Black Friday` | `pilot.json` offer | Benchmark placeholder, not confirmed by Momisa | No |
| Amazon search destination | `pilot.json` URL | Preview search URL, not a direct listing | No |
| “Your mask night, sorted.” | `pilot.json` opening copy | Approved campaign copy, not a product claim | As copy only; not as evidence |
| “Three masks. One Glow Box.” | `pilot.json` opening copy | Approved campaign copy; “Glow Box” name unconfirmed | As copy only, after name confirmation |
| “A mask for each night.” | `pilot.json` opening copy | Campaign copy; no printed routine or frequency | As copy only; not as a routine claim |
| A night-by-night routine or skin-concern chart | None | Not supplied | No |
| Reviews, ratings, customer count, awards, clinical results | None | Not supplied | No |
| Current pack, variant, and count | `Box.jpg` and pouches | Visual check only; physical pack not verified | Publication blocker until Momisa confirms |
| Media rights for the packshot and pouch photos | `pilot.json` rights note | Pending | Publication blocker |

The pilot's approved fact set deliberately includes only the pack names, the
count, and “for all skin types.” It does not include the pouch benefit language.
That is the right default until Momisa approves the claims.

## Can the inputs support a narrow product-selection page?

Yes, but not an advertorial. The packaging supports a short selection page that
answers “which mask is which?” with printed claims:

| Selection | Printed source | What the page may say |
| --- | --- | --- |
| Vitamin C | `Collagen-Mask.jpg` | “The Vitamin C sheet mask is printed for brightening, evening tone, and reducing the look of dark spots.” |
| Deep Collagen | `Vitamin-Mask.jpg` | “The Deep Collagen sheet mask is printed for hydration and elasticity.” |
| Hyaluronic Acid | `HA-Mask.jpg` | “The Hyaluronic Acid sheet mask is printed for dry, dehydrated, or tired skin.” |
| The set | `Box.jpg` | “Three sheet masks. For all skin types.” |

This is a **product-selection page**, not an advertorial:

- It has no problem, narrator, documented change, or story arc.
- It has one packshot and three pouch photos, but the current template accepts
  one `product-hero` image; the pouch photos are evidence, not render roles.
- It still needs a confirmed name, offer, destination, media rights, and claim
  review.
- It should attribute the benefits to the printed pack, not present them as
  Ornigami's findings or as proven outcomes.

If Momisa approves the printed claims and supplies the missing commercial
inputs, a selection page is the honest next step. It is still shorter and more
factual than an advertorial.

## The honest page today: direct offer

Because the offer, destination, rights, pack truth, and pouch claims are
unconfirmed, the only page that can be built honestly today is the existing
direct offer, in preview:

| Slot | Value |
| --- | --- |
| Headline | “Three masks. One Glow Box.” only after the name is confirmed; otherwise use the approved offer or product-led headline |
| Product name | `Momisa Glow Box` after confirmation; otherwise the name printed on the pack plus the campaign descriptor |
| Offer | `30% off the Momisa Glow Box for Black Friday` is **not publishable** until Momisa confirms it |
| Destination | The Amazon search URL is **not publishable**; replace it with the direct listing or ASIN |
| Action | `Shop on Amazon` only after the listing and marketplace are confirmed |
| Facts | `3 sheet masks`; `For all skin types`; optionally the three variant names |
| Image | One packshot, `momisa-glow-box-front`, rights pending |
| Disclosure | Add the publication's advertisement label if the page is paid media; the preview label is not publication approval |

The current pilot is a preview, not a published page. Its footer says “Preview ·
offer and destination unconfirmed.” That label must stay until the inputs are
confirmed. It is not a substitute for the final advertisement disclosure.

## Why not an advertorial

1. **No story with a source.** The packaging describes three masks. It does not
   explain a change, a problem, a founder's reason, or a customer's experience.
2. **The printed claims are not approved.** The pouches carry cosmetic benefit
   language, but the pilot excludes it. An advertorial would amplify unapproved
   claims across more screens.
3. **One render image.** The template has one `product-hero` and no approved
   opening, detail, or use image. The one-photo advertorial would be a type-led
   story with nothing to show.
4. **The offer is unconfirmed.** The page cannot make a commercial promise it
   cannot stand behind.
5. **The decision is selection and price, not belief.** A shopper needs to know
   what is in the box and what it costs. A selection page fits; a narrative
   advertorial adds friction.
6. **The product name itself is unconfirmed.** “Glow Box” is not printed on the
   pack. An advertorial would repeat an unverified name.

## Review checklist

- [ ] The page is labelled as a preview while the offer, destination, rights,
      pack truth, or pouch claims are unconfirmed.
- [ ] The only facts rendered without further review are the printed pack text:
      three sheet masks, the three variant names, and “for all skin types”.
- [ ] Any printed benefit claim is quoted exactly, attributed to the pack, and
      approved by Momisa before it renders.
- [ ] No benefit, routine, frequency, skin-concern, review, rating, or result
      claim is added beyond the printed text.
- [ ] The product name is not presented as packaging evidence until Momisa
      confirms it.
- [ ] The packshot crop keeps the wordmark, the three variant names, `3 SHEET
      MASKS`, and `For all skin types` legible at 375 px.
- [ ] The offer and destination are either confirmed or visibly marked as
      unconfirmed; they are never presented as live terms.
- [ ] The action is not published until the direct listing, marketplace, dates,
      and price basis are confirmed.
- [ ] Media rights for the packshot and any pouch image are confirmed before
      publication.
- [ ] If the page is paid media, the advertisement label is visible before the
      headline, not only in the preview footer.
- [ ] The page does not call itself an advertorial.

## What would change the recommendation

A product-selection page becomes publishable when Momisa confirms the printed
claims, the product name, the pack/variant/count, media rights, the offer, and a
direct destination. An advertorial becomes plausible only when Momisa also
supplies a real story with a source: why the three masks exist together, how
they were chosen, or a documented customer use. That story cannot be inferred
from the packaging. Until then, the offer or selection page is the honest
answer.
