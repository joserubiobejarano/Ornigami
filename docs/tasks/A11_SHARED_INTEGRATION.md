Subject: A11 shared integration contract for deletion freeze, recovery, and provider drain

This is a review proposal for A00 and A03/A04/A05/A08 integration. It is not an
applied source patch. The current checkout is based on a513887. Product source
files remain owned by their package owners. Apply only after the migration 026
API and shared-file handoffs are agreed. A11 must remain disabled by default
until every required gate below is present and reviewed.

Baseline source evidence (commit a513887, before concurrent A11 edits)
=====================================================================

* `src/app/api/privacy/delete/route.ts:8-16` currently deletes the user row
  immediately and signs out. It has no provider cancellation, durable progress,
  workspace-owner check, or response-loss recovery.
* `src/auth.ts:67-96` checks `auth_version` and live user existence on every JWT
  callback. `src/auth.ts:98-104` requires a normal session id. A04's existing
  deleted/stale-token fence is useful after the final DELETE.
* `src/app/api/stripe/checkout/route.ts:107-181` may provision a Stripe customer
  before the checkout claim. Lines 201-203 resolve context and provision that
  customer before the route reaches its durable checkout-intent claim. Lines
  279-342 claim/create/finalize the Stripe Checkout Session. Migration 019's
  `claim_billing_checkout_intent` serializes checkout claims for an owner
  (`neon/migrations/019_billing_lifecycle.sql:98-156`) but does not check any
  deletion state and does not fence customer provisioning or the external call.
* `src/lib/billing/reconciliation.ts:248-313` provides A11's mapped-subscription
  cancellation step under the owner reconciliation lease. Its own contract
  says it cannot discover Stripe-side orphans or unresolved Checkout Sessions.
* Checkout recovery already enumerates all pages for each session status by
  iterating Stripe's async list (`checkout/route.ts:55-64`). This is a useful
  pattern, but deletion must cover all owner sessions and subscription states,
  not only the intent currently being retried by checkout.
* `src/auth.ts:69-80` invokes `ensureUserFromOAuth`; `src/lib/db/users.ts:35-58`
  inserts missing rows and upserts existing rows. Pending deletion must block
  OAuth profile writes. After final deletion, a fresh Google sign-in may create
  a new account under current A04 behavior; this is intentional re-enrollment,
  not stale-session resurrection. Credential sign-in (`auth.ts:39-56`), signup
  (`register/route.ts:36-42`), password reset (`auth-verification.ts:87-105`),
  email verification (`auth-verification.ts:63-85`), and verification/reset
  request creation also need a consistent pending/deleted policy.
* `src/proxy.ts` treats any session user as an ordinary signed-in user; it has
  no restricted deletion route. Most APIs deny a session without `user.id`,
  but that is not a substitute for an explicit proxy allowlist and route guard.
* A05's SQL functions lock business rows and then actor/member user rows before
  invitation mutations (`neon/migrations/021_workspace_invitations.sql:59-90,
  144-177, 215-258`). Workspace bootstrap locks the user row
  (`032_workspace_bootstrap.sql:1-36`). A11 freeze must serialize against
  those writers and A05 must recheck lifecycle state in the same transaction.
* Google callback validates OAuth state and business ownership before exchange,
  then exchanges at `src/app/api/google/oauth/callback/route.ts:54-78` and saves
  at lines 85-102. A deletion can start during the provider exchange. The sync
  route fetches externally and persists afterward (`google/reviews/sync/route.ts:42-52`),
  so persistence needs an active-user fence even when the fetch began earlier.
* `tests/security-hardening.test.mts` covers retention constants, but there is
  no current behavior test for the privacy delete/export API, provider cleanup,
  frozen-session recovery, or cross-writer deletion races.

Required migration 026 surface
==============================

The implementation should expose these semantics, regardless of final SQL
names. A11 owns migration 026 and its database tests; A03/A04/A05/A08 own the
call-site integrations.

