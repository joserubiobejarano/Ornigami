# Campaign Lab profile headline choices and generation — 18 November 2026

Status: synthetic, local-only verification. Not brand approval and not
publication approval.

- Base: `d83babe` (`Support product-led pilot headlines`)
- Entry point: `/campaign-lab?fixture=<pilot-fixture>`
- Local evidence: `.local/harbor-field-portability/` (Git-ignored)

## Template contract

The supported profile choices now sit with the versioned template contract in
`SINGLE_PRODUCT_OFFER_TEMPLATE.profileHeadlineModes`
(`src/lib/campaign-lab/template.ts`). The matching types are
`ProfileHeadlineMode` and `TemplateProfileHeadlineManifest` in
`src/lib/campaign-lab/types.ts`.

| Profile `headlineMode` | Deterministic headline | Successful generation angles |
| --- | --- | --- |
| `product-led` | Product name | `product-led` only |
| `offer-led` | Offer-led headline | `offer-led` only |
| `angle` (legacy) | Product name | Broad brief-compatible set: `offer-led`, `product-led`, and `story-led` when approved story copy exists |

The explicit choices reuse the existing `OpeningAngle` representation. They do
not add a second headline system.

## Generation path

`runCampaignGeneration` passes the resolved brand to
`getAllowedAngles(brief, brand)`. The resulting list becomes
`request.allowed.angles`, so the provider sees the profile's permitted choices
and `validateGenerationProposal` rejects any incompatible opening angle.

An incompatible proposal, invalid provider output, or timeout recovers through
the existing deterministic preview. For a `product-led` profile that fallback
is also product-led, with the original offer, destination, facts, and packshot.

The local test provider prefers `story-led` when it is permitted and approved,
otherwise `offer-led` when permitted, otherwise `product-led`. This preserves
existing offer-led behavior while allowing a product-led-only profile to
generate successfully.

## Compatibility

- Existing `offer-led` profiles still generate `offer-led`.
- Legacy `angle` profiles keep their deterministic product-name headline and
  their broad generation choices.
- Story-led behavior for legacy approved-story briefs is unchanged.

## Synthetic Harbor Field verification

Profile configuration:

```json
"headlineMode": "product-led"
```

All commercial inputs stayed fixed:

- Product: `Harbor Field insulated travel bottle`
- Offer: `20% off, 27-30 November 2026`
- Destination: `https://example.com/harbor-field-synthetic`
- Action: `Shop the bottle`
- Facts: `500 ml`, `Brushed steel screw cap`, `Stainless steel`
- Packshot SHA-256:
  `7428586f0fcbd847f741ebfd1415c4ecd38ff0754c831edf6b5fc94a3a609ab2`

Browser results:

- Initial deterministic preview: product-led headline, exact offer, no
  provisional notice.
- Successful local-test generation: `generated`, angle `product-led`, same
  fixed inputs.
- Fresh approval and export: accepted revision `8bf2895c9a35de3c`, receipt
  status `confirmed`, provenance `confirmed`, no editor changes.
- Offer edit: free-shipping revision `8faedd0c1b640893` retained as a separate
  provisional-provenance and fresh-approval test, not as the accepted design.
- Invalid-output mode: fallback `invalid`, product-led headline, fixed offer.
- Timeout mode: fallback `timeout`, product-led headline, fixed offer.

Focused checks: **140 Campaign Lab tests passed, 0 failed**; Harbor Field
browser review **45 checks passed, 0 failed**; invalid and timeout mode checks
**2/2 each**. TypeScript and focused ESLint passed.

## Local artifacts

- `.local/harbor-field-portability/review-product-led/index.html`
- `.local/harbor-field-portability/review-product-led/bundle-accepted/index.html`
- `.local/harbor-field-portability/review-product-led/bundle-free-shipping/index.html`
- `.local/harbor-field-portability/review-product-led/captures/`
- `.local/harbor-field-portability/review-product-led/mode-invalid.json`
- `.local/harbor-field-portability/review-product-led/mode-timeout.json`
- `.local/harbor-field-portability/review-product-led/report.json` / `report.md`

All material is synthetic and remains under ignored local storage. No
publication or deployment is included.
