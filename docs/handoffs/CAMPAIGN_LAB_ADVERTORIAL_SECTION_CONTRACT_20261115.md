# Advertorial section contract — handoff to Session 2

Date: 15 November 2026
From: Session 1 (brief, validator, assembler, API, local pilot loader)
To: Session 2 (renderer and visual review)

## Contract

`single-product-advertorial` v1.0.0 now ends at the product block:

| Layout | Section order |
| --- | --- |
| `advertorial-full` | `disclosure → opening → story → evidence → product` |
| `advertorial-full` without evidence | `disclosure → opening → story → product` |
| `advertorial-one-photo` | `disclosure → opening → story → product` |

`ADVERTORIAL_MANIFEST.sectionContract` declares:

```ts
{
  endsAt: "product",
  primaryAction: { section: "product", count: 1 },
}
```

Rules enforced before the renderer receives a draft:

- `disclosure` is first.
- `product` is present and is the final section.
- `close` is not a supported section and is rejected.
- One primary action belongs to the product block. The offer and action live
  together there.
- The disclosure footer may remain; it is not an action.

## Renderer notes

- The product block is the only action surface. Render `brief.actionLabel` and
  `brief.destinationUrl` once, inside `[data-advertorial-section="product"]`.
- Do not render a second action in a close row. The minimal compatibility guard
  already added to `advertorial-page.tsx` renders the old close block only when
  `draft.sections.includes("close")`; valid new drafts never include it. Session
  2 may remove the dead close markup and its CSS during visual refinement.
- `draft.sections` is authoritative. `data-section-order` on the preview region
  exposes the exact order.
- The one-photo layout keeps the full required fact group in the product block.
  It can render three facts even though the optional-fact capacity is two, and it
  has no evidence section. Do not truncate `draft.facts`.
- `preview.assets` now contains only the campaign's approved assignments. The
  `product-hero` entry is the approved packshot; supporting entries use their
  approved roles. Do not substitute an editor-selected image.
- The fit panel can return `compatibleLayout` and `layoutReason`. When the
  requested layout cannot hold the brief, the editor offers a one-click switch
  before offering the offer template.

## Verification available

- `node scripts/campaign-lab-advertorial-api-check.mjs --url http://localhost:3000`
  checks the API contract, wrong packshot, one-photo full group, and section end.
- `node scripts/campaign-lab-advertorial-capture.mjs -u http://localhost:3000`
  checks the actual editor at 375 and 1440 px for one action, section end,
  complete fact groups, wrong-packshot preservation, and approval reset.
- `node --experimental-strip-types --test tests/campaign-lab-advertorial.test.mts`
  covers the assembler, validator, revision, and fit/generation parity.

## Requested Session 2 review

- Confirm the product block reads as the natural end of the page without the
  close row.
- Confirm the one-photo product block with three facts still reads as one
  product, one offer, one action and does not look like an evidence band.
- Confirm the offer/action pairing has the same hierarchy and tap target as the
  previous product block.
- Update the visual review and captures; Session 1 did not claim a visual pass.
