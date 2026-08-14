# Environment Variables

This file documents environment values recognized by `src/lib/env.ts` and the deployment-specific values used by the application. The schema allows local boot without every integration; a variable is required when its feature is used.

## Core application and authentication

- `DATABASE_URL` — Neon Postgres connection string; required for data access.
- `AUTH_SECRET` — Auth.js and signing/encryption secret; required in production.
- `NEXTAUTH_SECRET` — compatibility fallback for older helpers.
- `NEXT_PUBLIC_APP_URL` — canonical application URL. Production must be `https://ornigami.com`.
- `AUTH_URL` — optional Auth.js deployment hint; keep aligned with the public app URL if configured.
- `AUTH_TRUST_HOST` — optional Auth.js proxy setting where required by the hosting setup.

## Integrations

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in and Business Profile OAuth.
- `OPENAI_API_KEY` — Review Replies and Review Booster copy generation.
- `STRIPE_SECRET_KEY` — checkout, portal, plan changes, and webhook processing.
- `STRIPE_WEBHOOK_SECRET` — signature verification for `/api/stripe/webhook`.
- `RESEND_API_KEY` — Review Booster, demo, verification, alert, and team-invitation email delivery.
- `EMAIL_FROM` — verified bare sender mailbox, for example `noreply@yourdomain.com`.
- `REPLY_TO_EMAIL` — optional reply-to mailbox.

## Stripe price IDs

The current catalog uses monthly and annual prices for three plans:

- `STRIPE_PRICE_REPLIES_MONTHLY`
- `STRIPE_PRICE_REPLIES_ANNUAL`
- `STRIPE_PRICE_BOOSTER_MONTHLY`
- `STRIPE_PRICE_BOOSTER_ANNUAL`
- `STRIPE_PRICE_COMPLETE_MONTHLY`
- `STRIPE_PRICE_COMPLETE_ANNUAL`

The old `STRIPE_PRICE_STARTER`, `STRIPE_REVIEW_REPLIES_PRICE_ID`, and `STRIPE_REVIEW_BOOSTER_PRICE_ID` names are no longer read by the current billing code.

## Security, scheduled jobs, and compatibility

- `CRON_SECRET` — bearer token for scheduled jobs.
- `TOKEN_ENCRYPTION_KEY` — preferred production key for encrypted Google tokens; `AUTH_SECRET` is the fallback.
- `REVIEW_BOOSTER_UNSUBSCRIBE_SECRET` — preferred signing secret for unsubscribe and review-link tokens; auth secrets are fallbacks.
- `ALLOW_DASHBOARD_WITHOUT_GBP` — optional development/preview behavior flag.
- `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — Sentry runtime/build configuration where enabled.
- `NODE_ENV` — standard `development`, `test`, or `production` mode.

## Local example

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

AUTH_SECRET=replace_with_random_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_REPLIES_MONTHLY=price_...
STRIPE_PRICE_REPLIES_ANNUAL=price_...
STRIPE_PRICE_BOOSTER_MONTHLY=price_...
STRIPE_PRICE_BOOSTER_ANNUAL=price_...
STRIPE_PRICE_COMPLETE_MONTHLY=price_...
STRIPE_PRICE_COMPLETE_ANNUAL=price_...

CRON_SECRET=replace_with_random_token
TOKEN_ENCRYPTION_KEY=replace_with_random_key
REVIEW_BOOSTER_UNSUBSCRIBE_SECRET=replace_with_random_secret

RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
REPLY_TO_EMAIL=hello@yourdomain.com
```

## Google redirect URIs

Register both routes in Google Cloud Console:

- `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
- `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

The Business Profile flow requests the `https://www.googleapis.com/auth/business.manage` scope. API enablement, quota approval, and consent-screen publication/verification are external setup items tracked in `ROADMAP.md`.

Keep `.env.local` out of Git and treat all integration secrets as server-only.