1. A durable account lifecycle state keyed by the canonical UUID user id:
   `active | deleting`, one stable deletion operation id, current phase, and
   provider cleanup outcome. It must survive route restarts and be queryable
   without returning personal data. Starting deletion is idempotent and
   transactionally locks against all account/workspace/provider admission
   functions. Repeated DELETE requests resume the existing operation.
2. Shared account lifecycle transaction/admission guard used by workspace
   bootstrap, all team invite/accept/remove/revoke operations, billing customer
   provisioning, checkout intent claims, plan changes, portal creation, Google
   OAuth persistence, token refresh persistence, and Google review sync writes.
   Mutation routes must recheck at the final local write, not only at request
   entry. A05 must hold the same guard through seat reservation/acceptance and
   reject both a deleting owner and a deleting invited account.
   The common `resolveBusinessContext` query in
   `src/lib/business-context.ts:35-61` must join the owner row and filter
   `owner.privacy_deletion_requested_at IS NULL` in both its selected-business
   and default-business branches. Otherwise a member's JWT remains valid and
   that member can keep using the frozen owner's workspace. The same owner
   filter must be present in `getBusinessForUser` / `ensure_workspace_for_user`
   admission, and DB mutation functions must check it in their write
   transaction.
3. A provider-operation lease/outstanding-operation record for external
   mutations that can outlive the claim transaction. At minimum owner customer
   creation, checkout session creation, and OAuth code exchange/token
   persistence need bounded active leases plus fences. Freeze blocks new leases,
   waits for live leases to finish/expire, and then reconciles durable intents.
   Use bounded provider request timeouts shorter than the lease.
   Expired/uncertain work is not proof that the provider did nothing; reconcile
   by immutable provider metadata/idempotency token, or keep deletion pending.
   Migration 026's owner locks serialize admission
   only if A03 uses the same locks around customer/checkout claims; A03 call sites still need that integration.
   Leases, not claim locks alone, drain a route that committed a claim before calling Stripe.
4. Migration 026 adds `provider_create_lease_until` and
   `provider_create_finished_at` to checkout intents, plus
   `begin_billing_checkout_provider_call(intent_id,fence)` and
   `finish_billing_checkout_provider_call(intent_id,fence,outcome)`. A03 must
   acquire the lease immediately before `checkout.sessions.create`, and finish
   it after known success/failure or mark the result uncertain on timeout/lost
   response. Migration 026 also provides customer provisioning
   leases/functions: A03 must acquire/finish those around both `customers.create`
   branches as well. Freeze blocks new leases, waits/retries
   while active leases are live, then resolves the immutable intent/customer
   token. Missing provider objects after a lease expires remain hard blockers;
   they are not evidence that Stripe did nothing. Finalize rechecks no active
   create leases and no pending/uncertain intent or customer-provisioning row.
   This closes the late provider-create race that enumeration alone cannot
   close.
5. Migration 026 implements `privacy_begin_account_deletion` and
   `privacy_finalize_account_deletion` with advisory locks acquired in this
   order: `billing-customer:<uuid>`, then `billing-checkout-owner:<uuid>`, before
   operation/business/user row locks. Finalization then locks affected
   businesses in sorted order and the actor user, and rechecks accepted members
   and live pending invitations. If shared workspace data appeared after an
   unconfirmed start, finalization returns a consent-required result. The route
   releases its lease and returns 409 with `confirmationRequired: true` and the
   existing operation id; a restricted retry may upgrade consent on that same
   operation, never create a new one. A03 admission must use matching locks and check
   the lifecycle marker in its claim transaction. A05 locking must remain
   business-before-user and include lifecycle admission checks inside its SQL
   functions; route-only checks have a TOCTOU gap. Workspace bootstrap needs a
   compatible lock order. Migration tests must demonstrate no deadlock and no
   unconfirmed workspace deletion. Explicit consent authorizes deletion of the
   owner's business container and dependent workspace data while preserving
   teammate user/profile rows, unrelated businesses, and authored attribution.
