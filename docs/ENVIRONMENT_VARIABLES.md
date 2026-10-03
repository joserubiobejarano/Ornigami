# Environment Variables

This file documents environment values recognized by `src/lib/env.ts` and the deployment-specific values used by the application. The schema allows local boot without every integration; a variable is required when its feature is used.

## Core application and authentication

- `DATABASE_URL` — Neon Postgres connection string; required for data access.
- `AUTH_SECRET` — Auth.js and signing/encryption secret; required in production.
- `NEXTAUTH_SECRET` — compatibility fallback for older helpers.
- `NEXT_PUBLIC_APP_URL` — canonical application URL and Business Profile callback source via `getServerAppUrl()`. Production must be `https://ornigami.com`; it does not configure Auth.js's own base URL.
- `AUTH_URL`, `NEXTAUTH_URL` — Auth.js uses `AUTH_URL ?? NEXTAUTH_URL` before request-origin inference; keep the effective origin aligned with the public app, with `/api/auth` as the valid base path. An explicitly empty `AUTH_URL` shadows the legacy alias and causes request inference; remove unused values rather than configuring blanks. The offline [A16 checker](../scripts/a16-google-readiness.mjs) reports local shape/alignment only, not provider approval or actual deployed forwarding behavior.
- `AUTH_TRUST_HOST` — optional Auth.js proxy setting where required by the hosting setup.

## Integrations

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google sign-in and Business Profile OAuth.
- `OPENAI_API_KEY` — Review Replies and Review Booster copy generation.
- `STRIPE_SECRET_KEY` — checkout, portal, plan changes, and webhook processing.
- `STRIPE_WEBHOOK_SECRET` — signature verification for `/api/stripe/webhook`.
- `RESEND_API_KEY` — Review Booster, demo, verification, alert, and team-invitation email delivery.
- `RESEND_WEBHOOK_SECRET` — endpoint-specific raw-body Svix signing secret for `/api/webhooks/resend`; absent configuration returns 503. Register only the supported delivery event types and verify a controlled webhook before launch.
- `RESEND_RECONCILIATION_ENABLED` — default false/unset. Set exactly `true` only after controlled retrieval/body/tag/key-permission and owner/member UI acceptance. This enables positive-evidence owner lookup, never resend or quota release. Frozen-account operator recovery remains an A11 gate.
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
- `NEXT_PUBLIC_SENTRY_DSN` — Sentry runtime transport used by instrumentation and cron alerts; a missing/failed transport is recorded and retried. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` configure build/upload integration where enabled.
- `SUPPORT_DATABASE_URL` — operator-only PostgreSQL credential limited to `SELECT` on `public.feedback`, supplied explicitly to `scripts/support-inbox.mjs` through the approved secret mechanism. It has no application `DATABASE_URL` fallback and is not a new application deployment secret. Verify the target and private artifact access before use; see [support workflow](./tasks/A12_SUPPORT_VISIBILITY.md).
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
