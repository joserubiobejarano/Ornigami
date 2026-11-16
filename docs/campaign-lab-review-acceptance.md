# Campaign Lab review acceptance

This is the browser acceptance runner for the advertorial review round. It owns
the synthetic pilot inputs, the network-failure checks, and the evidence format.
It does not change the `/campaign-lab` route, the renderer, the API, or the pilot
loader. Session 1 owns those fixes.

The runner drives the published editor and generation API only. It reports each
case separately, so a passing fixture cannot clear a failed image recovery,
stale-revision, capacity, or real-brand result. It reuses the Playwright
bootstrap and API-to-DOM comparison approach from the existing
`campaign-lab-advertorial-contract-check.mjs` and
`campaign-lab-advertorial-review.mjs`; those runners are left unchanged.

## Files

| Path | Purpose |
| --- | --- |
| `scripts/campaign-lab-review-acceptance.mjs` | Starts a development server per pilot (unless `--url` is supplied), runs the browser cases, and writes `report.md`, `report.json`, and captures. |
| `scripts/prepare-campaign-lab-review-pilots.mjs` | Validates the committed synthetic manifests, verifies asset SHA-256, and stages them under Git-ignored `.local/campaign-lab-pilots/`. |
| `tests/fixtures/campaign-lab/pilots/review-four-facts/manifest.json` | Schema-valid four-fact pilot. Required group `the rib design` has `interior`, `outlet`, `body`, and `finish`. |
| `tests/fixtures/campaign-lab/pilots/review-long-label/manifest.json` | 320 px label case. Exact label: **Morrow Ceramic Holiday Design Campaign and Prototype Review**. |
| `tests/fixtures/campaign-lab/pilots/review-distinct/manifest.json` | Distinct opening IDs: advertorial `advertorial-question`, offer `offer-rib`. |
| `tests/fixtures/campaign-lab/pilots/shared/` | The exact synthetic image bytes referenced by the manifests. |

The generated manifests, raw captures, and server logs stay under
`.local/campaign-lab-review/`. `.local/` is already Git-ignored. Do not commit
real-brand source material, private captures, or unconfirmed commercial terms.

## Prerequisites

Node.js 24 and the repository Playwright bundle:

```powershell
npm ci
npm ci --prefix scripts/framework-prototype/browser-tools
node scripts/framework-prototype/browser-tools/node_modules/playwright/cli.js install chromium
```

If Playwright or Chromium already exists elsewhere, set
`CAMPAIGN_LAB_PLAYWRIGHT` (path to `playwright/index.mjs`) and
`CAMPAIGN_LAB_CHROMIUM` (path to the browser executable). The runner also reuses
an existing `%LOCALAPPDATA%\ms-playwright\chromium-*` installation.

## Run everything

```powershell
node scripts/prepare-campaign-lab-review-pilots.mjs
node scripts/campaign-lab-review-acceptance.mjs
```

The runner starts one development server at a time, because this Next.js
version allows only one `next dev` instance per directory. It stages the pilot,
uses `CAMPAIGN_LAB_GENERATION_PROVIDER=local-test`, writes the server log beside
the report, and stops the server after the group. Artifacts default to
`.local/campaign-lab-review/<timestamp>/`.

Useful options:

```powershell
# One or more cases
node scripts/campaign-lab-review-acceptance.mjs --only capacity.direct-open,capacity.recovery

# A named output directory
node scripts/campaign-lab-review-acceptance.mjs --out .local/campaign-lab-review/rerun

# Keep the server up after a group
node scripts/campaign-lab-review-acceptance.mjs --only long-label --keep-server

# Show the browser
node scripts/campaign-lab-review-acceptance.mjs --only images.404 --headed

# Start and stage nothing; use an already-running editor
node scripts/campaign-lab-review-acceptance.mjs `
  --url http://127.0.0.1:3100 `
  --pilot review-four-facts `
  --only capacity.direct-open,capacity.recovery `
  --no-prepare
```

`--url` without `--pilot` reads the active pilot from the editor and runs only
that pilot's cases. If the URL has no pilot, it runs the base-fixture cases:
failed edit and the four image cases.

Exit codes:

- `0`: every selected case passed.
- `1`: at least one selected case failed; `report.md` lists each failed check.
- `2`: setup, preparation, server, manifest, or browser error.

## Cases

| Case | What it checks |
| --- | --- |
| `capacity.direct-open` | Opens the four-fact pilot directly. Expects a successful editor response, the capacity error, no truncated preview, a recovery action, and an API `422` that names the group, four facts, and the three-fact limit. |
| `capacity.recovery` | Activates the capacity recovery action and verifies the editor stays usable and never renders a partial required group. |
| `failed-edit` | Generates and approves a valid preview, clears Offer, and verifies the error, the retained revision/facts/exact CTA, blocked approval, a field recovery link, and a successful correction. |
| `images.delayed` | Holds the required image request. Approval must be blocked while it is pending, then enabled after the delayed load. |
| `images.404` | Holds and fails the required image. Approval must stay blocked, and the editor must say the required image failed. |
| `images.recovery` | Starts from the 404 case. A failed image must offer an in-editor recovery action; after recovery the image loads and approval is enabled. A fresh page load alone is not a pass. |
| `images.revision-switch` | Starts with the image pending, switches to a different revision and image, releases the old response, and verifies approval stays blocked for the new revision until the new image loads. Approval must then record the new revision. |
| `long-label` | Loads the exact long campaign label at 320 px. Checks document width, access to the exact name, keyboard reach, visible focus, and controls staying in the viewport. |
| `distinct.both-formats` | Runs the distinct-opening pilot in advertorial, offer, and back to advertorial. Compares the API revision and image assignments with the rendered article, then checks required facts and the exact CTA in each format. |
| `real-brand.pending` | Inspects the staged real-brand pilot for the advertorial inputs. If the material is incomplete, records the exact gaps and leaves the result pending; it does not claim a real-brand pass. |

When suitable real-brand material is eventually staged, the two-layout run must
use normal pilot intake, keep the story, required facts, offer, and destination
fixed, and remove only the supporting images for the one-photo layout. Until
then the real-brand result is pending.

## Baseline on d9ebefb

Command:

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/baseline-d9ebefb-final
```

