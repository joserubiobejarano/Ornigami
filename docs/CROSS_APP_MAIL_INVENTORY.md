# Cross-app mail authority inventory

This inventory was prepared from the isolated branch `codex/cross-app-mail-integration`, starting at `b4c2c43172e0c9246d579ade2608c607eac34b6b`. It covers the runtime source plus preserved migration and operator scripts. Inventory changes are checked by `tests/a24-mail-inventory.test.mts`.

Every covered runtime source now reaches `src/lib/qr-mail.ts`. It requires `QR_MAIL_ENABLED=true`, a complete source-specific enrollment, a fresh preflight and one-shot reservation, two strict verification calls around a rotated handoff fence, and a terminal settlement. Provider response errors and transport failures settle `unknown`, retain quota, and cannot retry the same work key. The provider JSON digest is computed from the exact bytes sent. Recipient, body, tokens, and secrets are excluded from authority request metadata. This branch is not installed or enabled; source changes do not establish account-wide runtime enforcement.

## Sending paths

| Source | Purpose | Code path | Stable event/work identity |
| --- | --- | --- | --- |
| Booster enrollment | `booster_followup` | `src/modules/review-booster/services/followup-runner.service.ts` → `src/modules/review-booster/services/resend.provider.ts` → `src/lib/qr-mail.ts` | Existing delivery UUID and provider idempotency key; neither is regenerated. |
| Booster enrollment | `public_demo_sample` | `src/app/api-public-demo-review-booster/route.ts` → `src/modules/review-booster/services/resend.provider.ts` | Persisted demo challenge token hash. |
| Direct enrollment | `auth_verification`, `password_reset` | `src/lib/auth-verification.ts` → `src/lib/qr-mail.ts` | Hash of the already-persisted single-use token. |
| Direct enrollment | `team_invitation` | `src/app/api/team/route.ts` → `src/lib/team.ts` → `src/lib/qr-mail.ts` | Existing invitation UUID and business UUID (the latter remains local and is hashed in transport metadata). |
| Direct enrollment | `review_alert` | `src/lib/review-alerts.ts` → `src/lib/qr-mail.ts` | Persisted Google review IDs; the persistence projection now carries those IDs into the alert event. |
| Direct enrollment | `public_demo_confirmation` | `src/app/api-public-demo-review-booster/route.ts` → `src/lib/qr-mail.ts` | Persisted demo challenge token hash. |

## Preserved paths that cannot send

`migration-sources/follow-up/src/server/services/email/resend-provider.ts` now throws before provider I/O; its legacy runner cannot reach Resend. `migration-sources/contactor/src/server/services/notifications/email/resend-email.provider.ts` also throws and reports no Resend configuration. `scripts/a17-live-provider-probes.mjs` invokes the Booster provider without authority context, which fails before provider I/O. `scripts/a10-live-resend-guards.mjs` rejects direct email POSTs; its remaining use is network observation and request validation.

## Excluded non-send operations

`src/modules/review-booster/services/resend-reconciliation.service.ts` issues bounded `GET /emails/{id}` lookups. `scripts/a10-live-provider-control.mjs` performs `GET /emails/{id}`, webhook reads, or webhook deletion. `scripts/a10-resend-endpoint.mjs` creates or inspects a Resend webhook endpoint using `/webhooks`; it does not send email. Webhook receive routes and test fixtures do not initiate sends.

## Source-specific configuration references

`QR_MAIL_AUTHORITY_URL` and `QR_MAIL_ENABLED` are shared. Booster paths require the corresponding `QR_MAIL_BOOSTER_*` variables; direct paths require their separate `QR_MAIL_DIRECT_*` enrollment. Those groups contain authority-token, source ID, source revision, reviewed manifest reference, key-binding reference, numeric policy ID, provider account binding, and numeric central business-scope references. There is no shared token fallback. Real values are supplied by deployment configuration and are not recorded here.

`scripts/qr-mail-inventory-report.mjs` is the report producer for `/v1/mail/report`. It hashes sorted manifest paths and their exact file bytes into each `manifest_ref`, checks the maintained source scan before asserting completeness, and posts one bounded inventory report under each source's own bearer enrollment. `path_count` is pinned to the enrolled send-purpose count (two for Booster, five for direct); reports expire after 30 seconds. The Booster scan uses a bounded, deduplicated projection of pending visits and held delivery rows and selects no recipient data. The command requires a database scan even in dry-run mode, with an eight-second database request timeout. It was not run during this implementation.

The provider remains default-closed until both source enrollments have reviewed manifest pins and fresh complete reports. Recovery follows the existing source state: Booster delivery rows keep their original IDs and keys; uncertain provider outcomes stay unknown and are never re-keyed. No account, token, provider message ID, recipient, or payload was read from local secrets or sent to a provider during implementation.

Focused checks (46 passed): `node --experimental-strip-types --test tests/a24-mail-inventory-report.test.mts tests/a24-qr-mail.test.mts tests/a24-mail-inventory.test.mts tests/a06-booster-provider.test.mts tests/a10-live-resend-guards.test.mts tests/a17-live-provider-probes.test.mts tests/a11-review-alert.test.mts tests/a05-team-route-review.test.mts tests/auth-token-postgres.test.mts`; TypeScript: `npx tsc --noEmit`.

The five report tests and TypeScript check were rerun after the final mounted-URL and CLI database-deadline changes; all passed. The token SQL test uses disposable local PostgreSQL and a fake sender. Installation must renew reports before expiry even while senders are idle. Source reports authenticate source claims; independently verified installed artifacts and actual account/key bindings remain required.
