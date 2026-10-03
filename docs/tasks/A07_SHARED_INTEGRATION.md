# A07 shared integration requests

This document submits changes outside A07 ownership to A00 and the relevant package owners. These shared source/configuration changes are not applied by this worktree. A00 owns roadmap and integration/deployment configuration updates.

## Tracked review links: A00/A13

`src/app/r/[token]/route.ts` verifies a signature and escapes HTML, but it does not validate the signed destination. A07 validates new destinations in settings/provider preparation; previously issued tokens still need the same check at rendering. Import `isSafeGoogleReviewUrl` from `@/modules/review-booster/services/settings-link-validation`, reject an invalid `payload.reviewUrl` with the existing inactive-link 404 before recording a click or rendering an anchor, and add route tests for a correctly signed unsafe URL and a valid Google review destination. Signing is not destination validation.

Suggested route guard (after `verifyReviewLinkToken` and before click accounting):

```ts
const payload = verifyReviewLinkToken(token);
if (!payload || !isSafeGoogleReviewUrl(payload.reviewUrl)) {
  return new NextResponse("This link isn't active anymore.", { status: 404 });
}
```

Keep existing tokens and click records intact. The guard affects only opening a token whose stored destination fails the exact allowlist; it does not purge/rewrite that token or alter an A06 frozen provider payload.

Review legacy invalid settings and tokens without deleting their stored values. Do not rewrite already frozen provider payloads or release unknown send reservations. Controlled reconciliation owns uncertain delivery outcomes.

## Privacy and account lifecycle: A11/A00

Migration 023 adds `booster_booking_credentials`, containing encrypted signing secrets and business-scoped credential metadata. Its business FK cascades on business deletion. Workspace exports should include safe credential metadata (`id`, `label`, `created_at`, `last_used_at`, `revoked_at`) and exclude `encrypted_secret` and decrypted credentials. Existing integration-event exports already cover the event table used by booking intake. Do not export signing secrets in personal or workspace snapshots.

A11 should include credential revocation/drain in its account freeze contract and verify admission, credential creation and deletion under concurrent freeze/revocation. Credential SQL uses business then owner admission locks and detects the lifecycle marker when present. Migration 026's deletion-begin flow locks the user first; coordinate ordering with admission and business deletion before activation. Marker-denial tests do not establish complete concurrent deletion safety.

CSV/manual admission and settings saves recheck canonical access and entitlement where applicable, but do not implement A11's complete atomic freeze contract. Add those paths to the shared freeze/drain review alongside credential management, auth/business context and A06 sends. Keep account deletion disabled until that work is complete; this package does not establish full lifecycle activation.

Agree retention of revoked credentials and event dedupe records before cleanup. Deleting dedupe history can allow old completed events to create another visit; retain suppression and unresolved delivery evidence. No new purge period is chosen here.

## Shared documentation and configuration: A00/A01

- Add the booking webhook and owner credential-management routes to `docs/API_REFERENCE.md`; reconcile settings owner/member roles, CSV counts and date semantics with the module/task documentation.
- Add migration 023 to `docs/DATABASE.md`/`neon/README.md` and the integration migration checklist. Apply the migration before consumers. Existing rows/columns and the CSV unique index remain intact.
- Existing `TOKEN_ENCRYPTION_KEY`/Auth.js secret configuration encrypts scoped credential secrets. Preserve the encryption key during credential use and coordinate any rotation; no global booking secret or new runtime dependency is required. Review deployment settings in the integration session rather than copying private configuration into this worktree.
- Integrate the optional same-email rebooking CTA and precise supported URL forms into A18's source-backed product documentation. The user authorized this session to choose the approach; it creates no additional campaign or sender domain feature.

## Legacy cutover and release acceptance: A15/A17

Inventory actual consumers and URLs before replacing legacy callbacks. Provision one credential per integration/business, configure raw-body HMAC signing and timestamp refresh on retries, and test replay/cross-business/revocation behavior on isolated targets. Generic source labels are not proof of native provider connectors.

The adapter queues visits into A06's existing sender. Coordinate a single scheduler during legacy cutover. Intake itself sends no message, but eligible queued visits can be sent by scheduled or manual runs. Verify provider payload replay, current entitlement, suppression, seven-day eligibility and quota after integration. No deployment, callback switch, live message or production migration is authorized by this handoff.

A13 should finish canonical business/role gating in the existing parent dashboard layouts and legacy plan consumers. A07 routes use canonical context, but route tests alone do not establish signed-in layout acceptance for every owner/member and plan combination. Verify Booster-only owners can manage their first selected Google location from the Booster page and members cannot invoke owner controls; do not require a separate Review Replies entitlement for the shared Google workflow.
