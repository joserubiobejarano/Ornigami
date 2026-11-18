# Campaign Lab advisory guidance evaluation

> Follow-up 19 November 2026: live-provider diagnostics and cost accounting were
> corrected in
> [`CAMPAIGN_LAB_LIVE_PROVIDER_DIAGNOSTICS_20261119.md`](./handoffs/CAMPAIGN_LAB_LIVE_PROVIDER_DIAGNOSTICS_20261119.md).
> The historical run below is preserved unchanged; its recorded `$0` is not proof
> that missing-usage requests cost nothing.

This is a small blinded comparison of the current Ornigami advisory pack. It
does not evaluate the complete Taste Skill or any other design tool.

## Design

- **A:** full campaign context and enforceable hard constraints, with advisory
  rules omitted.
- **B:** the identical request plus the current Ornigami advisory rules.

Model, provider settings, validation, renderer, fallback, briefs, offers,
destinations, facts, and assets stay identical. Each condition runs twice per
brief for a maximum of 12 paid requests. Retries are zero and results are never
rerun to seek a better-looking output.

The three frozen synthetic briefs are in
`tests/fixtures/campaign-eval/guidance-eval/briefs.json`:

1. `sparse-social` — one-photo Harbor Field direct offer.
2. `morrow-rib-email` — Morrow offer with four approved optional facts, so the
   three-fact selection is meaningful.
3. `morrow-first-pour` — the same Morrow brand, product, offer, destination,
   hero asset, and approved evidence with a different audience/objective and
   selected approved opening.

## Valid choices before execution

| Brief | Angle | Layouts | Approved facts | Valid plans | Distinct rendered plans |
| --- | --- | --- | --- | ---: | ---: |
| `sparse-social` | `offer-led` | both | `capacity`, `closure`, `material` | 16 | 16 |
| `morrow-rib-email` | `story-led` | both | `interior`, `outlet`, `body`, `finish` | 30 | 30 |
| `morrow-first-pour` | `story-led` | both | `interior`, `outlet`, `body`, `finish` | 30 | 30 |

The angle is constrained by each brief’s approved profile/headline. The model
still chooses among two layouts, the layout’s allowed section orders, compact
versus facts/detail arrangements, and approved fact subsets. No brief has only
one rendered plan, so none is marked predetermined.

Deterministic references, generated without paid calls:

- `sparse-social`: offer-led one-photo, hero → hero-facts → close, facts
  `capacity`, `closure`, `material`.
- `morrow-rib-email`: editorial long-copy, hero → detail → close, facts
  `interior`, `outlet`, `body`.
- `morrow-first-pour`: editorial long-copy, hero → detail → close, facts
  `interior`, `outlet`, `body`.

## Provider and cost preflight

| Item | Value |
| --- | --- |
| Provider | Existing OpenAI adapter settings |
| Model | `gpt-4o-mini` (provider default; `CAMPAIGN_LAB_GENERATION_MODEL` unset) |
| Requests | 12 maximum (3 briefs × 2 conditions × 2 repeats) |
| Retries | 0 |
| Output bound | 300 tokens per request |
| Temperature | 0.2 |
| Response format | `json_object` |
| Timeout | 5000 ms |
| Input price | $0.15 per 1M tokens |
| Output price | $0.60 per 1M tokens |
| Estimated cost | $0.008197 |
| Conservative ceiling | $0.026306 |
| Recommended explicit cap | $0.03 |

No paid call is allowed without `run --execute --cap-usd <amount>`. The runner
refuses to start if the cap is below the conservative ceiling. Before each call
it reserves the prompt’s character count as input tokens plus the output bound;
it stops rather than cross the cap and never retries.

## Preparation and dry run

```powershell
node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs preflight
node scripts/campaign-eval.mjs validate
node --experimental-strip-types --test "tests/campaign-lab-*.test.mts"
```

Dry-run evidence is under `.local/campaign-lab-guidance-eval/`:

- `preflight/preflight.json` and `.md`
- deterministic previews and artifacts
- a rendered deterministic gallery, blank review sheet, mapping, and exports
- a functional-gate dry run using `campaign-lab-guidance-eval-report.mjs`

## Paid run and review

```powershell
node --experimental-strip-types scripts/campaign-lab-guidance-eval.mjs run `
  --execute --cap-usd 0.03 --env-file C:\Users\joser\Desktop\Projects\Ornigami\.env.local `
  --out .local/campaign-lab-guidance-eval/authorized

node scripts/campaign-lab-guidance-eval-render.mjs `
  --run .local/campaign-lab-guidance-eval/authorized `
  --url http://localhost:3130

node scripts/campaign-lab-guidance-eval-report.mjs `
  --run .local/campaign-lab-guidance-eval/authorized
```

Rendering replays saved valid previews through the normal Campaign Lab preview,
local approval, and export paths. It does not call the provider. Captures are
article-only at 375, 768, and 1440 px. The gallery and blank review sheet use
neutral labels; the condition/repeat mapping is stored separately.

Functional gates stay in `functional/`. Human review covers campaign fit,
relevant evidence, hierarchy, repetition, and edits needed. Identical outputs,
mixed results, or no observable improvement are valid findings; no scores are
invented.

## Authorized run result

The explicit cap was **$0.03**. The runner made all 12 planned attempts and then
stopped; no retry or rerun was performed.

- Model: `gpt-4o-mini`
- Requests: 12
- Generated outputs: 0
- Fallbacks: 12, all `provider-error`
- Invalid results: 0
- Timeouts: 0
- Recorded token usage: 0 prompt / 0 completion
- Recorded spend: $0
- Latency range: 149–1449 ms

The existing real-model adapter returned the generic `provider-error` fallback
for every attempt, so no model proposal or preview reached validation. The
underlying API error message is not preserved by that adapter. A non-generative
`models.retrieve("gpt-4o-mini")` diagnostic succeeded, so the credential and
model identifier are at least readable; that does not explain the chat
completion failures.

Because there are no model outputs, conditions A and B are **unassessed**. The
renderer produced the deterministic reference gallery, exports, mapping, and
blank review sheet only. The functional report records the 12 fallbacks and does
not treat them as generated evidence.

Recommendation: this run provides no evidence that the advisory pack improves or
worsens model choices. Do not choose or remove guidance based on it. A valid
evaluation needs the provider request failure diagnosed and a new authorization;
rerunning this run would exceed the 12-request experiment limit and is prohibited
by the no-rerun rule.

Evidence:
`.local/campaign-lab-guidance-eval/authorized/`,
including `run.json`, `preflight.md`, `review/gallery.html`,
`review/review-sheet.md`, `review/mapping.json`, `functional/`, and three
deterministic reference exports.
