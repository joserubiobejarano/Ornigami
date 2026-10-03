# A10 Resend signing configuration and controlled acceptance

Status: isolated implementation verification is scoped to local synthetic signatures and disposable PostgreSQL evidence. No Resend API request, provider webhook, or real email was used by this acceptance work. Live endpoint registration and end-to-end provider acceptance remain pending for the integration owner.

Worktree: `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-A10-resend-controlled-verification`; branch: `task/a10-resend-controlled-verification`; base commit: `b4eedd5`. This document does not replace or repeat the merged implementation; see [A10 email delivery events](./A10_EMAIL_DELIVERY_EVENTS.md) for the service and event contract.

## Configuration findings

The route is `POST /api/webhooks/resend`. It reads `RESEND_WEBHOOK_SECRET` at request time, verifies the exact raw UTF-8 request body, then validates the event and applies it through the atomic delivery-event adapter. The current environment schema already accepts optional `RESEND_WEBHOOK_SECRET`, and `.env.example` already documents the key name. `RESEND_RECONCILIATION_ENABLED` is separately default-closed (`false`) and controls only the owner lookup UI/route. The existing `RESEND_API_KEY` is used for retrieval; it is not the webhook signing secret. No new setting, model, route, migration, runtime dependency, or rebuild of the merged implementation is identified for this acceptance task.

The integration owner should create the endpoint in the intended Resend team/account at `https://<candidate-app-host>/api/webhooks/resend`, selecting only these seven email events:

| Event | Purpose in A10 |
| --- | --- |
| `email.sent` | Provider accepted the email request; not proof of delivery. |
| `email.delivered` | Recipient mail server confirmed delivery. |
| `email.delivery_delayed` | Temporary delivery problem. |
| `email.bounced` | Permanent recipient-server rejection and global Booster suppression evidence. |
| `email.complained` | Spam complaint and global Booster suppression evidence. |
| `email.failed` | Provider could not send the email. |
| `email.suppressed` | Resend suppressed a send; retained as do-not-send evidence. |

Resend currently documents additional email events such as opened, clicked, received, and scheduled, along with contact/domain/suppression events. Do not select all events: this endpoint accepts the seven above and safely ignores unrelated valid events. In particular, do not infer a review conversion from open/click signals.

Resend displays an endpoint-specific signing secret in webhook details and returns it in webhook create/retrieve/list API responses. Put that value into the isolated candidate's secret store as `RESEND_WEBHOOK_SECRET`; never commit it, add it to `.env.example`, echo it in logs, or include it in acceptance receipts. Use separate secrets per Resend endpoint/environment. Confirm the app target receives the setting without printing the value, then send a synthetic valid signed request to the local route and verify bad-signature rejection before registering the external endpoint.