Result: **10 cases: 2 passed, 7 failed, 1 pending.**

| Case | Result | Reproduction |
| --- | --- | --- |
| `capacity.direct-open` | failed | The editor request returned `500`; no capacity message, recovery action, or editor was rendered. The API correctly returned `422`. |
| `capacity.recovery` | failed | No recovery action was available because the direct open crashed. |
| `failed-edit` | passed | The last valid revision, facts, and exact action survived the failed edit; approval cleared and the correction recovered. |
| `images.delayed` | failed | Approve was enabled while the required image request was still held open. |
| `images.404` | failed | Approve was enabled after the image returned `404`; no image-failure message was shown. |
| `images.recovery` | failed | The failed image offered no in-editor recovery action. A fresh page load recovered the image, but that is not an app recovery path. |
| `images.revision-switch` | failed | Approve was enabled while the new revision's image was pending, and the old image response did not clear that false approval. |
| `long-label` | failed | At 320 px the document was 568 px wide. The exact name remained reachable and keyboard controls passed. |
| `distinct.both-formats` | passed | Both formats used their own opening; API revision, image assignments, required facts, and exact CTA matched the rendered article. |
| `real-brand.pending` | pending | The staged Momisa pilot still lacks the inputs listed below. |

Raw evidence and captures are in the ignored
`.local/campaign-lab-review/baseline-d9ebefb-final/` directory. The report keeps each
case separate, so the passing `failed-edit` and `distinct.both-formats` cases do
not hide the failed image recovery and stale-revision cases.

## Session 1 result — 364590b

Session 1's commit `364590b` (`Fix advertorial editor recovery, image approval
gate, and narrow layout`) was checked in a separate worktree with this test
commit applied.

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/session1-final-364590b
```

Result: **10 cases: 9 passed, 0 failed, 1 pending.**

| Case | Result |
| --- | --- |
| `capacity.direct-open` | passed — editor renders at `200`, names the four-fact group and three-fact capacity, and offers **Use single-product offer** |
| `capacity.recovery` | passed — the recovery action leaves the editor usable and does not render a partial group |
| `failed-edit` | passed |
| `images.delayed` | passed — approval stays blocked while pending and enables after the delayed load |
| `images.404` | passed — approval stays blocked and the failure is named |
| `images.recovery` | passed — the in-editor retry restores the image and approval |
| `images.revision-switch` | passed — the old response cannot unlock the new revision; approval records the new revision |
| `long-label` | passed — 320 px document, exact name, keyboard reach, focus, and in-viewport controls |
| `distinct.both-formats` | passed — API and DOM agree in advertorial, offer, and advertorial again |
| `real-brand.pending` | pending — the private inputs are still missing |

The Session 1 captures and report are in the ignored
`.local/campaign-lab-review/session1-final-364590b/` directory of that
verification worktree. The real-brand case remains pending and is not counted as
a pass.


## Real-brand gap on 16 November 2026

The private Momisa package remains a preview. The runner recorded these missing
inputs:

1. A source-campaign record with channel, promise, source document, reviewer,
   and review date.
2. A documented brand story with an approved advertorial opening, two or three
   story beats with exact quotes, and a product transition.
3. A confirmed final offer with terms; the current 30% Black Friday offer is a
   placeholder.
4. A confirmed direct product destination and action label; the current Amazon
   search URL is a placeholder.
5. A disclosure label and sponsor approved for the publication surface.
6. At least one reviewed supporting image for the full layout.
7. Confirmed media rights for the packshot and supporting image, including
   paid-advertorial use.
8. A confirmed pilot status; the staged package is still `preview`.

The packshot and printed product facts are available. They are not enough for an
advertorial, so no real-brand two-layout result is claimed.

## Run against Session 1's editor

Session 1's server must be restarted for each pilot because the pilot ID is
server-side:

```powershell
$env:CAMPAIGN_LAB_PILOT_ID = "review-four-facts"
npm run dev -- --port 3100
node scripts/campaign-lab-review-acceptance.mjs `
  --url http://127.0.0.1:3100 --pilot review-four-facts `
  --only capacity.direct-open,capacity.recovery --no-prepare
```

Repeat with `review-long-label` and `review-distinct`. The base-fixture image
and failed-edit cases can run with no pilot or with any pilot:

```powershell
$env:CAMPAIGN_LAB_PILOT_DISABLED = "true"
npm run dev -- --port 3101
node scripts/campaign-lab-review-acceptance.mjs `
  --url http://127.0.0.1:3101 --pilot no-pilot `
  --only failed-edit,images.delayed,images.404,images.recovery,images.revision-switch `
  --no-prepare
```

Use a separate output directory for the Session 1 run so the baseline evidence
stays intact. Compare `report.md` case by case; do not merge cases into a single
pass count.
