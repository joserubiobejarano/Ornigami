# Builder runtime and emphasis integration review — 20 November 2026

## Decision

Accept both bounded implementation slices and their combined local source. No new actionable blocking defect was found. The prior F1 clipping and F2 unreadable-emphasis findings are closed. The separate builder runtime closes the previously identified legacy runtime coupling for its current, closed route surface.

This is local source acceptance. Customer access, generation budgets, hosting, Linux qualification, current dependency-advisory acceptance and public release are not accepted.

## Exact source

- Finishing fixes: `b56268d14131a3cf2c1800a80261ddf23d96f428`, implementation `b7cd44f8dd054ff3f2d8186cc510e74768d78e35`.
- Runtime isolation: `dcc3e075651a94547d24740a5f5de24f2f779e1d`, implementation `5a5a3b9c992daa7630c505f02434f2fc7fa481d8`.
- Independently merged and tested implementation: **`51291908ed1652414fa95c8e26657eb06c0fbc72`**.
- Integration branch: `codex/ornigami-builder-integration-review-20261120`.
- Worktree: `C:/Users/joser/.local/ornigami-builder-integration-review-20261120`.

The merge was automatic, without conflicts. No implementation repair was needed. The subsequent documentation checkpoint changes planning/review text only. Original worktrees/branches and the dirty main checkout were preserved. Main still contains the legacy application; serving it does not serve the isolated builder application.

## Reviewed behavior

### F1 — wrapping: closed

The base emphasis now flows inline and wraps. The correction also covers long unbroken offer text and the closing offer/action layout. Source inspection confirms this is shared presentation behavior rather than a Product-focus-only override.

The original reproduction was rerun on the combined source through the ordinary Sparse offer editor, default composition, static output, 375×812:

- Exact offer/emphasis: `Save 20% on the travel bottle from 27–30 November 2026`.
- Article client/scroll width: **300/300 px**, previously 300/685 px.
- Offer client/scroll width: **257/257 px**.
- All four emphasis fragments remain inside the offer; computed white-space is `normal`.
- A fresh local approval/export succeeds; full revision `1ad9aec33904f906`.

The finishing branch's retained 20-case/80-viewport matrix reports 569 successful checks and 160 captures across Clear/Editorial, default/Product focus, long/pale/unbroken/omitted inputs and 320/375/768/1440 widths. That matrix is retained evidence, not represented as a fresh independent rerun of all 569 checks. The independent browser reruns specifically cover the original failures and the integrated approval/export path.

### F2 — contrast: closed

The final theme derives the effective emphasis foreground without altering the reviewed accent. Source inspection covers final palette resolution, renderer CSS variable, identity participation, export appearance and HTML/receipt agreement. Imported-palette validation stays enforced.

The original pale-accent reproduction was rerun on the combined source:

- Offer `Black Friday offer: $9`, exact emphasis `$9`, accent `#f4eee4`.
- Accent stays `#f4eee4`; effective text ink becomes **`#232420`**, rather than the matching pale background.
- Actual browser text color: `rgb(35, 36, 32)`; offer background `color(srgb 0.956863 0.933333 0.894118)`.
- Editing invalidates approval and disables export. Regeneration and fresh approval/export succeed; full revision `6abe33382841cb2f` differs from the prior approved long-offer revision.
- A separate synthetic combined builder-handler check accepts Clear + Product focus + white accent + `$9`, resolves readable ink, uses the disabled-provider fallback and preserves identity 7. Invalid substring returns 422 with an `offerPrice` issue; omission remains compatible at 200. This uses test dependency injection and does not open the real access gate.

Template remains 1.0.1, Product focus 1.1.0, direction 1.0.0 and receipt schema 1. Rendered identity is 7; historical identity-6 receipts remain readable without claiming historical pixel reproduction.

### Builder runtime containment: locally accepted, access still closed

`builder-runtime/` owns its application route graph, root layout, metadata, proxy, instrumentation, configuration and public assets. The built route inventory contains only its root, builder page/API and internal error/not-found surfaces. Representative actual legacy page/API/cron/webhook/auth requests return builder-CSP 404 responses without cookies.

