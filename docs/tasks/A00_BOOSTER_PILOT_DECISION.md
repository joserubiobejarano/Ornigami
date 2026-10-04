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
