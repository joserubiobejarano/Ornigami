# Builder browser blockers handoff

20 November 2026. Local source only; no deployment, customer message, real
provider call, paid call or publication. Synthetic subjects only, live provider
disabled, default access closed.

## Exact source

- Branch: `codex/ornigami-builder-browser-blockers-20261120`
- Base: `7b8674358d5421c589bea22f55167276f4d391ec`
- Implementation commit: `3193358396b9ec3c99c3556ccbcc22f716883d69`
- Worktree: `C:/Users/joser/.local/ornigami-builder-browser-blockers-20261120`

The implementation touches only the client generation attempt seam, the shared
draft lifecycle, the builder runtime components, and focused tests. It does not
modify `builder-runtime/app/api/builder/generate/route.ts`; Session 2 owns that
route and the server-side key contract is unchanged.

The decision and lifecycle table are in
[`docs/BUILDER_BROWSER_BLOCKERS_20261120.md`](../BUILDER_BROWSER_BLOCKERS_20261120.md).

## What changed

- `src/lib/campaign-lab/generation/generation-attempt.ts` — new immutable
  attempt type and `gen_<uuid>` key factory, independent of the local sequence.
- `src/components/campaign-lab/campaign-lab.tsx` — keeps
  `GenerationRequestGate` for stale-response ordering, sends the attempt key as
  `requestId`, and registers generation/export abort controllers with the
  lifecycle.
- `src/lib/campaign-lab/draft-lifecycle.ts` — shared
  `CampaignDraftLifecycle` interface (`canPersist`,
  `registerPendingWork`, `releasePendingWork`).
- `src/components/campaign-lab/offer-intake.tsx` — refuses to restore, apply or
  persist a brief while persistence is disabled, and forwards the lifecycle to
  `CampaignLab`.
- `builder-runtime/lib/client-lifecycle.ts` — one `builderClientLifecycle`
  singleton used by the workspace, intake and logout control. It disables
  persistence first, aborts pending work, removes every
  `ornigami.builder.offer-intake.brief.v1*` key, and broadcasts
  `workspace-ended`.
- `builder-runtime/app/_components/builder-runtime-workspace.tsx` — expiry and
  subject-change checks run the shared teardown; remote broadcast tears down
  without rebroadcasting and reloads.
- `builder-runtime/app/_components/builder-logout-button.tsx` — starts teardown
  before the request, confirms on 2xx, and renders a `[data-builder-logout-error]`
  alert plus "Retry sign out" on non-2xx or network failure.
- `tests/campaign-lab-generation-attempt.test.mts` — 3 tests for key uniqueness,
  retry stability and invalid sequences.
- `tests/builder-client-lifecycle.test.mts` — 2 tests for ordering, abort,
  storage scope, confirmation and broadcast.

## B1 closure: separate attempt identity

Root cause: the client sent `String(requestGate.begin())` as `requestId`. That
value restarts at `"1"` on every mount and is shared by tabs, so a reload,
"Edit brief inputs" remount or second tab replayed `"1"` and the server treated
it as an already-submitted request.

Fix: the gate still starts at 1 for ordering, but the HTTP `requestId` is now a
new `gen_<uuid>` per intentional attempt. Replaying one attempt still sends the
same key, so the server's one-reservation guarantee is unchanged.

Acceptance observed, against the production build:

- initial generation produced a preview;
- reload restored the same-subject brief and produced a new preview with a new
  key;
- "Edit brief inputs" + changed offer produced a new preview with a new key;
- a second tab in the same context produced its own preview with its own key;
- 7 UI generation requests carried 7 distinct `gen_<uuid>` keys;
- posting one attempt twice returned `200` then `409
  request_already_submitted`, and the store held exactly one usage record for
  that key.

## B2 closure: shared teardown lifecycle

Root cause: the old logout button cleared only the current tab's storage before
the request, then navigated home even when revocation failed. Restore/persist
effects could write the brief back, and pending generation could finish into the
old workspace.

