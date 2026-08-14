# Ornigami

Ornigami is the product name for this application and its user-facing workflows.

This repository currently powers a Next.js web app for local-business reputation workflows, with a strong emphasis on:

- Review Replies: sync Google Business Profile reviews, generate AI replies, save drafts, and optionally post to Google.
- Review Booster: log completed visits and send follow-up emails that ask happy customers for a Google review.
- Billing and activation: Stripe-backed agent activation per business.
- Marketing and demo surfaces: landing pages, pricing, demos, and lead capture flows.

## Product snapshot

What is live in the current codebase:

- Auth.js authentication with credentials and Google sign-in
- Business creation and per-business agent activation records
- Review Replies dashboard and Google Business Profile integration
- Review Booster dashboard, settings, manual visit entry, CSV import, run-now endpoint, and cron endpoint
- Stripe checkout, portal, and webhook handling for agent activation
- Public-facing marketing pages, demos, and supporting legal/contact pages

What is not fully shipped yet:

- `speed_to_lead` agent (registered, but still coming soon)
- Automated tests in package scripts
- Production observability beyond app-level logging

## Current product structure

### 1. Review Replies

Primary user outcome:

- Connect Google Business Profile
- Sync locations and reviews
- Generate replies with OpenAI
- Save drafts or post replies to Google
- Optionally auto-post when auto-reply is enabled

Main routes:

- `/dashboard/agents/review-replies`
- `/reviews`
- `/settings`

### 2. Review Booster

Primary user outcome:

- Activate the Review Booster agent for a business
- Configure business name, review URL, tone, and language
- Add completed visits manually or via CSV upload
- Send follow-up review-request emails manually or through a cron job
- Track visit status (`pending`, `sent`, `failed`, `skipped`)

Main routes:

- `/dashboard/agents/review-booster`
- `/dashboard/agents/review-booster/new`
- `/dashboard/agents/review-booster/upload`
- `/dashboard/agents/review-booster/settings`
- `/demo-review-booster` (public sample flow)

Public demo behavior:

- The demo endpoint is `POST /api/public-demo/review-booster` (rewritten internally).
- It sends a sample email preview only.
- It does not create business records, visits, or automations.

Review URL tip:

- Prefer the direct Google Maps "Write a review" link (the popup review form link) over a generic profile URL for lower friction.

### 3. Billing and activation

The app currently uses agent-level billing and activation records in `public.business_agents`.

Implemented agent ids:

- `review_replies`
- `review_booster`
- `speed_to_lead` (coming soon)

## Important realities for anyone reviewing this repo

### Branding

The product and user-facing documentation use the Ornigami name consistently.
Some compatibility-sensitive internal identifiers retain their historical names
so existing sessions, deployments, and database integrations continue to work.

### Review Booster is real, but still maturing

The full Review Booster workflow exists end to end, but there are a few implementation details worth knowing:

- Settings save the business-level review URL, tone, and language.
- Follow-up emails include an unsubscribe link; opted-out recipients are excluded from future pending sends for that business.
- If Google Business Profile is connected, Review Booster can derive the review URL automatically from synced locations.
- Emails are sent through Resend.
- The runner enforces the current 23-hour-to-7-day eligibility window. The remaining product gap is that the window and quiet hours are not yet user-configurable.
- Failed sends are marked `failed`; the visit table UI currently does not expose detailed error reasons even though failed message rows are recorded.

### Current pricing model

The app currently uses three EUR plans, each with monthly and annual Stripe prices:

- Review Replies: €39/month or €360/year
- Review Booster: €39/month or €360/year
- Complete: €59/month or €560/year

The checkout flow reads these environment variables:

- `STRIPE_PRICE_REPLIES_MONTHLY` / `STRIPE_PRICE_REPLIES_ANNUAL`
- `STRIPE_PRICE_BOOSTER_MONTHLY` / `STRIPE_PRICE_BOOSTER_ANNUAL`
- `STRIPE_PRICE_COMPLETE_MONTHLY` / `STRIPE_PRICE_COMPLETE_ANNUAL`

All plans include a 14-day trial. Whether that trial should remain card-free is still an open Stripe/product decision.

### Content and audit surfaces are legacy

The current strategic center of the app is the review workflow, especially:

- Google review syncing and replies
- Review Booster follow-ups

The legacy content generator and audit flows still work as supporting or historical features, but they should not be treated as the main product direction unless strategy changes.

## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI
- Auth.js / NextAuth v5 beta
- Neon Postgres via `@neondatabase/serverless`
- OpenAI API
- Stripe API
- Resend API

## Project map

- [Project Scope](./docs/PROJECT_SCOPE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Database](./docs/DATABASE.md)
- [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)
- [API Reference](./docs/API_REFERENCE.md)
- [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md)
- [Deployment Summary](./docs/DEPLOYMENT_SUMMARY.md)
- [Production smoke-test notes](../Audit/Design-Redesign.md)
- [Roadmap](./docs/ROADMAP.md)
- [Next Steps](./docs/NEXT_STEPS.md)
- [Review Booster module README](./src/modules/review-booster/README.md)
- [Neon migrations README](./neon/README.md)

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local` using [docs/ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md).

3. Apply Neon migrations in order.

```text
neon/migrations/001_initial.sql
neon/migrations/002_auto_reply_profiles.sql
neon/migrations/003_business_foundation.sql
neon/migrations/004_review_booster_tables.sql
neon/migrations/005_business_agent_billing_fields.sql
neon/migrations/006_public_demo_events.sql
neon/migrations/007_review_booster_unsubscribes.sql
neon/migrations/008_pricing_plans.sql
neon/migrations/009_review_booster_error_reason.sql
neon/migrations/010_review_booster_retries.sql
neon/migrations/011_review_link_clicks.sql
neon/migrations/012_cron_runs.sql
neon/migrations/013_review_business_tenancy.sql
```

4. Start the app.

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Available scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

## Suggested first review path for a new maintainer

1. Read [docs/PROJECT_SCOPE.md](./docs/PROJECT_SCOPE.md)
2. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
3. Inspect `src/app/(dashboard)/dashboard/page.tsx`
4. Inspect `src/app/(dashboard)/reviews/page.tsx`
5. Inspect `src/app/(dashboard)/dashboard/agents/review-booster/page.tsx`
6. Inspect `src/app/api/stripe/webhook/route.ts`

## Repository status summary

If someone opens this repository today, the clearest summary is:

- The app already supports real review operations and a usable Review Booster workflow.
- The codebase is moving from a broader local-SEO product story toward an agent-based review product.
- Review Booster is the most important growth surface to polish, document, and sell next.
- Documentation and product messaging needed an update because the shipped product had moved ahead of the older docs.