An independent combined build and smoke used the builder-only qualification scripts with legacy credentials absent. Rotating nonces, nonce-bound scripts, matching SRI, local CSS/fonts/icons, no-store/noindex responses, default-closed routes and invalid configuration startup were checked by the executed smoke.

Egress logs contain initialized guards and **zero denied egress attempts** for builder build (20 initialization records), smoke (4) and the synthetic handler diagnostic (1). These are bounded trusted-Node checks, not a native process sandbox or proof of every future configuration.

The separate legacy application still builds and passes its original production smoke. Its legacy offline build recorded **three blocked Sentry HTTPS attempts** in this run. That historical/shared application is not network-quiet; it is not the builder delivery entry point.

## Independent verification

Commands ran in the integration worktree on Windows, reusing installed dependencies through a local node_modules junction:

| Check | Result |
| --- | --- |
| Explicit campaign base + campaign `.mts`/`.mjs`, campaign-eval, builder, restricted-proxy and security test pattern | **416 passed, 0 failed** |
| Whole-project `tsc --noEmit` | Pass |
| ESLint on changed source, runtime, scripts and tests | Pass |
| `node scripts/builder-runtime-qualify.mjs build` | Pass, zero denied egress |
| `node scripts/builder-runtime-qualify.mjs smoke` | Pass, zero denied egress |
| `node scripts/offline-qualify.mjs build` | Pass, legacy SRI/CSP finalization; three blocked Sentry attempts |
| `node scripts/production-smoke.mjs` | Pass; legacy auth/security and development lab gates retained |
| Combined synthetic builder-handler optional-emphasis checks | 200 / 422 / 200 as expected; provider `none`, identity 7 |
| Three retained ZIPs plus two newly exported combined-source ZIPs | CRC, inventory, path/duplicate checks, every declared length/hash, packshot hash, exact metadata, approval/render identity and effective ink pass |

The full test pattern explicitly includes `tests/campaign-lab.test.mts`, omitted by a `campaign-lab-*` glob. The finishing handoff's 357 count is a narrower selection, not the full combined acceptance total. The executed 416 result includes that base file; this is a scope/count clarification, not a newly failing test.

Private evidence in `.local/review/`: `all-tests.log`, `typecheck.log`, `lint.log`, `builder-build.log`, `builder-smoke.log`, `legacy-build.log`, `legacy-smoke.log`, `combined-api.mts`, `combined-api-results.json`, `audit-zips.py`, `zip-audit-results.json`, fresh ZIPs and corrected screenshots. Guard logs remain in `.local/builder-runtime/` and `.local/offline/`. The branch's full original visual matrix remains in `C:/Users/joser/.local/ornigami-offer-finishing-review-fixes-20261120/.local/emphasis-fixes/`.

Temporary browser state and viewport were cleaned up before the local development server was stopped. No model request, external account change, deployment, DNS change, production migration, customer message or publication was performed.

## Next implementation slice

Implement builder-only invite identity, atomic single-use redemption, expiry/revocation, sessions and subject-scoped export-only recovery. Use local synthetic invitations and an isolated durable identity store; no email delivery or external account setup is implied. Keep generation provider disabled and default access closed. Add an actual prepared-brief download/import journey, packshot reselection and fresh local approval, with logout/account-switch cleanup and stale-response protection.

Implement authorization only in the separate builder runtime. Its legacy foundation `/builder` and API must not become authorized through a shared helper or environment flag. The shared generation handler's default remains closed; authenticated builder use must be an explicit runtime adapter.

Do this slice serially. The following budget ledger must consume its actual stable subject/store contract. Do not split access and quotas across incompatible stores or assign another visual/runtime-isolation session. After access/recovery acceptance, implement per-subject/global rate, concurrency and spend reservations, failure/unknown-outcome accounting and cancellation with stubbed providers; a real provider canary still needs fresh authority.

Remaining release gates include actual Linux/host install/build/start/filesystem/rollback, current dependency/security audit, custom-framework maintenance ownership/rebase, privacy/support/operations and independent target-user acceptance. No fresh install or broad browser/device qualification was executed here. These limits do not block the authorized local access/recovery implementation, and do not authorize hosting or new paid calls.
