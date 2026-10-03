# A11 privacy account lifecycle handoff

Status: isolated implementation ready for root review; shared guards remain a
mandatory integration gate. `PRIVACY_ACCOUNT_DELETION_ENABLED` must remain unset
or anything other than `true` until the gates below are integrated, tested, and
reviewed. The route returns 503 before it freezes an account while that gate is
closed. No live database/provider, deployment setting, or shared source file was
changed by this task.

No dependencies, package metadata, model settings, `.env` values, or runtime
feature-gate settings were changed. The only proposed rollout control is the
default-closed server check for `PRIVACY_ACCOUNT_DELETION_ENABLED`; the gate is
submitted for integration and remains disabled. Migration 026 is also required
by the export queries and restricted-auth proposal. It has not been applied to
any live database.

## A11-owned implementation

* Migration 026 adds a durable freeze marker and idempotent operation ledger,
  fenced/recoverable provider steps, checkout/customer provider-call leases,
  owner/customer lock ordering, workspace confirmation, and a final transaction
  that deletes the actor only after provider steps and billing drains succeed.
  It preserves prior trial history under the old UUID and keeps a minimal
  operation record without a user FK.
* `POST /api/privacy/delete` is same-origin only, checks the exact phrase
  `DELETE MY DATA`, starts or resumes the server-selected operation, and returns
  pending/retryable state until the final delete commits. Restricted recovery
  uses server-provided `session.deletionUserId`; it does not trust an operation
  id from the request body.
* Stripe cleanup checks local mappings and durable checkout intents, enumerates
  provider pages, expires only open sessions, resolves immutable intent tokens,
  cancels subscriptions, then re-enumerates before allowing local deletion.
  Unknown ownership, missing/ambiguous sessions, stale mappings, provisioning
  uncertainty, provider errors, and timeouts fail closed.
* Google cleanup revokes the stored grant with a bounded request before local
  account removal. Any non-200 result currently stays retryable; HTTP 400 needs
  operator resolution unless a later reviewed adapter safely classifies a
  documented terminal error. The encrypted local credential remains until
  final deletion succeeds.
* `GET /api/privacy/export` returns personal or canonical-owner workspace data
  in one statement snapshot, denies frozen/stale accounts, and excludes
  credentials, bearer tokens, invitation secrets, provider payloads, and
  teammate identity. Workspace projections include safe A06 Booster delivery
  state and UTC quota baseline plus A09 reply-draft state and usage-reservation
  summaries, while omitting the new projections' provider payloads and IDs,
  fencing/idempotency/generation/posting tokens, provider errors, and actor IDs.
  The retention helper preserves those histories through account/workspace
  deletion. It processes bounded batches and reports partial failures; the A12
  cron route has a separate apply patch.
* Owner deletion with explicit shared-workspace confirmation deletes that
  owner’s business container and dependent workspace content. Surviving teammate
  user/profile rows, unrelated businesses, and authored attribution remain.
  A member’s deletion does not cancel a workspace owner’s subscription.
* The final transaction takes advisory locks in customer-then-checkout order,
  then locks the operation row, affected businesses in sorted order, and the
  actor user. It rechecks accepted members and live invitations. If shared data
  arrives after an unconfirmed start, the route releases its lease and returns
  `409 { confirmationRequired: true, operationId }`; an explicit retry upgrades
  consent on that same operation. A05 must use business-then-user ordering and
  lifecycle guards.

The detailed export/retention contract is in
[A11-privacy-export-retention.md](./A11-privacy-export-retention.md). The
A12-owned cron integration is [A11_PRIVACY_CRON.patch](./A11_PRIVACY_CRON.patch).

## Integration and rollout order

Migration 026 must be applied before deploying shared code that selects
`users.privacy_deletion_requested_at`, calls its provider lease functions, or
serves the export/restricted-auth changes.
The migration is additive; existing accounts remain active because the new
marker is null. Then integrate and verify A02/A03/A04/A05/A08 plus the A06/A09
job drains and A12 cron handoff. Include A13 recovery UI and the reviewed
operator procedure before launch. Keep the feature gate closed during these
steps and set it to `true` only after the integration/race-test review. No
runtime setting was changed in this task.

## Required shared integration before enabling

