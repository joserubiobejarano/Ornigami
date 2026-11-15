# Campaign-lab evaluation pack

This pack evaluates the existing single-product offer template against four
campaign situations and one deliberate packaging trap. It owns the fixtures,
expected results, focused regression checks, and review instructions. It does
not own the `/campaign-lab` route, the template renderer, or the provider
adapter.

Read the design rules, workflow, and benchmark first:
`docs/design/RULES.md`, `docs/design/WORKFLOW.md`, `docs/design/BENCHMARK.md`.

The machine-readable source of truth is
`tests/fixtures/campaign-eval/cases.json`. The artifact shape and fixture layout
are in `tests/fixtures/campaign-eval/README.md`.

## The five cases

| Case | Role | What it tests | A good result |
| --- | --- | --- | --- |
| `sparse-offer` | sparse | One photo, two approved facts, a direct 20% offer for Harbor Field. | Short page; product and offer up front; one action; no invented proof. |
| `rich-angle` | rich | Morrow Ceramic, a flow-control angle, three images, three facts, and an approved story. | Uses the extra evidence; materially different from the sparse page; still a Morrow page. |
| `intent-change` | intent change | Same Morrow brand, product, assets, offer, and destination, with a “slower first pour” angle. | Opening or section emphasis changes; fixed offer, destination, and asset identity do not. |
| `failure-revision` | failure and revision | Unsupported generated content, a missing destination, and a late 20%→25% offer plus destination change. | Invalid content is rejected; the last valid draft stays usable; the late revision applies exactly and invalidates approval. |
| `trap-asset-label` | trap | Fictional Fernway 1 L kettle whose filename says 1 L while the printed label says 0.8 L. | Automated identity checks may pass, but packaging truth stays unassessed until a human reads the crop. |

The late revision is localized. A headline or lede that repeats the old offer lead may update only that lead (for example `20% off` to `25% off`). Facts, sections, layout, and asset identity must not change. An unrelated rewrite fails `revision-preserves-unrelated`.

## Approved inputs and allowed change

`cases.json` records, per case:

- `campaign`: brand, product, angle, audience, objective, offer, destination,
  action label, and product noun.
- `approvedFacts`: the only product facts a draft may render.
- `approvedStory`: the only approved narrative beyond the facts, where one
  exists.
- `approvedAssets`: ID, file, SHA-256, role, exact alt text, and the visible
  label a reviewer should expect.
- `mustStayExact`: offer, destination, action label, product name, asset IDs,
  and asset hashes.
- `mayChange`: headline, lede, section order among approved evidence, image
  crops, and composition within the brand.
- `expected`: draft budget, required facts, opening terms, evidence density,
  focus terms, cross-case differences, and the revision.
- `review`: what a reviewer should see at 375 px and 1440 px.
- `proofBoundary`: what an automated check can prove and what only a human can
  confirm.
- `fallback`: when the deterministic page is the better answer.

Do not update a fact, asset, offer, destination, or expected result without also
updating the rendered evidence and the manifest that pins it.

## What to look for at each viewport

The full per-case lists are in `cases.json` and reproduced in the blind review
sheet. The recurring checks:

**375 px**

- The opening promise, product, offer, and primary action are legible without
  horizontal scrolling.
- The action is reachable without scrolling past an image stack, and the offer
  terms sit near it.
- The crop still preserves the product and its visible label.
- The page does not read as empty (sparse) or as a wall of copy (rich).

**1440 px**

- The wide canvas is used deliberately, not as a stretched mobile column.
- Image roles and crops are clear; the richer page sequences recognition,
  evidence, detail, and use.
- The offer and action remain paired and no competing action appears.
- Repeated actions or offer lines earn their repetition.
- The two Morrow pages (rich and intent change) are not mistaken for duplicates.

## The filename/label trap

`trap-asset-label` uses `assets/fernway-kettle-1l.svg`. The file name, asset ID,
campaign product name, page text, and alt text can all say 1 L. The printed label
on the pictured kettle says **0.8 L**.

