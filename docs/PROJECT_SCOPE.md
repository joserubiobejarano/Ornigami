# Project Scope

This repository contains Ornigami’s current web application for local-business reputation workflows.

## Product center

Ornigami currently helps businesses:

- handle Google reviews faster;
- ask customers for reviews after completed visits;
- activate Review Replies and Review Booster through business-level billing;
- manage these workflows from one authenticated workspace.

## Current production features

### Review Replies

- Google Business Profile OAuth connection
- Location and review sync
- AI reply generation
- Draft saving and direct posting to Google
- Configurable auto-reply behavior
- Scheduled review syncing/drafting for active or trialing businesses

Real-customer availability still depends on Google Business Profile API access/quota and OAuth publication/verification outside the repository.

### Review Booster

- Active/trialing agent access gate
- Business-level settings and Google review URL selection
- Automatic URL derivation from synced Google locations
- Manual visits and CSV import
- Manual and scheduled sends through Resend
- 23-hour-to-seven-day eligibility window
- Retry/backoff, unsubscribe suppression, click tracking, and monthly plan allowances
- Visit/message persistence and failure reasons

Review Booster can run with a manually entered review URL and does not require GBP API approval.

### Billing, workspaces, and privacy

- Review Replies, Review Booster, and Complete plans with monthly/annual Stripe prices
- Stripe checkout, portal, plan changes, and webhook-driven entitlement state
- Complete-plan workspace invitations for up to three users
- Email verification, privacy export, privacy deletion, and retention cleanup

## Supporting and legacy surfaces

- Public homepage, product pages, pricing, demos, legal, contact, feedback, Local SEO, and free-audit pages remain available.
- The legacy `/api/projects` surface and project tables remain for compatibility and dashboard metrics.
- There is no current `/content` page and no completed `speed_to_lead` feature.

## Repository ownership

- Frontend: public marketing, auth, dashboard, review workflows, Review Booster, billing, team, and privacy UI.
- Backend: Next.js route handlers under `src/app/api`.
- Integrations: Google Business Profile, OpenAI, Stripe, Resend, Sentry.
- Data: Neon migrations and business-scoped application queries.

## Explicit non-goals

- Mobile applications
- A separate backend or worker service
- Full agency hierarchy beyond the current business/member model
- Customer-facing `speed_to_lead` functionality
- Treating the legacy content/audit/local-SEO surfaces as the primary product without a strategy decision

## Current maturity

Code-level foundations are in place and local checks pass. The remaining launch-critical external work is Google API access/quota and OAuth publication/verification for Review Replies, plus real Stripe and production end-to-end QA. Operational hardening and higher-volume delivery remain follow-up work.

## One-sentence summary

Ornigami is an agent-based local-business reputation app centered on Google review replies and post-visit review requests, with older local-SEO and project surfaces retained as supporting compatibility features.
