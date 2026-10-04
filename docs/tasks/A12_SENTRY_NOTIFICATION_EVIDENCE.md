# A12 Sentry notification evidence handoff

Status: **One historical controlled Sentry email receipt is independently verified in the signed-in operator mailbox.** This isolated handoff adds a runbook, blank receipt template, and sanitized receipt evidence. Three GET-only Sentry API checks, read-only Sentry UI inspection, and read-only Gmail inspection used existing authenticated sessions; no credentials were created or provisioned, no API mutations or new messages were made, and no project/workflow changes, shared settings, models, routes, dependencies, deployment changes, or existing probe changes were made. It does not edit the shared roadmap.

## What each observation establishes

Sentry transport acceptance, event readback, alert configuration, an alert firing, and receipt by a recipient are separate observations. The existing probe can submit a fixed event and read it back. Its workflow mode reads configuration only. The recorded A12 API workflow inventory returned HTTP 403; signed-in UI review established an enabled project alert and one history trigger linked to the historical probe issue. A matching Sentry email was then independently observed in the signed-in operator mailbox. This verifies receipt of that one historical notification, not delivery for the separate current project alert or to other recipients. See [A12 alert and privacy evidence](./A12_ALERT_PRIVACY_EVIDENCE.md).

The blank [receipt template](./A12_SENTRY_NOTIFICATION_RECEIPT_TEMPLATE.json) is a private operator worksheet, not a verification tool or evidence. Keep completed copies only in the approved restricted evidence location. Do not copy private source responses, bearer tokens, DSNs, recipient addresses, or message contents into tickets or shared logs. Fill only fields supported by source records; mark unavailable observations `unverified` and leave their source reference empty. A human-entered status is still an assertion until an integration reviewer checks the referenced source directly.

## Receipt worksheet contract

The template separates approved target, project identity, event readback, workflow/action configuration, an event-correlated trigger observation, recipient receipt, and the final decision. Each evidence stage records status, observation time, and an opaque source reference. Event ID, workflow ID, and action ID must correlate throughout. The template itself is the field list; its initial `unverified` values are placeholders, not evidence. Use `verified` only after an independent reviewer checks the source record, `mismatch` for a checked contradiction, and `unverified` when evidence is missing or access is denied. Do not promote a self-entered assertion to `verified`.

Do not put the raw Sentry response, bearer token, DSN, email address, Slack destination, or message contents in the worksheet. References should be opaque locators to evidence retained in the source system. The worksheet itself does not authenticate those records. The integration reviewer must inspect each relevant source directly and record the actual evidence boundary; a manual recipient attestation or copied worksheet is not independent delivery verification.

## Read-only access and follow-up

When the approved project, source, and recipient are supplied, provision a dedicated Sentry API token through the approved secret channel. The documented project and event GET endpoints accept `project:read`; the workflow-list and single-workflow GET endpoints document `alerts:read` (and broader organization read scopes). Request only read scopes. The prior workflow request's 403 does not identify whether the cause was token scope, organization policy, or another access restriction; verify access by a read-only workflow list and record only status/counts. Do not add a write scope to make inspection work.

After the integration operator receives the approved secret and confirms the target, use the existing probe in this order. Replace the path with the approved local env file; do not put credentials on the command line. The probe reads only its allowlisted values from that explicit file and ignores process environment variables.

```powershell
$sentryEnv = 'C:\path\to\approved\main\.env.local'

# Read-only identity check: DSN project ID must match configured org/project slugs.
node scripts/a12-sentry-delivery-probe.mjs $sentryEnv

# Read-only, project-filtered workflow inventory; this only summarizes action types/statuses.
node scripts/a12-sentry-delivery-probe.mjs $sentryEnv --inspect-workflows

# Read back the historical controlled event only; this does not send another event.
node scripts/a12-sentry-delivery-probe.mjs $sentryEnv --readback f25543726e00e14e8907a99e6e0f426e
```

The event ID above is from the October 3, 2026 evidence record and is useful only against that same Sentry project. Reconfirm project identity before using it. If any project identity check mismatches, stop. If workflow inventory returns 403, record access as unavailable and request the read-only scope/access review from the Sentry administrator; do not try write scopes or infer that no workflow exists.

