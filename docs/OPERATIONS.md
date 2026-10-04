# Operations

Jose is the release, monitoring, support, privacy-request and rollback owner. This is the current operator reference; dated receipts and open release gates are in [RELEASE_EVIDENCE.md](./RELEASE_EVIDENCE.md). Private credentials and raw evidence stay under the operator-controlled `.local/` area or approved private backup, never in Git, shell output or app deployment configuration unless the runtime explicitly needs the secret.

## Deployment and configuration

The application runs as one Next.js service on Vercel with Neon Postgres. Apply reviewed files from `neon/migrations` in numeric order using the migration map in `neon/README.md`; do not create a second migration tree or renumber migrations. Pin the exact project, branch and deployment before an operator action. After a deploy, confirm the deployed commit, Ready status, production alias, Quality and Security CI, and natural scheduled-job receipts. Manual dispatch is not evidence of natural schedule delivery.

Runtime environment and operator inputs. Reader notes distinguish `src/lib/env.ts` inputs from Auth.js framework settings, build-upload credentials, direct SDK settings, and operator-only inputs.

| Variable | Use, reader and operator rule |
| --- | --- |
| `DATABASE_URL` | Application Neon connection. Required for data access; never print or commit. |
| `AUTH_SECRET` | Auth.js/signing/encryption key; required in production. `NEXTAUTH_SECRET` is a compatibility fallback. |
| `NEXT_PUBLIC_APP_URL` | Public origin and Google callback source; production is `https://ornigami.com`. It does not set Auth.js's own base URL. |
| `AUTH_URL`, `NEXTAUTH_URL` | Auth.js standard runtime base-origin hints; Auth.js resolves `AUTH_URL ?? NEXTAUTH_URL` before request-origin inference. `src/auth.ts` sets `trustHost: true`; the A16 checker inspects these hints, and `getServerAppUrl()` uses neither. Keep aligned with public origin and `/api/auth`; an empty `AUTH_URL` shadows the alias, so remove unused blank entries. Not validated by `src/lib/env.ts`. |
| `AUTH_TRUST_HOST` | Auth.js standard host-trust input, but current `src/auth.ts` sets `trustHost: true` directly; this variable is not read by app source or validated by `src/lib/env.ts`. Confirm ingress trust before changing the hard-coded setting. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and GBP OAuth. Both callback URIs must be registered: `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` and `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`. |
| `OPENAI_API_KEY` | Reply and Booster text generation. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Billing API and signed webhook. Keep test and live targets distinct; paid checkout acceptance is pending. |
| `STRIPE_PRICE_REPLIES_MONTHLY`, `STRIPE_PRICE_REPLIES_ANNUAL`, `STRIPE_PRICE_BOOSTER_MONTHLY`, `STRIPE_PRICE_BOOSTER_ANNUAL`, `STRIPE_PRICE_COMPLETE_MONTHLY`, `STRIPE_PRICE_COMPLETE_ANNUAL` | Current catalog price IDs. Old `STRIPE_PRICE_STARTER`, `STRIPE_REVIEW_REPLIES_PRICE_ID` and `STRIPE_REVIEW_BOOSTER_PRICE_ID` are not read. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `REPLY_TO_EMAIL` | Mail provider, verified bare sender mailbox, optional reply-to. |
| `RESEND_WEBHOOK_SECRET` | Raw-body Svix secret for `/api/webhooks/resend`. Missing config returns 503. The supported production endpoint is already registered; keep only the seven supported event types and do not create a duplicate. |
| `RESEND_RECONCILIATION_ENABLED` | Default false/unset. Set exactly `true` only after provider lookup, body/tag/key-permission and owner/member UI acceptance. Lookup confirms positive evidence only; it never resends, rekeys, releases quota or unfreezes an uncertain operation. |
| `PRIVACY_ACCOUNT_DELETION_ENABLED` | Keep unset/false. `/api/privacy/delete` returns 503 before account freeze/provider work until the separately approved privacy, retained-evidence, provider and operator acceptance gates close. |
| `CRON_SECRET` | Bearer authentication for cron endpoints. |
| `TOKEN_ENCRYPTION_KEY` | Preferred Google token encryption key; `AUTH_SECRET` fallback. |
| `REVIEW_BOOSTER_UNSUBSCRIBE_SECRET` | Preferred unsubscribe/review-link signing key; auth secrets fallback. |
| `ALLOW_DASHBOARD_WITHOUT_GBP` | Optional development/preview behavior only. |
| `NEXT_PUBLIC_SENTRY_DSN` | Runtime Sentry transport read directly by `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/lib/sentry-client.ts`, and `src/lib/cron-alerts.ts`; not validated by `src/lib/env.ts`. Missing/failed transport is recorded and retried. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Build-time source-map upload settings read by `next.config.ts`; the same allowlisted names are read by `scripts/a17-live-provider-probes.mjs` and `scripts/a12-sentry-delivery-probe.mjs` for explicit Sentry provider probes. They are not runtime SDK inputs or members of `src/lib/env.ts`. Keep the token out of application runtime settings unless a controlled build/probe requires it. |
| `SUPPORT_DATABASE_URL` | Operator-only `SELECT public.feedback` reader read by `scripts/support-inbox.mjs` and the support verifier; it has no `DATABASE_URL` fallback, is not validated by `src/lib/env.ts`, and is not a Vercel application variable. |
| `NODE_ENV` | Standard `development`, `test` or `production`. |

