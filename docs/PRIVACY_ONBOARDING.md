# Privacy and onboarding operations

Prepared 13 October 2026 against base `0bcdd8f`. Jose owns privacy, support and onboarding evidence. This packet prepares the arrangement and operating process; customer enrollment remains gated by the missing private evidence below. Store signed agreements, requester details, messages, credentials and provider screenshots in the established private operator store, outside Git. Record only reviewed status and non-sensitive evidence references here.

Follow-up against `3022643`: the [privacy evidence closure record](./PRIVACY_EVIDENCE_CLOSURE.md) identifies Ornigami LLC from the owner-supplied formation documents and completed operating-agreement fields. Customer acceptance remains missing; account observations establish some settings, with the full provider/backup review still open. The owner confirms no completed customer/vendor agreements; Resend's incorporation-on-signup statement requires separate account-party review. Use the existing `%LOCALAPPDATA%\Ornigami\privacy-rights` store and the task's private hash manifest for recovered artifacts.

Owner clarification: vendor organizations are not currently contracted by Ornigami LLC. The earlier Zoho identification was withdrawn; the owner has no confirmed place to read info and selected direct forwarding of info/privacy/support to the existing Gmail inbox. The [routing handoff](./PRIVACY_ROUTING_HANDOFF.md) prepares that change for integration, with live setup and proof still open. The open OpenAI Personal/Default project settings have been captured; their deployment linkage and LLC contracting remain unproved. Backup/export locations are unknown after a bounded local inventory, not confirmed absent.

The [customer addendum draft](./PRIVACY_CUSTOMER_PROCESSING_ADDENDUM_DRAFT.md) now prepares the proposed obligations and company-side fields for review. The [provider dossier](./PRIVACY_PROVIDER_REVIEW.md) records current agreement mechanisms/limitations and unsent clarification requests. Both remain incomplete for execution; no first customer's identity, signature or operational annex is invented.

## Routing recovery

| Route | Existing evidence | Recovery outcome |
| --- | --- | --- |
| `privacy@ornigami.com` to Jose's private workflow | Owner attestation on 13 October 2026; original test date unknown | No qualifying receipt recovered |
| `support@ornigami.com` to Jose's private workflow | Same owner attestation | No qualifying receipt recovered |

The search covered the new worktree's absent `.local` directory, the existing but empty `%LOCALAPPDATA%\Ornigami\privacy-rights` directory, sibling worktree `.local` file inventories, two recovery ZIP entry inventories and relevant Git history. Filename inventories cannot establish that unrelated files contain no receipt. The owner does not know the receipt location. No original timestamp or evidence hash is available. The October 4 Resend webhook/sender evidence proves a different transport path and cannot close these routes. No mailbox was configured and no message was sent during this task.

To recover a receipt, locate the original sender-side send evidence and recipient-side arrival evidence for each route. Privately establish destination, matching message correlation, actual observation time and delivery result. Preserve the original and hash its exact bytes with `Get-FileHash -Algorithm SHA256 -LiteralPath '<private receipt file>'`. Only then use the existing register:

```powershell
node scripts/privacy-rights-register.mjs route-receipt --route privacy --observed-at '<original zoned ISO timestamp>' --result delivered --evidence-sha256 '<actual 64-character SHA-256>'
```

Repeat with `--route support` for its evidenced result. Use `failed` for an observed failure. A hash proves artifact identity, not delivery. Do not substitute the attestation date, a new test date or a synthetic hash. If the original is unavailable, Jose must decide how to obtain replacement delivery evidence; recovery remains open until that happens.

The closure follow-up also searched the authenticated Gmail account with both aliases in `to:`/`deliveredto:` across `in:anywhere`, Resend sending records in its selected 15-day window, and its receiving view. No qualifying original was recovered. An authoritative root-domain query returned no MX answer; Namecheap shows Custom MX with only an outbound `send.reviews` feedback record and no root MX. Review/correct receiving configuration before a replacement test in the integration/operator session. DNS and outbound subdomain verification are not delivery receipts. See the closure record for scope and limitations.

## Customer processing arrangement prepared for review

Proposed role allocation, subject to confirmation of the actual purposes:

