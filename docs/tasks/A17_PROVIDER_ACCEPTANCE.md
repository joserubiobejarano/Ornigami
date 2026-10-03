# A17 controlled provider acceptance

This package supplies three distinct evidence lanes. The read-only application harness checks owner/member workspace behavior against a local isolated app and database. The Resend probe sends one explicitly authorized message to one allowlisted mailbox, using the production payload/transport code. The Sentry probe only reads the configured project. A direct provider response never marks the cross-workflow application lane or overall acceptance as passed.

## Read-only application lane

Run on Node 22 from a clean checkout against a disposable local app and database. The harness only accepts `http://localhost`, `127.0.0.1`, or `[::1]`, refuses redirects, caps each response at 1 MB and 8 seconds, and never prints response bodies or cookies. It checks owner and member access to Review Booster settings, owner-only settings management, correct business scope, and absence of credential-shaped fields. When a selected Google location is available, it additionally checks that the member sees only that selected location and both actors read the same nonempty review ID set. Without a selected location, Booster workspace checks can pass and Replies checks are explicitly blocked. These reads do not make a Google API request.

The `DATABASE_URL` plus `A17_ISOLATED_DATABASE` pair is only an operator-supplied precondition; the harness cannot prove which database the app server is using. The app's Neon serverless driver also does not use a plain local PostgreSQL listener by default. A controlled local target needs a Neon-compatible proxy or the repository's authorized database test adapter configured for the app server. Do not present the environment sentinel alone as database identity evidence.

Default invocation prints a blocked plan and exits 2. Execution additionally requires an exact local commit pin, clean working tree, local `a17_*` database name and sentinel, named target `isolated-local`, owner and member Auth.js cookie headers, business UUID, and canonical selected-location resource name. The local server must have been started from the same clean checkout and pointed at that disposable database. Example PowerShell setup:

```powershell
$env:A17_TARGET_NAME = 'isolated-local'
$env:A17_BASE_URL = 'http://127.0.0.1:3000'
$env:A17_EXPECTED_COMMIT = (git rev-parse HEAD)
$env:DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/a17_acceptance'
$env:A17_ISOLATED_DATABASE = 'a17_acceptance'
$env:A17_OWNER_COOKIE = 'authjs.session-token=<owner-session-cookie>'
$env:A17_MEMBER_COOKIE = 'authjs.session-token=<member-session-cookie>'
$env:A17_BUSINESS_ID = '<isolated-business-uuid>'
$env:A17_LOCATION_NAME = 'accounts/<account-id>/locations/<location-id>'
$env:A17_CONFIRM_READ_ONLY = 'I_AUTHORIZE_READ_ONLY_LOCAL_CHECKS'
node scripts/a17-provider-acceptance.mjs --execute
```

The cookie values must be complete local Auth.js session-cookie headers using the same `authjs.session-token` or `__Secure-authjs.session-token` name. Keep them in process environment only; do not put them in evidence files, shell history, source control, or logs. Omit `A17_LOCATION_NAME` when no controlled Google selection exists. This command exits 2 even when its application subchecks pass, because provider and release gates remain outstanding. Redacted JSON contains only commit, named target, check IDs/counts and blocked gates. Set `A17_EVIDENCE_FILE` to a new `.json` path when a durable copy is needed.

## Resend and Sentry probes

