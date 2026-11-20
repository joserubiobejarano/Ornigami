# Builder invite access and export-only recovery handoff

20 November 2026. Local source only; no deployment, customer message, real
provider call or publication.

## Exact source

- Branch: `codex/ornigami-builder-invite-recovery-20261120`
- Base: `dbf006b10af66942b0d1c3b65fd77f468ec759dc`
- Implementation commit: `cc82fe072d5b6430d341f230b415b9e51b969155`
- Worktree: `C:/Users/joser/.local/ornigami-builder-invite-recovery-20261120`

Implementation is confined to `builder-runtime/`, its operator script, the
builder runtime smoke/qualification scripts, and narrow shared UI props for the
subject-scoped builder workspace. The legacy foundation `/builder` and its API
still use the default-closed shared builder access. The development Campaign Lab
is unchanged and remains development-only.

## Access contract

- Default is **closed**. With no runtime configuration, `/builder` is `404`, the
  session endpoint is unauthenticated, redemption/logout are absent and the
  builder runtime smoke is green.
- Invite mode is explicit:
  - `BUILDER_RUNTIME_MODE=invite`
  - `BUILDER_RUNTIME_STORE_DIR=<builder-only directory>`
  - `BUILDER_RUNTIME_SESSION_TTL_SECONDS=<1..604800>` (default 8 hours)
- Startup fails when invite mode has no writable store or the shared builder
  provider/legacy-reuse switches are invalid.
- Operator issuance/revocation is a local CLI:
  ```powershell
  node --experimental-strip-types scripts/builder-invite-operator.mjs issue `
    --store .local/builder-runtime-identity --label "Synthetic identity A" `
    --ttl-seconds 3600 --json
  node --experimental-strip-types scripts/builder-invite-operator.mjs issue `
    --store .local/builder-runtime-identity --label "Synthetic identity A" `
    --subject sub_existing --json
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-invite --store ... --id inv_...
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-session --store ... --id ses_...
  node --experimental-strip-types scripts/builder-invite-operator.mjs revoke-subject --store ... --subject sub_...
  node --experimental-strip-types scripts/builder-invite-operator.mjs list --store ... --json
  ```
- Invitation and session tokens are random 256-bit values. Only their SHA-256
  hashes are stored. The raw token is returned once to the operator.
- Redemption is serialized by an exclusive store lock and an atomic
  temporary-file/replace write. One invitation creates at most one session.
- Sessions are server-side, expiring, revocable records. The browser receives an
  HttpOnly, SameSite=Lax cookie; `Secure` is automatic when the configured URL is
  not local HTTP.
- Redeem, logout and generation are same-origin checked. The generation request
  must also carry the current subject header. A stale tab presenting an old
  subject cannot generate under a new session (`409`).
- Generation re-reads the server session after deterministic generation. Logout,
  expiry or subject revocation during a request discards the result instead of
  returning a preview.
- The client watches the session endpoint on focus/visibility and every 15
  seconds. Logout broadcasts to other builder tabs. Session end or subject
  mismatch clears that subject's tab recovery key and reloads the workspace.

## Durable identity store and quota contract

`identity-store.json` (version 1) under `BUILDER_RUNTIME_STORE_DIR` contains:

```ts
type BuilderIdentityStore = {
  version: 1;
  subjects: {
    id: "sub_*"; label: string; createdAt: string; revokedAt?: string;
  }[];
  invites: {
    id: "inv_*"; subjectId: string; label: string; tokenHash: string;
    createdAt: string; expiresAt: string; usedAt?: string;
    revokedAt?: string; redeemedSessionId?: string;
  }[];
  sessions: {
    id: "ses_*"; subjectId: string; tokenHash: string;
    createdAt: string; expiresAt: string; revokedAt?: string;
  }[];
  usage: BuilderUsageRecord[];
};
```

The stable quota/ownership key is `subjects[].id`. A future generation budget
ledger must use the same builder-only store (or a compatible table) and record:

```ts
{ id, subjectId, sessionId, generationId, recordedAt,
  state: "reserved" | "succeeded" | "failed" | "unknown",
  costMicros: number | null }
```

