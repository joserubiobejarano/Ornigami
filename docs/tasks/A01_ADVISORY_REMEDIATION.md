# A01 — GHSA-vfj7-8cjw-p6xm remediation

**Scope:** remove the temporary exception for the `braces` advisory before its `2026-10-10T00:00:00Z` expiry. This handoff does not update the shared roadmap, application models/routes/settings, or deployment configuration.

**Branch/base:** `fix/a01-advisory-remediation`, based on `7801a437f77810e77f6b58d7cebab55cb2305a07` (`origin/main`).

**Status:** implementation and local validation complete; pending integration and Ubuntu/Node 22 CI.

## Finding and change

As checked on 2026-10-03, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects `braces` through 3.0.3 and listed no patched release. The npm registry reported 3.0.3 as the `latest` tag for [`braces`](https://www.npmjs.com/package/braces). Both vulnerable paths were in the development lint graph:

```text
eslint-config-next 16.3.8
  @next/eslint-plugin-next 16.3.8 -> fast-glob 3.3.1 -> micromatch 4.0.8 -> braces 3.0.3
  typescript-eslint 8.46.3 -> @typescript-eslint/typescript-estree 8.46.3
    -> fast-glob 3.3.3 -> micromatch 4.0.8 -> braces 3.0.3
```

The `fast-glob` override now resolves to a first-party adapter at [`scripts/vendor/fast-glob-compat`](../../scripts/vendor/fast-glob-compat/README.md), with the explicit local version `0.0.0-ornigami.1`. It delegates only to the already locked `tinyglobby@0.2.15` (fdir and picomatch); it contains no upstream `fast-glob`, `micromatch`, or `braces` source. Next.js and ESLint versions and the existing Next lint rules remain intact.

The adapter implements the two locked synchronous call shapes: Next's `globSync(pattern, { onlyDirectories: true })` root-directory lookup, and TypeScript-ESTree's per-pattern `sync(pattern, { cwd, ignore })` project search. It preserves absolute output for absolute patterns, disables tinyglobby's directory expansion, trims its trailing slash from directory matches, and translates TypeScript-ESTree's `!**/node_modules/**` exclusion. It rejects unsupported options and malformed values. Regression tests exercise the real Next no-HTML-link rule, Next root globs, TypeScript project ordering/deduplication, nested `node_modules` exclusion, ignore behavior, and adapter API drift against the locked consumer sources.

The audit exception was removed from `scripts/security-audit.mjs`. Full audit findings now fail regardless of package, severity, ancestry, or date. The production high/critical gate remains. Malformed/error audit reports, metadata/count inconsistencies, invalid npm exit statuses, and status/report contradictions fail closed. No advisory exception or expiration date remains in the security audit implementation.

## Verification

The clean install and local checks used the verified Node `v22.23.3` Windows x64 runtime and npm `10.9.9`, with this worktree's own `node_modules` and an isolated npm cache. No `.env` file was copied or used.

| Check | Result |
| --- | --- |
| `npm ci --no-audit` | Passed; 654 packages installed. |
| `npm ls fast-glob braces micromatch tinyglobby --all` | Passed; both consumers dedupe to local `fast-glob@0.0.0-ornigami.1`; `braces` and `micromatch` are absent. |
| `npm run security:audit` | Passed; zero full-audit and zero production-audit findings. |
| `npm run test:security` | Passed, 7/7. |
| Focused adapter suite | Passed, 11/11, including the locked-consumer API-shape guard. |
| `npm test` | Passed, 414/414. |
| `npm run lint` | Passed with zero errors and four existing internal-navigation warnings in unchanged Review Booster/Review Replies settings/connect/reviews pages. |
| `npm run typegen`; `npx tsc --noEmit` | Both passed. |
| `npm run build` | Passed with webpack; TypeScript completed, 24 static pages generated, two static CSP hashes written. Existing Sentry global-error and client-config deprecation warnings remain outside A01 scope. |
| `npm run test:build` | Passed CSP hash parity, hydration nonce and rotation checks, protected dashboard, Open Graph response, and anonymous auth/Google/billing boundaries. The smoke made no authenticated provider calls. |

Build/smoke used the non-secret `ci.*` fixture values from [the quality workflow](../../.github/workflows/ci.yml); these values must be set in the shell before `npm run typegen`, `npm run build`, or `npm run test:build`. The smoke used its own dummy local credentials. No external provider operations, shared/live database writes, staging/production deployments, or merges were performed. The full test suite exercises repository PostgreSQL suites through their test harness against the local isolated test database.

Reproduce from a clean Node 22 checkout with no dotenv files:

```sh
npm ci
npm run security:audit
npm run test:security
npm test
npm run lint
npm run typegen
npx tsc --noEmit
npm run build
npm run test:build
```

`npm test` includes the adapter/API-drift suite and the audit-policy regression suite. Build and smoke require no dotenv files; use the CI fixture values at process scope.

## Integration and remaining gate

Integration should take `package.json`, `package-lock.json`, the adapter package, audit policy and tests together. No model, route, runtime setting, migration, shared deployment setting, or provider dependency change is required. The added direct dev dependency is the local `fast-glob@0.0.0-ornigami.1` adapter; it depends on `tinyglobby@0.2.15`, already present elsewhere in the dev graph. Existing `eslint-config-next`, Next.js, and TypeScript-ESLint versions are unchanged.

The remaining release gate is the exact candidate's clean install and CI run on Ubuntu/Node 22; this worktree was validated on Windows. `npm ls --all --depth=0` exited successfully; npm also listed two optional platform packages (`@emnapi/runtime`, `@img/sharp-wasm32`) as extraneous on this Windows install. They are unrelated to the adapter, and targeted `npm ls` confirms the changed lint dependency graph is valid. The adapter deliberately supports only the currently locked consumers. When Next or TypeScript-ESLint changes, review the call-shape guard and adapter before updating those packages. If upstream publishes and the lock adopts a patched `braces` path, the integration owner can remove the adapter and override in a separate reviewed cleanup.

There is no schema/data rollback. Reverting the dependency change would restore the vulnerable development lint chain, so do not roll it back without simultaneously preserving a zero-finding full audit policy. The four pre-existing lint warnings and Sentry build warnings are unchanged and remain tracked outside this remediation.
