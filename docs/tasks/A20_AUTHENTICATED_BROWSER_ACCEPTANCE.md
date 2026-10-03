# A20 authenticated browser acceptance

Task owner: one engineering session on `test/authenticated-browser-acceptance`, from reviewed current main after A17 `f588dc3` integration. This brief partitions I08/I09 in the [single roadmap](../ROADMAP.md); it is not another backlog.

## Problem and deliverable

The actual Next.js app uses Neon HTTP transactions. Existing disposable PostgreSQL tests replace SQL inside imported modules; the anonymous production-build smoke supplies no authenticated users. Therefore owner/member/outsider browser acceptance has never run against a safe disposable application database. See [A17 handoff](./A17_INTEGRATED_ACCEPTANCE_HANDOFF.md).

Deliver one repeatable isolated app fixture, actual credentials sign-in and provider-independent browser receipts. Reuse existing implementations and acceptance tests. Do not start another general audit or rerun A17's entire scope.

## Environment and file ownership

- Prefer loopback disposable PostgreSQL and a test-owned opt-in Neon HTTP adapter/preload. A supplied, identity-verified disposable Neon target is an alternative; it must be explicitly identified before use. Production `DATABASE_URL` is never a fixture.
- Validate the local bridge against `src/lib/db/neon.ts` and the installed driver's request/result contract: transactional batches, parameters, rollback, row types, statement/request deadlines. Fail closed for non-loopback endpoints, non-`a20_` disposable database names, missing fixture markers or remote fallback. Reuse safe PostgreSQL startup/cleanup helpers where practical.
- Apply the canonical migrations only to this task's disposable database. Seed verified credentials users with fixture-local passwords/hashes: owner, member and unrelated outsider; owner-paid Complete workspace, owner/member membership and a separate outsider business. Seed provider-independent draft data needed for persistence/UI checks without real Google tokens or customer data.
- Start the actual candidate app on loopback using an explicit dummy environment allowlist. Load no shared `.env` files or production secret stores. Block outbound provider calls; unexpected network access fails the test. Distinguish local fixture data from real provider/account approval.
- Own uniquely named test scripts/fixtures and `docs/tasks/A20_AUTHENTICATED_BROWSER_HANDOFF.md`. No production auth bypass, global driver default, provider setting, migration, cron or dependency change is presumed necessary. Coordinate a concrete shared-runtime/dependency proposal if the fixture cannot stay test-owned. Read AGENTS.md and installed Next.js docs for any affected Next code.
- Cleanup must stop only this task's server/database, verify resolved paths stay under its worktree fixture directory, then delete those fixtures. Preserve data and report the location if shutdown fails. Leave other sessions/services untouched.

## Exit criteria

1. Sign in through the real credentials UI for owner, member and outsider. Persisted Auth.js sessions drive navigation and requests; mocked `auth()` results or injected session-cookie substitutes do not satisfy this criterion.
2. Owner and member see the canonical owner-paid workspace across dashboard, Booster and disconnected Replies shells. Members need neither a personal plan nor a personal Google connection. Owner-only billing/team/connection/settings controls follow current implemented authorization; outsider and removed-member direct URLs/API attempts cannot read or mutate the shared business.
3. Exercise provider-independent intake and draft/settings save-refresh behavior in the actual app. Confirm persisted values, dirty-edit protection and a controlled conflict outcome. Seed any necessary review/connection metadata locally; do not call Google, OpenAI, Stripe or Resend to manufacture acceptance.
4. Record mobile/keyboard navigation, error/empty states and signed-in nonce/hydration/CSP console behavior. Keep Trusted Types report-only. A local receipt does not establish deployed ingress headers, provider redirects or production report collection.
5. Record exact candidate commit, runtime, dummy/isolation proof, migration set, actor roles, observed requests/results, cleanup and pass/fail for each criterion. Keep passwords, hashes, tokens, cookies and customer payloads out of Git/logs/screenshots. Report narrow reproducible defects and their required fixes; incomplete criteria must remain open with their precise prerequisite.
6. Run checks appropriate to delivered code; required exact-candidate Linux CI remains the integration gate. Do not repeat anonymous or provider acceptance just to replace existing valid receipts.

## Separate gates

This task can start without Resend endpoint configuration or Google approval. Stripe stays skipped under the current instruction. Resend provider ingress/sends, Google OAuth/sync/posting, notification delivery, support operator access and the scheduled privacy observation remain operator/provider lanes. Keep production deletion and manual delivery reconciliation disabled. Completing this task closes the signed-in fixture/journey gap only; it does not authorize a paid launch or settle pending A18 policies.
