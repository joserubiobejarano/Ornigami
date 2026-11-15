# Fallback-versus-generator comparison

This workflow compares two drafts produced by the actual Campaign Lab from the
same validated brief, asset set, and template version:

- the deterministic fallback, and
- the configured generator.

It owns comparison tooling, the comparison index, neutral captures, and review
instructions. It does not own the Campaign Lab route, renderer, provider
adapter, or Momisa integration.

Use it with the evaluation pack fixtures first. Then run the same comparison on
Momisa when Agent 1 supplies the validated brief, assets, and fixture mapping.

## What the comparison proves

For each case it checks that both drafts preserve:

- the product name,
- the exact offer,
- the exact destination,
- the approved product image identity,
- approved facts only, including every required fact,
- traceable narrative claims,
- the same template ID and version,
- the same campaign fields and, when supplied, the same approved opening focus.

It separately reports concrete changes to:

- the opening headline and lede,
- the section order (added, removed, or reordered),
- the evidence (facts, supporting images, story, layout).

It calls out **identical drafts** explicitly. An identical result is evidence
that the configured provider did not change the deterministic draft for that
brief. It is not a visual preference.

## Inputs

### 1. Live UI with one origin

```powershell
node scripts/campaign-eval-compare.mjs `
  --flow http://localhost:3100 `
  --out .local/campaign-eval/compare-flow
```

The initial preview is the deterministic fallback for the form's default opening.
The generated preview comes from **Generate preview**.

### 2. Live UI with a provider-off fallback origin

Use two servers to keep the exact same form values and opening focus for both
drafts:

- one server with `CAMPAIGN_LAB_GENERATION_PROVIDER=off` (fallback), and
- one server with the configured offline or live provider (generated).

```powershell
node scripts/campaign-eval-compare.mjs `
  --fallback-flow http://localhost:3300 `
  --generated-flow http://localhost:3100 `
  --out .local/campaign-eval/compare-offline
```

The fallback server is clicked through **Generate preview** so the deterministic
draft is built from the same opening focus, not from the page's default preview.
This is the preferred offline-provider verification.

### 3. Saved artifacts

```powershell
node scripts/campaign-eval-compare.mjs `
  --fallback path/to/fallback-artifacts `
  --generated path/to/generated-artifacts `
  --out .local/campaign-eval/compare-artifacts
```

Each directory or file uses the draft artifact shape in
`tests/fixtures/campaign-eval/README.md`. This mode needs no app route. It is the
pre-integration verification path and the handoff format for another operator.

To collect the two sets through the actual Campaign Lab API from the same brief,
use two checkouts at the same commit (one Next dev server per directory):

```powershell
# Worktree A: deterministic fallback server.
$env:CAMPAIGN_LAB_GENERATION_PROVIDER="off"
npm run dev -- --port 3300

# Worktree B: configured offline provider (local-test).
Remove-Item Env:CAMPAIGN_LAB_GENERATION_PROVIDER
npm run dev -- --port 3100
```

Then collect and compare:

```powershell
node scripts/campaign-eval-collect-flow.mjs `
  --url http://localhost:3300 `
  --out .local/campaign-eval/collect-offline `
  --fixtures sparse,long-copy

node scripts/campaign-eval-collect-flow.mjs `
  --url http://localhost:3100 `
  --out .local/campaign-eval/collect-generated `
  --fixtures sparse,long-copy

node scripts/campaign-eval-compare.mjs `
  --fallback .local/campaign-eval/collect-offline `
  --generated .local/campaign-eval/collect-generated `
  --out .local/campaign-eval/compare-api
```

The collector preserves `openingFocus`, the validated brief, asset identity, and
generation metadata. This is the preferred way to compare a non-default opening
focus. The current UI's Opening focus control does not apply the selected value
before Generate, so UI-driven intent comparison is unreliable; use the API
artifacts for that case.

### 4. Target URLs

```powershell
node scripts/campaign-eval-compare.mjs `
  --urls path/to/compare-urls.json `
  --out .local/campaign-eval/compare-urls
