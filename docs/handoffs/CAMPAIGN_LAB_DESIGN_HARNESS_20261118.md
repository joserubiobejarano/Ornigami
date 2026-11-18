# Campaign Lab design harness — 18 November 2026

Status: synthetic, local-only verification. This is not brand approval, visual
quality evidence, or publication approval.

- Base: `e22a69530f0729d2684f8f2d64c22d3b280a5c92`
- Branch: `codex/campaign-lab-design-harness-20261118`
- Entry point: `/campaign-lab?fixture=<fixture>` and `/campaign-lab/offer`
- Local evidence: `.local/campaign-lab-design-harness/` (Git-ignored)

## What changed

The existing direct-offer generator now receives one app-owned, versioned
request instead of a template-only prompt:

- audience and campaign objective, carried from tracked fixture defaults, the
  Campaign Lab fields, or the prepared/persisted offer-intake brief;
- approved brand character (`descriptor`, headline mode, detail title) and the
  fully resolved visual tokens, including the selected accent and computed
  accent ink;
- the selected asset and approved brand assets with role, dimensions, crop and
  caption where supplied, plus the template's allowed asset roles;
- the template's versioned layout, angle, section, headline-mode, required-input
  and limit capabilities;
- approved facts with their source document, quote, reviewer and review date;
- a runtime guidance pack with hard constraints and advisory design rules.

No parallel generator, template, renderer, approval path, or export path was
added. The provider still returns only `angle`, `layout`, `sections`, and
`factIds`. Protected copy, destination, facts, assets, brand identity, and
revision identity remain server-owned.

## Harness and guidance versions

| Item | Version / source |
| --- | --- |
| Harness | `1.0.0` (`DESIGN_HARNESS_VERSION`) |
| Guidance pack | `ornigami-single-product-offer` `1.0.0` |
| Hard rules | Ornigami template manifest and proposal validator |
| Advisory source | Ornigami design rules plus adapted Taste Skill 2.5.1 principles |
| Taste revision | `Leonxlnx/taste-skill@f6b76575f949707b4e3c37cd86cb44b0b98643e8` |
| Taste license | MIT; committed at `src/lib/campaign-lab/generation/guidance/TASTE-SKILL-LICENSE.txt` |

The pack is a lazy server-only import, called after the brief validates and a
provider is configured. Invalid forms and unavailable providers do not load it.
Application pages and components import only the small version constants for
metadata. The pack does not import Taste scripts, assets, CSS, or any of the
other installed design tools (Genjutsu, Impeccable, SuperDesign, or Better
Design). Taste's finish gate, browser checker, and asset kit were not packaged:
they assume a free-form standalone page and add navigation/effects that conflict
with this fixed single-product template. Only relevant advisory principles were
adapted.

Generation metadata now includes `harnessVersion`, `guidancePackVersion`, and
`providerMode`. The editor distinguishes:

- `status: "generated"` + `providerMode: "model"` → model generation;
- `status: "generated"` + `providerMode: "local-test"` → local-test output;
- `status: "fallback"` → deterministic draft, with the attempted provider mode.

## Synthetic briefs and captured requests

Both briefs are tracked synthetic fixtures. The first is the existing sparse
Harbor Field offer; the second is the existing Morrow long-copy/editorial
fixture. Their audiences and objectives are materially different.

| Fixture | Audience | Objective | Captured choice |
| --- | --- | --- | --- |
| `sparse` | People discovering the bottle in a paid social ad on mobile. | Send the visitor to the marketplace listing while the 20% offer is clear. | `offer-led` · `offer-led-one-photo` |
| `long-copy` | People curious about pour-over coffee who clicked an email asking what changes when the first pour is slower. | Explain the rib design and lead to the dripper page. | `story-led` · `editorial-long-copy` |

Captured provider requests:

- `.local/campaign-lab-design-harness/requests/sparse.json`
- `.local/campaign-lab-design-harness/requests/long-copy.json`

Each file contains the exact object passed to the provider and the resulting
OpenAI system/user messages. The request includes the audience, objective,
brand character, resolved tokens, selected asset (`1200 × 1500` for both briefs),
the approved brand asset list, template capabilities and limits, approved fact
sources, and the full guidance pack. The prompt text includes those values and
both guidance versions; no paid provider was called.

Reproduce with:

```powershell
node --experimental-strip-types scripts/campaign-lab-design-harness-check.mjs
```

## Focused results

- `node --experimental-strip-types --test "tests/campaign-lab-*.test.mts"`
  — **146 passed, 0 failed**.
- `npx tsc --noEmit` — passed.
- `npm run build` — passed, including TypeScript and static generation.
- Focused ESLint on the changed source, tests, and runner — passed with no
  warnings.
- Full `npm test` — **1115 passed, 3 failed**. The three failures are in
  `tests/staging-synthetic-fixture.test.mjs` and reproduce unchanged at base
  `e22a695`; they are unrelated to this harness work.
- Real route success, invalid-output, and timeout checks against
  `POST /api/campaign-lab/generate`:
  - success returned `generated`, `providerMode: local-test`, harness `1.0.0`,
    guidance `1.0.0`, and preserved offer, destination, asset and ALT text;
  - invalid mode returned `fallback` / `invalid` with the same preserved
    identity;
  - timeout mode returned `fallback` / `timeout` with the same preserved
    identity and a bounded `250 ms` message.
- Direct recovery captures are in
  `.local/campaign-lab-design-harness/summary.json`; invalid and timeout both
  retained revision `971dbcac14c0af92` for the sparse brief.

## Preview → local approval → export example

A real local browser run used `/campaign-lab?fixture=sparse`, the local-test
provider, the existing approval gate, and the existing ZIP export:

- generation: `generated`, mode `local-test`, harness `1.0.0`, guidance `1.0.0`
- revision: `9f4c0ac06f2a2bfb`
- local approval scope: `local-preview`
- export: `campaign-lab-harbor-field-travel-bottle-9f4c0ac06f.zip`
- receipt: approval revision equals rendered revision; all eight receipt checks
  are true.
- artifact:
  `.local/campaign-lab-design-harness/export-example/bundle/index.html`
- result: `.local/campaign-lab-design-harness/export-example/result.json`

The exported receipt preserved the exact offer
`20% off, 27–30 November 2026`, destination
`https://example.com/harbor-field`, action `Shop on Amazon`, approved asset
SHA-256, template version, layout and section order.

## What remains untested

- No real model call was made. The model-mode captures prove request assembly
  and prompt content, not model selection or visual quality.
- The local-test provider is deterministic plumbing. A passing harness does not
  show that a page looks better, that a model chooses a more suitable angle, or
  that a real audience responds differently.
- Real-model cost, latency, output variance, instruction-following under the
  larger prompt, and recovery from a live provider regression remain unassessed.
- The export example used the local-test output. No actual LLM-generated page
  was visually reviewed at mobile, tablet, and desktop widths.
- Audience and objective are optional for backward compatibility. Older
  fixtures/pilots without them still validate, but the harness then sends
  `null` rather than guessing campaign intent.
- The scope remains single-product offers. No new templates, arbitrary CSS,
  publishing, accounts, billing, dependency upgrades, or paid provider calls are
  included.
