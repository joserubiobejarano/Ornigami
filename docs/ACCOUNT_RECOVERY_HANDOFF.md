# A04 account recovery handoff

A04/E11 completes bounded signup, verification resend, password recovery, and authentication return paths. Implementation was delegated to three Luna agents and reviewed in the isolated `fix/account-recovery` worktree, based on `ff4d9b28e4a42a384c5954781d0046890c56cba1`. Only task-owned auth code, migration 020, focused tests, and this document changed. ROADMAP.md, package manifests/lockfile, shared deployment configuration, proxy, and the shared layout frame were not edited. Nothing was merged, pushed, or deployed.

## Resulting behavior

Passwords require at least 8 characters and no more than 72 UTF-8 bytes, consistently across signup, credentials login, and reset. Auth JSON bodies are streamed and capped at 8 KiB. Email inputs are validated, trimmed, and lowercased. Signup handles simultaneous duplicate inserts without exposing account existence and creates the user/profile together in one SQL statement.

Persistent limits reuse `api_rate_limits`: signup, resend, and recovery each allow 20 requests per trusted IP and 5 per normalized-email digest per 15-minute window. Verification allows 30 per IP and 5 per token digest; reset allows 20 per IP and 5 per token digest. The existing trusted-IP helper is reused. Application auth logs use fixed event/error values, and API JSON does not expose generated recovery tokens.

Verification/reset tokens use 32 random bytes, base64url encoding, SHA-256 storage, rotation on resend, and 24-hour/one-hour expiry respectively. Successful verification consumes its token and marks the user verified atomically. Successful reset consumes its token, updates the bcrypt hash, and increments `auth_version` atomically. Expired, rotated, or reused tokens cannot mutate credentials. OAuth-only accounts receive the generic forgot-password response without a reset email; reset does not bypass the separate email-verification requirement.

Both email links carry a sanitized local callback, and both token tables store it. Successful verification/reset use the consumed database token's destination. Retained expired rows preserve their stored destination; after cleanup, links retain their sanitized query fallback. Unknown links without a usable callback fall back to `/dashboard`. External, protocol-relative, backslash/control-containing, oversized, and unsafe normalized/encoded paths are rejected. Legacy `?invite=...` becomes `/team/invite/[token]`. Auth form links, credentials login, and Google sign-in pass the same safe destination.

Email-request routes return generic responses and defer account lookup, token creation, and provider delivery with Next.js `after()`. Registration performs bcrypt before duplicate lookup and defers delivery. These routes have a 30-second budget; the Resend request has a 10-second timeout. Missing/invalid mail configuration fails uniformly before account lookup. Provider failures after a generic response are logged without address/token details and can be retried through resend/recovery. Small registration timing differences from database lookup/insert remain.

Auth JSON and verification redirects set `Cache-Control: no-store, max-age=0` and `Referrer-Policy: no-referrer`. Auth pages are noindex/nofollow with no-referrer metadata. Reset clears password fields and removes the token from the URL after success while retaining the sanitized callback, then links to login without automatically signing in.

## API and shared model contracts

| Route | Input | Result |
| --- | --- | --- |
| POST /api/auth/register | `{ email, password, fullName?, callbackUrl? }` | Generic 200 `{ ok: true, message }` for new/existing/conflicting inserts; only a newly created account schedules verification. |
| POST /api/auth/resend-verification | `{ email, callbackUrl? }` | Same generic 200 body for unknown/verified/unverified addresses; only an existing unverified account gets mail. |
| POST /api/auth/forgot-password | `{ email, callbackUrl? }` | Same generic 200 body for unknown/OAuth-only/password accounts; only a password-enabled account gets mail. |
| POST /api/auth/reset-password | `{ token, password }` | 200 `{ ok: true, message, callbackUrl }`; invalid/expired/reused token is 400, with a sanitized stored callback when available. |
| GET /api/auth/verify-email | `token`, optional safe `callbackUrl` fallback | Redirect to `/login?verified=1\|0&callbackUrl=...`; tokens must be exactly 43 base64url characters. |

Public JSON routes return 400 for invalid/bounded input, 429 for rate limiting, and 500 for internal request errors. Email-request/signup routes return a generic 503 for unavailable mail configuration. All successful email-request bodies remain generic when deferred lookup/provider work fails.

Migration `neon/migrations/020_account_recovery.sql` adds `users.auth_version INT NOT NULL DEFAULT 0`, verification-token `callback_url`, and `password_reset_tokens` with a cascading user foreign key, unique hash, stored callback, expiry, and expiry index. It is additive and idempotent.

Auth.js JWTs and sessions carry `authVersion`. JWT callbacks compare that snapshot to the current live user row and return null for stale, deleted, legacy, or unreadable accounts. Refresh does not recreate deleted OAuth users. Actual Auth.js Core tests confirm null session plus session-cookie removal. Initial successful Google sign-in may create/upsert a user normally. Credential sign-in carries the version read alongside the compared hash, so a concurrent reset cannot mint a session with the new version from an old password.

Helper signatures changed: `createEmailVerification(email, userId, callbackUrl)` returns void; `verifyEmailToken(token)` returns `{ ok, callbackUrl: string | null }`; `createUserWithPassword(...)` may return null on a duplicate insert. These call sites are updated in this branch.

