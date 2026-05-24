# Project Scope

This document explains what the product is today, what this repository owns, and what is still transitional.

## Product definition

This repository contains the web application for Ornigami, also referred to in older code and docs as LocalLift.

Today the product is best understood as an agent hub for local-business reputation work.

Primary jobs to be done:

- Help businesses handle Google reviews faster
- Help businesses ask for more Google reviews after real visits
- Let each business activate specific agents through billing
- Support marketing, demo, and onboarding flows around those agents

## Core product pillars

### Review Replies

Current scope:

- Google Business Profile OAuth connection
- Location sync
- Review sync
- AI reply generation
- Draft saving
- Direct posting to Google
- Optional auto-reply behavior when the business enables it

This is one of the two main production features in the app right now.

### Review Booster

Current scope:

- Agent-level activation gate through `public.business_agents`
- Business-level follow-up settings
- Auto-derived Google review URL when GBP is connected
- Manual visit entry
- CSV visit import
- Manual send trigger
- Cron send trigger
- Delivery through Resend
- Visit and message persistence in Postgres

This is the growth feature with the clearest current commercial focus.

### Billing and agent activation

Current scope:

- Stripe checkout for agent activation
- Stripe portal access for active subscriptions
- Webhook-based subscription updates
- Business-agent status updates (`active`, `trialing`, `past_due`, `inactive`, `canceled`)

### Public site and onboarding surfaces

Current scope:

- Homepage and feature landing pages
- Pricing page
- Login and signup
- Demo pages
- Legal, privacy, terms, contact, and feedback pages

## Legacy or secondary features still in repo

These are still present and usable, but they are not the clearest expression of the product today:

- Legacy content generator at `/content`
- Audit-related flows and free-audit positioning
- Local SEO marketing copy spread across the public site

These should be treated as supporting or transitional features unless product strategy explicitly brings them back to center stage.

## Main personas

- Single-location local business owners
- Multi-location businesses
- Agencies supporting local businesses

## What this repository owns

### Frontend

- Public marketing pages
- Auth pages
- Dashboard pages
- Review workflows
- Review Booster pages
- Billing pages

### Backend

- Next.js route handlers under `src/app/api`
- OpenAI integration endpoints
- Google Business Profile OAuth and data-sync endpoints
- Stripe checkout, portal, and webhook endpoints
- Review Booster operational endpoints

### Data model

- Users and profiles
- Billing mirrors and plan views
- Google Business Profile connection and review data
- Business ownership and agent activation tables
- Review Booster visits, messages, and integration events
- Projects, leads, and feedback tables from earlier product scope

## What is explicitly not in scope

- Mobile apps
- Separate backend service outside this Next.js app
- Separate worker service for Review Booster
- Full agency account hierarchy beyond the current business model
- A completed `speed_to_lead` feature

## Operational realities

- Authorization is enforced at the application layer, not through database RLS
- Secrets are managed through environment variables
- Cron execution is protected with `CRON_SECRET`
- Several user/account flows still contain compatibility logic for legacy session/user-id behavior

## Product maturity assessment

What feels production-capable today:

- Auth and session handling
- Review Replies flow
- Google Business Profile connection and syncing
- Stripe billing plumbing
- Review Booster visit ingestion and email sending flow

What still needs alignment or cleanup:

- Mixed branding between Ornigami and LocalLift
- Mixed pricing story between public site and dashboard billing
- Legacy content/audit surfaces that no longer match the core product direction
- Automated tests and stronger observability

## Scope summary in one sentence

If a new maintainer needs the shortest accurate description:

This repo powers an agent-based local-business reputation app whose live center of gravity is Google review replies plus Review Booster follow-up automation, with older local-SEO surfaces still present in the codebase.
