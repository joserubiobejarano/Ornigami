# Campaign Lab review acceptance

This is the browser acceptance runner for the advertorial recovery review. It
owns the synthetic pilot inputs, the failure probes, and the evidence format. It
does not change the editor, renderer, API, or pilot loader. Session 1 owns those
fixes.

The runner drives the published editor and generation API only. Each case is
reported separately, so a passing fixture cannot clear a failed recovery,
stale-revision, capacity-recommendation, or real-brand result. It reuses the
Playwright bootstrap and API-to-DOM comparison approach from the existing
`campaign-lab-advertorial-contract-check.mjs` and
`campaign-lab-advertorial-review.mjs`; those runners are unchanged.

## Files

| Path | Purpose |
| --- | --- |
| `scripts/campaign-lab-review-acceptance.mjs` | Starts one development server per pilot (unless `--url` is supplied), runs the browser cases, validates the requested selection, and writes `report.md`, `report.json`, and captures. |
| `scripts/prepare-campaign-lab-review-pilots.mjs` | Validates the committed synthetic manifests, verifies asset SHA-256, and stages them under Git-ignored `.local/campaign-lab-pilots/`. |
| `tests/fixtures/campaign-lab/pilots/review-four-facts/manifest.json` | Schema-valid four-fact pilot. Required group `the rib design` has `interior`, `outlet`, `body`, and `finish`. |
| `tests/fixtures/campaign-lab/pilots/review-long-label/manifest.json` | 320 px label case. Exact label: **Morrow Ceramic Holiday Design Campaign and Prototype Review**. |
| `tests/fixtures/campaign-lab/pilots/review-distinct/manifest.json` | Distinct opening IDs: advertorial `advertorial-question`, offer `offer-rib`. |
| `tests/fixtures/campaign-lab/pilots/shared/` | Exact synthetic image bytes referenced by the manifests. |

Generated manifests, captures, and server logs stay under
`.local/campaign-lab-review/`. `.local/` is Git-ignored. Do not commit real-brand
source material, private captures, or unconfirmed commercial terms.

## Prerequisites

Node.js 24 and the repository Playwright bundle:

```powershell
npm ci
npm ci --prefix scripts/framework-prototype/browser-tools
node scripts/framework-prototype/browser-tools/node_modules/playwright/cli.js install chromium
```

If Playwright or Chromium already exists elsewhere, set
`CAMPAIGN_LAB_PLAYWRIGHT` and `CAMPAIGN_LAB_CHROMIUM`. The runner also reuses an
existing `%LOCALAPPDATA%\ms-playwright\chromium-*` installation.

## Run

```powershell
node scripts/prepare-campaign-lab-review-pilots.mjs
node scripts/campaign-lab-review-acceptance.mjs
```

The runner starts one development server at a time, because this Next.js version
allows only one `next dev` instance per directory. It stages the pilot, uses
`CAMPAIGN_LAB_GENERATION_PROVIDER=local-test`, writes the server log beside the
report, and stops the server after the group. Artifacts default to
`.local/campaign-lab-review/<timestamp>/`.

Useful options:

```powershell
# List the exact documented case IDs
node scripts/campaign-lab-review-acceptance.mjs --list

# One or more cases
node scripts/campaign-lab-review-acceptance.mjs --only capacity.direct-open,capacity.recovery

# A named output directory
node scripts/campaign-lab-review-acceptance.mjs --out .local/campaign-lab-review/rerun

# Keep the server up after a group
node scripts/campaign-lab-review-acceptance.mjs --only long-label --keep-server

# Show the browser
node scripts/campaign-lab-review-acceptance.mjs --only images.404 --headed

# Use an already-running editor
node scripts/campaign-lab-review-acceptance.mjs `
  --url http://127.0.0.1:3100 `
  --pilot review-four-facts `
  --only capacity.direct-open,capacity.recovery `
  --no-prepare
