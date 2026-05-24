# Ornigami / LocalLift

Ornigami is the product name used in the current UI and marketing pages. `LocalLift` is the legacy repository and internal platform name that still appears in parts of the codebase, database comments, and older docs.

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

What still exists but is no longer the main product focus:

- Legacy content generation (`/content`)
- Legacy audit flow (`/audit` and related marketing funnels)
- Early local SEO content positioning across some marketing copy

What is not fully shipped yet:

- `speed_to_lead` agent (registered, but still coming soon)
- A fully unified brand pass across repo, docs, and UI copy
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

### 3. Billing and activation

The app currently uses agent-level billing and activation records in `public.business_agents`.

Implemented agent ids:

- `review_replies`
- `review_booster`
- `speed_to_lead` (coming soon)

## Important realities for anyone reviewing this repo

### Branding is mixed

You will see both `Ornigami` and `LocalLift`.

- UI and marketing pages mostly say `Ornigami`
- Repo name, older docs, and some system copy still say `LocalLift`

This is not two separate products. It is one product in the middle of a naming transition.

### Review Booster is real, but still maturing

The full Review Booster workflow exists end to end, but there are a few implementation details worth knowing:

- Settings save the business-level review URL, tone, and language.
- If Google Business Profile is connected, Review Booster can derive the review URL automatically from synced locations.
- Emails are sent through Resend.
- The dashboard and upload page describe a timing window, but the current runner processes all eligible pending visits with a customer email and a business review URL. The time-window rule is not currently enforced in `listEligibleFollowupVisits`.
- Failed sends are marked `failed`; the visit table UI currently does not expose detailed error reasons even though failed message rows are recorded.

### Pricing copy is not fully consistent yet

There are two pricing models reflected in the current app:

- Public marketing pages still present a single starter plan at `$14.99/month`
- Dashboard billing presents per-agent activation prices (`Review Replies` and `Review Booster` separately)

The Stripe checkout flow supports agent-specific price ids:

- `STRIPE_REVIEW_REPLIES_PRICE_ID`
- `STRIPE_REVIEW_BOOSTER_PRICE_ID`
- `STRIPE_PRICE_STARTER` as a fallback

Anyone taking over the project should treat pricing and plan messaging as an open product-alignment task.

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
- [Smoke Test Checklist](./docs/SMOKE_TEST_CHECKLIST.md)
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
