# A17 integrated isolated release evidence

Run window: 2026-10-03 22:38–22:50 UTC (October 4, 00:38–00:50 Europe/Madrid).

Candidate branch: `test/a17-integrated-release-acceptance`. The checkout remained at base commit `a98878ef2611322c54f67de61a018b7ecf8e3298`. The final full suite included the A17 delivery acceptance test at SHA-256 `8BDD24C198FF9B424D4634DDA90FD62EFE9965F6AECE02BFB89DF1637FD173E0`. Other concurrent changes in the worktree were acceptance documentation only. No runtime, dependency, lockfile, migration, shared configuration, deployment, or commit was changed for these gates.

## Runtime and isolation

The machine's default Node was v24.11.1. Node v22.23.3 was obtained in the local npm cache with `npm exec --yes --package=node@22.23.3 -- node --version` and used for all gates; npm was 11.6.2. PostgreSQL 17.9 tools were available at `C:\Program Files\PostgreSQL\17\bin` (`initdb`, `pg_ctl`, `psql`, and `postgres`).

`npm ci` completed under Node 22.23.3: 654 packages added, 656 audited, zero findings. PostgreSQL integration suites started disposable PostgreSQL 17.9 clusters in worktree `.next` directories on loopback and stopped them during cleanup. The full run used those fixtures; it did not connect to the installed PostgreSQL service or any shared database. One completed fixture directory remained after the suite. Its `postmaster.pid` was absent, no process referenced its resolved data directory, and its log recorded immediate shutdown followed by clean database shutdown. Only that worktree-contained directory, `.next/a11-shared-finalization-pg-bBuyTq`, was removed. A PostgreSQL process belonging to another project was left untouched.

No environment files or secret values were read. The first production build attempt exposed the app's required `GOOGLE_CLIENT_ID` during route collection. The successful retry supplied synthetic CI-only values in the build process environment; it made no provider calls. The successful build generated two static CSP hashes.

## Local gate results

| Gate | Result |
| --- | --- |
| Clean install | `npm ci` passed; 654 packages added, 656 audited. |
| Full suite | Final `npm test` passed **465/465**, 0 failures, 0 skipped, 63.672 seconds. This includes real disposable PostgreSQL 17.9 fixtures. |
| First full-suite attempt | 464/465 passed. The new synthetic Resend webhook test used dotted event IDs and received 401; the acceptance test fixture was corrected, its focused PostgreSQL run passed 1/1, and the final full suite passed at the recorded test-file hash. |
| Lint | `npm run lint` passed with 0 errors and 4 Next navigation warnings. The warnings are existing `window.location.href` findings in Booster settings and Replies connect, reviews, and settings pages. |
| Type generation and TypeScript | `npm run typegen` and final `npx tsc --noEmit` passed. |
| Dependency audit | `npm run security:audit` passed: zero full-tree findings and zero production findings. |
| Security tests | `npm run test:security` passed **7/7**, 0 skipped. |
| Production build | `npm run build` passed with process-only synthetic CI environment: webpack compile, TypeScript, all 24 static pages, trace collection, and CSP hash generation. The log also preserves the initial missing-`GOOGLE_CLIENT_ID` attempt. |
| Production smoke | `npm run test:build` passed: static CSP hash parity, nonce-bound hydration and rotation, protected dashboard redirect, Open Graph image, and anonymous auth/Google/billing boundaries. |

An additional Node 22 anonymous in-app browser smoke rendered eight home/auth/demo routes and a 404, checked CSP nonce rotation/hydration and report-only Trusted Types headers, and confirmed the anonymous dashboard redirects to login without browser console errors or warnings. It did not exercise an authenticated owner/member/outsider journey. Screenshot SHA-256: `FF84A704BBFC60D457613E5E3E294A1613669BA9A6D6379396B5546F8B40ACF3`. The loopback server was stopped and its port was confirmed closed.

## Logs and remaining gate

Sanitized raw command logs are retained under ignored `.next/a17-integrated-evidence`. SHA-256 values below identify the captured files.

| Log | SHA-256 |
| --- | --- |
| `npm-ci.log` | `9CFFF0BF4FED7A4B58956C03212348BFA37B7173DF852AFF55DF719CEB7E20BF` |
| `npm-test.log` (initial failure) | `DE1DF8303A0B5D76858D437CB20BABD3BBEDD1310AAA5866A077E963479C5DCE` |
| `npm-test-final.log` | `85239F7C0CE1E67D9360DC77D190C89F95CCD0C93DC300F9148DBEA9D7AE6426` |
| `lint-final.log` | `385226883A3036532DD63D655A451C7A03DF476D5B4F33C7B335DF3AB22BB770` |
| `typegen.log` | `7158491A8132B172A2A40010819C1CEA93722D90ECB500EB5AB1CE87066E4A2F` |
| `tsc-final.log` | `C1E97067C5F479A44A6F57297A0A8F87A59D181C3C529910F8BF059094BC3ABB` |
| `security-audit.log` | `1399C6A79C8FBA83FEA6209860C50411A8ABE6022BE63F40193DA9C3593390F2` |
| `security-test.log` | `9E5B8F4757F0955C2763C613D4F4CADFEB996EB83ABEC8CA23ED333DB57B907B` |
| `build.log` | `D290B7F96E82F78B2040E6C3B13780C51C0C2C030B29390568E24DFE6A7A3E6D` |
| `production-smoke.log` | `ADD0D9D846A0FD8BC8B97E68059076D20ACD8FEAE7C7DFF2008EB9E26185A23A` |

Exact-candidate Linux CI remains pending. GitHub CLI is installed, but this host has no listed WSL distribution and no Docker executable; no remote CI workflow or deployment was triggered. The required Linux release gate must run through the authorized integration CI. These local checks also do not establish authenticated owner/member browser acceptance or live provider acceptance; those remain tracked separately in the A17 acceptance documents.
