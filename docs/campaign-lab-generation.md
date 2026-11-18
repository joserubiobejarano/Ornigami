# Campaign Lab generation

The Campaign Lab “Generate preview” action now runs through a server-side
generation step before the existing template renderer. This remains a local
operator slice: no publishing, accounts, billing, database writes, or deployment
changes are included.

Audience and campaign objective are optional campaign-context fields. They can
come from a tracked fixture, the Campaign Lab editor, or the browser offer
intake's prepared/persisted brief. Older fixtures, pilots, and prepared briefs
without them remain valid; the provider request then carries `null` rather than
inventing campaign intent.

## Request path

1. The editor validates the current form locally and keeps the last valid
   preview rendered.
2. **Generate preview** posts the fixture ID and the current form values to
   `POST /api/campaign-lab/generate`.
3. The route validates the form again, builds the validated ``CampaignBrief``
   from the fixture and form values, and builds a deterministic fallback draft.
4. The server sends a narrow generation request to a provider. The request
   carries the audience, campaign objective, approved brand character, resolved
   visual tokens, available asset roles and dimensions, the selected asset, the
   template capabilities and constraints, and the approved facts with their
   evidence sources. The provider may choose only:
   - an opening angle supported by the brief (`offer-led`, `product-led`, or
     `story-led` when approved story copy exists);
   - one supported layout (`offer-led-one-photo` or
     `editorial-long-copy`);
   - one exact section order allowed by that layout;
   - approved fact IDs.
5. The server validates the response, resolves fact IDs against the brief,
   assembles renderer slots from approved copy and facts, validates the slots
   and lengths against the template manifest, and returns a revision hash.
6. The editor applies the response only if it belongs to the newest request. Any
   edit invalidates the in-flight request and the gate, so an older response
   cannot overwrite newer work.

The model never sends headline, lede, product name, offer, destination URL,
asset ID, or alt text. Those values live in the validated brief and approved
asset record. The proposal validator rejects protected fields, unknown fields,
unsupported layouts, disallowed section orders, unapproved or duplicate fact
IDs, and facts outside a facts section. The draft validator enforces headline,
lede and fact length limits and verifies that every rendered claim matches its
approved fact label and value.

## Browser offer intake

The normal `/campaign-lab/offer` flow now uses the same server generation
service as fixture briefs. After the operator validates the intake, the browser
posts a bounded `browserBrief` contract to `POST /api/campaign-lab/generate`.
The route does not accept a client catalog, provider, environment, fixture ID, or
executable configuration. It validates the contract, builds the browser offer
fixture and catalog on the server with `buildBrowserOfferCatalog`, creates the
same `CampaignFormValues`, and calls `runCampaignGeneration`.

The browser keeps the packshot `File` and object URL local. Only declared asset
metadata crosses the boundary: file name, dimensions, alt text, rights, and the
SHA-256 recorded by the browser reader. The server validates the metadata shape
but does not claim to verify the image bytes. The returned preview is hydrated
with the local object URL for rendering, approval, and export. Browser response
metadata records `ownerConfirmed: false` and `assetBytesVerified: false`; the
intake's checkboxes remain operator attestations, not owner confirmation.

Audience and objective use shared 240-character limits across the browser
request, prepared briefs, pilot source/runtime manifests, form validation, and
direct service entry points. Missing values remain valid. Wrong types or
overlong values return field-level errors and are never silently truncated.

A brief may declare `requiredFactGroups`. Every fact in a group must render
together; facts outside the groups remain optional. The deterministic builder
puts the required facts first and fills remaining capacity with optional facts.
The provider validator rejects an incomplete group or a layout whose capacity
cannot hold the selected facts, then the existing fallback returns a draft that
includes the full group. If no supported layout can fit a group, the deterministic
preview returns a clear validation error and the last valid preview stays shown.
Briefs without groups keep their previous behavior.

For the Morrow fixture, **Opening focus** selects pre-approved copy for the rib
design or the first-pour story. The server rejects unfamiliar values and holds
that opening fixed through provider selection and fallback. Selecting a new
focus requires a fresh preview and approval.

