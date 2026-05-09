# Environment Variables

This file documents all environment variables currently referenced in code.

## Required for core app boot

- `DATABASE_URL`
  - Used by Neon SQL client.
- `AUTH_SECRET`
  - Primary secret for Auth.js and OAuth state signing.
- `NEXT_PUBLIC_APP_URL`
  - Canonical app URL used for server-side URL generation.
- `OPENAI_API_KEY`
  - Required for AI generation features.
- `GOOGLE_CLIENT_ID`
  - Required for Google login and GBP integration.
- `GOOGLE_CLIENT_SECRET`
  - Required for Google login and GBP integration.
- `STRIPE_SECRET_KEY`
  - Required for checkout and billing operations.

## Required for specific production features

- `STRIPE_WEBHOOK_SECRET`
  - Required by `/api/stripe/webhook` signature verification.
- `STRIPE_PRICE_STARTER`
  - Starter plan price id fallback in checkout route.
- `STRIPE_REVIEW_REPLIES_PRICE_ID`
  - Agent-specific price id for review replies activation.
- `STRIPE_REVIEW_BOOSTER_PRICE_ID`
  - Agent-specific price id for review booster activation.
- `CRON_SECRET`
  - Bearer token expected by `/api/cron/review-booster`.
- `RESEND_API_KEY`
  - Required to send Review Booster follow-up emails via Resend.
- `EMAIL_FROM`
  - Sender identity used by follow-up emails.

## Optional or compatibility variables

- `AUTH_URL`
  - Helpful for deployment alignment with Auth.js host/origin behavior.
- `AUTH_TRUST_HOST`
  - Useful on some proxy/hosting setups.
- `NEXTAUTH_SECRET`
  - Compatibility fallback in `google-oauth-state` helper.
- `ALLOW_DASHBOARD_WITHOUT_GBP`
  - Middleware/runtime flag for dashboard gating behavior.
- `NODE_ENV`
  - Standard runtime mode checks.

## Local `.env.local` example

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

AUTH_SECRET=replace_with_random_secret
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

OPENAI_API_KEY=sk-...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_REVIEW_REPLIES_PRICE_ID=price_...
STRIPE_REVIEW_BOOSTER_PRICE_ID=price_...

CRON_SECRET=replace_with_random_token

RESEND_API_KEY=re_...
EMAIL_FROM=LocalLift <noreply@yourdomain.com>
```

## Notes

- Keep `.env.local` out of git.
- Keep values consistent across `AUTH_URL` and `NEXT_PUBLIC_APP_URL` per environment.
- Google OAuth redirect URIs must match exact deployed origin and callback paths.
