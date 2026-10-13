# A23 Performance

This package prepares synthetic, business-scoped fixtures and measures ten concurrent authenticated read sessions against a local production build. Acceptance requires per-route and aggregate nearest-rank p95 at or below 3,000 ms, with no unexpected response errors or timeouts.

## Scope

The task runs in the `task/performance` worktree. It uses the existing A20 guarded local PostgreSQL/Neon bridge and production Next.js fixture. Credentials, runtime files and process logs remain in the ignored `.a20-fixture` directory. No customer data, production traffic, provider operations, deployment or shared-roadmap changes are authorized by this package.

The owner deferred the A22 dependency during this session. This evidence therefore applies to the current-main-based candidate. Integration must rerun acceptance on the actual merged build; these measurements do not establish that a later A22 build passes. The inherited A20 fixture currently limits provisioning to reviewed migrations through 038, which must be reviewed before testing a changed migration set.

## Measurement contract

Each measured wave launches one read per authenticated session concurrently. Authentication occurs before timing the read workload. Timings include response headers and the complete body, excluding browser asset fetching, hydration and rendering. The first wave is reported separately from subsequent warm waves; it is a first-touch application baseline, not a fresh process or database cache for every request. Local loopback transport excludes deployment/network latency and does not establish field Core Web Vitals.

The report records the tested Git commit/tree, production build ID/hash, fixture counts, route samples, latency summaries, failures and outbound audit. A percentile pass does not require every request to finish within three seconds; slow-tail requests are reported separately and unexpected errors/timeouts always fail.

## Reproduction and evidence

Acceptance passed on October 13, 2026, at approximately 04:17 Madrid time, against code commit `1865b5f532d8649be46ed89e6189ac8a81b114e7` (tree `11f1354bb69de417029d4545d286c367834580fb`). The following documentation/evidence commit changes no executable source. The production build ID was `1thTw_RLX9x06Ko30SCOV`; its SHA-256 inventory hash is in the [sanitized receipt](./evidence/A23_READ_LOAD_2026-10-13.json), together with all 400 measurements and source/build identities before and after the run.

Environment: Windows 11 Pro 10.0.26200, AMD Ryzen 9 6900HX (16 logical processors), approximately 32 GiB RAM; Node 24.11.1, Next.js 16.3.8 with Webpack, PostgreSQL 17.9. Client, production server and database ran on this machine over loopback. The A20 bridge translates Neon requests to local PostgreSQL; this does not benchmark remote Neon or Vercel. Google fonts use the inherited local build mocks. This is a single controlled run, not sustained-load capacity or a deployment SLO guarantee.

Preparation added 120,000 reviews and 120,000 visits: 96,000 of each in the measured owner's business and 24,000 of each in an unrelated tenant. The inherited A20 fixture also has one base owner review. Ten separate Auth.js JWT sessions authenticate as the same business owner, verified through the session endpoint and distinct session-token values. Each route has four synchronized waves of ten reads: ten first-wave samples and thirty warm samples. This measures ten sessions contending for one populated business, rather than ten separate user accounts or an open-loop arrival-rate test. Settings HTML is the initial server-rendered loading state; its data is exercised separately through the authenticated settings API.

| Route | All-sample p95 (ms) | Warm p95 (ms) |
| --- | ---: | ---: |
| `/dashboard` | 2182.03 | 2130.79 |
| `/dashboard/agents/review-booster` | 2177.94 | 2237.82 |
| `/dashboard/agents/review-booster/settings` | 903.92 | 893.09 |
| `/dashboard/agents/review-replies/reviews` | 941.69 | 942.66 |
| `/api/dashboard/summary` | 637.17 | 597.09 |
| `/api/review-booster/settings` | 1142.06 | 1167.07 |
| `/api/review-booster/visits` | 612.41 | 662.96 |
| `/api/settings/reply` | 1053.74 | 601.75 |
| `/api/google/connection` | 719.96 | 743.83 |
| `/api/reviews` | 736.87 | 740.69 |

All 400 reads passed status/content/scope checks. Aggregate median was 748.02 ms, p95 2067.49 ms and maximum 2432.45 ms. Warm aggregate p95 was 2067.49 ms; first-wave aggregate p95 was 2042.03 ms. There were zero requests over three seconds, unexpected errors, redirects, timeouts or blocked outbound attempts. Synthetic full-row count/hash snapshots and the inherited A20 business/settings snapshot were unchanged. Both paginated APIs returned twenty populated owner-scoped items.

Verification: seven A23 tests, eleven focused A20 fixture/bridge tests, targeted ESLint, production Webpack build with generated static CSP hashes, and `npm run test:build` all passed. The smoke test checks CSP hash parity, nonce hydration/rotation, the protected dashboard, Open Graph and anonymous auth/Google/billing boundaries. Independent Luna code review found no remaining blocking issue. Runtime verification corrected the harness's localhost callback normalization and initial settings HTML assertion before the accepted run.

Reproduce from a clean committed source in a separate worktree without `.env` files, with PostgreSQL 17 installed (`A20_PG_BIN` can select its bin directory):

```powershell
npm ci --no-audit --no-fund
node scripts/a20-app-fixture.mjs setup
node scripts/a23-performance.mjs prepare
node scripts/a20-app-fixture.mjs start
npm run test:performance
node scripts/a20-app-fixture.mjs assert
npm run test:build
node scripts/a20-app-fixture.mjs cleanup
```

The prepare command intentionally refuses a second preparation marker; clean up and provision a fresh fixture to change the workload. A failed report exits nonzero. Retain only the sanitized report; credentials, fixture markers, cookies and server logs are private. The task fixture was stopped and removed after retaining evidence.

## Integration handoff

No application schema or runtime configuration changes are intended. The performance fixture is disposable; rollback removes the task harness and package command. Stop and clean up its task-owned processes using the A20 fixture commands after retaining sanitized evidence. Never commit private fixture credentials or runtime logs.
