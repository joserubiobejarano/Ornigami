# Advertorial review round 3 — Session 1 handoff

Status: local, deterministic app/component fixes. No renderer CSS, live provider,
publishing, or persistence work.

- Branch: `codex/campaign-lab-advertorial-review-round3-session1`
- Base: `d9ebefb` on `codex/campaign-lab-advertorial-review-round3`
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/morrow-ceramic`
- Ownership: this session owns the editor state, validation presentation,
  approval gate, image-load tracking, and responsive editor layout. Session 2
  owns the independent browser checks.

## Fixed failures

### 1. Four required facts crashed the editor on first load

Before: a pilot whose required group had four facts passed intake, returned a
useful `422` from `/api/campaign-lab/generate`, but the editor page returned
`500` because `CampaignLab` threw from its initial `useState` when no preview
could be built.

After:

- `createEditorPreviewState` returns validation issues instead of throwing.
- The editor opens with `200`, shows the actual four-fact group message, and
  renders a no-preview recovery panel.
- Approval is unavailable when no valid preview exists.
- A compatible layout is only offered when the alternative layout evaluates
  successfully with the complete required group. For the four-fact pilot both
  layouts cap at three, so no layout button is offered.
- An existing valid preview is retained when a later edit fails validation.

### 2. A failed required image could still be approved

Before: a required supporting image returned `404` with `naturalWidth === 0`,
but `Approve preview` remained enabled and produced `data-approved="true"`.

After:

- Every preview image reports its real load result through `PreviewImage`.
- Approval requires every image assigned to the exact current revision to be
  loaded. The offer preview gates its hero; the advertorial gates every resolved
  assignment.
- Pending, cached, failed, and retried loads are covered.
- Image events carry the preview revision and retry attempt. Events from a
  superseded revision or an earlier retry are ignored.
- A failure names the role and asset and offers a specific retry control.
- The preview region exposes `data-images-ready`, `data-image-statuses`,
  `data-image-failures`, and `data-approval-blocked-by` for independent checks.

### 3. The long campaign label forced 320 px editors wider than the viewport

Before: `Morrow Ceramic Holiday Design Campaign and Prototype Review` rendered
in a `shrink-0` fixture badge. At a 320 px viewport the document measured
`568 px` locally (`591 px` in the original report) and the badge extended to the
same right edge.

After:

- The fixture badge can shrink, wrap, and break words inside the brief header.
- The pilot badge and fixture links also wrap instead of establishing a wide
  min-content floor.
- Grid children and the preview header have `min-w-0`.
- At 320 px the document width is `320`, the full label remains visible and
  wraps inside the card, and the format, generate, and approve controls remain
  inside the viewport.

## Reproduce

Install and create the Git-ignored edge pilots:

```powershell
npm ci
npm run campaign-lab:edge-fixtures
```

The local app needs placeholder auth values to boot in development:

```powershell
$env:GOOGLE_CLIENT_ID='local-review-client'
$env:GOOGLE_CLIENT_SECRET='local-review-secret'
$env:AUTH_SECRET='local-review-secret-local-review-secret'
$env:NEXTAUTH_SECRET='local-review-secret-local-review-secret'
```

Start one pilot at a time. Use `http://localhost:3100` rather than
`127.0.0.1` so Next.js development resources are same-origin.

```powershell
$env:CAMPAIGN_LAB_PILOT_ID='review-four-facts'
npx next dev --webpack --port 3100
# http://localhost:3100/campaign-lab?fixture=review-four-facts
```

```powershell
$env:CAMPAIGN_LAB_PILOT_ID='review-broken-image'
npx next dev --webpack --port 3100
# http://localhost:3100/campaign-lab?fixture=review-broken-image
```

```powershell
$env:CAMPAIGN_LAB_PILOT_ID='review-long-label'
npx next dev --webpack --port 3100
# http://localhost:3100/campaign-lab?fixture=review-long-label at 320 px
```

For the base fixtures, set `$env:CAMPAIGN_LAB_PILOT_DISABLED='true'` and use
`morrow-advertorial-full` or `morrow-advertorial-one-photo`.

## Verification run

- `npx tsc --noEmit`: passed.
- Focused ESLint on all changed app, library, test, and fixture-script files:
  passed.
- `node --experimental-strip-types --test tests/campaign-lab-editor.test.mts`:
  7 passed. Covers no-throw first load, no nominal compatible layout for the
  four-fact group, pending/cached/failed/retry image states, superseded revision
  events, and both advertorial layouts keeping the complete three-fact group.
- `node scripts/campaign-lab-advertorial-review.mjs --url http://localhost:3100`:
  15 captures, 0 failures. Both layouts keep one action, the exact offer and
  destination, and the complete fact set.
- `node scripts/campaign-lab-acceptance.mjs --url http://localhost:3100
  --manifest tests/fixtures/campaign-lab/offer-regression-manifest.json
  --only sparse,long-copy --out .local/campaign-lab-acceptance/offer-regression-session1
  --require-approved`: 144 passed, 0 failed, 0 pending.
- `npm test`: 1028 passed, 3 failed. The same three
  `tests/staging-synthetic-fixture.test.mjs` failures reproduce at base
  `d9ebefb`; they are unrelated to this branch.

## Observed evidence

Four-fact pilot:

```json
{
  "status": 200,
  "emptyPreview": true,
  "compatibleLayout": null,
  "approveDisabled": true,
  "issue": "Required fact group \"the rib design\" has 4 facts, but the Advertorial, full material product block can present at most 3. Keep the group whole or choose a layout that supports it."
}
```

Broken supporting image:

```json
{
  "beforeFix": {
    "naturalWidth": 0,
    "approveDisabled": false,
    "approvedAfterClick": "true"
  },
  "afterFix": {
    "imageStatus": "error",
    "imagesReady": "false",
    "approveDisabled": true,
    "approvedAfterClick": "false",
    "recovery": "Retry detail image"
  }
}
```

Retry recovery (route intercepted to return the image on the retry request):

```json
{
  "failed": { "approveDisabled": true, "imageStatuses": "morrow-ribs:error,..." },
  "recovered": { "approveDisabled": false, "imageStatuses": "morrow-ribs:loaded,..." },
  "approvedAfterClick": "true"
}
```

Long label at 320 px:

```json
{
  "beforeFix": { "viewport": 320, "scrollWidth": 568, "badgeRight": 568 },
  "afterFix": {
    "viewport": 320,
    "scrollWidth": 320,
    "offenders": [],
    "labelWidth": 254,
    "labelHeight": 38,
    "formatControlInsideViewport": true,
    "generateControlInsideViewport": true,
    "approveControlInsideViewport": true
  }
}
```

## Scope preserved

- Both `advertorial-full` and `advertorial-one-photo` remain available.
- Required fact groups remain atomic and complete.
- The advertorial still has one CTA in the product block.
- The exact offer `Free shipping through 30 November 2026` and destination
  `https://example.com/morrow` are unchanged.
- No renderer CSS or template manifest limits changed.
