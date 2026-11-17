# Campaign lab acceptance

The browser acceptance runner for Ornigami's first campaign template lives in
[`scripts/campaign-lab-acceptance.mjs`](../scripts/campaign-lab-acceptance.mjs).
It owns the acceptance checks and their run instructions. It does not import or
change the `/campaign-lab` route, the template renderer, or fixture data.

Read the project design rules and workflow (`docs/design/RULES.md`,
`docs/design/WORKFLOW.md`), supplied with the template work, before running the
checks. The runner covers the predictable failures those rules require:
overflow, broken assets, exact links, keyboard access, observable approval
invalidation, and responsive legibility. The judgment calls stay with a human
reviewer.

## Interface contract

The runner drives the published accessible interface only:

- `/campaign-lab?fixture=sparse`
- `/campaign-lab?fixture=long-copy`
- Fields: **Product name**, **Offer**, **Destination URL**, **Product image**
- Buttons: **Generate preview**, **Approve preview locally**
- A region named **Campaign preview**

A mismatch is reported as a check failure or an unassessed check with the
observed evidence. The runner does not fall back to private component selectors.

## Generation path

**Generate preview** now posts to `POST /api/campaign-lab/generate`. The runner
still drives only the visible controls and preview; it does not import or mock
the generation code. Keep the local test provider in success mode for the
acceptance run so a generated draft, not a fallback, is under test. See
[`campaign-lab-generation.md`](./campaign-lab-generation.md).

Run the development server at `http://localhost:3000` (or another localhost
port). Next.js blocks its dev resources when the page is reached through
`127.0.0.1`, which prevents hydration in this setup. Warm the server once before
the acceptance run so the page and API chunks are compiled.

## Local pilot manifests

A local pilot can supply its own proposed acceptance manifest from
`.local/campaign-lab-pilots/<pilot>/acceptance.json`. Keep `status` as
`"proposed"` while the offer, destination, rights, or packaging are unconfirmed.
The runner still executes the controls, overflow, CTA-to-form, approval, edit,
and console checks; the fixture-dependent metadata checks remain **pending**, not
passes. Use the focused pilot check for asset identity, first-screen hierarchy,
opening changes, old-value removal, and approval reset. See
[`campaign-lab-pilots.md`](./campaign-lab-pilots.md).

## Prerequisites

- Node.js 24 (the repository baseline).
- The repository Playwright package and Chromium:

```powershell
npm ci --prefix scripts/framework-prototype/browser-tools
node scripts/framework-prototype/browser-tools/node_modules/playwright/cli.js install chromium
```

The runner also accepts `CAMPAIGN_LAB_PLAYWRIGHT` (path to
`playwright/index.mjs`) and `CAMPAIGN_LAB_CHROMIUM` (path to `chrome.exe`).
If the Playwright bundle version is unavailable, the runner reuses an existing
`%LOCALAPPDATA%\ms-playwright\chromium-*` installation.

## Run

Pre-integration self-test (synthetic contract fixture, no app route):

```powershell
node tests/support/campaign-lab-contract-self-test.mjs
```

Run against the local Campaign Lab development server:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://127.0.0.1:3000 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Use `--require-approved` for the acceptance run. It turns pending
fixture-metadata checks into a non-zero result:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url https://staging.example.test `
  --manifest path/to/approved-campaign-lab-fixtures.json `
  --require-approved
```

Artifacts default to `.local/campaign-lab-acceptance/<timestamp>/` and contain
`report.md`, `report.json`, and `captures/`. `--out` chooses another directory.
`--only sparse` limits a debugging run. `--headed` shows the browser.

Exit codes:

- `0`: no failed checks; pending checks are allowed unless `--require-approved`.
- `1`: failed checks, or pending checks with `--require-approved`.
- `2`: setup, target, manifest, or browser error.

## Fixture metadata is the acceptance contract

The fixture-dependent checks compare the rendered page with the template owner's
approved metadata. That metadata is supplied in a JSON manifest, not inferred
from the app:

```json
{
  "schemaVersion": 1,
  "status": "approved",
  "fixtures": [
    {
      "name": "sparse",
      "url": "/campaign-lab?fixture=sparse",
      "product": { "name": "Harbor Field 500 ml insulated travel bottle", "label": "Harbor Field" },
      "offer": "20% off from 27–30 November 2026, applied on Amazon",
      "destination": "https://example.com/harbor-field",
      "cta": { "name": "Shop on Amazon" },
      "image": {
        "path": "/campaign-lab/assets/harbor-field-bottle-front.png",
        "sha256": "64 lowercase hex characters",
        "label": "Harbor Field",
        "alt": "Exact approved alt text"
      }
    }
  ]
}
```

`status: "approved"` requires an offer, destination, asset path, and alt text for
each fixture. `sha256` is optional but recommended. The proposed manifest at
`tests/fixtures/campaign-lab/benchmark-proposal.json` records the benchmark
briefs but has no approved asset files or alt text. Its checks are **pending**,
not passes. The machine-readable shape is in
`tests/fixtures/campaign-lab/manifest.schema.json`.

The committed `tests/fixtures/campaign-lab/approved-fixtures.json` records the
verified values and SHA-256 hashes for the two fictional local fixtures. Review
any fixture update against its rendered product image and approved source
metadata before updating the manifest. The runner checks what the route renders
against those inputs.

## What the runner verifies

For every fixture at 375 px and 1440 px:

