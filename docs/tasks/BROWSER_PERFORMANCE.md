# Browser performance improvements

Task branch: `task/browser-performance`, isolated worktree `Ornigami-Browser-Performance`, based on main `3022643`. Scope: Review Replies settings layout stability and connection requests, and inbox startup sequencing. Integration owns merging, the shared roadmap and deployment.

## Changes

- Reply settings render the same four fields and save action during loading. Controls stay blocked until the initial settings read succeeds; failed reads expose a reload action. Save failures still permit retrying the save.
- The Google connection read waits for a successful settings read and an explicit business ID. Overlapping reads share an in-flight request within the hook instance. Reloads after sync, selection or disconnect force a fresh read; stale responses cannot replace the current scope. Refreshes keep the existing layout while pending.
- The connection card reserves a minimum content height during loading. The inbox starts authenticated default-scope settings and stored-location reads concurrently, then requests reviews with the settings business ID when available. A failed initial location read gets one scoped retry after successful settings resolution, covering first-workspace creation. Loading continues until initial reads settle; disabled inbox controls render from the start to keep the loading area in place.

## Validation

The review loop covers both response orders, the workspace-creation race, failed reads and retries, unmounts, scope changes, overlapping connection requests, pagination, and preservation of unsaved draft edits. All 42 focused tests across six suites passed. TypeScript and the production Webpack build/static generation/CSP hashing passed. Focused ESLint passed with no errors; the two existing OAuth navigation warnings remain. Whitespace validation passed.

The [browser receipt](./browser-performance-evidence.json) measures application candidate `0b1bf09`, tree `4907c3678588fc612a17618769ab057ff14783b5`, build `QJ7GIE-jPbO_V9NiMlmmz`, inventory SHA-256 `f4eef7ab2d105cce7fb43cdb0bdba78947d14a2d69d64c7269085b5771144678`. All 40 samples passed with stable source/build, unchanged A20/A23 row snapshots, no route errors and no outbound provider attempts. Each inbox sample rendered 50 review draft controls. All ten settings samples made exactly one connection read; all ten inbox samples overlapped their settings and locations reads.

Historical baseline: commit `e6feef5`, `docs/tasks/MOBILE_BROWSER_PERFORMANCE.md` and `docs/tasks/mobile-browser-performance-evidence.json` (available with `git show`; active task docs were later consolidated). Five samples per mode/route in each run:

| Observation | Baseline | Candidate |
| --- | --- | --- |
| Settings maximum CLS, cold / warm | 0.1317 / 0.1317 | 0 / 0 |
| Settings connection reads per navigation | 2 | 1 |
| Inbox median useful content, cold | 4.258 s | 3.919 s |
| Inbox median useful content, warm | 2.455 s | 2.096 s |
| Inbox maximum CLS, cold / warm | 0 / 0 | 0 / 0 |
| Inbox bootstrap | settings → locations → reviews | settings + locations → reviews |

The observed inbox medians improved about 8% cold and 15% warm. The fixture uses 120,000 synthetic reviews and 120,000 visits, owner/outsider scope separation, loopback transport, mocked fonts, Pixel 7 emulation, configured 150 ms latency and 4× CPU slowdown. Cold contexts disable cache; warm samples follow an untimed priming navigation and prove cache hits. These are separate descriptive lab runs, not a statistical or field-performance guarantee. Settings content readiness in the general lab checks its heading; the dedicated edge checks wait for loaded controls and connection state.

The [edge receipt](./browser-performance-edge-evidence.json) records six asserted read-only browser scenarios: delayed settings preserve measured form geometry within 0.5 px and start one connection request after settings responds; initial settings failure blocks editing and reload retry recovers; disconnected owner and member states retain their respective control permissions; multiple locations render; and connection retry clears a prior OAuth error. Disconnected/multiple-location connection states and read failures use synthetic browser-intercepted responses. Mobile and desktop screenshots were inspected by the primary reviewer. Screenshots, credentials and private logs stay in the ignored fixture directory.

```powershell
node --experimental-strip-types --test tests/a13-ui-pagination.test.mts tests/a13-google-connection-hook.test.mts tests/a13-settings-connection-request.test.mts tests/a13-pagination.test.mts tests/a08-google-reviews.test.mts tests/a05-team-route-review.test.mts
npx tsc --noEmit
npx eslint src/modules/review-replies/pages/settings-page.tsx src/modules/review-replies/pages/reviews-page.tsx src/modules/review-replies/hooks/use-review-inbox-data.ts src/modules/review-replies/hooks/use-review-reply-settings.ts src/modules/review-replies/hooks/use-google-connection.ts src/modules/review-replies/services/google-connection-request.ts tests/a13-ui-pagination.test.mts tests/a13-settings-connection-request.test.mts tests/a13-google-connection-hook.test.mts scripts/browser-performance-edge-check.mjs
git diff --check
```

To reproduce in an isolated worktree with PostgreSQL 17 binaries installed:

```powershell
npm ci
node scripts/a20-app-fixture.mjs setup
node scripts/a23-performance.mjs prepare
npm install --prefix .a20-fixture/mobile-performance-tools --no-save --ignore-scripts playwright@1.63.0
node .a20-fixture/mobile-performance-tools/node_modules/playwright/cli.js install chromium
node scripts/a20-app-fixture.mjs start --serve
```

Keep the last command running, then use a second terminal in the same worktree:

```powershell
$env:MOBILE_BROWSER_PERFORMANCE_OUTPUT = '.a20-fixture/browser-performance-rerun.json'
node scripts/mobile-browser-performance.mjs run
Remove-Item Env:MOBILE_BROWSER_PERFORMANCE_OUTPUT
node scripts/browser-performance-edge-check.mjs
node scripts/a20-app-fixture.mjs cleanup
```

The lab requires a clean tracked tree matching its production build identity. The output override preserves the reviewed browser receipt. Edge checks write their own sanitized task receipt and fail on assertion failures. They authenticate only synthetic fixture users, intercept synthetic read responses and never activate provider or settings mutations. Cleanup validates task-owned paths and stops/removes only the local fixture.

After validation, fixture stop and cleanup both succeeded; the synthetic database, server, browser processes and private artifacts were removed. The final handoff commit records documentation, receipts and the reusable edge-check script; the application code is the measured `0b1bf09` candidate.

## Review and rollback

Review the branch commits and task evidence, then integrate through the separate integration session. Revert the application changes to restore the former loading behavior. No schema, package dependency or deployment configuration changes are required. Local lab timings describe the synthetic fixture and do not certify field CWV or deployed network performance. Duplicate session reads were investigated but left unchanged because no clear local cause was established in the shared session provider.
