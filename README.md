# Ornigami

Ornigami is a Next.js application for local-business reputation workflows. Its current center is Google review operations:

- **Review Replies** — connect Google Business Profile, sync reviews, generate AI replies, save drafts, and post replies.
- **Review Booster** — record completed visits and send review-request emails through Resend.
- **Billing and workspaces** — activate agents per business through Stripe; Complete adds up to three workspace users.
- **Supporting surfaces** — public marketing, demos, legal/privacy, Local SEO, free-audit, lead, feedback, and legacy project APIs.

## Current state

The app contains real end-to-end Review Replies and Review Booster code, email verification, privacy export/delete, Stripe billing, cron jobs, encrypted Google tokens, Sentry configuration, and automated tests.

Review Replies still has an external launch dependency: Google Business Profile API access/quota and OAuth consent-screen publication/verification must be confirmed in Google Cloud Console. Review Booster can run with email delivery and a manually entered review URL.

`speed_to_lead` is registered as coming soon only. There is no current `/content` page; the legacy `/api/projects` surface remains for compatibility.

## Quick start

1. Install dependencies: `npm ci`
2. Create `.env.local` from [docs/ENVIRONMENT_VARIABLES.md](./docs/ENVIRONMENT_VARIABLES.md).
3. Apply migrations in `neon/migrations` in numeric order.
4. Start development: `npm run dev`
5. Open `http://localhost:3000`.

## Verification scripts

- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run test:security`
- `npm run build`

## Documentation index

- [Project scope](./docs/PROJECT_SCOPE.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Database](./docs/DATABASE.md)
- [Environment variables](./docs/ENVIRONMENT_VARIABLES.md)
- [API reference](./docs/API_REFERENCE.md)
- [Deployment checklist](./docs/DEPLOYMENT_CHECKLIST.md)
- [Roadmap and pending work](./docs/ROADMAP.md)
- [Review Booster user guide](./docs/guides/ornigami-review-booster-user-guide.md)
- [Review Booster module README](./src/modules/review-booster/README.md)
- [Migration README](./neon/README.md)

## Suggested maintainer path

1. Read [docs/PROJECT_SCOPE.md](./docs/PROJECT_SCOPE.md).
2. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
3. Read the open external and engineering work in [docs/ROADMAP.md](./docs/ROADMAP.md).
4. Inspect the dashboard, Review Booster module, Google routes, and Stripe webhook.
5. Run the verification scripts before changing deployment state.
