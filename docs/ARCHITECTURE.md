# LocalLift Architecture

This document describes the current technical architecture of the LocalLift application.

## Stack

- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix UI
- Backend: Next.js route handlers under `src/app/api`
- Database: Neon Postgres via `@neondatabase/serverless`
- Auth: Auth.js (NextAuth v5 beta)
- AI: OpenAI API
- Billing: Stripe API
- Email (Review Booster): Resend API

## High-level layers

### Presentation layer

- `src/app`: route tree, page composition, layouts
- `src/components`: shared and domain UI components
- `src/modules/review-booster/pages`: Review Booster feature pages

### Application layer

- `src/app/api`: HTTP handlers for auth, billing, GBP, AI, review workflows, and booster flows
- `src/lib`: cross-cutting app services (auth helpers, plans, integrations, data utilities)
- `src/modules/review-booster/services`: focused workflow services for follow-up automation

### Data layer

- `src/lib/db/neon.ts`: SQL client
- `src/lib/db/*`: domain query helpers
- `neon/migrations`: schema and migration source of truth

## Domain architecture

### Identity and access

- Auth.js session resolves authenticated user context
- API handlers enforce authorization in application code
- Data is scoped by `user_id` and/or `business_id`

### Business model

- `businesses` is the operational container for agents
- `business_members` maps users to businesses
- `business_agents` manages agent activation and billing ties

### Agents

- `review_replies`: active by default for new businesses
- `review_booster`: activation-gated workflow for post-visit outreach
- `speed_to_lead`: reserved/inactive by default

### Review Booster flow

1. Visits are added manually or through CSV upload.
2. Eligible follow-ups are selected by runner service rules.
3. Email content is generated/prepared.
4. Provider send attempts are recorded in `followup_messages`.
5. Visit status transitions to sent/failed/skipped.
6. Scheduled runs use `/api/cron/review-booster` with `CRON_SECRET`.

## External integration boundaries

- Google OAuth is used both for app login and GBP operations with dedicated callback routes.
- Stripe webhook updates internal subscription and plan state.
- OpenAI calls are isolated to generation endpoints/services.
- Resend is isolated to Review Booster email provider service.

## Security posture

- No Postgres RLS; authorization lives in route handlers and service-level scoping.
- Sensitive secrets are server-only env vars.
- Cron endpoint is bearer-protected.

## Related docs

- [Project Scope](./PROJECT_SCOPE.md)
- [Database and Migrations](./DATABASE.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [API Reference](./API_REFERENCE.md)