Application integration, price and feature variables in this table are members of the `src/lib/env.ts` schema except the explicitly identified Auth.js framework settings, Sentry DSN/build-upload inputs, operator-only settings, and `PRIVACY_ACCOUNT_DELETION_ENABLED`. The deletion flag is read directly by `/api/privacy/delete`; it is not validated by that schema.

The production Resend endpoint and signing-secret binding are already installed and verified at the recorded production URL; the existing verified `reviews.ornigami.com` sender/reply-to and `https://ornigami.com` origin matched during the October 4 receipt. Do not register a second endpoint or repeat unchanged provider setup. The receipts prove transport/configuration, while isolated public journeys separately prove an application send and ledger correlation on a disposable target.

Keep `.env.local` out of Git. Integration credentials are server-side only. Do not place real values in this document or examples beyond obvious placeholders.

## Support inbox and privacy requests

The production support reader is a separately provisioned, feedback-only credential kept in the established private operator credential store outside Git and outside Vercel application settings. Load it into the process without echoing or printing the value; do not infer or create a new credential path. Run from the canonical repository with dependencies installed:

```powershell
$env:SUPPORT_DATABASE_URL = '<load from the established private operator credential store without echoing it>'
node scripts/support-inbox.mjs --limit 25
```

Keep output in the tool's owner-only private local inbox artifact; it contains submitted feedback. Check the emitted source host/database against the intended target before opening it. Page with `node scripts/support-inbox.mjs --limit 25 --cursor '<nextCursor from private artifact>'`. The credential must not be copied to deployment configuration or another operator; provision separate access as needed. The inbox is read-only, has no acknowledgement/delete path, uses stable `(created_at,id)` keyset paging, a read-only transaction, eight-second SQL and ten-second request timeouts, and returns at most 101 rows per query.

For credential setup, first independently match the approved Neon branch and target; an operator must perform bounded read-only preflight before any role mutation. The wrapper defaults to dry run and validates its exact host/database without connecting:

```powershell
node scripts/a12-support-access-provision.mjs `
  --admin-env '<private admin file outside the repository>' `
  --expected-host '<exact endpoint host from Neon Console>' `
  --expected-database '<exact database from Neon Console>'