## Local pilot catalog

A Git-ignored local pilot can merge one real-brand brand, fixture, and approved
asset into the same catalog. The editor shows the pilot, and the server route
uses the same catalog for validation and generation. See
[`campaign-lab-pilots.md`](./campaign-lab-pilots.md). A pilot may also expose
approved opening options. The operator selects the opening; the generator chooses
the layout, sections, and approved facts, so the fixed product, offer,
destination, and asset identity stay unchanged.

## Material claims

`ProductFact` now carries an `id`, the rendered `label`/`value`, and an approved
source record (`document`, `quote`, `reviewedBy`, `reviewedOn`). Only facts from
`CampaignBrief.productFacts` can reach the renderer. Each rendered fact exposes
`data-fact-id` and `data-fact-source` for traceability.

## Providers

`CampaignGenerationProvider` is the small boundary in
`src/lib/campaign-lab/generation/types.ts`.

| Configuration | Behaviour |
| --- | --- |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=local-test` (default) | Offline provider. Supports `CAMPAIGN_LAB_GENERATION_TEST_MODE=success`, `invalid`, `incomplete`, or `timeout`. |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=off` | Explicitly unavailable; deterministic fallback is returned. |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=openai` | Reuses the existing server-side OpenAI adapter. Requires **all** of `CAMPAIGN_LAB_GENERATION_LIVE=true`, `OPENAI_ENABLED=true`, and `OPENAI_API_KEY`. Otherwise generation is unavailable and no call is made. |

`CAMPAIGN_LAB_GENERATION_TIMEOUT_MS` bounds the request (default 5000 ms,
clamped to 50–15000 ms). The OpenAI provider uses zero retries and a small output
token cap. Live paid calls are off for verification.

## Runtime design harness

Harness version `1.0.0` is recorded in
`src/lib/campaign-lab/generation/harness.ts`. The app-owned guidance content is
under `src/lib/campaign-lab/generation/guidance/`. The provider request includes
a versioned runtime guidance pack (`ornigami-single-product-offer` version
`1.0.0`) with two deliberately separate sections:

- **Hard rules** repeat the enforceable template and identity constraints. The
  template manifest and `validateGenerationProposal` remain the source of truth;
  the hard rules are context for the provider, not a second validator.
- **Advisory guidance** covers campaign fit, sparse-material restraint, product
  image treatment, one primary action, brand character, and avoiding generic
  decoration. It never overrides approved copy, evidence, destination, assets,
  or brand identity.

The pack is loaded lazily only after a validated brief has a usable provider.
Invalid forms, unavailable providers, and the deterministic-only intake path do
not load it. It is server-side only: application pages and components import
the small version constants for metadata, never the pack content. The pack does
not import or execute every installed design tool. It uses Ornigami's rules and
a small set of advisory principles adapted from Taste Skill 2.5.1 at
`Leonxlnx/taste-skill@f6b76575f949707b4e3c37cd86cb44b0b98643e8` (MIT). The
license notice is committed at
`src/lib/campaign-lab/generation/guidance/TASTE-SKILL-LICENSE.txt`; no Taste
scripts, assets, CSS, or browser checker are bundled.

Generation metadata records `harnessVersion`, `guidancePackVersion`, and
`providerMode`. `status: "generated"` with `providerMode: "model"` is model
output, `status: "generated"` with `providerMode: "local-test"` is local-test
output, and `status: "fallback"` is the deterministic draft. The editor shows
those labels and exposes them as `data-generation-mode`,
`data-generation-harness-version`, and `data-generation-guidance-version`.

## Fallback behaviour

`GenerationMetadata.status` is `generated` or `fallback`. A fallback is shown in
three places: the editor’s **Draft source** panel, the preview status banner, and
the preview panel’s `data-generation-status` attribute. Fallback reasons include:

- `unavailable`: provider off, missing configuration, or provider setup failure;
- `invalid`: malformed output, unsupported variants/sections/facts, protected
  fields, an incomplete required fact group, insufficient layout capacity, or
  failed slot/length validation;
- `timeout`: the provider did not answer within the bound;
- `provider-error`: the provider failed before returning a proposal.

In every fallback case the server returns the deterministic draft built from the
same validated brief. The last valid preview stays usable until that fallback is
applied. An invalid edit leaves the last valid preview visible and requires a
fresh valid preview before approval.

## Approval and revisions

The revision hash includes template ID/version, layout, section order, resolved
theme, campaign facts, asset content hash and alt text, and draft slots. Approval
stores that exact hash. Any edit clears approval and invalidates in-flight
generation. Approve preview locally is disabled while a request is in flight, on
validation issues, and when the form is dirty.

## Local run

Create a git-ignored `.env.local` with the legacy local-development values and
the generation provider settings. Then:

```powershell
npm run dev -- --port 3100
```

Use `http://localhost:3100`, not `127.0.0.1`: Next.js blocks cross-origin dev
resources from `127.0.0.1`, which prevents hydration and HMR in this local
setup. If Turbopack reports the existing `next/font/google` resolution error in
this worktree, use the webpack dev server instead:

