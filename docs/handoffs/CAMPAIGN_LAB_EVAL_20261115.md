# Campaign-lab evaluation pack — 15 November 2026

Branch: `codex/campaign-lab-eval-20261115`
Base commit: `a29753b`
Pack: `campaign-lab-eval` v1.0.0
Template under test: `single-product-offer` v1.0.0
Flow under test: `feat/campaign-lab-generation` at `aa2c562`

This handoff records the pre-integration verification and the first full run
against Agent 1's generation flow. It does not approve the flow, the template, or
the generated pages. Visual judgment still needs the blind sheet.

## What this branch owns

- `tests/fixtures/campaign-eval/` — cases, approved facts and assets, baselines,
  sample drafts, failure samples, and the filename/label trap.
- `scripts/campaign-eval-core.mjs`, `scripts/campaign-eval.mjs` — pack validation
  and draft evaluation.
- `scripts/campaign-eval-browser.mjs` — focused browser checks for the
  regressions the existing acceptance runner does not cover.
- `scripts/campaign-eval-collect-flow.mjs` — HTTP adapter for the flow.
- `tests/support/campaign-eval-browser-self-test.mjs` — pre-integration
  verification of the focused checks.
- `docs/campaign-lab-eval-pack.md` — review instructions and proof boundary.
- `docs/campaign-lab-blind-review-sheet.md` — blank reviewer form.

The app route, renderer, and provider adapter remain Agent 1's. This branch does
not edit them.

## Pre-integration verification

All of the following ran without the app route:

| Check | Result |
| --- | --- |
| `node scripts/campaign-eval.mjs validate` | Pass. Asset hashes, fixed facts, intent-change equality, revision shape, trap expectation, baselines, and samples are coherent. |
| `node --test tests/campaign-eval.test.mjs` | 11 passed, 0 failed. |
| `node scripts/campaign-eval.mjs evaluate` on samples | Sparse: both pass, human decides. Rich: generated uses 7 approved evidence items versus 3. Intent change: generated passes, baseline fails the new-angle opening. Revision: applied exactly. Trap: packaging truth unassessed. |
| `node tests/support/campaign-eval-browser-self-test.mjs` | Clean map: 53 passed, 0 failed, 1 unassessed. Fault map: 4 expected failures, including unsupported claims, unchanged intent opening, and stale revision. |

The trap was inspected visually at both widths. The crop shows
`FERNWAY / STOVETOP KETTLE / 0.8 L` while the campaign product is 1 L. The
automated asset checks pass; the packaging check stays unassessed. That is the
intended proof boundary.

## Integration run against Agent 1's flow

The flow was available at `http://localhost:3100`. Use `localhost`, not
`127.0.0.1`: Next 16 blocks dev resources from the literal loopback address
unless the app adds it to `allowedDevOrigins`, and the page then does not
hydrate. The same app works normally through `localhost`.

### Draft artifacts through the real HTTP route

```powershell
node scripts/campaign-eval-collect-flow.mjs `
  --url http://localhost:3100 `
  --out .local/campaign-eval/agent1-http `
  --fixtures sparse,long-copy `
  --revision
```

The adapter wrote the sparse, rich, and revision artifacts through
`POST /api/campaign-lab/generate`.

Artifacts: `.local/campaign-eval/agent1-http/`
Report: `.local/campaign-eval/agent1-http-run/report.md`

| Case | Flow mapping | Result | Verdict |
| --- | --- | --- | --- |
| `sparse-offer` | `fixture=sparse` | Generated with `offer-led`, sections `hero, hero-facts, close`. Same headline, lede, and two facts as the deterministic baseline. | Both pass the gates. No automated improvement; blind review decides. |
| `rich-angle` | `fixture=long-copy` | Generated with `story-led`, sections `hero, detail, close`. Identical copy, facts, layout, and asset to the baseline. | Both pass. No automated improvement; the two pages are the same. |
| `intent-change` | Not expressible | The flow accepts a fixture ID and six form values, not a new approved angle. No artifact was supplied. | `missing-draft`. Unassessed. |
| `failure-revision` | `fixture=sparse`, before and after | The 25% offer and new destination applied exactly; the old values are absent; facts, sections, layout, and asset identity are preserved. The headline updated only where it repeated the offer lead. | `revision-applied`. Approval invalidation is observed by the UI runner below and unassessed in the draft artifact. |
| `trap-asset-label` | Not expressible | The flow has no Fernway fixture or trap asset. | `missing-draft`. Unassessed. |

### Existing acceptance runner

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Result: **144 passed, 0 failed, 0 pending, 0 unassessed** across sparse and
long-copy at 375 and 1440 px. This includes overflow, asset bytes, exact CTA
destination, keyboard activation, legibility, approval, invalid URL, cleared
offer/product, offer-and-destination edit invalidation, and console errors.

The earlier run against `http://127.0.0.1:3100` failed 48 checks because the
client did not hydrate; that is a dev-origin configuration issue, not a failure
of the route, renderer, or provider adapter. Record the origin in future reports.

