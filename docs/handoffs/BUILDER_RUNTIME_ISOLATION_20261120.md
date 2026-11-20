# Builder runtime isolation handoff — 20 November 2026

## Source

- Branch: `codex/ornigami-builder-runtime-isolation-20261120`
- Base: exact foundation tip `224238782a259afb65b8217284ed6b10ebc6cbf3`
- Implementation commit: `5a5a3b9c992daa7630c505f02434f2fc7fa481d8`
- Worktree: `C:/Users/joser/.local/ornigami-builder-runtime-isolation-20261120`
- Decision record: [BUILDER_RUNTIME_ISOLATION_20261120.md](../BUILDER_RUNTIME_ISOLATION_20261120.md)

## What landed

The builder is now a separate Next.js application at `builder-runtime/`, built
and started from the repository root:

```powershell
npm run builder:build
npm run builder:start
```

The app owns its root layout, metadata, not-found/error surfaces, proxy,
instrumentation, API route and configuration. It reuses the qualified offer
engine/components through the repository `@/` source alias. The legacy
application is not moved, rewritten or disabled.

Builder build output contains only:

```text
/                         builder-owned dynamic home
/builder                  closed builder gate (404)
/api/builder/generate     closed builder API (404 JSON)
/_not-found, /_global-error
```

There are no legacy marketing, account, auth, billing, provider, webhook, cron,
dashboard or Campaign Lab route files in this app. The builder proxy has no
Auth.js import, the builder instrumentation has no Sentry/database/job import,
and the builder Next config has no Sentry wrapper or legacy environment
validation. The upstream advisory nudge registry fetch is explicitly disabled.

## Builder-only environment

Required: `NODE_ENV=production` for start, plus ordinary `PORT`/`HOSTNAME`.

Optional: `NEXT_PUBLIC_APP_URL` (metadata base only), `NEXT_TELEMETRY_DISABLED=1`,
`BUILDER_BETA_ACCESS_MODE=closed` and `BUILDER_GENERATION_PROVIDER=disabled`.
No Google, Auth.js, Stripe, Neon, Resend, legacy cron, OpenAI or Sentry value is
needed. Unsupported opening/provider/reuse settings still stop startup.

## Verification

Run exactly:

```powershell
node scripts/builder-runtime-qualify.mjs build
node scripts/builder-runtime-qualify.mjs smoke
node --experimental-strip-types --test tests/builder-production-boundary.test.mts tests/builder-runtime-isolation.test.mts tests/a11-restricted-proxy-contract.test.mts tests/security-hardening.test.mts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed source/tests>
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
```

Recorded local results on Windows x64, Node `v24.11.1`:

- Builder build: passed, **zero denied egress attempts** under the offline guard.
- Builder smoke: passed, **zero denied egress attempts**.
- Focused Campaign Lab + builder + security suites: **385 passed, 0 failed**.
- Whole-project TypeScript: passed.
- Focused ESLint on changed files: passed.
- Builder smoke verified:
  - actual HTTP `404` for `/builder`, `/api/builder/generate`, `/login`,
    `/signup`, `/pricing`, `/dashboard`, `/campaign-lab`, `/api/auth/providers`,
    `/api/auth/session`, `/api/stripe/checkout`, `/api/cron/*`,
    `/api/webhooks/*`, `/api/google/connection`, `/api/openai/review-reply`,
    `/api/projects`, `/opengraph-image` and `/robots.txt`;
  - builder-only CSP, same-origin `connect-src`, no legacy provider origins;
  - `no-store`/no-cookie responses and `noindex` builder surfaces;
  - rotating nonces, nonce-bound inline scripts and matching SRI hashes;
  - local CSS, fonts, favicon and static JS loading;
  - invalid invite/provider startup exits `1` before serving.
- Legacy offline build and existing production smoke: passed, including legacy
  auth/Google/billing boundaries, Campaign Lab development gates and the
  existing closed builder routes.

Evidence logs and generated files are under ignored `.local/builder-runtime/`:
`final-build.log`, `final-smoke.log`, `final-tests.log`, `final-typescript.log`,
`final-lint.log`, `final-legacy-production-smoke.log`.

## Rollback

Revert the implementation commit or decline to merge/deploy it. The legacy app
and its source are unchanged. The new runtime has no migrations, provider
configuration, customer data or deployment changes. If a builder runtime is
served accidentally, it is closed by default and exposes no legacy routes.

## Remaining release gates

- Builder invites, ownership, revocation, logout/session cleanup and
  cross-account denial.
- Builder budgets, provider configuration, concurrency/spend limits and a fresh
  authorized provider canary.
- Linux/target-host install, build, start, proxy, SRI/CSP, filesystem and
  rollback qualification at this exact SHA.
- Current dependency/security advisory acceptance and a named owner/rebase
  process for the custom Next.js SRI artifact.
- Privacy/terms, retention, support, monitoring and incident procedure for
  builder data.
- Real customer usability, hosted publication/recovery, custom domains and
  billing remain outside this slice.

Windows checks do not establish Linux, hosting, dependency-advisory or
cross-engine acceptance. No paid calls, external accounts, deployment, DNS
changes, migrations or customer messages were performed.
