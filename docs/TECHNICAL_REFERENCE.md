# Technical reference

Current implementation facts consolidated from the architecture, API, database and provider contracts. The migration files under `neon/migrations` are the schema source of truth; this document is a navigation and contract reference. Private or dated acceptance evidence belongs in [RELEASE_EVIDENCE.md](./RELEASE_EVIDENCE.md).

## Runtime and code layout

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 and Radix UI; Auth.js / NextAuth v5 beta.
- One Vercel-hosted Next.js app and Neon Postgres database; no separate worker service. Vercel is the primary scheduler: Booster at `7 * * * *`, Replies at `11 */4 * * *`, privacy at `0 3 * * *` (UTC). GitHub Booster/Replies workflows are manual recovery only; a separate GitHub Actions monitor calls health hourly at `15 * * * *`.
- `src/app` contains pages and route handlers; `src/components` shared UI; `src/modules/review-replies` and `src/modules/review-booster` feature modules; `src/lib` auth, business access, billing/provider policies, database, privacy, security and operations helpers.
- `migration-sources` preserves excluded historical source for migration reference; those are not runnable applications.
- Integrations: Google Business Profile, OpenAI, Stripe, Resend and Sentry.

## Identity, tenancy and durable state

`users` and `profiles` represent identity; `businesses` is the operating tenant; `business_members` represents workspace membership; `business_agents` grants per-business feature access and stores authoritative plan/Stripe periods. Canonical data reads/writes are business-scoped. `reviews.business_id` is canonical for reviews; each reply follows its review. Legacy `user_id` fields remain for compatibility. Application code owns authorization and scoping; do not assume database RLS is the access boundary. Active/trialing entitlements permit feature work. Lifecycle freezes deny ordinary work; recovery shells remain separately guarded.

Migrations currently include these durable contracts (consult `neon/README.md` for exact full order and compatibility details):

| Migration | Contract |
| --- | --- |
| 001–017 | Core identities, billing mirrors, Reviews/Projects/Leads, Google data, businesses/members/agents, Booster, suppression, pricing, retries, clicks, cron, tenancy, auth hardening, billing periods and original invitations. |
| 019 | Durable Stripe customer/checkout intents, owner-customer mapping, trial eligibility and reconciliation fences. Trial history is independently keyed by business and billing owner; only authoritative trial start consumes it. Unknown history fails closed. |
| 020 | `auth_version`, callback-aware verification tokens and single-use password reset tokens. |
| 021 | Atomic invitation and seat lifecycle. |
| 022 | Durable Booster accepted-delivery and UTC quota ledger. |
| 023 | Scoped booking intake and credentials. |
| 024 | Review draft/version/post state and generation reservations. |
| 025 | Resend provider events, provider ID/recipient correlation and global suppression. |
| 026 | Gated deletion operations and provider-call leases. `PRIVACY_ACCOUNT_DELETION_ENABLED` remains closed. |
| 027–028 | Persisted cron operations and dashboard indexes. |
| 031–032 | Selected Google location/connection generations and serialized workspace bootstrap. |
| 033–038 | Lifecycle guards/finalization and manual/CSV admission. |

018 is unused; 029–030 are reserved. Wave 4 also adds 033–038. Do not renumber existing migrations. Apply only reviewed migrations in the documented numeric process. Business-row locks serialize seat checks and billing snapshots; persistent user mutexes serialize invite acceptance and first workspace creation. Complete allows three seats counting owner and unexpired pending invites.

The lifecycle work uses compatible additive migrations and wrapper functions, not destructive rewrites of installed migration history. On a fresh sequence, migration 025 installs its guard around the base delivery admission function; migration 036 then wraps/renames that inner function to `begin_booster_delivery_send_a06` so lifecycle freeze checks compose outside the email-event guard. If 025 is reapplied after 036 exists, its conditional replacement targets the existing `*_a06` inner function and preserves the 036 outer wrapper. Verify this wrapper chain when applying the integration migration set. Migration 032 serializes first-workspace admission; migration 036 also fences delivery operations across lifecycle freezes. Historical A11 SQL proposals are now executable test fixtures and must remain byte-for-byte compatible with their tests; they are not a fresh production migration sequence.

### Booster ledger invariants

`booster_followup_deliveries` freezes provider payload and idempotency key before send. Atomic admission reserves against business, agent and UTC month under the business mutex. Accepted and unresolved outcomes occupy the reserved month. Legacy usage is separately frozen. Unknown outcomes stop automatic replay after the conservative 23-hour cutoff and require authoritative reconciliation. Never clear an uncertain send fence because time elapsed, automatically release its quota, change its payload/key, or let cleanup erase required usage/suppression evidence. A bounce, complaint or later failure does not refund an accepted send. Global Booster suppression prevents another workspace from sending to the same normalized address.

### Google and Replies invariants

`business_google_locations` stores one explicit selected cached location per business. OAuth credential replacement rotates `connection_version`; refresh preserves it. Cached rows from older generations are stale. There is no initial auto-selection or inferred canonical review backfill. Google calls pin the selected canonical resource and generation; never fall back to the first discovered location. Member output is limited to their business selection. Review draft state points at one current version while historical replies remain append-only. Generation leases and usage reservations protect the existing owner-profile billing-period/2,000 safety ceiling; no new business-shared UTC Reply ceiling has been approved. An uncertain Google post retains its fence; GET refresh cannot clear it.