The automated check must return `unassessed` for `packaging-truth`. A green
asset-path, hash, alt-text, or page-label check proves identity and plumbing, not
that the pictured package is the approved product. The human instruction is in
`trap.humanInstruction`; the reviewer must open the product crop at both widths,
read the label, and treat the mismatch as a factual packaging failure, not a
visual preference.

## What a check can prove, and what a human must confirm

| Automated, repeatable | Human, visual or judgment |
| --- | --- |
| Exact offer, destination, action label, and product name. | Whether the page continues the campaign promise. |
| Asset IDs, bytes, alt text, and page label. | Whether the pictured packaging is the approved product and variant. |
| Approved facts only; no known forbidden claim, invented proof, absolute guarantee, or untraceable number. | Whether the remaining prose is true, fair, and well argued. |
| Copy budget, fact count, section count, evidence count, opening terms. | Whether the hierarchy, type, crop, and rhythm work at 375 and 1440 px. |
| The intent-change headline and lede differ while fixed fields and assets stay equal. | Whether the new angle is a real emphasis change rather than a synonym swap. |
| The late revision applies both new values, removes old values, preserves unrelated copy, and invalidates approval. | Whether the revision is localized and still reads coherently. |
| Cross-page brand token distinctness and evidence density. | Whether the richer page feels materially different and still belongs to its brand. |

Two limits matter:

- The claim scanner is conservative. It catches known phrases, proof language,
  guarantees, and numbers absent from the approved corpus. It cannot prove that
  the remaining prose is accurate or that an image is the right package.
- The browser checks prove what the DOM and captures show. They do not prove
  screen-reader behavior in every browser, physical-device rendering, zoom,
  motion, publishing, persistence, rollback, or analytics.

## Existing runner coverage and focused additions

`scripts/campaign-lab-acceptance.mjs` already covers, at 375 and 1440 px:
target reachability, controls and the named preview region, overflow, asset load
and bytes, exact CTA destination, keyboard reach and activation, text size and
contrast, approval, invalid destination, cleared offer/product, offer and
destination edit invalidation, console errors, and review captures. Use it
unchanged for that coverage.

`scripts/campaign-eval-browser.mjs` adds only the regressions the acceptance
runner does not cover:

| Added check | Gap it closes |
| --- | --- |
| `brand-and-evidence-distinct` | Each fixture is checked in isolation; nothing proves the sparse and richer pages are not the same shell with new words. |
| `intent-opening-shift` | Nothing compares two pages with the same fixed offer, destination, and assets and a different angle. |
| `unsupported-claims-*` | The acceptance runner checks expected values but does not fail on an extra invented claim or proof line. |
| `revision-old-values-absent` | The acceptance runner checks that new values appear; it does not prove the old offer and old destination are gone from text and links. |
| `packaging-truth-human-only` | A green asset check can be mistaken for packaging approval. This check is deliberately unassessed and captures the crop. |

## Blind review sheet

`node scripts/campaign-eval.mjs evaluate` writes:

- `report.md` and `report.json` — factual and functional gate results.
- `blind-sheet.md` — the reviewer-facing sheet. Drafts are `A`, `B`, … with the
  generator and baseline order shuffled per case.
- `blind-key.json` — the mapping from labels to sources. Do not show it to the
  reviewer until scoring is complete.
- `blind-map.json` — the same mapping used by the browser capture step so
  captures land under `captures/<case>/<label>/`.

The reviewer scores each draft from 0 to 2 on:

1. campaign fit
2. brand fit
3. visual hierarchy
4. repetition
5. edits to approval

A blank form is in `docs/campaign-lab-blind-review-sheet.md`. The evaluator's
`blind-sheet.md` is the per-run version with the labels already shuffled.

Then records which draft they would ship and whether the fallback is preferable.
Only after scoring do they open `report.md` and record gate results in the
separate “Factual and functional gate review” section. A gate failure is a
release blocker, not a low visual score. Visual preferences are never averaged
with factual or functional failures.

The sheet is blind to source, not to the case. The reviewer knows the campaign,
approved offer, destination, and viewport expectations because those are the
criteria. They do not know which draft came from the generator.