| Owner | Required change | Current review state |
| --- | --- | --- |
| A04 auth/session/proxy | Apply [restricted-session proposal](./A11_RESTRICTED_AUTH.patch); pending users receive no ordinary `session.user.id` or PII, only top-level `deletionUserId`; permit only the deletion recovery route/page and Auth.js endpoints; deny ordinary APIs/pages. OAuth upsert must not mutate a pending profile. | Auth.js session and proxy behavior tests pass in a disposable worktree, as do `tsc --noEmit` and patch-check; not integrated. |
| A02 business access | Filter frozen owners in both `resolveBusinessContext` query branches and direct bootstrap/business admission. A surviving member must not read or mutate a frozen owner’s business. | Not integrated; current `src/lib/business-context.ts` does not inspect owner lifecycle. |
| A03 billing | Guard all checkout/customer provisioning, plan change and portal admission; acquire and finish customer/session create leases around provider calls; mark lost responses uncertain and reconcile idempotently. Update checkout/customer SQL claims and final writes to use migration 026 lock ordering, checking the freeze marker in the same transaction. | Migration surfaces exist, but A03 call sites/claims are not integrated. `stripe.customers.create` currently precedes checkout intent claim. |
| A03 webhook/reconciliation | Keep webhook reconciliation leases exclusive with deletion cleanup; make replayed provider events unable to restore local billing mappings after freeze/final cleanup. | Not integrated/reviewed. |
| A05 team/bootstrap | Use compatible lock ordering and in-transaction lifecycle checks for invitation create/accept/revoke, member changes, and workspace bootstrap. Deny a frozen owner and frozen invited user. | Not integrated/reviewed. Migration 026 counts pending, unexpired invitations and accepted members both at start and again under business locks immediately before finalization; a late change requires same-operation owner confirmation. |
| A08 Google | Guard OAuth token persistence, refresh/legacy token writes, sync final writes, and callbacks completing after freeze. Drain or fence external work; prevent a reconnect or late sync from racing deletion. | Not integrated/reviewed. |
| A06/A09/A12 jobs | Exclude frozen owners in scheduled selectors and drain already-claimed send/reply operations before deleting workspace credentials/data. Integrate privacy cleanup through the A12 cron ownership boundary. | Cron owner query/drain changes not integrated; A12 has the patch above for retention only. |
| A13 product UI | Provide confirmation and pending/error state, retry the same idempotent deletion POST through the restricted session after response loss, handle late shared-workspace consent, and sign out/clear local data only after confirmed completion. | No deletion UI in A11; current `/privacy` is policy copy. |

