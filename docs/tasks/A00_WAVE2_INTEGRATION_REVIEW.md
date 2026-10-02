# A00 wave 2 integration review

Reviewed A03 e3d6ac4, A05 2c65ba3 and A08 f01d40d and their handoffs on main 0f8433f. Luna performed independent reviews; A00 inspected source/migrations, verified findings, integrated corrections, and requires an independent review of those corrections. The owner explicitly approved one 14-day trial per business and billing owner on 2026-10-03. All other new A18 policies retain proposal status.

## Integration corrections

- Workspace bootstrap uses a persisted user-row mutex and rechecks access before creating a business. This serializes with invitation acceptance without reversing existing business/user lock order. Real PostgreSQL tests exercise overlapping bootstrap and acceptance. Billing snapshot reconciliation locks the business before changing entitlement, matching team admission.
- Billing page uses canonical session UUID/business context, presents member read-only access, and shows a trial CTA only for eligible owners. Shared plan validation rejects inherited object keys.
- Google selection/generation DDL becomes replay-safe migration 031; 032 owns bootstrap. No number reserved for future work was reused. The canonical Google migration is exercised twice on disposable PostgreSQL. Minimum owner location-selection controls make A08 usable; member controls remain restricted. Provider requests pin selected generations; disconnect clears same-browser pending consent.
- A05 SQL fixture uses stdin for large migration statements, avoiding Windows command-length failure when all branches combine. No package/dependency change.

## Validation and rollout

Integration gates: full Node 22 test discovery, disposable PostgreSQL migrations/concurrency, lint/typegen/TypeScript, fixture production build/CSP smoke, exact-commit Ubuntu quality/security CI. Migration 019/021/031/032 must apply in one bounded transaction before code rollout using the database from current Vercel production configuration. Private preflight/receipts stay outside Git; no secrets or provider messages are committed/sent.

Preflight: production target matches the previously verified identity; 8 users, 8 businesses, 8 members, 2 subscriptions, 5 customer mappings, 0 Google connections/locations/reviews/invitations, 0 missing profiles and 0 cross-owner customer conflicts. No Google legacy backfill or inferred selection is needed.

Local Node 22.23.3 validation passes 170/170 discovered tests, followed by 6/6 on the finalized UI suite (the last locked-selection regression was added after full discovery started). All three disposable PostgreSQL suites pass, including canonical Google migration replay, bootstrap/acceptance races and the billing business mutex. Lint has zero errors and four existing navigation warnings; typegen/TypeScript pass. Clean install and production audit report zero vulnerabilities. Fixture production webpack build, two generated CSP hashes, protected dashboard/OpenGraph and anonymous auth/Google/billing/CSP smoke pass. Exact Linux CI remains an enforced rollout gate; job/deployment receipts and production SQL hashes/verification are retained privately by A00 outside Git and reported in the integration chat. Main advances only after exact-commit quality/security checks and successful schema verification.

## Next contracts and limitations

A06, A09 and A11 can run in parallel from merged main. A06 consumes business billing fields and must obtain quota-policy approval; A09 owns draft preservation, low-rating approval, shared generation/usage and cron policy; A11 must freeze/reconcile provider billing state before deletion, include every new billing/team/Google lifecycle table in export/retention, and handle Google revocation/pending consent. A03 cancellation helper alone does not discover Stripe orphans/unresolved sessions.

A08 different-location recovery/switch is deliberately unavailable pending approved policy; same-location rediscovery recovers reconnects. Cron active/trialing versus interactive grace remains explicitly assigned to A09/A18. A13 owns full workspace selection/performance/copy. A16/A17 require actual Google approval and controlled signed-in/provider acceptance. Local mocks/SQL/CI do not establish real Stripe, email or Google acceptance; broad paid launch remains held under the roadmap.
