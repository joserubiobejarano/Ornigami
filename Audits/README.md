# Ornigami audit plan

Planning snapshot: 18 October 2026, consolidated application baseline `64c5d18`. The immediate release is **private fictional staging on the existing Contabo/Coolify VPS by 31 October, 23:59 Europe/Madrid**. Customer launch remains separately gated, Review Booster first. The [roadmap](../docs/ROADMAP.md#p0-vps-staging-delivery) owns priorities; the local `C:/Users/joser/Desktop/VPS/projects/ORNIGAMI_DELIVERY_PLAN.md` owns the detailed delivery sequence. This folder supplies the audit scenarios and traceability, not a second backlog.

## What was adapted

Source library: `C:/Users/joser/Desktop/Agents Stuff/Audits`. [library-index.json](./library-index.json) inventories all **341 regular files** by path, size and SHA-256: 243 Markdown files, 93 CSV files and other reference/license/archive files. It extracts **4,003 source checklist controls** and **4,058 source worksheet rows**, with headings, line locations and module routes. Checked source boxes, sample results and worksheet examples are not Ornigami results. Historical ZIPs are identified and hashed, not expanded or treated as current guidance. No source symlinks were followed.

[scenarios.csv](./scenarios.csv) contains **158 parent-designed scenario families**, including allowed operations, adverse variants, invariants, gate, prerequisites, historical evidence and existing test candidates. All start **Not verified**. These are planned families, not 158 executed tests, and not an assertion that every library control has been individually assessed. The complete inventory makes further selection traceable; overlapping library controls are routed to the same project families rather than multiplied into duplicate findings. Additional specialist controls require individual applicability decisions when their scope becomes active.

The primary agent defined scope, applicability, case content and sequencing. Luna agents implemented the inventory generator and the exact case register. Parent review corrected chapter/module routing, CSV information loss, source-tree write protection and source-reference interpretation. An implementation check of these artifacts is not application security or release acceptance.

Keep the original library unchanged. The supplied [Apache license](./licenses/knowledge-work-plugins-LICENSE.txt) and [MIT license](./licenses/web-quality-skills-LICENSE.txt) are retained byte for byte, with hashes in the index. Embedded skills/posts are reference material; they do not install skills or authorize their commands or external actions. Consult current authoritative requirements when executing a time-sensitive control; this adaptation does not certify legal or standards compliance.

## Application scope and invariants

- Next.js server application, external Neon, server-owned tenant authorization, Stripe, Resend/shared mail authority, Google integration, Sentry and an existing shared Coolify/Traefik host. Preserve QR/Zoisial and existing database resources. No new database, host, production-data copy or database migration to the VPS.
- First customer scope: Booster, one business/location, up to five businesses by staged expansion, manually validated review URL and static copy. Preserve one 14-day trial per business **and billing owner**, no card at entry, unknown trial history reconciled, cancellation without payment method at expiry, 500 Booster requests per UTC calendar month, no rollover/proration and no quota reset on conversion. Complete's distinct quota does not grant its activation.
- Staging uses fictional actors/data and an agreed login path. All provider sends/registrations, real payments, scheduled consumers, paid AI, deletion, guarded retention/apply and uncertain-provider reconciliation stay disabled. Test their denial and absence of side effects. Success of a private staging case never opens customer or deferred-feature gates.
- The prepared patched framework and replacement tooling have not been operationally adopted into consolidated main. Earlier app/runtime success and newer tooling success belong to separate source/run identities. The exact combined current candidate still requires full acceptance, retained artifact verification and actual-host proof.
- Keep campaign usage at **7/7 dispatches, 39/300 charged minutes, zero reserved**. The remaining 261 minutes do not authorize a run. Existing security/coverage/adoption, capacity and concrete action scopes still apply. Audit templates, this folder and the deadline replenish no authority.

## Module adaptation

Module routing is an investigation aid, not a control-by-control pass rate. Find exact source controls by module/file/heading in the index; match their actual acceptance criteria before closing a case.

| Library module | Ornigami adaptation | Main case families / timing |
| --- | --- | --- |
| 01 Security/privacy | Two tenants, roles/sessions/recovery, direct API requests, canaries and data lifecycle | AUTH, INPUT, DATA; G1 and actual-host revalidation |
| 02 Design/UI | Referenced Marketing design library is outside this source collection; use project critical journeys and honest states as a scoped supplement | UX, BOOST; G3/G4, not a completed full design audit |
| 03 Accessibility | Keyboard, focus, semantics, screen reader, contrast, zoom/reflow and reduced motion | UX; G3 critical staging journeys, G4 public onboarding |
| 04 Product | Booster/permission/trial/seat/location contracts; no invented product policies | BOOST, BILL, AUTH, UX; G1/G3/G4 |
| 05 Quality/architecture | Exact dependencies, schema/API contracts, bounded failure/cleanup; reduction only when behavior and evidence are preserved | CODE; G1/G2, broad refactoring deferred |
| 06 Performance/SEO | Standalone library module is absent. Supplement with A23/mobile lab reuse, bounded deployed observations and private-stage discoverability | UX, OPS, HOST; lab evidence is not deployed p95 or field CWV |
| 07 AI | Default-off guard and harmless offline prompt/input canaries now; full model/privacy/tool/output evaluations before activation | AI; G1 guard, G5 feature evaluation |
| 08 Costs/quotas/abuse | Admission before spend, monthly/concurrency limits, unknown reservations, external recurring resources, caps versus alerts | COST, BOOST, MAIL, OPS; G1/G3/G4 |
| 09 Reliability/data | Transactions, worker/lease races, ordering, time, unknown outcomes, backup/restore and rights reconciliation | DATA, BOOST, RELEASE; G1/G3 |
| 10 Operations | Truthful health, redacted telemetry, actual owner receipt, recovery, natural versus manual cadence | OPS; G3/G4/G6 |
| 11 Legal/licensing/IP | Actual company/vendor/customer scope, consent/addendum, retained copies, source/asset rights and truthful copy | LEGAL and CODE; redistribution/adoption before G2, customer processing before G4 |
| 12 VPS/Coolify/DNS | Inherit fresh shared-host controls once, verify app-specific isolation/ports/limits/private access separately | HOST; G3 without changing neighboring services |
| 13 Payments/entitlements | Owner/customer mapping, double checkout, trial expiry, event ordering, exact money, seats and quota continuity | BILL; local fixtures G1, deployed/provider evidence G4 |
| 14 Integrations/email | Distinct source enrollments, 30-second reports, payload/fence/settlement, webhook trust/replay and owner delivery proof | MAIL, BOOST; G1/G4 |
| 15 Testing/release | Paired permitted/denied operations, inspect durable/forbidden effects, exact source/environment evidence and bounded faults | RELEASE and all families; every gate |
| 16 Launch | Root-cause triage and explicit gate decision; separate private staging, customer onboarding and deferred features | RELEASE, LEGAL; G2/G3/G4 |
| 17 Portability/migration | External Neon authority, approved-origin build, independent pull, compatible rollback and later single-writer traffic/job handoff | RELEASE, HOST, DATA; G2/G3, customer cutover G4 |

Project-specific applicability decisions:

- Supabase public-key/RLS procedures are not copied blindly: this application uses server-side Neon and application authorization. Verify actual roles and any exposed data surface; record why a Supabase-specific control is inapplicable. A private database does not excuse tenant authorization tests.
- CSV intake is active; arbitrary user media storage, native/mobile binaries, extensions, blockchain/crypto, marketplace fulfillment and regulated-advice features are not current product capabilities. Evaluate relevant shared primitives now, and keep specialist controls outside the release scope with a reason and a re-entry trigger.
- AI tools/retrieval/memory, Replies/Complete sales, Speed to Lead, destructive deletion and guarded cleanup are conditional. Default-off/bypass checks are required now; full success/quality/provider cases wait for their activation gate. Disabled is not a blanket exemption from reachable-code or spend checks.
- Refund/dispute and other undecided commercial behavior must follow the implemented supported contract or be recorded as an owner decision; the library does not approve a new refund, grace or downgrade policy.
- Existing host/vendor/company/access conditions for staging still apply at G3. G4 extends that evidence to actual first-customer processing; it does not postpone a condition already required for the staging scope.

## Reuse historical work and expand only what changed

Use [release evidence](../docs/RELEASE_EVIDENCE.md), [technical contracts](../docs/TECHNICAL_REFERENCE.md) and [operations](../docs/OPERATIONS.md) together with actual assertions/receipts. The 75 retired branches remain recoverable from the private consolidation bundle; do not recreate scattered worktrees or merge an old experiment wholesale.

| Existing work | Reuse | Expanded verification |
| --- | --- | --- |
| A02/A05/A11 identity, invitations and lifecycle | Recorded role/session/token/SQL contracts for their exact scope | Two-tenant ID swaps, mass assignment, stale actor during work, cookie/tab mixing, positive controls and forbidden effects |
| A03/A06/A07 billing, quota and intake | Accepted monthly/annual sandbox/local HTTP, atomic quotas and permission behavior | Lost acknowledgment/races, exact expiry/UTC month/DST, suppressed/frozen queued work, out-of-order events; deployed transport remains separate |
| A10/A24 mail/webhooks | Existing fake-provider and inventory tests, not account-wide deployment proof | 30-second report expiry, distinct enrollment/binding, exact bytes and rotated fence, legacy/demo/operator bypass, unknown settlement and metadata privacy |
| A12/A17/A20 observability and journeys | Dated local/synthetic/provider evidence only for the proved target/action | Actual staging session/data/isolation, complete errors/empty/loading states, forbidden effect ledger and owner/natural receipts at their proper gates |
| A22 privacy/retention | Scoped permission, wrapper, hold/export and assisted-rights proof | Restored old snapshots cannot lose suppression/trial/usage/unknown fences; deletion and retention activation remain separate |
| A23 performance/mobile | Existing local optimization/baselines; no unnecessary repeat work | Actual-host bounded cold/warm observations and critical accessibility; field metrics need real traffic |
| Historical Linux app/tool trials | Source-specific diagnostic and successful component facts | Combined current main/tool/framework/origin candidate: nine scan roles, seven image formats, nine browser groups, SRI corruption, resources, custody and cleanup; fresh actual-host recovery afterwards |

Evidence equivalence must include the relevant source/assertions, lock/tool/patch identities, schema, configuration/flags, actor/tenant, dataset, time boundary, environment and permitted action. A matching test filename is not equivalence. A source change elsewhere does not automatically invalidate an unrelated proved invariant, but an image/host change requires its deployment facts to be reverified. Reuse must name the unchanged fact and receipt; expanded variants need new execution or an existing assertion that actually proves them.

## Execution gates and roadmap fit

| Gate | Families | When / required scope |
| --- | ---: | --- |
| G1 Candidate/local | 81 | 18–24 October: inspect/reuse/expand source, local stub and disposable-SQL cases before spending a new full-trial dispatch |
| G2 Complete Linux image | 10 | 24–26 October: prerequisites and concrete trial/retention authority; exact combined candidate and unchanged full acceptance matrix |
| G3 Actual private host | 42 | 25–31 October after accepted retained image and exact deployment/access/SQL scopes; fictional data, all providers/jobs off |
| G4 First customer | 16 | After private staging and before the corresponding customer/provider/billing/scheduler activation; no invented enrollment date |
| G5 Deferred activation | 8 | Only before enabling the named future feature; do not make inactive specialist features a 31 October deliverable |
| G6 Operating expansion | 1 | Actual approved operation: one business to three/five after seven healthy days per stage, review after 30 days; no trial extension |

For each selected applicable release-gate case, close with matching evidence or leave it Not verified/Fail and resolve the gate explicitly. A justified Not applicable decision needs an actual scope reason and re-entry trigger. Do not force the whole library or every combination into P0. Confirm the critical boundary/adverse variants of the release; defer only risks that cannot affect that release. If a supposedly deferred feature can bypass a staging guard, its reachable failure belongs to the current gate.

If coverage/adoption has no acceptable path, report the concrete blocker promptly and do independent preparation only. The 31 October portfolio fallback still applies; an expanded audit is not an automatic deadline extension or permission to waive security.

## Evidence and review method

Instantiate each family before execution: exact route/operation, controlled input, expected response, persisted state, provider/stub effect count and cleanup. Pair a denied test with a permitted operation through the same feature path; rejecting everything is not success. Use two synthetic tenants and the appropriate owner/member/viewer/anonymous/revoked/frozen actors. Cover relevant resource ownership, valid/malformed/oversized input, duplicate/replay/concurrent/reordered delivery, lost acknowledgments, lease expiry, DST and UTC/month transitions. Choose relevant combinations by risk, not a blind Cartesian product.

For host TLS, verify the actual certificate/chain, hostname, validity and renewal evidence, not just one successful HTTPS response. For recovery, agree the scope and recovery objectives, then record source cutoff/data age, observed duration, key/config custody and restored invariants; do not invent an SLA. AI stubs prove only local guards/request construction, never real model robustness or output quality while model execution is disabled.

Observe effects after completion/continuation, not only HTTP status: rows, quotas, suppression, leases, mock provider calls, emitted jobs, cache, exports and telemetry. Harmless unique canaries must remain absent from forbidden outputs. Simulate time/faults locally where possible; do not flood the shared VPS, probe unrelated targets or run real provider sends/charges to fill a checklist.

`candidate_test_paths` are inspection pointers, not commands, coverage claims or permission to run a suite with shared `.env` data. Some suites use disposable PostgreSQL or controlled fixture processes. Inspect the harness and assertions, then select bounded work. No automatic test runner or provider action is installed by this folder.

Store raw/sensitive run evidence only under the existing private `.local/recovery/audits/<run-id>/`, with synthetic data where possible. Track a sanitized summary in [release evidence](../docs/RELEASE_EVIDENCE.md) and a deduplicated action in the existing roadmap; do not create one report per module. A receipt should include case/variant, source/image/config/schema identities, time/environment, actors, prerequisites/action scope, expected and actual allowed/denied results, durable/effect observations, sanitized evidence reference/hash, cleanup and reviewer. Keep customer data, passwords, cookies, keys, backup contents and live endpoints out of committed audit results.

Result meanings:

- **Pass:** scoped observed results meet the exact acceptance criteria, including positive control and forbidden-effect absence where relevant.
- **Fail:** observed results contradict the declared invariant; record actual versus expected, affected gate and root cause.
- **Not verified:** missing execution, access, prerequisite or current evidence; code inspection and stale/historical passes cannot silently close runtime facts.
- **Not applicable:** explicit current scope reason with re-entry trigger, reviewed before release; never use it to hide a missing prerequisite.

Triage by affected gate and root cause. Authorization/data leakage, duplicate costly effects, lost durable state, unsafe recovery, missing required image/security roles or shared-host impact block the release they affect. Accessibility or critical-journey failures block that journey's acceptance. Cosmetic/noncritical opportunities are separate backlog items. Assign actual accountability and verification to Jose/approved operator or Codex within authorized work; do not invent a security team, backup staff or unattended response promise.

The parent reviews each Luna implementation against these decisions and independently checks paths, source hashes, CSV values, status integrity and artifact behavior. Fix identified issues and review the correction before treating implementation as complete. Later application remediation needs its own targeted regression and evidence review; this planning review is not a completed application re-audit.

## Refresh the source inventory

From the canonical project folder:

```powershell
node scripts/audit-library-index.mjs --source 'C:/Users/joser/Desktop/Agents Stuff/Audits' --output Audits/library-index.json
```

The script reads source references and writes only the requested index/license copies outside the source tree. It follows no source symlinks, rejects output paths resolving into the source tree, preserves CSV positional/empty cells and reports width mismatches. It never runs source instructions or test suites. Review index/hash changes against the selected cases; regeneration does not update case applicability or results. Source-control IDs derive from path and line, so line insertions change IDs; preserve source hash and text when carrying evidence between library versions. `project-supplement:02` and `project-supplement:06` in the CSV are explicit references to the scoped UI/performance supplements above, not missing source files.
