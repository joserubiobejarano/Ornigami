# A10 Email delivery events and uncertain-send reconciliation

## Scope and handoff

This handoff is based on `e5a9c0f` in branch `feat/email-delivery-events`, implemented in the isolated `Ornigami-A10-email-delivery-events` worktree. It adds the signed Resend webhook, durable provider-event and suppression adapter, migration `neon/migrations/025_email_delivery_events.sql`, and owner-only `POST /api/review-booster/deliveries/{deliveryId}/reconcile` recovery route with a bounded Resend GET lookup. The reconciliation request identifies the business and may supply the Resend email ID. The route does not send mail, release quota, rewrite the frozen send payload, generate a replacement key, or infer rejection from a lookup miss. Positive evidence preserves lifecycle cleanup behavior, which may clear payload data when deletion is frozen.

The current route lets a workspace owner reconcile after Booster entitlement is inactive, because reconciliation only records provider evidence. It still resolves the canonical business owner through `requireBusinessOwner`, which denies members, another tenant, and actors/owners in the lifecycle deletion freeze. Mutations require same-origin request validation. A database lookup scopes the delivery by both selected business and delivery ID.

## Evidence and decisions

Resend's current [Retrieve Sent Email API reference](https://resend.com/docs/api-reference/emails/retrieve-email) documents `GET /emails/:email_id` and a response containing the Resend email `id`, `to`, `from`, `subject`, `html`, `text`, `last_event`, and a `tags` array of name/value pairs. Reconciliation accepts an operator-supplied ID only when the returned ID matches, the returned `ornigami_delivery_id` tag uniquely matches the delivery, the frozen payload contains that same unique tag, the only recipient matches both frozen and current visit recipient, the sender and subject match the frozen payload, and every body field returned by Resend exactly matches the frozen payload (with at least one body field present). A missing/malformed tag, duplicate delivery tag, changed recipient, or similar-looking message remains unresolved.

