# Deployment Summary

This is the short operator view of the current deployment model.

## Hosting model

- App hosting: Vercel
- Database: Neon Postgres
- Auth: Auth.js
- AI: OpenAI
- Email: Resend
- Billing: Stripe
- Scheduled Review Booster execution: external cron calling app endpoint

## Critical environment areas

| Area | Variables |
|------|-----------|
| Database | `DATABASE_URL` |
| Auth | `AUTH_SECRET`, `AUTH_URL`, optional `AUTH_TRUST_HOST` |
| Public app URL | `NEXT_PUBLIC_APP_URL` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| OpenAI | `OPENAI_API_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_REVIEW_REPLIES_PRICE_ID`, `STRIPE_REVIEW_BOOSTER_PRICE_ID` |
| Review Booster cron | `CRON_SECRET` |
| Review Booster email | `RESEND_API_KEY`, `EMAIL_FROM` |

Full detail: [docs/ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)

## Required callbacks and webhooks

### Google OAuth callbacks

- `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
- `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

### Stripe webhook

- `{NEXT_PUBLIC_APP_URL}/api/stripe/webhook`

### Review Booster cron target

- `{NEXT_PUBLIC_APP_URL}/api/cron/review-booster`
- Header: `Authorization: Bearer <CRON_SECRET>`

## Database setup

Apply these migrations in order:

1. `001_initial.sql`
2. `002_auto_reply_profiles.sql`
3. `003_business_foundation.sql`
4. `004_review_booster_tables.sql`
5. `005_business_agent_billing_fields.sql`

## Operational notes

- The deployment is a single Next.js app; there is no separate worker service.
- Review Booster email sending happens inside route execution using Resend.
- Agent activation state depends on Stripe webhook success plus `business_agents` updates.
- `EMAIL_FROM` must be a bare mailbox address, not a display-name string.

## Recommended deployment validation order

1. Confirm env vars.
2. Confirm migrations.
3. Confirm auth flows.
4. Confirm Google OAuth.
5. Confirm Stripe checkout and webhook.
6. Confirm Review Booster settings save.
7. Confirm Review Booster send flow.
8. Confirm cron invocation.
