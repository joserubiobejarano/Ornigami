# Campaign fallback-versus-generator comparison — 15 November 2026

Branch: `codex/campaign-lab-compare-20261115`
Base commit: `5118497`
Template: `single-product-offer` v1.0.0
Comparison run: offline local-test provider vs provider-off fallback

This branch owns the comparison tooling, comparison index, neutral captures, and
review instructions. It does not own the Campaign Lab route, renderer, provider
adapter, or Momisa integration.

## What changed

- `scripts/campaign-eval-compare.mjs` compares two drafts from the same validated
  brief, asset set, and template version.
- `compareDraftPair` in `scripts/campaign-eval-core.mjs` checks identity and
  reports opening, section-order, and evidence changes. It marks identical
  drafts explicitly.
- The blind review sheet now records the page the reviewer would approve, the
  first change, edits to approval, and time to approval. Captures use neutral
  mobile/desktop names.
- `docs/campaign-lab-comparison.md` documents live UI, provider-off, saved
  artifact, and URL inputs.
- `provider-map.json` is kept separate from reviewer-facing files.

## Exact commands

Pre-integration, without the app route:

```powershell
node scripts/campaign-eval-compare.mjs `
  --fallback tests/fixtures/campaign-eval/baseline `
  --generated tests/fixtures/campaign-eval/samples/generated `
  --out .local/campaign-eval/compare-fixtures
```

Offline provider run through the actual Campaign Lab API. Use two checkouts at
the same commit because one Next dev server is allowed per directory:

```powershell
# Terminal 1: deterministic fallback server (worktree A).
$env:CAMPAIGN_LAB_GENERATION_PROVIDER="off"
npm run dev -- --port 3300

# Terminal 2: configured offline provider (worktree B).
Remove-Item Env:CAMPAIGN_LAB_GENERATION_PROVIDER
npm run dev -- --port 3117

node scripts/campaign-eval-collect-flow.mjs `
  --url http://localhost:3300 `
  --out .local/campaign-eval/collect-offline `
  --fixtures sparse,long-copy

node scripts/campaign-eval-collect-flow.mjs `
  --url http://localhost:3117 `
  --out .local/campaign-eval/collect-generated `
  --fixtures sparse,long-copy

node scripts/campaign-eval-compare.mjs `
  --fallback .local/campaign-eval/collect-offline `
  --generated .local/campaign-eval/collect-generated `
  --out .local/campaign-eval/compare-api
```

Neutral captures for sparse and rich:

```powershell
node scripts/campaign-eval-compare.mjs `
  --fallback-flow http://localhost:3300 `
  --generated-flow http://localhost:3117 `
  --fixtures sparse-offer,rich-angle `
  --out .local/campaign-eval/compare-flow-captures

node scripts/campaign-eval-compare.mjs `
  --fallback .local/campaign-eval/collect-offline `
  --generated .local/campaign-eval/collect-generated `
  --captures .local/campaign-eval/compare-flow-captures/captures `
  --out .local/campaign-eval/compare-api
```

Tests:

```powershell
node scripts/campaign-eval.mjs validate
node --test tests/campaign-eval.test.mjs
node --test tests/campaign-eval-compare.test.mjs
node tests/support/campaign-eval-browser-self-test.mjs
```

## Comparison index

Primary index: `.local/campaign-eval/compare-api/comparison-index.md`
Machine report: `.local/campaign-eval/compare-api/comparison.json`
Provider map: `.local/campaign-eval/compare-api/provider-map.json`
Reviewer sheet: `.local/campaign-eval/compare-api/blind-sheet.md`
Captures: `.local/campaign-eval/compare-api/captures/`
Run metadata: `.local/campaign-eval/compare-api/run.json`

Pre-integration index: `.local/campaign-eval/compare-fixtures/comparison-index.md`

## Results

| Case | Identical | Identity | Opening | Section order | Evidence | Captures |
| --- | --- | --- | --- | --- | --- | --- |
| Sparse | no | pass | same | same | changed | A / B |
| Rich | yes | pass | identical | identical | identical | B / A |
| Intent change | yes | pass | identical | identical | identical | missing |

Concrete sparse change:

- Fallback facts: `Capacity: 500 ml`, `Closure: Screw cap`,
  `Material: Stainless steel`.
- Generated facts: `Capacity: 500 ml`, `Closure: Screw cap`.
- The local-test provider kept two facts and removed the optional third. The
  required facts and all identity fields are preserved.

Rich and intent produced identical drafts. The local-test provider chose
`story-led` and reproduced the deterministic fallback exactly. No opening,
section-order, or evidence change exists to review visually.

## Human review status

The reviewer sheet is ready, but no human scores were recorded in this run. The
sheet asks for:

- page I would approve (A / B / neither),
- first change I would make,
- edits to approval (count),
- time to approval (minutes),
- fallback preference.

Visual judgment remains separate from the automated identity and change checks.
For rich and intent the automated comparison says identical; a reviewer should
not invent a visual preference.

## Remaining gaps

- **Momisa inputs are not available.** The same command is ready once Agent 1
  supplies the validated brief, assets, and fixture mapping. Do not substitute
  fixture values.
- **Live model quality is unassessed.** This run used the offline `local-test`
  provider. A live model run needs separate authorization and approved inputs.
- **Intent-change captures are missing.** The current UI's Opening focus control
  does not apply the selected value before Generate; the comparison artifacts use
  the API path, which preserves `first-pour`. Visual review for intent is
  unassessed.
- **Pack asset pin differs from the app content hash.** The comparison verifies
  that both drafts use the same asset and hash. The app's recorded content hash
  differs from the evaluation pack's SVG pin; the browser acceptance runner
  remains the byte/hash authority.
- **Fact removal is reported, not automatically failed.** Required facts must
  remain; optional fact removal is a concrete evidence change for the reviewer.
- **Packaging truth and brand composition** remain human review.
