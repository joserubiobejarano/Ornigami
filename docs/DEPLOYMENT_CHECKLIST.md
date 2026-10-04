# Deployment Checklist

This is the single deployment and operator document for the Vercel + Neon application.

This is a reusable checklist, not a fresh backlog. Dated acceptance and remaining release gates are in [the roadmap](./ROADMAP.md), [public release journeys](./tasks/A00_PUBLIC_RELEASE_JOURNEYS_2026-10-04.md) and [remaining launch follow-ups](./tasks/A00_REMAINING_LAUNCH_FOLLOWUPS.md). Consume their receipts for the same unchanged scope; repeat checks only for changed targets/behavior or a reproducible failed criterion. Stripe acceptance remains skipped, Google remains externally gated and production deletion/manual provider reconciliation remain disabled.

## At a glance

- Hosting: Vercel
- Database: Neon Postgres
- Auth: Auth.js
- Integrations: Google Business Profile, OpenAI, Stripe, Resend, Sentry
- Scheduled jobs: Vercel Pro calls Review Booster at `7 * * * *`, Review Replies at `11 */4 * * *` and privacy at `0 3 * * *` (UTC). GitHub runs the independent hourly health monitor at `15 * * * *`; application-job workflows retain deliberate manual recovery only.
- There is no separate worker service.

## 1. Accounts and prerequisites

- [ ] GitHub repository is connected to the Vercel project.
- [ ] Neon database is provisioned.
- [ ] Google OAuth credentials exist in the project used by `GOOGLE_CLIENT_ID`.
- [ ] A real eligible client Business Profile is available and the applicant Google account has Manager access. Ornigami is online-only and must not create a profile solely for API access.
- [ ] Google Business Profile API Basic Access is approved for project `local-lift-477812` / project number `1002660087913`; the current `0 QPM` state is recorded in `docs/GOOGLE_BUSINESS_PROFILE_RUNBOOK.md`.
- [ ] Google My Business API is visible and enabled for reviews/replies after approval.
- [ ] OAuth branding and domain verification warnings are cleared as required.
- [ ] Stripe products and six monthly/annual price IDs are created.
- [ ] Resend sending domain/mailbox is verified.
- [ ] OpenAI API access is available.
- [ ] Sentry project and auth values are configured if production error monitoring is expected.

## 2. Vercel configuration

- [ ] Framework preset is Next.js.
- [ ] Root directory is the Ornigami Git repository root (`.`); locally this is `Ornigami-Agents`, with `package.json`, `src`, and `.git` directly inside it. Do not configure the removed `Agent-LocalLift` subdirectory or deploy `migration-sources`.
- [ ] Build command is `npm run build`.
- [ ] Install command is `npm install`.
- [ ] Node.js version is compatible with Next.js 16.
- [ ] Production `NEXT_PUBLIC_APP_URL` is exactly `https://ornigami.com`; the build rejects another Vercel production URL.

## 3. Environment variables

Configure the variables in [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). The production feature set normally includes:

- [ ] `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
- [ ] `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_PRICE_REPLIES_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`
- [ ] `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_BOOSTER_ANNUAL`
- [ ] `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_COMPLETE_ANNUAL`
- [ ] `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- [ ] `TOKEN_ENCRYPTION_KEY` or an intentionally managed `AUTH_SECRET` fallback
- [ ] `REPLY_TO_EMAIL` and `REVIEW_BOOSTER_UNSUBSCRIBE_SECRET` if used
- [ ] `NEXT_PUBLIC_SENTRY_DSN` for runtime capture; `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` for applicable build upload/provider inspection
- [ ] `RESEND_WEBHOOK_SECRET` from the registered delivery endpoint; `RESEND_RECONCILIATION_ENABLED` remains false/unset until controlled lookup acceptance

## 4. Database migrations

Apply all migrations in order, including the current tail:

- [ ] `001_initial.sql` through `013_review_business_tenancy.sql`
- [ ] `014_security_hardening.sql`
- [ ] `015_stripe_usage_periods.sql`
- [ ] `016_remove_legacy_plan_taxonomy.sql`
- [ ] `017_team_invitations.sql`
- [ ] Canonical remaining files: `019` billing, `020` recovery, `021` invitations, `022` Booster quotas, `023` booking, `024` drafts, `025` delivery feedback, `026` lifecycle, `027` cron, `028` dashboard indexes, and `031`–`038` selection/bootstrap/lifecycle guards. Use exact filenames in [migration map](../neon/README.md). 018 is unused; 029–030 remain reserved. Existing JWTs without `authVersion` require fresh sign-in.
- [ ] Before incremental 025: verify no duplicate provider IDs; after applying it to an existing 036 schema verify the lifecycle wrapper still calls `begin_booster_delivery_send_a06` and its inner body checks global suppression. Inspect target volume before ordinary 028 index creation. Fresh numeric and incremental orders need isolated PostgreSQL checks.

