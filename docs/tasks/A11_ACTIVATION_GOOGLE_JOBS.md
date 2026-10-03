# A11 activation follow-up: Google, jobs, and deletion drain

This isolated proposal covers E03 deletion activation contracts described in
the roadmap. It does not edit the shared roadmap, applied migration 026, shared
deployment settings, or production/staging data.

## Implemented in this proposal

- Deletion checks the actor's durable external-operation drain before provider
  cleanup. Google revoke retains the exact encrypted connection through
  provider acknowledgement, stores generation-bound encrypted evidence, and
  compare-and-deletes only that generation. Retries use acknowledged evidence;
  uncertain revokes retain the credential and keep deletion frozen.
- OAuth exchange, Google refresh, location sync, review draft generation, and
  Google reply posting use bounded generic lifecycle leases. Unknown outcomes
  remain blocking; expiry never implies success or safe retry. Token/cache/review
  writes use business-before-user locks and active-account predicates.
- Booster and Replies cron selectors exclude frozen owners. Location selection
  and disconnect lock the business workspace before the owner row. The initial
  shared-workspace response exposes `confirmationRequired` to recovery UI.
- Stripe deletion is proposed after exhaustive session/subscription
  reconciliation, only for a canonically mapped or durably recorded customer
  ID. A retrieved deleted-customer tombstone can complete a prior deletion
  attempt only when durable evidence and terminal intents agree.
- `A11_ACTIVATION_LIFECYCLE.sql` is an additive SQL proposal for immutable
  operation leases, drain checks, encrypted evidence, and an executable
  finalizer replacement. It is replay-tested twice in disposable PostgreSQL;
  it is not migration 026 and has no integration migration number.

## Integration dependencies and unresolved decisions

The finalizer must be integrated with the separate Auth/Team SQL proposal,
Billing/Booster SQL proposal, and the follow-up A09 native Replies guards before
activation. Keep `PRIVACY_ACCOUNT_DELETION_ENABLED` false until all additive SQL
is composed and reviewed. Billing/customer creation, webhook and Resend state
must follow their owners' durable contracts; unknown external outcomes block
finalization until authoritative reconciliation.

Stripe customer deletion is proposed only after exhaustive drain. Customer PII
retention and user-facing disclosure remain unresolved product/legal policy, so
the feature gate stays false. The operation ledger's non-secret retention
policy also needs an integration decision. See Stripe's [customer delete API](https://docs.stripe.com/api/customers/delete)
and [retrieve API](https://docs.stripe.com/api/customers/retrieve).

## Verification boundary

No live Google or Stripe calls and no staging/production database changes were
made. Disposable PostgreSQL tests apply the lifecycle proposal twice, exercise
expired uncertainty and finalization drain, and execute the production Google
review upsert during a concurrent freeze race. Provider tests exercise exact
generation revoke evidence, customer tombstone recovery, and provider failure.
The separate integration proposal still needs the Auth/Team, Billing/Booster,
and Replies SQL changes applied together and reviewed before feature activation.
