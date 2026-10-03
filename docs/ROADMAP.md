# Roadmap and Pending Work

This is the single living roadmap for Ornigami. The repository root is now `Ornigami-Agents`, containing the former LocalLift application directly. It combines product priorities, operational follow-ups, consolidation work, and external approvals; the agent work packages below partition this same backlog rather than creating another one.

**Last integration review:** 2026-10-03. A06 (`8bd991d`), A09 (`70ad8dd`) and A11 (`3ed841f`) were reviewed independently with Luna and checked again by A00 against the previously integrated wave. Integration adds Booster UI/cron usage reporting, canonical draft migration 024, an A03/A09 lock-order correction, posting origin protection, current-version dashboard counts and cross-wave privacy export coverage. See [wave 3 evidence](./tasks/A00_WAVE3_INTEGRATION_REVIEW.md). A11 is a disabled foundation; production deletion activation remains a launch blocker.

**Release decision:** Hold a broad paid launch until the engineering blockers below and the production acceptance checklist are complete. Review Booster can be piloted before Google API approval after the shared billing/delivery fixes. Review Replies also requires Google approval and controlled acceptance of the corrected Google request paths.

**Evidence boundaries:** Code findings below were checked against the current source; selected failures were reproduced with in-memory mocks, without sending emails, charging cards, or posting Google replies. Read-only checks confirmed a ready Vercel production deployment, successful public-page HTTP responses, and persisted cron health. The observed Booster run processed four businesses with zero recorded failures; the Replies run processed zero locations, which does not validate Google integration. Google Console status and complete real-provider acceptance tests remain unverified. Database observations refer to each checkout's configured database, not an assertion that every hosting environment uses the same credentials.

**Consolidation baseline evidence:** the original layout-only checks passed 23 tests and preserved 225 migration-reference files without nested Git/package/environment files. The subsequent A01 upgrade and integrated build now resolve the earlier dependency/font-build blockers. Migration `020_account_recovery.sql` was applied transactionally through PostgreSQL 17 `psql` to the database read from Vercel production configuration and its schema/constraints/index verified; 018 remains unused. Wave 2 adds 019 billing lifecycle, 021 invitations, 031 Google selection/generations, and 032 serialized workspace bootstrap; 022/024/026 are reviewed wave 3 migrations; 023/025/027–030 remain reserved. Apply the reviewed SQL before deploying consumers. The eight existing users were preserved; no case-folded duplicate email groups or missing profiles were observed. Application rollout invalidates old JWTs lacking `authVersion`, so existing users must sign in again.

## Current strategic center

1. Review Replies handles incoming Google reviews.
2. Review Booster asks customers for reviews after completed visits.
3. Billing activates agents per business, with Complete adding a small workspace.

## Already implemented

- Auth.js credentials and Google sign-in, email verification, business/member tenancy, and plan gating.
- Stripe checkout, portal, plan changes, webhook state updates, trials, usage periods, and Complete-plan invitations.
- Review Replies Google OAuth, location/review sync, AI drafts, direct posting, auto-reply settings, and scheduled sync/draft processing.
- Review Booster settings, Google URL derivation, manual visits, CSV import/dedupe, manual and scheduled sends, retries, unsubscribe suppression, tracked review links, failure reasons, per-run bounds, and plan allowances.
- Privacy export/delete, retention cleanup, cron health records, encrypted Google tokens, CSP hardening, Sentry configuration, and security tests.
- Static marketing/SEO improvements, public demos, legal pages, and current pricing catalog.

## Launch-critical engineering work — open

Priorities: **P0** means resolve before another public release; **P1** means resolve before selling the affected workflow. These entries track unresolved work after the initial audits and the A01/A02/A04/A18 integration review. Completed E01/E11/E12 implementation is recorded in the closed section; real-provider and target-release acceptance still belongs to the deployment checklist. Existing implementations are not considered complete merely because helper-level tests pass.

### E03 · P1 · Complete and activate privacy/account deletion

- A11 supplies fenced durable deletion steps, Stripe session/subscription reconciliation, Google revocation, owner/member/shared-workspace confirmation, private snapshot exports and bounded retention helpers. Migration 026 is additive and the deletion route is deliberately disabled before any user freeze.
- Required activation work: apply the reviewed shared integration contracts to auth/business context, billing provisioning/checkouts/webhooks, team admission, Google OAuth/refresh/sync, Booster/Replies/cron drains and the recovery UI. Guard both creation and consumption of verification/reset tokens while frozen; restricted sessions must retain a usable deletion recovery path.
- Review blockers: prevent Google reconnection/token replacement after revocation and recheck the final connection generation/absence; delete or scrub Stripe customer personal data after conclusively draining billing, or document an explicitly approved retention scope; approve purpose and purge period for linkable trial-owner/deletion-operation identifiers.
- Done when: controlled paid-owner deletion stops billing and handles retained provider data as promised; concurrent customer/session/OAuth/job/reset races cannot escape the freeze; failures are recoverable; member deletion preserves the owner workspace; old sessions cannot recreate deleted users. Keep `PRIVACY_ACCOUNT_DELETION_ENABLED` unset/false until these tests and policy decisions are complete.
- Sources: [A11 handoff](./tasks/A11_PRIVACY_ACCOUNT_LIFECYCLE.md), [shared integration](./tasks/A11_SHARED_INTEGRATION.md), [privacy deletion](../src/app/api/privacy/delete/route.ts).


### E06 · P1 · Finalize Reply safety accounting and quota copy

