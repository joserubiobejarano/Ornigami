# A11 privacy export and retention handoff

Status: export and bounded retention implementation complete for review. This is a task handoff in the isolated A11 worktree; it does not change the roadmap, deployment configuration, shared packages, or the A12-owned privacy cron route.

## Export contract

`GET /api/privacy/export` defaults to `scope=personal`. `GET /api/privacy/export?scope=workspace` exports all workspaces whose canonical `businesses.owner_user_id` is the signed-in account. Owners may select one with `businessId=<uuid>`. Duplicate/empty scope selectors and malformed or repeated business IDs return 400. Unknown scopes return 400. The SQL snapshot requires both a live user row and `privacy_deletion_requested_at IS NULL`, so frozen, stale, and deleted accounts cannot export. This filter depends on migration 026. A valid member session can export its personal account, but cannot request workspace scope; an unowned or missing business returns 403.

Each scope is assembled by one PostgreSQL statement, so a response sees one statement snapshot and does not silently truncate by row count. The response is JSON with `version: 1`, the requested `scope`, and `generatedAt`. All responses use `Cache-Control: no-store, private` and `Vary: Cookie`. Unexpected database errors return a generic 500 response; the logs contain only a fixed event name and error class.

The personal scope includes the account identity, profile/settings, projects, authored feedback, owned business summaries, the actor's membership metadata, redacted invitation lifecycle metadata initiated by that actor, safe Google location/connection metadata, and personal billing mirrors and trial history. The workspace scope is owner-only and includes business settings, selected Google location, workspace reviews/replies, visits/messages/clicks, integration event metadata, unsubscribe suppressions, invitation lifecycle state, business-agent/billing/trial mirrors, and related safe owner metadata. Business filtering is performed through the canonical owner relation in the same query. Members cannot get coworker or customer histories through personal scope.

The projection intentionally excludes password hashes, OAuth access/refresh tokens, location/provider raw JSON, invitation token hashes/emails, checkout payloads/URLs/idempotency keys/fences, billing reconciliation fences, provider message IDs, webhook payloads, and teammate IDs/emails. Safe checkout/session/subscription/customer IDs and billing provisioning/webhook state are included for the account owner. Workspace invitations expose role and pending/accepted/revoked timestamps without invitee address or inviter ID. Customer names, addresses, review contents, visit/contact details, message bodies, and click timestamps are included in the owner-authorized workspace scope.

| Table/data class | Export | Routine retention | Account/workspace deletion boundary |
| --- | --- | --- | --- |
| `users`, `profiles`, `projects`, `feedback` | Personal | Feedback 365 days; other rows have no automatic purge here | User-owned rows cascade or detach according to existing foreign keys; A11 deletion orchestration owns account removal |
| `businesses`, `business_members`, `team_invitations` | Personal membership/owned-business metadata; redacted invitations. Full workspace status only for canonical owner | Preserved; no duration approved | Invitation/member lifecycle is not swept by retention; A11 deletion sequencing handles account/workspace state |
| Reviews, replies, visits, sent messages, click history | Workspace owner only | Clicks 365 days; review/visit/message/reply histories preserved pending deletion | Business ownership controls export; membership removal alone does not transfer or delete these rows |
| Integration events and unsubscribe suppressions | Workspace owner only; raw integration payload excluded | Integration events 365 days; suppressions preserved | Unsubscribe state remains until workspace deletion so ordinary cleanup cannot restart mail |
| Google locations, selected location, automation preferences, connection metadata | Personal owner metadata; selected business settings for workspace owner | Preserved; no automatic credential cleanup here | Provider revocation/credential cleanup belongs to A11/A08 deletion/disconnect flows |
| Billing mirrors, checkout/webhook metadata, customer provisioning, trial histories/reservations | Personal account plus relevant owner workspace rows | Preserved; trials/tombstones and unresolved billing state are not purged | Provider cancellation/reconciliation must complete before owner mappings are removed |
| `privacy_account_deletion_operations` | Not in personal/workspace download; restricted freeze state has no ordinary session identity and the ledger includes a lease fence | Preserved; no purge period approved | Migration 026 deletion orchestration owns the record; legal/operational retention needs a later policy |
| `leads`, public demo counters/challenges, token/security/rate-limit state, cron rows | No authenticated user binding for leads; other rows are operational, not account-owned export data | Current windows in the table below | Transient operational cleanup only; no customer/workspace data is included |
| Legal audit | No dedicated legal-audit table exists in the current migrations | No invented period | Legal and statutory billing/support retention remain an integration decision |

