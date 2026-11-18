# Campaign Lab rendered revision identity — 18 November 2026

Status: synthetic, local-only verification. Not brand approval and not
publication approval.

- Base: `9fd517a`
- Follow-up base: `498d1f2`
- Identity version: `3`
- Entry point: `/campaign-lab?fixture=<pilot-fixture>`

## Canonical representation

`calculateDraftRevision` now hashes one canonical
`buildDraftRevisionIdentity` object from `src/lib/campaign-lab/template.ts`.
The object contains only inputs that can reach the shared `CampaignPage`
markup or CSS:

- template id/version, layout, section order, and the resolved closing-CTA
  decision;
- every rendered brand token: colour, display/body font, display weight,
  tracking, label casing, radii, image shape/inset/blend, offer treatment,
  hero order, detail colours when the detail section renders, and wordmark
  mark;
- visible brand content: name, wordmark, and detail title when rendered;
- campaign content: product name, offer, normalized destination, action label,
  visible lede, headline, and rendered fact labels/values;
- asset appearance: content hash, width, height, and alt text;
- the effective visible preview notice, resolved before the final revision.

Reviewer notes, unused facts, source quotes, internal campaign notes,
editor-only IDs, asset rights/source/reviewer metadata, and non-rendered
descriptors are excluded. Equivalent defaults are normalized, including:

- undefined `offerStyle` vs `"tint"`;
- undefined `imageBlend` vs `"normal"`;
- undefined `mobileHeroOrder` vs `"support-first"`;
- absent `imageInset` vs `"0px"`;
- unitless zero vs `"0px"` radii;
- hex colour case and three-digit hex expansion;
- whitespace around font lists and text values;
- ordinary ASCII whitespace runs, which HTML collapses, while meaningful
  Unicode whitespace such as nonbreaking spaces is preserved.

The renderer and revision identity share `presentation.ts` for visible text
normalization and the closing-CTA decision. A hidden lede is excluded from
identity even if its unrendered text changes. Approved commercial strings remain
unchanged in the campaign data and rendered markup.

## Versioning and approval

This correction requires identity version `3`: the canonical schema now
includes the resolved closing-CTA decision, presentation-aware whitespace, and
the effective visible notice, and earlier v2 revisions cannot be reproduced
from the new payload.

Preview data carries `revisionIdentityVersion: 3`. Export receipts include the
same optional top-level field when available. Historical v1 and v2 receipts
without the field remain readable and are treated as their earlier identity
versions; the receipt schema version stays `1`.

Because the revision changes when any rendered appearance input or visible
notice changes, existing local approval no longer matches the new revision.
Export remains locked and any in-flight export is cancelled until the operator
regenerates, reviews, and approves the fresh revision.

## Verification

Focused tests cover:

- colour, body font, display weight, spacing, radii, image treatment, section
  order, wordmark, image dimensions, and image alt text;
- non-rendered review notes and unused fact metadata leaving the revision
  unchanged;
- equivalent defaults producing the same revision;
- ordinary versus nonbreaking spaces;
- the reproduced one-space/two-space closing-CTA boundary;
- visible notice added, changed, and removed, including stale approval and
  export-guard failure;
- hidden lede text not affecting revision;
- receipts exposing identity version `3` while historical receipts remain
  readable.

The actual `CampaignPage` renderer reproduced the original collision before the
fix at revision `e3b66947c5d0b79e` with 1 versus 2 CTAs. After the fix both
whitespace variants render one CTA at revision `4fff61f8f5e5c425`.

Browser exercise on the synthetic Fernway profile:

- original confirmed revision `8711825522782efb`, one CTA;
- offer edit added `Preview · offer provisional`, cleared approval, locked
  export, and produced revision `11f55b80b8060f43`, still one CTA;
- fresh approval enabled export; receipt recorded identity version `3`, status
  `preview`, the same notice, and the same approved/rendered revision;
- restoring the original offer removed the notice, cleared approval, and
  returned revision `8711825522782efb`;
- restored export receipt recorded identity version `3`, status `confirmed`,
  no notice, and the original frozen offer.

Focused regression: **154 Campaign Lab tests passed, 0 failed**. TypeScript and
focused ESLint passed.

## Synthetic evidence

- `.local/review-498d1f2/repro-before.json` / `repro-after.json`
- `.local/review-498d1f2/browser/report.json`
- `.local/review-498d1f2/browser/bundle-notice/`
- `.local/review-498d1f2/browser/bundle-restored/`
- `.local/review-498d1f2/browser/captures/`

All material remains synthetic and under Git-ignored `.local/` storage.
