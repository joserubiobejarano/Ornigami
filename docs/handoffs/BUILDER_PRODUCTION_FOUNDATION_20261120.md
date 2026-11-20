# Builder production foundation handoff — 20 November 2026

## Source

- Branch: `codex/ornigami-production-foundation-20261120`
- Base: `923f39962d4ecd0d6312bd1bed34797fc9283b94`
- Implementation commit: `82e4b08a3efe9d3166eed362cabe2d2d6671f3cd`
- Worktree: `C:/Users/joser/.local/ornigami-production-foundation`

## What landed

A production route and service boundary for the first invite-only
creation/export beta, kept separate from the development Campaign Lab.

- Builder page: `/builder` with its own layout, navigation and closed notice.
- Builder generation API: `POST /api/builder/generate`.
- Builder-specific access gate: always closed until invite/ownership/budget is
  implemented; never falls back to the reputation Auth.js session.
- Builder configuration and startup validation: unsupported opening flags stop
  the Node server before it serves requests.
- Narrow builder CSP: no legacy Stripe, Google, OpenAI, Resend, Neon or Sentry
  origins.
- Bounded browser-brief request parser: no fixture IDs, form values, advertorial
  or layout overrides.
- Reused qualified offer generation/export engine with explicit offline provider
  decision; laboratory provider environment cannot leak into the builder.
- Existing Campaign Lab pages and APIs keep their development-only guards.

The production UI is intentionally unreachable in this slice. Its wrapper reuses
the proven local offer intake with builder-only props once access exists.

## Next slice — builder access, ownership and budget

Do this in a new branch from this foundation, not by removing the closed gate.

### 1. Access

- Implement an invite-only builder identity distinct from reputation Auth.js.
  Acceptable first options: signed single-use invite tokens exchanged for a
  short-lived HTTP-only builder session, or a separately configured builder
  identity provider.
- Record invite issuer, subject, expiry, revocation and last use. Do not accept a
  reputation user ID, plan, Google connection or Stripe customer as builder
  permission.
- Add origin/CSRF checks and request-rate limits on the builder generation API.
- Keep `/builder` and `/api/builder/generate` denied by default when configuration
  is missing or invalid.

### 2. Ownership and recovery

Choose one contract and make it explicit:

- **Durable projects:** add new builder-only tables (account, workspace, project,
  revision, asset reference) and an object store for approved asset bytes. Include
  cross-account denial, deletion, retention, byte/type/size validation and
  recovery. Do not reuse reputation migrations or records.
- **Export-only beta:** keep no server-side project/asset storage. Preserve the
  prepared-brief import contract, tab-local text recovery, packshot reselection
  and fresh exact-revision approval. State the limitation in the UI and terms.

Either choice must be covered by a refresh/recovery test and an exact-revision
export identity check.

### 3. Budget and provider

- Add per-user and global generation limits, concurrency limits, spend caps and
  cancellation. Fail closed when the budget store is unavailable.
- Add a builder-specific provider configuration and provider canary under a fresh
  written authorization. Keep zero request retries and bounded timeout.
- Preserve deterministic fallback and last-valid-preview behavior.
- Record usage and cost without placing secrets or customer image bytes in logs.
- Add abuse controls for repeated generation, failed requests and large bodies.

### Suggested acceptance checks

- Anonymous `/builder` and API requests return the same closed response with no
  reputation session cookie.
- A valid invite reaches the builder; expired, revoked, reused and cross-account
  invites are denied.
- Account A cannot read, generate for, export or delete Account B's project.
- Budget exhaustion, provider timeout, invalid output and cancellation preserve
  the last valid preview and never export an unapproved revision.
- Prepared-brief import restores text only; packshot and approval require fresh
  selection.
- Export contains the exact approved revision and no server-only asset path.
- Production startup with an invalid builder environment fails before listening.
- No reputation cron, mail, Google, Stripe, database or provider operation occurs
  during builder startup or a denied request.

## Exact checks for this foundation slice

Run from the worktree root:

```powershell
node --experimental-strip-types --test tests/builder-production-boundary.test.mts
node --experimental-strip-types --test `
  tests/campaign-lab-browser-generation.test.mts `
  tests/campaign-lab-browser-export.test.mts `
  tests/campaign-lab-offer-intake-brief.test.mts `
  tests/campaign-lab-generation.test.mts `
  tests/a11-restricted-proxy-contract.test.mts `
  tests/security-hardening.test.mts
npx tsc --noEmit
npx eslint
npm run build
npm run test:build
```

Expected route behavior in the production smoke:
- `/builder` is `404` and creates no legacy session cookie.
- `POST /api/builder/generate` is `404` with `{ "ok": false, "error": "Not found." }`.
- `/campaign-lab` and its lab APIs remain `404`.
- The builder response CSP contains `connect-src 'self'` and no legacy provider
  origins.

Recorded local results (Windows x64, Node `v24.11.1`, npm `11.6.2`):

- Builder boundary suite: **11 passed, 0 failed**.
- Campaign Lab suites: **335 passed, 0 failed**.
- Focused proxy/security set: **passed** (restricted-session proxy,
  CSP/security hardening, browser generation/export and intake brief).
- `npx tsc --noEmit`: passed.
- `npm run lint`: **0 errors**; 27 pre-existing warnings outside this slice.
- `npm run build`: passed with CI placeholder Google/Auth environment values.
  The normal production build still requires the legacy Auth.js configuration;
  that requirement predates this slice and is not a builder credential.
- `npm run test:build`: passed. `/builder` and `/api/builder/generate` returned
  `404`, the builder page created no Auth.js session cookie, and the builder CSP
  contained only same-origin connection policy.
- Invalid startup check: starting the built server with
  `BUILDER_BETA_ACCESS_MODE=invite` exited with code `1` and
  `Builder configuration is invalid`; no request was served successfully.

## Rollback

This slice adds no migrations, no provider configuration, no customer data and no
deployment changes. Roll back by reverting the branch/commit or declining to merge
it. The Campaign Lab and legacy application remain independent. If a build with
these routes must be withdrawn, remove the builder route files and startup call;
do not remove the existing `isCampaignLabAvailable()` guards.

The closed gate is the safe default even if the branch is deployed accidentally:
both builder routes return `404`, and unsupported opening flags stop startup.

## Unresolved release gates

- Named owner and rebase process for the custom Next.js SRI artifact, or an
  approved replacement plan.
- Linux/target-host install, build, production start, CSP/SRI and rollback
  qualification at the exact source SHA.
- Current dependency/security audit acceptance.
- Builder access, invite lifecycle, ownership and cross-account isolation.
- Budget accounting, provider configuration and fresh authorized provider canary.
- Privacy/terms, retention, support, monitoring and incident procedure for
  builder data.
- Target-user acceptance of the builder UX and export.
- Hosted publishing, custom domains, billing and public URL import remain out of
  scope for this beta.