The schema has no dedicated legal-audit table. The export includes available account/workspace and billing lifecycle history, including safe webhook status/type/time metadata and A05 invitation `status` / `revoked_at`. The deletion ledger introduced by migration 026 is intentionally omitted: frozen deletion sessions have no ordinary `session.user.id`, and its lease fence is operational state. A later policy can expose redacted completion status through a dedicated authorized lifecycle response. A15's standalone `leads` rows contain only a submitted address/query and no authenticated user key, so A11 cannot safely associate them with a caller's personal export; their current retention remains 90 days.

## Retention policy and implementation

`privacy-retention.ts` remains a dependency-free policy module for callers that import its constants. `privacy-retention-cleanup.ts` processes one ordered, limited batch per table (default 250 rows; hard cap 1,000), records each table's count/failure, continues after an individual table error, and logs aggregate/per-table failure events without row contents. Each delete is an atomic idempotent statement; the next run resumes from any remaining eligible rows. The click cutoff uses the actual `clicked_at` column.

| Data class | Rule implemented | Coverage |
| --- | --- | --- |
| Leads | 90 days | `leads.created_at` |
| Feedback | 365 days | `feedback.created_at` |
| Public demo counters | 90 days | `public_demo_events.event_date` |
| Demo email challenges | Expired for more than 1 day | `expires_at` plus the existing one-day grace |
| API rate and login attempt state | 2 days | `updated_at` |
| Email verification/password reset tokens | Delete after expiry | Both token tables; digests only are stored |
| Review link clicks | 365 days | `clicked_at` |
| Follow-up integration event history | 365 days | `created_at`; this does not apply to sent-message/visit history |
| Cron health rows | 30 days | `started_at` |

The legacy `PRIVACY_CLEANUP_OPERATIONS` list and `PRIVACY_RETENTION_DAYS` object retain their existing shape for current callers. The cleanup service uses the additive `PRIVACY_CLEANUP_TABLES` list to include expired password reset tokens.

For A11, the delegated retention choice is to preserve `followup_visits`, `followup_messages`, `reviews`, and `review_replies` until account/workspace deletion. Their automatic retention duration is otherwise undefined. Billing checkout/webhook mirrors, customer provisioning/reconciliation state, both trial histories, active trial reservations, team invitation history, unsubscribe suppressions, and `privacy_account_deletion_operations` also receive no routine purge. Suppression rows must survive ordinary retention so mail cannot resume. Trial history preserves consumed-trial evidence for the existing owner UUID; reenrollment linkage remains the policy decision documented in the main handoff. The deletion ledger has no automatic purge because no legal/operational period has been approved. Statutory billing and support record retention remains a legal/integration decision; no invented period is encoded here.

## A12 privacy cron integration patch

The existing `src/app/api/cron/privacy/route.ts` is owned by A12. Apply the exact [A11_PRIVACY_CRON.patch](./A11_PRIVACY_CRON.patch) during A12 cron-health integration; it invokes the bounded helper, persists attempted and failed counts, and returns HTTP 500 when any table fails. The A11 branch leaves that route unchanged.

The `sql` import in the current cron route becomes unused and should be removed as part of applying the patch. The privacy job records a failed run and returns HTTP 500 if any table fails; the operation list and counts make partial batches visible and recoverable. Retention and export tests use disposable PostgreSQL only; no live database, provider, deployment setting, or shared config is touched by A11.
