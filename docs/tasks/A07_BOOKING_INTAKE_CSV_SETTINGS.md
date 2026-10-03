# A07 Booking intake, CSV deduplication and Booster settings

This package is implemented in isolated worktree `Ornigami-A07-booking-intake-csv-settings`, branch `fix/booking-intake-csv-settings`, based on integrated main commit `fec3fc2`. It consumes the reviewed A02 business context, A06 atomic delivery/quota and A08 business Google-location contracts. Implementation was delegated across disjoint intake, CSV, and Booster settings files; the coordinating session reviewed cross-package boundaries and focused tests.

## Scope and behavior

Booking intake uses a business-scoped, revocable integration credential rather than global Basic Auth or a caller-selected business ID. The generic adapter creates completed visits for the existing Booster sender. It does not send email during intake and does not establish native Square, OpenTable or Fresha connectors. Migration `023_booking_intake.sql` is reserved for this package and is submitted for integration; it has not been applied to staging or production.

CSV inserts use the existing business/email/service/timestamp unique index with conflict-aware outcomes. Equivalent offset-aware timestamps normalize to the same UTC instant, and date-only values mean midnight UTC. Datetimes without an offset are rejected. Malformed CSV is rejected before importing; valid files return inserted, duplicate and per-row error counts. Phone-only manual and booking records remain non-sendable for email. Storing a phone number does not provide SMS delivery.

Settings mutations belong to the business owner. Members read the owner's business and selected Google location. Omitted legacy sender/rebooking settings survive saves; explicit empty/null input clears them. Invalid stored destinations remain available for correction but cannot become new email links. Manual review destinations take precedence over automatic derivation; no first-location fallback selects a different business resource.

The user delegated the rebooking decision to this session on 3 October 2026. The chosen behavior is an optional second "Book again" link in the same follow-up email, with no new campaign or scheduler. Sender customization changes the display name only. New provider payloads validate destinations and freeze their complete localized content under the existing A06 delivery contract; recovery reuses existing frozen JSON and idempotency keys.

## Integration dependencies

See [shared integration requests](A07_SHARED_INTEGRATION.md) for the tracked-link route, privacy/export/lifecycle coverage, shared documentation and deployment acceptance. No dependency manifest, shared deployment configuration or roadmap is changed by this package. No merge, push or deployment is part of this handoff.

## Booking adapter contract

`GET|POST|DELETE /api/review-booster/booking-credentials` requires the business owner. Select a workspace with `business_id` (query for GET, JSON for mutations); omitting it uses the canonical default workspace. POST takes a `label` of 1–80 characters and returns `{ id, secret, created: true, secretShownOnce: true }` with private/no-store headers. GET lists safe metadata only. DELETE takes `credential_id` and revokes that credential for the authorized workspace. Browser mutations require same-origin headers. Rotate by creating a replacement credential, updating the client, then revoking the old one; plaintext secrets are not retrievable later.

`POST /api/webhooks/booking` uses these headers:

| Header | Value |
| --- | --- |
| `x-booking-key-id` | Issued credential UUID |
| `x-booking-timestamp` | Unix seconds, within five minutes of the server clock |
| `x-booking-signature` | Hex HMAC-SHA256 of the UTF-8 string `timestamp + "." + rawBody`, using the issued secret; optional `sha256=` prefix |

The maximum raw body is 64 KiB. Sign the exact JSON bytes being sent, including whitespace. A retry keeps the same source/external ID and signs with a fresh timestamp. Send no `business_id` or `businessId`: the credential resolves the workspace.

```json
{
  "source": "calendar",
  "event_type": "booking.completed",
  "external_id": "appointment-1042",
  "customer_name": "Example Customer",
  "customer_email": "customer@example.com",
  "service_name": "Appointment",
  "visited_at": "2026-10-02T14:00:00+02:00"
}
```

Supported event types are `booking.completed` and `appointment.completed`. Other event types are rejected before consuming a completion dedupe key. Source/type labels normalize to lowercase; external IDs are trimmed and remain case-sensitive. Supply a valid email or phone contact and a visit timestamp. Date-only input means midnight UTC; use an offset-aware timestamp when the actual appointment time matters. Names/services are bounded to 120 characters, email to 254, phone to 32, source to 40 and external ID to 200.

An accepted event returns `{ ok: true, duplicate: false, visitCreated: true }`; replay returns `{ ok: true, duplicate: true, visitCreated: false }`. The database transaction rechecks revocation, owner lifecycle and active/trialing Booster/Complete entitlement, and inserts the event and visit together. HTTP 400 identifies invalid input; 401 invalid/revoked credentials or signatures; 403 inactive entitlement; 413 excessive body size; 503 transient processing/storage failure. Retrying a 503 with the same source/external ID is safe. Intake never calls the mail provider.

## CSV and settings contracts

CSV requires unique nonempty headers including `customer_email` and `visited_at`; names and service are optional. `service_received` and `service_name` are supported. The existing template example is skipped. Missing/invalid row fields and row persistence errors are reported individually; malformed quoting/column counts reject the complete file before writes. The response preserves `rows_processed`, `visits_inserted`, `rows_skipped`, `duplicates_skipped` and `errors`. Duplicates are included in skipped totals, so clients must not add the two counts. Each failed row can be retried, and successful earlier rows then count as duplicates.

