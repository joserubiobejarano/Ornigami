# A11 native reply lifecycle proposal

This isolated proposal composes deletion freeze with the existing A09 functions
from migration 024. It is additive under
[`A11_ACTIVATION_REPLIES.sql`](./A11_ACTIVATION_REPLIES.sql), keeps the actual
024 function signatures and invoker privilege model, and can be applied twice.
It makes no package, environment, deployment, or existing migration changes.

Each mutating or charging 024 function takes the billing customer and checkout
advisory locks, locks the business row, then locks/rechecks available owner and
actor user rows before it takes review/profile locks or writes. The generic
lifecycle admission checks the actor for operations whose native 024 signature
does not carry actor identity. Existing 024 business rules and membership-aware
callers remain intact. Frozen generation/save/charge/post claims fail closed;
releasing an uncommitted usage reservation remains allowed so the runner can
drain safely.

An accepted Google PUT can finish after the owner freezes. In that case
`a09_finish_reply_post` verifies the existing token and exact draft, stores only
the immutable claim token, business UUID, local review ID, accepted/rejected
outcome, and timestamp in `privacy_reply_post_outcomes`, clears the native post
lease, and leaves ordinary review/reply projection unchanged. `true` means the
provider result was durably handled, either in normal review state or in this
private outcome ledger. The finalizer must wait for generic lifecycle work and
unresolved native posting leases, then purge the outcome ledger with the
account's workspace data.

The focused disposable PostgreSQL test applies migration 024 and this proposal
twice, verifies existing member usage and draft/post flows, races provider
success against freeze using the same advisory locks, and checks that a frozen
accepted result enters the minimal ledger without copying reply text into
ordinary review rows. It uses no live provider or database.

Validation on Node 22.23.3: `tests/a09-persistence-postgres.test.mts` passed
against disposable local PostgreSQL 17. No new dependency is required. The
integration owner must compose the table purge and unresolved-post drain into
the privacy finalizer before applying this proposal.