- A06 implements full UTC calendar-month Booster quotas (500/1,500), independent of annual invoices, with no proration/rollover/reset on conversion or upgrades. The owner’s explicit A06 approval was verified from the A06 chat and recorded in the shared product contract. Deferred visits retain their seven-day eligibility boundary, now shown in the dashboard.
- A09 preserves the existing owner-profile billing-period/2,000 generation safety ceiling and atomically reserves/charges only successfully persisted generations. A18’s proposed UTC business-shared Reply ceiling and public protective-pause wording are separate decisions, still unapproved. A13 must remove misleading monthly/unlimited copy where it disagrees with current enforcement.
- Done when: annual Booster behavior passes controlled acceptance, and Reply quota labels/accounting/window match an explicit approved contract.

### E08 · P1 · Finish shared business context in remaining consumers

- A02 foundation plus A03 billing, A05 team, A08 Google, A06 sender and A09 review settings/generation/posting now use canonical business/owner contracts. Members can use owner-paid review workflows without their own plan or Google connection.
- Remaining: A07 intake/settings and A13 legacy plan/dashboard consumers; A11 deletion freeze and cross-job lifecycle guards. A09 UI obtains business role and preserves exact human text/version. Reconcile remaining legacy plan and dashboard queries instead of adding personal-plan gates back to shared workflows.
- Done when: isolated owner/member acceptance covers all paid routes and UI, with owner-only billing/selection/automation settings, canonical usage attribution and lifecycle exclusion.


### Google Business Profile API access and quota — open

Review Replies uses the `business.manage` OAuth scope and Google Business Profile APIs. Before onboarding real Review Replies customers:

- Obtain Manager access to a real client Business Profile. Ornigami is online-only and must not create a synthetic Business Profile for this purpose.
- Submit **Application for Basic API Access** through the Google Business Profile API Support form for project `local-lift-477812` / project number `1002660087913`.
- Confirm Google has approved programmatic access and that the My Business Account Management API and My Business Business Information API quotas are no longer `0 QPM`.
- Enable the Google My Business API for reviews/replies once it becomes available after approval.
- Keep the support email, sending domain, public product name, website, and OAuth consent-screen details aligned in the approval request.
- Record the approval/quota evidence in the deployment checklist when complete.

The exact current state and post-approval sequence are maintained in `docs/GOOGLE_BUSINESS_PROFILE_RUNBOOK.md`.

Review Booster can launch independently with email delivery and a manually entered Google review URL.

### Google OAuth publication and verification — open