The handler accepts the `svix-id`, `svix-timestamp`, and `svix-signature` headers (and Resend's equivalent `webhook-*` names), requires a timestamp within 300 seconds, bounds the body to 128 KiB, and checks all `v1` signatures supplied in the header against the one configured secret. Resend specifically requires signature verification over the raw request body; parsing and re-serializing JSON changes the signed bytes and must not be introduced in middleware or route wrappers.

### Secret rotation

Resend's current rotation API returns a new endpoint secret and says webhook payloads are signed with both the previous and new secret for 24 hours after rotation. This handler can match multiple signature candidates for one configured secret, but it has one configured secret value; it does not load two independent secrets. Rotate by coordinating the new value through the candidate environment secret store during Resend's overlap window, confirm the new value is active and signed events are accepted, then retire the old secret after the overlap. Do not assume that listing multiple `v1` signature strings means the application is configured with multiple keys. If deployment propagation or rollback needs both keys accepted concurrently, submit that as a shared implementation change before rotation rather than expanding this acceptance handoff.

## Isolated verification and live acceptance boundaries

Use the A10 synthetic webhook tests and the dedicated controlled acceptance test against a disposable local database. The acceptance harness loads the exported handler and production persistence adapter while replacing the Neon HTTP transport with a loopback PostgreSQL test bridge. This exercises application logic and durable PostgreSQL effects without a real provider or shared database; it is not a full Next.js HTTP ingress test. The synthetic signature tests establish that this code verifies exact raw bytes, rejects modified/expired/invalid signatures, processes supported event types and is idempotent under replay. The PostgreSQL evidence establishes persisted event idempotency, provider-ID/recipient correlation, cross-workspace Booster suppression and retained quota/state behavior for event outcomes. Neither evidence lane calls Resend or establishes that a Resend request reached the route.

The exact focused commands for this checkout are:

```powershell
node --experimental-strip-types --test tests/a10-webhook-signatures.test.mts tests/a10-webhook-route.test.mts tests/a10-reconciliation.test.mts
node --experimental-strip-types --test tests/a10-delivery-postgres.test.mts
node --experimental-strip-types --test tests/a10-controlled-webhook-acceptance.test.mts
```

The complete repository suite can be reproduced with `npm test`. For the new acceptance test's lint and full static checks, use:

```powershell
npx eslint tests/a10-controlled-webhook-acceptance.test.mts
npm run typegen
npx tsc --noEmit
npm run lint
```

Keep each test lane's claim separate. Do not count a successful synthetic webhook, mocked request, or database fixture as live provider ingress or inbox delivery.

### Pending live acceptance, for a separately authorized integration session

Run against an isolated candidate deployment and disposable workspace/database, with no customer recipients. First confirm the candidate host, Resend team/account, sender domain, and app environment target are the intended isolated values. Register the endpoint with the seven events above, install the generated signing secret through the environment's secret manager, and retain the webhook ID and a masked secret fingerprint only. Do not change shared deployment settings in this worktree.

Resend documents these test recipients for triggering delivery outcomes without sending to a real mailbox: `delivered@resend.dev`, `bounced@resend.dev`, and `complained@resend.dev`. The `bounced` test simulates an SMTP 550 5.1.1 response; the complaint address simulates a spam complaint. These are still actual Resend email-send operations. They must be performed only in the separately authorized isolated acceptance session, with a verified sender and no customer data. They prove provider-generated webhook ingress for those scenarios when the webhook receipt and application ledger correlate; they do not prove a human owned inbox display unless a separate owned inbox is also used.

For a bounded live flow, create one disposable Booster delivery to the delivered test address using the app's controlled-send path and one disposable bounce case using the provider test address. Verify, using redacted identifiers, that (1) Resend's webhook log shows the endpoint attempt and 2xx acknowledgement; (2) the ledger distinguishes provider acceptance from delivery and ends in the delivered state even if events arrive out of order; (3) replay does not regress state or duplicate the event's durable effect (record whether Resend reused the event ID; use a synthetic identical-ID replay to prove the precise dedupe contract); (4) the bounce outcome creates a global suppression that prevents a later controlled Booster attempt in a second disposable business from being sent; and (5) accepted-send quota remains consumed after the later outcome. Use a complaint test only if the isolated provider account is approved for it. Do not trigger or clear a real recipient's suppression to test this path.

Inspect Resend's webhook attempt/event details for provider ingress and response status; the exact event payload is available in dashboard/API tools, and replay can send the same logical event again. Record the `svix-id` on each attempt and prove duplicate handling with identical-ID replay in the local synthetic test. A live replay with a different ID is a second event ID and is not, by itself, proof of duplicate-ID handling. A replay or retry that gets an error must be investigated before requeueing a send. Never create a second email merely to retry an uncertain send. For transport/inbox confirmation, use only an explicitly owned test mailbox and verify provider lookup plus mailbox receipt separately; Resend's `email.delivered` indicates delivery to the recipient mail server, not guaranteed placement in the inbox or human viewing.

## Integration checklist and unresolved choices

- [ ] Choose and record the isolated app host, target environment, disposable database identity, Resend account/team, and verified sender domain. Confirm the candidate's effective sender aligns with a verified sending-enabled domain. The current A00 integration evidence records a verified, sending-enabled sender domain; recheck the isolated candidate configuration before provider acceptance.
- [ ] Register `POST https://<candidate-app-host>/api/webhooks/resend` in the right Resend account with exactly the seven events in this handoff. Record endpoint ID and event selection, not its secret.
- [ ] Store that endpoint's signing secret as `RESEND_WEBHOOK_SECRET` in the isolated app environment. There is no new env-schema or example-file change required on the A10 base inspected here. Keep the secret outside source control and evidence.
- [ ] Before live ingress, confirm a local test verifies a correctly signed raw body, rejects an altered body and stale timestamp, applies one supported event, and treats replay as a duplicate. Confirm matching disposable PostgreSQL state and no unexpected tenant/global effects.
- [ ] Apply/verify migration 025 and the migration wrapper ordering through the integration migration process before database-backed target acceptance. This handoff does not apply migrations to a shared or external target.
- [ ] Keep `RESEND_RECONCILIATION_ENABLED=false` until the separate Resend GET permission/response-shape and owner/cross-tenant route acceptance are approved. Do not enable it as a prerequisite for signed webhook ingress.
- [ ] Decide approved retention duration and export representation for global suppression addresses, provider/event IDs, and linkable recipient fingerprints. A UUID does not make correlated identifiers anonymous. Do not delete bounce/complaint suppression as a side effect of workspace deletion or account cleanup.
- [ ] Decide whether global bounce/complaint suppression applies to verification, invitation, alert, or other email categories. Current A10 suppression gates Review Booster only.
- [ ] Decide workspace/team ownership and operator audit rules for provider IDs, raw/global suppression identifiers, and manual reconciliation, including the lifecycle-frozen owner case. No operator recovery workflow is authorized by this task.
- [ ] Keep the webhook endpoint available through Resend retries and replay only after a failed attempt is understood. Do not mistake a 2xx from an unrelated/ignored event for delivery-ledger evidence.

Shared changes identified from this inspection: none required for webhook signing configuration itself. If the integration team requires simultaneous old/new secret acceptance during deployment propagation, it should submit a narrow shared config/service change to support a current-plus-previous secret pair; otherwise the documented 24-hour rotation overlap and coordinated secret replacement are sufficient. No new dependency is needed by the existing implementation.

## Final local evidence

The new controlled acceptance test passed 1/1 with zero skips in 17.37 seconds in an independent run on Node 24.11.1 and PostgreSQL 17.9. It exercises the exported webhook handler with the production delivery adapter and the Neon HTTP transport replaced by a loopback PostgreSQL test bridge. Assertions cover a valid signed raw body, tamper rejection, expiry of an unknown-delivery lease followed by positive provider acceptance, replay of the identical signed body/event ID, all seven supported email events, and a suppression written by one owner that blocks a later delivery under a distinct owner/business. This is isolated application/database behavior, not a full Next.js HTTP ingress test.

The repository's standard suite passed 451/451 tests with zero failures and zero skips in 75.457 seconds under the default runner. Runtime and database were Node 24.11.1, npm 11.6.2, and PostgreSQL 17.9. Reproduce with:

```powershell
npm test
```

Additional final evidence: `npx tsc --noEmit` passed after the new test was added; `npx eslint tests/a10-controlled-webhook-acceptance.test.mts` passed with no warnings. `npm run lint` passed before the new test landed with zero errors and four pre-existing warnings; the new test was then linted directly. `npm run typegen` passed. A clean `npm ci --ignore-scripts --no-audit --no-fund` installed 654 locked packages. No package manifest or lockfile change was required; the new test uses the existing locked TypeScript/Node test support. The test/docs work made no schema, shared environment, deployment, build, or live-provider changes.

An independent Luna review and rerun found no outstanding defects. The acceptance test's isolated PostgreSQL fixture directories were stopped and removed after the final run.

These results are local only. No Resend API call, provider webhook ingress, actual message transport, owned-inbox delivery, or deployment was performed. The tests do not establish secret propagation in a candidate environment, endpoint registration, sender-domain configuration there, or external Resend response/permission behavior. No current local result should be reported as live provider acceptance.

## Sanitized receipt template

Record one row per evidence lane. Leave unsupported rows `pending`; never promote local synthetic proof to live provider evidence.

| Field | Value |
| --- | --- |
| Candidate commit / isolated target | `<commit> / <target label>` |
| App host and disposable DB identity | `<host label> / <database label only>` |
| Resend account/team and webhook endpoint ID | `<non-secret identifiers>` |
| Selected event set | `<exact seven event names or pending>` |
| Secret configured | `<yes/no; masked fingerprint only, never value>` |
| Local synthetic signature test | `<command, pass counts, runtime, commit>` |
| Disposable PostgreSQL proof | `<command, pass counts, PostgreSQL version, commit>` |
| Live webhook ingress | `<pending or event IDs, attempt status, HTTP status, UTC timestamps>` |
| Live transport / owned inbox | `<pending or provider message ID, outcome, owned mailbox label>` |
| Suppression across second disposable business | `<pending or redacted result and state proof>` |
| Cleanup | `<disposable objects removed/retained and why>` |
| Unresolved policy decisions | `<retention, categories, operator access, reconciliation gate>` |

Do not include secret values, environment dumps, raw event payloads, email addresses, recipient content, authentication cookies, provider response bodies, or unredacted database rows in a shareable receipt.

## Official Resend references

- [Create a webhook](https://resend.com/docs/webhooks/create-webhook) — dashboard registration, event selection, retries, and at-least-once delivery.
- [Verify webhook requests](https://resend.com/docs/webhooks/verify-webhooks-requests) — endpoint signing secret, Svix headers, and raw-body verification requirement.
- [Retrieve a webhook](https://resend.com/docs/api-reference/webhooks/get-webhook) — current GET response includes the endpoint's `signing_secret`.
- [Email event types](https://resend.com/docs/webhooks/event-types) — current event catalog and definitions.
- [Sending test emails](https://resend.com/changelog/sending-test-emails) — delivered, bounced, and complained test recipients.
- [Webhook secret rotation](https://resend.com/changelog/headless-webhook-api) — current API rotation support and 24-hour dual-signature period.
- [Webhook retries and replays](https://resend.com/docs/webhooks/retries-and-replays) — retry/replay behavior.
