# A11 activation billing handoff

Status: billing call-site proposal for integration review. This work stays on
`proposal/a11-billing-activation`; it does not change `ROADMAP.md`, deployment
configuration, runtime settings, or package dependencies. Migration 026 remains
the prerequisite for the provider-create lease functions and freeze marker.

## Changes in this proposal

- Stripe customer creation (both fresh and uncertain same-key retry) and
  Checkout Session creation acquire their existing migration 026 fenced leases
  immediately before provider I/O and finish them after known success or with
  `uncertain` after an unknown response. Requests use a 20 second timeout and
  disable SDK retries, shorter than the 45 second database lease.
- Customer recovery searches by the immutable
  `billing_customer_provisioning_key` metadata token, then validates both that
  token and the canonical owner UUID before attaching the mapping. An empty
  eventually consistent search is not proof that creation failed. Same-key
  retry stops at 23 hours; older unresolved creation remains blocked for manual
  reconciliation because Stripe can prune idempotency keys after 24 hours.
- Final owner/business customer mapping writes reject a frozen or deleted owner.
  Provider-create lease completion surrounds customer reconciliation writes so
  deletion cannot finalize between Stripe creation and the local mapping write.
- The SQL proposal adds a nullable provider customer ID to the durable
  provisioning row. Checkout claims lock customer then checkout-owner and reject
  frozen owners; customer claims lock/check the owner before reading email or
  creating a provisioning row. A pre-freeze provider response can still record
  its exact customer ID under its active fence after freeze, then finish the
  lease. Ordinary customer mapping completion and business mapping updates are
  guarded against freeze; the deletion adapter can use the durable provider ID.
- Plan changes and Billing Portal session creation use the shared durable
  lifecycle-operation API proposed in
  `A11_ACTIVATION_LIFECYCLE.sql`. Only a `claimed` token permits Stripe I/O;
  outcomes after unknown responses stay `uncertain`. Subscription updates pass
  the same operation key to Stripe with bounded timeouts.
- Webhook reconciliation retains its existing owner billing reconciliation
  lease: Stripe subscription retrievals are reads, and the final database
  snapshot locks business then user. The proposed SQL in
  `A11_ACTIVATION_BILLING.sql` checks the freeze marker under those row locks
  and records a late event as ignored before any billing mapping can be restored.

## Required integration contracts

The shared generic API must preserve these names and semantics:

```text
begin_account_lifecycle_operation(
  p_user_id uuid, p_actor_user_id uuid, p_business_id uuid,
  p_kind text, p_idempotency_key text, p_lease_ms integer
) -> result ('claimed'|'frozen'|'busy'|'uncertain'), token uuid, lease_until timestamptz

finish_account_lifecycle_operation(p_token uuid, p_outcome text) -> boolean
```

The plan and portal routes call that contract with a 60 second lifecycle lease.
Keep the existing provider lock ordering for combined billing work:
`billing-customer:<owner UUID>`, then `billing-checkout-owner:<owner UUID>`.
Freeze/finalization must drain lifecycle leases and the existing provider-create
leases. Expired or uncertain leases and absent Stripe Search results are not
proof of provider absence.

## Retained data and open decisions

The deletion provider owner still needs a retry-safe Stripe Customer erasure
step after checkout/subscription drain. Proposed behavior: call Stripe customer
delete, then retrieve the known customer ID and require the documented deleted
tombstone; if the response is lost, repeat by the same customer ID and accept
only a positive tombstone. Do not infer deletion from an empty Search/List
result. A terminal provider error, timeout, or failed confirmation leaves the
account frozen and the deletion operation retryable. The route must not mark
billing complete until this acknowledged step is durable.

Stripe customer deletion does not establish that all financial records are
erased. Stripe retains records required for history and compliance. The lawful
retention purpose and purge period for Stripe customer identifiers, local trial
history UUIDs, and deletion-operation UUIDs have no approved policy decision in
this worktree. Product/privacy owners must approve the promised deletion scope;
keep `PRIVACY_ACCOUNT_DELETION_ENABLED` closed meanwhile.

An issued Stripe Portal URL may remain usable during local freeze and before
the customer deletion call is confirmed. That user may create a subscription
while the deletion worker drains billing. The deletion adapter must enumerate
and cancel any resulting subscription before it acknowledges customer
deletion; after Stripe confirms customer deletion, future customer operations
are blocked. The exact supported behavior needs controlled provider acceptance
before activation. Plan-change requests that become uncertain also need
operator/replay reconciliation, not a fresh unrelated mutation.

## Verification

- `npm ci`: completed; zero reported dependency vulnerabilities. No manifest or
  lockfile changes.
- `npx tsc --noEmit`: passed.
- Route/provider tests: 33 passed across `a03-checkout-routes` and
  `a03-reconciliation` using the repository's
  `node --experimental-strip-types --test` mechanism.
- Disposable PostgreSQL concurrency suite: `a11-deletion-postgres` passed,
  including customer/checkout freeze leases and the proposed late-webhook SQL
  guard; it starts and removes an isolated cluster under `.next`.
- No live Stripe calls, database changes, deployment, or feature-gate changes
  were made.

## Integration dependencies

- Apply the reviewed shared lifecycle SQL and migration 026 before deploying
  these call sites.
- Billing claim/finalization SQL from migrations 019/026 must deny new checkout
  and customer provisioning claims for frozen owners. The proposal in
  `A11_ACTIVATION_BILLING.sql` supplies those replacements and the guarded
  business/customer writes; retain customer-then-checkout lock order.
- The deletion provider implementation must add the acknowledged customer
  erasure step; this work does not edit privacy-owned files.
- `apply_stripe_webhook_snapshot` must be replaced with the guard proposal in
  `A11_ACTIVATION_BILLING.sql`; the disposable PostgreSQL suite applies it and
  verifies that frozen owners cannot be reactivated by late events.
- Controlled acceptance remains needed for concurrent deletion/provider races,
  customer erasure, and the approved retention scope. No staging/production
  environment was touched.
