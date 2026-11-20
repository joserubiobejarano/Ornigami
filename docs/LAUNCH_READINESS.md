# Ornigami launch readiness

Updated 20 November 2026, Europe/Madrid. Current reviewed local source: `51291908ed1652414fa95c8e26657eb06c0fbc72`, dedicated `C:/Users/joser/.local/ornigami-builder-integration-review-20261120` worktree; [integration review](./BUILDER_INTEGRATION_REVIEW_20261120.md). [Current state](./CURRENT_STATE.md), [roadmap](./ROADMAP.md) and [latest independent review](./design/PRODUCT_FOCUSED_OFFER_COMPOSITION_REVIEW_20261120.md) record the supporting evidence. Main remains a dirty legacy checkout; these documentation changes do not merge or deploy the builder.

## Position

The local creation/export engine works across synthetic brands and an agent-operated real-brand case. It includes exact briefs/assets, Clear/Editorial directions, review-first palette evidence, optional product-focused composition, validated plan generation/fallback, exact-revision local approval and portable exports. Source/provider canaries and the small guidance comparison have completed under their recorded allowances. Those allowances are consumed; human design judgments, independent customer use and repeatable model-quality claims remain separate.

There is no accepted hosted campaign-builder product. The separate `builder-runtime/` is locally qualified with builder-only configuration, closed access and no legacy route surface. Builder build/smoke record zero denied egress attempts. Campaign Lab routes and generation/import APIs remain development-only. A green development journey or production 404 test is not a deployed customer journey. Existing legacy sign-in, database and Stripe code have not been accepted as builder-specific ownership, persistence or billing.

## What a launch can mean

| Outcome | Current position | Planning estimate from this checkpoint |
| --- | --- | --- |
| One approved campaign page served publicly as static HTML/assets | Export exists; final page/design decision and hosted preview/publication/recovery remain | About 3–7 focused working days if scope/hosting approval and review are prompt. This publishes a page, not the Ornigami self-serve product. |
| Small invite-only creation/export beta | Engine exists; production app boundary, customer access, service limits, recovery and user testing remain | Roughly 2–4 focused engineering weeks for a tightly scoped beta. If projects are not durable, that limitation and a usable save/import path must be explicit. Hosted campaign publishing is not assumed for this estimate. |
| Narrow public self-serve MVP with hosted campaign URLs | Product/service layer and real hosted acceptance remain substantial work | Roughly 6–10 focused engineering weeks under the scope below, with contingency if framework/runtime/security or customer-quality validation exposes larger gaps. |

These are engineering judgment ranges, not measured remaining effort or committed dates. They assume one focused engineer assisted by agents, timely owner decisions/review, one hosting target, one offer format, no expansion into a free-form editor, and a usable runtime. Calendar time grows with delayed decisions, integration defects, broader formats/domain features or unresolved release blockers. No percentage-complete claim is meaningful across the engine and the unbuilt product layer.

## Proposed first-release scope — requires a product decision

The current implementation target is the non-paid invite-only creation/export beta: manual approved assets, static offers and no server project/asset persistence. Runtime containment and emphasis finishing are accepted locally; invite/session identity, a usable prepared-brief save/import path and service budgets are next. Hosted-MVP proposals below remain separate decisions.

Single-product offers, Clear/Editorial, default/Product focus, manual/approved-asset brand input, static pages, exact preview/local approval and export. For a hosted public MVP, begin with platform-hosted campaign URLs and stable approved revisions. Treat custom-domain automation, broader formats, general website-style cloning, lead forms, advanced animation, Shopify and split testing as later capabilities unless explicitly required for the first release.

Keep optional URL import out of the public critical path initially: its local native canary is accepted, but the current trusted runner's fixed one-transaction grant is not a multi-user import service. Manual/no-website input already covers the real-brand pilot. If public URL import is required at launch, add hosted egress, per-user controls, complete outcome capture and abuse qualification to the schedule.

An invite-only export beta may defer hosted publishing and billing. A paid public release needs builder-specific pricing/entitlements and verified payment/usage behavior. None of these scope proposals changes the owner's earlier domain-integration goal or authorizes deployment; they make the first-release trade-off explicit.