```

```json
{
  "sparse-offer": {
    "fallback": "http://localhost:3300/campaign-lab?fixture=sparse",
    "generated": "http://localhost:3100/campaign-lab?fixture=sparse"
  }
}
```

Use this when both rendered states are already available as pages. The pages must
expose the Campaign Lab preview structure (`[data-template]`, headline, facts,
sections, and CTA).

## Outputs

```
comparison-index.md       Automated comparison index and concrete changes
comparison.json           Machine-readable identity checks and diffs
provider-map.json         Separate label-to-provider mapping
blind-sheet.md            Reviewer sheet with neutral labels
blind-key.json            Label mapping for the operator
blind-map.json            Same mapping for capture tooling
run.json                  Inputs, mode, origins, and outputs
captures/<case>/<label>/mobile.png
captures/<case>/<label>/desktop.png
captures/<case>/<label>/product-mobile.png
captures/<case>/<label>/product-desktop.png
```

Captures show the rendered campaign article only. They do not include the lab's
Draft source panel. Labels are neutral A/B; `provider-map.json` is kept separate.

## Review protocol

1. Give the reviewer `blind-sheet.md` and `captures/`.
2. The reviewer scores campaign fit, brand fit, visual hierarchy, repetition, and
   edits to approval from 0 to 2.
3. The reviewer records the page they would approve, the first change they would
   make, the number of edits to approval, and the time to approval.
4. Only then does the reviewer open `comparison-index.md` and record factual or
   functional failures separately.
5. Never average a gate failure into a visual score.

The reviewer sheet marks identical drafts. If the captures are identical, the
reviewer should say so rather than invent a preference.

## Offline and live provider boundary

An offline provider run verifies the workflow: collection, identity checks,
diffing, captures, neutral labels, and the review sheet. It does **not** prove
model quality. Live model quality, latency, cost, and output behavior remain
unassessed until a separately authorized run uses approved inputs.

## Fictional-fixture verification

Before Momisa is integrated, verify the workflow without the app:

```powershell
node scripts/campaign-eval-compare.mjs `
  --fallback tests/fixtures/campaign-eval/baseline `
  --generated tests/fixtures/campaign-eval/samples/generated `
  --out .local/campaign-eval/compare-fixtures
```

This should report:

- `sparse-offer`: changed opening, same sections and evidence.
- `rich-angle`: changed opening, changed section order, added supporting images.
- `intent-change`: changed opening and section emphasis.
- `trap-asset-label`: changed opening and section order, same approved facts.
- Identity passes for all compared cases.

Then run the real flow with the provider-off and configured-provider servers.

### Offline-provider result on the fictional fixtures

The 15 November 2026 offline run used the provider-off collector as the fallback
and the local-test provider collector as the generated side:

| Case | Result | Opening | Section order | Evidence | Identity |
| --- | --- | --- | --- | --- | --- |
| `sparse-offer` | changed | same | same | one optional fact removed (`Material: Stainless steel`) | pass |
| `rich-angle` | identical | identical | identical | identical | pass |
| `intent-change` | identical | identical | identical | identical | pass |

The local-test provider chose `offer-led` for sparse and `story-led` for rich and
intent. For rich and intent it reproduced the deterministic draft exactly. For
sparse it kept two facts and dropped the fallback's third optional fact.

Captures were saved for sparse and rich. Intent-change captures are unassessed
because the current UI does not apply the Opening focus selection before
Generate; the intent comparison uses the API artifacts, which preserve
`first-pour`.

This verifies the workflow. It does not assess live model quality.

## Momisa integration

When Agent 1 supplies the Momisa fixture:

1. Add or point to the validated brief, approved assets, and fixture ID.
2. Run the provider-off collector or fallback-flow origin.
3. Run the configured-provider collector or generated-flow origin.
4. Compare with the same command.
5. Keep the provider mapping separate and the captures neutral.
6. Report identity, opening, section order, evidence, identical drafts, and
   reviewer decisions. If the inputs are incomplete, report the comparison as
   unassessed rather than substituting fixture values.

Do not copy Momisa values into the pack from an unvalidated source. The
comparison must use the brief the app actually validated.

## Remaining gaps

- The current flow's opening-focus control does not update the deterministic
  preview until Generate. The provider-off origin path avoids that limitation by
  clicking Generate on both origins. The single-origin flow path compares the
  default preview with the generated draft and may not represent a non-default
  opening focus.
- Byte-level asset identity is compared when artifacts carry content hashes.
  The UI extraction path records asset IDs and source URLs; the browser
  acceptance runner remains the byte/hash authority.
- Packaging truth, brand fit, and composition quality remain human review.
- Momisa inputs are not available yet.