There are two external-create classes to fence: customer provisioning and
Checkout Session creation. The checkout lease alone does not close the customer
creation race. Migration 026 uses separate `billing-customer:<uuid>` and
`billing-checkout-owner:<uuid>` locks; every combined A03 path must acquire them
in the same customer-then-checkout order. It must leave unresolved provider
results recoverable and must not interpret a missing search result as proof of
absence. Stripe documents Customer Search as eventually consistent, while its
list APIs paginate; see [Customer Search](https://docs.stripe.com/api/customers/search),
[Checkout Session list](https://docs.stripe.com/api/checkout/sessions/list),
[Checkout Session expiration](https://docs.stripe.com/api/checkout/sessions/expire),
and [Subscription list](https://docs.stripe.com/api/subscriptions/list).

Google revocation uses the documented form POST endpoint and can take time to
fully apply. Current behavior is deliberately fail-closed for all errors,
including HTTP 400, so an invalid/revoked token response may need operator
resolution rather than automatic completion. See [Google OAuth token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
and [revocation endpoint errors](https://developers.google.com/identity/openid-connect/reference#revocationendpoint).

### Operator recovery for uncertain Google revocation

If the Google revoke call may have succeeded but its response or the following
database write was lost, keep the account frozen. An authorized operator must
independently confirm and revoke the exact actor grant through the approved
Google account/admin procedure. Do not use a received 400 by itself as proof;
do not copy refresh tokens into logs, tickets, or this procedure. If the remote
grant cannot be confirmed revoked, stop and leave the operation pending.

Use a privileged, audited database session only after that remote confirmation.
The first query is read-only; verify the operation is still frozen and its actor
UUID matches the support case before proceeding:

```sql
SELECT id, actor_user_id, account_role, status, google_complete, last_error_code
FROM public.privacy_account_deletion_operations
WHERE id = '<operation-uuid>'::uuid
  AND actor_user_id = '<actor-uuid>'::uuid;
```

After replacing both placeholders and verifying the row, run this transaction.
It claims the existing operation (it does not start a deletion), checks the
actor/fence, records only the Google step, and releases the lease. A busy,
missing, stale, or mismatched operation raises an error and must not be
overridden manually:

```sql
BEGIN;
DO $operator_recovery$
DECLARE
  v_operation UUID := '<operation-uuid>'::uuid;
  v_actor UUID := '<actor-uuid>'::uuid;
  v_claim RECORD;
  v_released BOOLEAN;
BEGIN
  SELECT * INTO v_claim
  FROM public.privacy_claim_account_deletion(v_operation, 300000);

  IF v_claim.result <> 'claimed' OR v_claim.actor_user_id <> v_actor OR v_claim.fence IS NULL THEN
    RAISE EXCEPTION 'deletion operation is not claimable for the verified actor';
  END IF;
  IF NOT public.privacy_record_account_deletion_step(v_operation, v_claim.fence, 'google') THEN
    RAISE EXCEPTION 'deletion operation fence expired before Google confirmation was recorded';
  END IF;
  v_released := public.privacy_release_account_deletion(
    v_operation, v_claim.fence, 'operator_google_revocation_confirmed'
  );
  IF NOT v_released THEN
    RAISE EXCEPTION 'deletion operation lease could not be released';
  END IF;
END
$operator_recovery$;
COMMIT;
```

Then ask the actor to retry `POST /api/privacy/delete` in the restricted recovery
session. The route re-enumerates and revalidates Stripe billing before final
deletion; this operator action does not set `billing_complete` or delete any
account/workspace row. Preserve the audit record of who confirmed the Google
grant revocation and when under the existing support process.

## Recovery and data-policy decisions

The auth proposal keeps `auth_version` stable when freeze starts. That allows an
existing cookie to refresh into a restricted session and retry. Incrementing the
version at freeze would invalidate every cookie, so it requires an independent
recovery credential and behavioral tests before use. Final user-row deletion
invalidates the old JWT through the existing live-user/version lookup. Fresh
Google sign-in after deletion may create a new account by design; it is separate
from stale-cookie resurrection. The retained old-UUID trial history will not
automatically apply to a new UUID. Whether intentional re-registration inherits
trial eligibility remains an explicit A03/privacy policy decision; no email
digest tombstone is added without a documented purpose, retention, key, and
re-identification review.

The trial history’s UUID is pseudonymous and linkable, not anonymous. Its
retention is an anti-abuse choice that needs an approved retention rationale.
Likewise, the deletion operation ledger has no approved purge period. Statutory
billing/support retention needs a legal decision; this task does not invent one.

## Validation evidence

Root ran the full test runner under cached Node 22.23.3: `node scripts/test.mjs`
passed 197/197 tests with zero skips. This includes migration replay and
concurrency tests using disposable PostgreSQL 17, export tests, and retention
tests. Security tests passed 7/7 with Node 22.23.3 using
`node --experimental-strip-types tests/security-hardening.test.mts`.

`npm run lint` passed with zero errors and four existing navigation warnings;
the changed deletion/provider/test files were rechecked lint-clean. `npm run typegen`
and `node_modules/.bin/tsc --noEmit` passed. `git diff --check` and
`git apply --check` for both [restricted auth/proxy](./A11_RESTRICTED_AUTH.patch)
and [A12 cron](./A11_PRIVACY_CRON.patch) passed. The restricted-auth proposal
also passed its callback/proxy and existing Auth.js Core/JWT behavior tests
(4/4) in a disposable worktree. These proposal tests do not establish that the
shared source has been integrated.

`next build --webpack` and `scripts/generate-static-csp-hashes.mjs` passed in a
synthetic process-only CI environment; static CSP hashes were generated for two
sources. The production smoke test passed loopback CSP hash/nonce rotation,
protected dashboard behavior, OpenGraph, and anonymous auth/Google/billing
boundaries. Existing Sentry global-error/deprecation warnings remain; no
`.env`, Sentry upload credential, or DSN was used. After the deterministic
`pg_sleep` barrier refinement, the focused A11 PostgreSQL migration/concurrency
test passed 1/1 with zero skips, and the revised test passed focused ESLint. No
live database, provider, or network-backed test was used.

Enablement remains blocked until all shared gates are implemented and their
race tests pass. Keep the feature gate closed through review and handoff.

## Unresolved pre-enable review findings

The following four findings remain open; this handoff does not claim they are
fixed by the export/retention integration:

1. **Google reconnect after revocation:** A08 callback/refresh writes need a
   lifecycle fence, and finalization must recheck that the actor's Google grant
   was not replaced after revocation. Without that fence, deleting the local
   credential can leave a newly issued remote grant active.
2. **Stripe customer personal data:** the current cleanup drains checkout
   sessions and subscriptions but retains the Stripe Customer object. Decide
   whether to delete/scrub it after reconciliation or document the lawful
   retention basis and user-facing notice.
3. **Verification/password reset during freeze:** the restricted-auth proposal
   must prevent verification and reset token creation/consumption from
   mutating a deleting user. Password-reset consumption currently changes the
   password and increments `auth_version`; verification can still update the
   frozen user row.
4. **UUID retention:** trial anti-abuse history and the deletion ledger retain
   actor UUIDs without an approved purpose/retention period. These values are
   linkable pseudonyms, not anonymous data; set and document the policy before
   enabling deletion.

The deletion feature gate remains closed until these findings, all shared
integration gates, and their race tests are resolved.

## Rollback and incident guidance

If an enablement or integration incident occurs, disable
`PRIVACY_ACCOUNT_DELETION_ENABLED` first. Do not clear
`privacy_deletion_requested_at`, delete operation/provider-progress rows, drop
migration 026, or assume an external cancellation/revocation did not happen.
There is no safe blind unfreeze or destructive DDL rollback: Stripe may already
be canceled, Google authorization may already be revoked, or a create request
may still be uncertain. Retain all frozen operation and provider evidence for
reconciliation.

Do not roll back to a build that lets frozen actors or their teammates use the
workspace without lifecycle guards. Preserve the shared A02/A03/A04/A05/A08 and
job admission fences for every frozen account even while the delete endpoint is
disabled. If those guards cannot remain deployed, keep deletion closed and
maintain a reviewed access-denial/recovery path; otherwise a frozen account can
resume ordinary activity while provider cleanup is incomplete. Restore a
compatible recovery build and finish or explicitly operator-resolve each
existing operation before considering removal of any guard or data structure.