Fix: one singleton lifecycle orders every end event as persistence-off → abort
pending work → clear drafts → notify tabs. Intake restore/apply/persist and
generation/export entry points all consult it. Logout success confirms and
navigates; logout non-2xx or network failure leaves the page on `/builder` with
the retryable alert instead of claiming success.

Acceptance observed:

- 503 from logout: retry button visible, URL still `/builder`, builder storage
  empty, no navigation to the sign-in page until retry;
- network abort from logout: same retryable state, and retry then succeeded;
- confirmed logout cleared storage in both open tabs; the other tab reached the
  sign-in page and neither tab restored the old brief;
- reload → logout cleared the restored brief;
- generation in flight during logout was aborted and its offer never appeared
  in the next workspace;
- sign-out followed by a different synthetic invite showed identity B with no
  identity A text; a delayed identity B generation completed after an account
  switch did not enter identity C's workspace;
- a 2-second-TTL server on a separate store expired an open tab; on focus the
  client cleared the workspace and reached sign-in.

## Acceptance evidence

Environment: `NODE_ENV=production`, `builder-runtime` started with
`next start` after `node scripts/builder-runtime-qualify.mjs build`.
`BUILDER_RUNTIME_MODE=invite`, a local `.local` store,
`BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1`,
`BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS=2200`, synthetic single-use invites.

Commands run from the worktree:

```text
npm ci --no-audit --no-fund
npm ci --no-audit --no-fund   # scripts/framework-prototype/browser-tools
npx tsc --noEmit
npx eslint <changed source and test files>
node --experimental-strip-types --test tests/campaign-lab-generation-attempt.test.mts tests/builder-client-lifecycle.test.mts
node scripts/builder-runtime-qualify.mjs build
node scripts/builder-runtime-qualify.mjs smoke
node .local/browser-blockers-verify.mjs
```

Results:

- focused attempt/lifecycle tests: **5/5 pass**;
- Campaign Lab suites: **360/360 pass**;
- production build: passed, **0 denied egress attempts**;
- default-closed smoke: passed, **0 denied egress attempts**;
- browser acceptance: **37/37 checks**, `ok: true`, 7 unique keys.

Export integrity after editing (`edited-offer`): revision
`d541b7ad0b16da1b`, offer “Edited offer 222222 for the travel bottle”, price
`222222`, 14 ZIP entries, receipt/meta agreement, packshot SHA-256 match and a
clean ZIP test. A second subject (`identity-b`) exported revision
`d2d6ba735ab4f4b4` for “Black Friday offer: $9” with the same integrity checks.

Evidence lives in the Git-ignored `.local/browser-blockers-evidence/`:
`results.json`, `downloads/edited-offer.zip`, `downloads/identity-b.zip`,
`extracted/`, `screenshots/two-tabs-1440.png`,
`screenshots/signout-failure-1440.png` and
`screenshots/expiry-signin-1440.png`. The acceptance runner
`.local/browser-blockers-verify.mjs` is also local-only and reproduces the run
against a fresh store.

## Remaining limits

- Acceptance used Chromium at 1440×900 only; Firefox, WebKit and mobile
  viewports were not exercised.
- This is a local single-process runtime and store, not staging or a deployed
  environment. Nothing was deployed and no real user or provider was contacted.
- Cross-tab clearing depends on `BroadcastChannel`; if it is unavailable a tab
  still clears its own storage and is corrected by the 15-second session
  poll/focus check, but not instantly.
- An unconfirmed sign-out deliberately re-enables local editing because the
  server session may still be valid. The operator must retry; the old draft is
  already cleared.
- The full repository suite was not rerun; known pre-existing failures outside
  the builder remain as recorded previously.
- Server-side generation idempotency, quota and accounting are unchanged and
  still owned by the generation-limits work; this slice does not re-qualify
  them beyond the replay check above.
