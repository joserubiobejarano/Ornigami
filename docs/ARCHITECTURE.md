# Architecture

This document describes the current application architecture as it exists in code today.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI
- Auth.js / NextAuth v5 beta
- Neon Postgres via `@neondatabase/serverless`
- OpenAI API
- Stripe API
- Resend API

## High-level architecture

### Presentation layer

Main folders:

- `src/app`
- `src/components`
- `src/modules/review-booster/components`
- `src/modules/review-booster/pages`

This layer contains:

- public landing pages
- auth pages
- dashboard pages
- review UI
- Review Booster UI
- billing and settings screens

### Route-handler layer

Main folder:

- `src/app/api`

This layer contains:

- auth registration and signout helpers
- review reply generation and review posting flows
- Google Business Profile OAuth, sync, and disconnect flows
- Review Booster settings, visit, upload, run-now, and cron endpoints
- Stripe checkout, portal, and webhook handlers
- public-facing lead/audit/feedback endpoints

### Shared application-services layer

Main folder:

- `src/lib`

This layer contains:

- auth helpers
- environment helpers
- plan and usage helpers
- Google integration helpers
- OpenAI integration helpers
- dashboard metrics
- business and user database helpers
- security helpers used by multiple routes

### Review Booster module layer

Main folder:

- `src/modules/review-booster`

This is the most intentionally modularized feature area in the repo.

It contains:

- feature-specific pages and components
- CSV parsing
- follow-up runner logic
- email generation
- Resend delivery
- Review Booster database access helpers
- shared Review Booster types

## Core domain model

### Identity

- `users`
- `profiles`
- Auth.js sessions

### Business container

A `business` is the operational container for agent activation and Review Booster settings.

Important tables:

- `businesses`
- `business_members`
- `business_agents`

### Agent model

The codebase currently recognizes three agents:

- `review_replies`
- `review_booster`
- `speed_to_lead`

Only the first two are wired into real runtime flows today.

### Review domain

Important concerns:

- storing synced reviews
- drafting replies
- posting replies to Google
- tracking whether a review has already been replied to

### Review Booster domain

Important concerns:

- storing completed visits
- selecting pending visits for follow-up
- generating email copy
- sending emails with Resend
- recording sent and failed attempts

## Review Replies architecture

High-level flow:

1. User activates the `review_replies` agent.
2. User connects Google Business Profile.
3. Locations are synced through Google APIs.
4. Reviews are synced into the app.
5. OpenAI generates a reply draft.
6. The reply is saved as a draft or posted to Google.
7. If auto-reply is enabled, some reply generation/posting can happen immediately after sync.

Primary files:

- `src/app/(dashboard)/reviews/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/api/google/**`
- `src/app/api/openai/review-reply/route.ts`
- `src/app/api/reviews/**`
- `src/app/api/settings/reply/route.ts`

## Review Booster architecture

High-level flow:

1. User activates the `review_booster` agent.
2. User configures business settings, tone, language, and review URL.
3. Visits are added manually or imported by CSV.
4. A manual run or cron run scans eligible visits.
5. Email content is generated.
6. Email is sent through Resend.
7. Visit and message state are updated in Postgres.

Primary files:

- `src/app/(dashboard)/dashboard/agents/review-booster/**`
- `src/app/api/review-booster/**`
- `src/app/api/cron/review-booster/route.ts`
- `src/modules/review-booster/**`

## Billing architecture

High-level flow:

1. User submits checkout for an agent.
2. Checkout session includes `business_id`, `user_id`, and `agent_id` metadata.
3. Stripe webhook receives subscription lifecycle events.
4. Profile plan status is updated.
5. Matching `business_agents` record is updated for supported agent ids.

Primary files:

- `src/app/(dashboard)/dashboard/billing/page.tsx`
- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`
- `src/app/api/stripe/webhook/route.ts`

## Security model

Current posture:

- Route handlers authenticate requests with Auth.js or bearer checks.
- Authorization is enforced in application code.
- `requireActiveAgentAccess` is the main helper for agent-gated routes.
- Cron routes are protected by `Authorization: Bearer <CRON_SECRET>`.
- Secrets are expected through env vars.

Important limitation:

- Postgres RLS is not the active security boundary here. Application-layer query scoping is the real control plane.

## Known architectural debt

### Branding mismatch

Architecture is stable, but naming is not. Expect both `Ornigami` and `LocalLift` in the same repo.

### Legacy surfaces

The architecture still includes content and audit flows from an earlier product emphasis.

### Review Booster timing rule mismatch

The upload UI communicates a visit-age window, but the current runner selects pending visits without enforcing that window in the query layer.

### Compatibility fallbacks

Several places resolve users by email when old session/user-id behavior does not line up with `public.users.id`.

## Architecture summary

This app is a single Next.js product that combines public site, authenticated dashboard, API layer, and business logic in one codebase, with Review Booster standing out as the cleanest feature module and the most obvious candidate for continued product investment.
