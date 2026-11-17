# Campaign Lab standalone export - 17 November 2026

Status: local, development-only. This is not publication approval.

- Base: `327815b` (`fix: make the latest prepared brief authoritative`)
- Entry point: `/campaign-lab/offer`
- Evidence root: `.local/campaign-lab-export/` (Git-ignored)

## What changed

The direct-offer editor now has **Export approved page**. It downloads a local
ZIP containing:

```text
index.html
styles.css
packshot-<content-hash-prefix>.<ext>
fonts/...              # only fonts used by the rendered article
fonts/NOTICE.txt
fonts/LICENSE-<family>-<license>.txt
receipt.json
README.txt
```

The HTML is built from the article already rendered inside
`[data-preview-canvas]`, with the existing `CampaignPage` markup and CSS-module
rules. Stylesheet collection keeps the campaign classes, media/container
queries and the font files needed by the rendered article. The page has no
React, Next, editor controls, scripts or runtime dependency; it opens directly
from disk.

The packshot is copied as the exact approved bytes. Before writing the bundle,
the export recomputes its SHA-256 and refuses to continue if it differs from the
approved asset hash.

The export first captures the rendered article HTML, packshot handle, stylesheet
inputs and approval in one synchronous snapshot. Asynchronous packaging only
reads that snapshot. If the operator edits, regenerates or otherwise invalidates
approval while packaging is running, the export aborts and no download is
created. The archive also carries machine-readable revision, offer,
destination, action-label, packshot-file and packshot-hash metadata so the HTML
and receipt can be checked against each other from the ZIP itself.

Every bundled font must have a matching copyright and OFL notice. Inter is
bundled with `fonts/LICENSE-Inter-OFL-1.1.txt` and `fonts/NOTICE.txt`, which maps
each font file to its family and license. A missing or 503/404 font response
fails the export with an actionable error; it never ships a silent fallback.

## Approval boundary

`Export approved page` is enabled only when the editor's own approval predicate
is true:

- a rendered revision exists;
- `approval.revision === preview.revision`;
- the brief is not dirty;
- generation is not in flight;
- every required image is loaded.

Editing any brief field clears approval and locks export. Regenerating produces
a revision but still leaves export locked until **Approve preview locally** is
recorded again. The direct-offer template is the only format exposed by this
button.

The rendered footer notice is preserved. A provisional destination therefore
keeps `Preview · destination provisional` in the static page and in
`receipt.json`. Editor-only source quotes (`data-fact-source`), image-gate
attributes, review panels, brief data and draft-source notes are stripped from
the exported article.

The preview frame reproduces the editor canvas width at 375 px and desktop, so
the standalone article keeps the approved composition and line breaks.

## Verification

`scripts/campaign-lab-export-check.mjs` drives the real intake, packshot reader,
editor gates, approval button and export download. It reads `index.html` and
`receipt.json` directly from the ZIP, compares revision, offer, destination,
packshot file and packshot hash, audits every HTML/CSS resource reference
against the archive entries, checks the font notice/license files, extracts the
ZIP, hashes every file against the receipt, and opens `index.html` in a fresh
offline Chromium process at 375 x 900 and 1440 x 1000.

```powershell
# Synthetic failure matrix: font 503, missing font 404, paused export/edit/
# regenerate cancellation, and recovery after fresh approval.
node scripts/campaign-lab-export-check.mjs `
  --url http://localhost:3000 `
  --out .local/campaign-lab-export/failure-synthetic `
  --label failure-synthetic `
  --failure-matrix

node scripts/campaign-lab-export-check.mjs `
  --url http://localhost:3000 `
  --out .local/campaign-lab-export/synthetic `
  --label synthetic `
  --provisional
```

Synthetic example values:

- Revision: `c17b6383cc650d5f`
- Offer: `Free shipping through 30 November 2026, on every order`
- Destination: `https://example.com/harbor-field`
- Packshot SHA-256:
  `49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2`

Synthetic results: failure matrix **8 checks passed, 0 failed**; normal export
**70 checks passed, 0 failed**, provisional footer preserved, no editor controls
or internal data, no external resource requests while offline.

```powershell
node scripts/campaign-lab-export-check.mjs `
  --url http://localhost:3000 `
  --out .local/campaign-lab-export/synthetic-provisional `
  --label synthetic-provisional `
  --provisional
```

The exported HTML and receipt must agree on the revision, offer, destination,
packshot file and packshot hash. The archive audit must report no missing or
external stylesheet, image or font references.

## Checks run for this snapshot

- Campaign Lab focused tests: **113 passed, 0 failed**
- Export helper tests: **11 passed, 0 failed**
- `npx tsc --noEmit`: passed
- Focused ESLint: passed
- Synthetic failure matrix: **8/8**
- Synthetic browser export check: **70/70**

Live campaign inputs, packshots, bundles, captures and receipts remain under
`.local/` and are not committed. No deployment, publication, provider action or
external service is part of this change.