```

If the preflight passes and the exact fixed role is absent, `--apply` creates the NOLOGIN role from `scripts/sql/A12_SUPPORT_ACCESS.sql`, checks effective grants, and activates it only after an owner-only credential file is created at a supplied, pre-existing private destination (`--support-env '<private destination>'`). If a previously prepared audited NOLOGIN role exists, `--activate` checks every same invariant before enabling login. Both use PostgreSQL TLS and send the generated password only via `psql` stdin. Never place credentials in command arguments, Git or output; do not repair shared PUBLIC grants. Verify with `scripts/a12-support-access-verify.mjs --expected-host '<host>' --expected-database '<database>' --artifact '<absolute private inbox JSON path>'` using the same private target source. It confirms the exact role/target, `SELECT public.feedback` only, no inherited memberships/other persistent access/mutation/schema/database create/non-system SECURITY DEFINER access, read-only transaction and owner-only artifact ACL. PostgreSQL default TEMP access is recorded as temporary-object access, not persistent table access. Remove temporary admin source only after accepted verification. Child and production credentials are distinct; never substitute one for the other.

Published `privacy@ornigami.com` routing must be verified to Jose's private workflow before onboarding. Aim to acknowledge within one business day. Handle rights requests within one calendar month, or communicate a permitted extension and reasons within that first month. Export remains available. Self-service deletion stays disabled until its separate provider/race/retention gates close; use a documented assisted process that respects deadlines. Do not promise immediate third-party erasure.

## Retention and restoration

These are owner-approved defaults awaiting implementation and verified deployment. They are not claims that a cleanup job already enforces the periods. Valid erasure requests follow the rights process; only specifically documented legal obligations or claims justify a hold. Do not silently purge operational fences, reset trial eligibility or reactivate suppressed recipients.

| Data | Target and handling |
| --- | --- |
| Booster contact/visit and generated-mail content | 90 days after terminal visit/delivery outcome. Exclude pending or unknown operations from automatic purge until resolved. Keep minimum ledger/fence keys separately. |
| Optional raw delivery diagnostics | Avoid unnecessary payloads; any necessary raw diagnostic expires after 30 days. Do not copy bodies/addresses into observability. |
| Normalized delivery events, provider correlation, idempotency/usage evidence | 365 days from terminal outcome, then remove linkable identifiers only after safe replay/fence checks. Late callbacks after disposal must be acknowledged safely with no delivery/quota effect. Aggregate non-identifying counts may remain. |
| Review-link clicks and integration event detail | 90 days from event. Keep only minimum intake dedupe keys for 365 days where needed to prevent replay. Clicks are not review attribution. |
| Permission evidence | While relied on; restricted minimum source/time/notice version and recipient reference for 365 days after last request or withdrawal. A documented legal hold is separate. |
| Unsubscribe/complaint/bounce suppression | Minimum do-not-send evidence while the objection/address remains relevant; restricted to suppression and reviewed at least annually. No arbitrary expiry that resumes mail. Remove only after verified lawful withdrawal/change or end of sending purpose; annual review never resubscribes. |
| Historic trial business/owner eligibility evidence | Keep the minimized anti-abuse criterion needed to enforce one trial per business and billing owner, fail closed on unknown history, and avoid eligibility reset. Restrict access and review necessity at least annually. No fixed expiry or automatic purge is authorized. Handle erasure through a case-specific rights/evidence assessment; do not silently reset eligibility. |
| Resolved deletion/provider-operation identifiers and erasure receipts | 365 days after verified completion; restricted evidence. Receipt does not prove provider financial records were erased. Review unresolved work every 30 days, minimize as resolution permits, and record reason/next review for any continuing hold. |
| Account/workspace configuration | While service is used; 90-day export/recovery window after termination, then erase unless a specific exception applies. A valid erasure request is not subject to a compulsory wait. Keep paid work disabled after termination. |
| Accounting/invoice records | If Spanish commercial retention applies, restricted financial records for six years from the last relevant accounting entry, adjusted to documented obligations. This is not six-year retention of customer lists, OAuth secrets or all Stripe payloads. Confirm seller/jurisdiction and provider terms before paid onboarding. |
| Existing leads/demo, feedback, cron/rate-limit and expired auth records | Existing implemented windows remain: 90 days leads/demo, 365 feedback, 30 cron, 2 rate-limit; expired-token cleanup as implemented. Inventory actual backup/PITR/log retention. The 35-day rolling application-backup target is not a verified vendor configuration. Reapply erasure and suppression on restore. |

Implementation must separate minimized content from durable idempotency/usage/lifecycle keys, establish terminal timestamps and foreign-key effects, and preserve unresolved operations without blind retries. Cleanup is bounded and daily, with private dry-run counts and disposable database validation before activation. No destructive production cleanup or automatic purge is authorized by this document alone.

## Google Business Profile approval and client acceptance

The recorded Cloud project is `Local-Lift`, project ID `local-lift-477812`, number `1002660087913`. Console observations from October 3, 2026: Account Management and Business Information APIs were enabled but each had 0 QPM; Google My Business API was absent. OAuth was External/Production with the two production callbacks and localhost counterparts registered. The `business.manage` scope was then shown non-sensitive and no data-access verification was required for the current scope set. Branding was not verified because the checked Search Console account had no `ornigami.com` property; no eligible client profile was supplied. These are dated observations; recheck before acting. No API access form was submitted.

Before the application, confirm a real profile is verified and active for at least 60 days, the applicant currently manages it and its website is listed. The applicant need not have personally held Manager access for 60 days. With client consent, ask its owner to invite the applicant Google account as **Manager** through Business Profile settings → People and access; the client remains owner. Confirm the accepted invite and eligibility privately. Do not create a synthetic Ornigami profile or store client names, profile IDs, email or screenshots here.

Only after eligibility is confirmed, submit **Application for Basic API Access** using Google's [GBP API contact form](https://support.google.com/business/contact/api_default), selected project `local-lift-477812` and project number `1002660087913`. Do not request a quota increase in place of Basic API Access when quota is zero. After approval, enable the approved Account Management, Business Information and Google My Business APIs in this same project, record exact display names/service IDs, and check each API quota independently; nonzero usable quota is required.

For OAuth branding, verify `ornigami.com` in Search Console under a Google account that is an Owner of the domain and an Owner or Editor on the Cloud project. A delegated Owner qualifies; Full/Restricted access does not. Domain property verification uses DNS. After verification, wait 24 hours and retry branding. Recheck the actual current scope set; publish branding after successful brand verification and complete scope/data-access verification if any current scope requires it. Project API approval, branding and consent publication are separate gates.

The deployed callbacks are `https://ornigami.com/api/auth/callback/google` and `https://ornigami.com/api/google/oauth/callback`. Confirm the intended deployed client and effective `NEXT_PUBLIC_APP_URL`/`AUTH_URL` pairing and verify the runtime `redirect_uri` exactly matches registration. Run the local, network-free shape check with `node scripts/a16-google-readiness.mjs --json --environment production`; its clean result does not establish Console registration, API access, quota, branding, deployment pairing or profile eligibility.