```

`--url` without `--pilot` reads the active pilot from the editor and runs only
that pilot's selected cases. If the URL has no pilot, it runs the base-fixture
cases.

## Targeted selection is strict

The documented case IDs are:

`capacity.direct-open`, `capacity.recovery`, `capacity.alternate-format`,
`failed-edit`, `images.delayed`, `images.404`, `images.recovery`,
`images.revision-switch`, `long-label`, `distinct.both-formats`,
`real-brand.pending`.

`--list` prints exactly this set.

- An unknown requested ID fails before preparation or browser startup:
  `--only images.40` exits nonzero and the report records a setup failure.
- A requested ID that never executes also fails. After the run, the runner
  requires each requested ID to produce exactly one result and adds
  `runner.selection` when a case is missing or duplicated.
- `--only images.404` runs that one image case.
- `--only real-brand.pending` records exactly one `real-brand.pending` result,
  pending when the private inputs are incomplete.

Proof commands:

```powershell
# Unknown ID: nonzero
node scripts/campaign-lab-review-acceptance.mjs `
  --only images.40 --out .local/campaign-lab-review/target-unknown

# Valid image selector: one result
node scripts/campaign-lab-review-acceptance.mjs `
  --only images.404 --out .local/campaign-lab-review/target-images-404

# Missing real-brand inputs: one explicit pending result
node scripts/campaign-lab-review-acceptance.mjs `
  --only real-brand.pending --out .local/campaign-lab-review/target-real-brand
```

A known ID requested against a server/pilot that does not host it also exits
nonzero instead of silently producing zero results.

## Cases

| Case | What it checks |
| --- | --- |
| `capacity.direct-open` | Opens the four-fact pilot directly. Expects a successful editor response, the capacity error, no truncated preview, recovery guidance, and an API `422` that names the group, four facts, and the three-fact limit. |
| `capacity.recovery` | Reads any recommended format/layout. A recommendation must render the whole four-fact group; if no format can, the editor must say so and must not recommend an incompatible one. |
| `capacity.alternate-format` | Makes the advertorial unfit while the offer remains valid. The recommended **Use single-product offer** must render the whole three-fact group, keep the exact offer/action/destination, and be approvable. |
| `failed-edit` | Generates and approves a valid preview, clears Offer, and verifies the error, retained revision/facts/exact CTA, blocked approval, field recovery link, and successful correction. |
| `images.delayed` | Holds the required image request. Approval must be blocked while pending and enabled after the delayed load. |
| `images.404` | Holds and fails the required image. Approval must stay blocked and the editor must say the required image failed. |
| `images.recovery` | Starts from the 404 state. A failed image must offer an in-editor recovery action; after recovery the image loads and approval is enabled. A fresh page load alone is not a pass. |
| `images.revision-switch` | Runs A → B → A: starts with A's image pending, switches to offer revision B with a pending image, verifies the status does not claim approval, returns to A, proves from the browser that returned A's image is pending, releases the stale B response, then releases A and approves A. If Chromium reuses a loaded A image, the pending-image path is reported as unexercised rather than asserted. |
| `long-label` | Loads the exact long campaign label at 320 px. Checks document width, exact name access, keyboard reach, visible focus, and controls staying in the viewport. |
| `distinct.both-formats` | Runs the distinct-opening pilot in advertorial, offer, and advertorial again. Compares API revision and image assignments with the rendered article, then checks required facts and exact CTA in each format. |
| `real-brand.pending` | Separates intake readiness from a completed two-layout browser run. Incomplete inputs produce an explicit pending result and reference the existing checklist; a ready package runs full and one-photo with the same story, mandatory facts, exact offer, destination, required images loaded/decoded, and approval recorded against each inspected revision. |

## Recovery and image-status contract

The four-fact group cannot fit either current format. The editor must not offer
**Use single-product offer** as a recovery unless the offer preview actually
renders all four facts. If no format can present the group, the editor must state
that clearly and keep the group whole. `capacity.alternate-format` proves the
other side: when an alternate format can render the brief, its recommendation
must work.

After an offer-format edit, the visible image status must report the pending or
blocked state. It must not say approval is available while the Approve control is
disabled by a pending image. The runner checks both the visible status text and
the preview region's image attributes.

## Real-brand result

The report distinguishes:

