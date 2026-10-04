# A10 live Resend acceptance handoff

Status: **live acceptance pending**. This worktree contains no verified public preview target, synthetic database identity, Resend account/team, sender, controlled recipient, or authorized non-deploying secret-install path. No Resend endpoint was created, no secret was installed, no message was sent, and no deployment or shared configuration was changed.

Worktree: `task/a10-live-resend-acceptance`, based on `5a80b8de1474794669d1a3c886a77f32ae22ba6e`. The task is to complete live acceptance within the no-deploy/no-shared-config boundary; this document is the task-specific evidence deliverable. `docs/ROADMAP.md` is reference material only and is not changed here.

## Acceptance target

The requested live proof requires one explicitly isolated public application preview using a disposable synthetic/schema-only database, an identified Resend account/team and verified sender, and an explicitly controlled recipient. Create one unique synthetic business and eligible visit, then trigger a bounded send through the authenticated `POST /api/review-booster/run-now` application path on the preview. Resend must send its signed webhook to `POST /api/webhooks/resend` on that preview, and the application must persist and correlate the event. A direct provider send that bypasses the application does not prove application acceptance. The prior local synthetic acceptance remains its own evidence lane; it cannot establish public provider ingress or real transport.

Wave 10 recorded a production Resend inventory at `2026-10-04T12:26:37.088Z`: HTTP 200, zero endpoints, and no signing secret. This is historical evidence, not a fresh inventory. Production is outside this task's permitted target scope and is not a substitute for an isolated preview.

## Evidence lanes

These labels follow the A17 acceptance matrix. Do not combine one lane's result with another.

| Evidence label | Result |
| --- | --- |
| isolated tests | Provisioner tests passed 11/11, zero failures/skips, using Node v24.11.1 (`node --experimental-strip-types --test tests/a10-resend-endpoint.test.mts`; runner 1.903s, wall 2.047s). The provider is mocked, so this verifies tool behavior only. Node 22 was not found on PATH/common locations. Existing A10 local synthetic HTTP/signature/PostgreSQL results are documented in the linked prior acceptance records and were not rerun here. |
| authenticated browser | Not run for this task. |
| provider test mode | Blocked: a preview candidate is identified, but database isolation, sender configuration, non-deploying secret installation, and public webhook ingress remain unverified. |
| production smoke | Not run; excluded from this task. |
| external approval | No new approval claimed. An accepted isolated target, Resend/preview credentials, and a non-deploying secret-install method were not established; relevant process variables were unset. |

## Current evidence

| Criterion | Evidence / status |
| --- | --- |
| Existing local acceptance | Previously passed; see [A10 endpoint acceptance](./A10_RESEND_ENDPOINT_ACCEPTANCE.md) and [A10 signing acceptance](./A10_RESEND_SIGNING_ACCEPTANCE.md). This is not re-run by this task. |
| Provisioner safe default | `node scripts/a10-resend-endpoint.mjs` exited 0 in 89 ms and returned `mode: dry-run`, `createsEndpoint: false`, `endpoint: null`, and the exact seven event types. No provider request was made. |
| Isolated public preview and synthetic DB | Candidate identified; isolation and database identity pending verification. |
| Resend account/team, verified sender and controlled recipient | Pending: none specified. |
| Endpoint registration and signing secret | Pending: no endpoint exists for this task; no secret was created or installed. |
| App send, public signed webhook ingress and ledger correlation | Pending: no message was sent and no public webhook attempt occurred. |
| Owned mailbox receipt | Pending. A provider `email.delivered` event alone would establish mail-server acceptance, not inbox placement. |
| Cleanup and provider endpoint disposition | Not applicable yet: no live resources were created. Record cleanup and endpoint disposition after live acceptance is run. |

The configured endpoint must subscribe to exactly `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`. The existing provisioner stores its generated signing secret locally and reports that target installation is still required. Installing a candidate secret must not trigger a deployment, since deployment is outside the authorized scope.

