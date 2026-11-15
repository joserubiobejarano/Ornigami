# Campaign Lab generation handoff — 15 November 2026

## Branch and local run

- Branch: `feat/campaign-lab-generation`
- Base: `a29753b` (`fix: verify campaign lab integration against approved fixtures`)
- Worktree: `C:/Users/joser/.local/share/opencode/worktree/7bfa2f/campaign-lab-generation`
- Route: `http://localhost:3100/campaign-lab`
- Fixtures: `?fixture=sparse` and `?fixture=long-copy`

The route remains development-only. Publishing, auth, billing, persistence,
database migrations, and deployment are unchanged.

## What changed

**Generate preview** now posts the six form values to
`POST /api/campaign-lab/generate`. The route validates the form, rebuilds the
validated brief and approved asset record, and runs a provider behind
`CampaignGenerationProvider`.

The provider may propose only:

- an opening angle supported for the brief (`offer-led`, `product-led`, or
  `story-led` when approved story copy exists);
- one of the two versioned layouts;
- one exact section order allowed by that layout;
- approved fact IDs.

The server rejects protected identity fields in provider output, unsupported
layouts and section orders, unknown or duplicate facts, facts outside a facts
section, and any rendered slot that breaks template length limits. Product name,
offer, destination URL, asset ID, and alt text always come from the validated
brief and approved asset record.

`ProductFact` now carries an ID and an approved source record (document, quote,
reviewer and date). Selected facts are resolved from the brief. The renderer
exposes `data-fact-id` and `data-fact-source`, and only renders the approved
label/value pair.

The deterministic builder remains the fallback and the initial preview source.
`TemplateDraft` now records its section order. The renderer conditionally renders
the hero facts or editorial detail band from that order, so generation can
arrange only supported sections. The local test provider demonstrates selection:
it surfaces two of the three approved sparse facts in the offer-led arrangement
and three of the four approved long-copy facts in the editorial arrangement.

## Provider configuration

| Setting | Result |
| --- | --- |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=local-test` (default) | Offline deterministic provider. `CAMPAIGN_LAB_GENERATION_TEST_MODE=success`, `invalid`, or `timeout`. |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=off` | Deterministic fallback with an explicit unavailable reason. |
| `CAMPAIGN_LAB_GENERATION_PROVIDER=openai` | Reuses `src/lib/openai.ts`, with zero retries. Requires `CAMPAIGN_LAB_GENERATION_LIVE=true`, `OPENAI_ENABLED=true`, and `OPENAI_API_KEY`; otherwise no call is made. |

`CAMPAIGN_LAB_GENERATION_TIMEOUT_MS` is bounded to 50–15000 ms (default 5000).
No live paid call was made during verification.

## Fallback, stale responses, and approval

- A provider failure returns a valid deterministic preview plus
  `generation.status = "fallback"` and a reason (`unavailable`, `invalid`,
  `timeout`, or `provider-error`).
- The editor shows the fallback in the **Draft source** panel, the preview status
  banner, and `data-generation-status`.
- Every edit advances a monotonic request gate and aborts the in-flight request.
  An older response is ignored, so it cannot overwrite a newer edit.
- Approval stores the exact preview revision hash. Any edit clears approval; a
  response with different rendered slots does not inherit the old approval.
  Approval is disabled while generation is in flight and while the form is dirty.

## Verification

Run from the worktree:

```powershell
npx tsc --noEmit
npx eslint src/app/campaign-lab src/app/api/campaign-lab src/components/campaign-lab src/lib/campaign-lab tests/campaign-lab-generation.test.mts scripts/campaign-lab-generation-check.mjs
node --experimental-strip-types --test tests/campaign-lab.test.mts tests/campaign-lab-generation.test.mts
```

Results:

- TypeScript: clean.
- ESLint: clean.
- Existing campaign-lab tests: 12/12 passed.
- New generation tests: 11/11 passed (success both fixtures, invalid output,
  timeout, unavailable, protected identity, unsupported variants/sections/facts,
  template length/claim validation, story-angle availability, provider config,
  request gate).
- Full `npm test`: 956/960 passed. The three reproducible failures are the
  pre-existing `tests/staging-synthetic-fixture.test.mjs` parser checks, which
  also fail on the base commit. The fourth full-run failure was the
  `vercel-preview-build-gate` bash `/tmp` warning under load; that file passes
  6/6 in isolation. No campaign-lab test failed.

Start the local app (see the Turbopack/font note below):

```powershell
npx next dev --webpack --port 3100
```

HTTP evidence through the actual route:

```powershell
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --fixture sparse --expect generated
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --fixture long-copy --expect generated
```

Fallback evidence uses a server restart with the matching test mode:

