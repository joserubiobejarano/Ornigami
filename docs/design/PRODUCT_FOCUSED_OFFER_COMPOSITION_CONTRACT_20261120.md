# Product-focused offer composition

20 November 2026. Additive to the ordinary development-only single-product offer workflow.

## Input and compatibility

`composition?: "direction-default" | "product-focus"` is independent of `directionId`, palette review and accent overrides. Both intake and preview expose the same native select. Prepared JSON and compatible session briefs remain schema version 1. Missing values retain existing direction behavior; explicit `direction-default` has the same rendered identity as omission. Invalid strings, objects, null and other types reject. Browser HTTP validation reports a composition issue with status 422. No client CSS, recipe or token map is accepted. A model still returns only angle/layout/sections/fact IDs; it cannot override composition.

`offerPrice?: string` is an optional exact substring of the approved offer. It is the only input that can enable price/offer emphasis; the renderer never searches for a currency pattern or infers a reference price, discount, or final amount. The same field is available in normal intake, preview, prepared JSON, compatible session restoration and the browser HTTP request. It must match character-for-character or validation rejects it with an `offerPrice` issue. Blank/omitted keeps the offer unstyled. Existing pilot manifests with `offerPrice` and the legacy private `offerPriceEmphasis` token remain valid.

The server builds the browser catalog/form values. The choices pass through `createFormValues` / `createCampaignBrief`, provider request context and prompt, validated success and deterministic fallback. Returning to intake and restoring a session retain the choices. Packshot handles, attestations and approvals are not restored by session persistence.

## Effective presentation and version

`resolveCampaignComposition` owns recipe `product-focus` version **1.1.0**. It applies the existing product-second hero structure to both allowed direct-offer layouts. On a single column the DOM and visual sequence is headline, product, exact offer, action, then supporting facts. An approved visible lede is retained after the action rather than delaying the offer. Long-copy layout keeps its detail/fact band and optional closing section. Desktop reuses the existing two-column product-second grid. It does not promise a single vertical desktop sequence.

In 1.1.0 the desktop support block starts immediately below the headline rather than being stretched to the packshot baseline. This removes the observed empty band between a short headline and the offer without moving the image or changing the mobile sequence. Only an exact reviewed substring receives the stronger inline emphasis; it stays within the existing offer treatment and complete offer string.

Contained `product-hero` images alone receive bounded natural-aspect sizing. The maximum extent is `clamp(260px, 54cqi, 360px)` from the campaign container; width is the minimum of available width, extent and extent multiplied by approved aspect ratio. This bounds both axes without changing fit, cropping corners, altering image bytes or changing colors. Narrative, cover and role-less images do not receive the packshot sizing class. The natural arch, direction defaults, existing frames, type, palette, CTA, facts/footer and optional inspection remain independent.

This remains template **1.0.1**, visual direction **1.0.0**, rendered identity **6**, and existing receipt schema. The additive recipe has its own version and only participates in canonical identity when active. Thus old default revisions remain reproducible, while a focused result has a different identity. Any future visible recipe change must bump its version. Historical receipts without composition remain readable; receipts that name 1.0.0 remain valid historical records but do not reproduce the 1.1.0 pixel result.

Active preview and receipt metadata is:

```json
{
  "composition": {
    "id": "product-focus",
    "version": "1.1.0",
    "narrowOrder": "headline-product-offer-action-facts",
    "containedPackshot": true
  }
}
```

Export uses the existing captured article, styles, fonts and approved bytes. The HTML records the same composition metadata; agreement checks reject missing, extra or disagreeing metadata. Omitted/default exports retain the historical metadata shape. Changing composition uses the existing request invalidation and approval guard, so pending old responses cannot approve or replace an edited choice. Advertorial API requests explicitly reject Product focus rather than silently ignoring it; composition support is currently direct-offer only.

## Verification

The existing 361 Campaign Lab tests plus six new regressions pass (367 total). Added assertions cover the reviewed-emphasis scalar/exact-match boundary, intake/prepared/session/HTTP persistence, renderer emphasis scope, revision separation and legacy 1.0.0 receipt readability. Existing coverage continues to check composition scalar rejection, old/default equivalence, typography/asset preservation, alternate allowed layout, invalid/timeout fallback, actual renderer DOM order/sizing scope and receipt metadata tampering.

The 1.1.0 finishing evidence uses normal 375×812, 768×1024 and 1440×900 browser viewports with synthetic square/wide packs and the existing private Momisa input. Desktop headline-to-offer separation falls from 85 px to 24 px on both short-headline synthetic Clear and private Editorial; the long-copy case remains 24 px. Mobile/tablet product order and the 260/360 px contained packshot bounds are unchanged, with no horizontal overflow. The reviewed `$9`, `$4.94` and date phrase render only through the exact-match span. Three fresh approvals/exports (13, 4 and 4 files) record composition 1.1.0, exact offer/price/destination, matching HTML/receipt metadata, file hashes and packshot bytes. Editing the reviewed emphasis after approval clears approval and disables export; unit coverage also retains a readable 1.0.0 receipt.

Actual ordinary-browser checks use app-owned synthetic square and wide products at 375×812, 768×1024 and 1440×900, Clear and Editorial, visible composition edits, local-test success and invalid/timeout fixture servers, stale-response rejection, refresh/reselection, fresh local approval and ZIP export. A separately authorized private campaign is verified only in ignored `.local/` evidence. No private copy, asset hashes or screenshots are introduced into Git.

Development/build/production qualification uses the unchanged closed-network launcher and admitted fonts. Transport unit tests use their existing synthetic DNS/socket fixtures without a process-wide preload: preloading the application guard also rejects the intentional in-memory Node HTTP parser transactions, producing unrelated fixture failures. Those failed logs are retained; startup and application qualification remain guarded. No live source transaction, dependency change, paid call or external asset download is needed.

Remaining limits: wordmark/footer repetition and broader layout/type controls are unchanged. The emphasis is a typographic treatment of explicitly reviewed text, not automatic price detection or reference-price validation. Smaller tablet imagery improves proportion and sequence but reduces tiny label legibility. System-font Editorial remains device-dependent. Agent-assisted browser evidence does not establish independent customer usability, owner design adoption, conversion performance, native direct-file playback or publication readiness.