| Processing | Proposed responsibility | Operational boundary |
| --- | --- | --- |
| Customer recipient lists, visits, permission evidence, review requests and replies | Customer business: controller; contracting Ornigami entity: processor | Business determines purpose and lawful instructions; Ornigami executes the scoped service |
| Ornigami account administration, support, billing and service security | Contracting Ornigami entity: controller for its own purposes | Assess lawful basis and notices separately; do not reuse customer recipient data for Ornigami marketing |
| Vendor services | Role depends on service and accepted terms | Confirm each vendor's processor/subprocessor and independent-controller functions; the public provider list is insufficient |

Use the [Commission controller/processor clauses](https://commission.europa.eu/publications/standard-contractual-clauses-controllers-and-processors-eueea_en) as the review basis. They address Article 28 arrangements; international transfer safeguards require separate assessment. The review must cover documented instructions, confidentiality, security, subprocessor authorization, rights assistance, breach/DPIA assistance, audit information, unlawful instructions, and end-of-service return/deletion with documented legal exceptions. [Commission explanation](https://commission.europa.eu/system/files/2022-05/questions_answers_on_sccs_en.pdf).

Complete this processing schedule and attach it to the chosen agreement before signatures:

| Schedule field | Prepared entry / confirmation needed |
| --- | --- |
| Parties and signatures | Ornigami LLC, New Mexico, United States; filed agent/principal/mailing address: 1209 Mountain Road Pl NE, Ste N, Albuquerque, NM 87110; manager/signatory identified by completed private agreement fields: Jose Miguel Rubio Bejarano. Agent address is not physical operations evidence. Customer legal name/address/signatory and both parties' processing-agreement acceptance: **unconfirmed** |
| Service and instructions | Workspace-scoped Replies/Booster workflows selected in the customer order; document enabled channels, business IDs, authorized users and instruction-change approval |
| Purpose and operations | Import/admission, scoped storage, permission checking, text generation, approved sending/reply publishing, delivery handling, support, export and minimization |
| Individuals and data | Business users, review authors and review-request recipients; email/name, visit metadata, permission source/time/notice, review/draft text, delivery outcomes and suppression. Confirm exact enabled fields; no sensitive service details or recipient phone content in intake/generation |
| Duration | Service term plus approved end-of-service handling in OPERATIONS; record customer instructions, specific retained classes and reasons. A valid rights request is assessed when received |
| Security annex | Document actual target/access roles, TLS, token encryption/key custody, tenant scoping, incident escalation, private evidence ACLs, retention holds and restore controls. Source code alone does not verify operational measures |
| Provider annex | Attach the reviewed inventory below: legal entity, service, location, terms/DPA version, subprocessors, transfer basis, retention and rights channel for each enabled vendor |
| Authorization/change process | Agree specific/general subprocessor authorization, advance notice channel, objection window and resolution in the signed arrangement; values remain **unconfirmed** |
| Assistance contacts | Customer privacy contact: **unconfirmed**; Ornigami `privacy@ornigami.com`, Jose. Route recipient requests to the business controller securely and track its instructions |
| Termination | Record return/delete choice, export recipient and secure delivery method; preserve only assessed restricted exceptions and operational fences. Provider/backup outcomes require their own evidence |

Private approval record: agreement version/hash, completed annexes, both parties' acceptance and date, business/workspace scope, provider approvals and owner review. No signature, completed agreement or transfer arrangement has been obtained in this task.

## Assisted rights procedure

1. Jose checks both routes each business day and accepts requests arriving through other support contacts. Preserve the original privately and open a case with its real receipt time, category and hash. Link the private identity/business mapping outside the register. Acknowledge within one business day. The CLI's 24-hour reminder is local and sends no notification.
2. Verify identity and authority proportionately using existing authenticated/account context where possible; request only necessary additional evidence. Confirm business scope and protect other users' data. Record `identity_review --identity-verified yes` only after verification. Unclear identity/scope stays unresolved with a reason and review date; it is not permission to reset the receipt clock.
3. Decide whether Ornigami is handling its own controller data or assisting the customer controller. For recipient requests, notify the business securely, record instructions and track the original deadline. Check database records, provider copies, private exports, logs and backups using the inventory. Do not promise that an account export includes every processor copy.
4. Prepare the scoped outcome: access/portability export, verified correction, restriction/objection, or assessed erasure. Review lawful exceptions record by record. Preserve suppression, trial eligibility and unresolved-operation safeguards; minimize personal content without restoring sending or trial eligibility. A local register hold does not create a database retention hold. Use a separately reviewed, target-scoped hold when necessary and pause affected cleanup while changing it.
5. Self-service deletion remains disabled. Do not invoke it, run ad hoc production DELETEs, cancel subscriptions or revoke tokens merely because a case was opened. Any destructive/provider action needs its own scoped reviewed execution and receipt. Pending/uncertain provider work stays `held` or `unresolved` with `provider_pending` and a review within 30 days; no blind retries or completion claim.
6. Respond securely without disclosing another person's data. Record actions, outstanding provider/backup copies, specific restrictions and expected next steps privately. The normal response period is one calendar month; a necessary extension may add up to two months, with reasons communicated within the first month. Refusal requires reasons and information about supervisory complaint/judicial remedy within that month. [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).
7. Close only after identity, documented outcome and all three safeguard receipts are recorded; clear a provider-pending case only with documented provider outcome. Check the private register daily for deadlines and every held/unresolved case by its review date. The register does not compute an extended response deadline or send reminders: maintain the communicated extension deadline privately and retain the original deadline.

The CLI requires separate safeguard updates before completion. Use real evidence hashes throughout; inspect `--help` for all valid states/reasons:

```powershell
node scripts/privacy-rights-register.mjs open-case --received-at '<zoned ISO timestamp>' --type access --evidence-sha256 '<request hash>'
node scripts/privacy-rights-register.mjs update-case --case-id '<returned UUID>' --state identity_review --identity-verified yes --evidence-sha256 '<verification hash>'
node scripts/privacy-rights-register.mjs update-case --case-id '<UUID>' --state in_progress --preserved suppression,trial,unresolved --evidence-sha256 '<scope and safeguard review hash>'
node scripts/privacy-rights-register.mjs update-case --case-id '<UUID>' --state completed --outcome-documented yes --evidence-sha256 '<secure response and outcome hash>'
```

For provider-pending work, use `--state unresolved --reason-code provider_pending --next-review-at '<future UTC ISO timestamp within 30 days>'`. Leaving that state additionally requires `--provider-outcome documented` and its evidence hash. For a communicated extension, use `--state extension_communicated` with the communication hash, without treating that state as completed. These are command templates, not receipts or authorization to execute a real request.

`cleanup` previews completed-case expiry; `cleanup --apply yes` removes only fully evidenced completed cases at least 365 days old. It leaves active cases, routing receipts and separately stored evidence untouched. Jose must assess expiry of those separate originals, exports, mappings and private backups too; no automatic private-evidence purge is established.

## Provider, backup and retention inventory

See [PRIVACY_RETENTION_INVENTORY.md](./PRIVACY_RETENTION_INVENTORY.md) for source-backed periods, provider questions and restoration steps. All unknown vendor settings are onboarding evidence gaps, not inferred defaults.

## Onboarding review record

| Required evidence | Current status | Owner / next step |
| --- | --- | --- |
| Privacy and support delivery receipts | Missing after bounded recovery | Jose: locate original evidence or decide replacement evidence path |
| Legal parties, role allocation and signed agreement/annexes | Ornigami LLC identified; customer party, final role review and processing acceptance remain open | Jose/customer: complete populated schedule and privately accept reviewed agreement |
| Vendor terms, transfer/location and actual retention | Some account settings captured; vendor-party linkage, acceptance and complete expiry review remain open | Jose: complete account-specific agreement/retention records using closure evidence |
| Assisted process and private evidence custody | Runbook prepared; CLI locally verified | Jose: review practice, daily checks, secure export delivery and private evidence expiry |
| Application/schema retention rollout and guarded activation | Separate existing gate | Integration/operator: preserve reviewed rollout and disposable validation requirements |
| Restore reapplication and provider erasure outcomes | Procedure prepared; execution unproved | Operator: obtain disposable restore evidence and case-specific provider receipts |

Verification and historical task provenance are in [release evidence](./RELEASE_EVIDENCE.md). This packet does not authorize enrollment, activation, deployment or account deletion.
