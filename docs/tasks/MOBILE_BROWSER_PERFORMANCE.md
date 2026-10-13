# Mobile/browser performance handoff

Measured source: merged main `0bcdd8f`, in the separate `Ornigami-Mobile-Browser` worktree on `task/mobile-browser-performance`. This task adds a reproducible local browser lab and investigates browser costs. Application behavior and visual design are unchanged. No merge, deployment, production/provider mutation, or shared-roadmap update is part of this handoff.

## Measurement boundary

The lab uses the existing A20 production-build fixture and A23 synthetic dataset: 120,000 reviews and 120,000 visits, each split into 96,000 owner rows and 24,000 outsider rows. Only the synthetic owner signs in. PostgreSQL, the Neon bridge, application server, and browser egress proxy run on loopback. Provider calls are blocked; fixture credentials and review text never enter the tracked evidence.

Playwright 1.63.0 / Chromium 153.0.8010.12 emulates a Pixel 7 with a mobile user agent, touch, a 412 × 915 viewport and 2.625 device scale factor (Windows, Node 24.11.1, npm 11.6.2). The configured CDP network profile is 150 ms latency, 1.6 Mbps download and 750 Kbps upload, with a 4× CPU slowdown. Each of four routes gets five fresh-context/cache-disabled runs and five cache-enabled runs after an untimed priming navigation. Warm samples must show browser cache hits. This is browser-cache isolation, not a cold application process or database.

