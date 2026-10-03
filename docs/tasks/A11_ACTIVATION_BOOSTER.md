# A11 Review Booster lifecycle handoff

This is an integration proposal for the A06 durable Review Booster delivery ledger. It adds no assigned migration number and does not modify A06's historical migration. Apply the overlay only after the A06 quota/delivery migration and A11 generic lifecycle operations are composed by the integration session.

Candidate selection locks the workspace and owner before returning customer name/email or other candidate details. Delivery claims and payload persistence recheck the owner deletion marker under business-before-user locks. Generation obtains the generic `booster_generation` lifecycle lease, including the optional manual actor; the OpenAI request has a 20-second timeout and no retries, shorter than its 45-second lease. A timeout, connection failure, or provider 5xx remains an uncertain generic operation and blocks deletion pending authoritative handling. The lease is finished only after generation returns, before payload persistence; the payload write independently denies a frozen owner.

Resend uses A06's native durable `sending` lease and immutable request/idempotency key. The A11 overlay rechecks owner, current actor, and any previously recorded actor freeze atomically before `begin_booster_delivery_send`. It stores nullable `actor_user_id` without a foreign key and preserves the original initiating actor on same-key replay. If an already-admitted send returns after freeze, known acceptance records only provider message ID and sent status, clears the stored payload/review URL, and skips subject/body history. Known no-send failures after freeze close the reservation without retaining error or payload text. Unknown outcomes retain the exact payload and key for safe replay/reconciliation while dropping error text.

The privacy drain must block on rows in `sending`, `unknown`, or `reconciliation_required` where either `businesses.owner_user_id` or `booster_followup_deliveries.actor_user_id` matches the deleting account. Every `sending` row blocks whether its five-minute lease is live or expired; lease expiry is not evidence of provider rejection. Unknown and reconciliation-required rows block until an authoritative Resend outcome is applied. Accepted/rejected terminal rows carry no pending provider mutation; local payload, visit, and message PII can then be scrubbed under the integration's retention policy. Team actor lifecycle admission is independently checked by the generic generation gate and native pre-send gate. After terminal drain, clear actor attribution for surviving owner workspaces only as part of approved member cleanup.

The pre-freeze boundary remains explicit: an email already admitted by `begin_booster_delivery_send` may be accepted by Resend after local freeze. The durable sending row prevents final deletion until its result is known. No real email was sent in these tests, and no provider TTL is assumed.

## Integration dependencies and decisions

- Compose this overlay with the generic A11 lifecycle SQL and Google/privacy-owned drain/finalizer. The privacy drain must inspect the Booster states above before deleting the delivery ledger or clearing `billing_complete`/`google_complete` equivalents.
- Keep the generic `booster_generation` kind stable so an uncertain generation attempt remains a durable blocker. The current generic lifecycle API has no uncertain-operation resolution function; owner policy/operator path for resolving an ambiguous OpenAI transfer remains an integration decision.
- Unknown Resend rows remain blocked until the A10 signed webhook or an operator reconciliation path establishes a terminal state. Replaying after Resend's documented idempotency retention window is not allowed; elapsed time and empty provider searches do not prove failure.
- The retained provider message ID and minimal accepted status still need an approved retention/purpose window. This proposal does not decide retention duration or authorize an exception for legally required provider records.
- No new dependency, environment setting, shared deployment setting, or `ROADMAP.md` edit is included.

## Verification

Focused validation on the isolated proposal worktree:

- `node --experimental-strip-types --test tests/a06-booster-runner.test.mts tests/a06-booster-email.test.mts`: 19/19 passed.
- `node --experimental-strip-types --test tests/a06-booster-delivery-integration.test.mts`: 1/1 passed using disposable PostgreSQL and an in-process Resend idempotency mock.
- `node --experimental-strip-types --test tests/a06-booster-postgres.test.mts`: 1/1 passed on disposable PostgreSQL 17. This loads the proposed lifecycle and Booster SQL and verifies active/frozen generation admissions, PII-safe candidate reads, frozen claim/send denial, and an accepted send completing after freeze without writing subject/body history.
- `npx tsc --noEmit`: passed.
- Focused ESLint over changed Booster source/tests: passed.

The shared helper and generic lifecycle SQL were copied into this worktree for local compilation/testing only and are excluded from the Booster commit. The integration session should use the authoritative Google/privacy branch versions.