## Required integration work and dependencies

1. Apply migration 020 before activating code that queries `auth_version` or reset tokens. Tests used the actual baseline migrations 001–017 followed by 020, then reapplied 020. Reserved migrations 018/019 belong to other packages; do not renumber this migration. No shared/live database was touched.
2. Configure the existing `RESEND_API_KEY`, `EMAIL_FROM`, and HTTPS `NEXT_PUBLIC_APP_URL` and verify sender-domain/provider acceptance in an authorized environment. Merely having values does not prove deliverability. No new package or application environment variable is required.
3. A11 can revoke all sessions by atomically incrementing `users.auth_version`; deletion already fails the live-row check. Coordinate future security/password changes with this contract. A05 should preserve `callbackUrl` through its invitation workflow; invitation acceptance/seat handling remains A05-owned.
4. A00/A13 should add the three new recovery paths to `isInAppRoute` in `src/components/layout-frame.tsx`, alongside login/signup:
   ```tsx
   pathname === "/forgot-password" ||
   pathname === "/resend-verification" ||
   pathname === "/reset-password"
   ```
   Local browser review found marketing header/footer still render on these routes. The auth forms' own links retain callbacks; the shared header's login/signup links can lose them. This exact shared-layout change is submitted for integration and is not applied in A04.
5. A12 should decide/add expiry retention cleanup for `password_reset_tokens`. Expiry is enforced during consumption and rows are bounded to one per user; this branch adds no shared cron changes. Existing email-verification cleanup is compatible with the email-link callback fallback.
6. A17/A01 should integrate focused-test discovery into their owned CI/package scripts. `npm test` still runs only the existing first-phase suite. Run the command below explicitly until integration wires it in.

## Verification evidence

Validation used Windows, Node v24.11.1, Next.js 16.3.0, and PostgreSQL 17 in this worktree, without shared .env files or live service credentials.

| Check | Outcome |
| --- | --- |
| Focused auth suites, command below | 19/19 passed, zero skips |
| `npm test` | 16/16 passed |
| `npm run test:security` | 7/7 passed |
| `npm run lint` | Passed |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passed; final production build also runs TypeScript |
| `npm run build` | Passed with dummy process-local settings, including default Turbopack production build and generation of two static CSP hashes |
| `git diff --check` | Passed |

Combined tests: 42 passed. The focused command is:

```powershell
node --experimental-strip-types --test tests/auth-account-recovery.test.mts tests/auth-core-session.test.mts tests/auth-return-path.test.mts tests/auth-session-callbacks.test.mts tests/auth-token-postgres.test.mts
```

Tests load production helpers/routes and real Zod/NextResponse/bcrypt/Auth.js Core while replacing only external boundaries. They cover bounded streaming input, UTF-8 bcrypt limits, generic account responses, deferred delivery/failures, trusted IPs and hashed rate keys, callback attacks, expired/cleaned-link fallback, authoritative stored destinations, credential/reset races, and revoked/deleted/legacy JWTs.

The PostgreSQL runner creates a disposable loopback cluster on port 55404 inside a unique ignored `.next/a04-tests-pg-*` directory. It applies migrations 001–017 and 020 and runs captured production SQL, including genuinely concurrent user/profile creation, rate increments, and verification/reset consumption. It verifies one consumption winner and one password/version update, rotation, expiry, and preserved expired callbacks. It stops the cluster and removes its verified test directory. Install PostgreSQL locally before running; `A04_PG_BIN` or `PG_BIN` can select its binaries (Windows defaults to PostgreSQL 17; Unix uses PATH). Run as a non-root user on Unix. Avoid concurrent builds because both use `.next`.

In-app browser smoke testing used the loopback production preview with dummy credentials: login verified/expired notices; legacy invitation links through forgot/signup/resend; missing-reset-token recovery; external callback fallback; and noindex/no-referrer metadata. No real account/password was created or changed through the browser, no OAuth provider was contacted, and no email was sent. The preview and disposable database were stopped.

## Remaining decisions and release limits

- Supported Node 22/Linux and the exact integrated release commit still require A17 acceptance. No live Google OAuth, Resend delivery, or production Neon transport was exercised. The production build used synthetic settings; tests and local SQL execution establish application behavior, not live provider acceptance.
- `after()` delivery is best effort and may be lost if the runtime terminates. Resend/recovery allows retry. Decide whether launch requirements need a durable outbox/queue; none is added here.
- Existing email lookup is case-insensitive while the database unique constraint is exact-value based. No case-fold unique index was added. Inventory legacy case-folded duplicates and define cleanup/merge policy before a coordinated unique-index migration; `LIMIT 1` is ambiguous if those duplicate identities exist.
- Existing JWTs without `authVersion` require fresh sign-in at rollout. Existing credentials beyond 72 UTF-8 bytes now require password recovery. Live session validation fails closed on a database outage.
- Rollback should retain the additive schema. Reverting auth code to a version that ignores `auth_version` can accept JWTs invalidated by resets; coordinate session invalidation separately if rollback is required. Do not remove the migration while updated code is active.

Security design reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
