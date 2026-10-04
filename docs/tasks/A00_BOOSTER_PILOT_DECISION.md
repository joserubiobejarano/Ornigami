# Review Booster pilot decision

**Status: proposed, owner approval required.** Engineering acceptance does not identify an actual customer audience or approve retention/commercial policy. No customer is enrolled by this document. This sheet accompanies [remaining launch follow-ups](./A00_REMAINING_LAUNCH_FOLLOWUPS.md).

## Proposed scope

An invite-only Review Booster pilot with a small, explicitly named business audience, one business/location per participant, manual validated Google review URL, email requests only and existing approved monthly limits. No Review Replies posting/API onboarding, legacy lead cutover, new billing promise, automatic account deletion or uncertain-provider retry/reconciliation. Stripe acceptance stays skipped, so a paid public launch and paid conversion remain unapproved.

Jose is the proposed release, support and rollback owner, using the already provisioned private feedback reader and sole operator alert mailbox. No support credential is installed in the application. Before actual invitations, record the businesses and the approved entitlement/onboarding method; do not silently grant plans or invent free access. Pilot duration and audience size must be chosen explicitly.

## Entry gates and stop conditions

| Gate | Required record |
| --- | --- |
| Release | Exact reviewed main deployment is Ready, quality/security checks pass, production schedules are installed and naturally scheduled Booster/health receipts are healthy. |
| Privacy/customer promises | Owner approves the pilot contact/mail-category purpose, retention/deletion handling and accurate privacy/support notice. Existing account deletion stays off; offer the documented support/export route without promising automated deletion. Unsubscribe suppression must persist so ordinary cleanup cannot restart email. |
| Commercial scope | Explicit pilot access/price and billing expectations. No proof of paid conversion or new A18 grace/downgrade/Reply ceiling decisions is inferred. |
| Performance | Record available authenticated performance evidence and the owner's accepted pilot limits. Field CWV/load sign-off stays open until representative data exists. |
| Rollback | Jose can pause affected Booster business entitlement/automation through approved controls, stop further intake/invitations and revert the reviewed release if needed. Preserve durable unknown-send reservations; do not release/retry them blindly. |

Stop the pilot on duplicate mail/quota consumption, cross-business access, unsubscribe/freeze bypass, missing scheduled runs or unconfirmed alert transport. An ambiguous provider result stays fenced and goes to operator review; it is not retried to obtain a clearer result. Resume only after evidence establishes the cause and safe correction. Alert failures or schedule gaps are launch blockers, not reasons to widen thresholds.

## Owner record — not yet approved

- Named audience and pilot duration/size: **pending**.
- Onboarding/entitlement method and billing expectations: **pending**.
- Jose as support/monitoring/rollback owner: **proposed**.
- Mail purpose/category, approved retention periods and customer-facing deletion/support handling: **pending**. The unresolved A10/A11 identifier/evidence retention and affected A18 commercial decisions are linked in the [roadmap](../ROADMAP.md); this sheet does not invent purge periods or legal conclusions.
- Performance limits accepted for this bounded pilot: **pending**.
- Launch date and approval: **pending**.

Approve or amend these concrete items before customer invitations. Completing another broad coding session cannot supply these business decisions.

## Owner reply template

Copy and complete this record; an unanswered item stays pending.

```text
Businesses / locations invited:
Pilot start and end dates / maximum participants:
Access / entitlement onboarding method:
Price and billing expectations (Stripe acceptance is currently skipped):
Support, monitoring and rollback owner:
Purpose of review-request mail / recipient permission basis:
Approved retention periods and exceptions for delivery events/correlation,
  unsubscribe/suppression, trial-owner history, deletion/provider-operation
  identifiers and provider erasure receipts:
Approved privacy/support notice and request-handling process:
Performance evidence/limits accepted for this bounded pilot:
Decision: approve the completed bounded pilot record / amend / hold:
```

## Notice alignment check

The October 4 follow-through found that the public privacy page advertised permanent deletion through the privacy API while production self-service deletion is disabled. The candidate corrects that specific claim: authenticated export is available, deletion requests use the existing published privacy contact and self-service deletion is temporarily unavailable. It introduces no retention period, provider-erasure promise or new legal conclusion. A published contact address is not evidence that its inbox is monitored; the owner must identify the actual request handler and confirm that privacy/support contacts reach that handler before invitations. Broader policy approval remains open.

## Decisions to make after owner-access completion

Owner access and the current-account [HTTP/navigation baseline](./A00_OWNER_ACCESS_AND_PERFORMANCE_2026-10-04.md) are complete. The owner requested this decision list after the technical task. Complete these items together; they are not instructions for another broad agent audit:

1. Name the businesses/locations, maximum participants and pilot start/end dates.
2. Choose the access/entitlement onboarding method and price/billing expectations. Stripe acceptance remains skipped; no free or paid entitlement is inferred.
3. Confirm the support, monitoring and rollback owner, and the actual privacy/support request handler and functioning contact routing.
4. Approve the review-request mail purpose and recipient permission basis, customer notice, retention periods and exceptions for delivery/correlation, suppression, trial-owner/lifecycle/provider identifiers and erasure receipts. Preserve unsubscribe protection; do not invent purge periods.
5. Accept explicit pilot performance/volume limits using the bounded evidence, or require browser/load measurements before invitations. Current request timings do not establish browser CWV or load limits.
6. Approve the completed bounded pilot record, amend it or keep it on hold. Invitations still require the technical entry gates, including fresh naturally scheduled independent health proof.

A broad paid launch would additionally require explicitly reopening Stripe acceptance. Review Replies requires an eligible real client and provider approvals. Lead cutover and future A18 policies are not extra prerequisites silently added to this email-only pilot.
