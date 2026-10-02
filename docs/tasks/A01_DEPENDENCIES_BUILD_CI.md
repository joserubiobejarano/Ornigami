# A01 — Patch vulnerable dependencies and restore release CI

**Status:** Local implementation and validation complete; target Linux CI and signed-in/provider acceptance remain integration gates.
**Branch:** `task/a01-dependencies-build-ci`
**Baseline commit:** `ff4d9b28e4a42a384c5954781d0046890c56cba1`
**Roadmap scope:** E01 and E12, as assigned to A01 in `docs/ROADMAP.md`. This handoff is task evidence; the shared roadmap remains integration-owned.

## Scope and acceptance

A01 owns the application manifest and lockfile, build configuration, and quality/security CI dependency checks. Acceptance is a clean install, audit, lint, TypeScript, tests, and committed production build on Node 22/Linux, plus supported local validation and CSP/auth regression evidence. This task does not allocate a schema migration. Any required shared model, route, settings, or deployment-config change must be identified for integration and is outside this patch.

The baseline build command was `next build && node scripts/generate-static-csp-hashes.mjs`; CI targets Ubuntu with Node 22 and runs install, lint, TypeScript, unit tests, and build. A separate security workflow runs npm audit and security tests. The roadmap records a prior Windows Turbopack font failure and a previous production audit result of one critical and three high findings.

## Vulnerability evidence

The baseline manifest pinned Next.js `16.3.0` and `eslint-config-next` `16.0.1`. Baseline lock entries included Sharp `0.35.3`, fast-uri `3.1.5`, and brace-expansion `1.1.18`.

Upstream advisories checked for this task:

- [Next.js GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j): affected releases are >=16.2.0 and <16.3.6; 16.3.8 is patched.
- [Sharp GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w): affected releases are below 0.35.5.
- [fast-uri GHSA-qw65-cvwx-89v3](https://github.com/fastify/fast-uri/security/advisories/GHSA-qw65-cvwx-89v3): baseline 3.1.5 was below the patched 3.1.7 release.
- [brace-expansion GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7): baseline 1.1.18 was in an affected range; patched versions vary by major line.
- The authoritative audit also found `js-yaml` 4.3.1 (high, [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)) and `@humanfs/node` 0.16.7 (moderate, [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g)) in the installed graph.

These version findings establish affected version ranges, not that an exploit precondition is reachable in Ornigami. The initial sandbox audit returned zero findings, but was not accepted as final evidence. After the first dependency updates, the authoritative audit exposed the two additional transitive findings above; both were then updated. Final authoritative full and production-only audits returned zero findings.

## Implementation

The final lock resolves Next.js and `eslint-config-next` to 16.3.8, Sharp to 0.35.5, fast-uri to 3.1.8, brace-expansion to 1.1.21 / 2.1.7 / 5.0.12, `js-yaml` to 4.3.2, and `@humanfs/node` to 0.16.8.

The build script selects `next build --webpack` and continues to generate static CSP hashes. Quality CI now runs `next typegen` before TypeScript and `npm run test:build` after the production build. The smoke script checks generated-hash parity, inline hydration-script nonces and per-request nonce rotation, anonymous dashboard/auth/Google/billing boundaries, and the Open Graph PNG response. It does not make authenticated provider calls. The generated static hash manifest is not consumed by runtime CSP policy.

## Runtime and verification evidence

Validation used an isolated official Node `v22.23.3` Windows x64 runtime with npm `10.9.9`. The archive SHA-256 matched the official checksum published in [Node.js SHASUMS256.txt](https://nodejs.org/dist/v22.23.3/SHASUMS256.txt). WSL and Docker are unavailable, so no local Linux result was possible.

From the final worktree, the clean Node 22 install added 675 packages and audited 676 with zero vulnerabilities. Authoritative full and production-only audits returned zero findings (777 total dependency entries, 374 production). `npm ls --all --depth=0` exited successfully.

Lint completed with zero errors and four warnings at unchanged UI source locations: Review Booster settings, Review Replies connect, Reviews page, and Settings page. `next typegen` and `npx tsc --noEmit` passed. Unit tests passed 16/16; security tests passed 7/7.

The production build passed using webpack: compilation completed in 46 seconds, TypeScript checks passed, 22 static pages were generated, and static CSP hash generation wrote two hashes. `npm run test:build` passed hash parity, nonce-bound hydration and nonce rotation, protected dashboard behavior, login, Open Graph PNG, empty anonymous session, and anonymous Google/Stripe authorization boundaries. The smoke used CI fixture credentials and performed no authenticated Google/Stripe operations or customer writes.

## Reproduction commands

Run from a clean checkout of the final A01 branch on Node 22, with no dotenv files present. Set the dummy job environment values from the [quality workflow](../../.github/workflows/ci.yml) before these commands; the production smoke rejects dotenv files and the build needs its CI fixture credentials.

```sh
npm ci
npm audit
npm audit --omit=dev
npm run lint
npm run typegen
npx tsc --noEmit
npm test
npm run build
npm run test:build
npm run security:audit
npm run test:security
```

The committed quality workflow runs on Ubuntu/Node 22 and includes clean install, lint, type generation, TypeScript, unit tests, build, and production smoke. The separate security workflow continues to run audit and security tests. The workflow YAML parsed locally, but no remote GitHub Actions run was observed; changing the workflow does not establish that target Linux CI has passed.

## Integration handoff

Integration must adopt the package manifest and lockfile updates, webpack build script, `typegen` and `test:build` scripts, quality CI additions, and `scripts/production-smoke.mjs`. No schema, shared model, application route, settings, Next shared configuration, Vercel/deployment configuration, or cron-workflow changes were made. The shared roadmap remains unchanged. No extra dependency decision or migration is outstanding.

Target Node 22/Linux CI and signed-in/provider acceptance remain integration gates for A00/A17/A19. This local smoke proves anonymous authorization boundaries and CSP nonce/hash behavior; it does not validate signed-in Google or Stripe flows. No staging or production deployment and no merge to main occurred. Reverting the A01 commit restores the previous toolchain and its known affected dependency versions; there are no schema migrations or environment-setting changes to roll back. The integration owner handles any release rollback. The branch is `task/a01-dependencies-build-ci`, based on `ff4d9b28e4a42a384c5954781d0046890c56cba1`; the integration owner records the final result commit after including this handoff.
