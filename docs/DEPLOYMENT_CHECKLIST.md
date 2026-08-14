# Deployment Checklist

This is the single deployment and operator document for the Vercel + Neon application.

## At a glance

- Hosting: Vercel
- Database: Neon Postgres
- Auth: Auth.js
- Integrations: Google Business Profile, OpenAI, Stripe, Resend, Sentry
- Scheduled jobs: GitHub Actions calls the Review Booster hourly and Review Replies every four hours
- There is no separate worker service.

## 1. Accounts and prerequisites

- [ ] GitHub repository is connected to the Vercel project.
- [ ] Neon database is provisioned.
- [ ] Google OAuth credentials exist in the project used by `GOOGLE_CLIENT_ID`.
- [ ] Google Business Profile APIs are enabled, access/quota is approved, and the OAuth consent screen is published/verified as required. This remains an external blocker; see `ROADMAP.md`.
- [ ] Stripe products and six monthly/annual price IDs are created.
- [ ] Resend sending domain/mailbox is verified.
- [ ] OpenAI API access is available.
- [ ] Sentry project and auth values are configured if production error monitoring is expected.

## 2. Vercel configuration

- [ ] Framework preset is Next.js.
- [ ] Root directory is the `Agent-LocalLift` repository root.
- [ ] Build command is `npm run build`.
- [ ] Install command is `npm install`.
- [ ] Node.js version is compatible with Next.js 16.
- [ ] Production `NEXT_PUBLIC_APP_URL` is exactly `https://ornigami.com`; the build rejects another Vercel production URL.

## 3. Environment variables

Configure the variables in [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). The production feature set normally includes:

- [ ] `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
- [ ] `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_REPLIES_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`
- [ ] `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_BOOSTER_ANNUAL`
- [ ] `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_COMPLETE_ANNUAL`
- [ ] `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- [ ] `TOKEN_ENCRYPTION_KEY` or an intentionally managed `AUTH_SECRET` fallback
- [ ] `REPLY_TO_EMAIL` and `REVIEW_BOOSTER_UNSUBSCRIBE_SECRET` if used
- [ ] `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` where applicable

## 4. Database migrations

Apply all migrations in order, including the current tail:

- [ ] `001_initial.sql` through `013_review_business_tenancy.sql`
- [ ] `014_security_hardening.sql`
- [ ] `015_stripe_usage_periods.sql`
- [ ] `016_remove_legacy_plan_taxonomy.sql`
- [ ] `017_team_invitations.sql`

Do not mark these permanently complete in a reusable checklist; verify the target environment each time.

## 5. Google OAuth and Business Profile readiness

Google Cloud Console must contain both authorized redirect URIs:

- [ ] `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` for Google sign-in.
- [ ] `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback` for Business Profile connection.

Before onboarding real Review Replies customers:

- [ ] Confirm the `business.manage` scope is approved for the OAuth app.
- [ ] Confirm the Business Profile APIs used by the app are enabled and quota is granted for the project behind `GOOGLE_CLIENT_ID`.
- [ ] Confirm the consent screen is published and verification is complete if Google requires it.
- [ ] Connect a real GBP account, sync a location, sync a review, save a draft, and post a controlled reply.

Review Booster can operate with email and a manually entered review URL while this external dependency remains unresolved.

## 6. Stripe and email

- [ ] Configure `/api/stripe/webhook` and subscribe it to the lifecycle events handled by the app.
- [ ] Test checkout for Review Replies, Review Booster, and Complete in Stripe test mode.
- [ ] Test plan changes, duplicate webhook replay, trial behavior, and payment failure state updates.
- [ ] Verify the Resend sending mailbox/domain.
- [ ] Keep `EMAIL_FROM` as a bare mailbox address, for example `noreply@yourdomain.com`.

## 7. Scheduled jobs

- [ ] Confirm GitHub Actions secrets `APP_BASE_URL` and `CRON_SECRET`.
- [ ] Confirm Review Booster cron returns success and processes active/trialing businesses.
- [ ] Confirm Review Replies cron returns success and processes active/trialing businesses.
- [ ] Confirm `/api/cron/health` shows persisted `cron_runs` records.
- [ ] Confirm the privacy cleanup job is scheduled if retention cleanup is required in production.

## 8. Pre-deploy verification

Run from the repository root:

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run test:security
npm run build
```

## 9. Post-deploy smoke test

- [ ] Homepage, pricing, login, signup, legal, and demos load.
- [ ] Email verification works for credentials signup.
- [ ] Dashboard and billing load.
- [ ] Review Booster settings, manual visit entry, CSV upload, run-now, unsubscribe, and tracked review-link redirect work.
- [ ] Review Replies Google connection and controlled sync/post flow work, if Google approval is complete.
- [ ] Team invitation works on Complete.
- [ ] Privacy export/delete works with a test account.
- [ ] Stripe webhook updates plan and agent state.
- [ ] Sentry receives a controlled test error, then the test is removed or clearly identified.

## Current caveats

- Google Business Profile API access/quota and OAuth publication/verification are external dependencies, not code tasks.
- Review Booster has a bounded per-run cap and plan allowance, but higher-volume delivery is still serial.
- Public Local SEO/free-audit pages and the legacy project API remain available, although they are not the product center.
