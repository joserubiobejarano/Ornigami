# A00 wave 9: A20 integration review

Reviewed 2026-10-04 against main `f0bb5e9e75a88bffcdbcce682e0b416566d3f02d`. A20 source `2d13be193a127f5185987eddcd8fba545c61ec96` is preserved through merge `bcf325d962ddb2ffa70aef4c62323484786b3904`. The historical [A20 handoff](./A20_AUTHENTICATED_BROWSER_HANDOFF.md) and JSON remain evidence of the author's runtime; the results below supersede its specific blocked mutation rows, without reattributing that evidence to the integration build.

## Review and correction

Reviewed fixture target/environment isolation, Neon bridge contracts, credentials sessions, exact authorization error classification, migration application and guarded cleanup. The harness is opt-in; it is not imported by the production application. No dependency, schema, production environment or provider configuration change is required.

Temporary sanitized instrumentation of the actual mutation guard established browser Origin `http://127.0.0.1:55714` versus handler URL origin `http://localhost:55714`. Next's URL normalization, rather than the earlier internal initURL diagnostic, explains the rejection. Instrumentation was removed. Commit `07186b7db85795443a0dc6a5654e9540e419b389` restores only explicitly configured `127.0.0.1`/`[::1]` origins when the handler host is localhost and protocol/port match. It does not trust forwarding headers. Existing cross-site and missing-Origin rules remain. Three regressions exercise actual installed NextRequest normalization and adversarial alias/port/protocol/header cases.

The HTTP supplement now recognizes the application's exact business/owner/agent/scoped-not-found responses and adds a fixture-only `writes` probe. Cross-origin rejection is never counted as an authorization pass. `.a20-fixture` is ignored by Git and ESLint.

## Fresh isolated runtime evidence

Windows x64; Node 22.23.3; Next 16.3.8; PostgreSQL 17.9. Final app build source is `07186b7`, tree `1c31c096f6cc6dcf64e8accfd6b18fe9265c9d9c`, build ID `Lh8Y2RyzQST0sIeXhalGz`, build hash `df8af2d0be5a5dd06fe820c7b3638825a628bd0b1d4b24b57915f03ac6a25698`. Later supplement/docs edits do not change application source. App: loopback port 62086; identity-verified task PostgreSQL: port 55667, database `a20_browser_fixture`. The fixture applies 35 canonical migrations and verifies 56 tables. No production database was used.

| Evidence label | Result and boundary |
| --- | --- |
| isolated tests | Clean install passed with zero audit findings. A20 tests passed 14/14; origin plus existing A05/A08/A09 regressions passed 29/29, zero skips. Real PostgreSQL Neon bridge contract passed batch/types/OIDs/rollback/timeouts/aborts and outbound guards. Lint passed with four existing navigation warnings; type generation and TypeScript passed. Final supplement passed syntax, scoped lint and diff checks. Exact final Linux quality/security CI is a separate required merge gate. |
| authenticated browser | Passed the specifically tested local core workflows below using real persisted Auth.js sessions. Author's disconnected/mobile/keyboard/outsider UI receipts remain separately dated. This is not all release checklist acceptance. |
| provider test mode | Not run in this review. No sends, AI generation, Google posting/OAuth, Stripe changes or provider configuration actions. |
| production smoke | Final integration deployment/public boundary verification is recorded separately in private CLI receipts after the authorized main push; local browser evidence alone does not establish production behavior. |
| external approval | Unchanged: Google approval/client/quota; Resend endpoint/signing secret; support credential/Sentry recipients; privacy scheduled checkpoint; policy/deletion gates remain open. Stripe remains skipped. |

- Owner UI: blank visit reaches normal validation; valid visit reports saved and persists; Booster settings persist through refresh; draft save persists through refresh. A subsequent server edit produces a real 409 for the stale browser edit, preserves unsaved text, and requires explicit use of the saved version.
- Owner HTTP supplement: settings 200, intake 201, draft save 200, stale save 409; database counts/version/hash confirm persistence. Foreign Origin and same Origin with cross-site fetch metadata both return 403 at the origin guard and make no writes.
- Outsider real HTTP session: 12 scoped GET/mutation probes denied by business/Google/agent authorization or scoped team 404; fixture unchanged. These root receipts complement the author's outsider UI; root did not repeat that UI login.
- Member real HTTP session: five owner-control mutations and billing denied by role/scope; fixture unchanged. Owner removes member through the actual UI. The same already-issued member session then fails 11 read/mutation probes by workspace/agent scope; fixture unchanged after removal.
- After recording that result, membership was restored only inside the identity-verified disposable database for an independent member UI journey. Real member login shows the shared paid workspace without Billing; member draft save persists through reload. Final snapshot therefore has one restored member, two owner visits, zero outsider visits and draft version four. This does not negate the earlier removal-session receipt.
- Signed-in dashboard/inbox HTTP responses are 200, script nonces match and rotate, Trusted Types remains report-only. Actual owner/member browser interactions hydrate; checked warning/error console counts are zero. No real provider controls were activated.

At `2026-10-04T01:39:18.9365138Z`, outbound assertion passed with no attempted escape, dummy Google state was disconnected, Windows app identity/port and PostgreSQL host/database/port/data-directory were verified before shutdown. Fixture directory and dummy credentials were removed; ports 55667, 62086 and diagnostic 55714 closed. Browser tab was closed. Sanitized logs, aggregate snapshots, build/cleanup receipts and a saved-visit screenshot are private under `Ornigami-Backups/2026-10-04-wave9-review`; credentials/cookies/customer text are not committed.

## Limits and next work

The authenticated fixture lifecycle is verified on Windows only. Standard Linux CI does not replay it. Next can replace Linux process argv/title, so the existing Linux cleanup ownership guard may refuse to stop a legitimate fixture; do not bypass that guard. A Linux fixture replay would require a specific identity-guard investigation if needed, not another broad acceptance session. Local font mocks also differ from production.

Close A20's bounded core acceptance work. Next actions can proceed independently: authorized Resend endpoint/secret plus controlled application delivery/ingress; dedicated read-only support credential and Sentry notification permissions/recipient delivery; read-only observation after the October 4 03:00 UTC / 05:00 Madrid privacy schedule. Do not invoke cleanup or health to fabricate that checkpoint. Google proceeds only with a qualifying client and external approval. Stripe stays skipped until scope changes. Deletion stays disabled pending the existing A11/A18 policy and provider/operator gates. No A01/A10/A12/A16/A17/A19 implementation restart is assigned merely because these inputs are missing.
