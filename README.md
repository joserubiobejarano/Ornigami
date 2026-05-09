# LocalLift

LocalLift is an AI platform for local businesses and agencies. It centralizes review operations, Google Business Profile workflows, and growth automations into one dashboard.

## What this project includes

- AI review reply generation and draft management
- Google Business Profile connection, location sync, review sync, and reply posting
- Review Booster agent for post-visit follow-up emails
- Dashboard metrics and plan/usage gating
- Auth.js authentication (credentials + Google)
- Stripe billing and subscription lifecycle handling
- Free audit and marketing pages for lead capture

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4 + Radix UI
- Neon Postgres (`@neondatabase/serverless`)
- Auth.js (NextAuth v5 beta)
- OpenAI API
- Stripe API

## Project docs map

- [Project Scope](./docs/PROJECT_SCOPE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Database and Migrations](./docs/DATABASE.md)
- [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)
- [API Reference](./docs/API_REFERENCE.md)
- [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md)
- [Smoke Test Checklist](./docs/SMOKE_TEST_CHECKLIST.md)
- [Roadmap](./docs/ROADMAP.md)
- [Next Steps](./docs/NEXT_STEPS.md)

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` using [docs/ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md).

3. Apply Neon migrations in order:

- `neon/migrations/001_initial.sql`
- `neon/migrations/002_auto_reply_profiles.sql`
- `neon/migrations/003_business_foundation.sql`
- `neon/migrations/004_review_booster_tables.sql`
- `neon/migrations/005_business_agent_billing_fields.sql`

4. Run locally:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Available scripts

- `npm run dev` - Start development server
- `npm run build` - Build production app
- `npm run start` - Run production build
- `npm run lint` - Run ESLint

## High-level structure

- `src/app` - App routes, layouts, API routes
- `src/components` - Shared and feature UI components
- `src/lib` - Core services, integrations, business logic helpers
- `src/modules/review-booster` - Review Booster feature module
- `neon/migrations` - Canonical SQL schema/migrations
- `docs` - Product and engineering documentation

## Current status

The project already includes production-grade foundations for auth, billing, review workflows, and GBP integration. Review Booster is implemented with both manual run and cron endpoints, and gated by business agent activation status.

## License

Proprietary - all rights reserved.
