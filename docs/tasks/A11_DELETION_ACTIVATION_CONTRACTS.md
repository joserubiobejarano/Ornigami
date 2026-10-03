# A11 deletion activation contracts — integration handoff

This task starts from integrated baseline `fec3fc2` and delivers on
`fix/deletion-activation-contracts` in an isolated worktree. Applied source
changes are limited to the A11 privacy deletion boundary. Shared auth, tenancy,
billing, Google, workflow and recovery UI changes are submitted as integration
proposals. No roadmap, shared deployment configuration, environment values,
package metadata or existing migration files are changed.

`PRIVACY_ACCOUNT_DELETION_ENABLED` remains default closed. Completing these
engineering proposals does not authorize enabling the feature, applying SQL to
a live database, merging into main or deploying.

## Deliverables and ownership

The applied A11 source checks durable work before provider cleanup, uses
generation-bound Google revocation evidence, and deletes a known Stripe
customer only after session/subscription reconciliation. Positive provider
acknowledgements support retry; missing evidence and ambiguous results retain
the freeze. The shared proposals complete restricted authentication, recovery
UI, workspace admission, billing mutations, Google final writes and native
Booster/Replies workflow contracts.

| Artifact | Integration responsibility |
| --- | --- |
| `A11_ACTIVATION_AUTH_TEAM.patch` | Auth.js, proxy, recovery UI, auth tokens, business and team admission |
| `A11_ACTIVATION_BILLING.patch` | Stripe customer/checkout claims, plan/portal leases, atomic webhook snapshots |
| `A11_ACTIVATION_BOOSTER.patch` | Generation admission, bounded OpenAI calls, native send attribution and freeze guards |
| `A11_ACTIVATION_GOOGLE_JOBS.patch` | Generic lifecycle API, Google OAuth/refresh/cache/reviews, Replies provider wrappers, cron selectors and review alerts |
| `A11_ACTIVATION_REPLIES.patch` | Native Replies PostgreSQL regression and freeze-race tests |
| Five `A11_ACTIVATION_*.sql` proposals | Additive shared schema/functions; integration assigns migration numbers |

The patches contain source and regression tests. SQL and handoff documents are
supplied separately, so applying a patch does not duplicate those artifacts.
All proposals target baseline `fec3fc2` plus this A11 handoff. Apply the complete
set in an integration checkout, inspect it, and run the composed checks below.
Do not cherry-pick whole author branches into an A11-only checkout: those
branches deliberately contain unintegrated shared source.

## Decisions required before activation

- Approve the purpose and purge period for linkable trial-owner identifiers,
  deletion operations and the new provider-operation/evidence records. UUIDs
  are pseudonymous identifiers, not anonymous data.
