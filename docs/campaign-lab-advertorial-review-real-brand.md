# Review brief — real-brand advertorial test

Status: **pending**. No real-brand source story and licensed asset set are on
file. The review-render pass ran a **synthetic pilot rehearsal**, not a
real-brand test.

Companion documents:
[advertorial spec](./campaign-lab-advertorial-spec.md),
[research sources](./campaign-lab-advertorial-sources.md),
[Morrow review brief](./campaign-lab-advertorial-review-morrow.md),
[review-render handoff](./handoffs/CAMPAIGN_LAB_ADVERTORIAL_REVIEW_RENDER_20261115.md).

## What was tested

The ignored local pilot `.local/campaign-lab-pilots/review-advertorial/` was
loaded through the normal pilot intake and rendered twice with the same brief:

- full layout with the approved `product-in-use` supporting image;
- one-photo layout with only the `product-hero` image.

Recorded inputs for that synthetic rehearsal:

| Input | Value |
| --- | --- |
| Incoming campaign promise | “Why the filter sits away from the wall” |
| Source campaign document | Synthetic review fixture |
| Story source | “Morrow Ceramic approved flow-control lede” |
| Fact sources | “Morrow Ceramic approved product sheet” |
| Approved roles | `product-hero`, `product-in-use` |
| Offer | “Free shipping through 30 November 2026” |
| Destination | `https://example.com/morrow` |
| Action label | “See the dripper” |

The rehearsal passed disclosure, complete facts, rendered-role, focus, reflow,
exact-destination and layout-parity checks. It only proves the intake and
renderer mechanics. The brand and story are fictional.

## Why a real-brand test is still pending

A real-brand review needs the brand’s own source material and permission. The
available public cases are structural references only:

- **Guardian Labs / Sainsbury’s — “Recipes from FEED” mazesoba.**
  <https://www.theguardian.com/recipes-from-feed/2026/aug/14/jimi-famurewas-sausage-egg-and-shiitake-mazesoba-recipe>
  Usable: the public disclosure and reading sequence, including the retail link
  after the recipe. Not usable: the Sainsbury’s name, logo, product names,
  recipe text or photography; no media licence. There is no single-product
  offer, price, shipping term, or direct product destination.
- **NYT / Rolex — “Piyush Tewari & Building Communities.”**
  <https://www.nytimes.com/paidpost/rolex/piyush-tewari-and-building-communities.html>
  Usable: the `PAID POST` disclosure and pacing observations. Not usable: the
  Rolex name, logo, portraits, interview text or photography; no media licence.
  There is no product offer or direct action.
- **Momisa Glow Box.** Private pilot at
  `.local/campaign-lab-pilots/momisa/`. One real packshot with pilot-only
  rights, three printed mask names, a count and “for all skin types.” The 30%
  offer and Amazon search destination are placeholders, and there is no
  documented story or approved claim set. It remains on the offer template.

## Exact missing inputs

1. A documented brand story with a source document, exact quote, reviewer, and
   review date.
2. Two or three approved story beats transcribed from that source.
3. Approved product facts with a source document and exact source text.
4. A confirmed final offer with terms, a direct destination, and an action
   label.
5. A disclosure label and sponsor approved for the publication surface.
6. A reviewed packshot plus at least one supporting image with confirmed media
   rights, alt text, crop notes, dimensions, and content hash.
7. Permission to use the images and quotes in a paid advertorial, not only in a
   product listing or organic post.
8. A source-campaign record with channel, promise, source document, reviewer,
   and review date.

Without these, the template would either block publication or present
unapproved claims and terms. The real-brand test is therefore pending, not
skipped.

## How to run it when the inputs arrive

1. Put the private brief and assets under
   `.local/campaign-lab-pilots/<brand>/pilot.json`.
2. Run the normal intake:
   ```powershell
   node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs `
     --pilot <brand>
   ```
3. Start the editor with `CAMPAIGN_LAB_PILOT_ID=<brand>`.
4. Run `.local`-backed captures at 320, 375, 768, 1440, and the narrow editor
   pane:
   ```powershell
   node scripts/campaign-lab-advertorial-review.mjs `
     -u http://127.0.0.1:<port> --run <brand>-review `
     --fixture <brand> --onePhoto <brand> `
     --onePhotoLayout advertorial-one-photo `
     --fullRoles product-hero,<supporting-role> `
     --onePhotoRoles product-hero
   ```
5. Keep the source images, pilot manifest, captures, promise text, and
   unconfirmed commercial terms under ignored `.local/`.
6. Do not publish or commit private material.

## What this brief does not claim

- It does not claim any public page’s conversion performance.
- It does not grant rights to any brand’s text, logo, or photography.
- It does not treat the synthetic pilot as a real-brand result.
- It does not replace legal review of the disclosure or the offer terms.
