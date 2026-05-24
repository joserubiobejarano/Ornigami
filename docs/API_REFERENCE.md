# API Reference

This is a route-level map of the current API surface.

## Auth

- `GET|POST /api/auth/[...nextauth]`
  - Auth.js handlers.
- `POST /api/auth/register`
  - Credentials signup.
- `POST /api/auth/signout`
  - Sign out helper.

## User and plan

- `GET /api/user/plan`
  - Returns current plan/subscription context.

## Dashboard

- `GET /api/dashboard/summary`
  - Returns dashboard summary metrics.

## Projects (legacy content surface)

- `GET|POST /api/projects`
  - Project history for the legacy content generator.
- `GET /api/projects/[id]`
  - Single project lookup.

## Reviews and reply settings

- `GET|POST /api/reviews`
  - Review list and create workflows.
- `POST /api/reviews/draft`
  - Save review reply drafts.
- `GET|PUT /api/settings/reply`
  - Review reply defaults and auto-reply setting.

## OpenAI

- `POST /api/openai/generate`
  - Legacy content generation.
- `POST /api/openai/review-reply`
  - AI reply generation for reviews.

## Google Business Profile

- `GET /api/google/oauth/start`
  - Starts GBP OAuth flow.
- `GET /api/google/oauth/callback`
  - Handles GBP OAuth callback.
- `GET /api/google/connection`
  - Returns current GBP connection status.
- `POST /api/google/disconnect`
  - Disconnects GBP.
- `GET /api/google/locations`
  - Detailed locations payload.
- `GET /api/google/locations/list`
  - Lightweight location list for dashboard usage.
- `POST /api/google/locations/sync`
  - Pulls locations from Google.
- `POST /api/google/reviews/sync`
  - Pulls reviews from Google.
- `POST /api/google/reviews/process-pending`
  - Generates and saves/posts replies for synced reviews.
- `POST /api/google/replies`
  - Posts a reply to Google.

## Review Booster

- `GET|POST /api/review-booster/settings`
  - Read and write Review Booster settings.
- `POST /api/review-booster/visits`
  - Create a manual completed-visit record.
- `POST /api/review-booster/upload`
  - Import visits from CSV.
- `POST /api/review-booster/run-now`
  - Run follow-ups now for the current business.

## Cron

- `GET /api/cron/review-booster`
  - Runs Review Booster follow-ups across active businesses.
  - Requires `Authorization: Bearer <CRON_SECRET>`.

## Public marketing and intake flows

- `POST /api/audit/profile`
  - Authenticated audit flow.
- `POST /api/audit/free-profile`
  - Public audit flow.
- `POST /api/leads`
  - Lead capture.
- `POST /api/feedback`
  - Feedback capture.

## Stripe

- `POST /api/stripe/checkout`
  - Creates a Stripe checkout session and redirects.
- `POST /api/stripe/portal`
  - Opens Stripe customer portal.
- `POST /api/stripe/webhook`
  - Handles Stripe events and updates profile/business-agent state.

## Demo-specific surface

- `POST /api-public-demo-review-booster`
  - Public Review Booster demo endpoint used by demo experiences.

## Current API notes

### Review Booster settings write to `businesses`

Review Booster settings are not stored in a separate settings table. They are currently written onto the business row.

### Agent gating matters

The important runtime-gated endpoints are protected through `requireActiveAgentAccess`, especially for:

- Review Replies
- Review Booster

### Legacy content routes still exist

The content generator API remains in the app even though review workflows are now the main product focus.

## Error conventions

Most routes return JSON error payloads with appropriate HTTP statuses, commonly:

- `400` validation or malformed input
- `401` unauthorized
- `403` feature/agent access denied
- `404` missing resource
- `500` server or integration failure