After all project gates pass, obtain separate client permission for a controlled real profile test. Record target and scope privately. Verify production OAuth and encrypted credential storage; account/location discovery and explicit selection; sync one real review; save an exact versioned draft; post only the exact reply the client approved for that review; then verify scheduled processing syncs/drafts without auto-posting and that the derived Booster URL does not overwrite a manual URL. No live profile mutation without specific approval. Isolated mocks, Console screenshots and sign-in alone do not establish provider acceptance.

Official references: [Google prerequisites](https://developers.google.com/my-business/content/prereqs), [owners/managers](https://support.google.com/business/answer/3403100), [usage limits](https://developers.google.com/my-business/content/limits), [basic setup](https://developers.google.com/my-business/content/basic-setup), [OAuth branding verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080), and [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

## Monitoring, health and rollback

The application exposes `GET /api/cron/health` behind `Authorization: Bearer <CRON_SECRET>`. It returns persisted safe summaries and alert status, not cursor contents or raw errors. Current primary schedules are Vercel Pro: Booster `7 * * * *`, Replies `11 */4 * * *`, and privacy `0 3 * * *` (UTC). GitHub Booster/Replies workflows retain manual recovery dispatch only. An independent hourly GitHub health monitor runs at `15 * * * *`. Never enable both Vercel and GitHub as automatic primary schedulers for Booster/Replies. Cron work is cooperatively bounded to 45 seconds, uses fenced checkpoints, bounded provider/SQL operations and local statement timeouts. Expected continuation returns 202; live lease returns 409 with `Retry-After`; actionable work failure returns 500; untrusted health state returns 503. Empty settled sweeps report `no_work`.

For schema cutover, pause/drain both review schedules, verify no live job lease/operation can be disrupted, deploy the reviewed migration, verify the exact Ready target and lifecycle wrapper chain, then restore the Vercel primary schedules. Preserve the privacy schedule. Roll back to a reviewed deployment/configuration; if reverting primary scheduling, remove only the two Vercel Booster/Replies entries and restore their GitHub schedules, never both at once. Retain durable usage, idempotency, leases, suppression and lifecycle evidence; do not drop schema or reset counters to roll back application code.

Pause new intake/enrollment for cross-business access, duplicate sends/quota, suppression/freeze bypass, unhealthy or missing scheduled jobs, or unconfirmed alert transport. On an ambiguous provider outcome, retain the fence and route it for operator review; never retry blindly or release a reservation. Roll back only the reviewed affected control/configuration and preserve unknown-operation evidence. The production Resend webhook is already configured and verified; do not register another endpoint. If rollback is needed, disable only the receipted endpoint and remove its matching production setting before redeploying. For the support reader, verify `NOLOGIN` on the exact target before removing its private credential. A scheduled database-branch expiry is not completed deletion; verify its final state after the deadline.

Review operational/performance results daily in rollout week one and weekly afterward. Investigate route p95 over three seconds on two adequately sampled consecutive windows; hold expansion until corrected. Stop for unhealthy schedules or missing alert transport. Keep natural schedule receipts separate from manual recovery dispatches.

## Operator performance targets

The existing four-page owner navigation and twelve authenticated HTTP samples are preliminary only. They are not browser CWV or representative-volume acceptance. Before first live Booster enrollment, close permission/notice/support routing, retention implementation and ten-session isolated production-build read-load acceptance; close narrow Stripe test-mode acceptance before paid conversion. Before collecting recipient data, implement permission enforcement and its notice. Before expansion, collect at least 30 authenticated read-only samples per route from a recorded location/network; report cold/warm, failures, median and p95. Target per-route median <=2 seconds and p95 <=3 seconds. Ten concurrent authenticated read sessions target p95 <=3 seconds with no unexpected 5xx/timeouts, using business-scoped synthetic data in an isolated target. No production load test or copied customer data.

Browser quality targets are LCP <=2.5 seconds, INP <=200 ms and CLS <=0.1 at field p75, reported separately for mobile/desktop. Obtain lab/mobile evidence before scale and field confirmation when enough real visits exist. Do not describe CLI timings or Lighthouse as field p75. Internal availability goal is 99.5% per calendar month, with request/monitor denominators; it is not an SLA or existing pass. Do not add hidden daily caps or reduce the 500-request Booster allowance to meet processing bounds.

The selected web-quality thresholds follow Google's [Core Web Vitals guidance](https://web.dev/articles/defining-core-web-vitals-thresholds). Rights-request timing and minimization defaults follow the [EDPB small-business rights guide](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en) and [data-protection principles](https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en). Spanish accounting retention must be confirmed for the actual seller/jurisdiction against [Commercial Code article 30](https://www.boe.es/buscar/act.php?id=BOE-A-1885-6627#art30).
