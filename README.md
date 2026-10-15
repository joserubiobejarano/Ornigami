# Ornigami

One Next.js application for local-business reputation workflows: Review Booster sends post-visit review requests; Review Replies syncs/drafts/responds to Google reviews; business billing and memberships share one workspace. Complete combines the reputation agents. Speed to Lead is disabled/coming soon; preserved legacy source is not an active second application.

## Project and current readiness

The canonical checkout is `C:\Users\joser\Desktop\Projects\Ornigami`; run commands directly in that folder. The October 16 consolidation removes the ten completed task worktrees and the nested `Ornigami-Agents` folder while preserving Git history and private evidence. On October 13 the owner changed the hosting direction from Vercel to a VPS; Contabo US East/Coolify is planned for November 2026, with access and rollout pending. The systemd/Caddy reference requires adaptation to that actual target. Historical Vercel linkage does not establish VPS readiness or completed decommissioning. Private recovery archives, receipts and their path/hash index live in the owner-restricted, Git-ignored `.local/recovery`; never upload or commit that area. Git history retains original handoffs; [release evidence](./docs/RELEASE_EVIDENCE.md#workspace-cleanup-and-recovery) also records the separate October 4 loss of selected untracked receipt copies.

The established **one 14-day trial per business and billing owner** remains. No card at entry; unknown history needs reconciliation; no payment method at expiry cancels. The temporary paid-only/no-new-trials proposal is cancelled. Permission/retention, default-off paid-AI controls, browser improvements, isolated measurements and monthly/annual sandbox billing journeys are integrated; target rollout and external onboarding evidence remain in the [roadmap](./docs/ROADMAP.md). Review Booster can use a validated manual Google review URL; Replies/Complete sales still require Google approval and real-provider acceptance. Production self-service deletion and uncertain-provider reconciliation remain disabled.

## Develop and verify

1. `npm ci`
2. Configure `.env.local` using [operations](./docs/OPERATIONS.md); never print or commit credentials.
3. Follow [technical migration guidance](./docs/TECHNICAL_REFERENCE.md) and the [migration ledger](./neon/README.md), against a verified isolated development target. Do not replay legacy initial migrations into production.
4. `npm run dev`, then open `http://localhost:3000`.

Relevant checks are `npm run lint`, `npm run typegen`, `npx tsc --noEmit`, `npm test`, `npm run security:audit`, `npm run test:security`, `npm run build` and `npm run test:build`. Run checks appropriate to a changed criterion; consume existing unchanged-scope acceptance rather than repeating closed agent packages. A passing test is not live payment, Google approval, production erasure or natural scheduler proof.

## Documentation

The current guides are:

- [Roadmap](./docs/ROADMAP.md): current backlog, release gates and branch coordination.
- [Product contracts](./docs/PRODUCT_CONTRACTS.md): current/approved/proposed commercial, trial, quota and workflow rules.
- [Operations](./docs/OPERATIONS.md): environment, deployment, support/privacy, Google/provider runbooks, scheduling, retention and rollback.
- [Technical reference](./docs/TECHNICAL_REFERENCE.md): architecture, API families, schema and durable security/provider contracts.
- [Release evidence](./docs/RELEASE_EVIDENCE.md): scoped accepted proofs, exact commits/targets and unresolved observations.
- [User guide](./docs/USER_GUIDE.md): setup, CSV, send timing, statuses and safe recovery.
- [VPS runtime/cutover reference](./deploy/vps/README.md): prepared units, 039–042 schema checks and actual-target acceptance gates.
- [Privacy operations](./docs/PRIVACY.md): account/agreement evidence, inbound routing, assisted rights, provider retention and VPS verification.
- [Customer processing addendum draft](./docs/PRIVACY_CUSTOMER_PROCESSING_ADDENDUM_DRAFT.md): separate unsigned customer-facing template.

Source-specific migration inputs and original instruction/provenance files remain under [migration-sources](./migration-sources/README.md). The schema ledger and vendored adapter README remain alongside their implementation; they are not separate current roadmaps. `AGENTS.md` and `CLAUDE.md` are agent tooling instructions, not duplicate product guides.

Original pre-cleanup documents can be read with `git show 84334c7:docs/tasks/<file>` (or the relevant former docs path). The private recovery bundle also preserves local branches and detached review heads; the uncommitted-work archive preserves unfinished changes without claiming they were merged.