### Focused browser checks through the real UI

```powershell
node scripts/campaign-eval-browser.mjs `
  --flow http://localhost:3100 `
  --run .local/campaign-eval/agent1-http-run
```

The flow mode loads each fixture, captures the deterministic baseline, clicks
**Generate preview**, captures the generated state at 375 and 1440 px, and then
performs the late offer/destination revision on the sparse fixture. It uses the
run's blind map, so captures land under reviewer labels A/B.

Result: **38 passed, 0 failed, 2 unassessed**. The added checks that passed:

- `brand-and-evidence-distinct` — the sparse and richer pages differ in brand
  type, background, and evidence density.
- `unsupported-claims-*` — no known unsupported claim, invented proof, or
  untraceable number appears in any rendered preview.
- `revision-old-values-absent` — the revised page shows the exact new offer and
  destination, keeps the old values out of text and links, and preserves the
  headline apart from the offer lead and the image identity.
- Generation status is `generated` for both fixtures and for the revision at both
  widths.
- No horizontal overflow at either width.

The two unassessed checks are `intent-opening-shift` and
`packaging-truth-human-only`, because the flow cannot render those cases.

### Execution modes and fallback

The service was run in each provider mode against the sparse fixture:

| Mode | Status | Code | Approved offer, destination, and asset preserved | Issues |
| --- | --- | --- | --- | --- |
| success | generated | — | Yes | None |
| invalid | fallback | `invalid` | Yes | Protected fields, unsupported angle/layout, and an invented fact were rejected. The fallback kept the approved values. |
| timeout | fallback | `timeout` | Yes | None; returned in about 130 ms with a 120 ms bound. |
| off | fallback | `unavailable` | Yes | None. |
| openai without opt-in | fallback | `unavailable` | Yes | None; no call was made. |

This covers the unsupported-content and provider-failure part of the failure
case. The missing-destination and late-revision behavior are covered by the
existing acceptance runner's form checks and by the revision checks above.

## Which drafts improved

None on automated evidence. For both fixtures the generated draft is content-
identical to the deterministic fallback: the local test provider chooses an
allowed angle, layout, section order, and approved fact IDs, but the headline,
lede, facts, and asset come from the approved brief. This matches Agent 1's
documented quality limit: the generator does not author free prose.

The richer case did not get the supporting prototype, rib-detail, or pour
images. The v1 manifest allows only `product-hero`; that remains a coverage gap.

The blind sheet compares two identical pages for sparse and rich. A reviewer
should not claim a visual improvement from this run.

## Where the fallback was preferable

No case required the fallback on automated evidence, because the generated and
fallback drafts are the same. The fallback is equally preferable by construction.

## Checks that remain unassessed

- `intent-change`: the flow cannot supply a different approved angle while
  keeping the offer, destination, and assets fixed.
- `trap-asset-label`: the flow has no Fernway fixture or trap asset.
- `packaging-truth`: always human-only; the trap crop was inspected before
  integration, not in the flow.
- Revision approval invalidation in the draft artifact: the UI runner observes
  it, but the collected artifact marks approval unknown.
- Live OpenAI quality, latency, cost, and behavior: not exercised.
- Visual scores for campaign fit, brand fit, hierarchy, repetition, and edits to
  approval: the blind sheet and captures exist, but the flow produced no
  distinct drafts for a reviewer to compare.
- Supporting asset roles and the four-image richer composition.

## Next steps

1. Use `localhost` for local runs of this Next version, or add `127.0.0.1` to
   `allowedDevOrigins` in the app. Record the origin in every report.
2. Add a fixture or an approved-angle input for the intent-change case. Without
   it, the pack cannot tell whether the flow follows a new angle.
3. Add the Fernway trap fixture or an equivalent asset with a visible label that
   disagrees with the filename. Keep the packaging check unassessed.
4. Decide whether the richer case gets supporting asset roles. If not, record
   the evidence-use judgment as facts-and-story only.
5. Run the blind sheet only when generated and baseline pages differ. Comparing
   identical drafts cannot support an improvement claim.