6. Preserve unresolved provider evidence on all failures. Do not cascade-delete
   checkout intents, owner-customer mappings, trial histories, reconciliation
   leases, or the deletion operation while deletion is retryable. Migration 026
   drops the user FK from `billing_trial_owner_history`, preserving
   anti-abuse history under its old UUID. This does not link that history to a
   later account created by an intentional new Google sign-in with the same
   email; whether re-registration should inherit trial eligibility needs an
   explicit privacy/product policy. Do not add a permanent email digest without
   that policy and a reviewed key/retention basis.

Integration status and remaining gates
======================================

Migration 026 and the A11-owned source are present in this checkout; the
shared-file proposal below remains unapplied.
Keep `PRIVACY_ACCOUNT_DELETION_ENABLED` unset/false until each row in
`A11_PRIVACY_ACCOUNT_LIFECYCLE.md` is implemented and reviewed. The route's
server-side default-closed check is the safety gate while that work is pending.

* A04: [the restricted-auth proposal](./A11_RESTRICTED_AUTH.patch) includes
  Auth.js callback and proxy behavior tests. Its separate disposable worktree
  passed the A11 callback/proxy tests plus existing Auth.js Core/JWT tests (4/4),
  `tsc --noEmit`, and `git apply --check` against a513887. It is still a
  proposal, not integrated source. The OAuth upsert in this proposal is
  conditional on the row still being active and returns a frozen row without
  profile writes, so reauthentication cannot refresh its profile. The proposal
  includes the restricted-route allowlist and redirect/API denial; all A04
  shared changes remain unapplied.
* A02: `src/lib/business-context.ts:35-61` still resolves membership without
  checking the business owner's lifecycle marker. This leaves active teammates
  access to a frozen owner's workspace. Filter frozen owners in both selected
  and default branches and guard direct `getBusinessForUser` / bootstrap writes.
* A03: migration 026 implements short customer-create and checkout-session
  leases and finalization checks for unresolved customer provisioning. A03
  claims/call sites do not yet use those APIs. Owner customer provisioning
  (`checkout/route.ts:107-181`) calls `stripe.customers.create` before checkout
  intent claim, so both external creates need durable admission/drain fences.
  A03 must use customer-then-checkout lock order for any combined path. The helper
  now reconciles for both owners and members, including legacy `user_billing`
  maps; unknown/unmapped resources remain fail-closed.
* A05: invitation and bootstrap SQL still lacks the deletion guard; freeze needs
  the compatible business-before-user order and a same-transaction recheck for
  invitations, acceptance, membership writes, and bootstrap. Migration 026
  counts accepted members and live pending invitations for owner confirmation
  and rechecks at finalization; an unconfirmed late admission returns the same
  operation for explicit consent upgrade. The migration test holds a business
  admission through finalization and verifies the confirmation/retry path; A05
  still needs to guard its actual write functions.
* A06/A09/A12: scheduled job selection and in-flight send/reply work need owner
  freeze predicates and operation drains. A user-facing auth restriction does
  not stop background jobs that query active `business_agents` or Google
  locations directly.
* A08: callback token exchange/save, refresh persistence, and sync final writes
  remain unfenced. A previously completed `google` deletion step must not be
  trusted until these writers are drained or finalization rechecks that no
  credential was reconnected.
* Privacy UI: current `/privacy` is policy copy and there is no account deletion
  retry screen in this change. The restricted-session page/recovery UX is an
  A13 handoff: keep pending status visible, retry the same operation, recover
  response loss, and sign out only after confirmed completion.

Migration 026 counts accepted members and live pending invitations as shared
workspace data. When accepted members or live pending invitations exist, an
explicit `confirmSharedWorkspaceData: true` is required before the initial
freeze/provider side effects; a racing admission without prior confirmation
must be rechecked and require the same explicit confirmation before finalizing.
Confirmation allows deletion of the owner's workspace container and dependent
history while preserving other users' rows, unrelated businesses, and authored
attribution. Members deleting their personal account must not cancel a
workspace owner's subscriptions.