```powershell
$env:CAMPAIGN_LAB_GENERATION_TEST_MODE="invalid"
# restart, then:
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --fixture sparse --expect fallback --expect-code invalid

$env:CAMPAIGN_LAB_GENERATION_TEST_MODE="timeout"
$env:CAMPAIGN_LAB_GENERATION_TIMEOUT_MS="250"
# restart, then:
node --experimental-strip-types scripts/campaign-lab-generation-check.mjs `
  --url http://localhost:3100 --fixture sparse --expect fallback --expect-code timeout
```

Existing browser acceptance suite:

```powershell
$env:CAMPAIGN_LAB_PLAYWRIGHT="C:\Users\joser\Desktop\Projects\Ornigami\scripts\framework-prototype\browser-tools\node_modules\playwright\index.mjs"
node scripts/campaign-lab-acceptance.mjs `
  --url http://localhost:3100 `
  --manifest tests/fixtures/campaign-lab/approved-fixtures.json `
  --require-approved
```

Final result: **144 passed, 0 failed, 0 pending, 0 unassessed** across both
fixtures at 375 px and 1440 px. The raw report and captures remain under
`.local/acceptance-success/` (Git-ignored). Warm the dev server once before the
acceptance run so page and API chunks are compiled.

Run the browser at `http://localhost:3100`, not `127.0.0.1`; Next.js blocks
cross-origin dev resources on `127.0.0.1`, which prevents hydration in this
setup. If Turbopack reports the existing `next/font/google` module-resolution
error, use `npx next dev --webpack --port 3100` as above.

## Evidence in this directory

- [success-editor.png](./campaign-lab-generation-20261115/success-editor.png) — generated long-copy preview and
  **Draft source** provenance.
- [success-preview.png](./campaign-lab-generation-20261115/success-preview.png) — generated campaign page.
- [browser-success.json](./campaign-lab-generation-20261115/browser-success.json) — generated status, angle,
  section order, fact IDs, revision, exact CTA, image and fact source text.
- [timeout-fallback-editor.png](./campaign-lab-generation-20261115/timeout-fallback-editor.png) — visible
  deterministic fallback with the 250 ms timeout reason.
- [timeout-fallback-preview.png](./campaign-lab-generation-20261115/timeout-fallback-preview.png) — fallback page
  still showing approved offer, destination and image.
- [stale-response-gate.png](./campaign-lab-generation-20261115/stale-response-gate.png) — after a delayed older
  response and a newer edit/generation, the newer offer remains rendered.
- [browser-fallback-stale.json](./campaign-lab-generation-20261115/browser-fallback-stale.json) — fallback status,
  preserved offer/destination, and stale-response result.
- [success-sparse.json](./campaign-lab-generation-20261115/success-sparse.json) and
  [success-long-copy.json](./campaign-lab-generation-20261115/success-long-copy.json) — HTTP route evidence for
  both fixtures.
- [invalid-sparse.json](./campaign-lab-generation-20261115/invalid-sparse.json) — rejected proposal with protected
  fields and unsupported variants, still yielding the deterministic draft.
- [timeout-sparse.json](./campaign-lab-generation-20261115/timeout-sparse.json) — timeout fallback evidence.

## UX / DX / AX

- **UX:** Generating now uses the server path while the last valid preview stays
  usable, fallback is named in the editor, and approval remains tied to the
  rendered revision. Checked against the existing edit, invalid-input, approval,
  and responsive acceptance behavior.
- **DX:** One provider interface, one manifest-driven validator, a deterministic
  fallback, and focused tests keep the new path inspectable and reversible
  without changing the renderer contract. Checked against the existing template
  tests and approved fixture manifest.
- **AX:** Provider output is limited to stable IDs, errors name the rejected
  variant/section/fact, and the preview exposes generation status, angle,
  section order, fact IDs, revision, and source text for inspection. Checked
  against the existing data attributes and accessible status regions.

## Remaining quality limits

- The local test provider is a deterministic stand-in, not evidence of model
  judgment. It cannot show that a real model picks a better angle or fact set.
- Generation selects among approved template options; it does not write free
  prose. This is intentional for claim safety, but limits stylistic range.
- Fact selection has no retrieval layer, conflict handling, or per-fact approval
  UI beyond the editor source trace.
- The OpenAI path is configuration-gated and statically checked but was not
  exercised. Live cost, latency, JSON reliability, and quality remain
  unassessed.
- The route is development-only and unauthenticated. Do not expose it publicly.
- Approval remains session-local and resets on refresh. Publishing, persistence,
  rollback, and deployment remain out of scope.
- Turbopack dev in this worktree hits the pre-existing `next/font/google`
  resolution error; webpack dev was used for the verification run.

