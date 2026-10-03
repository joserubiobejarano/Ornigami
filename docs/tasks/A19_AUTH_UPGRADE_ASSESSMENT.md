# A19 — Auth.js upgrade and runtime boundary assessment

**Assessment date:** 2026-10-03
**Scope:** Auth.js release status, the existing A04 authentication implementation, and runtime/auth integration risks. This document proposes integration work; it does not change auth code, shared models/routes/settings, dependencies, proxy, or deployment configuration.

## Release status

At the assessment date, the npm registry endpoint `https://registry.npmjs.org/next-auth` returned these `next-auth` dist-tags via `npm view next-auth dist-tags --json`:

```json
{
  "canary": "3.24.0-canary.0",
  "next": "4.0.0-next.26",
  "next-auth-3": "3.29.10",
  "experimental": "0.0.0-manual.2824fa11",
  "latest": "4.24.15",
  "beta": "5.0.0-beta.32"
}
```

Direct tag resolution from that registry returned `next-auth@beta = 5.0.0-beta.32` and `next-auth@latest = 4.24.15`. The [npm package version page](https://www.npmjs.com/package/next-auth?activeTab=versions) showed the same tags when checked on 2026-10-03. This establishes only that `latest` points to v4 and `beta` points to v5 beta at the time checked; it does not establish whether a stable v5 version exists under some other tag or version. Do not describe a v5 stable upgrade as available or silently replace the current pin on that assumption.

The application already pins `next-auth` 5.0.0-beta.32 and uses the v5 `NextAuth()` exports and callback API. An upgrade to a future stable version should be treated as a compatibility migration from the installed beta, even if the public v4-to-v5 guide presents a simpler migration for v4 applications. Recheck npm dist-tags and the release-specific migration guide when A01 schedules a dependency update.

Primary references checked 2026-10-03:

- [Auth.js v5 migration guide](https://authjs.dev/getting-started/migrating-to-v5), crawled as current on the check date. It documents the `auth`/`handlers` entry point, changed configuration/type names, cookie prefix, proxy integration, stricter OAuth/OIDC compliance, and `AUTH_*` environment conventions.
- [Auth.js Core reference](https://authjs.dev/reference/core), current on the check date.
- [npm `next-auth` versions and dist-tags](https://www.npmjs.com/package/next-auth?activeTab=versions), checked on 2026-10-03.

## Existing implementation and migration constraints

`src/auth.ts` configures Google plus credentials, JWT sessions with a 30-day maximum age, a custom `/login`, `trustHost: true`, and v5 `auth`/`handlers` exports. There is no Auth.js database adapter or Auth.js-owned session table. Users and profiles are managed by application SQL. Any future migration must preserve this custom ownership model unless a separately reviewed design explicitly changes it.

The credentials path normalizes/validates email, applies shared password rules and persistent rate limits, requires verified email, compares the stored bcrypt hash, and returns the `auth_version` read with that hash. The JWT callback places this snapshot in `authVersion`, then reloads the live user row. Missing rows (including deleted users), stale versions, legacy tokens without a version, and lookup errors fail closed. An account with a pending deletion request is intentionally different: its live row remains, the JWT is marked restricted, and the session projection removes ordinary user PII/id while retaining deletion-only recovery context. It does not upsert on refresh. The OAuth initial sign-in path alone calls `ensureUserFromOAuth`, and the Google `signIn` callback requires `profile.email_verified === true`. The custom redirect callback sanitizes same-origin return paths. These behaviors and the established edge cases are covered in [A04 account recovery handoff](../ACCOUNT_RECOVERY_HANDOFF.md).

`authVersion` is a deliberate application session-revocation contract, not a built-in Auth.js feature. Password reset increments `users.auth_version`; A11 also uses this version to revoke sessions, and account deletion blocks live-row resolution. A migration must retain the version claim and live-row comparison, including session-cookie clearing when a callback rejects the JWT. A careless move to database sessions or adapter-managed sessions would change revocation semantics and schema expectations. It also must preserve A11's restricted deletion session projection: a deleting account's normal user PII/id is removed from the session while a separate deletion identifier remains available only to the recovery flow.

Expected user/session effects are material: after rollout, JWTs without `authVersion` are rejected and affected users must sign in again; incrementing `auth_version` logs out all existing sessions; deleting a user causes the next live validation to fail. The 30-day configured JWT maximum does not mean stale sessions remain usable for 30 days because the callback performs a live check. That check adds a database read to JWT validation and intentionally fails closed during database errors, so outages can appear as sign-outs. Preserve and explicitly validate these availability and rollout effects.

Google OAuth needs a controlled acceptance pass after any Auth.js upgrade. The v5 guide calls out stricter OAuth/OIDC compliance as a possible provider compatibility change. Verify Google callback URI and state/PKCE handling, email verification policy, existing-user linking/upsert behavior, and callback return paths with a non-production test account. The current A04 code does not configure an Auth.js adapter or automatic account-linking policy; preserve its email-based application upsert semantics and deletion freeze checks. No provider calls were made for this assessment.

The v5 guide recommends `AUTH_*` names and documents host inference and `trustHost`. This application explicitly reads `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, sets `trustHost: true`, and has compatibility fallbacks for `NEXTAUTH_SECRET` alongside `AUTH_SECRET` in other security helpers. Do not rename settings or rotate secrets as part of a package-only migration. A01/A02 should map the deployed proxy's trusted forwarding-header boundary and ensure public host/origin validation remains consistent before changing host inference or secret naming. A19's URL redirect callback is a separate allowlist boundary and should remain tested.

## Integration proposals by owner

| Owner | Proposed follow-up | Contract to preserve |
| --- | --- | --- |
| **A01** | Keep the exact v5 beta pin documented as beta until registry `latest` advances. When selecting a stable release, inspect its changelog/migration guide, update dependency and lockfile under A01, and run clean install, audit, types, all auth regressions, production build, and smoke. | Do not change auth config, env names, cookie policy, or session strategy as incidental dependency remediation. Supply exact tested version and auth regression results. |
| **A04** | Own any code-level Auth.js major/stable migration after a release is selected; review callback input/output types and Core behavior, cookie clearing, Google initial sign-in and refresh, credentials, signout, callbacks, restricted deletion session, and safe redirects. | Preserve `authVersion`/live user lookup, JWT strategy, no refresh upsert, verified Google email requirement, credentials/reset race protection, and current custom user/profile ownership. |
| **A02** | During shared runtime/proxy integration, document the trusted host/forwarded-header source that justifies `trustHost: true`; keep app origin and callback validation aligned. Any shared type/model or routing contract required by a version change must be proposed for integration instead of edited in this task. | A client-controlled host must not become the canonical auth origin; preserve same-origin callback sanitizer and canonical app URL rules. |
| **A12** | Include auth failures in runtime monitoring with fixed event names and no email, token, session-cookie, OAuth code, or provider exception payloads. Distinguish expected invalid/revoked sessions from actionable database/provider failures. | Fail-closed session behavior must remain observable without making credentials or provider response details operational logs. |

This assessment found no required new database migration, shared model, route, or setting solely to keep the current v5-beta API working. A future major upgrade may change exported types or runtime behavior; A04 should identify concrete shared contracts then. No dependency, proxy, or deployment changes are submitted here.

## Evidence and limits

- Registry dist-tags and direct `latest`/`beta` resolutions were queried on 2026-10-03; current values are recorded above. Registry tags can change and must be checked again before integration.
- Source review covered `src/auth.ts`, `src/types/next-auth.d.ts`, `src/lib/db/users.ts`, `src/lib/auth.ts`, `src/proxy.ts`, the auth route tree, `docs/ACCOUNT_RECOVERY_HANDOFF.md`, `docs/tasks/A01_DEPENDENCIES_BUILD_CI.md`, and A11 auth session contracts.
- Existing regression evidence in A04 includes `tests/auth-session-callbacks.test.mts` and `tests/auth-core-session.test.mts`: mocked credentials/reset race, stale/deleted/legacy/unreadable user rejection, OAuth upsert only on initial sign-in, callback sanitization, and Auth.js Core null-session plus session-cookie removal. This assessment did not change auth source or add redundant tests.
- Re-run on 2026-10-03: `node --experimental-strip-types --test tests/auth-core-session.test.mts tests/auth-session-callbacks.test.mts tests/auth-return-path.test.mts tests/a11-auth-restricted-session-contract.test.mts` — **9 passed, 0 failed, 0 skipped**. Node emitted its existing `MODULE_TYPELESS_PACKAGE_JSON` performance warning while loading `src/lib/auth-return-path.ts`; test outcomes were unaffected.
- No real database, Google provider, email service, staging, or production environment was contacted. This is a source/configuration assessment, not provider acceptance or target-runtime evidence.

## Unresolved decisions

- Recheck and record the exact stable v5 release/changelog before any future upgrade; none is tagged `latest` in the registry response recorded here.
- Decide whether a v5 stable upgrade keeps `AUTH_SECRET`/`NEXTAUTH_SECRET` compatibility and current Google variable names or schedules a separately managed secret/environment migration. No rename or rotation is proposed without deployment coordination.
- Confirm with A02 which trusted ingress headers are guaranteed by each supported hosting runtime before modifying `trustHost` or host inference.
- Retain JWT sessions unless a future design explicitly addresses the change in `auth_version` revocation, A11 deletion restrictions, schema ownership, and cookie-clearing behavior.