- The last recorded consent-screen audit showed production publication with external users and `business.manage`; recheck its current state.
- Clear the remaining OAuth branding-status warning and verify `ornigami.com` ownership through Google Search Console if requested.
- Complete Google verification if the requested scope/app configuration requires it.
- Confirm both redirect URIs are registered:
  - `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  - `{NEXT_PUBLIC_APP_URL}/api/google/oauth/callback`

### Google production smoke test — blocked by the items above

After approval/publication and after a real client grants Manager access:

1. Connect a real GBP account.
2. Sync a location and at least one review.
3. Generate/save a draft and post a controlled reply.
4. Confirm the Review Replies cron can sync/draft successfully.
5. Confirm Review Booster URL derivation still works from the synced location.

### Stripe production QA — open

Run the deployment checklist in Stripe test mode, then repeat the critical path in live mode with the first customer. Cover Complete activation, downgrade, duplicate webhook replay, payment failure, trial behavior, and usage-period updates.

## Next product and reliability work

### Additional findings from the 2026-10-02 review

- **I01 · Finish first-send and non-sendable guidance.** A06 now passes the actual visit timestamp, localizes fallback/CTA/unsubscribe copy in six languages, and persists missing-email visits as non-sendable. A00 shows durable delivery statuses, UTC reset and quota-wait expiry and keeps manual Run available for deferred-only queues. A07/A13 still own intake email/phone guidance, missing settings, retry dates and recovery actions.
- **I02 · Bound total job time and observe partial failures.** A06 bounds each Resend response to ten seconds and Booster cron now records failed health for ordinary/unknown failures, separately reporting expected quota deferrals. Total business count/elapsed time is still unbounded; Replies cron still records succeeded despite per-location failures. A12 owns resumable budgets, partial/failed/no-work HTTP/health semantics, stale-run detection/alerts and bounded privacy cleanup integration.
- **I03 · Delivery status and suppression.** Provider acceptance is recorded as sent; there is no Resend delivery/bounce/complaint webhook. Add verified provider events and bounce/complaint suppression before scaling; distinguish accepted/delivered/failed states and document sender-domain setup. Keep click tracking separate from confirmed Google-review conversion; a click does not prove a review was submitted.
- **I04 · Bound dashboard queries and paginate.** Outcome statistics join visits, reviews, reply history, and clicks together before DISTINCT counting; the intermediate result can grow multiplicatively. Use independent aggregates. The review inbox silently limits to 100 and the Booster dashboard to 20 without pagination. Add business-scoped pagination and appropriate composite indexes; bound eligible-visit retrieval in SQL. Sources: `getReviewOutcomeStats`, `listEligibleFollowupVisits`, `/api/reviews`, Booster dashboard.
- **I05 · CSV consistency under overlap.** CSV lookup and insertion are separate, although a database unique index correctly exists. Concurrent imports can hit that index and abort after earlier rows were inserted. Use conflict-aware insert results and per-row errors/transactions; normalize equivalent timestamps and clarify date-only input/timezone behavior. Done when parallel reimports return consistent inserted/duplicate counts instead of a partially successful 500. Sources: `/api/review-booster/upload`, `createFollowupVisit`, migration `004`.
- **I06 · Approve remaining retention periods and integrate observable cleanup.** A11 now exports personal versus canonical-owner workspace data in one-query snapshots, including messages, clicks, reply history, billing mirrors and safe Booster/draft/reservation ledgers. Routine cleanup preserves delivery/usage histories and suppression. The new bounded cleanup helper still needs A12 cron integration. History durations and lawful UUID-linked trial/deletion-operation retention remain explicit policy decisions under E03; do not invent purge periods or blindly remove suppression.
- **I07 · Monitoring and support accuracy.** There is no `global-error` component; the ordinary error page says the team was notified without explicitly capturing its error. Contact submissions are stored as feedback without an operator inbox/notification flow. Add actionable error/support visibility and a controlled Sentry smoke test. Fix documentation to use the actual runtime variable `NEXT_PUBLIC_SENTRY_DSN` rather than only `SENTRY_DSN`; production already lists the former.
- **I08 · Repair text encoding and clarify actions.** Review Replies still contains mojibake in titles, messages, loading labels, and automation settings. Repair source text and review mobile/keyboard/error/empty states, especially the difference between Generate, Save draft, and Post. Sources: `src/modules/review-replies/pages`.
- **I09 · Add workflow regression tests.** The existing tests largely cover policies/utilities and source assertions. Add meaningful route/service tests for billing roles/deletion/reconciliation, annual allowance renewal, send concurrency, encrypted Google requests, human-draft preservation, invitations, and shared workspace access. Run provider-contract tests before approval; use isolated test-mode accounts for full end-to-end acceptance. Tests must verify behavior, not just repeat implementation constants.
- **I10 · Settings compatibility and link safety.** Booster settings currently null `rebooking_url` and `email_from_name` on every save, even though they exist in schema/types. Manual review URLs are length-checked but not parsed as HTTPS Google review destinations. Decide which legacy settings to retain, avoid silently wiping them, and validate/safely render external links. If rebooking is retained, give it its own destination rules rather than restricting it to Google. Sources: `/api/review-booster/settings`, `resend.provider.ts`, `src/app/r/[token]/route.ts`.

**Correction to the first audit:** ordinary OpenAI failures have deterministic fallback; A06 now uses actual visit timing and six-language fallback/provider copy and includes unexpected pre-send failures in durable accounting. Those implementation defects are resolved. Controlled provider acceptance and remaining recovery UI still require their assigned work packages.

### Review Booster

- Improve onboarding and settings guidance for a first successful send.
- Improve high-volume throughput; sends currently run serially within a bounded batch.
- Add deliverability guidance and, later, per-customer sending domains plus bounce/complaint suppression.

### Review Replies

- Improve multi-location error and empty states after external API approval is complete.

### Release and operations

- Run the full deployment checklist against the target environment.
- Establish production CWV/Lighthouse and real-user monitoring after traffic exists.
- Continue end-to-end Stripe, Google, cron, and Sentry smoke tests as part of release verification.

## Security and performance follow-ups

- Trusted Types is report-only. Observe production reports, fix any reported sinks, then consider enforcing it and removing the report-only header.
- The enforced CSP still permits inline styles because of current framework constraints; revisit if a strict style policy becomes practical.
- Re-run bundle analysis after significant marketing changes.
- Adopt Auth.js v5 stable when it becomes available and re-test the Google and credentials flows.

## Deferred product decisions

- Decide whether legacy Local SEO/free-audit positioning should remain prominent.
- Decide whether the legacy project API should eventually be retired.
- Decide whether `speed_to_lead` should ship or be removed from the registry/product story.
- Consider a free QR/short-link tool after the current paid workflows are stable.
- Consider broader agency/multi-business workflows after the current business model proves out.

## Repository consolidation and retirement — 2026-10-02

**Local structure consolidation is complete; feature/data consolidation is still open.** `Ornigami` now contains only `Ornigami-Agents`, which is the single Git/application root. The former `Agent-LocalLift` contents, including `.git`, `.env.local`, `.vercel`, dependencies, and existing uncommitted documentation, were promoted directly into it. There are no longer three active project folders.

Follow-Up and Contactor source is preserved under `migration-sources/follow-up` and `migration-sources/contactor`. Their standalone manifests/settings have reference names; Git internals, secrets, dependencies, generated builds, and historical database inspections are excluded. This directory is excluded from TypeScript, ESLint, and CLI Vercel uploads, and has no runtime imports or activated routes. Brand originals live under `assets/brand-originals`; the former loose security SQL is historical input under `migration-sources/workspace`. See [migration-source instructions](../migration-sources/README.md).

**Production CLI evidence:** on 2026-10-02, Vercel reported `ornigami.com` as Ready production deployment `dpl_F7PdxKDfg9ZQSVYKsUxURqHAeX8a`, created 2026-08-14, of project `locallift` (`prj_b4ud7KOZHWQeV9YXbGD3c8XMmKIv`). The project is connected to `joserubiobejarano/Ornigami`, with repository root `.` and Node 22.x. Deployment metadata identifies `main` commit `2c0ef7b86a7cefa97321022131d1812950e03c36`, matching the original LocalLift HEAD. Inspection of that exact Git tree confirms Review Replies/Booster routes, no booking or Twilio routes, and `speed_to_lead` marked coming soon. A single dashboard does not mean all three former applications are operationally integrated. The production file-tree API returned 404, so route evidence comes from the deployed commit, not a successful build-artifact listing. No deployment settings were changed and no push/deployment was performed.

**Recovery backup:** `C:\Users\joser\Desktop\Projects\Ornigami-Backups\2026-10-02-consolidation` contains a verified pre-consolidation LocalLift copy and the complete original Follow-Up/Contactor checkouts. SHA-256 verification covered 3,338 LocalLift backup files, 1,370 Follow-Up files, and 2,756 Contactor files outside rebuildable `node_modules`/`.next`; Git internals and ignored local configuration were included. A manifest and verification record are stored with the backup. The Follow-Up local-only commit, dirty working tree, and untracked components therefore remain recoverable. This private backup contains secrets and must stay outside Git and ordinary shared artifacts.

**Retired unrelated projects:** `Ornigami-Trilogy` and `Ornigami-Events-Scaffold` were removed from this workspace by moving them to the recovery backup. Permanent deletion was rejected by automatic approval review with the generic reason “blocked by policy”; reversible archival achieved the requested workspace cleanup. Events Scaffold required a second residual move with `-Force` for hidden/read-only items. Both former paths are absent from `Ornigami`. Their remote repositories, deployments, and databases were not changed.

### What has and has not moved

| Capability | Current canonical application | Preserved legacy material / consequence |
| --- | --- | --- |
| Manual visits, CSV import, review-request email | Implemented in `src/modules/review-booster`, with stronger business tenancy, retries, quotas, unsubscribe, and tracking | Follow-Up's core manual/CSV workflow is substantially covered; LocalLift should be the canonical implementation. |
| Booking-completed webhook | No `/api/webhooks/booking` route; integration-event helpers/tables exist but have no booking entry point | Follow-Up has generic booking/appointment event intake with external-ID dedupe. Source labels for Square/OpenTable/Fresha are not proof of native provider connectors. Port a secured adapter or explicitly retire this capability. |
| Rebooking follow-up | Schema/type remnants exist; settings save clears the URL and the generator does not use it | Follow-Up includes optional rebooking links and sender-name settings. Preserve or explicitly retire these before claiming parity. |
| Hosted/embedded lead forms, AI qualification, Twilio SMS/WhatsApp | `speed_to_lead` is coming soon; no Twilio dependency, routes, conversation model, or feature module | Contactor has hosted `/f/[businessSlug]` forms, intake, conversation state, scoring, channel policy, anti-abuse, outbound messages/status callbacks, escalation and owner notifications. None of this is replaced by LocalLift's marketing `/api/leads`. |
| Lead onboarding and owner/internal-admin operations | No equivalent lead onboarding/admin workflows | Contactor has onboarding review/conversion, activation handoff, lead dashboards, prompt/business settings, and separate owner/admin authentication. Its home route explicitly redirects to Ornigami while keeping these workflows separate. |
| Identity, billing, and data | Auth.js identity, canonical `businesses`/`business_members`, Stripe `business_agents`, numbered Neon SQL migrations | Contactor has `dashboard_users`/sessions and Drizzle migrations; Follow-Up has Basic Auth and a separate schema. Do not copy either identity model or replay their initial migrations into LocalLift. |

Source references: [Follow-Up booking handler](../migration-sources/follow-up/src/app/api/webhooks/booking/route.ts), [Follow-Up email generation](../migration-sources/follow-up/src/server/services/followup-email-generator.ts), [Contactor homepage](../migration-sources/contactor/src/app/page.tsx), [Contactor schema](../migration-sources/contactor/src/server/db/schema.ts), [Contactor orchestration](../migration-sources/contactor/src/server/services/inbound-lead-orchestrator.service.ts), [application scope](./PROJECT_SCOPE.md).

### Preservation and environment evidence

- Archived Follow-Up Git history is from `joserubiobejarano/followuper`. Its preserved HEAD is `c9195c3`; a fresh `git ls-remote` found remote `main` at `69803a8`, one commit behind. Its uncommitted application/package/style changes and two untracked UI components are retained both in the original backup and the source reference. Generated `.next` artifacts tracked by that old repository are not imported into the unified source.
- Archived Contactor Git history is from `joserubiobejarano/Contactor`, clean before archival, with HEAD and remote `main` matching at `72a7abd`. Its unique application still needs the C03/C04 implementation before it can be considered replaced.
- All three original `.env.local` files were untracked and are preserved privately. The canonical application's file moved with the application. Move required legacy provider settings into approved deployment configuration when their modules are enabled; do not copy secrets into source references or commit them.
- Comparing configured database host/database identities found three different targets. Read-only LocalLift inspection found eight users/eight businesses and the expected newer columns/tables/indexes. This is schema evidence, not a verified migration ledger or proof of production parity.
- Read-only Contactor inspection found zero businesses/leads/messages/onboarding requests and one dashboard user in that configured database. This reduces the observed migration volume but does not establish that another deployed environment is empty.
- Follow-Up's configured database rejected authentication; its records and remaining obligations could not be inspected. Its saved inspection JSON is historical evidence, not proof of current data state. Resolve access or obtain a verified export before retiring the data source.
- The inspected Vercel team lists LocalLift at `ornigami.com`; it does not list projects named Follow-Up or Contactor. Other hosting/team scopes, provider webhooks, customer embeds, DNS, scheduled jobs, and production credentials were not exhaustively inventoried. Keep remote deployments/databases intact until that inventory is complete.

### Recommended unified application

Use **the application at the `Ornigami-Agents` repository root as the canonical codebase and deployment**, with shared Auth.js, business membership, billing, providers, logging, privacy, and one migration history. Preserved standalone code supplies migration inputs; new functionality belongs in the existing application layers. Complete Contactor as a future module without making it a dependency of the current reputation-product launch. Keep `speed_to_lead` disabled/coming soon until its product, pricing, authorization, and provider acceptance criteria are defined.

1. **C01 · Preservation complete; external inventory open.** Verified local preservation and single-root source organization are complete. Still inventory provider endpoints, hosted forms/embeds, cron/DNS/hosting, and every actual database; record which system owns each workflow. Exercise recovery from the backup before eventually purging it. Local cleanup does not establish feature or production-data parity.
2. **C02 · Close Follow-Up parity in Review Booster.** Port the generic booking-completed adapter into `src/app/api` and the existing Review Booster services. Resolve businesses from a scoped integration credential, verify webhook authenticity, apply agent entitlement, validate input, and atomically dedupe event+visit creation. Do not port global Basic Auth or trust arbitrary caller-supplied business IDs. Decide whether to retain rebooking and sender customization. Preserve old webhook URLs through a tested adapter/transition where needed; do not label generic source support as native Square/Fresha integration.
3. **C03 · Port Contactor as `src/modules/speed-to-lead`.** Move its qualification/anti-abuse/conversation/channel services and UI into a disabled module. Put thin form/Twilio routes under LocalLift's `src/app/api` and owner views under `/dashboard/agents/speed-to-lead`; use explicit internal-admin authorization for internal operations. Replace `dashboard_users`, session cookies, and temporary-password handoff with shared identity/invitations. Reuse canonical `businesses` and resolve provider operations through their business mapping. Preserve Twilio signature validation and test callbacks, phone routing, delivery status, notification dedupe, and escalation.
4. **C04 · Translate schema and migrate data deliberately.** Add reviewed migrations after the current LocalLift tail in `neon/migrations`; do not replay Follow-Up SQL or Contactor's Drizzle history. Existing `businesses`, `leads`, and `followup_messages` collide in name/meaning across apps. Use namespaced lead tables (for example `stl_leads`, `stl_conversations`, `stl_messages`, `stl_events`, `stl_forms`, `stl_settings`, `stl_onboarding`) and references to canonical business/user IDs. Maintain an explicit legacy-to-canonical ID map; import settings, visits, messages, send state, events, and identities as appropriate. Reconcile counts and relationships, support repeatable dry runs, and preserve sent/suppressed status so migration cannot resend old messages. Never merge records by business name alone.
5. **C05 · Validate, cut over, then retire external systems.** Test the retained workflows with provider sandboxes and isolated accounts. Migrate/redirect old customer URLs and embeds, switch provider callbacks and cron secrets, and disable legacy send jobs before enabling new ones. Reconcile data and monitor a pilot with a documented rollback path. The local checkouts are already archived; purging backups or retiring cloud projects, databases, and remote repositories remains a separate deliberate step after these gates.

### Gates before retiring legacy runtime/data or purging recovery backups

- [x] Follow-Up's local-only commit and all uncommitted/untracked source are preserved outside the active workspace, with hash verification and source references.
- [x] Untracked configuration/secrets and relevant Git histories are preserved independently of the removed project folders.
- [ ] Perform a fresh-checkout/backup recovery exercise, including required private configuration, before purging recovery assets.
- [ ] Booking intake/rebooking and Contactor's unique capabilities are either migrated and verified or explicitly retired as product scope, with source retained for recovery.
- [ ] Follow-Up data access/export is resolved; all actual legacy databases are inventoried, mapped, and reconciled or retained deliberately.
- [ ] Hosted forms/embeds, webhook URLs, scheduled sends, and any deployments using legacy code have an owner and a tested transition.
- [ ] Shared identity, role checks, billing, privacy, and business scoping pass cross-workspace tests after consolidation.
- [ ] One scheduler owns each send workflow; the migration cannot cause duplicate email/SMS/WhatsApp sends.
- [ ] LocalLift passes the release checklist and the cutover/rollback procedure is tested.

During the consolidation step only local layout/source preservation changed; no production service was changed then. The later integration review separately applied additive migration 020 as documented above. The live app still needs the engineering fixes above and C02–C05 consolidation work.

## Agent work packages and branch coordination

Every open roadmap item belongs to a package below. These are intended for separate agent sessions and branches, not simultaneous editing of one checkout. **A00 is the integration owner.** A branch's existence does not mean its dependencies have merged or its work has started.

### Shared execution rules

1. Start from the committed consolidation baseline on local branch `chore/unified-workspace` in the canonical Ornigami repository. Use its initial consolidation commit as the shared baseline; A00 can advance the integration branch as reviewed fixes merge. New worktrees must include the migration inputs, documentation, and exclusion configuration from that commit. The branch is local; it has not been pushed or deployed. Do not start feature branches from one of the archived Git repositories.
2. Give each session an isolated Git worktree and its own branch. A typical setup is `git worktree add ../../Ornigami-Worktrees/<ID> -b <branch> <baseline-ref>` from `Ornigami-Agents`. This places worktrees beside `Ornigami`, keeping its single project folder clean. Give each worktree appropriate ignored local configuration; it does not inherit `.env.local`, dependencies, or the Vercel CLI link automatically. Use isolated/test databases and provider test mode for mutation tests.
3. Dependencies in the table mean **merged implementation/API contracts**, not merely another agent working on them. Independent analysis, provider-contract mocks, and module-local scaffolding can start earlier; do not implement against guessed business/usage/draft contracts. Rebase onto the integration branch before final validation.
4. File ownership below is the default. Shared files (`package.json`, lockfile, `src/auth.ts`, `src/proxy.ts`, shared business/usage services, Google reply helpers, cron routes, and the roadmap) have designated owners. Request a coordinated handoff instead of parallel rewrites. Each agent can add uniquely named tests for its behavior; A17/A00 integrate discovery and CI wiring.
5. A00 assigns migration numbers before implementation. The reservations below are unique provisional filenames after `017`; leave unused numbers unused, and do not renumber a migration once applied anywhere. A reservation permits adding a reviewed migration, not running it against production. Coordinate cross-table changes through A00 and dependent package owners. Lead data uses canonical business/user foreign keys and a separate `stl_*` namespace.
6. Each package delivers a branch/PR with its problem, resulting behavior, migration/environment changes, meaningful validation, and rollback notes where applicable. Update its acceptance evidence; A00 reconciles the single roadmap during merge so agents do not all rewrite it. Do not commit secrets or generated builds, edit the preserved originals, send real customer messages, switch provider callbacks, or deploy as part of an ordinary implementation task.

### Work packages

**Reviewed package status:** A01/A02/A03/A04/A05/A08/A18 are integrated. A06 delivery and A09 draft contracts are reviewed with A00 integration fixes; A11 exports and disabled deletion foundation are reviewed, with E03 activation explicitly outstanding. One 14-day trial per business and billing owner is approved. The A06 Booster quota policy is also explicitly approved; other product proposals remain unapproved unless recorded otherwise. See [wave 3 evidence](./tasks/A00_WAVE3_INTEGRATION_REVIEW.md).

| ID / branch | Scope and owned files | Dependencies / reserved migration | Acceptance and handoff |
| --- | --- | --- | --- |
| **A00 · `chore/unified-workspace`** | Coordinate the single-root baseline, README/architecture/scope/roadmap, worktree setup, schema contracts, migration allocation, merge order, and final cutover ownership. Local structure/preservation and the local baseline branch are prepared; review and later integration remain. | Baseline precedes every implementation package. No production changes. | Review the baseline containing source references and exclusion config; verify no nested active repositories/packages, no secret inclusion, working Vercel linkage, passing checks, and a recoverable backup. Merge package evidence into this roadmap. |
| **A01 · `fix/release-toolchain`** | **E01/E12**: vulnerable dependencies, Next/ESLint alignment, reproducible target-runtime build/font/CSP generation. Own `package.json`, lockfile, build configuration, and quality/security CI dependencies. | A00. No migration. Coordinate dependency additions from A14/A17. | Audit, clean install, lint, TypeScript, tests, and the committed production build pass on Node 22/Linux plus supported local setup. Record remaining applicable advisory decisions and CSP/auth regression evidence. |
| **A02 · `fix/business-access`** | **E08**: shared actor/business/owner/integration context, entitlements, policy/usage ownership, and disconnected-Google access. Own shared business/access/plan/context helpers and `src/proxy.ts`. Define contracts consumed by billing, team, Google, privacy, and lead work. | A00; reserve **018** if needed. | Complete member uses the owner's paid workflow/Google integration while owner-only operations remain denied; owner can use billing/team/Booster without GBP. Contract includes usage-window ownership; coordinate with A03/A06/A08. |
| **A03 · `fix/billing-lifecycle`** | **E02/E04** plus trial eligibility: owner-only checkout/change-plan/portal, canonical customer mapping, checkout idempotency, current-state webhook reconciliation and recoverable/atomic updates. Own Stripe routes, billing services/policies, and webhook persistence. | A02; reserve **019**. | Member gets 403; concurrent checkout produces one subscription; trial reuse follows explicit policy; shuffled/duplicate events, portal price changes, payment failure, and partial processing converge. Hand deletion cancellation API to A11 and usage metadata to A06. |
| **A04 · `fix/account-recovery`** | **E11**: resend verification, delivery failure, password recovery, signup limits/input bounds, preserved return destinations. Own registration/verification/recovery routes, auth-verification helpers, login/signup UI, and the session invalidation contract in `src/auth.ts`. | A00; reserve **020**. Agree stale-session interface with A11; team invite callback handoff goes to A05 after merge. | Failed/expired verification recovers; unavailable production mail fails clearly; secure recovery and signup abuse controls work; tests cover Google/credentials return destinations without leaking account existence. |
| **A05 · `fix/workspace-invitations`** | **E09**: expired invites, atomic seat reservation/acceptance, revoke/remove UI and APIs, invite-through-signup flow, downgrade access. Own team routes, invitation page, team component, and coordinated auth return-path updates. | A02 + A04; reserve **021**. | New invited user joins intended workspace; expired email can be reinvited; parallel requests never exceed three users; revoke/remove/downgrade rules enforce access. Test with isolated owner/member identities. |
| **A06 · `fix/booster-delivery-quotas`** | **E05/E06/I01**: recoverable send claims, stable Resend idempotency, atomic usage reservation/monthly windows for annual billing, deferred quota state, SQL-bounded eligibility, suppression races, generation failure accounting, actual visit timing/localized email copy. Own Booster runner, database service, generator, provider send contract, fair-use and shared usage changes by agreement. | A02 + A03; reserve **022**. | Cron/manual overlap and persistence failures cannot duplicate sends/exceed allowance; claims recover; annual renewal/upgrades work; human timing/localized fallback and phone-only state are correct. Hand intake and delivery-event contracts to A07/A10. |
| **A07 · `feat/booster-booking-intake`** | **C02/I05/I10**: secured generic booking webhook, atomic event/visit dedupe, conflict-aware CSV, retained rebooking/sender settings, validated external URLs, accurate intake/sendability guidance. Own booking/Booster intake/settings routes, CSV/settings UI, and database-service extensions after A06. | A06; A18 defines retained settings; reserve **023**. | Replayed/cross-business/unauthenticated events rejected or deduped correctly; concurrent CSV gives consistent row outcomes; settings are not silently erased; links follow destination rules. Generic source labels are not advertised as native provider connectors. |
| **A08 · `fix/google-integration`** | **E07**, Review Replies 429/backoff and batched sync: one token-aware client, account/location resource mapping, decryption/refresh, exact reply contract, pagination, selected-location enforcement, business-owned connection. Own Google clients/token/sync helpers and routes, including the provider-post portion of `review-reply-server.ts`. | A02; agree selected-location/schema needs with A00 before adding any extra migration. | Exact-request tests pass without credentials; encrypted/expired tokens refresh correctly; ownership and one-location limits hold; paginate/back off/batch safely. Hand stable provider posting and resource contracts to A09/A16. |
| **A09 · `fix/review-draft-policy`** | **E10**: preserve human edits, versioned/atomic drafts, shared generation/approval/post policy, all 1–3-star automation checks, scheduled-vs-interactive consistency and usage charging. Own reply persistence portion, review processing/cron routes, and review Generate/Save/Post actions. | A08 + A02; reserve **024**. A08 hands over shared reply helper; A12 then adds cron health/budgets. | Repeated cron preserves human drafts without another charge; concurrent saves do not lose text; low/unknown ratings never auto-post; scheduled and UI behavior meet explicit policy. |
| **A10 · `feat/email-delivery-events`** | **I03** and future sending domains: verified Resend delivered/bounce/complaint webhooks, accepted/delivered/failed states, event idempotency, suppression, sender-domain setup guidance. Own new delivery route/services and agreed Booster send/status interfaces. | A06 + A07; reserve **025**. | Signed/replayed/out-of-order delivery events produce correct state; bounce/complaint prevents later mail; delivery is distinct from click/review conversion. Document customer-specific domains as later work if not shipped now. |
| **A11 · `fix/privacy-account-lifecycle`** | **E03/I06**: paid-account deletion cancels external billing first, recoverable provider failure, stale JWT blocking, owner/member distinction, Google revocation, complete personal/workspace export and retention policy. Own privacy routes/retention and deletion orchestration; consume A03/A04 contracts instead of rewriting them. | A02 + A03 + A04 + A05; reserve **026**. Coordinate new lead/delivery table coverage with A10/A14. | Deleted paid owner cannot still be billed or resurrected by old JWT; member deletion preserves workspace; partial failure recovers; export/retention respect ownership and keep suppression protection. No production destructive test. |
| **A12 · `fix/operations-monitoring`** | **I02/I07**: timeouts/resumable budgets, partial/failed/no-work cron semantics, stale-run alerts, privacy-job health, actionable Sentry/global errors, operator support inbox/notifications and correct DSN docs. Own cron-health/logging/monitoring utilities, error boundaries, contact/feedback support flow and cron workflow checks. | A06 + A09 + A11 before editing their runners/cron routes; independent error/support work may start earlier. Reserve **027**. | Simulated provider timeout/partial failure alerts without false success; privacy health persists; controlled error reaches Sentry; support submission reaches the operator workflow with rate limits and no sensitive logging. |
| **A13 · `fix/dashboard-usability-performance`** | **I04/I08** and first-send guidance: independent stats aggregates, inbox/visit pagination/indexes, encoding fixes, mobile/keyboard/error/empty/loading/action clarity, CWV/Lighthouse baseline and later bundle analysis. Own dashboard summary/list-query surfaces and UI after workflow contracts settle. | A07 + A09; reserve **028**. Avoid runner/Google helper rewrites; coordinate shared components with A14. | Large synthetic business data remains bounded; pagination has correct business scope; text renders correctly; keyboard/mobile flows and Generate/Save/Post semantics pass review. Record measurement limitations before production traffic exists. |
| **A14 · `feat/speed-to-lead-module`** | **C03**: port Contactor into `src/modules/speed-to-lead`, thin form/Twilio routes, shared owner/internal-admin authorization, qualification/conversations/SMS/WhatsApp/callbacks/escalation/onboarding UI. Retain feature gate until validated. Own only new lead module/routes/components and its domain schema. | A02 + A05 + A18, A01 for dependency handoff; reserve **029**. A15 owns legacy imports, not this package. | Isolated cross-business/role, Twilio-signature, replay/delivery/escalation/notification, and onboarding tests pass. No standalone auth, second app, or replayed Drizzle initial migrations. Remains disabled pending provider/pricing acceptance. |
| **A15 · `chore/legacy-data-cutover`** | **C01 external inventory/C04/C05**: regain Follow-Up database access, inventory actual deployments/DBs/URLs/embeds/jobs, ID mapping, repeatable migration dry runs/count reconciliation, one-scheduler cutover and rollback runbook. Own migration tooling/mapping tables, not live feature implementations. | Inventory starts after A00; import contracts require A07 + A14 + A11. Reserve **030**. | No inferred empty production DB; verified exports and counts; sent/suppressed states survive; old callback/customer URLs have tested transition; staged cutover plan prevents duplicate sends. Execute production cutover only under a separately explicit instruction. |
| **A16 · `ops/google-launch-approval`** | External Google Basic API access/quota, eligible real client Manager access, consent branding/domain verification, redirect URIs, publication/verification, real controlled Google smoke test. Own Google runbook and approval evidence. | Application preparation can start after A00. Real provider test requires Google approval + A08 + A09 and supplied account/Console access. No migration. | Record actual approvals/nonzero quota, registered callbacks, eligible account, successful discovery/sync/draft/post/cron/Booster URL derivation. Do not invent a Business Profile or treat mocks as approval evidence. |
| **A17 · `test/launch-acceptance`** | **I09**, Stripe production QA and final release operations: cross-workspace end-to-end/auth/CSP/cron/Sentry/Stripe/Google acceptance, test discovery/CI handoff, clean release install/build, deployment checklist and staged pilot/rollback evidence. Every implementation owner already supplies its own regression tests. | Test design starts after A00; acceptance follows relevant merges A01–A13/A19 plus A16 for Replies. Add A14/A15 only when launching lead capability. | Exact release commit passes required checks; payment/trial/downgrade/annual usage and failure/replay paths work; security/privacy/send/approval claims validated. Live charges/messages/replies/deployments require explicitly authorized controlled targets. |
| **A18 · `docs/product-contracts`** | Deferred product decisions: selected-location scope, quota/trial/downgrade policies, legacy rebooking/sender settings, lead launch/pricing/provider scope, Local SEO/free audit and project API future, QR tool and broader agency model. Own product/specification documents; A00 reconciles roadmap changes. | A00. Supply decisions to A03/A05/A07/A08/A09/A14 before affected behavior is finalized. | Document retained capabilities and pricing/UI promises, distinguish current reputation launch from future lead launch, record decisions needing owner input, and defer QR/agency work explicitly. Do not silently retire features or enable/sell unfinished agents. |
| **A19 · `fix/csp-runtime-hardening`** | Security follow-ups: Trusted Types production reports/sinks, inline-style constraints, nonce/static hashes after upgrade, Auth.js v5 stable migration assessment when available. Own security headers/CSP reporting/instrumentation hardening; auth changes need A04 handoff. | A01 before final enforcement/build validation; coordinate Sentry/error instrumentation with A12. No planned migration. | Controlled CSP/auth smoke tests pass with no broken pages; measure reports before enforcement; document constraints. Do not claim stable Auth.js is available without checking or enforce Trusted Types speculatively. |

### Suggested scheduling and merge order

- **Next implementation wave:** A07 intake can use the reviewed A06 sender contract; A12 operations can integrate Booster/Reply health, budgets and bounded privacy cleanup. A11 must run a coordinated activation follow-up across its documented shared files and E03 blockers; do not enable deletion or schedule destructive cleanup before those contracts are complete. A15 inventory, A16 approval preparation, A17 acceptance design and A19 CSP assessment remain independent.
- **Merged contracts:** A03/A05/A08 dependencies are satisfied. A06 consumes A03 authoritative business billing metadata; A09 consumes A08 pinned selected-location/provider contracts; A11 consumes A03 cancellation fencing, A04 session revocation and A05 team lifecycle. A14 scaffolding remains gated by lead product/provider decisions and must stay disabled.
- **Dependent workflow fixes:** A10 delivery events starts after A07 intake; A13 full UI/performance follows A07 and consumes the now-reviewed A09 drafts. A13 must coordinate deletion recovery with A11. A12 and A11 agree cron ownership and job drains before activating deletion.
- **Separate launch lanes:** the reputation release requires A01–A13/A19 as applicable and A17 acceptance; Replies additionally requires A16. Full lead consolidation additionally requires A14/A15 and its provider/pricing acceptance. External inventories and product decisions remain tracked even if they do not block the email-only pilot.
- **Final integration:** A00 resolves shared-file/schema conflicts, updates this roadmap from merged evidence, and hands the exact release commit to A17. Preserve backups and source references until A15's recovery/cutover gates are satisfied. PR completion is not proof of deployed production completion.

## Closed items that should not be re-added as pending

- **E05/A06 and Booster part of E06:** durable frozen payload/idempotency replay, fenced claims, business-serialized UTC reservations, bounded eligibility, suppression rechecks and quota-deferred states are implemented. The owner-approved UTC policy is recorded; A00 connects usage/status/reset/expiry UI and cron reporting. A07 consumes this sender; A10/A17 still validate provider recovery and authoritative unknown reconciliation.
- **E10/A09:** current-version/history preservation, CAS human saves, generation/usage reservations, exact-text/version approval, low/unknown-rating manual-only posting and scheduled draft-only processing are implemented. A00 fixes billing lock order, mutation origins and dashboard counts. A13 owns authoritative ambiguous-post recovery UI and A16/A17 provider acceptance; never release a post fence merely because its lease elapsed.

- **E02/E04/A03:** owner-only billing, durable immutable checkout/customer intents, trial history, and current-state fenced atomic webhook snapshots are implemented. Trial policy is approved; real Stripe acceptance, legacy-unknown trial reconciliation and deletion orchestration remain A17/A11/operator work.
- **E09/A05:** expiry/reinvite, atomic three-seat reservation/acceptance, revoke/remove and preserved auth callbacks are implemented. A00 serialized bootstrap with acceptance and billing snapshots with team admission. New downgrade/member-access policy remains unapproved; live browser/mail acceptance belongs to A17.
- **E07/A08:** canonical API paths, token encryption/refresh/retries, pagination, selected-location ownership, batched review persistence and generation fencing are implemented. A00 adds a minimum owner selection UI. Google approval/live acceptance remains A16/A17; owner-confirmed location-switch/recovery policy and full workspace UI remain A18/A13/A11. Cron retains baseline active/trialing admission until its owner/policy handoff.

- **E01/A01:** dependencies patched/aligned; full and production audit zero; clean Node 22 install verified. See [A01 handoff](./tasks/A01_DEPENDENCIES_BUILD_CI.md). Signed-in provider acceptance remains A17.
- **E12/A01:** the committed webpack build, CSP generation and production smoke pass on the integrated Node 22 checkout; CI runs typegen, all test suites, production build and smoke. Remote target-Linux CI must pass before merge; no undocumented local build workaround remains.
- **E11/A04:** resend, secure reset, bounded registration, safe callbacks and versioned session revocation are implemented and regression-tested; migration 020 is verified on the configured production database. Auth recovery pages use the app layout. Live email/provider acceptance and durable email outbox decisions remain A10/A12/A17. See [A04 handoff](./ACCOUNT_RECOVERY_HANDOFF.md).
- **A18:** product proposal documents and handoff are reviewed; one-time trial policy is now approved; A06 Booster quota policy is also approved; new Reply quota/grace/downgrade/location-switch/automation/lead policies still require owner decisions before behavioral changes. See [product contracts](./product-contracts/README.md).

- Review Booster’s 23-hour-to-seven-day selection window is enforced in the database query.
- Review Booster has per-run fair-use checks and retry/backoff rules. A06 replaces those legacy checks with durable claims/reservations; provider recovery and annual-window acceptance remain release gates.
- Detailed Review Booster failure reasons are shown in the visit table.
- GitHub Actions uses current checkout/setup-node actions and Node 22.
- Local migrations include `014` through `017`; keep deployment environments aligned with them.

## Working rule

When an item is completed, remove it from the open sections and record the implementation in the relevant architecture, deployment, or database document. Do not create another roadmap or audit backlog for this repository.
