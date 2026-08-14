# API Reference

This is the route-level map of the current LocalLift application. Protected routes require an Auth.js session unless noted otherwise. Cron routes require `Authorization: Bearer <CRON_SECRET>`.

## Authentication and account

- `GET|POST /api/auth/[...nextauth]` — Auth.js handlers, including Google sign-in.
- `POST /api/auth/register` — credentials signup and verification-email dispatch.
- `GET /api/auth/verify-email?token=...` — verifies an email and redirects to login.
- `POST /api/auth/signout` — signs out the current session.
- `GET /api/user/plan` — returns the current plan/subscription context.

## Dashboard, team, and privacy

- `GET /api/dashboard/summary` — dashboard summary metrics.
- `GET|POST /api/team` — lists workspace members or creates an owner-only Complete-plan invitation.
- `POST /api/team/invitations/[token]` — accepts a team invitation for the invited email.
- `GET /api/privacy/export` — exports the authenticated user’s account data.
- `POST /api/privacy/delete` — permanently deletes the authenticated user after confirmation.

## Review Replies and Google Business Profile

- `GET|POST /api/reviews` — review list and create workflows.
- `POST /api/reviews/draft` — saves a review reply draft.
- `GET|PUT /api/settings/reply` — review reply defaults and auto-reply setting.
- `POST /api/openai/review-reply` — generates an AI reply.
- `GET /api/google/oauth/start` — starts GBP OAuth with the `business.manage` scope.
- `GET /api/google/oauth/callback` — exchanges the OAuth code and stores the encrypted connection.
- `GET /api/google/connection` — returns connection status.
- `POST /api/google/disconnect` — disconnects Google.
- `GET /api/google/locations` — returns the full locations payload.
- `GET /api/google/locations/list` — returns a lightweight location list.
- `POST /api/google/locations/sync` — syncs locations from Google.
- `POST /api/google/reviews/sync` — syncs reviews from Google.
- `POST /api/google/reviews/process-pending` — generates and saves/posts replies for pending reviews.
- `POST /api/google/replies` — posts a reply to Google.

## Review Booster

- `GET|POST /api/review-booster/settings` — reads or writes business-level settings.
- `POST /api/review-booster/visits` — creates a manual completed-visit record.
- `POST /api/review-booster/upload` — imports visits from CSV.
- `POST /api/review-booster/run-now` — runs eligible follow-ups for the current business.
- `GET|POST /api/review-booster/unsubscribe` — processes a public unsubscribe link.
- `GET /r/[token]` — records a review-link click and redirects to the configured Google URL.

## Scheduled jobs and health

- `GET /api/cron/review-booster` — processes Review Booster businesses in `active` or `trialing` state.
- `GET /api/cron/review-replies` — syncs Google reviews and drafts replies for active/trialing businesses.
- `GET /api/cron/health` — returns the latest persisted status for each scheduled job.
- `GET /api/cron/privacy` — applies retention cleanup for operational and public-write records.
- `POST /api/csp-report` — accepts bounded Content Security Policy reports.

## Billing

- `POST /api/stripe/checkout` — creates a monthly or annual subscription checkout session.
- `POST /api/stripe/change-plan` — changes the active subscription price.
- `POST /api/stripe/portal` — opens the Stripe customer portal.
- `POST /api/stripe/webhook` — processes subscription lifecycle events and updates plan/agent state.

## Public marketing and demo flows

- `POST /api/audit/free-profile` — public free-profile audit flow.
- `POST /api/leads` — lead capture.
- `POST /api/feedback` — feedback capture.
- `POST /api/public-demo/review-booster` — public Review Booster email preview; it does not create business data or automation records. The route is implemented internally by `src/app/api-public-demo-review-booster/route.ts`.

## Legacy API surface

- `GET|POST /api/projects` — legacy project history/content records.
- `GET|PUT|DELETE /api/projects/[id]` — legacy project record operations.

There is no current `/content` page. The project API remains for compatibility and dashboard metrics, but it is not part of the product’s strategic center.

## Common error conventions

Routes commonly return:

- `400` — invalid or malformed input
- `401` — unauthenticated or invalid cron secret
- `403` — plan, agent, or authorization denial
- `404` — missing resource
- `409` — conflicting state, such as an existing subscription or invitation
- `502` — upstream Google, Stripe, or email-provider failure
- `500` — unexpected server or integration failure
