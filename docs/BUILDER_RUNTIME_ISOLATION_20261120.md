# Builder runtime isolation — 20 November 2026

Status: implemented locally, **builder closed by default**. This record covers
application/runtime containment only. It does not add invites, customer access,
durable projects, generation budgets, publishing, billing or deployment.

Source: branch `codex/ornigami-builder-runtime-isolation-20261120`,
implementation `5a5a3b9c992daa7630c505f02434f2fc7fa481d8`, from exact
foundation tip `224238782a259afb65b8217284ed6b10ebc6cbf3`.

## Decision

Use a **separate Next.js application entry point** at `builder-runtime/`, built
and started with the existing repository-root dependencies and custom Next.js
artifact:

```text
next build builder-runtime --webpack
next start builder-runtime
```

This was chosen over a cohosted mode because the evidence showed a real
application-boundary problem, not only a proxy condition:

- the legacy root layout mounted the reputation Auth.js provider and marketing
  chrome for every route, including `/builder`;
- the single proxy statically imported Auth.js and reputation database/private
  preview policy;
- root route modules, `/api/auth/providers`, legacy pages and build-time
  configuration remained part of the same application;
- the build required Google/Auth placeholders and the Sentry wrapper could
  attempt egress.

A separate app gives the builder its own route inventory, root layout, proxy,
instrumentation, error/not-found surfaces and build configuration. It reuses the
qualified offer components and engine through the repository source alias. The
legacy application remains unchanged and continues to use its existing auth,
provider, billing, database, mail, cron and security behavior. Its foundation
`/builder` routes remain closed as before, but they are not the delivered
builder runtime; the builder beta must be built and served from
`builder-runtime/`.

## Builder route boundary

The builder build contains only:

| Route | Behavior |
| --- | --- |
| `/` | Builder-owned home; static output disabled by a dynamic layout, closed notice, `no-store`, builder metadata |
| `/builder` | Builder access gate; currently `404` using the builder not-found surface |
| `POST /api/builder/generate` | Builder gate before body read; currently no-store `404` JSON |
| `/_not-found`, `/_global-error` | Builder-owned error surfaces |

There are no legacy marketing, account, auth, billing, provider, webhook, cron,
dashboard, Campaign Lab or customer route files in this application. Requests
for representative legacy paths return builder-CSP `404` responses and create
no cookies.

## Separation points

- `builder-runtime/app/layout.tsx` owns `<html>/<body>`, metadata, local CSS and
  the builder shell. It has no Auth.js, marketing frame, toast, theme or Sentry
  provider.
- `builder-runtime/proxy.ts` imports only the builder CSP/security helpers. It
  has no Auth.js, database, private-preview or legacy proxy import.
- `builder-runtime/instrumentation.ts` only validates the existing builder
  startup configuration. It has no Sentry, Auth.js, database, billing, mail or
  job import.
- `builder-runtime/next.config.ts` has no Sentry wrapper, no legacy environment
  validation and no upgrade-advisory registry fetch. The upstream
  `experimental.agentUpgrade` default is explicitly disabled for this build.
- `scripts/builder-runtime-public.mjs` generates a bounded `public/` copy from
  the admitted root fonts and builder metadata icons. The generated directory is
  ignored by Git.
- The shared offer renderer, offer components, commercial/asset contracts,
  prepared-brief controls, Campaign Lab guards and legacy source are unchanged.

## Builder-only environment contract

The builder build/start does not require reputation credentials or placeholders.

| Variable | Requirement |
| --- | --- |
| `NODE_ENV=production` | Production start |
| `PORT`, `HOSTNAME` | Ordinary Next.js listener configuration |
| `NEXT_PUBLIC_APP_URL` | Optional metadata base; invalid values fall back safely |
| `NEXT_TELEMETRY_DISABLED` | Recommended `1`; qualification sets it |
| `BUILDER_BETA_ACCESS_MODE` | Optional; only `closed` is accepted |
| `BUILDER_GENERATION_PROVIDER` | Optional; only `disabled` is accepted |

The existing startup validation rejects opening, publishing, billing, durable
project, URL-import, custom-domain, advertorial, motion, legacy-reuse and
unsupported provider switches. No Google, Auth.js, Stripe, Neon, Resend, legacy
cron, OpenAI or Sentry variable is needed or read by this runtime.

## Commands

Normal builder entry points:

```powershell
npm run builder:build
npm run builder:start
```

Offline-qualified builder entry points, with the repository's Node egress guard
and builder-only environment:

```powershell
node scripts/builder-runtime-qualify.mjs build
node scripts/builder-runtime-qualify.mjs smoke
```

`builder:qualify:build` and `builder:qualify:smoke` are the package-script
equivalents. The build copies the bounded local assets, runs the Webpack build,
finalizes SRI and generates static CSP hash files for `builder-runtime/.next`.
The smoke starts the built app with no legacy credentials and checks actual HTTP
responses, headers, assets, nonces, SRI, route inventory and fail-closed startup.

## Verification boundary

Recorded local checks on Windows x64 with Node `v24.11.1`:

- builder build: zero denied egress attempts under the offline guard;
- builder smoke: zero denied egress attempts, all route/header/asset/startup
  checks passed;
- focused Campaign Lab/builder/security suites: **385 passed, 0 failed**;
- whole-project TypeScript and focused ESLint: passed;
- legacy offline build and existing production smoke: passed, preserving the
  existing legacy auth/security behavior.

No Linux/host runtime, dependency-advisory acceptance, hosted access, customer
use, deployment or publication is qualified by these checks.

## Custom framework artifact

This slice retains `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz` and
the existing SRI/CSP behavior. The artifact still needs a named maintenance
owner and a rebase procedure for each upstream security release, or an approved
replacement plan. It is not an upstream release. The builder runtime adds no new
dependency or framework rewrite.

## Remaining release gates

- Builder-specific invites, ownership, revocation, session cleanup and
  cross-account denial.
- Builder generation budgets, provider configuration, concurrency, spend caps
  and a separately authorized provider canary.
- Linux/target-host install/build/start, proxy, SRI/CSP, filesystem and rollback
  qualification at the exact SHA.
- Current dependency/security advisory acceptance and custom-framework
  maintenance/adoption.
- Privacy/terms, retention, support, monitoring and incident procedure for
  builder data.
- Target-user acceptance, hosted publication/recovery, custom domains and
  billing, none of which are included here.
