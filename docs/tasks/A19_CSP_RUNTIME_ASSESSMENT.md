# A19 — CSP and runtime security assessment

**Status:** Scoped implementation and local validation complete; external provider and production report evidence remain release acceptance work.
**Scope:** `src/lib/security-headers.ts`, A19 test/smoke artifacts, and this handoff. No shared deployment settings, routes, models, dependencies, auth implementation, Sentry configuration, or roadmap changes.

## Findings and changes

- Added a narrow `form-action` allowlist for same-origin forms and the observed Stripe Checkout and Stripe Billing redirect origins. The custom Google sign-in control calls the Auth.js client, which uses a same-origin fetch and then `window.location`; it does not submit a native form to Google. The configured custom login page also means the built-in Auth.js fallback form is not exposed. Google therefore needs no `form-action` exception. A future native OAuth form or other provider redirect must be observed and verified before widening the directive.
- A local Chromium fixture confirmed that a same-origin POST followed by a 303 redirect to a second origin is blocked by `form-action 'self'`; explicitly adding the destination origin allowed the same redirect. This was a local-only two-port fixture, not a call to Google or Stripe. The exact external provider redirect remains unverified and should be checked during A17 provider acceptance.
- The enforced script policy is nonce based. `src/proxy.ts` creates a fresh 16-byte random nonce for each request, sends the matching CSP on the forwarded request so Next can nonce rendered scripts, and adds the same CSP to the response. Production smoke already verifies request rotation and nonce attributes on root/login inline hydration scripts. The root layout is explicitly `force-dynamic`, so these pages can receive per-request nonces.
- `experimental.sri` is enabled. `scripts/generate-static-csp-hashes.mjs` collects inline script hashes from generated HTML into `.next/static-csp-hashes.json`; the manifest is build output only and `src/lib/security-headers.ts` does not read it. Existing `scripts/production-smoke.mjs` verifies hash parity, but those hashes do not authorize runtime scripts. Do not describe the current runtime as a nonce/hash hybrid.
- `style-src` retains `'unsafe-inline'`. The app has framework-generated and React style attributes, including theme/layout styling; the generated email HTML also uses inline styles but is sent outside browser CSP. A strict style policy requires a measured framework/browser run and likely style nonce propagation or class-based replacements. A strict change is not included.
- The policy denies objects, limits base URLs and frame ancestors, and restricts frame sources. Script hosts remain Stripe and Google domains. No speculative `'strict-dynamic'` change was made because third-party loader behavior needs browser evidence.
- Trusted Types remains in a `Content-Security-Policy-Report-Only` header from `next.config.ts`, with `require-trusted-types-for 'script'`, the `default` policy name, and a Reporting API endpoint. There is one source-level direct HTML sink: `src/components/seo/json-ld.tsx` serializes JSON-LD and escapes `<` before using `dangerouslySetInnerHTML`. No direct `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, DOMParser, or explicit Trusted Types policy creation was found under `src`. Framework/browser sinks still require actual report review.
- Auth.js is pinned at `5.0.0-beta.32`. Registry tags checked for this assessment returned `next-auth@latest` = `4.24.15` and `next-auth@beta` = `5.0.0-beta.32`; there is no published v5 stable migration target in those tags. No auth changes or dependency changes are proposed.

## Validation artifacts

- `tests/a19-csp-runtime.test.mts` checks the enforced directive invariants and ensures Trusted Types remains report-only.
- `scripts/a19-csp-runtime-smoke.mjs` starts the already-built app with CI-only dummy settings, checks local `/`, `/login`, and anonymous `/dashboard` CSP headers, inline script nonce matching/rotation, and report-only Trusted Types headers. `--serve` keeps the local fixture alive for browser inspection; `A19_SMOKE_PORT` can select a port. It does not load a real user session or call external providers.
- `scripts/a19-form-action-redirect-probe.mjs` serves two localhost origins to verify browser handling of allowed and blocked form redirects. It sends no data off-device.
- Existing `scripts/production-smoke.mjs` remains unchanged and continues to cover generated-hash parity plus anonymous route boundaries.

Local evidence on 2026-10-03:

- `node --experimental-strip-types --test tests/a19-csp-runtime.test.mts` — 2 passed, 0 failed. Node emitted its existing `MODULE_TYPELESS_PACKAGE_JSON` performance warning while loading the TypeScript helper.
- `node --check scripts/a19-csp-runtime-smoke.mjs` and `node --check scripts/a19-form-action-redirect-probe.mjs` — passed.
- In PowerShell, `$env:A19_SMOKE_PORT='31919'` followed by `node scripts/a19-csp-runtime-smoke.mjs --serve` against the fixture production build — passed home, login, signup, forgot/reset password, demo, demo Booster, demo Replies, and 404 response checks; inline hydration nonces matched each response, nonces rotated on every rendered request, report-only Trusted Types headers were present, and anonymous dashboard redirected to login with security headers.
- In the local in-app Chromium browser, `/login` rendered and its Forgot password link navigated to `/forgot-password?callbackUrl=%2Fdashboard`; neither page recorded console errors/warnings. The Google control is a button, not a native form. Direct `GET /api/auth/signin` redirected to the configured custom `/login` page, so the built-in Auth.js fallback form is intentionally not exposed. No sign-in button was activated and no Google/provider request was made.
- The two-origin local browser probe blocked an unlisted cross-origin form redirect and allowed it after the target origin was explicitly listed. Both requests stayed on localhost; no external provider was contacted.

## Integration needs and unresolved decisions

- No shared model, route, setting, dependency, or environment change is required for the scoped CSP improvement.
- Keep Trusted Types report-only until production reports are reviewed and sinks are fixed. The current endpoint uses Reporting API (`Reporting-Endpoints` plus `report-to`); whether to add a legacy `report-uri` fallback should be decided after browser compatibility/report-delivery evidence.
- A17 should capture actual enforced and report-only headers, console violations, style behavior, Trusted Types reports, login/signup Google initiation, billing forms, and authenticated owner/member navigation in a controlled browser. This local smoke cannot establish production report volume or provider acceptance.
- Before enforcing a strict `style-src`, decide whether the app will adopt nonce-aware styling or remove inline style usage after measuring real violations.
- Reconfirm actual Stripe portal/checkout and Google callback redirect hosts in controlled provider acceptance; add any verified redirect origin narrowly before release if the configured provider uses a different host.
- Reassess Auth.js migration only after a v5 stable release is published, then repeat credentials, Google, callback, and account recovery acceptance.

## Evidence limits

No staging/production request, external provider call, customer message, or deployment was made. Report ingestion requires the app’s configured database-backed public-write limiter and is therefore not exercised by the dummy-database smoke. Browser observations cover this local fixture build and one unauthenticated login route; they do not establish signed-in owner/member journeys, real provider redirect hosts, production Trusted Types report volume, or target-browser compatibility.
