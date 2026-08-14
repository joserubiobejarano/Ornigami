# Roadmap and Pending Work

This is the single living roadmap for Agent-LocalLift. It combines product priorities, operational follow-ups, and the external approvals that must not be lost in separate audit files.

**Last code verification:** 2026-08-14. Local checks: `npm test` 16/16, `npm run test:security` 7/7, `npm run lint` passed.

## Current strategic center

1. Review Replies handles incoming Google reviews.
2. Review Booster asks customers for reviews after completed visits.
3. Billing activates agents per business, with Complete adding a small workspace.

## Already implemented

- Auth.js credentials and Google sign-in, email verification, business/member tenancy, and plan gating.
- Stripe checkout, portal, plan changes, webhook state updates, trials, usage periods, and Complete-plan invitations.
- Review Replies Google OAuth, location/review sync, AI drafts, direct posting, auto-reply settings, and scheduled sync/draft processing.
- Review Booster settings, Google URL derivation, manual visits, CSV import/dedupe, manual and scheduled sends, retries, unsubscribe suppression, tracked review links, failure reasons, per-run bounds, and plan allowances.
- Privacy export/delete, retention cleanup, cron health records, encrypted Google tokens, CSP hardening, Sentry configuration, and security tests.
- Static marketing/SEO improvements, public demos, legal pages, and current pricing catalog.

## External launch blockers

These cannot be proven from the repository and remain open until verified in Google Cloud Console or production.

### Google Business Profile API access and quota — open

Review Replies uses the `business.manage` OAuth scope and Google Business Profile APIs. Before onboarding real Review Replies customers:

- Confirm the project behind `GOOGLE_CLIENT_ID` has the required Business Profile APIs enabled.
- Confirm Google has approved programmatic access and granted usable quota; the default quota may be insufficient for real use.
- Keep the support email, sending domain, public product name, and OAuth consent-screen details aligned in the approval request.
- Record the approval/quota evidence in the deployment checklist when complete.

Review Booster can launch independently with email delivery and a manually entered Google review URL.

### Google OAuth publication and verification — open

- Publish the OAuth consent screen out of testing before broader customer onboarding.
- Complete Google verification if the requested scope/app configuration requires it.
- Confirm both redirect URIs are registered:
  - `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  - `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

### Google production smoke test — blocked by the items above

After approval/publication:

1. Connect a real GBP account.
2. Sync a location and at least one review.
3. Generate/save a draft and post a controlled reply.
4. Confirm the Review Replies cron can sync/draft successfully.
5. Confirm Review Booster URL derivation still works from the synced location.

### Stripe production QA — open

Run the deployment checklist in Stripe test mode, then repeat the critical path in live mode with the first customer. Cover Complete activation, downgrade, duplicate webhook replay, payment failure, trial behavior, and usage-period updates.

## Next product and reliability work

### Review Booster

- Improve onboarding and settings guidance for a first successful send.
- Improve high-volume throughput; sends currently run serially within a bounded batch.
- Add deliverability guidance and, later, per-customer sending domains plus bounce/complaint suppression.

### Review Replies

- Add explicit Google 429/backoff handling.
- Replace per-review sync upserts with a batched upsert.
- Improve multi-location error and empty states after external API approval is complete.

### Release and operations

- Run the full deployment checklist against the target environment.
- Establish production CWV/Lighthouse and real-user monitoring after traffic exists.
- Continue end-to-end Stripe, Google, cron, and Sentry smoke tests as part of release verification.

## Security and performance follow-ups

- Trusted Types is report-only. Observe production reports, fix any reported sinks, then consider enforcing it and removing the report-only header.
- The enforced CSP still permits inline styles because of current framework constraints; revisit if a strict style policy becomes practical.
- Re-run bundle analysis after significant marketing changes.
- Adopt Auth.js v5 stable when it becomes available and re-test the Google and credentials flows.

## Deferred product decisions

- Decide whether legacy Local SEO/free-audit positioning should remain prominent.
- Decide whether the legacy project API should eventually be retired.
- Decide whether `speed_to_lead` should ship or be removed from the registry/product story.
- Consider a free QR/short-link tool after the current paid workflows are stable.
- Consider broader agency/multi-business workflows after the current business model proves out.

## Closed items that should not be re-added as pending

- Review Booster’s 23-hour-to-seven-day selection window is enforced in the database query.
- Review Booster fair-use allowances and retry/backoff rules are enforced.
- Detailed Review Booster failure reasons are shown in the visit table.
- GitHub Actions uses current checkout/setup-node actions and Node 22.
- Local migrations include `014` through `017`; keep deployment environments aligned with them.

## Working rule

When an item is completed, remove it from the open sections and record the implementation in the relevant architecture, deployment, or database document. Do not create another roadmap or audit backlog for this repository.
