# Campaign evaluation fixture pack

This directory holds the inputs, expected results, and sample drafts for
`docs/campaign-lab-eval-pack.md`. It is data and test scaffolding only. It does
not own the `/campaign-lab` route, the template renderer, or the provider
adapter.

## Files

- `cases.json` — the five cases, approved facts, approved assets, exact values,
  allowed changes, expected draft behavior, 375/1440 review notes, proof
  boundary, and fallback.
- `assets/` — fictional SVG assets. `fernway-kettle-1l.svg` is the deliberate
  filename/label trap: the file and campaign say 1 L, the printed label says
  0.8 L.
- `baseline/` — the deterministic draft for each case. These are the comparison
  side of the blind review.
- `samples/generated/` — sample drafts used to prove the expected results are
  usable before integration. They are not claims about any model's quality.
- `samples/failures/` — deliberate faults: unsupported claims, a missing
  destination, a stale revision, an unchanged intent opening, and a thin richer
  draft.
- `server.mjs` — a local fixture double that renders these artifacts as plain
  HTML for the focused browser checks. It is not the app renderer.
- `urls.example.json` — the shape for the focused browser URL map. Replace the
  values with real pages; omit cases the flow cannot express.

## Draft artifact shape

One JSON file per case:

```json
{
  "schemaVersion": 1,
  "caseId": "sparse-offer",
  "source": "generated",
  "sourceLabel": "Run label, model, or provider",
  "template": { "id": "single-product-offer", "version": "1.0.0" },
  "campaign": {
    "brandId": "harbor-field",
    "productName": "Harbor Field travel bottle",
    "offer": "20% off, 27–30 November 2026",
    "destinationUrl": "https://example.com/harbor-field",
    "actionLabel": "Shop on Amazon"
  },
  "draft": {
    "layout": "offer-led-one-photo",
    "headline": "20% off the Harbor Field travel bottle.",
    "lede": "500 ml, a screw cap, and nothing else to decide.",
    "story": null,
    "facts": [
      { "label": "Capacity", "value": "500 ml" },
      { "label": "Closure", "value": "Screw cap" }
    ],
    "sections": [
      { "id": "hero", "heading": "20% off the Harbor Field travel bottle.", "emphasis": 1 },
      { "id": "close", "heading": "Shop on Amazon", "emphasis": 2 }
    ],
    "assetIds": ["harbor-field-bottle-front"],
    "claims": [
      "20% off the Harbor Field travel bottle.",
      "500 ml, a screw cap, and nothing else to decide."
    ]
  },
  "approval": { "state": "approved", "revision": "generated-sparse-001" }
}
```

`claims` is optional but recommended. The evaluator also scans the headline,
lede, story, facts, and section headings.

## Revision bundle shape

For the late-change case, use one file with `before` and `after`:

```json
{
  "schemaVersion": 1,
  "caseId": "failure-revision",
  "before": { "...draft artifact with the old offer and destination..." },
  "after": { "...draft artifact with the new offer and destination..." },
  "change": {
    "fromOffer": "20% off, 27–30 November 2026",
    "toOffer": "25% off, 27–30 November 2026",
    "fromDestination": "https://example.com/harbor-field",
    "toDestination": "https://example.com/harbor-field-offer"
  }
}
```

## Collecting drafts from the integrated flow

The evaluation CLI is app-agnostic. A flow adapter should write one artifact per
case into a directory, using the shape above. Map the flow's rendered values into
`campaign` and `draft`; do not copy values from the fixture pack when the flow
actually rendered something different. If the flow cannot express a case, omit
that file. The report will mark the case `missing-draft` and list it as
unassessed rather than pass it.

## Pre-integration verification

```powershell
node scripts/campaign-eval.mjs validate
node scripts/campaign-eval.mjs evaluate --out .local/campaign-eval/pre-integration
node tests/support/campaign-eval-browser-self-test.mjs
```

The first two commands must pass without the app route. The browser self-test
starts `server.mjs`, runs the focused checks against clean and fault maps, and
must end with `PASS`.