Reserve before the provider call, commit or release after it, and preserve
`unknown` on transport/outcome uncertainty. No quota enforcement or real
provider spend exists in this slice; the `usage` array is empty.

## Recovery contract

- Builder intake now exposes a visible **Download prepared brief** action.
- The downloaded JSON preserves supported text, reviewed emphasis, direction,
  composition, accent/brand snapshot, facts, destination, alt text and rights.
- It never includes the packshot, operator confirmations, local approval or
  durable project identity.
- Importing the brief preserves those text fields and clears the packshot,
  confirmations and approval. The operator must reselect the packshot, confirm
  the exact inputs again, generate a fresh preview, approve it and export.
- Tab recovery uses `ornigami.builder.offer-intake.brief.v1:<subjectId>`.
  Logout clears all builder-intake keys in the tab. Expiry/account-change cleanup
  removes the current subject key before reloading.

## Local verification evidence

Two synthetic identities ran through the actual production builder runtime with
the provider disabled and deterministic fallback.

- **66 runtime checks passed**, including:
  - invite issuance, redemption, subject labels and session endpoint;
  - prepared-brief download/import field preservation;
  - packshot/confirmations/approval reset after import;
  - restart persistence with the same cookie and store;
  - logout clearing the tab workspace;
  - eight concurrent redemptions producing exactly one success;
  - cross-origin redeem/logout/generation rejected with `403`;
  - A→B account switch during a delayed generation with no A workspace left;
  - stale subject header rejected with `409`;
  - direct late request rejected after logout/revocation with no preview;
  - subject revocation and expired-session denial;
  - three exact ZIP exports with CRC, inventory, hashes, receipt/HTML metadata,
    emphasis ink and wrapping agreement.
- Export revisions: `da7855f2b45d0520` (identity A first and recovered; same
  exact inputs), `d2d6ba735ab4f4b4` (identity B). The A export has 5 files
  (editorial/system font path); B has 14 (Clear/Inter bundle).
- A recovered export used the same exact revision after reselecting the
  packshot, re-confirming and freshly approving; it was not a reused approval.
- Evidence: `.local/builder-access-evidence/results.json`, `screenshots/`,
  `downloads/`, `extracted/`, `store/`.
- Operator store test (`tests/builder-identity-store.test.mts`): 5/5 pass,
  including atomic concurrent redemption, expiry, revocation, CLI and
  fail-closed storage/config checks.
- Builder suites: 21/21 pass (store + runtime isolation + shared boundary).
- Runtime account-switch delay used
  `BUILDER_RUNTIME_ALLOW_TEST_HOOKS=1` and
  `BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS`; startup rejects the delay without
  the explicit test-hook flag, and normal production smoke does not use it.
- Campaign Lab suites: 357/357 pass.
- Whole-project TypeScript: pass.
- ESLint: 0 errors (27 pre-existing warnings outside this slice).
- `node scripts/builder-runtime-qualify.mjs build`: pass, **0 denied egress**.
- `node scripts/builder-runtime-qualify.mjs smoke`: pass, **0 denied egress**.
- Legacy `node scripts/offline-qualify.mjs build`: pass (four blocked Sentry
  HTTPS attempts, as before); legacy `npm run test:build`: pass. The legacy
  application and development lab boundaries are unchanged.

## Remaining release gates

- Generation quotas, rate limits, concurrency reservations, spend accounting and
  cancellation are **not implemented**. The stable `subjectId`/`sessionId` store
  contract above is ready for that next slice.
- The identity store is a single-host local filesystem with process locking. It
  is not qualified on Linux, shared filesystems, multiple server instances,
  backup/restore, retention or corruption recovery.
- Invite delivery is operator-manual. There is no email, account recovery,
  password/MFA, invite resend or self-serve provisioning.
- Session rotation, absolute/idle expiry policy, device management and broader
  CSRF/rate-limit hardening remain future work.
- Real provider use, budgets and the fresh bounded provider canary are excluded;
  deterministic generation only.
- Hosting/deployment, Linux/target runtime, current dependency/security audit,
  custom Next.js maintenance ownership, privacy/support operations and
  independent customer usability remain unqualified.
- No paid calls, external collection, deployment, DNS/account changes,
  production migrations, customer messages or publication were performed.
