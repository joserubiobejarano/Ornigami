# Campaign Lab rendered revision identity — 18 November 2026

Status: synthetic, local-only verification. Not brand approval and not
publication approval.

- Base: `9fd517a`
- Follow-up bases: `498d1f2`, `b4fe594`
- Identity version: `4`
- Entry point: `/campaign-lab?fixture=<pilot-fixture>`

## Canonical representation

`calculateDraftRevision` now hashes one canonical
`buildDraftRevisionIdentity` object from `src/lib/campaign-lab/template.ts`.
The object contains only inputs that can reach the shared `CampaignPage`
markup or CSS:

- template id/version, layout, section order, and the resolved closing-CTA
  decision;
- the resolved product-label visibility, using the same presentation
  normalization as the renderer;
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
normalization, the closing-CTA decision, and product-label visibility. A hidden
lede is excluded from identity even if its unrendered text changes. Approved
commercial strings remain unchanged in the campaign data and rendered markup.

Product-label visibility is decided from presentation-normalized headline and
product-name text. Equivalent ASCII spacing therefore cannot add a redundant
label, case differences remain equivalent for label visibility, and meaningful
Unicode whitespace such as a nonbreaking space still produces a distinct
headline and label decision.

## Versioning and approval

This correction requires identity version `4`: a given canonical headline
could previously map to zero or one rendered product labels depending on raw
spacing, so the same v3 revision could describe different rendered markup. The
identity now includes the resolved product-label visibility and the renderer
uses the same decision.

Preview data carries `revisionIdentityVersion: 4`. Export receipts include the
same optional top-level field when available. Historical v1, v2, and v3
receipts remain readable and are treated as their earlier identity versions;
the receipt schema version stays `1`.

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
- actual `CampaignPage` markup for single/double spaces, case differences, a
  headline that needs the product label, and a nonbreaking-space headline;
- hidden lede text not affecting revision;
- receipts exposing identity version `4` while historical receipts remain
  readable.

The actual `CampaignPage` renderer reproduced the original CTA collision before
the fix at revision `e3b66947c5d0b79e` with 1 versus 2 CTAs. After the fix both
whitespace variants render one CTA at revision `4fff61f8f5e5c425`.

The product-label collision reproduced before this correction at revision
`06b03e52354bf919` with 0 versus 1 labels. After the fix both ASCII-spaced
headlines render 0 labels at revision `58e6aa392fcef0c0`. A genuinely different
headline renders 1 label at revision `60b43b70820e8c3f`; a nonbreaking-space
headline renders 1 label at revision `2c3b92d34e0e725d`.

Browser exercise on the synthetic Fernway profile:

- original confirmed revision `3a7ea82848a99914`, one CTA;
- offer edit added `Preview · offer provisional`, cleared approval, locked
  export, and produced revision `8ea81b2bcc33e926`, still one CTA;
- fresh approval enabled export; receipt recorded identity version `4`, status
  `preview`, the same notice, and the same approved/rendered revision;
- restoring the original offer removed the notice, cleared approval, and
  returned revision `3a7ea82848a99914`;
- restored export receipt recorded identity version `4`, status `confirmed`,
  no notice, and the original frozen offer.

The corrected browser report now records the actual frozen-brief hash
`91d8ced37dc0b14949048511de50097d6b52ec61b12acf05edfeb102e197cbbb` separately
from the packshot hash
`b1cbf2f40148c2f4ee4f3bda40a3a6ff10848595dced9e3696765056a0be5ea8`.

Focused regression: **155 Campaign Lab tests passed, 0 failed**. TypeScript and
focused ESLint passed.

## Synthetic evidence

- `.local/review-b4fe594/repro-before.json` / `repro-after.json`
- `.local/review-498d1f2/repro-before.json` / `repro-after.json`
- `.local/review-498d1f2/browser/report.json`
- `.local/review-498d1f2/browser/bundle-notice/`
- `.local/review-498d1f2/browser/bundle-restored/`
- `.local/review-498d1f2/browser/captures/`

All material remains synthetic and under Git-ignored `.local/` storage.
