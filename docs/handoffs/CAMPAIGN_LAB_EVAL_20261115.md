# Campaign-lab evaluation pack — 15 November 2026

Branch: `codex/campaign-lab-eval-20261115`
Base commit: `a29753b`
Pack: `campaign-lab-eval` v1.0.0
Template under test: `single-product-offer` v1.0.0

This handoff records the pre-integration verification and the first run against
Agent 1's generation flow. It does not approve the flow, the template, or the
generated pages. Visual judgment still needs the blind sheet.

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

The flow's HTTP API and generation service were available on
`http://127.0.0.1:3100`. The committed adapter was run against the real route:

```powershell
node scripts/campaign-eval-collect-flow.mjs `
  --url http://127.0.0.1:3100 `
  --out .local/campaign-eval/agent1-http `
  --fixtures sparse,long-copy `
  --revision
```

The adapter wrote the sparse, rich, and revision artifacts through
`POST /api/campaign-lab/generate`. The provider-mode table below also exercised
the service directly so each fallback path could be set without restarting the
server.

Artifacts: `.local/campaign-eval/agent1-http/`
Report: `.local/campaign-eval/agent1-http-run/report.md`

| Case | Flow mapping | Result | Verdict |
| --- | --- | --- | --- |
| `sparse-offer` | `fixture=sparse` | Generated with `offer-led`, sections `hero, hero-facts, close`. Same headline, lede, and two facts as the deterministic baseline. | Both pass the gates. No automated improvement; blind review decides. |
| `rich-angle` | `fixture=long-copy` | Generated with `story-led`, sections `hero, detail, close`. Identical copy, facts, layout, and asset to the baseline. | Both pass. No automated improvement; the two pages are the same. |
| `intent-change` | Not expressible | The flow accepts a fixture ID and six form values, not a new approved angle. No artifact was supplied. | `missing-draft`. Unassessed. |
| `failure-revision` | `fixture=sparse`, before and after | The 25% offer and new destination applied exactly; the old values are absent; facts, sections, layout, and asset identity are preserved. The headline updated only where it repeated the offer lead. | `revision-applied`. Approval invalidation is unassessed in the artifact because approval is UI state; the UI run could not approve anything. |
| `trap-asset-label` | Not expressible | The flow has no Fernway fixture or trap asset. | `missing-draft`. Unassessed. |

### Which drafts improved

None on automated evidence. For both fixtures the generated draft is content-
identical to the deterministic fallback: the local test provider chooses an
allowed angle, layout, section order, and approved fact IDs, but the headline,
lede, facts, and asset come from the approved brief. This matches Agent 1's
documented quality limit: the generator does not author free prose.

The richer case did not get the supporting prototype, rib-detail, or pour
images. The v1 manifest allows only `product-hero`; that remains a coverage gap.

### Where the fallback was preferable

No case required the fallback on automated evidence, because the generated and
fallback drafts are the same. The blind sheet will compare two identical pages
for sparse and rich, so a reviewer should not claim a visual improvement from
this run.

### Invalid, timed-out, and unavailable provider behavior

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
draft evaluator and the existing acceptance runner's form checks.

### UI finding from the existing acceptance runner

The existing runner was run against the long-running flow on port 3100 and
against a fresh detached worktree at the same commit (`aa2c562`) on port 3200:

- Port 3100, both fixtures: 92 passed, 48 failed, 4 unassessed at 375 and
  1440 px.
- Port 3200, sparse only: 54 passed, 16 failed, 2 unassessed at 375 and 1440 px.

Both runs show the same behavior:

- The preview stays on “Deterministic draft. Generation has not run in this
  session.” after clicking **Generate preview**.
- A direct Playwright probe sees zero requests to `/api/campaign-lab/generate`
  after the click, no React props on the app content, and repeated HMR
  WebSocket handshake errors. The page chunk returns 200 and the Flight array is
  consumed, but the campaign-lab client subtree does not hydrate.
- Form edits also do not change the preview or validation state.

This reproduces on a fresh server, so it is not only a stale dev-server session.
The generation service and the HTTP route work: a direct `POST` returns a
generated preview, and the adapter collected sparse, rich, and revision drafts.
The failure is in the client interaction layer. Approval, CTA destination,
asset, and validation checks remain unassessed in the UI until it is fixed.

The HMR WebSocket errors may be environmental, but they do not explain the
missing click handler by themselves. Agent 1 should reproduce on a clean server,
check the client component's hydration, and rerun the acceptance runner before
treating the UI failures as template failures.

## Checks that remain unassessed

- `intent-change`: the flow cannot supply a different approved angle while
  keeping the offer, destination, and assets fixed.
- `trap-asset-label`: the flow has no Fernway fixture or trap asset.
- `packaging-truth`: always human-only; the trap crop was inspected before
  integration, not in the flow.
- Revision approval invalidation: unassessed in the artifact; the UI run could
  not observe approval because the client did not hydrate.
- All five focused browser checks against the real flow: `brand-and-evidence-
  distinct`, `intent-opening-shift`, `revision-old-values-absent`,
  `unsupported-claims-*`, and `packaging-truth-human-only`. They passed against
  the fixture double, not against the flow.
- Live OpenAI quality, latency, cost, and behavior: not exercised.
- Visual scores for campaign fit, brand fit, hierarchy, repetition, and edits to
  approval: the blind sheet exists, but the flow produced no distinct drafts for
  a reviewer to compare.
- Supporting asset roles and the four-image richer composition.

## Next steps

1. Fix the client hydration on the campaign-lab page. Reproduce on a clean
   server, confirm that Generate issues a `/api/campaign-lab/generate` request,
   and rerun the existing acceptance runner. Then rerun this pack.
2. Add a fixture or an approved-angle input for the intent-change case. Without
   it, the pack cannot tell whether the flow follows a new angle.
3. Add the Fernway trap fixture or an equivalent asset with a visible label that
   disagrees with the filename. Keep the packaging check unassessed.
4. Decide whether the richer case gets supporting asset roles. If not, record
   the evidence-use judgment as facts-and-story only.
5. Run the blind sheet only when generated and baseline pages differ. Comparing
   identical drafts cannot support an improvement claim.
