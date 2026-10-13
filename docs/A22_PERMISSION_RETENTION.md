# A22 — Permission and retention handoff

This branch implements recipient permission enforcement, guarded retention minimization and private assisted-rights handling. It is an integration handoff, not deployment or cleanup activation evidence. The shared roadmap is unchanged.

## Recipient permission

Manual JSON, each CSV row and signed booking events require `permission_source` (1–120 characters), `permission_at` (a real ISO timestamp with timezone, no later than intake) and `permission_notice_version` (1–80 characters). The server captures the normalized recipient email and the fixed `review_request` purpose. Keep the original notice and permission record in the business's restricted records; a supplied label alone cannot prove the customer's agreement.

New intake stores only email, optional first name, actual visit time and permission evidence alongside operational identity. Phone and service details are excluded. Legacy service information is excluded from email generation and AI prompts. Review invitations are neutral across supported languages. Records without evidence remain ineligible; a booking is never backfilled as consent. Permission checks supplement the existing entitlement, tenant, account-freeze, quota, timing, suppression and unknown-outcome protections.

The manual form asks for actual permission source/time/notice and an unchecked confirmation. CSV templates include these fields. Integrators must add them to the signed event body before the matching schema/application cutover. CSV admission also checks legacy rows under the business lock using email and actual visit time; removing the service field cannot create a second key for an unresolved legacy send. Retrying an import preserves dedupe behavior; changing evidence does not bypass suppression. Withdrawal matches the retained permission recipient reference even after ordinary contact details have been minimized, so its evidence clock is preserved.

## Retention controls

Apply migrations `040_permission_evidence.sql` and `041_guarded_retention.sql` in numeric order after the existing migrations, with intake and review schedules paused and live leases drained. Schema precedes its application consumers. Check the preserved permission/lifecycle/suppression function chain on the exact integration target before resuming intake.

Cleanup uses bounded batches, explicit terminal clocks and restricted holds. Unknown, pending and unresolved provider operations retain the information required for resolution. Content minimization keeps durable delivery/quota/idempotency rows; ordinary cleanup never deletes suppression or one-time trial history. A hold remains protective when its review date passes; the operator must review it rather than allow automatic expiry to erase evidence.

Visit/mail content uses a 90-day terminal clock and diagnostics a 30-day clock. Permission evidence uses the latest permission, withdrawal or terminal visit timestamp and a 365-day window. Delivery evidence uses terminal acceptance or later verified final feedback (`delivered`, `failed`, `suppressed`, `bounced`, `complained`); a delayed/sent notification does not restart that clock. A newly resolved outcome replaces an earlier expiry clock using its verified outcome time. Historical records without a verified terminal timestamp remain excluded until an operator establishes the outcome. Holds are private, scoped by data class and record or business, and have renewable `reviewed_at`/`next_review_at` dates; pause affected cleanup while placing or changing an operator hold.

Unchanged routine expiry continues independently of guarded cleanup. The changed click window is guarded along with new content/evidence cleanup. New cleanup starts with candidate counts, with actual deletion and minimization separately reported. Cron applies guarded cleanup only when both `PRIVACY_RETENTION_ENABLED=true` and `PRIVACY_RETENTION_APPLY=true`; both default unset. The library also requires `apply: true` and rejects guarded mutation while its activation flag is closed. After approved activation, remove either cron flag to return guarded cleanup to candidate-only mode. An authorized `GET /api/cron/privacy?dryRun=true` prevents all data cleanup, including routine expiry; it still records the cron lease/health run. Its counts are bounded by the batch and run budget. Do not treat a dry run, receipt hash or local test as proof of production erasure.

The account-deletion provider/recovery gate remains separate. Workspace deletion is not enabled by this change, and a valid assisted erasure request does not have to wait for ordinary retention expiry. Provider and backup/PITR/log copies require their own inventory and receipts; restore handling must reapply erasure and suppression.

## Privacy, support and assisted requests