1. **Intake readiness** — whether the staged package has the source campaign,
   approved story, facts, confirmed offer and destination, disclosure, approved
   images, media rights, and `confirmed` status.
2. **Two-layout browser run** — the same brief rendered in
   `advertorial-full` and `advertorial-one-photo`, removing only the supporting
   images for the one-photo run.

If intake is incomplete, the result is pending and the evidence points to
`docs/campaign-lab-advertorial-review-real-brand.md#exact-missing-inputs`. No
browser result is claimed. If the package becomes ready, the runner starts the
real-brand pilot and compares the story, mandatory facts, exact offer, action
label, and destination across both layouts.

The browser result also checks the revision the runner actually rendered:

- Every image assigned to that revision must be present in the article DOM,
  complete, have non-zero natural dimensions, and decode successfully. A failed
  required image fails the browser result and identifies the asset ID.
- Approval must stay disabled while any required image is pending or failed. Once
  all images load, approval must become available and must record the same
  revision the runner inspected.
- Mandatory fact IDs come only from `brief.requiredFactGroups`. Optional facts
  may be omitted within template capacity, but every rendered fact must come from
  the approved brief and keep its approved visible value. Required facts must keep
  their values in both layouts.

Three ignored synthetic packages exercise this path without claiming a real-brand
result: `review-ready-path-qa` (pass), `review-optional-facts-qa` (pass with a
fourth optional fact), and `review-broken-media-qa` (must fail on the
hash-mismatched `review-hero` packshot in both layouts).

## Baseline on 109536c

Command:

```powershell
node scripts/campaign-lab-review-acceptance.mjs `
  --out .local/campaign-lab-review/final-109536c
```

Result: **11 cases: 9 passed, 1 failed, 1 pending.**

| Case | Result | Observation |
| --- | --- | --- |
| `capacity.direct-open` | passed | Editor returns `200`, names the four-fact group, and offers **Use single-product offer**. |
| `capacity.recovery` | failed | The recommended offer template also rejects the four-fact group; the editor overpromises a format that cannot render the brief. |
| `capacity.alternate-format` | passed | The valid offer recommendation renders the whole three-fact group and keeps the exact commercials. |
| `failed-edit` | passed | |
| `images.delayed` | passed | |
| `images.404` | passed | |
| `images.recovery` | passed | |
| `images.revision-switch` | passed | A → B → A exercised the returned-A pending-image path; the pending path was not cached out. |
| `long-label` | passed | |
| `distinct.both-formats` | passed | |
| `real-brand.pending` | pending | Intake incomplete; the two-layout browser run is recorded as not run. |

The only open defect is the overpromised capacity recovery. Evidence is in the
ignored `.local/campaign-lab-review/final-109536c/` directory.

## Session 1 rerun

The latest available Session 1 editor is `109536c`, which includes the
`364590b` editor fixes. The full suite at that commit produced **9 passed, 1
failed, 1 pending**:

- The only failure is `capacity.recovery`: the editor still recommends
  **Use single-product offer** for the four-fact group even though the offer
  template also rejects it.
- `capacity.alternate-format` passes, so a recommendation that can render the
  brief works.
- `images.revision-switch` passes the A → B → A pending-image path.
- `real-brand.pending` remains pending with intake readiness false and the
  two-layout browser run not claimed.

No Session 1 commit after `109536c` was available at verification time. When its
recovery-recommendation fix lands, apply this test commit in a separate worktree
and rerun into a new output directory. Record each case separately; keep
`real-brand.pending` pending while its inputs are incomplete.

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

Repeat with `review-long-label` and `review-distinct`. The base-fixture cases can
run with no pilot:

```powershell
$env:CAMPAIGN_LAB_PILOT_DISABLED = "true"
npm run dev -- --port 3101
node scripts/campaign-lab-review-acceptance.mjs `
  --url http://127.0.0.1:3101 --pilot no-pilot `
  --only failed-edit,images.delayed,images.404,images.recovery,images.revision-switch,capacity.alternate-format `
  --no-prepare
```

Use a separate output directory for the Session 1 run so the baseline evidence
stays intact. Compare `report.md` case by case; do not merge cases into a single
pass count.
