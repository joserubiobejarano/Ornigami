# A16 — Google OAuth readiness and approval evidence

**Branch:** `ops/google-launch-approval` | **Baseline:** `b4eedd5`

## Scope and result

This task adds a standalone, offline checker for the local OAuth configuration that supports Google sign-in and the Business Profile connection flow. It reads the current process environment only. It does not load `.env` files, make network requests, contact Google, or change provider configuration. The checker prints the Business Profile URI derived from the application helper and the expected Auth.js registration URI. Auth.js can use its configured URL or request-origin inference, so the expected registration string does not prove the deployed runtime URI.

Run it with:

```sh
node scripts/a16-google-readiness.mjs
node scripts/a16-google-readiness.mjs --json --environment production
```

`--environment` accepts `local`, `preview`, or `production`. JSON is sanitized: Google client values are never returned, malformed URL values are withheld, and each finding identifies whether it comes from local configuration, runtime source, or provider evidence. The process exits `0` only when local configuration findings are clear, `1` for missing/unsafe configuration or any review warning, and `2` for invalid CLI arguments. `NODE_ENV=production` enforces production signing/encryption secret requirements even for a preview target. It never emits an `approved` or overall `ready` status. A clean local result means only that local inputs match the inspected application rules.

The two production callback URIs are:

- `https://ornigami.com/api/auth/callback/google` — Auth.js Google sign-in.
- `https://ornigami.com/api/google/oauth/callback` — Business Profile OAuth.

The Business Profile callback is produced by `getGoogleGbpOAuthRedirectUri()` from `getServerAppUrl()`. That runtime trims `NEXT_PUBLIC_APP_URL`, removes trailing slashes, and falls back to `http://localhost:3000`; the checker rejects paths, queries, fragments, or user information that would make an origin-based callback unsafe. Production mode requires the exact canonical string `https://ornigami.com`. The pinned Auth.js runtime uses `AUTH_URL ?? NEXTAUTH_URL` before request-origin inference; an explicit `/api/auth` base path is valid. The checker reports those URL hints and flags origin divergence, but does not claim that local settings prove Auth.js's deployed forwarded host. Neither hint changes the Business Profile callback helper.

OAuth state signing uses `AUTH_SECRET` with `NEXTAUTH_SECRET` fallback. Token encryption uses `TOKEN_ENCRYPTION_KEY`, then `AUTH_SECRET`, then `NEXTAUTH_SECRET`. The runtime hashes the configured encryption string into its AES key, so the checker verifies presence/fallback only and prints none of these values.

A00 integration correction: explicitly configured blank secrets fail the checker instead of being treated as omitted aliases. Empty runtime environment values can be rejected by the application's schema; whitespace-only values are also unsuitable secrets. An explicitly empty `AUTH_URL` is retained as a review finding because the installed Auth.js nullish precedence shadows `NEXTAUTH_URL` and uses request inference. The regression verifies that behavior against the installed runtime helper. The tool remains offline.

## Evidence boundaries and current known state

The checker can establish only local variable presence/shape, production-origin alignment, runtime callback derivation, and the hard-coded `business.manage` request. A registered URI, API approval, quota, API availability, branding/domain verification, account eligibility, or live workflow requires direct provider/account evidence. The checker intentionally reports each such gate as `unverified` on every run. It does not treat repository documentation, a configured client ID, or a mock test as approval evidence.

The [A16 launch handoff](./A16_GOOGLE_LAUNCH_HANDOFF.md) and [Google Business Profile runbook](../GOOGLE_BUSINESS_PROFILE_RUNBOOK.md) record dated provider observations. On 2026-10-03, the signed-in Console audit found both quota values at zero, Google My Business API absent, both production and localhost callbacks registered on the reviewed OAuth client, and the External/Production app's branding verification failing on domain ownership. The current account's Search Console selector did not list `ornigami.com`; ownership must be granted or verified through an appropriate account before retrying after Google's 24-hour wait. No eligible client profile was available, so profile-dependent submission and live acceptance were skipped. These observations are dated and must be rechecked before action. The checker itself made no provider calls and cannot verify the deployed credential/client pairing.

The launch gates remain:

- Basic API Access approval and nonzero quota for the required APIs.
- Google My Business API availability and enablement for reviews/replies.
- OAuth branding, authorized-domain ownership, and any required verification cleared.
- Both derived callback URIs registered on the correct OAuth client.
- A verified active client Business Profile and applicant Manager access; do not create a profile for Ornigami.
- A controlled real-user OAuth and workflow acceptance covering discovery, sync, draft, one approved post, scheduled work, and the Review Booster URL path.

## Shared integration proposals

No shared configuration, route, auth code, environment schema, deployment checklist, or roadmap file was changed in this scoped implementation. Before integration, A00 should consider:

- Keep the checker link and usage example aligned in `docs/GOOGLE_BUSINESS_PROFILE_RUNBOOK.md`, preserving clear separation between local checks and provider evidence.
- Add the checker command and its fail-closed meaning to `docs/DEPLOYMENT_CHECKLIST.md`; do not make its local pass substitute for Console screenshots/records or controlled acceptance.
- Clarify in `docs/ENVIRONMENT_VARIABLES.md` that `NEXT_PUBLIC_APP_URL` is the Business Profile callback source, while `AUTH_URL ?? NEXTAUTH_URL` configures Auth.js's base URL and must align in origin/path with its deployed route.
- Reconcile A16's local tooling and provider evidence handoff into `docs/ROADMAP.md` after review. The roadmap remains owned by A00 and is unchanged here.

No new environment variable or package dependency is required. The checker intentionally has no provider-evidence import mode: accepting an unverified local JSON assertion would risk promoting operator notes into approval evidence. Store dated provider observations in the runbook/checklist with their source and owner, then recheck them during the separately controlled A17 provider acceptance.

## Validation and limitations

Offline Node tests cover both expected callback strings, localhost fallback, runtime trailing-slash normalization, Auth.js URL alias precedence and base path, production origin checks, OAuth signing/encryption secret fallbacks, secret omission, malformed URL sanitization, JSON CLI output, and unknown-argument failure. They do not prove Google Console state, the Auth.js forwarded host in deployment, OAuth consent behavior, quota, profile eligibility, or live API behavior. No real credentials were read from another checkout or committed.
