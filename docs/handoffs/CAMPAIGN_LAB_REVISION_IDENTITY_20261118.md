# Campaign Lab rendered revision identity — 18 November 2026

Status: synthetic, local-only verification. Not brand approval and not
publication approval.

- Base: `9fd517a`
- Identity version: `2`
- Entry point: `/campaign-lab?fixture=<pilot-fixture>`

## Canonical representation

`calculateDraftRevision` now hashes one canonical
`buildDraftRevisionIdentity` object from `src/lib/campaign-lab/template.ts`.
The object contains only inputs that can reach the shared `CampaignPage`
markup or CSS:

- template id/version, layout, and section order;
- every rendered brand token: colour, display/body font, display weight,
  tracking, label casing, radii, image shape/inset/blend, offer treatment,
  hero order, detail colours when the detail section renders, and wordmark
  mark;
- visible brand content: name, wordmark, and detail title when rendered;
- campaign content: product name, offer, normalized destination, action label,
  visible lede, headline, and rendered fact labels/values;
- asset appearance: content hash, width, height, and alt text.

Reviewer notes, unused facts, source quotes, internal campaign notes,
editor-only IDs, asset rights/source/reviewer metadata, and non-rendered
descriptors are excluded. Equivalent defaults are normalized, including:

- undefined `offerStyle` vs `"tint"`;
- undefined `imageBlend` vs `"normal"`;
- undefined `mobileHeroOrder` vs `"support-first"`;
- absent `imageInset` vs `"0px"`;
- unitless zero vs `"0px"` radii;
- hex colour case and three-digit hex expansion;
- whitespace around font lists and text values.

A hidden lede is excluded from identity even if its unrendered text changes.

## Versioning and approval

Preview data carries `revisionIdentityVersion: 2`. Export receipts include the
same optional top-level field when available. Historical receipts without the
field remain readable and are treated as the earlier identity version; the
receipt schema version stays `1`.

Because the revision changes when any rendered appearance input changes,
existing local approval no longer matches the new revision. Export remains
locked until the operator regenerates, reviews, and approves the fresh
revision.

## Verification

Focused tests cover:

- colour, body font, display weight, spacing, radii, image treatment, section
  order, wordmark, image dimensions, and image alt text;
- non-rendered review notes and unused fact metadata leaving the revision
  unchanged;
- equivalent defaults producing the same revision;
- hidden lede text not affecting revision;
- stale approval failing the approval/export guard;
- receipts exposing identity version `2` while v1 receipts remain readable.

Focused regression: **151 Campaign Lab tests passed, 0 failed**. TypeScript and
focused ESLint passed.

Browser exercise on the synthetic Fernway profile:

- generated and approved revision `129a658a2002b144`;
- changed only the accent colour; approval cleared and export locked;
- regenerated revision `e608c65a3d433b90`, still unapproved and export locked;
- fresh approval enabled export;
- receipt recorded identity version `2`, approval/render revision
  `e608c65a3d433b90`, and the unchanged frozen commercial inputs.

## Synthetic evidence

- `.local/fernway-campaign/revision-identity/report.json`
- `.local/fernway-campaign/revision-identity/bundle/index.html`
- `.local/fernway-campaign/revision-identity/bundle/receipt.json`
- `.local/fernway-campaign/revision-identity/captures/`
- `.local/fernway-campaign/review/` — refreshed first/revised quality evidence

All material remains synthetic and under Git-ignored `.local/` storage.
