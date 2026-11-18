# Campaign Lab profile headline choices and generation — 18 November 2026

Status: synthetic, local-only verification. Not brand approval and not
publication approval.

- Base: `d83babe` (`Support product-led pilot headlines`)
- Precedence follow-up base: `59368ff` (`Govern generation with profile headline mode`)
- Entry point: `/campaign-lab?fixture=<pilot-fixture>`
- Local evidence: `.local/harbor-field-portability/` (Git-ignored)

## Template contract

The supported profile choices now sit with the versioned template contract in
`SINGLE_PRODUCT_OFFER_TEMPLATE.profileHeadlineModes`
(`src/lib/campaign-lab/template.ts`). The matching types are
`ProfileHeadlineMode` and `TemplateProfileHeadlineManifest` in
`src/lib/campaign-lab/types.ts`.

| Precedence | Deterministic headline | Successful generation angles |
| --- | --- | --- |
| Explicit approved campaign headline, or selected approved opening carrying one | The approved headline copy | `story-led` only |
| `product-led` profile, no campaign headline | Product name | `product-led` only |
| `offer-led` profile, no campaign headline | Offer-led headline | `offer-led` only |
| `angle` legacy, no campaign headline | Product name | Broad brief-compatible set: `offer-led` and `product-led` |

The precedence is documented beside `profileHeadlineModes` in the template
manifest. Approved campaign copy or a selected approved opening wins first.
The profile's constrained choices apply only when there is no campaign-specific
headline. The explicit choices reuse the existing `OpeningAngle`
representation; they do not add a second headline system.

## Generation path

`runCampaignGeneration` passes the resolved brand to
`getAllowedAngles(brief, brand)`. That helper applies the shared precedence
before building `request.allowed.angles`, so the provider sees the same resolved
opening as the deterministic preview. `validateGenerationProposal` rejects any
incompatible angle.

An incompatible proposal, invalid provider output, or timeout recovers through
the existing deterministic preview, which applies the same precedence. For a
`product-led` profile without campaign headline copy that fallback is
product-led; with approved headline copy or a selected approved opening it stays
story-led. The original offer, destination, facts, and packshot are unchanged.

The local test provider prefers `story-led` when it is permitted and approved,
otherwise `offer-led` when permitted, otherwise `product-led`. This preserves
existing offer-led behavior while allowing a product-led-only profile to
generate successfully.

## Compatibility

- Existing `offer-led` profiles still generate `offer-led` when no approved
  campaign headline is selected.
- Legacy `angle` profiles keep their deterministic product-name headline and
  their broad generation choices when no approved campaign headline is selected.
- Approved campaign headlines and selected approved openings resolve to
  story-led under every profile and in both generation and fallback.

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

Focused checks: **143 Campaign Lab tests passed, 0 failed**; Harbor Field
browser review **45 checks passed, 0 failed**; invalid and timeout mode checks
**2/2 each**. TypeScript and focused ESLint passed. Coverage includes
product-led profiles with and without approved headline copy, selected opening
focus, offer-led profiles, and legacy angle profiles, with successful generation
and fallback preserving the resolved opening and commercial inputs.

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