Restricted authentication contract (A04-owned shared files)
============================================================

Do not bump `auth_version` at freeze unless the same operation also establishes
an independent recovery credential before the success response can be lost.
The recommended simple contract is to keep the version stable while deletion is
pending. A pre-existing cookie can then refresh into a *restricted* session;
normal requests receive no actor id, while one dedicated deletion recovery route
receives a separate `deletionUserId`. The final database DELETE makes the
existing live-row/version check reject that cookie. If a future implementation
bumps `auth_version` during freeze, it must add and test a separate reauth or
signed recovery capability; the old cookie alone cannot retry.

Proposed A04 changes:

* Extend the live user lookup used by `auth.ts:89-95` to return lifecycle state
  with id/version. A missing row, database read error, or unknown state returns
  no JWT as today. An `active` row yields the normal session. A `deleting` row
  yields a restricted session only: clear `session.user.id`, email, name, and
  image; set `session.deletionUserId` from the canonical JWT subject; set an
  explicit `session.accountLifecycle = "deleting"`. Do not reuse a user-supplied
  request field as the recovery id.
* Keep the JWT subject internal so it can be looked up on refresh, but never
  copy it into `session.user.id` while deleting. Add matching Auth.js type
  declarations. Normal API helpers and UI guards must require a truthy normal
  `session.user.id`; only `/api/privacy/delete` may consume
  `session.deletionUserId`, and it must reload the lifecycle row and verify the
  same operation on every retry.
* `src/proxy.ts` must route a restricted session only to a small
  `/account/deletion` recovery page, `/api/privacy/delete` (and a read-only
  deletion status action if implemented), plus sign-out/static assets. Other
  protected pages redirect to that recovery page; all unrelated API routes
  return 401/403. The recovery page must not receive the ordinary email/id.
* Credentials and OAuth reauthentication of a still-present `deleting` account
  may establish only that restricted session, so a lost response remains
  recoverable on another device. OAuth must never turn a deleting state active.
  `ensureUserFromOAuth` must not reactivate or update a deleting row. A later
  fresh Google sign-in after the row has been deleted is an intentional new
  account creation under current A04 behavior; do not confuse that flow with a
  stale JWT refresh, which only calls `findUserById` and must fail for the
  missing row. Whether that new account inherits the old trial history is an
  unresolved policy as described above.
* While deleting, signup must not create/re-enable the identity; verification
  and password-reset token creation/consumption must not change user state,
  auth_version, or lifecycle. Preserve generic account responses to avoid
  exposing whether a deleting/deleted identity exists. Reset password remains a
  normal recovery path only for `active` accounts.
* Keep `auth_version` unchanged at freeze. Incrementing it at this point revokes
  every current cookie and prevents retry through `auth()`. Final user-row
  deletion invalidates all sessions through A04's existing live-row check.

Billing and provider drain contract (A03/A08-owned shared files)
===============================================================

* Every Stripe route must consult the account guard before provider work. In
  checkout, guard before `getOwnerCustomer` (which can create a customer), not
  only before `claimCheckoutIntent`; also guard customer provisioning inside
  its SQL claim/finalize path. Apply the same rule to change-plan and portal
  session creation. A check in TypeScript without a durable claim/lease is not
  sufficient across the provider call.
* Update migration 019 claim functions under the common lifecycle lock so no
  new checkout or customer provisioning intent can be claimed after freeze.
  Record/fence in-flight Stripe mutations durably. Freeze waits for those leases
  to settle/expire before enumeration. After a crash/timeout, status remains
  uncertain until a full provider reconciliation proves the outcome.
* Before deleting mappings, enumerate every checkout intent for each canonical
  owner customer, including pending, uncertain, completed, and legacy/unmapped
  states. Use every Stripe pagination page and immutable `billing_intent_token`
  metadata. Validate customer and owner/business metadata against persisted
  mappings. Expire only sessions Stripe confirms are `open`; the official API
  accepts expiration only for `open` sessions. A `complete` session can still
  be processing, so retrieve/resolve its subscription or leave deletion pending.