## Required gates

| Gate | Existing evidence | Remaining outcome |
| --- | --- | --- |
| Release source and application boundary | Exact integrated source `5129190`; separate closed `builder-runtime/`, builder-only build/start and absent legacy routes locally checked | Qualify the selected target at the exact SHA; preserve the separate legacy application and its obligations. Do not serve the root legacy app as the builder runtime. |
| Output quality | Product focus 1.1.0, desktop spacing and exact reviewed emphasis; reproduced wrapping/contrast defects corrected with identity 7 | Obtain target-user/brand acceptance and low-assistance use. Keep current recipes fixed unless a reproducible defect or changed requirement warrants work. |
| Hosted access and ownership | Legacy auth exists; lab is development-only | Builder access control, project/asset ownership, cross-account denial and session behavior work on the selected target. Existing reputation entitlements do not confer builder permission. |
| Draft and asset recovery | Session text/prepared JSON; images/approval require reselection | Either deliver durable projects/assets with ownership, byte/type/size validation and recovery, or explicitly ship an export-only beta with tested save/import and clear local-data limits. Do not imply persistence that is absent. |
| Generation as a service | Shared harness, validation, timeout/fallback, safe diagnostics and prior real requests | Authenticate public requests; enforce per-user/global cost, concurrency and rate budgets; handle exhausted credits, cancellations and abuse. Verify current provider configuration on the exact release candidate under fresh bounded authorization. |
| Hosted publication (for hosted MVP) | Approved standalone artifacts | Publish the exact accepted revision under a stable URL, independently serve assets, preserve prior live version on failure, and implement rollback/unpublish. Keep editing separate from public serving. Verify HTTPS, cache behavior, destination and metadata on the actual target. |
| Runtime/security release | Separate builder Windows build/start, nonce/SRI, denied-route and zero-denied-egress checks pass; legacy mode remains separate | Select and qualify the actual target, current dependencies/security and deployed behavior. Custom Next remains retained with maintenance ownership/rebase and advisory acceptance unresolved. Historical receipts do not qualify this release. |
| Product onboarding and operations | Agent-operated forms, error recovery and exports | Observe low-assistance target-user journeys across a small real campaign set; resolve blocking confusion. Provide actionable customer errors, support, monitoring, ownership/retention notices and current product terms appropriate to the shipped data/features. Verify a simple stop/recovery procedure. |
| Paid launch only | Legacy Stripe patterns | Decide builder offer/limits and validate checkout, access provisioning, quota accounting and cancellation. Defer this for a clearly scoped non-paid beta if that is the chosen product decision. |

No fresh dependency/security audit, Linux target release receipt, hosted deployment or multi-user qualification was executed by the 20 November composition review. Current advisory state remains to be checked before release; do not report old advisory counts as current. Prior custom-framework artifacts recorded unassigned maintenance ownership and limited rollback. Re-evaluate those choices for the selected builder delivery boundary rather than inheriting an old GO recommendation.

## Delivery order

1. Completed locally: isolated production builder boundary and bounded emphasis finishing. Next implement builder invite/session/revocation and subject-scoped export-only recovery with prepared-brief download/import. Keep provider disabled; do not reassign the closed-runtime or finishing tasks.
2. Deliver an end-to-end hosted private customer slice: access -> input -> generate -> review -> export (and save/resume if promised), with exact ownership and budgets. Qualify it on the selected target.
3. If hosted publishing is in scope, add one stable platform URL, atomic accepted-revision publication, failure preservation and rollback/unpublish. Validate a real approved campaign with explicit publication authority.
4. Run a small low-assistance customer beta; fix actual blockers. Complete current release/security/runtime and operations checks. Add builder-specific billing if charging.
5. Open the narrow public MVP after the complete customer journey passes. Custom domains, extra formats and expanded automatic brand extraction follow evidence of repeat use.

This order is a planning recommendation, not permission for external writes, paid calls, account changes or deployment. Prepare concrete source/hosting/publication work for review under the existing authorization boundaries.