The API reference demonstrates tags on GET, while the current [Resend OpenAPI document](https://github.com/resend/resend-openapi/blob/main/resend.yaml) does not describe that response field. The implementation treats the API reference as the endpoint contract and fails closed if runtime responses omit or change the documented evidence. Confirm this response behavior with a controlled Resend test account before enabling the manual recovery UI.

Only known provider email-object snapshots are applied. `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, and `suppressed` preserve their matching status. `sent` records acceptance. `opened`, `clicked`, `queued`, `scheduled`, and `canceled` also prove a provider object exists, but are conservatively recorded only as accepted/sent; they never mark it delivered. Unknown snapshots remain unresolved. The returned ID and exact frozen tag/body binding establish that Resend created this email object. The observation time is recorded as event time because GET's `created_at` describes email creation, not the latest delivery event. Bounce and complaint resolution preserves accepted quota and feeds the shared suppression event path.

For an operator-supplied ID with no stored ID, the complete frozen-payload binding above is mandatory. A different, narrower recovery path applies only when the ledger already contains a trusted provider ID: it retrieves that exact ID and checks the current recipient against the durable recipient fingerprint/provider-correlation row. This supports recovery after privacy cleanup clears the frozen payload; it does not accept an arbitrary operator ID or claim full body/tag verification after payload erasure. The retrieval endpoint returns one email by exact provider ID; it cannot enumerate or prove a match by approximate subject/recipient search. Resend 404, timeout, other API errors, malformed/oversized responses, and identity mismatches leave the row and quota unchanged. The request and response reads are size-bounded; the provider lookup has a 10 second deadline.

The route only accepts `reconciliation_required`, or `unknown` after its lease expires. `sending`, `accepted`, and other states cannot start reconciliation; an already accepted row returns its existing state without another provider request. Atomic event correlation rechecks the current ledger state and binds a previously absent provider ID only with positive evidence. A conflict, missing delivery row, expired/active lease race, or database failure does not make the email eligible for a replacement send.

## Webhook and ledger contract

Register `POST https://{production-app-host}/api/webhooks/resend` in Resend and subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, and `email.suppressed`. The route verifies the raw request body with Resend's Svix signature headers and `RESEND_WEBHOOK_SECRET`; it accepts the signed event ID once, validates provider email ID/recipient/type/tag shape, then calls the atomic database adapter. Replayed identical events are acknowledged as duplicates. Bad signatures return 401, invalid payloads 400, too-large payloads 413, late/unmatched tagged deliveries or persistence failures 503 for Resend retry, and unrelated valid events are acknowledged as ignored. Do not register wildcard domains or expose the signing secret.

Migration 025 stores delivery status, unique provider-ID/recipient correlation evidence, idempotent event metadata, and global normalized-address suppressions. Event recipient arrays and event fingerprints contain `sha256:<hex>` strings; the correlation table contains SHA-256 recipient digests. These are linkable fingerprints, not anonymization. For the new event/correlation evidence, the global suppression table alone retains the raw normalized address needed to block future sends; an extant frozen delivery payload can also contain its recipient until privacy cleanup clears that payload. The migration serializes global suppression against send admission across Booster businesses. Bounce and complaint events suppress future Booster sends across workspaces; provider `suppressed` events are also retained as do-not-send evidence. A signed event can correlate after the payload was cleared using the linked provider ID and recipient fingerprint; event/provider IDs remain linkable identifiers and are subject to the retention decision below.

Migration ordering matters. On a fresh numeric migration sequence, 025 installs the admission guard on the base `begin_booster_delivery_send`; later migration 036 wraps and renames that function to `begin_booster_delivery_send_a06`. If 025 is reapplied incrementally after 036 is already installed, its conditional function replacement targets the existing `*_a06` inner function, preserving the outer 036 lifecycle wrapper. Apply through the integration migration process and verify the intended wrapper chain in the target database.

Owner reconciliation request example (IDs are the selected business and delivery UUIDs; `Origin` must match the application host):

```http
POST /api/review-booster/deliveries/00000000-0000-4000-8000-000000000021/reconcile HTTP/1.1
Origin: https://app.example
Content-Type: application/json

{"businessId":"00000000-0000-4000-8000-000000000041","providerMessageId":"4ef9a417-02e9-4d39-ad75-9611e0fcc33c"}
```

`providerMessageId` may be omitted only when the ledger already has a trusted ID. A 200 result means the provider evidence was durably correlated (or the row was already accepted); a 202 `unresolved` result means the operator must retain the quota reservation and continue through the approved recovery process. No request payload can release quota, replay the email, or generate another idempotency key.

## Sender-domain setup

Before production mail, add the sending domain to the Resend account, publish the SPF and DKIM records shown for that domain in Resend, and wait for Resend to verify them. Set the existing `EMAIL_FROM` value to an address on the verified sending domain. Keep the public support/reply address in the existing `REPLY_TO_EMAIL` setting if needed. Resend notes that SPF and DKIM records are shown for sending-enabled domains; records must be copied from the account's domain screen rather than guessed. Review the account's DMARC and alignment policy separately with the domain owner; this handoff does not prescribe a DMARC policy.

Resend references: [Domain Verification Events](https://resend.com/changelog/domain-verification-events), [Email API](https://resend.com/features/email-api). A controlled acceptance should verify DNS status and send to owned test inboxes only; this isolated implementation has sent no live email.

## Suppression and privacy integration

Hard bounces and spam complaints should suppress the normalized recipient across all Ornigami workspaces. This is a global no-send safety boundary: sending from a second workspace must not bypass the signal. Store only the minimum address identity and reason/source needed to enforce the block and support authorized correction. Do not automatically remove a global bounce/complaint suppression when a workspace changes status or a delivery is deleted.

No retention period is approved here. The integration session must get an explicit retention decision for the global address identifier and event history. Include suppression records in the workspace/account privacy export according to the approved ownership model; account deletion should remove a user's workspace data without silently erasing a suppression needed to protect other recipients/workspaces. Decide whether the global suppression identifier is represented in exports as the address, a masked address, or a privacy-preserving stable token. Do not implement an invented purge period or claim that a UUID alone anonymizes linkable records.

The signed-webhook route verifies event signatures and uses the atomic suppression adapter. Configure a Resend webhook for the needed email events and use the signing secret generated/shown for that webhook. Resend requires signature verification over the raw request body and documents Svix ID, timestamp, and signature headers. Never copy webhook secrets into source control or log them.

## Integration requirements

- Integrate the A10 webhook route and the new reconciliation route with the shared `delivery-events-db.service.ts` contract. The database event model needs idempotent event IDs, provider message ID, event type/time/source, correlated delivery ID, current delivery status, and recipient suppression evidence. A delivery is counted as accepted after positive provider evidence; `failed`, `bounced`, `complained`, and `suppressed` are later status outcomes, not permission to resend.
- Update shared visit/query surfaces in A13: extend `FollowupVisitRowSchema` and `FollowupVisit` with `delivery_id`, `delivery_status`, and `delivery_status_at`; have `getRecentVisits` project those values from the delivery ledger; update `StatusBadge` to distinguish provider acceptance from confirmed delivery and terminal delivery outcomes. The legacy `followup_status = 'sent'` remains the accepted-send/quota mirror, not proof of delivery. Dashboard “Requests sent” describes provider-accepted messages, not confirmed reviews or inbox delivery.
- Apply migration 025 through the integration migration process. This worktree does not alter shared deployment configuration, environment schemas, `.env.example`, shared models outside the feature service contract, dependencies, the roadmap, or any live database.
- Add `RESEND_WEBHOOK_SECRET` to the canonical environment schema and `.env.example` as an integration change. There is no new package dependency. Keep the existing `RESEND_API_KEY` for retrieval; no send key is generated or rotated by this route.
- Verify the existing Resend API key can call `GET /emails/:email_id` in the same original sending account. Resend documents “Sending access” keys as send-only and “Full access” keys as get/create/update/delete any resource ([API key permissions](https://resend.com/changelog/new-api-key-permissions)). Decide whether to use one existing full-access key or a separately stored retrieval key with the narrowest available permission before enabling the route. Do not change the sending account while a frozen idempotency key remains unresolved.
- Update the shared Booster visit/dashboard UI to display accepted, delivered, delivery delayed, bounced, complained, failed, and suppressed states, plus `unknown` / `reconciliation_required` and an owner-only reconciliation action. Explain that unresolved sends continue to reserve monthly quota. Never show a retry/re-key action for uncertain or accepted rows. Do not expose recipient/body/provider response data beyond existing authorized workspace surfaces.
- Add privacy export and retention integration for the delivery ledger, webhook event identifiers, and global suppression boundary. Existing account deletion and event deduplication rules must not create a send window by erasing a suppression.
- A11's lifecycle freeze intentionally blocks this owner route. Define a separate native recovery path for provider operations when an owner or actor is deletion-frozen; it needs a lifecycle-safe authorization/audit design and must reconcile the provider before finalization rather than infer cancellation from a timeout. This task does not implement or authorize that operator workflow.
- The current global suppression table gates Review Booster sends across Booster businesses only. Auth verification, team invitation, alert, and other application email senders do not yet consult it. Integration ownership must decide whether provider bounce/complaint suppression applies to those mail categories and connect each sender only under that approved policy. Customer-specific sending domains, per-customer Resend account/key provisioning, and any A14/SMS workflow remain later work; this implementation uses the existing shared `EMAIL_FROM` and Resend account.
- Deploy only after controlled signed-webhook verification, Resend response-shape check, owner/member/cross-tenant route tests, and target database migration review. This task performed no deployment.

## Dependencies and unresolved decisions

No new runtime dependency is required. The route uses the existing Resend API key and database adapter. Integration still needs decisions on global suppression retention and export representation, provider-account/team ownership for workspace messages, operator access and audit trail for provider IDs, user-facing status copy and reconciliation affordance, canonical webhook-secret environment naming, and the official Resend API reference/OpenAPI response-field discrepancy.

## Verification

Focused tests are in `tests/a10-reconciliation.test.mts`. They cover positive correlation; wrong ID, recipient, sender, subject, body, duplicate/missing tag; 404; timeout; malformed lookup; unsupported provider status; status mapping including complaint, bounce and suppression; unknown lease eligibility; owner-only access independent of active entitlement; same-origin enforcement; cross-tenant denial; and oversized chunked request bodies. These tests use mocks and make no Resend requests. Run with:

```powershell
node --experimental-strip-types --test tests/a10-reconciliation.test.mts
```

Recorded verification at handoff: focused webhook and reconciliation tests passed 21/21 (11 webhook, 10 reconciliation); A10 PostgreSQL tests passed 2/2, including recipient-hash storage assertions; A06 regressions passed 2/2; A07/A08 isolation tests passed 2/2. The full suite passed 364/364 with 0 skips in 174.5 seconds on Node 22.23.3 / PostgreSQL 17 using `--test-concurrency=2` and sorted `*.test.mts` discovery. A default-concurrency run initially reported 361/364: one stale A10 test was corrected, and two existing short-barrier tests failed under PostgreSQL load; the bounded run passed. Type generation, `npx tsc --noEmit`, and lint passed; lint reported 0 errors and 4 existing navigation warnings. The final local `npm run build` passed (webpack compile, TypeScript, and CSP hash generation) with synthetic CI environment values. `node scripts/production-smoke.mjs` passed the eight-second local smoke suite for static CSP parity, nonce hydration/rotation, protected dashboard, OpenGraph, anonymous-auth, Google, billing boundaries, and absence of external provider I/O. These checks ran against a local build/server and synthetic environment; they do not prove Linux CI behavior or production secrets/configuration. No live Resend call, delivery, or deployment was performed.

Reproduce the bounded full suite in PowerShell from the repository root with:

```powershell
$testFiles = Get-ChildItem tests -Filter '*.test.mts' | Sort-Object Name | ForEach-Object { $_.FullName }
node --experimental-strip-types --test --test-concurrency=2 $testFiles
```

The focused webhook checks cover raw-body signature verification, timestamp tolerance, multiple signature versions, key rotation, replay/idempotency, malformed and tagged payloads, and bounded-body/deadline behavior. The PostgreSQL checks exercise cross-workspace global suppression, event history/idempotency, recipient hash storage, deletion-freeze cleanup, and quota preservation for provider outcomes. Linux CI and controlled acceptance against an owned Resend test account remain integration gates; local tests do not prove cross-platform behavior or actual Resend response/permission configuration.

The route handler follows the installed Next.js 16 route-handler guide at `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, including promised dynamic route params and Web Request/Response APIs.
