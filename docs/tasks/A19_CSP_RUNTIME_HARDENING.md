# A19 — CSP and runtime security handoff

**Branch:** `fix/csp-runtime-hardening` | **Isolated worktree:** `Ornigami-A19-csp-runtime-hardening` | **Baseline:** `7801a43` | **Assessment date:** 2026-10-03

**Implementation status:** Scoped work is complete and committed on the A19 task branch. Review and integration acceptance remain with the integration session.

A19 hardens CSP form submission boundaries, assesses Trusted Types and nonce behavior, bounds and privacy-normalizes CSP reports, and records the current Auth.js upgrade position. Three Luna agents contributed scoped implementation/review work, with orchestration and review by the root agent. This handoff summarizes the task-owned work and integration needs; the detailed findings and evidence are in [runtime assessment](./A19_CSP_RUNTIME_ASSESSMENT.md), [reporting assessment](./A19_CSP_REPORTING.md), and [Auth.js assessment](./A19_AUTH_UPGRADE_ASSESSMENT.md).

## Changes and scope

- The runtime policy keeps nonce-bound scripts, denies objects, restricts base URLs and frame ancestors, and adds `form-action 'self'` plus the observed Stripe Checkout/Billing redirect origins. Google sign-in uses the Auth.js client fetch followed by `window.location`, and the custom login page does not expose the built-in fallback form, so Google is not allowed as a native form destination. Verify any future native OAuth form or provider redirect before widening this directive. The local Chromium two-origin probe confirmed that a same-origin form POST followed by a cross-origin 303 is blocked with `'self'` alone and allowed when the destination origin is explicitly listed. This fixture sent no data outside localhost; actual Stripe provider redirects remain unverified.
- Trusted Types remains report-only. The policy declares the CSP Reporting API endpoint. Review found one direct HTML sink in JSON-LD serialization, with `<` escaped; no other direct DOM HTML/script execution sinks were found in the source scan recorded in the runtime assessment. Framework/browser reports still need review before any enforcement decision.
- The public CSP report handler supports legacy and Reporting API payloads, caps bodies at 16 KiB, report batches at five, stream chunks at 64, and body-read time at five seconds. It validates media types and payload shape, keeps safe diagnostic categories (document/blocked/source schemes and known directive names), bounds numbers, normalizes disposition, and returns a static 503 if the shared rate limiter is unavailable. It adds no report table or third-party dependency.
- Auth.js remains pinned to `5.0.0-beta.32`. On 2026-10-03, `https://registry.npmjs.org/next-auth` returned `latest: 4.24.15` and `beta: 5.0.0-beta.32`; this is a point-in-time tag check, not a claim about every possible published tag. The current JWT `authVersion`, live-row validation, Google verified-email requirement, restricted deletion session, and A04 behavior were assessed and left unchanged.

No shared deployment configuration, model/schema, auth implementation, auth route, app setting, dependency manifest/lockfile, or roadmap file was changed. The task introduces no dependency, migration, or new application setting. Shared proxy implementation remains unchanged; only its existing CSP policy builder is used by this task.

## Integration handoff

| Owner | Integration action |
| --- | --- |
| **A01** | The earlier advisory exception follow-up is superseded by current integration: A01 removed the exception and remediated the development dependency path. Keep the zero-finding audit policy and include A19 CSP/auth regressions in the dependency/build release check. |
| **A02** | Confirm supported ingress overwrites client-provided forwarding headers before `getTrustedRequestIp` consumes them. Keep the canonical app origin and `trustHost: true` assumptions aligned with the actual trusted proxy chain. |
| **A04** | Own any future Auth.js stable/major migration after checking the then-current registry and release-specific guide. Preserve the current A04/A11 JWT revocation, restricted deletion, Google sign-in, credentials, cookie clearing, and safe callback contracts. |
| **A12** | Current integration includes A12's sanitized error-boundary capture. A19's fixed `csp.report.*` events remain normalized safe-logger diagnostics; preserve scheme-only privacy normalization and avoid forwarding raw reports or exception details. Confirm target-runtime log visibility during release acceptance. |
| **A17** | On the exact integration candidate, run the built local runtime smoke and controlled authenticated/provider browser acceptance. Check login/signup Google initiation, billing forms/redirects, owner/member navigation, enforced CSP console errors, Trusted Types report collection, and endpoint behavior with the configured limiter. Provider and real report collection acceptance has not run in this task. |

