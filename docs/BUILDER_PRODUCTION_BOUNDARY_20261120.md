# Builder production boundary and reuse decision — 20 November 2026

Status: implemented foundation, **closed by default**. This record covers the
production application boundary for an invite-only creation/export beta. It does
not open customer access, publish pages, add billing, migrate data or authorize a
deployment.

Source: branch `codex/ornigami-production-foundation-20261120`, based on accepted
builder commit `923f39962d4ecd0d6312bd1bed34797fc9283b94`.

## Frozen first-beta scope

| Item | Decision |
| --- | --- |
| Format | Single-product offer only |
| Directions | Clear / Editorial |
| Composition | Direction default / Product focus |
| Assets | Manual upload, operator-approved rights and alt text |
| Preview | Static |
| Approval | Exact local revision; any edit invalidates it |
| Delivery | Standalone ZIP export |
| Projects | No durable server-side project or asset storage |
| Recovery | Prepared-brief import and tab-local text recovery; reselect packshot and approve again |
| Not in scope | Billing, hosted publishing, custom domains, public URL import, advertorial, motion, durable projects |

## Route and startup boundary

| Surface | Route | Production behavior |
| --- | --- | --- |
| Builder page | `/builder` | Builder-specific access gate; currently `404` |
| Builder generation | `POST /api/builder/generate` | Builder-specific gate before body read; currently `404` |
| Development lab | `/campaign-lab`, `/campaign-lab/offer`, other lab pages | Existing `isCampaignLabAvailable()` development-only guard retained |
| Lab APIs | `POST /api/campaign-lab/generate`, brand evidence | Existing development-only guard retained |

The builder route group owns:
- `src/app/builder/layout.tsx`, `page.tsx` and `not-found.tsx`
- `src/app/api/builder/generate/route.ts`
- `src/components/builder/` shell and workspace wrapper
- `src/lib/builder/` scope, access, startup and request contract

The builder does not mount the reputation Auth.js `SessionProvider`, does not
render the marketing/dashboard navigation, and uses a narrower CSP without
Stripe, Google, OpenAI, Resend, Neon or Sentry origins. The global proxy returns
the builder response before the Auth.js wrapper runs, so builder requests do not
receive Auth.js CSRF/callback cookies or trigger reputation account-lifecycle,
Google or GBP checks. A production smoke assertion checks this separation.

## Legacy reuse audit

| Legacy area | Reused? | Reason |
| --- | --- | --- |
| Auth.js users, Google OAuth, credentials, session and account lifecycle | **No** | The schema and flows belong to the reputation workspace. A legacy account, plan or session is not builder identity or ownership. |
| Stripe, plans, trials, entitlements and usage counters | **No** | Reputation pricing and quotas do not define builder permission or generation budget. |
| Neon database and reputation migrations | **No** | No builder tables, projects, assets or ownership records exist. This slice deliberately creates none. |
| Cron routes, jobs, budgets and mail | **No** | Builder requests are request-scoped and do not register or invoke reputation jobs. |
| OpenAI client/provider configuration | **No** | The builder never consults `CAMPAIGN_LAB_GENERATION_*` or `OPENAI_*` in this slice. Its provider decision is explicitly `null`, yielding a deterministic offline draft only. |
| Campaign Lab templates, validated generation service, revision identity and ZIP export | **Yes** | These are the qualified engine. The builder accepts only the bounded browser-brief contract and forces offer format and static presentation. |
| Campaign Lab intake UI | **Yes, bounded** | Reused behind optional props. Builder mode hides URL import, advertorial and motion, uses a separate tab-local storage key, and labels the export-only contract. |
| Global security headers and generic observability | **Partially** | Generic HSTS/security behavior is retained; builder CSP is narrowed. No builder data is written to reputation services. |

The production generation contract rejects `fixtureId`, `values`, format/layout
overrides and every unknown field. It does not load local pilots or a client
catalog.

## Access decision

`getBuilderAccessDecision()` always returns closed because builder-specific
authorization has not been implemented. It deliberately does not read the
reputation session. The page renders `notFound()` and the API returns a no-store
`404` JSON response before reading the body or selecting a provider.

Startup validation fails closed if the environment tries to open unsupported
behavior, including:
- `BUILDER_BETA_ACCESS_MODE` other than `closed`
- `BUILDER_GENERATION_PROVIDER` other than `disabled`
- `BUILDER_BETA_ENABLED`, publishing, billing, durable projects, URL import,
  custom domains, advertorial or motion switches
- reuse switches for legacy auth, billing, database or jobs

## Custom Next.js package decision

**Recommendation: retain the app-owned Next.js 16.4.5 source artifact for the
invite-only beta.** Do not replace it in this slice.

Exact artifact: `vendor/framework/next-16.4.5-ornigami-sri.source.1.tgz`,
44,840,348 bytes, SHA-256
`65edfe40b2c592e780a58a9256775814faf681aa5c653c67ae3fb5c4eba58a28`, built from
official 16.4.5 package SHA-256
`a9b934c4deda237c1a269da4e68be28f39c7c5e07296a891e0a8346ce847ef97`.

Reasons:
- The custom artifact exists to enforce Subresource Integrity for App Router
  scripts. That control is part of the current production security boundary.
- Replacing it with official 16.4.5 at the same time as establishing the builder
  boundary would be an unrelated framework rewrite and would remove a verified
  release control without a replacement.
- The package is based on the November 2026 security release, not the affected
  16.4.2 artifact.

Maintenance implications:
- The source patch in `scripts/framework-prototype/next-16.4.5-sri.patch` must be
  rebased for every upstream security release.
- The artifact is rebuilt from a verified official tarball, dependencies and a
  deterministic pack process; it is not an upstream release and must not be
  published.
- Maintenance ownership is currently **unassigned**. A named owner and rebase
  procedure are release prerequisites.
- If ownership is not accepted, replace the artifact with official Next.js and
  re-qualify the CSP/SRI policy before hosted use. Do not run both decisions
  implicitly.

Remaining runtime qualification:
- Reproduce the install, build, production start, CSP/SRI parity and denied-route
  checks on the selected Linux/Node target, not only Windows.
- Recheck dependency/security advisories for the exact artifact and lockfile.
- Record target CPU/memory, startup time, proxy behavior and rollback.
- Qualify the hosting provider's Node runtime and filesystem assumptions.

## Verification boundary

Local checks on Windows x64 with Node `v24.11.1` and npm `11.6.2` are recorded in
the [handoff](./handoffs/BUILDER_PRODUCTION_FOUNDATION_20261120.md). They establish
the local source boundary and closed routes only. No hosted deployment, real
customer access, paid model call, production migration or publication occurred.