Do not mark these permanently complete in a reusable checklist; verify the target environment each time.

## 5. Google OAuth and Business Profile readiness

Google Cloud Console must contain both authorized redirect URIs:

- [ ] `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` for Google sign-in.
- [ ] `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback` for Business Profile connection.

Before onboarding real Review Replies customers:

- [ ] Applicant currently manages a profile that has been verified and active for at least 60 days, with its business website listed. A16 reports no qualifying profile supplied; keep profile-dependent submission/live checks blocked until access and consent are available.
- [ ] Submit **Application for Basic API Access** through the [GBP API Support form](https://support.google.com/business/contact/api_default), using project number `1002660087913`.
- [ ] Retain Google’s approval email or confirmation and record the approval date.
- [ ] Confirm the `business.manage` scope is approved for the OAuth app.
- [ ] Confirm My Business Account Management API and My Business Business Information API quotas are non-zero; `0 QPM` means the project is not approved.
- [ ] Confirm the Google My Business API used by the review sync/reply routes is enabled and has usable quota.
- [ ] Confirm the consent screen is published and verification is complete if Google requires it.
- [ ] Resolve the A16-recorded `ornigami.com` branding ownership issue using a verified/delegated Search Console Owner associated with this Cloud project as Owner/Editor; follow the recorded 24-hour wait before retrying. Full/Restricted Search Console users are insufficient. Recheck dated Console evidence before action.
- [ ] Run `node scripts/a16-google-readiness.mjs --json --environment production` with values from the intended secret source. A local pass never closes API approval, quota, registration, branding or profile gates; see [A16 handoff](./tasks/A16_GOOGLE_LAUNCH_HANDOFF.md).
- [ ] Client authorizes Ornigami through OAuth and has access to the specific profile being tested.
- [ ] Sync a location, sync a review, save a draft, and post one controlled reply.
- [ ] Confirm Review Replies scheduled processing syncs/drafts, preserves human edits and does not post automatically under the current contract.

Review Booster can operate with email and a manually entered review URL while this external dependency remains unresolved.

## 6. Stripe and email

- [ ] Configure `/api/stripe/webhook` and subscribe it to the lifecycle events handled by the app.
- [ ] Test checkout for Review Replies, Review Booster, and Complete in Stripe test mode.
- [ ] Test plan changes, duplicate webhook replay, trial behavior, and payment failure state updates.
- [ ] Verify the Resend sending mailbox/domain.
- [ ] Keep `EMAIL_FROM` as a bare mailbox address, for example `noreply@yourdomain.com`.
- [ ] Register `/api/webhooks/resend` for supported sent/delivered/delayed/bounced/complained/failed/suppressed events. Configure signing secret privately, verify an owned test delivery end to end, and confirm signed replay/out-of-order feedback and suppression without resending uncertain requests.
- [ ] Verify permanent endpoint/secret configuration and isolated ingress acceptance from [production activation](./tasks/A00_PRODUCTION_ACTIVATION_2026-10-04.md) and [public journeys](./tasks/A00_PUBLIC_RELEASE_JOURNEYS_2026-10-04.md). October 4 activation supersedes the historical wave 7 zero-endpoint inventory; do not register another endpoint or repeat app mail/link acceptance for the unchanged release. Preserve the distinction between production transport and disposable application-ledger evidence.
- [ ] Controlled Resend GET must return exact frozen body/tag/recipient binding and use an authorized retrieval key in the original sending account before manual reconciliation activation. 202/unresolved retains quota. A lookup miss never authorizes replay.
- [ ] Approve global suppression/event/correlation retention and other mail-category policy; preserve do-not-send evidence through workspace cleanup. Customer-specific sender domains remain future work.

## 7. Scheduled jobs

- [ ] Confirm GitHub Actions secrets `APP_BASE_URL` and `CRON_SECRET`.
- [ ] Verify the exact Ready production deployment has all three Vercel schedules enabled, matching `vercel.json`; GitHub Booster/Replies automatic schedules must be absent. Do not intentionally run both primary schedulers.
- [ ] Observe a naturally scheduled Review Booster run and persisted success/no_work for eligible active/trialing businesses; correlate caller/deployment and result. A manual recovery is a separate receipt.
- [ ] Observe a naturally scheduled Review Replies run and persisted success/no_work. An empty eligible set proves the schedule, not real Google sync/post acceptance.
- [ ] Confirm `/api/cron/health` shows persisted `cron_runs` records.
- [ ] Verify the existing Vercel privacy schedule at 03:00 UTC daily, bounded cleanup and sanitized per-table health.
- [ ] Consume the completed [October 4 privacy checkpoint observation](./tasks/A17_OCT04_PRIVACY_CHECKPOINT.md) for this unchanged scope. Subsequent routine cadence observations are separate; do not manually invoke cleanup or health evaluation to re-prove the completed checkpoint.
- [ ] Verify actual route/global boundary capture and downstream Sentry notification recipients. Controlled ingest/readback and offline SDK acknowledgement tests do not prove operator notification delivery.
- [ ] Provision/verify the support operator's `SUPPORT_DATABASE_URL`, `SELECT public.feedback` permission, target identity and private artifact access. Follow the bounded [support workflow](./tasks/A12_SUPPORT_VISIBILITY.md).
- [ ] Verify authenticated browser nonce/CSP behavior, Stripe form redirects and trusted ingress headers; collect Trusted Types reports before considering enforcement. A19's local smoke is not provider acceptance.
- [ ] Verify independent hourly GitHub cron health monitoring and Sentry transport/missed-schedule alert recovery. Expected budget continuation is 202, lease busy is 409, actionable failure is 500/503; do not interpret all non-200 outcomes as the same failure.
- [ ] Require a fresh scheduled health receipt after rollout. HTTP 200 alone is insufficient; the allowlisted diagnostic summary must be healthy. Preserve delayed/missing scheduler observations; neither manual dispatch nor a read-only healthy database snapshot is a scheduled-monitor pass.
- [ ] Apply missing reviewed schema before consumers, including 025/028 in wave 5; pause/drain both review schedules through migration/deployment and restore after exact Ready verification.

## 8. Pre-deploy verification

Run from the repository root:

```bash
npm ci
npm run lint
npm run typegen
npx tsc --noEmit
npm test
npm run security:audit
npm run test:security
npm run build
```

## 9. Post-deploy smoke test

- [ ] Homepage, pricing, login, signup, legal, and demos load.
- [ ] Email verification works for credentials signup.
- [ ] Dashboard and billing load.
- [ ] Review Booster settings, manual visit entry, CSV upload, run-now, unsubscribe, and tracked review-link redirect work.
- [ ] Review Replies Google connection and controlled sync/post flow work, if Google approval is complete.
- [ ] Team invitation works on Complete.
- [ ] Privacy export works for owner/member test accounts with secret-free projections. Keep production deletion disabled until E03 retention/provider/operator gates are complete; destructive acceptance needs an explicitly authorized isolated target.
- [ ] Stripe webhook updates plan and agent state.
- [ ] Sentry receives a controlled test error, then the test is removed or clearly identified.

## Current caveats

- Acceptance has separate evidence labels: isolated tests, authenticated browser, provider test mode, production smoke, external approval. Exact Linux CI and public anonymous smoke do not establish paid owner/member browser or full provider acceptance. See [A17 matrix](./tasks/A17_ACCEPTANCE_MATRIX.md).
- Historical wave 5 reads found no webhook secret. October 4 production activation subsequently installed the permanent signed endpoint and correlated a direct-provider operator self-mail with actual sent/delivered callbacks. Bounded public journeys separately correlated an actual application send, signed feedback, quota, public CTAs and suppression on a disposable deployment. These later receipts supersede the old configuration gap without claiming a production/customer application fixture.

- Google Business Profile API access/quota, a real client profile, and OAuth branding/publication are external dependencies, not code tasks. Follow `GOOGLE_BUSINESS_PROFILE_RUNBOOK.md` for the current state and sequence.
- Review Booster has a bounded per-run cap and plan allowance, but higher-volume delivery is still serial.
- Public Local SEO/free-audit pages and the legacy project API remain available, although they are not the product center.
