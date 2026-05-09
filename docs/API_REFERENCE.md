# API Reference

This is a route-level reference for current API handlers in `src/app/api`.

## Auth

- `GET|POST /api/auth/[...nextauth]`
  - Auth.js session, callbacks, and provider flows.
- `POST /api/auth/register`
  - Credentials signup.
- `POST /api/auth/signout`
  - Explicit signout route.

## User and plan

- `GET /api/user/plan`
  - Returns user plan/subscription context for gating.

## Dashboard

- `GET /api/dashboard/summary`
  - Dashboard counters and usage summary.

## Projects

- `GET|POST /api/projects`
  - List/create project artifacts.
- `GET /api/projects/[id]`
  - Read a single project.

## Reviews

- `GET|POST /api/reviews`
  - Review list/create workflows.
- `POST /api/reviews/draft`
  - Draft-related review reply handling.

## Reply settings

- `GET|PUT /api/settings/reply`
  - Reply profile/settings update and retrieval.

## OpenAI

- `POST /api/openai/generate`
  - Content generation.
- `POST /api/openai/review-reply`
  - AI review-reply generation.

## Google Business Profile

- `GET /api/google/oauth/start`
  - Starts GBP OAuth flow.
- `GET /api/google/oauth/callback`
  - Handles GBP OAuth callback.
- `GET /api/google/connection`
  - Connection status.
- `GET /api/google/locations`
  - Location payload for app usage.
- `GET /api/google/locations/list`
  - Lightweight location listing.
- `POST /api/google/locations/sync`
  - Pulls/syncs locations.
- `POST /api/google/reviews/sync`
  - Pulls/syncs reviews.
- `POST /api/google/reviews/process-pending`
  - Processes pending review workflows.
- `POST /api/google/replies`
  - Posts reply to a Google review.
- `POST /api/google/disconnect`
  - Disconnects GBP account.

## Review Booster

- `GET|PUT /api/review-booster/settings`
  - Review Booster settings read/update.
- `GET /api/review-booster/visits`
  - Review Booster visit listing.
- `POST /api/review-booster/upload`
  - CSV upload/import endpoint.
- `POST /api/review-booster/run-now`
  - Manual run for the authenticated business.

## Cron

- `GET /api/cron/review-booster`
  - Runs follow-ups across active Review Booster businesses.
  - Requires `Authorization: Bearer <CRON_SECRET>`.

## Audit, leads, feedback

- `POST /api/audit/profile`
  - Authenticated audit flow.
- `POST /api/audit/free-profile`
  - Public free-audit flow.
- `POST /api/leads`
  - Lead capture.
- `POST /api/feedback`
  - Feedback capture.

## Stripe

- `POST /api/stripe/checkout`
  - Creates checkout sessions.
- `GET /api/stripe/portal`
  - Customer portal redirect/session flow.
- `POST /api/stripe/webhook`
  - Stripe event ingestion.

## Error handling conventions

Most routes return JSON error objects with HTTP status codes for:

- `401` unauthorized
- `400` bad request / validation
- `500` server or integration errors
