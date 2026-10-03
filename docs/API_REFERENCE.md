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
- `GET /r/[token]` — validates the signed destination against direct Google review URL rules before recording a click/rendering navigation; unsafe historical tokens return 404.
- `GET|POST|DELETE /api/review-booster/booking-credentials` — owner-only credential metadata/create/revoke; encrypted scoped secret is revealed once on creation, never in later reads or export.
- `POST /api/webhooks/booking` — bounded raw-body HMAC and timestamp authentication using a scoped credential. Business comes from the credential; event/visit creation is atomic and deduplicated. Source labels are generic; `csv` is reserved for imports. See [A07 protocol](./tasks/A07_BOOKING_INTAKE_CSV_SETTINGS.md).

## Scheduled jobs and health

- `GET /api/cron/review-booster` — processes Review Booster businesses in `active` or `trialing` state.
- `GET /api/cron/review-replies` — syncs Google reviews and drafts replies for active/trialing businesses.
- `GET /api/cron/health` — authenticated persisted summaries and sanitized alert status; excludes durable cursor contents and raw errors. Independent hourly monitoring checks `healthy`.
- `GET /api/cron/privacy` — applies retention cleanup for operational and public-write records.
- `POST /api/csp-report` — accepts bounded Content Security Policy reports.

Cron workers return 202 for expected resumable continuation, 409 with Retry-After for a live lease, 500 for actionable work failures and 503 when health state cannot be trusted. Work is cooperatively budgeted at 45 seconds with bounded provider/SQL calls and fenced durable checkpoints; empty settled sweeps report no_work. Privacy retention already runs daily at 03:00 UTC through Vercel.

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
