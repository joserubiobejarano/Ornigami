# Architecture

This document describes the application as implemented in the current codebase.

## Stack and deployment shape

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix UI
- Auth.js / NextAuth v5 beta
- Neon Postgres via `@neondatabase/serverless`
- Google Business Profile APIs, OpenAI, Stripe, Resend, and Sentry
- One Vercel-hosted Next.js application; no separate worker service
- GitHub Actions invokes the Review Booster and Review Replies cron endpoints

## Layers

### Presentation

- `src/app` — public pages, auth, dashboard, API route handlers, legal pages, and demos
- `src/components` — shared dashboard, marketing, billing, and UI components
- `src/modules/review-replies` — Review Replies pages, hooks, services, and types
- `src/modules/review-booster` — Review Booster pages, components, services, and types

### Route handlers

`src/app/api` contains authentication, privacy, team, billing, Google sync/posting, Review Booster, scheduled jobs, public intake, and legacy project routes. Routes enforce authentication, plan/agent access, business membership, or cron bearer authentication at their boundaries.

### Shared services

`src/lib` contains Auth.js helpers, environment validation, business/plan access, Google and OpenAI integrations, Stripe policy/webhook handling, privacy retention, encrypted tokens, security headers, Sentry options, dashboard metrics, and database access.

### Feature modules

Feature-specific UI, services, types, and API adapters live under `src/modules/<agent>`. Shared providers remain in `src/lib`. App Router pages select the canonical URL and compose the module page.

## Domain model

### Identity and business tenancy

- `users`, `profiles`, and Auth.js sessions hold identity and account settings.
- `businesses` are the operational containers.
- `business_members` represents workspace membership.
- `business_agents` represents per-business agent entitlement and Stripe state.

### Agents

The registry contains:

- `review_replies` — active
- `review_booster` — active
- `speed_to_lead` — registered as coming soon only

User-facing access treats `active` and `trialing` as usable. Complete-plan team access also considers `past_due` while the billing state is being resolved.

### Review Replies flow

1. A business activates Review Replies.
2. The user connects Google Business Profile through OAuth.
3. Locations and reviews are synced into business-scoped tables.
4. OpenAI generates reply drafts.
5. A user saves, posts, or enables the configured auto-reply behavior.
6. The scheduled Review Replies job can sync and draft replies for active/trialing businesses.

### Review Booster flow

1. A business activates Review Booster.
2. The user configures business, tone, language, and a Google review URL.
3. The URL is manually entered or derived from a synced Google location.
4. Visits arrive manually or through CSV import.
5. Manual or scheduled execution selects eligible visits.
6. The service generates email copy, sends through Resend, records the message, and updates visit state.

Eligibility currently requires a pending visit or retryable failure, no previous sent message, a valid email and review URL, no business/customer unsubscribe, and `visited_at` between 23 hours and seven days ago. Retries use bounded exponential backoff and the plan’s monthly allowance is enforced.

### Billing and team flow

Stripe checkout creates a subscription with `business_id`, `user_id`, `plan_id`, and billing-period metadata. Webhooks update subscription state, plan, usage-period fields, and `business_agents`. The Complete plan can invite up to three workspace users through expiring tokenized invitations.

## Security and privacy model

- Application-layer authorization is the active security boundary; Postgres RLS is not used.
- Business-scoped services verify membership where an actor id is available.
- Google tokens are encrypted at rest and legacy plaintext tokens are upgraded when read.
- OAuth state, unsubscribe links, and review-link redirects are signed.
- Cron endpoints require `CRON_SECRET`.
- CSP uses dynamic nonces for protected pages and static hashes for static marketing pages; Trusted Types remains report-only pending production observation.
- Privacy export/delete routes and scheduled retention cleanup are implemented.

## Current architectural debt and external dependencies

- Google Business Profile API quota/access approval and OAuth consent-screen publication/verification are external launch blockers for real Review Replies customers; see `ROADMAP.md`.
- Google fetches do not yet implement explicit 429/backoff handling.
- Review sync still performs one upsert per review rather than a batched upsert.
- Review Booster sends are serial within a run; the per-run cap and plan allowance are bounded, but higher-volume throughput needs future work.
- Some legacy user-resolution fallbacks use email when older sessions do not match the canonical user id.
- Public Local SEO/free-audit pages and the legacy project API remain available as supporting surfaces.
