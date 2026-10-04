# A12 current Sentry alert routing review

Status: current alert routing was inspected read-only in the signed-in Sentry UI on 2026-10-04, and the existing project/workflow probe was run in GET-only modes. The current alert is configured and has a history entry for the historical A12 issue. Its relationship to the independently verified historical email's rule identifier remains unproven; current-alert recipient delivery has not been verified.

## Evidence checked

The root reviewer inspected current project alert `746029` at approximately 13:00 UTC on 2026-10-04. It is enabled for project `sentry-pink-lantern` (project ID `4511869152526416`), applies to all environments, and is not connected to a monitor. Its trigger reads: `WHEN any` of Sentry marks a new issue as high priority or marks an existing issue as high priority; `IF any` filter matches: Any event. It notifies Suggested Assignees with Recently Active Members as fallback and is set to notify on every trigger. Its 14-day history contains one row at 2026-10-03 16:22 UTC, linked to monitor `1611295` and issue `151129530` (`SENTRY-PINK-LANTERN-8`). The alert editor offered “Send Test Notification”; the reviewer did not activate it. These are UI observations of current configuration/history, not proof of a delivered message from alert `746029`.

The October 3 historical message was independently verified in the operator mailbox, as recorded in [A12 Sentry notification evidence](./A12_SENTRY_NOTIFICATION_EVIDENCE.md) and its [sanitized receipt](./A12_SENTRY_NOTIFICATION_RECEIPT_2026-10-03.json). The receipt metadata identifies notification rule `760684`, notification UUID `e137d191-413d-4217-a89e-559cab902b7c`, and the same event/project/issue. Matching issue, time, alert name, and suggested-assignee fallback are useful correlation clues, but none explicitly maps identifier `760684` to current alert `746029`. The current UI did not expose a legacy identifier.

The existing probe was run at approximately **2026-10-04 13:02 UTC** against the exact explicit env source `C:\Users\joser\Desktop\Projects\Ornigami\Ornigami-Agents\.env.local`; it printed no configuration values and used no send mode:

| GET check | Result | Boundary |
| --- | --- | --- |
| Project identity | `project_identity_verified`, HTTP 200 | Configured DSN, organization/project slugs, and numeric project ID match. This does not approve a target for sending. |
| Workflow inventory | `workflows_read_failed`, HTTP 403, one page | Workflow/action API inventory is unavailable with current access. The response does not identify whether scope or another access policy caused the denial. |

The isolated probe test command `node --experimental-strip-types --test tests/a12-sentry-delivery-probe.test.mts` passed 6/6 tests on Node `v24.11.1`. Its mocked workflow test verifies project filtering, pagination, summary output, and recipient-identifier redaction. No live event, test notification, or other mutation was made.

## What the official API documents

Sentry documents organization alerts/workflows at `GET /api/0/organizations/{org}/workflows/`, with project ID or slug filtering and `alerts:read` (or broader organization scopes) access. The single-alert endpoint is `GET /api/0/organizations/{org}/workflows/{workflow_id}/`; it fetches one alert by its ID. These are suitable read-only endpoints for retrieving the current alert object and confirming whether its documented object ID is `746029`. The current 403 prevents that API confirmation with available access. [Fetch Alerts](https://docs.sentry.io/api/monitors/fetch-alerts/) and [Fetch an Alert](https://docs.sentry.io/api/monitors/fetch-an-alert/).

Sentry documents monitors/detectors separately, including monitor-to-workflow IDs and project filtering. That distinction fits the UI observation that the alert exists while its Connected Monitors list is empty; it does not identify the historical message's rule ID. [Fetch an Organization's Monitors](https://docs.sentry.io/api/monitors/fetch-an-organizations-monitors/) and [Fetch a Monitor](https://docs.sentry.io/api/monitors/fetch-a-monitor/).

The documented workflow object exposes alert IDs, trigger/action configuration, enablement, `lastTriggered`, and detector links. The public API references reviewed here do not document a historic notification record or a legacy rule-ID-to-workflow-ID mapping response. The previously recorded legacy project `/rules/` request returned 404; this is not evidence that no legacy rule existed and supplies no mapping. See [A12 alert/privacy evidence](./A12_ALERT_PRIVACY_EVIDENCE.md).

I also reviewed Sentry's public server source. The old project issue-rule details endpoint is marked deprecated and points to Fetch an Alert. Its current GET handler accepts a `Workflow` and serializes it with `WorkflowEngineRuleSerializer`; it does not query `AlertRuleWorkflow` to map a legacy `Rule.id` to a workflow ID. The code uses `AlertRuleWorkflow` for the old endpoint's PUT/DELETE paths, which mutate state and are outside this review. Sentry's notification code distinguishes a `workflow_id` from a `legacy_rule_id` when constructing alert links, but that implementation detail does not map these two IDs for this account or provide an approved read-only account lookup. So the old `/rules/{id}/` endpoint is not a proven bridge and was not tried. [Project rule endpoint source](https://github.com/getsentry/sentry/blob/master/src/sentry/api/endpoints/project_rule_details.py), [notification source](https://github.com/getsentry/sentry/blob/master/src/sentry/notifications/notifications/rules.py).

The normal documented current-alert GET URL was also attempted by the root reviewer in the signed-in Browser context; the Browser returned `ERR_BLOCKED_BY_CLIENT`. This is a local Browser restriction, not a Sentry HTTP response. The probe workflow API's 403 remains the only fresh workflow API response recorded here. Of the two fresh probe API checks, only project-identity verification succeeded; no alternate endpoint or credential scope was tried.

## Evidence still needed

For API-backed confirmation of the current object, an administrator can grant only the documented read access through the approved secret process, then the operator can repeat the project-filtered workflow GET and GET `/workflows/746029/`. This verifies current configuration and identifier; it does not establish the historical mapping or delivery.

To attribute the October 3 email to current alert `746029`, obtain a source record that explicitly binds workflow/alert `746029` to legacy rule `760684` for that notification (for example, an authoritative Sentry record or a Sentry-supported mapping response that identifies both IDs). Similar names or timestamps, a shared issue, and one history row are not enough. If Sentry cannot provide such a mapping, keep the historical email attributed only to `760684` and leave its relation to `746029` unresolved.

To verify delivery by current alert `746029`, the integration operator must first approve a controlled target, recipient, and a one-event test. After that, independently match the exact event to the current alert's trigger/action record and verify the resulting message in provider and controlled-recipient evidence. The editor's “Send Test Notification” control was not used; it tests action delivery without exercising the alert's production trigger conditions, so a receipt from it would establish only action transport. A repeated fixed probe also does not guarantee a new trigger: the existing event may group into the same issue and the high-priority transition condition may not recur. Ingest success, event readback, enabled configuration, or a history count alone does not prove recipient receipt.

## Tooling review

No reproducible defect was found in `scripts/a12-sentry-delivery-probe.mjs` or its targeted tests during this review. The probe intentionally reports workflow configuration summaries rather than recipient identifiers, and it returns the provider's status code without exposing response bodies. A 403 is therefore an access limitation, not a probe defect. No code or shared configuration change is proposed.