If API workflow access is unavailable but the approved Sentry account has UI access, inspect the project’s workflow/alert details read-only. Record whether the workflow is enabled and scoped to this project/environment, its trigger conditions, action filter logic (`all`/`any`), active action, channel and intended recipient. Compare those with the controlled event and approved recipient without copying recipient identifiers into this worksheet. Review issue frequency/occurrence thresholds and workflow frequency (cooldown) too. The alert API documents trigger conditions, action filters, occurrence/event thresholds, and frequency settings. A single event may not meet a threshold or may fall inside the cooldown. Sentry issues group events; the existing fixed probe could join an existing issue, so a `first_seen_event` trigger may not run on a later probe. These are possible explanations to check, not evidence that the workflow did or did not trigger. [Sentry alert configuration API](https://docs.sentry.io/api/monitors/fetch-an-alert/) shows trigger and action-filter conditions; [alert creation API](https://docs.sentry.io/api/monitors/create-an-alert-for-an-organization/) describes frequency and event thresholds; [Issue Details](https://docs.sentry.io/product/issues/issue-details/) describes issue grouping.

The existing probe’s `--send-probe` mode is a live Sentry ingest mutation. Do not run it until the Sentry project, test channel, controlled recipient, evidence source, and explicit go-ahead are confirmed by the integration operator. When authorized, the command is:

```powershell
node scripts/a12-sentry-delivery-probe.mjs $sentryEnv --send-probe
```

It sends one fixed, sanitized test event and then attempts event readback. It does not send email/chat itself and does not prove alert match, workflow execution, or recipient delivery. Record the returned event ID privately, then inspect the matching Sentry issue and source-side notification evidence. Do not repeatedly resend to chase a notification: deduplication, first-seen rules, thresholds, and cooldown can make repeats inconclusive. If a fresh event is needed to exercise a new-issue condition, decide and approve its safe test design separately; this existing fixed probe does not promise a new issue.

For recipient evidence, inspect the downstream provider’s delivery record for a message correlated to the same event/workflow/action and approved destination. A provider-side accepted/delivered status establishes only what that provider records; confirm the message reached the controlled recipient through the agreed recipient-side source if the requirement is actual receipt. Preserve the opaque source references and record the conclusion only after a reviewer checks those sources directly. No manual attestation or Sentry event readback substitutes for that review.

Official Sentry API references:

- [Retrieve a Project](https://docs.sentry.io/api/projects/retrieve-a-project/) documents the project identity GET and `project:read` scope.
- [Retrieve an Event for a Project](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/) documents event-ID readback and `project:read` scope.
- [Fetch Alerts](https://docs.sentry.io/api/monitors/fetch-alerts/) documents project-filtered workflow listing and the `alerts:read` scope.
- [Fetch an Alert](https://docs.sentry.io/api/monitors/fetch-an-alert/) documents single-workflow retrieval and the `alerts:read` scope.
- [Create an Alert for an Organization](https://docs.sentry.io/api/monitors/create-an-alert-for-an-organization/) describes configured action targets and action fields. Its create operation is not part of this task.

These documented endpoints describe project/event data and alert configuration. I found no documented Sentry API here that returns an event-correlated workflow execution record or confirms downstream email/chat delivery. The signed-in Sentry UI history did show one trigger for the historical probe issue, and the matching email was independently observed in the signed-in operator mailbox. This verifies one historical notification reached that mailbox. Do not infer this proves delivery by current project alert `746029`: the email's source metadata identifies historical alert rule `760684`, and those identifiers have not been reconciled. `lastTriggered`, enabled action configuration, Sentry ingest HTTP 200, and event readback alone still cannot establish recipient delivery. For future acceptance, use an approved controlled recipient and inspect the source-side/recipient-side record tied to the exact event and rule; a manual assertion or copied worksheet remains insufficient.

## Dependencies and decisions for integration

- The integration operator must confirm the Sentry organization/project, permitted controlled-test recipient, and approved verification source before any future live send. Only read-only API GET and UI/mailbox checks occurred; no write, event send, or new recipient notification was made.
- The integration operator must explicitly authorize a controlled event before the existing `--send-probe` mode is run. Read-only access checks and historical event readback can proceed once the approved credential source/target is available.
- Project identity and event readback succeeded with the existing token, establishing working read access for those checks. Workflow inventory still returns 403, though the signed-in UI was sufficient for the read-only alert detail inspection recorded above. If repeatable API workflow inspection is required, the Sentry administrator must provide the documented read-only `alerts:read` scope or a permitted organization read scope, if required by account policy, through the approved secret mechanism. No write scope, new environment variable, or shared setting is proposed.
- One historical email receipt to the signed-in operator mailbox is independently verified. Before a future test, define the approved recipient, the intended rule/target, and where that test's independent receipt evidence is retained. Delivery for current alert `746029` and other recipients remains unresolved.
- No model, route, dependency, migration, deployment setting, or shared configuration change is required by this evidence-only slice.

## Validation and current status

This runbook/template-only slice has no executable code or dependency change, so no tests were added. Fresh read-only checks were run on **2026-10-04 11:25:12 UTC** through the explicit existing checkout env file, using the existing probe and no send mode:

| Check | Sanitized result | Evidence boundary |
| --- | --- | --- |
| Default project identity GET | `project_identity_verified`, HTTP 200 | The configured source file resolves to organization `j-projects-wa`, project `sentry-pink-lantern`, numeric project ID `4511869152526416` in the `de.sentry.io` region. This verifies that configured source identity only; it does not approve this as the isolated controlled-send target. |
| Workflow inventory GET | `workflows_read_failed`, HTTP 403, one page attempted | Workflow/action configuration could not be inspected with the currently supplied read access. The response does not establish whether the cause is token scope, organization policy, or another access restriction. |
| Historical event readback GET | `ingested_and_read_back`, HTTP 200, `matched`, Sentry `dateReceived` `2026-10-03T16:22:25.766Z` | The historical fixed event matches on the configured source project. This establishes event readback only. |

All three API operations were GET-only. No token/DSN value was printed or copied. No envelope/event POST or new recipient message was sent. An approved project/channel/credential source/recipient for a future controlled send is still not supplied. The subsequent UI observation establishes one trigger for the historical issue; the matching historical notification email was independently verified in the operator mailbox as described below. Ask the Sentry administrator for the documented read-only workflow API scope/access if needed for repeatable API inspection; inspect the approved controlled target before any new send.

### Additional read-only Sentry UI observation

On 2026-10-04, the integration operator inspected the same project through the signed-in Sentry UI after the API workflow request returned 403. The project-filtered monitors list showed one error monitor, ID `1611295`. Its detail page showed the historical fixed A12 probe grouped as issue `SENTRY-PINK-LANTERN-8` (issue ID `151129530`). The monitor's Connected Alerts list was empty, while the Project Alerts view showed one email alert named “Send a notification for high priority issues” (alert ID `746029`). The project alert detail was inspected at approximately 11:30 UTC:

| Alert field | UI observation | Evidence boundary |
| --- | --- | --- |
| State and scope | Enabled (`Disable` button shown); connected project `sentry-pink-lantern`; all environments; no connected monitors. Throttling is `Notify on every trigger`. | Configuration only; monitor association list remains empty. |
| Trigger conditions | `WHEN any`: Sentry marks a new issue as high priority, or marks an existing issue as high priority. `IF any` filters match: Any event. | This describes alert conditions; by itself it does not establish firing. |
| Action | Notify Suggested Assignees and, if none are found, Recently Active Members. | No concrete user/email address or individual recipient is exposed by this configuration. |
| History | 14-day total triggers: 1. The single October 3, 4:22 PM UTC history row links Error Monitor `1611295`, issue `151129530` (the same A12 controlled probe issue), project `4511869152526416`, with one alert. | Event-correlated trigger history is now observed for the historical probe issue. It establishes the alert fired for that issue; it does not establish the action's destination or message delivery/receipt. |

This read-only UI history establishes one trigger for the historical probe issue. The API workflow request still returns 403, so the observation source is the signed-in UI. No settings were changed and no new message was sent during this inspection. The unresolved delivery question is whether current project alert `746029` has any link to the historical email rule `760684`; this receipt must not be attributed to alert `746029` without source evidence linking them.

### Independently verified historical email receipt

On October 4, the root reviewer opened the matching historical Sentry email in the signed-in operator Gmail mailbox. The displayed receipt time was October 3, 2026 at 18:22 Europe/Madrid (16:22 UTC). The message's fixed probe phrase, event ID `f25543726e00e14e8907a99e6e0f426e`, `probe_id`, project ID `4511869152526416`, and issue `151129530` / `SENTRY-PINK-LANTERN-8` matched the Sentry event/history. The body states the issue was notified to recently active members. Mail headers showed Sentry's `md.getsentry.com` sender/signing domain, `ses-eu.md.getsentry.com` mailed-by domain, and TLS. Recipient address and IP are intentionally omitted. The notification metadata links this email to historical alert rule ID `760684`, named “Send a notification for high priority issues,” notification UUID `e137d191-413d-4217-a89e-559cab902b7c`, timestamp `2026-10-03T16:22:56.383Z`.

The masked receipt record is [A12_SENTRY_NOTIFICATION_RECEIPT_2026-10-03.json](./A12_SENTRY_NOTIFICATION_RECEIPT_2026-10-03.json). The reviewer located the source in the signed-in Gmail account with the exact phrase `A12 controlled Sentry transport probe`, the date-bounded search `after:2026/10/02 before:2026/10/05`, and then matched the event ID above. The repository stores only the opaque reference `private:a12-20261004/sentry-recipient-source`; the resolvable mailbox URL is in the local owner-only source file, outside the worktree. This is independent mailbox evidence that this one historical email reached the signed-in operator's mailbox. It does not prove other members received the message, and it does not prove current project alert `746029` delivered it: current UI alert `746029` and historical email rule `760684` are distinct identifiers. The current-rule linkage, recipient fan-out, and future delivery remain unresolved. No new event or message was sent during this check.