- The target loads and the four fields, two buttons, and named **Campaign
  preview** region are present and visible.
- The page and preview region have no horizontal overflow, and preview
  descendants stay inside the region.
- The product image is visible, complete, and has non-zero natural dimensions.
- The product image path matches the approved asset path, its bytes match the
  approved SHA-256 when supplied, the approved product label is visible, and the
  alt text exactly matches the approved metadata. If the app serves the image
  through Next.js `/_next/image?url=...`, the runner compares and hashes the
  underlying asset rather than the optimizer URL.
- The primary CTA's resolved URL equals the approved exact destination; the raw
  `href` is reported alongside it. A separate check compares the CTA with the
  current form value.
- The primary CTA is reachable with Tab, shows a visible focus indicator, and
  Enter activates the exact destination.
- Product name, offer, and CTA are visible, unclipped, inside the preview, at
  least 12 px (14 px for the CTA), and have WCAG AA contrast when the background
  is a resolvable solid colour.
- Valid generation and approval produce an approved state.
- Changing only Offer and Destination URL updates both values, preserves the
  product image source, alt text, dimensions, and crop styles, preserves
  unrelated preview copy, and observably invalidates the previous approval.
- An invalid destination (`example.com/no-scheme`) produces a visible or native
  validation message, blocks approval, and preserves the last valid preview.
- Clearing Offer, and separately clearing Product name, produces a visible or
  native validation message, blocks approval, and preserves the last valid
  preview.
- No browser console errors or uncaught page errors were recorded, ignoring the
  browser's favicon request.

Captures are saved for the approved state (preview region, full page, product
crop), keyboard focus, the edited state, the invalid-URL state, and the
missing-required state at both widths. Error states include full-page captures
so the form error and the preserved preview are both visible.

## What a reviewer must confirm

The captures exist for human review of crop, hierarchy, repetition, and brand
fit. Look for:

- The product is recognisable and the crop preserves its label and essential
  context at both widths.
- The eye reaches the product, offer, and action in that order; the offer terms
  sit close enough to the action to inform the decision.
- The long-copy case does not bury the product or CTA; the sparse case does not
  read as empty or over-decorated.
- Repeated elements earn their repetition. RULES.md calls for cutting taglines,
  helper text, and secondary labels.
- The composition, type, palette, and imagery belong to the fictional brand even
  with its logo hidden.

## Asset identity versus packaging truth

The runner verifies **identity and plumbing**: the image URL, bytes, label, alt
text, and load state match the approved fixture metadata. It saves the rendered
product crop beside the approved capture.

The runner does **not** verify that the pictured packaging is the correct product.
It cannot tell whether a generated or retouched image shows the right box, pouch,
carton, wordmark, variant, count, or size. A reviewer must open the product
capture and compare the visible packaging with the brand's approved packaging
reference.

The Momisa test showed why this distinction matters: an image can be present,
byte-correct, and alt-correct while still showing the wrong package or an
invented label. The automated check catches a broken or substituted file. It
does not approve the packaging. Do not report brand fit as accepted from a green
asset check.

Also outside this runner: subjective composition, non-Chromium browsers,
physical devices, screen readers, zoom, motion beyond the reduced-motion capture
context, publishing, live URLs, persistence, rollback, and analytics.

## Integration procedure

1. Obtain the URL for Agent 1's branch or the integrated environment. The app
   must own `/campaign-lab`.
2. Replace the proposed manifest with the template owner's approved fixture
   metadata. Set `status` to `"approved"`. Keep hashes lowercase hex.
3. Run with `--require-approved` against the branch URL. Do not merge the runner
   into the route branch; the runner stays independent.
4. On failure, use `report.md`: each failure has the exact inputs, reproduction
   steps, expected/observed evidence, and the captures for that fixture and
   width. Return the failure report and captures; do not describe a pending
   fixture-dependent check as a pass.
5. After integration, repeat the same command against the actual route. The
   runner accepts any URL, so the same report format applies.

## Current status before integration

The app route is owned by Agent 1 and is not present in this branch. The runner
was verified in isolation against a synthetic contract double:

- Clean contract run: 144 checks passed, 0 failed, 0 pending.
- Deliberate-fault run: 15 check IDs failed, including wrong CTA destination,
  broken/mismatched product asset, wrong alt text, overflow, missing focus ring,
  approval not invalidated, and illegible product/offer/CTA.
- A run with the proposed manifest against the contract double reports 28
  fixture-dependent checks as pending at the four fixture/width combinations;
  those are not passes. With `--require-approved`, the same run exits non-zero.

The self-test artifacts are under
`.local/campaign-lab-acceptance/self-test-<timestamp>/` and are Git-ignored.
They are not evidence about Agent 1's route.

## Troubleshooting

- **Target returned 404**: the URL is wrong, the branch is not running, or the
  route is behind auth. The runner checks the first fixture URL before opening a
  browser.
- **Controls or region not found**: compare the accessible names exactly. The
  report lists which controls were missing.
- **Approval state unknown**: expose a visible approved/not-approved status, an
  `aria-pressed` control, or a `data-approved="true|false"` attribute. The runner
  can infer a transition from the Approve button becoming disabled, but it marks
  that evidence as inferred.
- **Playwright missing**: run the prerequisites above or set
  `CAMPAIGN_LAB_PLAYWRIGHT`.
- **Chromium missing**: install the Playwright browser or set
  `CAMPAIGN_LAB_CHROMIUM`.
