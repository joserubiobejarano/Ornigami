# Advertorial recovery review — Session 1 handoff

Status: local, deterministic editor, validation, and image-status fixes. No
renderer CSS, pilot acceptance runner, live provider, publishing, or persistence
changes.

- Branch: `codex/campaign-lab-advertorial-recovery-review-session1`
- Base: `109536c` on `codex/campaign-lab-advertorial-recovery-review`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/quiet-kiln`
- Ownership: this session owns the editor and validation behavior. Session 2
  owns the browser acceptance runner.

## Fixed behavior

### Four-fact recovery

Before: the four-fact advertorial correctly showed a capacity error, but the
editor recommended **Use single-product offer**. Activating it rejected the same
complete group and marked the Offer field invalid.

After:

- The offer alternative is evaluated against the current brief before it is
  recommended or offered as a button.
- A brief that genuinely validates as an offer still gets the recommendation and
  one-click switch.
- When neither format can hold the complete group, the editor shows one capacity
  alert beside the format/layout controls:
  - it names the group, four facts, and the three-fact capacity;
  - it states that the editor will not shorten or split the group;
  - it explains that the operator must revise the approved brief, reload it,
    then generate again;
  - it offers **Recover approved brief**, which reloads the brief.
- The capacity message is shown once and is removed from the generic field-error
  summary, so it does not create a false Offer-field error.
- Approval remains disabled because there is no valid preview.
- A failed edit still keeps the last valid preview and clears approval.

### Image status panel

Before: after an edit cleared approval and disabled the button, the image panel
could still say “Approval is available,” because it only checked image readiness.

After the image panel reports loading, failure, or readiness, then uses the real
approval state for the next action:

| State | Panel action |
| --- | --- |
| Images loading | Names the revision and loaded/total count |
| Image failed | Names the failure and exposes Retry |
| Images ready, edit pending | Generate a fresh preview before approval |
| Images ready, not approved | Approve this revision when ready |
| Already approved | Revision is approved; no further image action |
| Fresh preview generating | Wait for the new revision |

Repeated failure/loading copy was removed from the preview status; the image
panel and approval controls now carry the specific next step.

## Verification commands

```powershell
npm ci
node scripts/prepare-campaign-lab-review-pilots.mjs

$env:CAMPAIGN_LAB_PLAYWRIGHT='C:\Users\joser\.local\ornigami-campaign-lab-advertorial-recovery-review\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs'
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/session1-full
```

Offer-page regressions (start the base app with `CAMPAIGN_LAB_PILOT_DISABLED=true`):

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/offer-regression-manifest.json `
  --only sparse,long-copy `
  --out .local/campaign-lab-acceptance/offer-regression-session1 `
  --require-approved
```

Focused unit/editor tests:

```powershell
node --experimental-strip-types --test `
  tests/campaign-lab-advertorial.test.mts `
  tests/campaign-lab-editor.test.mts `
  tests/campaign-lab.test.mts `
  tests/campaign-lab-required-facts.test.mts `
  tests/campaign-lab-generation.test.mts `
  tests/campaign-lab-pilot.test.mts `
  tests/campaign-lab-pilot-manifest.test.mts
```

## Results

- TypeScript: `npx tsc --noEmit` passed.
- Focused ESLint on changed files: passed.
- Campaign Lab unit tests: **79 passed, 0 failed**.
- Browser acceptance runner: **9 passed, 0 failed, 1 pending**.
  - Four-fact direct open and recovery passed.
  - Delayed image, 404, retry, and revision-switch passed.
  - Failed edit passed.
  - Long campaign label at 320 px passed.
  - Distinct-opening pilot in both formats passed.
  - Real-brand remains pending because the approved private inputs are still
    missing.
- Offer-page regressions: **144 passed, 0 failed, 0 pending**. A first run against
  a cold dev server raced generation settle once; the warm rerun passed all 144.

## Before / after evidence

Four-fact pilot:

```json
{
  "before": {
    "recommendation": "Single-product offer is recommended",
    "result": "offer validation rejects the same group and marks Offer invalid"
  },
  "after": {
    "status": 200,
    "capacityErrorsVisible": 1,
    "offerButtonVisible": false,
    "recoverBriefVisible": true,
    "approveDisabled": true,
    "emptyPreview": true,
    "copy": "Revise the approved brief so the complete group fits the product block, reload the approved brief, then generate the preview again."
  }
}
```

Brief that genuinely fits the alternate format (`long-copy`, switched to
advertorial):

```json
{
  "before": {
    "format": "offer",
    "revision": "8f41ea657c987154"
  },
  "switched": {
    "format": "advertorial",
    "offerRecommendationVisible": true,
    "copy": "The current brief validates as a single-product offer."
  },
  "afterUseOffer": {
    "format": "offer",
    "offerInvalid": "false",
    "offerError": null,
    "previewRetained": true
  }
}
```

Offer edit after images load:

```json
{
  "loaded": "Required images are loaded. Approve revision 54b51dc5de when ready.",
  "approved": "Required images are loaded. Revision 54b51dc5de is already approved; no further image action is needed.",
  "edited": "Required images are loaded. Generate a fresh preview before approving the edit.",
  "regenerated": "Required images are loaded. Approve revision f1ab64b152 when ready."
}
```

Image failure and retry (browser acceptance):

```json
{
  "images.404": "passed - approval blocked and failure communicated",
  "images.recovery": "passed - retry loads the image and approval becomes available",
  "images.revision-switch": "passed - old image response cannot unlock the new revision"
}
```

Long campaign name at 320 px: `documentWidth = 320`, exact label visible,
keyboard focus visible, and format/generate/approve controls stay in the
viewport.