## Commands

```powershell
# 1. Verify the pack, asset bytes, baselines, and that samples separate good from bad.
node scripts/campaign-eval.mjs validate

# 2. Evaluate sample drafts and write a report plus blind sheet.
node scripts/campaign-eval.mjs evaluate --out .local/campaign-eval/pre-integration

# 3. Verify the focused browser checks against the local fixture double.
node tests/support/campaign-eval-browser-self-test.mjs

# 4. Optional: collect the flow's generated drafts through its HTTP API.
node scripts/campaign-eval-collect-flow.mjs `
  --url http://127.0.0.1:3100 `
  --out .local/campaign-eval/flow `
  --fixtures sparse,long-copy `
  --revision

# 5. Evaluate the collected drafts.
node scripts/campaign-eval.mjs evaluate `
  --drafts .local/campaign-eval/flow `
  --out .local/campaign-eval/flow-run

# 6. Optional: run the focused browser checks against real URLs.
node scripts/campaign-eval-browser.mjs `
  --urls path/to/urls.json `
  --run .local/campaign-eval/flow-run
```

The browser script needs Playwright and Chromium. It reuses the repository
browser tooling when installed, or `CAMPAIGN_EVAL_PLAYWRIGHT` and
`CAMPAIGN_EVAL_CHROMIUM`. The pre-integration self-test falls back to the sibling
main checkout when the worktree has no installed browser tooling.

## Integration procedure

1. Run the existing acceptance runner against the flow URL with the approved
   fixture manifest:

   ```powershell
   node scripts/campaign-lab-acceptance.mjs `
     --url <flow-url> `
     --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
     --require-approved
   ```

2. Collect the flow's drafts into a directory using the artifact shape in
   `tests/fixtures/campaign-eval/README.md`. One file per case; a revision bundle
   for `failure-revision`. Omit cases the flow cannot express. For the current
   flow, `scripts/campaign-eval-collect-flow.mjs` maps the `sparse` fixture to
   `sparse-offer` and `long-copy` to `rich-angle`, and can collect the late
   revision from the same `sparse` fixture. It cannot express `intent-change` or
   `trap-asset-label`; those remain unassessed.

3. Evaluate:

   ```powershell
   node scripts/campaign-eval.mjs evaluate --drafts <drafts-dir> --out <run-dir>
   ```

4. Build a URL map for the focused browser checks. If the flow can render each
   case, map `generated` and `baseline` (and `before`/`after` for the revision).
   If it cannot, leave that case out; the check is unassessed, not passed.

5. Run the focused browser checks with the same run directory so captures land
   under the blind labels:

   ```powershell
   node scripts/campaign-eval-browser.mjs --run <run-dir> --urls <urls.json>
   ```

6. Give the reviewer `blind-sheet.md` and the captures. Keep `report.md` and
   `blind-key.json` until the visual scores are recorded.

7. Report, per case:
   - which draft improved and on what evidence;
   - where the fallback was preferable;
   - which checks remain unassessed and why;
   - which gate failures block release.

## Reporting template

Use the generated `report.md` sections “Which drafts improved”, “Where the
fallback was preferable”, and “Checks that remain unassessed”. Add the human
scores from the blind sheet separately. A complete handoff names the run ID, pack
version, template version, flow URL or draft directory, generated model/provider,
and the exact captures reviewed.

## Known coverage gaps

- The v1 template manifest allows only the `product-hero` asset role. The richer
  case approves supporting evidence images. If the integrated flow rejects those
  roles, score evidence use on facts and story and record the image roles as a
  coverage gap.
- The flow may not expose a way to supply a different approved angle with the
  same fixed facts. `intent-change` then remains unassessed rather than being
  approximated by changing the offer or destination.
- The claim scanner cannot verify packaging, image truth, or the meaning of
  approved copy. The trap is the standing reminder.
- Publishing, persistence, rollback, live URLs, non-Chromium browsers, physical
  devices, screen readers, zoom, and analytics are outside this pack.