Privacy exports include safe lifecycle/delivery/draft/reservation/booking metadata, not provider payloads, keys, leases, raw errors or credential secrets. Global suppression and trial eligibility are separate minimized evidence; do not remove them as an incidental workspace cleanup. Deletion route returns 503 before a user is frozen while its feature gate is closed.

Workspace bootstrap uses `ensure_workspace_for_user` under the persistent user mutex. A registered user is assigned the serialized default workspace only after eligibility checks; billing/trial mutations and connections remain owner-only. Cron jobs store durable `cron_job_state` and `cron_unit_state`, claim fenced runs and execute bounded cooperative units. `cron_alert_state` deduplicates missed-schedule/actionable failure alerts; monitoring receives fixed health codes and counts, never raw database errors. SQL runs in a transaction with local statement timeout and client abort. Daily cleanup rotates bounded table batches and retains unresolved billing/usage/suppression/lifecycle evidence.

## Provider resource and API contracts

### Google Business Profile

OAuth asks for `https://www.googleapis.com/auth/business.manage`. Discovery paginates Account Management `accounts.list` (`pageSize=20`), then each `accounts/{accountId}/locations` collection through Business Information v1 with `readMask=name,title,storeCode,storefrontAddress,metadata,categories` and `pageSize=100`; carry page tokens, validate resource names, deduplicate canonical names and cap the overall discovery at 200 provider requests. `placeId` and `newReviewUri` come from location metadata. Discovery never chooses a location automatically and never overwrites a manual Booster link.

Reviews use Reviews API v4 `accounts/{accountId}/locations/{locationId}/reviews`, following page tokens up to a local cap of 20 pages (maximum 1,000 reviews per sync). Google review `pageSize` is at most 50. Exceeding the cap fails the full sync without partial persistence. Replies use `PUT accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply` with `{"comment":"…"}`. Reply text is at most 4096 UTF-8 bytes. Provider 429/503 maps to retryable responses with bounded numeric `Retry-After`; other provider errors map to 502. Tokens are encrypted at rest, bearer calls are restricted to configured Google HTTPS origins, refresh is bounded and concurrent replacement cannot overwrite a newer connection generation.

Location selection route: `POST /api/google/locations/selection` body `{ businessId?, locationId }`; owner-only, requires current business entitlement, checks the cached owner location against live canonical discovery and the same connection generation. Same selection is idempotent; changing an existing selection returns 409. Malformed or unauthorized selection is rejected; missing/stale/disconnected selection returns 409. A08 endpoint details and official endpoint references are retained in Git history.

Google project approval, APIs/quota, OAuth branding/publication and a consenting eligible real client remain external acceptance items. A code-level pass or local readiness script is not provider approval. API names/caps above are method-specific; consult the official Google references before any changed provider integration.

### Resend

`POST /api/webhooks/resend` is a bounded raw-body Svix-authenticated endpoint using `RESEND_WEBHOOK_SECRET`. Subscribe only to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. Validate event and provider email IDs, recipient, type and tag shape before atomic persistence. Replays of identical signed event IDs are acknowledged as duplicates. Bad signature 401; invalid input 400; oversized body 413; unmatched/conflicting tagged evidence or persistence failure 503 for provider retry; unrelated valid events are ignored safely.

Delivery and acceptance are distinct. `sent` is accepted, while delivered/delayed/bounced/complained/failed/suppressed are their corresponding later states. Open/click/queued/scheduled/canceled provider snapshots prove an object exists but count only as accepted, never delivered. A bounce/complaint suppresses future Booster sends globally. Event/correlation hashes remain linkable personal data. Provider lookup reconciliation is disabled by default and accepts only positive identity evidence; it never sends, rekeys, releases quota or infers rejection from 404/timeout/missing match. It checks exact provider ID, unique delivery tag, frozen/current recipient, sender, subject and exact available body for an operator-supplied ID when the full payload remains. If a trusted ID is already stored after payload cleanup, lookup is limited to that exact ID and recipient fingerprint. Default disabled response is 503; 200 is durable confirmation, 202 remains unresolved, 409 rejects mismatched/ineligible evidence. No automatic retries on unknown results.

Production setup requires a verified Resend sending domain, SPF/DKIM records copied from the account, verified `EMAIL_FROM`, deliberate DMARC alignment review, configured webhook and signing secret, and an owned-inbox acceptance. Previously observed sender or message receipts do not automatically prove current app configuration or full delivery flow.

### Booking intake and review links