The exact Stripe redirect host behavior must be confirmed in controlled provider acceptance before release. If a future Google flow submits a native form or relies on a provider redirect governed by `form-action`, verify that path before adding an origin. Keep Trusted Types report-only until observed reports and framework sinks have been reviewed. Keep inline style allowances until measured browser evidence supports a safe replacement.

## Verification and limits

- Final A19 scoped regression command: `node --experimental-strip-types --test tests/csp-report.test.mts tests/a19-csp-runtime.test.mts tests/security-hardening.test.mts` — **17 passed, 0 failed, 0 skipped**, including the added 429 rate-limit, streamed oversized-route 413, and malformed-body 400 cases. This is the final focused count; no claim is made that these later cases were part of the 408 full-suite run.
- Final full suite: `npm test` — **408 passed, 0 failed, 0 skipped**, completed in 146.871 seconds. This full-suite run preceded the reporter-only boundary-case additions; no claim is made that those later tests were included in the 408.
- `node --experimental-strip-types --test tests/auth-core-session.test.mts tests/auth-session-callbacks.test.mts tests/auth-return-path.test.mts tests/a11-auth-restricted-session-contract.test.mts` — **9 passed, 0 failed, 0 skipped**. No live database or provider was contacted.
- `npm ci --ignore-scripts` installed 675 packages. `npx tsc --noEmit --pretty false` passed again after the reporter test additions. The lifecycle-disabled clean install used Node 24.11.1 on Windows.
- `npm run lint` completed with zero errors and four unchanged baseline warnings.
- `npm run build` passed on Node 24.11.1 Windows using CI fixture environment values and no dotenv files. The final build's source-map entries for the CSP reporting route and policy were checked against the source. No real provider credentials were used.
- `npm run test:build` passed static CSP hash parity, nonce-bound hydration and nonce rotation, anonymous auth/Google/billing boundaries, and the Open Graph PNG response.
- `node scripts/a19-csp-runtime-smoke.mjs` passed the local built-app checks across eight routes plus the 404 boundary and nonce behavior. Local browser checks found no console errors on login or harmless login-to-forgot-password navigation. `node scripts/a19-form-action-redirect-probe.mjs` was reviewed in Chromium: the cross-origin redirect was blocked by `'self'` alone and allowed with the explicit destination origin. Both fixtures used loopback only.
- At the A19 baseline, `npm run security:audit` passed with 11 high development-only records from the narrowly allowed braces ancestry advisory `GHSA-vfj7-8cjw-p6xm`; production audit had zero findings. This status is superseded by current integration: A01 removed the exception and remediated the affected development dependency path. There is no active waiver or pending expiry promise; retain the zero-finding audit policy.
- A17 acceptance labels: **isolated tests — passed** (evidence above); **authenticated browser — not run**; **provider test mode — not run**; **production smoke — not run**; **external approval — not run**. The passing `npm run test:build` and A19 local browser checks are local unauthenticated smoke evidence, not production smoke or authenticated acceptance.
- Node 22/Linux CI, authenticated owner/member acceptance, live Google/Stripe acceptance, actual browser-delivered Trusted Types reports, production report volume, and target ingress-header behavior remain unverified. Unit route tests mock the shared database limiter.
- No staging or production deployment, merge, or external provider acceptance was performed. The root owner will commit this result on the A19 task branch; the integration session handles merge and deployment.

Reproduction commands from a clean checkout, with no `.env`, `.env.local`, `.env.production`, or `.env.production.local` files:

```sh
npm ci --ignore-scripts
npx tsc --noEmit --pretty false
npm run build
node --experimental-strip-types --test tests/csp-report.test.mts tests/a19-csp-runtime.test.mts tests/security-hardening.test.mts
node --experimental-strip-types --test tests/auth-core-session.test.mts tests/auth-session-callbacks.test.mts tests/auth-return-path.test.mts tests/a11-auth-restricted-session-contract.test.mts
npm test
npm run test:build
node scripts/a19-csp-runtime-smoke.mjs
npm run security:audit
```

Build and local server commands require the CI fixture environment values used by A01's quality workflow; use dummy local values only. `npm run test:build` refuses dotenv files. The form-action redirect probe is a manual Chromium check using `node scripts/a19-form-action-redirect-probe.mjs`; it opens two loopback origins and sends no external request.
