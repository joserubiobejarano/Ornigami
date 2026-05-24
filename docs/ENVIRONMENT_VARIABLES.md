# Environment Variables

This file documents the environment variables currently referenced in code.

## Required for app boot

- `DATABASE_URL`
  - Neon connection string used by the SQL client.
- `AUTH_SECRET`
  - Primary Auth.js secret.
- `NEXT_PUBLIC_APP_URL`
  - Canonical browser-facing app URL.
- `OPENAI_API_KEY`
  - Required for AI generation features.
- `GOOGLE_CLIENT_ID`
  - Required for Google sign-in and Google Business Profile flows.
- `GOOGLE_CLIENT_SECRET`
  - Required for Google sign-in and Google Business Profile flows.
- `STRIPE_SECRET_KEY`
  - Required for checkout, portal, and webhook-side Stripe operations.

## Required for production features

- `STRIPE_WEBHOOK_SECRET`
  - Required by `/api/stripe/webhook`.
- `STRIPE_PRICE_STARTER`
  - Fallback Stripe price id used by checkout when no agent-specific id applies.
- `STRIPE_REVIEW_REPLIES_PRICE_ID`
  - Stripe price id for Review Replies activation.
- `STRIPE_REVIEW_BOOSTER_PRICE_ID`
  - Stripe price id for Review Booster activation.
- `CRON_SECRET`
  - Bearer token for `/api/cron/review-booster`.
- `RESEND_API_KEY`
  - Required to send Review Booster emails.
- `EMAIL_FROM`
  - Email address used by Resend as the sender mailbox.

## Optional or compatibility variables

- `AUTH_URL`
  - Helpful for deployed Auth.js origin alignment.
- `AUTH_TRUST_HOST`
  - Sometimes needed behind proxies or hosted environments.
- `NEXTAUTH_SECRET`
  - Compatibility fallback used by some older auth helpers.
- `ALLOW_DASHBOARD_WITHOUT_GBP`
  - Optional behavior flag used around dashboard gating.
- `NODE_ENV`
  - Standard environment mode.

## Important `EMAIL_FROM` note

The current Review Booster sender code builds the `from` header like this:

```text
{business_or_sender_name} <{EMAIL_FROM}>
```

That means `EMAIL_FROM` should be just the mailbox address, for example:

```env
EMAIL_FROM=noreply@yourdomain.com
```

Do not set `EMAIL_FROM` to a full display-name string like `LocalLift <noreply@yourdomain.com>`, or the final sender header will be malformed.

## Local `.env.local` example

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require

AUTH_SECRET=replace_with_random_secret
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
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
EMAIL_FROM=noreply@yourdomain.com
```

## OAuth redirect reminders

Google OAuth should include both callback URLs:

- `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
- `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

## Operational notes

- Keep `.env.local` out of git.
- Keep `AUTH_URL` and `NEXT_PUBLIC_APP_URL` aligned for each environment.
- Treat Stripe, Google, OpenAI, and Resend secrets as server-only.