Booking credentials are scoped to one business, encrypted, revealed only once on creation and revoked by an owner. `POST /api/webhooks/booking` authenticates bounded raw-body HMAC and timestamp with that credential; business identity comes from the credential, never caller-selected IDs. Event/visit creation is atomic and deduplicated. CSV imports have independent normalized conflict handling and multipart/body bounds. **Owner-approved A22 target, not yet fully implemented:** manual/CSV/webhook intake must capture and enforce purpose-specific permission evidence before sending. Existing intake route support does not establish that this evidence is enforced end to end. Direct review destinations permit only validated HTTPS Google review URLs (including supported direct `g.page/r/{id}/review` forms); reject credentials, controls, redirect parameters, lookalike hosts and generic profile/share/search URLs. Booking URLs have their own public HTTPS validation and are not fetched. No general Maps/share/short-link widening is implied.

## Route index

All protected routes require an Auth.js session unless noted; scheduled routes require `Authorization: Bearer <CRON_SECRET>`. The complete route source remains under `src/app/api`; use this list to find the contract families.

| Surface | Routes and behavior |
| --- | --- |
| Auth | `/api/auth/[...nextauth]`; register, verify-email, resend-verification, forgot-password, reset-password and signout. Recovery requests use generic responses, bounded payloads/rates and single-use hashed tokens. |
| Dashboard/team/privacy | `/api/user/plan`, `/api/dashboard/summary`, `/api/team`, owner-only `DELETE /api/team/members/[userId]`, `/api/team/invitations/[token]`, `/api/privacy/export`, `/api/privacy/delete` (default 503 while disabled). |
| Replies/Google | `/api/reviews` (business/selected location, cursor limit <=100), `/api/reviews/draft`, `/api/settings/reply`, `/api/openai/review-reply`, `/api/google/oauth/start`, `/api/google/oauth/callback`, `/api/google/connection`, `/api/google/disconnect`, `/api/google/locations`, `/api/google/locations/list`, `/api/google/locations/sync`, `/api/google/locations/selection`, `/api/google/reviews/sync`, `/api/google/reviews/process-pending`, `/api/google/replies`. |
| Booster | `/api/review-booster/settings`, `/api/review-booster/visits` (cursor page/manual visit), `/api/review-booster/upload`, `/api/review-booster/run-now`, `/api/review-booster/unsubscribe`, `/r/[token]`, `/api/review-booster/booking-credentials`, `/api/webhooks/booking`, `/api/webhooks/resend`, `/api/review-booster/deliveries/[deliveryId]/reconcile` (disabled by default). |
| Jobs and reporting | `/api/cron/review-booster`, `/api/cron/review-replies`, `/api/cron/health`, `/api/cron/privacy`, `/api/csp-report`. |
| Billing | `/api/stripe/checkout`, `/api/stripe/change-plan`, `/api/stripe/portal`, `/api/stripe/webhook`. Checkout trial behavior must follow the durable one-time policy; grant requires authoritative Stripe state. |
| Public and compatibility | `/api/audit/free-profile`, `/api/leads` (marketing enquiry only), `/api/feedback`, `/api/public-demo/review-booster`, `/api/projects`, `/api/projects/[id]`. There is no current `/content` page. |

Common errors: 400 invalid input; 401 missing/invalid authentication; 403 plan/agent/role denial; 404 absent resource; 409 conflicting/stale state; 502 upstream provider error; 500 unexpected error. Cron additionally uses 202 resumable continuation, 409 live-lease `Retry-After`, 500 actionable failure and 503 untrusted health state.

## Server error reporting boundary

`src/instrumentation.ts` initializes the Node and edge SDK configs and captures server request errors with a fixed message plus a bounded optional numeric digest; it does not pass the original exception, stack or request context. Server SDK config disables default integrations and transaction tracing, drops transactions and breadcrumbs, and runs an allowlist sanitizer. Only the fixed server-boundary message or enumerated cron health messages (jobs `review_booster`, `review_replies`, `privacy_retention`; reasons `never_run`, `missed_schedule`, `stale_running`, `partial`, `failed`) are accepted. The sanitized event omits request URL, source error/stack, user data, breadcrumbs, contexts and extras. This server policy does not erase server ingress metadata added downstream by Sentry. Browser telemetry follows its separate client policy. `NEXT_PUBLIC_SENTRY_DSN` enables the runtime SDK; delivery and recipient acceptance must be separately evidenced.

## Provider source references

- Google [Account Management accounts.list](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list), [Business Information accounts.locations.list](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list), [Reviews list](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list), and [updateReply](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply).
- Google [API prerequisites](https://developers.google.com/my-business/content/prereqs), [basic setup](https://developers.google.com/my-business/content/basic-setup), [API limits](https://developers.google.com/my-business/content/limits), [OAuth brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), and [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
- Resend [retrieve sent email](https://resend.com/docs/api-reference/emails/retrieve-email), [webhook event retrieval](https://resend.com/docs/api-reference/webhooks/get-event), and [webhook attempt retrieval](https://resend.com/docs/api-reference/webhooks/list-event-attempts). The accepted lookup contract relies on the API reference documenting response tags; verify this field with a controlled test account before enabling reconciliation.
- Stripe [customer deletion](https://docs.stripe.com/api/customers/delete) returns a tombstone and does not substantiate erasure of all provider-held financial history.
- Google [direct review link guidance](https://support.google.com/business/answer/16816815?hl=en) and [location review-link metadata](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations#metadata).
