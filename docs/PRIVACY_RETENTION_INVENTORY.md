# Privacy retention inventory

Prepared 13 October 2026. Source inspection establishes implementation, not deployed activation or vendor retention. Jose owns the private account-specific evidence. See [onboarding operations](./PRIVACY_ONBOARDING.md) for the processing arrangement and assisted-request process.

The [closure follow-up](./PRIVACY_EVIDENCE_CLOSURE.md) records authenticated account observations and their private hash manifest: Neon six-hour history in Frankfurt on Free, Vercel Hobby and its log-query/drain boundaries, Resend Free and incorporation-on-signup DPA, and Sentry Developer/EU storage with DPA acceptance still pending. These observations narrow the questions below; they do not establish every residual-copy expiry or vendor agreement's coverage of Ornigami LLC.

## Application and private records

The approved policy is in [OPERATIONS](./OPERATIONS.md#retention-and-restoration). Implementation references: [policy constants](../src/lib/privacy-retention.ts), [cleanup queries](../src/lib/privacy-retention-cleanup.ts), [permission migration](../neon/migrations/040_permission_evidence.sql), [guarded retention migration](../neon/migrations/041_guarded_retention.sql), [cron route](../src/app/api/cron/privacy/route.ts).

| Record class | Policy / source handling | Important boundary |
| --- | --- | --- |
| Leads, demo events | 90 days; created-at/event-date cutoffs | Application cleanup does not erase provider logs or backups |
| Feedback | 365 days from creation | Private support inbox artifacts are separate copies |
| Rate-limit/login-attempt state; cron runs | 2 days from update; 30 days for cron evidence | Auth tokens expire separately; demo challenges have a one-day expiry grace |
| Contact/visit, generated-mail/message content | 90 days after eligible terminal outcome | Guarded minimization preserves ledger keys; pending/unknown work excluded |
| Raw delivery diagnostics | 30 days, subject to guarded query eligibility | Avoid unnecessary content; vendor diagnostics require separate review |
| Delivery events/provider correlation and resolved deletion-operation evidence | 365 days after eligible terminal completion | Keep replay/usage fences and safe late-callback behavior; hashes are still restricted evidence |
| Review clicks/integration details; integration dedupe keys | 90 days for detail; 365 days for keys | Holds and lifecycle checks in guarded SQL apply |
| Permission evidence | Minimum evidence while relied on, then 365 days after last request/withdrawal under policy | Check the eligible terminal/permission clocks in SQL; never erase active relied-on evidence blindly |
| Suppression and trial eligibility | No automatic expiry; restricted minimum evidence and at least annual necessity review | Review does not resubscribe or reset trial eligibility |
| Terminated account/workspace | Policy: 90-day export/recovery window, then assessed erasure | `terminatedWorkspace: 90` is a constant, not a general automatic workspace-deletion operation; deletion remains disabled |
| Accounting/invoices | Existing policy conditionally uses six years from relevant entry if Spanish obligations apply | Seller identified as New Mexico Ornigami LLC, with private records describing Spain-based operations; applicable accounting obligations still require review. Not a blanket period for contact lists or Stripe payloads |
| Rights register | Fully evidenced completed cases eligible at 365 days after completion | Active/held cases and routing receipts retained; private originals/mappings/exports require separate reviewed expiry |

The historical Vercel configuration declares a 03:00 UTC cron in `vercel.json`. Guarded changes require both `PRIVACY_RETENTION_ENABLED=true` and `PRIVACY_RETENTION_APPLY=true`, with explicit library apply. Both flags default unset. Authorized `?dryRun=true` prevents routine and guarded cleanup. Default batch is 250, maximum 1000, with bounded run budgets and cursor continuation. Holds remain protective after their review date. Schema/application rollout and disposable validation precede any activation.

The historical October 4 database observation recorded a successful run, but caller/deployment attribution and privacy-alert notification delivery were unproved; see [release evidence](./RELEASE_EVIDENCE.md). It cannot establish current 040–041 rollout, natural scheduling or vendor erasure.

## Provider and backup copies

The public [provider list](../src/lib/legal-processors.ts) contains Google, OpenAI, Resend, Stripe, Sentry and Neon. Vercel resources remain present and must be included in operational and agreement review. Except for the specific observations in the closure follow-up, retention periods, regions, accepted contract versions and deletion SLAs below remain **unverified for the actual accounts**. No vendor default is adopted as proof.

| Provider / copy | Data boundary | Evidence Jose must capture privately |
| --- | --- | --- |
| Neon Postgres | Application records, branch clones, storage/history and PITR | Known production target observed: Frankfurt, Free plan, one branch, six-hour configured history. Still obtain oldest recoverable time, backup/WAL/residual expiry and deletion limitations, DPA/transfer basis |
| Application backups / database exports | Full or partial database snapshots outside normal cleanup | Whether any exist; destination and encryption/key/access custody; schedule, rolling expiry and oldest retained copy; disposal receipt. The 35-day rolling target in OPERATIONS is unverified |
| VPS hosting (setup pending) | Application/proxy/access logs, server/database backups if configured, build artifacts and runtime secrets | Exact host/provider/region and enabled services; operator access, patching/firewall/TLS, logs/drains, backup expiry, DPA/transfers and deletion/restore controls. No VPS configuration is verified yet |
| Existing Vercel | Request/deployment/function logs, build artifacts and configured drains | Application project still present on Hobby; query UI offers last hour and upgrade-gated longer windows; Drains shows setup/upgrade prompt. Obtain actual physical retention/decommissioning disposition. Hosting direction and UI query limits do not prove removal/expiry |
| Resend | Recipient email, message content, provider ID, delivery events and suppression | Exact account/domain; messages/events/log retention; deletion API/support scope; provider suppression behavior and backup expiry; DPA, region and transfers. Webhook setup proves transport, not expiry |
| OpenAI | Review/context and generated text used by the service | Exact organization/project and API features; actual storage/abuse-monitoring settings and any approved retention controls; DPA/transfer basis; deletion/support scope. Do not infer zero retention from server-side credentials |
| Google | Sign-in identity, GBP reviews/replies and OAuth grants | Enabled product/scopes, account/location linkage, token revocation process and terms; distinguish revoking access from deleting already published reviews/replies or Google-held records |
| Stripe | Customer/billing identifiers, checkout/subscription and financial records | Actual account and test/live mode; controller/processor roles; cancellation versus customer deletion versus legally retained financial records; retention terms, region/transfers and rights channel |
| Sentry and configured log drains | Sanitized server/cron events; separate browser telemetry and provider ingress metadata | Exact org/project/plan; event/trace/attachment retention, browser payload audit, IP/ingress handling, exports/drains and deletion controls; DPA/region/transfers |
| Mailbox / forwarding provider | Privacy/support requests and routing originals | Namecheap root domain has Custom MX selected but only outbound `send.reviews` feedback MX; no root MX/selected email-forwarding service was evidenced. Confirm intended receiving provider/destination and review routing correction separately; then obtain forwarding/access, trash/archive/backup retention, secure handling and private evidence expiry |
| Local operator artifacts and private backup | Support exports, rights evidence, routing receipts, provider/config screenshots | Established locations, owner-only ACLs, encryption/backups, per-class expiry and restore/deletion procedures. Do not create a second credential or evidence store |

Each account record needs: provider legal entity/service, exact account/target, enabled data classes, purpose/role, locations and transfer mechanism, accepted terms/DPA version/date, retention trigger/window, configurable versus mandatory copies, deletion/rights channel, subprocessor authorization, access owner, evidence timestamp/hash and next review. A public documentation URL describes a vendor offering; it does not prove the selected plan or settings. Keep account IDs/screenshots and recipient-linked evidence private.

Server observability uses an allowlist sanitizer and drops transactions/breadcrumbs ([server config](../sentry.server.config.ts), [event sanitizer](../src/lib/sentry-server-events.ts)); browser telemetry follows a different protected-route policy ([client](../src/lib/sentry-client.ts)). Neither proves downstream metadata deletion or vendor retention. The existing [provider deletion code](../src/lib/privacy-deletion-providers.ts) contains Stripe reconciliation and Google revocation, but no live execution receipt. It does not cover every vendor copy and does not authorize activation of `/api/privacy/delete`.

## Restore and erasure reconciliation

1. Record the incident, approved source snapshot/branch, restore cutoff, destination and operator. Keep restored data isolated with intake, schedules, sending and billing side effects paused.
2. Independently recover post-snapshot rights outcomes, suppression/withdrawal, trial and usage history, account freezes, retention holds and unresolved provider operations from the approved private evidence and authoritative ledgers. Missing history is a blocker; fail closed rather than reset eligibility or send again.
3. Reapply assessed erasure/minimization and restriction decisions to the restored copy. Restore suppression and lifecycle fences before any eligible send; reconcile provider outcomes without blind retries. Keep specific legal exceptions restricted.
4. Verify scoped absence/minimization, preserved suppression/trial/quota/idempotency keys, active holds and safe late callbacks on a disposable target. Record counts and hashes privately. Confirm that no unintended provider call occurred.
5. Review each remaining backup/PITR/provider copy: expiry date, isolation, access restriction, whether selective erasure is possible and what happens if restored. Tell the requester any material limits accurately. An application deletion receipt is not a backup/provider erasure receipt.
6. Resume only through the separate integration/operator approval path with exact-target verification. Retain the restore receipt and next expiry review. No restore exercise or production mutation was performed in this task.
