# Campaign Lab required fact groups — 15 November 2026

## Branch and run

- Branch: `feat/campaign-lab-required-fact-groups`
- Base: `ab42ea8` (`codex/campaign-lab-integration`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/fact-groups`
- Route: `http://localhost:3100/campaign-lab?fixture=momisa-glow-box`
- Provider: offline `local-test` only
- Momisa inputs and results: Git-ignored local storage

Use `localhost`, not `127.0.0.1`. If Turbopack reports the existing
`next/font/google` resolution error, use:

```powershell
npx next dev --webpack --port 3100
```

## What changed

The brief may now declare optional `requiredFactGroups`:

```json
"requiredFactGroups": [
  {
    "id": "complete-set",
    "label": "the complete set",
    "factIds": ["fact-a", "fact-b", "fact-c"]
  }
]
```

Each group means “render all of these facts together.” Facts outside the groups
remain optional. Existing briefs with no groups keep their previous fact
selection and layout behavior.

Implementation points:

- `CampaignBrief.requiredFactGroups` owns the declaration.
- `validateBriefFactGroups` rejects empty groups, duplicate group IDs, duplicate
  or unapproved fact IDs, and groups larger than every supported layout.
- `assembleDraft` puts required facts first, fills remaining capacity with
  optional facts, and switches to another supported layout when the preferred
  layout cannot hold the required count.
- `TemplateLayoutManifest.maxFacts` records per-layout capacity. The current
  offer-led and editorial layouts both accept 3 facts; the switch path is
  generic and covered by a reduced-capacity regression test.
- `validateTemplateDraft` enforces required-group completeness and layout
  capacity for both deterministic and provider drafts.
- The generation request exposes required groups and layout capacities to the
  provider. `validateGenerationProposal` rejects incomplete groups and layouts
  that cannot hold the selected facts.
- A rejected provider proposal uses the existing deterministic fallback. The
  fallback includes the full required group and the editor now lists the
  rejected proposal reasons under **Draft source**.
- The community visual renderer was not changed. The implementation continues
  to consume the existing `TemplateDraft.facts` output.

## Momisa local example

The local pilot manifest declares the three mask variants as one required group.
The full brief remains under `.local/campaign-lab-pilots/momisa/` and is not
committed.

Both deterministic and generated drafts now render the local pilot's complete
three-variant group. The optional contents and skin-types facts are omitted
because the required group already fills the 3-fact capacity. This is the
intended trade-off: the group is complete, and optional facts yield. The actual
fact values remain in the Git-ignored local manifest.

## Verification

### Commands

```powershell
npx tsc --noEmit
npx eslint src/app/campaign-lab src/app/api/campaign-lab src/app/campaign-lab-pilots src/components/campaign-lab src/lib/campaign-lab tests/campaign-lab-required-facts.test.mts scripts/campaign-lab-momisa-check.mjs scripts/campaign-lab-generation-check.mjs
node --experimental-strip-types --test tests/campaign-lab.test.mts tests/campaign-lab-generation.test.mts tests/campaign-lab-pilot.test.mts tests/campaign-lab-required-facts.test.mts
```

Normal Momisa generation through the real route:

```powershell
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night --expect generated

node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening three-masks --expect generated
```

Incomplete provider output through the real route:

```powershell
$env:CAMPAIGN_LAB_GENERATION_TEST_MODE="incomplete"
# restart the dev server
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --pilot momisa --opening mask-night `
  --expect fallback --expect-code invalid
```

Focused editor checks at 375 and 1440 px:

```powershell
$env:CAMPAIGN_LAB_PLAYWRIGHT="C:\Users\joser\Desktop\Projects\Ornigami\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs"
node scripts/campaign-lab-momisa-check.mjs `
  --url http://localhost:3100 `
  --out .local/momisa-required-groups-success
```

Existing acceptance suite:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Momisa proposed-manifest acceptance:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest .local/campaign-lab-pilots/momisa/acceptance.json
```

Warm the dev server once before acceptance; the first uncached 375 px run can
otherwise approve while generation is still compiling.

### Results

- TypeScript: clean.
- ESLint: clean.
- Focused tests: **37/37 passed**.
  - Existing fixture behavior unchanged.
  - Deterministic required-group selection.
  - Optional fact omission.
  - Incomplete provider output fallback with group provenance.
  - Normal generation with the full group.
  - Group larger than capacity returns a clear validation error.
  - Reduced-capacity layout switch.
  - Provider layout-capacity rejection.
  - Invalid/duplicate/unapproved group declarations.
- Existing approved-fixture acceptance: **144 passed, 0 failed, 0 pending,
  0 unassessed** at 375 and 1440 px.
- Momisa proposed-manifest acceptance: **58 passed, 0 failed, 14 pending**.
  Pending checks require confirmed Momisa offer/destination/asset metadata; they
  are not passes.
- Focused Momisa browser check: **54/54 passed**.
  - Deterministic, generated, opening-changed, and revised previews all show
    the complete required variant group together at both widths.
  - Offer/destination revision removes old values and invalidates approval.
  - The new revision requires a fresh approval.
  - No console errors.
- Incomplete provider route evidence:
  - `fallback`, code `invalid`.
  - Issue names the incomplete group and the missing fact ID (values are checked
    in the Git-ignored local evidence).
  - The fallback renders the complete required group.
  - The editor displays the issue under **Draft source**.
- Full `npm test`: **988/992 passed**. Three reproducible failures are the
  pre-existing `tests/staging-synthetic-fixture.test.mjs` parser checks, which
  also fail on the base commit. The fourth was a load-sensitive
  `tests/coolify-runtime-acceptance.test.mjs` check; that file passes 22/22 in
  isolation. No campaign-lab required-facts test failed.

## Git-ignored results

- `.local/momisa-required-groups-success/report.json` and captures.
- `.local/momisa-required-groups-fallback/report.json` and captures.
- `.local/generation-mask-night.json`.
- `.local/generation-three-masks.json`.
- `.local/generation-incomplete.json`.
- `.local/acceptance-base/report.json`.
- `.local/acceptance-momisa/report.json`.

## UX / DX / AX

- **UX:** The editor now guarantees that a declared group appears together in
  every draft, while optional evidence may be omitted; a rejected provider
  proposal leaves the last valid preview and names the missing facts.
- **DX:** Group validation, layout capacity, deterministic selection, and
  provider validation share the same brief and manifest helpers; the visual
  renderer still consumes only `TemplateDraft.facts`.
- **AX:** The brief declaration is explicit, the fallback issue names the group
  and missing fact IDs, and the editor exposes the rejected reasons in text and
  `data-generation-issues`.

## Remaining limitations

- The current two layouts both accept 3 facts. The “choose another supported
  layout” path is implemented and unit-tested with a reduced-capacity manifest,
  but the Momisa group fits its selected editorial layout without switching.
- A required group consumes the fact capacity; optional facts may be omitted.
  There is no partial group, minimum-subset, or priority ordering beyond brief
  order.
- If the union of multiple groups exceeds every layout, the preview returns a
  validation error and keeps the previous preview. The editor does not offer a
  one-click group editor.
- Provider repair is not attempted. Incomplete or over-capacity provider output
  falls back rather than being patched.
- Publishing, visual-renderer changes, live provider calls, and deployment
  remain out of scope.