Jose confirmed in this chat on **13 October 2026** that privacy/support routing was tested previously, but could not recall the test date. This is an owner attestation; the historical date and private receipt location remain unknown. Recover existing evidence during integration rather than repeating mailbox setup. Local tests validate the register and support-reader access boundaries, not external mailbox delivery.

`node scripts/privacy-rights-register.mjs --help` describes the private local register. It records route receipts for `privacy` or `support` only after an observed send-and-receive check. It stores request category, dates, case state and SHA-256 references to evidence held separately, excluding requester identity and message text. Files remain outside Git with owner-only access. A completed case requires identity and outcome evidence plus explicit checks preserving suppression, trial eligibility and unresolved-operation evidence. Held/unresolved cases need a reason and a review within 30 days.

`node scripts/privacy-rights-register.mjs cleanup` previews eligible completed cases with counts only. `cleanup --apply yes` removes only completed, fully evidenced cases at least 365 days old; active, held or unresolved cases and routing receipts remain. This is local register maintenance and does not erase evidence files held separately or any provider/database data.

For an assisted request, record receipt promptly, verify identity proportionately and scope the request to the requester/business, then use the authenticated export or approved operator process. Keep the one-calendar-month response deadline visible; record any permitted extension and its communication within that original month. The tool's 24-hour acknowledgement reminder is deliberately earlier than the one-business-day operating target. It does not send reminders or carry out erasure. Never promise immediate erasure at third parties or clear a provider fence to close a case. A local case hold and a database retention hold must both be recorded when relevant; the register does not change database state.

Before customer onboarding, establish a reviewed controller/processor arrangement covering documented instructions, confidentiality, security, sub-processors, rights assistance, return/deletion and audit information. The public provider list and general terms do not establish a signed arrangement. Review the [official EU controller/processor clauses](https://commission.europa.eu/publications/standard-contractual-clauses-controllers-and-processors-eueea_en) for that separate contractual step. This handoff updates notices without claiming provider terms, transfers or backup configuration were independently verified.

## Validation and integration

Validated locally on Windows with Node **24.11.1**, npm **11.6.2** and disposable PostgreSQL **17**. The repository's Linux/Node 22 CI remains an integration check.

| Check | Evidence |
| --- | --- |
| `npm test` | **560 passed, 0 failed, 0 skipped** on the final implementation. Includes actual PostgreSQL intake, export, delivery, lifecycle and A22 cleanup tests. |
| `npm run lint` | Passed; 0 errors and 4 existing navigation warnings in unchanged settings/Replies files. |
| `npm run typegen`; `npx tsc --noEmit` | Passed. |
| `npm run build`; `npm run test:build` | Passed on the final application with placeholder CI credentials: webpack/TypeScript build, static CSP parity, nonce hydration/rotation, protected dashboard, Open Graph and anonymous auth/Google/billing boundaries. No live mail, payment or provider mutation was performed. |
| `git diff --check` | Passed; shared roadmap unchanged and original worktree clean. |

The A22 database suite tests fresh numeric schema application, the saved pre-retention callback definition upgraded through 041, reapplication of 025, record/business holds and renewal, candidate-only and all-data dry runs, 90/365-day separation, immutable fingerprint exceptions, a concurrent row-lock race, late resolution, disposal tombstones and safe late callbacks. Existing A10/A17 tests retain their account-freeze, tenant, provider-suppression and no-extra-reservation assertions. The CSV suite also proves legacy service fields cannot bypass dedupe and withdrawals after contact minimization retain evidence for their full window. Private-register tests cover concurrent writes, owner-only storage, timestamps, case completion gates and guarded local cleanup.

Integration owns merge, target-specific migration and database-role review, deployment, routing-receipt recovery, processor arrangements and guarded-cleanup activation. The intake SQL signatures change: keep intake/schedules paused across schema/application cutover; an old application cannot use the new evidence contract. To halt guarded cleanup, close either activation flag. Do not restore permissionless intake functions or erase durable keys during rollback. No production database changes, live mail, deployment or merge were performed in this session.