* Run `cancelMappedOwnedBillingSubscriptions` for its documented local mappings,
  then list every provider subscription for the owner customer across all pages.
  Cancel every nonterminal subscription that validates to this owner; an
  unmapped, duplicate, cross-owner, or metadata-conflicting subscription keeps
  the operation pending for reconciliation. Re-enumerate subscriptions after
  open-session expiration and immediately before final local deletion. Keep the
  owner-wide billing reconciliation lease exclusive with webhook snapshots;
  webhook delivery may continue, but no final local cleanup may race it.
* Do not use Stripe Customer Search as negative proof that a customer/session or
  subscription does not exist. Stripe says Search is not read-after-write
  consistent and can lag up to an hour during outages. Search results may help
  discover positive matches, but an empty result leaves the provider outcome
  uncertain. Use the exact persisted customer id, immutable intent token/session
  ids, exhaustive list APIs, and fail closed where identity cannot be
  established. See [Stripe Search customers](https://docs.stripe.com/api/customers/search).
* The Stripe Checkout Sessions list API returns up to `limit` records and uses
  `starting_after` pagination; Stripe's SDK async iterator can exhaust pages.
  Expiration is only valid while status is `open`. See [List all Checkout
  Sessions](https://docs.stripe.com/api/checkout/sessions/list) and [Expire a
  Checkout Session](https://docs.stripe.com/api/checkout/sessions/expire).
* Keep Stripe customer mapping and immutable intent evidence until all
  subscriptions are authoritatively terminal and unresolved sessions are
  conclusively reconciled. Unknown provider outcomes are retryable/pending, not
  success. The current A03 cancellation helper does not implement this broader
  discovery/drain by itself.

Google callback/sync contract (A08-owned shared files)
======================================================

* Before token exchange, callback verifies the lifecycle state is active. The
  final token save must be atomic with the same guard and OAuth connection
  generation. If freeze wins during the exchange, do not persist the new
  credential; revoke the just-exchanged refresh token as compensation and keep
  deletion pending if revocation outcome is unknown.
* Freeze invalidates OAuth state cookies for the current device only; a callback
  from another device can still be in flight. The callback's SQL write must
  refuse after freeze. Token refresh/legacy upgrade must also use the lifecycle
  guard in addition to the existing connection-version/encrypted-token CAS in
  `src/lib/db/gbp.ts:68-92`.
* Review sync may fetch provider data before freeze commits. Its final batched
  persistence function must acquire/check the lifecycle fence in the same
  transaction as the insert/update, so a response fetched before freeze cannot
  repopulate local data after deletion cleanup. Apply equivalent final-write
  checks to Google location-cache/reply state; active external reply-post
  operations need a drain lease if they can finish after freeze.
* User-context guards do not stop scheduled work. `cron/review-booster/route.ts`
  selects active/trialing `business_agents` directly, and
  `cron/review-replies/route.ts` selects active locations/subscriptions. Both
  selectors must join `businesses` to the owner `users` row and exclude frozen
  owners. Any in-flight runner that has already claimed a send/reply needs an
  A06/A09 operation lease that A11 waits to drain before token revocation or
  deleting the workspace. A12 owns cron timeout/health semantics; coordinate
  with it rather than assuming a new run will not start after the selector.
* Implement revocation against Google's documented
  `https://oauth2.googleapis.com/revoke` form endpoint, with a bounded timeout.
  Treat HTTP 200 as success. `invalid_request`, timeout, network failure, or
  any unrecognized response remains retryable and must keep local encrypted
  credentials. Google says revocation can take time to fully take effect and
  can invalidate all scopes/tokens granted to the project. After acknowledged
  revocation, delete the saved connection using a compare-and-delete over the
  connection generation and encrypted token so a later reconnect cannot be
  erased by stale cleanup. See [Google OAuth revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
  and [revocation endpoint errors](https://developers.google.com/identity/openid-connect/reference#revocationendpoint).

Deletion route/UI response contract (A11-owned)
===============================================

* First POST validates same-origin/CSRF and the explicit confirmation phrase,
  then atomically creates or resumes one operation row. Never trust a client
  operation id to select another user's operation. An owner with surviving
  teammates must explicitly confirm deletion of their business container and
  workspace data. That confirmation must not delete teammate user/profile rows,
  unrelated business data, or authored attribution needed by surviving users.
  Without confirmation, return 409 before freeze/provider side effects. Member
  deletion removes only that member's membership and personal data; it does not
  delete the workspace.
* Current route contract from the deletion agent is `202 { ok:false,
  recoverable:true, operationId }` while frozen/retryable, `409` while another
  lease is busy, and `200 { ok:true }` only after provider
  cancellation/revocation and final local deletion commit. Never report success
  just because the HTTP request began or a cancellation request was sent.
* UI keeps the confirmation dialog/status view open for `pending` and errors,
  gives a Retry action that resends the same confirmation to the idempotent
  endpoint after network loss, and never offers a second deletion start while
  the actor has a frozen operation.
  It displays no provider error body/token/id. It signs out and clears local
  dashboard state only when the response says `deleted`; a lost response then
  recovers through the restricted session or reauthentication contract above.
* `GET /api/privacy/export` must reject a restricted deletion session or export
  only a stable, explicitly documented snapshot. A deleted/pending account must
  not regain access to an ordinary export containing unrelated workspace data.

Behavioral acceptance tests (not string/grep assertions)
=========================================================

1. Auth.js callback tests: active JWT -> normal id; deleting JWT -> restricted
   session with no id/email; stale version/missing user/read failure -> no
   session; final user DELETE -> next callback rejects old token. Test both an
   existing cookie refresh and successful credentials/OAuth reauthentication
   for a still-deleting account. OAuth must not upsert/reactivate that account.
2. Proxy/API tests: restricted session can load only recovery and post deletion
   retry; normal dashboard, team, billing, Google, export, and product API calls
   deny. Recovery uses the server-derived deletionUserId and cannot accept a
   different user/operation id from JSON.
3. Privacy route tests: owner/member decision, same-origin check, explicit
   confirmation, provider failure -> pending response, repeated POST reuses one
   operation id, lost response followed by retry completes once, and local user
   row is never deleted before every provider fence is terminal. Verify cookies
   are cleared only on confirmed completion.
4. PostgreSQL concurrency tests: pause a checkout after its durable claim but
   before Stripe create; freeze must block new claims and must not complete until
   the in-flight lease is drained and the resulting session is reconciled.
   Repeat with customer provisioning, change-plan, workspace bootstrap, invite
   reservation, invite acceptance, Google callback save, token refresh save, and
   review persistence. Assert no post-freeze writes/side effects and no deadlock.
5. Stripe mocked provider tests: >100 sessions/subscriptions; open session
   expires; completed session subscription is resolved/canceled; uncertain
   missing session blocks deletion; foreign/unmapped object blocks; duplicate
   or conflicting mapping blocks; webhook lease contention is retryable; all
   terminal results resume after a simulated process restart. These test the
   provider adapter with paginated fixtures and do not claim live acceptance.
6. Google mocked provider tests: HTTP 200 success; HTTP 400/error and timeout
   remain pending for operator resolution unless a precisely documented error
   class is deliberately accepted as terminal; callback freeze during code
   exchange compensates the fresh token; token CAS doesn't remove a reconnect;
   in-flight sync cannot write after freeze.

Official provider references
============================

* Stripe list/expire semantics: the API references linked above.
* Google accepts a refresh or access token at the revoke endpoint, returns 200
  on success and an error response for failure; its documentation notes that
  revocation may take time to take full effect. Links above.