Settings GET returns `businessId`, `business_role`, `can_manage_settings`, selected Google-location metadata and destination-validity indicators, alongside stored settings. Members can read owner settings but cannot mutate them. POST uses optional `businessId`; conflicting body/query selections fail. All optional settings use omission-preserving SQL updates. Explicit empty/null clears rebooking and sender. Invalid legacy values remain visible for correction/export; they are never silently deleted. Correctly configured manual review links override automatic derivation from the canonical selected location. The Booster UI uses the existing A08 selection route for an owner's explicit first selection, so Booster-only owners do not need Review Replies access. It never selects the first discovered location automatically or offers to switch a pinned resource. Save settings after selecting to persist its derived review URL when the manual override is blank. Location selection is omitted from ordinary Booster saves; conflicting selection input from other clients is rejected.

The allowlist supports direct `search.google.com/local/writereview?placeid=…`, `g.page/{slug}/review`, and `g.page/r/{id}/review` HTTPS destinations. It rejects credentials, control characters, extra redirect parameters, lookalike hosts and general profile/share/search URLs. Google documents [copying a review-request link](https://support.google.com/business/answer/16816815?hl=en) and exposes [review-link metadata](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations#metadata); controlled acceptance still needs to validate the actual customer's link. Booking URLs use their own public HTTPS rules and are not fetched or resolved by this code.

## Verification

Final coordinating-session verification uses Node 22.23.3, the deployment-target major version. The full suite includes disposable local PostgreSQL 17 fixtures and mocked provider calls. Reproduce from the isolated checkout after `npm ci --ignore-scripts --no-audit --no-fund`; PostgreSQL binaries must be available through the existing test environment's `A04_PG_BIN` or the A07 fixture override/PATH. No dependency manifest is changed.

```powershell
npm run typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
node scripts/test.mjs
node --experimental-strip-types --test tests/a07-booster-settings-ui.test.mts
npm run build
node scripts/production-smoke.mjs
```

The full suite passed **277/277**, with zero failures or skips. The final strengthened UI fixture also passed **2/2** after its test-only cleanup. Type generation and standalone TypeScript checking passed. Lint passed with zero errors and four existing internal-navigation warnings, including the unchanged Google OAuth navigation action in Booster settings. The final production build passed and generated two static CSP script hashes. It retained the existing Sentry global-error/client-config warnings.

The local production smoke passed static CSP hash parity, nonce-bound hydration/rotation, protected dashboard and Open Graph behavior, plus anonymous auth/Google/billing boundaries. It started an ephemeral loopback server with synthetic credentials and shut it down afterward. The hash manifest is checked for parity but remains outside the existing runtime CSP policy. These checks do not establish signed-in browser or live-provider acceptance.

Booking coverage verifies exact-body HMAC/timestamp bounds, malformed/oversized requests, owner-only secret-once credentials, caller-selected tenancy denial, atomic concurrent deduplication, rollback/retry, NULL/inactive entitlement denial, revocation and lifecycle-marker denial. CSV coverage runs concurrent production-route imports against the actual unique index, reports partial row failures/retries, normalizes timestamps, rejects malformed CSV and bounds multipart bodies before parsing. Settings coverage verifies real PostgreSQL concurrent omission preservation, explicit clears, invalid legacy retention/blocking, canonical owner/member behavior, safe destinations/sender headers, localized escaped booking CTA, first-location/pinned UI behavior and unchanged frozen-payload recovery.

The existing A05/A06 fixtures were updated only for the canonical owner predicate, real URL-validator import, supported direct Google review URLs and quoted sender display format; access-denial, quota, concurrency and exact frozen-replay assertions remain intact. Full-suite evidence is retained locally in ignored `a07-tests.log`, with typegen/type/lint/build/smoke logs alongside it. No real emails, Google calls, deployment, shared migration, or staging/production database changes were performed.

## Remaining acceptance and decisions

- A00 applies the reviewed migration and shared-file requests before rolling out consumers. A17 verifies the exact integrated release on its controlled targets.
- A15 inventories any existing booking webhook URLs/clients and migrates their authentication and field mappings deliberately. The new scoped HMAC contract does not accept legacy global Basic Auth.
- General Maps/share/short-link variants require a verified review-only destination contract before widening the Google allowlist. Validation does not fetch URLs or prove a configured booking page exists.
- `/r/[token]` is outside this worktree's owned route set. The precise guard and route-test request for A00/A13 are in [shared integration requests](A07_SHARED_INTEGRATION.md#tracked-review-links-a00a13). Existing legacy/frozen payloads are left intact; invalid targets are blocked when new messages are prepared or a token route is opened after integration.
- Real email deliverability, signed-in browser acceptance and provider-native booking acceptance are separate controlled acceptance work. The tests do not establish those outcomes.
- A11 deletion activation and A10 delivery-event/operator reconciliation remain their assigned packages. This task does not enable deletion or invent retention periods.

## Integration and rollback

Apply migration 023 before enabling the new booking routes. CSV conflict handling uses the existing migration 004 index; settings use existing business columns. No new package or environment variable is required. Credential encryption uses the existing key hierarchy, so retain its key while credentials remain in use. The final test environment uses Node 22 and disposable PostgreSQL 17; it does not inherit a staging database or provider credentials.

To withdraw the adapter, disable its clients/routes and revoke issued credentials before reverting application code. Keep integration-event dedupe history and A06 delivery/reservation records: removing them can admit duplicate visits or lose uncertain-delivery evidence. Migration 023 is additive; retaining its table/functions during an application rollback preserves credential metadata. Coordinate any later removal or cleanup with A00/A11 after exports and retention decisions. Do not roll back shared quota/delivery migrations as part of this package.