Capture occurs before the scripted interaction, after rendered-content assertions and a bounded settling interval. LCP is the observed navigation candidate; CLS uses the largest session window and excludes recent-input shifts ([Chrome's definition](https://web.dev/articles/cls)). The receipt includes navigation timing, JavaScript transfer sizes, long-task totals, API request timelines, rendered review counts, errors, cache hits and read-only interaction completion times. Summaries use nearest-rank median and maximum over five samples, not field percentiles. UI timing includes automation, network/DOM completion and two animation frames; it is not INP.

The fixture uses mocked Google font responses, synthetic short review comments and local database/server transport. It does not represent physical handset speed, actual font loading, remote Neon/Vercel latency, long review text, ten concurrent browser users, sustained capacity or real-user CWV. The existing field targets remain LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 at field p75; this lab cannot close those field gates.

## Evidence and findings

The [machine receipt](./mobile-browser-performance-evidence.json) records 40/40 samples and eight successful read-only interactions on October 13, 2026. Source/tree and build hashes stayed unchanged, as did A20 state and A23 full-row hash/count snapshots. There were no browser errors, failing API statuses, external browser requests or blocked provider attempts. Every inbox sample rendered 50 review draft controls. Every cold sample had zero cache hits; every warm sample showed 15–22 cache hits and zero transferred script bytes.

Measured application tree: `13ecccaf0729c46cc21be259c4b25f97462e8ea1`. Build ID: `jeohe97Yt4UXdcSo4fSgG`. Build inventory SHA-256: `1f42cec8a2c3af030d923b23a22292c7e96dfd9cc3e6f7e7be4856ba327dbf78`. The new lab scripts were untracked while measuring the unchanged application at `0bcdd8f`; the handoff commit records the reviewed harness. Fixture database, application and private tooling have been stopped and cleaned.

Five samples per table cell; LCP and content-ready values are medians in seconds. CLS is the maximum observed session score. Cold script sizes include transfer overhead.

| Route | Cold / warm LCP | Cold / warm content ready | Cold / warm max CLS | Cold script bytes |
| --- | --- | --- | --- | --- |
| Public `/` | 1.156 / 0.400 | 1.241 / 1.265 | 0 / 0 | 219,173 |
| Dashboard | 1.296 / 0.908 | 1.284 / 0.920 | 0 / 0 | 261,576 |
| Review inbox | 1.160 / 0.804 | 4.258 / 2.455 | 0 / 0 | 288,802 |
| Review Replies settings | 1.184 / 0.888 | 0.864 / 0.907 | 0.1317 / 0.1317 | 284,731 |

Content readiness means the route's visible text assertion; for the inbox it additionally requires at least 20 draft controls (50 were present when captured). It includes automation polling overhead. On settings it proves the heading, not completion of asynchronously loaded settings controls. All observed LCP values were below 2.5 s; the largest was 1.388 s. No field or INP pass is inferred.

### Bottlenecks and next implementation candidates

1. **Inbox content waits behind hydration and serial API requests.** The useful inbox took median 4.258 s / maximum 4.499 s cold and median 2.455 s / maximum 2.849 s warm, although its LCP occurred much earlier. Cold sample 1 starts reply settings at 2.870 s, locations at 3.174 s, and reviews at 3.616 s. The hook's settings → locations → selected-location reviews dependencies explain the measured sequence ([use-review-inbox-data.ts](../../src/modules/review-replies/hooks/use-review-inbox-data.ts), settings/location effects around lines 330–351 and reviews effect around 384–392). Prefer supplying initial authorized business/location scope earlier or eliminating redundant dependencies; preserve tenant authorization and fixture scope checks. Validate improvement against rendered reviews, not LCP alone.

2. **Settings layout is unstable during asynchronous loading.** CLS exceeded 0.1 in one of five cold runs and two of five warm runs; both modes had median 0.0997 and maximum 0.1317. Raw shift attribution identifies card-like DIVs previously visible at y=633 / y=851 whose current rectangles became zero. This locates the affected card region but does not uniquely identify a component or prove a single cause. Settings replaces loading content with a larger form and toggles connection loading state ([settings-page.tsx](../../src/modules/review-replies/pages/settings-page.tsx), around lines 246 and 350–371). Keep the loading/content geometry stable in that region and remeasure after a reviewed change.

3. **Settings duplicates the connection request.** Every settings sample contains two successful `GET /api/google/connection` calls, as well as two session reads. Source starts a connection request before business ID resolves and starts another when that ID changes (settings page lines 89–112; [use-review-reply-settings.ts](../../src/modules/review-replies/hooks/use-review-reply-settings.ts), lines 45–73). Defer the scoped connection fetch until the required business is known, or provide its scope with initial data. Request paths are aggregated without query strings; the source audit explains the likely unscoped/scoped distinction. The duplicate and layout shifts coexist; their causal contribution to CLS remains an inference.

4. **Browser execution still costs time with cached assets.** Cold inbox loads record 624–1,008 ms across long tasks; warm loads record 516–680 ms, with individual tasks up to 347 ms. All 50 live cards mount expanded ([review-list.tsx](../../src/components/reviews/review-list.tsx), around lines 88–109). The shared client `LayoutFrame` imports marketing chrome even where it hides that chrome at runtime ([layout-frame.tsx](../../src/components/layout-frame.tsx)). These are concrete profiling candidates, but this lab has no JavaScript stack attribution and cannot assign those task durations to a particular component. Profile before changing card rendering or client boundaries; also test long review comments.

The root's `force-dynamic` configuration is another source-level cost candidate for public requests. Public loopback response-start timing was only 22.6–43.7 ms in this run, so it is not an established public-page server bottleneck. The configured 150 ms CDP latency is not uniformly reflected in navigation response-start values; treat it as an emulation configuration, not proof that every local request incurred that delay or a substitute for a deployed network baseline.

Inbox pagination completed in 864 ms cold and 697 ms warm. Dashboard and settings interactions open the shared mobile agent menu; the public interaction navigates to `/demo`. These are single descriptive observations per mode/route, including automation and completion checking, and do not certify settings editing, posting, provider calls or field interaction responsiveness. This task intentionally delivers the baseline and bounded diagnosis; application optimizations require a subsequent comparison against it.

## Validation and review

The production Webpack build, TypeScript step and CSP hash generation passed under the isolated fixture. A corrected eight-sample smoke run validated the harness before the 40-sample run. Primary review and an independent Luna review checked cache semantics, rendered data, metric calculations, API timing, isolation and snapshot checks; draft metric/action issues were corrected before the baseline. All 23 focused fixture/bridge, A23 performance and new metric regression checks passed. Focused ESLint passed without warnings; whitespace validation passed. The settings CLS findings remain open performance issues despite the receipt's integrity `pass: true`.

```powershell
node --experimental-strip-types --test tests/mobile-browser-performance-core.test.mts tests/a23-performance.test.mts tests/a20-app-fixture-core.test.mts tests/a20-neon-bridge-marker.test.mts tests/a20-neon-bridge.test.mts
npx eslint scripts/mobile-browser-performance.mjs scripts/mobile-browser-performance-core.mjs tests/mobile-browser-performance-core.test.mts
git diff --check
```

Integration can review/cherry-pick this branch's handoff. The shared roadmap, main branch and deployment were not changed. The deployed HTTP/mobile baseline and real-user field confirmation remain separate work.

## Reproduce in a clean isolated worktree

Prerequisites: Node/npm, Git, PostgreSQL 17 binaries (default Windows location `C:/Program Files/PostgreSQL/17/bin`, or `A20_PG_BIN`), and no shared `.env` files. The existing A20 lifecycle validates its own cluster and drops inherited provider environment variables. Provisioning uses only synthetic data. The browser tooling stays under the ignored fixture directory; it does not change application dependencies.

```powershell
npm ci
node scripts/a20-app-fixture.mjs setup
node scripts/a23-performance.mjs prepare
npm install --prefix .a20-fixture/mobile-performance-tools --no-save --ignore-scripts playwright@1.63.0
node .a20-fixture/mobile-performance-tools/node_modules/playwright/cli.js install chromium
node scripts/a20-app-fixture.mjs start --serve
```

Keep the last command running in a separate terminal. It builds the production application with the fixture preload and mocked fonts, generates CSP hashes and serves on a task-owned loopback port. Run the lab from another terminal in the same worktree:

```powershell
$env:MOBILE_BROWSER_PERFORMANCE_OUTPUT = '.a20-fixture/mobile-smoke-evidence.json'
node scripts/mobile-browser-performance.mjs smoke
$env:MOBILE_BROWSER_PERFORMANCE_OUTPUT = '.a20-fixture/mobile-rerun-evidence.json'
node scripts/mobile-browser-performance.mjs run
Remove-Item Env:MOBILE_BROWSER_PERFORMANCE_OUTPUT
node scripts/a20-app-fixture.mjs stop
```

The output override prevents exploratory reruns from replacing the committed baseline. Without it, the runner writes `docs/tasks/mobile-browser-performance-evidence.json`. `smoke` measures one sample per mode/route; `run` measures five. `pass` certifies complete measurements, successful read-only interactions, isolation and unchanged source/build/database checks. Performance threshold comparisons are separate in `labTargetFindings`; a measurement pass does not certify CWV targets. The runner requires the tracked tree and build to match, so commit any reviewed work before building a new candidate.

After preserving any desired private diagnostic receipts, `node scripts/a20-app-fixture.mjs cleanup` validates the task-owned paths, stops its database/server and removes only this worktree's synthetic fixture. This also removes the fixture-local browser tooling, which can be reinstalled with the commands above. No production credentials or provider access are needed.
