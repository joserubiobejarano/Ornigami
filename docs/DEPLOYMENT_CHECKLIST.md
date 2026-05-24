# Deployment Checklist

This checklist is for deploying the current app to Vercel with Neon.

## 1. Prerequisites

- [ ] GitHub repository is connected to Vercel
- [ ] Neon database is provisioned
- [ ] Google OAuth credentials are created
- [ ] Stripe account, products, and price ids are created
- [ ] Resend is configured for the sending domain or mailbox
- [ ] OpenAI API key is available

## 2. Vercel project setup

- [ ] Framework preset is `Next.js`
- [ ] Root directory is the repository root
- [ ] Build command is `npm run build`
- [ ] Install command is `npm install`
- [ ] Node.js version is compatible with Next.js 16

## 3. Environment variables

Set the variables documented in [docs/ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).

Minimum production set:

- [ ] `DATABASE_URL`
- [ ] `AUTH_SECRET`
- [ ] `AUTH_URL`
- [ ] `AUTH_TRUST_HOST` if needed
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `OPENAI_API_KEY`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_STARTER`
- [ ] `STRIPE_REVIEW_REPLIES_PRICE_ID`
- [ ] `STRIPE_REVIEW_BOOSTER_PRICE_ID`
- [ ] `CRON_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `EMAIL_FROM`

## 4. Database migrations

Apply all migrations in order:

1. [ ] `001_initial.sql`
2. [ ] `002_auto_reply_profiles.sql`
3. [ ] `003_business_foundation.sql`
4. [ ] `004_review_booster_tables.sql`
5. [ ] `005_business_agent_billing_fields.sql`

## 5. Google OAuth callbacks

Google OAuth must allow both callback routes:

- [ ] `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
- [ ] `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

If local development is used, also add localhost variants.

## 6. Stripe configuration

- [ ] Create or confirm the price id used by `STRIPE_REVIEW_REPLIES_PRICE_ID`
- [ ] Create or confirm the price id used by `STRIPE_REVIEW_BOOSTER_PRICE_ID`
- [ ] Decide whether `STRIPE_PRICE_STARTER` is still needed as a fallback
- [ ] Configure Stripe webhook endpoint: `/api/stripe/webhook`
- [ ] Subscribe webhook to the subscription lifecycle events the handler expects

## 7. Resend configuration

- [ ] Verify the sending mailbox or domain in Resend
- [ ] Set `RESEND_API_KEY`
- [ ] Set `EMAIL_FROM` to the raw mailbox address only, for example `noreply@yourdomain.com`

## 8. Review Booster cron setup

- [ ] Configure an external scheduler to call `/api/cron/review-booster`
- [ ] Send `Authorization: Bearer <CRON_SECRET>`
- [ ] Confirm only active Review Booster businesses are processed

## 9. Pre-deploy verification

Run locally before deploying:

```bash
npm install
npm run build
npm run lint
```

Checklist:

- [ ] Build passes
- [ ] Lint passes
- [ ] No missing env-var errors during test flows

## 10. Post-deploy smoke test

- [ ] Homepage loads
- [ ] Login and signup work
- [ ] Dashboard loads
- [ ] Billing page loads
- [ ] Review Replies settings and Google connection work
- [ ] Review Booster settings save successfully
- [ ] Review Booster manual visit creation works
- [ ] Review Booster CSV upload works
- [ ] Review Booster run-now works
- [ ] Stripe checkout redirects successfully
- [ ] Stripe webhook updates plan and agent state

Then run [docs/SMOKE_TEST_CHECKLIST.md](./SMOKE_TEST_CHECKLIST.md).

## 11. Deployment caveats

- Branding and pricing copy are still mixed across the app, so verify environment-specific marketing pages manually.
- Review Booster depends on both Stripe activation and valid Review Booster settings to behave correctly.
- There is no built-in scheduler in this repo; cron orchestration must be provided externally.