No dependency install or application-code change was needed for the bounded provisioner verification. The verifier found no `.env.a10-resend-endpoint` state directory. Relevant process environment variables were unset; this does not establish whether credentials exist in any authenticated CLI cache or other credential store.

The bounded authenticated Vercel CLI 58.9.1 metadata audit found one `locallift` project. Its deployment listing returned 97 rows; the newest relevant Ready Preview is branch `review/a10-a12-po-wave10`, at commit `5a80b8d` (this worktree's base). Inspection confirmed the Vercel target is Preview. This identifies a candidate, but preview status and a matching task commit do not establish database isolation. No database or environment values were read or pulled. A safe `GET /api/webhooks/resend` to the candidate returned HTTP 302, so public unauthenticated webhook ingress is not proven and needs resolution before provider registration. The audit made no deployment or configuration change and did not expose deployment URLs or IDs in this handoff.

## Required inputs and unresolved decisions

Before the live lane can proceed, the integration owner needs to identify and verify:

- A public preview host, isolated target environment and disposable database identity; verification must establish that the host and database are not production or shared staging.
- The authorized Resend account/team, a verified sender domain aligned with the preview's effective sender, and an explicitly controlled recipient or owned test mailbox.
- A permitted way to set and verify `RESEND_WEBHOOK_SECRET` on the already-running preview without deployment or shared configuration changes.
- A controlled authenticated operator session for the preview, and a way to create and later remove the unique synthetic business/eligible visit without touching shared or production data.
- Whether the selected provider account permits the bounded test send and endpoint lifecycle, plus who will remove or disable the endpoint and disposable data afterward.

These are target and operator decisions, not changes this worktree can safely infer. The `--isolated-target` flag is an operator attestation; it does not establish isolation by itself. No existing shared model, route, runtime setting, schema, migration, or dependency change is identified. Keep `RESEND_RECONCILIATION_ENABLED=false`; the candidate's effective setting was not inspected, and reconciliation is not needed for signed webhook ingress. Existing retention, global suppression categories, and operator-access policy decisions remain open as documented by A10.

The live app/database prerequisites are the existing Node 22 / Next.js 16.3.8 application baseline, canonical migration schema through 038 (including A10 migration 025), an entitlement-enabled synthetic business, eligible visit data, and a verified sender domain. The bounded provisioner verification itself used Node 24.11.1 because Node 22 was unavailable; its builtin-only tests required no package install. This task proposes no package, install, model, route, setting, or dependency change.

## Live receipt to complete

Keep each row pending until evidence comes from the live lane. Store only sanitized identifiers and outcomes; never store secret values, API keys, recipient addresses, raw payloads, mailbox content, credentials, cookies, or environment dumps.

| Field | Result |
| --- | --- |
| Candidate commit and isolated target label | Metadata candidate only: `5a80b8d` / Preview branch `review/a10-a12-po-wave10`; isolation and live acceptance pending |
| Public app host label and disposable DB label | Pending |
| Resend account/team label and endpoint ID | Pending |
| Exact selected event set | Pending |
| Signing secret installed and effective in preview | Pending; masked fingerprint only if recorded |
| Authenticated `POST /api/review-booster/run-now` result, unique synthetic business/visit and provider message ID | Pending |
| Resend webhook attempt ID / `svix-id`, UTC time and response status | Pending |
| Application ledger outcome correlated to provider event | Pending |
| Replay and suppression/quota evidence | Pending; preserve local identical-ID replay separately |
| Owned mailbox outcome, if required | Pending |
| Endpoint/data cleanup and retained evidence | Pending |

Once the target inputs are available, use the reviewed A10 provisioning and acceptance tooling described in [A10 endpoint acceptance](./A10_RESEND_ENDPOINT_ACCEPTANCE.md). Do not retry an uncertain send by creating another message, and do not treat a replay with a new event ID as duplicate-ID proof. Do not create or configure an endpoint in production or shared staging.
