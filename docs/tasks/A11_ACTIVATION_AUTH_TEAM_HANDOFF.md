# A11 auth, business, and team activation proposal

This handoff implements the A04/A02/A05 slice of E03 in the isolated
`proposal/a11-auth-team-activation` branch. It is an integration proposal; it
does not enable deletion, edit the shared roadmap, change deployment settings,
or contact live providers/databases.

Auth.js now marks frozen accounts as restricted sessions. Restricted sessions
contain no normal user id, email, name, image, or auth version, and the proxy
allows only Auth.js sign-in/session endpoints, the account deletion screen, and
the deletion POST. Credential or Google reauthentication can recover a still
frozen account; OAuth profile writes are conditional on the account remaining
active. Missing and stale users continue to produce no JWT session.

Business context and direct business lookup hide both a frozen actor and a
frozen workspace owner. Workspace bootstrap no longer creates a user from an
email fallback; its SQL admission replacement serializes with deletion and
refuses frozen actors and memberships in frozen-owner workspaces. Business
defaults are applied by one guarded SQL function. Team row triggers guard
invitation and membership insert/update/delete transactions, checking owner,
actor, and invitee while retaining business-before-user locking. The SQL uses
an explicit transaction-local finalizer marker so privacy cleanup can preserve
authored attribution and cascade frozen workspace rows; the A11 finalizer owner
must set `app.privacy_finalizer=on` in its transaction before those cleanup
writes.

Verification and reset token creation and consumption call SQL functions that
take the same customer-then-checkout advisory lock order as deletion start,
then lock and recheck the user row. This prevents both token issuance and token
consumption after freeze. Existing public request responses remain generic.

The recovery page is outside the dashboard layout, requires an Auth.js session,
and receives only a no-PII lifecycle status snapshot. A pending operation reload
immediately offers a usable retry; a late workspace condition asks for explicit
consent; recoverable errors retain retry; success signs out and hard-navigates
away to clear authenticated client state.
If the final DELETE commits but its response is lost, the missing-user rule
invalidates the old JWT. The page reports an unconfirmed result and directs the
user to privacy support when a retry reaches the server with no session. A
separate signed completion receipt would need its own review; this proposal
does not weaken the missing-user JWT rule.

## Files and integration surface

Source changes are in `src/auth.ts`, `src/proxy.ts`, the Auth.js typings, auth
and business database helpers, business context, auth token helpers, and the
new `/account/deletion` page. The additive proposed SQL is
[`A11_ACTIVATION_AUTH_TEAM.sql`](./A11_ACTIVATION_AUTH_TEAM.sql); it has no
migration number and does not rewrite existing migration history.

Apply migration 026 and agree the SQL proposal before deploying these shared
source changes. The Google/JOBS owner must set the finalizer marker described
above. Billing claim/lease, Google OAuth lease persistence, provider cleanup,
webhook/reconciliation, and scheduled job drain integrations remain with their
assigned owners. Keep `PRIVACY_ACCOUNT_DELETION_ENABLED` unset/false until all
E03 gates and the product retention decisions in the lifecycle handoff are
reviewed. No package, lockfile, environment, or shared deployment configuration
change is required.

## Test evidence

Validated on the project's supported Node 22 runtime (`22.23.3`):

* `tests/a11-auth-restricted-session-contract.test.mts`
* `tests/a11-restricted-proxy-contract.test.mts`
* `tests/a11-deletion-recovery-ui.test.mts`
* `tests/a11-activation-auth-team-postgres.test.mts` using disposable local
  PostgreSQL, including a concurrent team admission versus deletion-start lock
  test and frozen owner/member checks.
* `tests/auth-token-postgres.test.mts` using disposable local PostgreSQL for
  token rotation and one-time concurrent consumption.
* `tests/a02-business-context.test.mts` (6/6) and
  `tests/a05-team-postgres.test.mts` using disposable local PostgreSQL.

`next typegen`, `tsc --noEmit`, and targeted ESLint completed without errors;
`git diff --check` is clean. No live database, provider, staging, or production
environment was used.
