# A10 endpoint configuration and HTTP acceptance

Status: local synthetic HTTP ingress acceptance passed on the isolated A20 fixture. Resend endpoint creation, target-secret installation, public provider ingress, and controlled email delivery remain pending. This task does not change the shared roadmap, shared deployment configuration, or production, and it does not deploy.

Base: `0cad6cd` in branch `task/a10-resend-endpoint-acceptance`, isolated worktree; evidence collected 2026-10-04. This document supplements [A10 signing acceptance](./A10_RESEND_SIGNING_ACCEPTANCE.md); it does not replace its local signature/PostgreSQL evidence or its provider acceptance contract.

## Current boundary

The existing route is `POST /api/webhooks/resend`. It reads `RESEND_WEBHOOK_SECRET` at request time and verifies the exact raw body, timestamp, and signature before applying delivery events. `RESEND_API_KEY` is a separate provider API credential. The A10 handoff requires an HTTPS endpoint on the isolated candidate host with exactly seven events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`.

The current task context identifies no isolated public app host, target environment, disposable public database, Resend account/team, API key, or verified sender domain. The canonical deployment is production, which is out of scope. A20's app fixture binds to loopback and guards outbound provider requests, so Resend cannot deliver a public webhook to it. Do not infer that any production credential, database, or host is an isolated target.

The HTTP fixture depends on the existing A20 app/Neon bridge and the canonical migration chain through 038, including A10 migration 025. The A10 work here adds test-owned scripts/tests and this handoff only; it adds no application route, model, setting, runtime dependency, migration, deployment setting, or shared roadmap edit.

Accordingly, endpoint creation and live delivery are blocked on an explicitly identified isolated target and its credentials. The provisioning tool's `--isolated-target` switch records an operator attestation; it does not independently prove that the URL or Resend account belongs to an isolated environment. Its successful output means Resend returned an endpoint and the generated secret was saved locally. It explicitly reports `targetSecretInstalled: false`. The signing secret still needs to be installed into the isolated candidate's secret store, and the target must be confirmed to read it. This work has not changed a target secret store or made a Resend API request.

## Local HTTP acceptance

`scripts/a10-http-webhook-acceptance.mjs` makes a private copy of the A20 fixture adapter under ignored `.a20-fixture/`. It checks that the A20 root declaration, core import, and placeholder webhook secret each occur exactly once, then substitutes only those fragments in the copy. The fixture's canonical source stays untouched. The local app build uses a generated synthetic `whsec_` key; the test signs raw HTTP requests and calls the actual Next.js route over loopback. The existing A20 PostgreSQL bridge and guarded fixture lifecycle provide the database and cleanup.

The receipt is limited to synthetic local behavior: reject a changed body, stale timestamp, and invalid signature without writes; accept all seven event types through actual app HTTP ingress; prove identical event-ID replay is acknowledged once, conflicting content under an event ID fails closed, and an older delayed event does not downgrade delivered state; then prove a bounce suppression blocks a subsequent send admission in a second disposable business while reserved quota remains consumed. A20's outbound guard must be clear. These steps seed synthetic delivery rows and submit synthetic webhook events; they do not call Resend, send an email, verify a public webhook attempt, or prove owned-mailbox receipt.

Run from the worktree root after dependencies and PostgreSQL 17 are available, with none of the standard Next.js runtime env files (`.env`, `.env.local`, `.env.production`, `.env.production.local`, `.env.development`, `.env.development.local`) and no pre-existing `.a20-fixture`. The separate ignored `.env.a10-resend-endpoint/` directory is tool state; the HTTP fixture does not load it as an app env file.

```powershell
node scripts/a10-http-webhook-acceptance.mjs
```

On Windows, set `A20_PG_BIN` to the PostgreSQL 17 binary directory when it is not installed at `C:/Program Files/PostgreSQL/17/bin`; the fixture lifecycle and acceptance runner must use the same PostgreSQL installation. The runner uses an allowlisted child environment and starts only loopback app/database listeners. It automatically stops and removes a verified fixture. If shutdown or identity checks fail, it preserves the fixture for inspection; do not remove it manually until its process and PostgreSQL identities are understood.

The acceptance test for the adapter's exact-fragment/source-drift behavior is:

```powershell
node --experimental-strip-types --test tests/a10-http-webhook-adapter.test.mts
```

The existing A10 synthetic signature and database tests remain separate evidence lanes:

```powershell
node --experimental-strip-types --test tests/a10-webhook-signatures.test.mts tests/a10-webhook-route.test.mts tests/a10-reconciliation.test.mts
node --experimental-strip-types --test tests/a10-delivery-postgres.test.mts
node --experimental-strip-types --test tests/a10-controlled-webhook-acceptance.test.mts
```

## Resend endpoint provisioning tool

`scripts/a10-resend-endpoint.mjs` defaults to a dry-run report and makes no provider request:

```powershell
node scripts/a10-resend-endpoint.mjs
node scripts/a10-resend-endpoint.mjs --endpoint https://<isolated-host>/api/webhooks/resend
```

The explicit create form is:

```powershell
node scripts/a10-resend-endpoint.mjs --create --endpoint https://<isolated-host>/api/webhooks/resend --isolated-target
```

Only use that create form after confirming the isolated candidate host, app environment, disposable database, Resend account/team, and verified sender domain. Inject `A10_RESEND_API_KEY` into the process environment through an approved secret mechanism; do not type the literal key into a shell command or place it in shell history. The key is not written to the tool's state files. The tool requires HTTPS and the exact root route `/api/webhooks/resend`; it blocks Ornigami production hosts, localhost/private names, and all IP-literal hosts. A non-production `*.vercel.app` host is allowed, but the operator must verify it is the intended isolated deployment. The tool creates only the seven A10 webhook subscriptions.

Before the provider request, the tool writes an attempt record beneath ignored `.env.a10-resend-endpoint/`. On success it writes the endpoint ID/event list to `attempt.json` and the endpoint's generated key to `webhook-secret.env`, which contains `RESEND_WEBHOOK_SECRET=...`. The secret file is local sensitive material: do not print, commit, attach, or include its value in a receipt. Install it separately into the isolated candidate's secret store using an authorized method that does not deploy or modify shared configuration. Confirm effective target configuration without revealing the value.

The create operation deliberately refuses a second attempt when an attempt or secret file already exists. A timeout, malformed response, process crash, or failure after creation can leave an unknown or partially recorded result. Inspect the Resend account and local attempt record manually before taking any further action; never rerun create to resolve uncertainty because that could create a duplicate endpoint. The tool has no automatic delete or recovery operation. If an endpoint was created but cannot be activated safely, use the Resend dashboard to disable or delete that exact isolated endpoint after confirming its ID.

## Remaining provider acceptance

After an isolated target and credentials are supplied, the integration owner can complete these steps without changing production or shared deployment configuration:

1. Create the endpoint using the exact seven event types, record its non-secret endpoint ID, and install its returned signing secret into the isolated candidate environment. Keep `RESEND_RECONCILIATION_ENABLED=false`; it is not needed for webhook ingress.
2. Confirm the isolated app receives `RESEND_WEBHOOK_SECRET` without printing it. Verify the candidate database identity and required A10 migration before testing.
3. Trigger a bounded Booster send only from the controlled path to a Resend documented test recipient, after confirming the sender domain and disposable business/visit data. These remain actual Resend send operations. Do not use a customer recipient or retry an uncertain send.
4. Correlate the Resend webhook attempt and 2xx response with the application delivery ledger. Record the `svix-id`, provider message ID, redacted target label, and UTC time. Confirm delivered/bounce outcomes, exact-ID replay behavior, cross-business suppression, and retained quota. A provider replay with a new event ID is not duplicate-ID proof; keep the synthetic identical-ID replay evidence separate.
5. Use an explicitly owned test mailbox only if transport/inbox placement must be established. `email.delivered` confirms recipient mail-server acceptance, not inbox placement or human viewing.
6. Record cleanup of the disposable business/data, endpoint disposition, and any retained evidence. Keep unresolved retention, mail-category suppression, and operator-access policy decisions open.

If an environment secret update would trigger an app deployment, stop before the update: deployment is excluded from this task. No shared or production secret/config edit is an acceptable substitute. If the isolated host, credentials, or non-deploying secret-install path remains unavailable, leave provider rows pending and report that limitation.

## Evidence receipt

Replace pending fields only with evidence from the relevant lane. Never promote local synthetic HTTP proof to public provider ingress or controlled delivery.

| Field | Result |
| --- | --- |
| Application base commit and Next build hash | `0cad6cdb9c59751d7b8dda47fb1a5fdd0a126e92` / `faecc0f585b3e9a1e21025a813ec4009ab1e588db82f1f8ee9a9994c398522d7` |
| App build ID and A20 fixture source SHA-256 | `su1GLCfWUgiUtVgRsgJoJ` / `65145e2dbe72eb48040f25a9be2936723a5084ebd70196ef9b7919e45809d655` |
| Acceptance harness and endpoint tool SHA-256 | `e0bfda60021abd9c707971f6f62cd7332b874c53c7780103c9f93a8fe3501e4f` / `337a2a70fea28546661534d0261f7edb6949a78b71c435a275f5784a2197673d` |
| Local app HTTP route status | Passed: `GET /api/webhooks/resend` returned 405 |
| Invalid signature/timestamp/body rejection | Passed: all 3 rejected; event count stayed unchanged |
| Seven synthetic event outcomes and event count | Passed: 7 supported event types persisted with expected statuses |
| Same-ID replay/conflicting payload/out-of-order result | Passed: duplicate acknowledged, conflicting event ID returned 503, older delayed event retained delivered state |
| Cross-business suppression/send-admission result | Passed: suppression-specific reason persisted and second business admission fenced as non-sendable |
| Reserved quota before/after events | Passed: 7 before and 7 after |
| A20 outbound guard and fixture cleanup | Passed: no blocked outbound attempts; fixture removed and no fixture processes remained |
| Resend account/team, isolated host, and disposable DB | Pending; no target specified |
| Endpoint ID and exact event set | Pending; no endpoint created |
| Secret stored in candidate environment | Pending; local tool output alone does not satisfy this |
| Provider webhook ingress and 2xx correlation | Pending; no provider request |
| Controlled app send and provider outcome | Pending; no email sent |
| Owned inbox receipt | Pending |
| Cleanup and unresolved policy choices | Local fixture cleanup passed; live endpoint cleanup and A10 retention/category/operator decisions remain pending |

Do not include secret values, API keys, raw webhook payloads, real recipient addresses, credentials, cookies, or full environment dumps in the receipt.

## Checks recorded during implementation

The root integration run reports a clean `npm ci` with 654 locked packages on Node 24.11.1/npm 11.6.2/PostgreSQL 17.9. The existing focused A10 suites passed 25/25; the new endpoint/adapter suites passed 11/11, and endpoint-tool ESLint passed. The full A20-backed HTTP acceptance has passed with the receipt values above. The first HTTP attempt had a fixture review-URL mismatch that caused eligibility to reject before reaching the suppression check; the seed was corrected to the fixture's canonical URL and the complete rerun passed. Repository checks then passed: `npm test` 493/493 with zero failures/skips in 71.18 seconds, `npm run typegen`, and `npx tsc --noEmit`. `npm run lint` had zero errors and four pre-existing warnings: Booster settings and three Replies settings/navigation warnings involving `window.location`. The A10 changes add no runtime dependency and change no shared application route, model, or environment setting. The task commit is reported in the final chat handoff; the HTTP build above used the recorded application base.

No shared A20 fixture change is needed for this acceptance. If the HTTP harness is retained for repeated use, A20's fixture owner could add an explicit opt-in, fixture-only runtime secret hook and source/build receipt interface. The current harness has to copy the A20 adapter and apply exact-count-checked root/import/secret substitutions because that fixture hardcodes its local invalid secret. A first-class validated hook would remove that source-string coupling while keeping the candidate app and deployment configuration untouched; it is a future maintenance option, not a blocker or requirement for this task.
