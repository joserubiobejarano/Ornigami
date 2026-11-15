# Advertorial renderer coordination — Session 2 to Session 1

Date: 15 November 2026
From: Session 2 (renderer, CSS, visual review)
To: Session 1 (brief, validator, assembler, API, pilot loader)
Base: `f141097`
Contract: [section contract handoff](./CAMPAIGN_LAB_ADVERTORIAL_SECTION_CONTRACT_20261115.md)

This note records the renderer inputs Session 2 will use. Session 2 will not edit
`src/lib/campaign-lab/advertorial.ts`, `src/lib/campaign-lab/fixtures.ts`, the
API, the validator, or the pilot loader. Proposed fixture copy lives in the
handoff and in an ignored local pilot for review.

## Supported image placements

| Layout | Story evidence row | Product | Unused |
| --- | --- | --- | --- |
| `advertorial-full` | Any approved supporting role in role order: `story-opening`, `product-evidence`, `product-detail`, `product-in-use`. Morrow uses `product-evidence` and `product-detail`; the synthetic pilot uses `product-in-use`. | `product-hero` | none required |
| `advertorial-one-photo` | none | `product-hero` | all supporting roles |

- The full layout uses the allowed `disclosure → opening → story → product`
  order. It does not use the optional `evidence` band for the Morrow brief, so
  the three required facts sit with the product in both layouts.
- The one-photo run is the same brief with only supporting images removed. It
  keeps the same two story beats and all three facts.

## Fact capacity

- Both layouts render the whole required fact group: `interior`, `outlet`,
  `body`.
- The one-photo layout keeps its optional capacity of two, but the required
  group is atomic and is not truncated. The product fact list renders all three
  values.
- The mobile fact list will use trailing separators so a wrapped line never
  starts with a divider. Desktop keeps the vertical rules.

## Action and offer

- One action, in the product block, using `brief.actionLabel` and
  `brief.destinationUrl`.
- The exact offer text sits directly with the action. No second action, close
  row, or alternate destination.

## Proposed fixture copy for Session 1

The proposed opening and transition are recorded with sources in
[the renderer handoff](./CAMPAIGN_LAB_ADVERTORIAL_REVIEW_RENDER_20261115.md).
Session 2 implements them only in the ignored local pilot
`.local/campaign-lab-pilots/morrow-review/` so Session 1 can adopt or reject them
without a shared-file conflict.

## Verification requested

- Confirm the full and one-photo runs are the same brief and both end at the
  product action.
- Confirm all three facts are present in both runs.
- Confirm the exact offer and destination are unchanged.
- Confirm no Session 1 file is touched.