Each probe reads only its allowlisted keys from the explicit env file argument. `DATABASE_URL` and all unrelated keys are discarded, and process environment secrets are not merged. The Resend domain check performs bounded, paginated `GET /domains` requests only and reports the configured sender domain plus its provider status. The one-message command calls the production `prepareResendPayload` and `sendPreparedWithResend` functions. It accepts only the four named internal addresses in the script, defaults to `joserubiobejarano@gmail.com`, requires a caller UUID and an explicit confirmation argument, validates recipient/sender/tag scope before sending, persists the immutable payload and hash under `.next/a17-provider-evidence`, and uses one idempotency key. It makes one attempt; any existing attempt is terminal for this tool, including `unknown`, so it never retries after an ambiguous result. Provider acceptance is recorded separately from recipient delivery. Resend retains idempotency keys for 24 hours; the tool stops at 23 hours for any prepared record. See [Resend send API](https://resend.com/docs/api-reference/emails/send-email) and [Resend idempotency guidance](https://resend.com/docs/dashboard/emails/idempotency-keys).

```powershell
node scripts/a17-live-provider-probes.mjs --resend-domain-check .env.local
node scripts/a17-live-provider-probes.mjs --sentry-check .env.local https://eu.sentry.io
```

The Resend send command is intentionally separate and mutating. It is not a normal test or CI step:

```powershell
node scripts/a17-live-provider-probes.mjs --send-resend-test .env.local <new-run-uuid> joserubiobejarano@gmail.com --confirm-authorized-test-send
```

Do not run it for either recorded run or after an unknown result. The existing Resend authorization is restricted to the named mailboxes; a later attempt requires a new run ID and coordination with the release owner. For the corrected attempt below, the A17 coordinator loaded only the allowlisted Resend values from the explicit source, then overrode `env.EMAIL_FROM` in memory with `noreply@reviews.ornigami.com` before calling the exported `runControlledResend` helper. The shared `.env` and deployment configuration were not changed. Sentry uses only `GET /api/0/projects/{org}/{project}/`, refuses redirects, bounds response size/time, and verifies exact organization/project slugs. It proves project read access only; no event is submitted. See [Sentry retrieve project](https://docs.sentry.io/api/projects/retrieve-a-project/).

## Current controlled evidence

Evidence recorded in the coordinating A17 acceptance session on 2026-10-03:

| Check | Result | What it establishes |
| --- | --- | --- |
| Sentry project API read | HTTP 200; project `sentry-pink-lantern`, organization `j-projects-wa` matched | The configured Sentry token can read that exact project. No Sentry event was sent, so event capture/routing remains unverified. |
| Resend sender-domain inventory | Complete inventory: `reviews.ornigami.com`, `verified`, sending `enabled`, receiving `disabled`; one domain across one page | This account has one verified sending domain. The canonical `EMAIL_FROM` value still uses `kruno.app`, which is absent from the inventory. |
| Resend initial controlled send | Run `cf37bcaa-6916-4cf2-868c-dcb7fe8abaf2` to `joserubiobejarano@gmail.com`; HTTP 403, classified `definite_rejection` | No provider acceptance or delivery is claimed. This attempt is terminal and was not repeated. Script fingerprint at attempt time: `8049fcbeb6ce0a6ca5dd0df8ea30ddcf0d82708ec8506551425cd4eca0335864` (not a receipt hash). |
| Resend corrected controlled send | Run `aedf05f5-6289-486c-a569-a122c2e952cf`; provider accepted message `01a101e9-6ce6-7264-97bf-cdef2bf4e0f2` to `joserubiobejarano@gmail.com` from `noreply@reviews.ornigami.com`; payload SHA-256 `3fbb4b11dd77ce07fa4f790e89d7a326d81152d9e38d4ddb81c967e557e3c4cf` | A bounded, redirect-refusing `GET /emails/{id}` returned HTTP 200 and matched the sole recipient and sender. Resend reported `last_event: delivered`, observed `2026-10-03T13:18:04.401Z`. This proves the controlled production-service payload/transport and provider delivery for this isolated attempt only. It does not prove the application route, delivery ledger, webhook reconciliation, suppression, or production deployment configuration. |
| Stripe | Skipped at the user's request | The configured canonical secret was identified as a live-mode key; no Stripe calls were made and no past test-mode pass is inferred. |
| Google Business Profile | Blocked | No controlled Business Profile exists. No Google account or provider call is used by this harness. |
| Cross-workflow provider acceptance | Blocked | Read-only local owner/member probes and the direct Resend send do not cover application send routes, the delivery ledger, webhook reconciliation, suppression, draft/post flows, billing lifecycle, cron, CSP, or end-to-end release acceptance. |

Before release, the release owner must verify and align the canonical target environment's `EMAIL_FROM` with an approved verified/sending-enabled sender domain and an authorized mailbox format. The in-memory override used above establishes the controlled test only; it does not establish that Vercel's production environment contains the same sender configuration. No shared sender value or DNS was changed as part of this acceptance work.

Do not include env files, tokens, session cookies, provider payload bodies, reviewer/customer content, or provider error bodies in evidence. The Resend state file is local ignored evidence and contains the frozen test payload for audit; do not attach it raw to a report. The sanitized receipt above is the shareable record.

## Focused tests

```powershell
node --experimental-strip-types --test tests/a17-provider-acceptance.test.mts tests/a17-live-provider-probes.test.mts
```

The tests mock all HTTP. They cover fail-closed targeting, workspace role and selected-location assertions, credential redaction, bounded pagination and response behavior, allowlisted recipient/payload/idempotency checks, terminal ambiguous outcomes, Sentry project identity, and that direct probes cannot mark overall acceptance complete. They do not establish a live provider result.