- Approve accurate user-facing treatment of retained Stripe financial records.
  Stripe's customer-delete API returns a tombstone and retains retrievable
  customer history; it cannot substantiate a promise of complete erasure of
  all provider-held records. See [Stripe customer deletion](https://docs.stripe.com/api/customers/delete).
- Decide whether intentional new registration inherits prior trial eligibility.
  No permanent email digest or new trial policy is introduced here.
- Accept the billing boundary for previously issued Stripe Portal URLs. Local
  freeze prevents new application-issued mutations, but does not revoke an
  existing provider capability. Confirmed customer deletion prevents later
  customer operations; activity during the drain still needs controlled
  provider acceptance and accurate disclosure.
- Assign new migration numbers and approve composition of the additive SQL
  proposals before integrating consumers. Previously integrated migrations
  remain immutable.
- Complete controlled provider acceptance and target-Linux CI after integration.
  Local mocks and disposable PostgreSQL tests do not establish live acceptance.

## Review and validation

The untouched baseline passes all 250 discovered tests with zero skips on
Windows and Node 24.11.1 after a clean dependency install. Final candidate
validation uses Node 22.23.3, matching the CI major version. Tests use mock
providers and disposable local PostgreSQL 17, without live database or provider
credentials.

The complete candidate is preserved at
`review/a11-activation-contracts-20261003`, commit
`ece9c371e5ce0c267f732404283c80d42fd12a0f`. The
[artifact manifest](A11_ACTIVATION_MANIFEST.json) records author heads, artifact
hashes, SQL order and validation results.
Task-local Git attributes preserve LF endings for these patch and SQL artifacts
so their SHA-256 hashes remain stable across Windows and Linux checkouts.

| Check | A11 delivery | Complete integration candidate |
| --- | --- | --- |
| Full test suite | 254 passed; zero failures/skips | 275 passed; zero failures/skips |
| Next.js type generation and TypeScript | Passed | Passed |
| ESLint | Changed source/tests: zero errors/warnings | Zero errors; four existing warnings in unchanged modules |
| Webpack production build | Covered by composed build | Passed with temporary CI fixture credentials and deletion disabled |
| Production smoke | Covered by composed smoke | Passed on localhost only |
| Source whitespace check | Passed | Passed |
| Patch round trip | All five patches apply cleanly | Resulting source/test Git blobs exactly equal the candidate |

Regression coverage includes frozen and missing-user sessions, owner/member
finalization, native and generic operation drains, stale and NULL fences,
marker restoration, retained workspace attribution, provider ambiguity,
generation-bound revocation receipts, and positive Stripe deletion recovery.
Disposable PostgreSQL tests replay all five SQL proposals twice and exercise
freeze races. The Google callback test uses real token encryption and the
production SQL upsert, proving it compares the exact persisted ciphertext.
Smoke checks cover CSP hash parity, nonce hydration/rotation, protected pages,
the Open Graph image and anonymous auth, Google and billing routes.

To reproduce in the composed checkout with Node 22 and the repository's CI
fixture environment, run `npm ci`, `npm test`, `npm run lint`,
`npm run typegen`, `npx tsc --noEmit`, `npm run build` and
`npm run test:build`. No live credentials are required for the tests. Keep
deletion disabled and provider upload credentials absent for the local build.
Target-Linux CI and controlled live provider acceptance remain outstanding.

## Required shared integration

The schema proposals add `account_lifecycle_operations`, generation-bound
Google revocation acknowledgements, Stripe erasure receipts, the known
`billing_customer_provisioning.provider_customer_id`, native Booster
`actor_user_id`, and minimal `privacy_reply_post_outcomes`. They replace
selected auth/team, billing, Booster, Replies and privacy finalizer functions
without modifying historical migrations. Immutable operation keys and actor
attribution let deletion drain work from surviving owner workspaces as well as
the deleting owner's own workspaces.

The shared routes require those functions before their consumers are released.
Auth.js keeps the recovery identity in its trusted server session and removes
it from client session JSON. Old JWTs still fail when the user is missing;
intentional new registration remains a separate action. A lost final deletion
response followed by session invalidation reports an unconfirmed result and
uses privacy support, rather than recreating an authenticated deleted user.

No new package, lockfile, environment variable or shared deployment setting is
required. Existing provider keys and token encryption remain dependencies.
Unknown generic operations have no automatic resolution endpoint in this
proposal: integration must provide an authorized operator/provider-evidence
process. Unknown native sends and posts retain their durable evidence for the
corresponding reconciliation owner; never reset them based on elapsed time.

## Integration and recovery

Start from baseline `fec3fc2` with this delivery applied in a fresh isolated
integration checkout. The patches were exported without context and require
`--unidiff-zero`; their hashes are recorded in the manifest. Apply all five
source/test proposals together:

```powershell
$patches = @(
  "docs/tasks/A11_ACTIVATION_AUTH_TEAM.patch",
  "docs/tasks/A11_ACTIVATION_BILLING.patch",
  "docs/tasks/A11_ACTIVATION_BOOSTER.patch",
  "docs/tasks/A11_ACTIVATION_GOOGLE_JOBS.patch",
  "docs/tasks/A11_ACTIVATION_REPLIES.patch"
)
git apply --check --unidiff-zero $patches
git apply --unidiff-zero $patches
```

Integration must review schema/function changes and assign new migration
numbers. The disposable-database composition tested the existing migrations
followed by `A11_ACTIVATION_AUTH_TEAM.sql`, `A11_ACTIVATION_BILLING.sql`,
`A11_ACTIVATION_REPLIES.sql`, `A11_ACTIVATION_BOOSTER.sql`, and finally
`A11_ACTIVATION_LIFECYCLE.sql`. Compose the complete set before releasing
consumers. These task artifacts are proposals, not instructions to execute
against staging or production.

Keep the deletion feature gate closed throughout migration composition,
consumer integration and acceptance. If an operation has already frozen an
account, preserve its lifecycle restrictions, durable provider evidence and
usable recovery path even while the deletion endpoint is disabled. A timeout
or expired lease does not prove that a provider mutation failed. Reconcile an
uncertain outcome authoritatively; do not blindly clear a freeze or reset its
ledger.

Closing the feature gate makes deletion POST return 503, including retries;
retain the restricted recovery screen and support process for existing frozen
accounts. Roll forward with compatible lifecycle guards and reconciled evidence
before restoring provider cleanup. Reverting to unrestricted sessions or
dropping evidence while an operation is frozen is not a safe rollback.