```powershell
npx next dev --webpack --port 3100
```

Open `http://localhost:3100/campaign-lab?fixture=sparse` or
`?fixture=long-copy`. Click **Generate preview**. With the default local test
provider, the **Draft source** panel should say “Generated with Local test
provider” and name the angle, section order, and fact IDs.

To verify the fallback paths, set the mode and restart the server:

```powershell
$env:CAMPAIGN_LAB_GENERATION_TEST_MODE="invalid"   # or "timeout"
$env:CAMPAIGN_LAB_GENERATION_TIMEOUT_MS="250"      # for a quick timeout
npm run dev -- --port 3100
```

The editor should keep a valid preview and show a Deterministic fallback reason.

## Verification commands

Focused generation tests (success, invalid, timeout, unavailable, protected
identity, validation limits, request gate):

```powershell
node --experimental-strip-types --test tests/campaign-lab-generation.test.mts
```

Design-harness tests and request captures:

```powershell
node --experimental-strip-types --test tests/campaign-lab-design-harness.test.mts
node --experimental-strip-types scripts/campaign-lab-design-harness-check.mjs
```

The runner writes synthetic provider requests, prompts, recovery results, and a
summary under `.local/campaign-lab-design-harness/` (Git-ignored).

HTTP evidence through the actual route, while the dev server is running:

```powershell
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --fixture sparse --expect generated
```

Browser-offer evidence through the real intake and generation route:

```powershell
node scripts/campaign-lab-browser-generation-check.mjs `
  --url http://localhost:3100 --scenario success
```

Use the same command with `--scenario invalid`, `timeout`, or `stale` after
restarting the dev server with the matching local-test mode. Reports, captures,
and exported bundles stay under `.local/campaign-lab-browser-generation/`.

For the fallback evidence, restart with the matching test mode and use
`--expect fallback --expect-code invalid` or `--expect-code timeout`.

Existing browser acceptance suite with the approved fixture manifest:

```powershell
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Warm the dev server once before the acceptance run so the page and API chunks
are compiled; the runner has a short settle window after clicking Generate.

The acceptance runner only drives the published accessible interface and does not
import the generation code.

## Quality limits

- The local test provider is a deterministic stand-in, not evidence of model
  quality. It does not prove that a real model chooses a better angle.
- The harness proves that campaign context and versioned guidance reach the
  provider request, not that a real model produces a better-looking page. Visual
  quality still requires a fresh model run and human preview review.
- The generator chooses among approved template options; it does not author free
  prose. This is intentional for claim safety and reviewability, but limits
  stylistic range.
- Fact selection is limited to the approved fixture facts. There is no retrieval
  layer, fact conflict handling, or per-fact approval UI beyond the editor’s
  provenance display.
- OpenAI provider behaviour is not exercised by the verification run; only its
  configuration gate and adapter path are covered statically. Live cost, latency,
  and output quality remain unassessed.
- The route is development-only and unauthenticated. Do not expose it publicly.
- Approval remains session-local and resets on refresh. Publishing, persistence,
  rollback, and deployment are out of scope.
