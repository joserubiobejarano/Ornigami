# Project Scope

This document explains what LocalLift is, what it owns, and what is currently in scope in this repository.

## Product mission

LocalLift helps local businesses operate reputation and growth workflows from one app:

- Generate and manage customer-review replies
- Connect and operate Google Business Profile workflows
- Run post-visit follow-up campaigns that request reviews
- Track activity and usage in a business dashboard

## Primary personas

- Local business owners
- Multi-location operators
- Agencies supporting local clients

## Core modules

### 1) Auth and user identity

- Credentials login and signup
- Google OAuth login via Auth.js
- Session-backed protected dashboard routes
- User/profile persistence in Postgres

### 2) Review Replies agent

- Manual review ingestion
- AI-generated reply drafts
- Posting replies to Google reviews
- Reply preferences and workflow settings

### 3) Google Business Profile integration

- OAuth authorization (separate GBP flow)
- Connection status checks
- Location sync and location listing
- Review sync
- Reply submission to GBP

### 4) Review Booster agent

- Visit ingestion (manual + CSV upload)
- Follow-up candidate tracking (`pending`, `sent`, `failed`, `skipped`)
- Automated follow-up message generation/sending pipeline
- Manual trigger endpoint and cron trigger endpoint
- Agent activation gate through `business_agents`

### 5) Billing and plan gating

- Stripe checkout session creation
- Stripe webhook-driven state synchronization
- Feature access checks by plan and status
- Dashboard upgrade prompts and feature gates

### 6) Marketing and lead capture

- Landing pages, pricing, legal pages
- Free audit flow and lead submission endpoint
- Feedback endpoint

## Data model scope

This project owns and uses:

- Account and profile tables (`users`, `profiles`)
- Billing mirrors (`subscriptions`, `user_billing`)
- Content/review domain tables
- Google connection, location, and review tables
- Business and business-agent activation tables
- Follow-up visit/message/event tables for Review Booster

See [DATABASE.md](./DATABASE.md) for details.

## In-repo boundaries

In scope:

- Web app (Next.js routes, UI, APIs)
- SQL migrations under `neon/migrations`
- Internal service-layer logic under `src/lib` and `src/modules`

Out of scope:

- External orchestration systems (unless explicitly integrated)
- Mobile apps
- Separate monorepo packages

## Operational assumptions

- Postgres security is enforced at application layer (query scoping by user/business), not RLS
- Environment variables are the source of secret/config management
- Cron endpoint access is bearer-token protected with `CRON_SECRET`

## Known maturity notes

- Strong foundation for auth, billing, review workflows, and GBP sync/reply pipeline
- Review Booster includes active runtime surfaces and database backing
- Automated test suite is not yet present in package scripts
