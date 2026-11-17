# Security exception proposal - GHSA-fc5q-39xc-vjpf (picomatch)

| Field | Value |
| --- | --- |
| Status | **PENDING OWNER APPROVAL** |
| Proposed on | 2026-11-17 |
| Applies to source SHA | `6906f5cb36a28400dc39229f737578dcfe2f1f4a` |
| Advisory | `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366` |
| Severity | high (CVSS 3.1: 7.5, availability only) |
| Package | `picomatch` (npm), range `<= 4.0.7` |
| Patched version | **none published** |
| Proposed owner | `@joserubiobejarano` (repository owner / release approver) |
| Proposed expiry | **2026-12-17 23:59 UTC** |
| Interim review | 2026-12-01 |
| Audit policy | **unchanged** (`scripts/security-audit.mjs`) |
| Release approval | **not granted by this document** |

## 1. Decision requested

Approve a time-boxed, advisory-specific exception to the release audit policy's
requirement that the full npm audit contain zero findings.

If approved, the exception would allow a release to proceed **only when all of
the following are true**:

1. Every required engineering check in the diagnostic workflow passes.
2. The release record cites this proposal and its approval.
3. No reassessment trigger in section 7 has occurred.
4. The exception has not expired.

This proposal does **not** approve a release, deployment, or publication. It does
not modify the audit script, CI policy, dependency graph, or application code.
The audit will continue to fail until a patched dependency or a separate policy
decision changes the result.

## 2. Advisory

`picomatch through 4.0.7` is vulnerable to regular-expression denial of service
(CWE-1333) when a caller supplies a single-branch repeated extglob pattern such
as `+(*)` or `+(*a)`. `analyzeRepeatedExtglob` in `lib/parse.js` applies its
overlap checks only when `branches.length > 1`, so the compiled regex can
backtrack exponentially against short crafted strings.

The threat model is a malicious **glob pattern**, not a malicious string being
matched. An attacker must be able to choose or influence the pattern passed to
`picomatch()` / `makeRe()`.

Upstream state on 2026-11-17:

- Latest npm release: `picomatch@4.0.7` (2026-08-24).
- `4.0.7/lib/parse.js` still contains the `if (branches.length > 1)` guard.
- Issue #175 ("Incomplete ReDoS Fix Bypass") is open.
- PR #194 is open and unmerged; it is not a fix for this advisory.
- No first patched version exists in the GitHub advisory data.

## 3. Exact affected dependency paths

Installed `picomatch` is one hoisted copy: `node_modules/picomatch@4.0.5`,
`dev:false`, integrity
`sha512-RvwwcruNjI1ncT5xRakeyS9Lf8lcItv34KD+aif+VH9kduAyfYBipGh12274xtenIPZ119/R9BdTBa8gAwSh0A==`.

### 3.1 Production / build-time

| # | Path | Actual use | Request-reachable |
| --- | --- | --- | --- |
| P1 | `@sentry/nextjs@10.78.0` -> `@rollup/plugin-commonjs@28.0.1` -> `picomatch@4.0.5` | Sentry webpack loader builds a Rollup bundle for server instrumentation | No |
| P2 | `@sentry/nextjs@10.78.0` -> `@rollup/plugin-commonjs@28.0.1` -> `@rollup/pluginutils@5.4.0` -> `picomatch@4.0.5` | `createFilter()` is available but receives no include/exclude patterns from Sentry | No |
| P3 | `@sentry/nextjs@10.78.0` -> `@rollup/plugin-commonjs@28.0.1` -> `fdir@6.5.0` -> `picomatch@4.0.5` (peer) | `fdir.glob()` is only used when `dynamicRequireTargets` is set; Sentry sets none | No |
| P4 | `@sentry/nextjs@10.78.0` -> `rollup@4.62.4` (inlined parser in `dist/shared/*`) | Rollup build engine used by Sentry's build tooling | No |

`@sentry/nextjs` is a production dependency, so npm classifies P1-P3 as
production. Their actual execution is build-time only.

### 3.2 Development / lint / test

| # | Path | Actual use | Request-reachable |
| --- | --- | --- | --- |
| D1 | `fast-glob@0.0.0-ornigami.1` (`file:scripts/vendor/fast-glob-compat`) -> `tinyglobby@0.2.15` -> `picomatch@4.0.5` | First-party lint adapter | No |
| D2 | `fast-glob@0.0.0-ornigami.1` -> `tinyglobby@0.2.15` -> `fdir@6.5.0` -> `picomatch@4.0.5` (peer) | Lint adapter directory walking | No |
| D3 | `eslint-config-next@16.4.5` -> `eslint-import-resolver-typescript@3.10.1` -> `tinyglobby@0.2.15` -> `picomatch@4.0.5` | ESLint import resolution | No |
| D4 | `eslint-config-next@16.4.5` -> `typescript-eslint@8.73.0` -> `@typescript-eslint/typescript-estree@8.73.0` -> `tinyglobby@0.2.15` -> `picomatch@4.0.5` | TypeScript-ESTree project globs | No |

### 3.3 Runtime copy not reported by npm audit

`next@16.4.5` (the app-owned SRI source tarball) embeds
`next/dist/compiled/picomatch`, a pre-mitigation compiled copy.
`next/dist/shared/lib/match-remote-pattern.js` calls `makeRe` for
`images.remotePatterns`. This application configures no `images` block and no
`remotePatterns`, so those matchers are not active. The proxy matcher is the
static string `/((?!_next/static|_next/image|favicon.ico).*)`.

## 4. Current configuration

- `scripts/security-audit.mjs` requires **zero findings** in the full audit and
  **zero high/critical** in the production audit. It is unchanged.
- `package.json` overrides do not include `picomatch`, `fdir`, `tinyglobby`,
  `@rollup/plugin-commonjs`, or `@rollup/pluginutils`.
- `@sentry/nextjs` is a production dependency at `^10.78.0`; the installed
  version is `10.78.0`.
- Sentry's `wrappingLoader.js` calls
  `commonjs({ sourceMap, strictRequires, ignoreDynamicRequires, ignore })` with
  no `include`, no `exclude`, and no `dynamicRequireTargets`.
- `next.config.ts` has no `images` / `remotePatterns` configuration.
- `src/proxy.ts` exports a static matcher array.
- `src/**` contains no imports of `picomatch`, `tinyglobby`, `fdir`,
  `micromatch`, `fast-glob`, `@rollup/plugin-commonjs`, or
  `@rollup/pluginutils`, and no `globSync` / `makeRe` / `isMatch` / `glob(`
  calls.
- Campaign Lab is gated to `NODE_ENV=development` by
  `src/lib/campaign-lab/availability.ts`. Production routes deliberately return
  404.

## 5. Reachability evidence

Local investigation against `6906f5c` (full report:
`.local/remediation/REPORT.md`, reachability receipt:
`.local/remediation/reachability-scan.json`):

- `src/**` glob-library imports: **0**.
- `src/**` glob API calls: **0**.
- `.next/server` + `.next/static` JavaScript files scanned: **406**.
- Files containing `analyzeRepeatedExtglob`: **0**.
- Files containing the npm `picomatch` package path: **0**.
- Files containing `picomatch` after excluding the worktree-name false
  positive: **0**.
- Production build: passed; 24/24 static pages, SRI finalized, 2 static CSP
  hashes.

Sentry's build path compiles no pattern:

- `wrappingLoader.js:1` imports `@rollup/plugin-commonjs`.
- The `commonjs()` call has no `include`, `exclude`, or
  `dynamicRequireTargets`.
- `@rollup/plugin-commonjs` calls
  `createFilter(options.include, options.exclude)`; with both undefined,
  `createFilter` returns a constant matcher and never calls picomatch.
- `getDynamicRequireModules(options.dynamicRequireTargets, ...)` receives
  undefined, so the `fdir.glob()` loop is empty.
- `strictRequires: true` takes the `() => true` branch, not `createFilter`.

Lint and test patterns come from tsconfig includes, ESLint ignore lists, and the
first-party `fast-glob` adapter. None is derived from an HTTP request, server
action, form field, query/path parameter, database value, or user-controlled
environment variable.

**Conclusion:** application input cannot supply the vulnerable glob pattern in
the current code and configuration.

## 6. Residual risk

The risk is assessed as **low but non-zero**.

Why it is low:

- The vulnerable parser is not present in request-time bundles.
- The only production build call that could compile a pattern receives none.
- All development/lint patterns are static tool configuration.
- The advisory is availability-only; there is no confidentiality or integrity
  impact.

Why it is not zero:

- `picomatch@4.0.5` remains installed in the production dependency graph.
- A future change to Sentry/Rollup options, Next image patterns, the proxy
  matcher, lint configuration, or the fast-glob adapter could introduce
  attacker-influenced patterns.
- A compromised or malicious dependency that controls a pattern could trigger
  the parser during a build or lint run.
- The exception bypasses the normal zero-finding audit gate for this advisory
  only; it does not reduce the severity of the underlying defect.
- If the application later exposes a build-time or glob-driven feature to
  untrusted users, the risk assessment must be repeated.

The exception does not authorize any other advisory, severity, package, or
version.

## 7. Conditions requiring reassessment

Reassess this exception immediately, and suspend it until re-approved, if any of
the following occurs:

- [ ] Any change to glob configuration, including Sentry `commonjs()` options,
      Rollup include/exclude/dynamicRequireTargets, Next `images.remotePatterns`
      or `localPatterns`, the proxy matcher, ESLint/TypeScript globs, or the
      fast-glob compatibility adapter.
- [ ] Any dependency change that adds, removes, upgrades, or downgrades
      `picomatch`, `fdir`, `tinyglobby`, `@rollup/plugin-commonjs`,
      `@rollup/pluginutils`, `@sentry/nextjs`, `next`, `eslint-config-next`,
      `typescript-eslint`, or `rollup`.
- [ ] Any new path where user-supplied input can become a glob pattern, regex,
      include/exclude entry, dynamic-require target, or matcher.
- [ ] Any new `src/**` import of a glob library or call to `picomatch`,
      `makeRe`, `isMatch`, `glob`, `globSync`, `tinyglobby`, or `fdir`.
- [ ] Any upstream `picomatch` release above 4.0.7, or any advisory update that
      changes the range, severity, or patched-version status.
- [ ] Any change to `scripts/security-audit.mjs`, the release workflow, or the
      audit policy.
- [ ] Any new advisory affecting the same dependency chain, or any increase in
      severity.
- [ ] Any change that makes Campaign Lab or another glob-driven surface
      available in production or to untrusted users.
- [ ] Any attempted or suspected ReDoS, build-time denial of service, or
      anomalous build/lint duration.
- [ ] Any deployment model change that exposes build tooling, the dev server, or
      dependency installation to untrusted users.

## 8. Proposed owner and expiry

- **Owner:** `@joserubiobejarano` (repository owner / release approver).
  The owner is responsible for approving, renewing, or revoking this exception
  and for confirming that the reassessment triggers are monitored.
- **Technical reviewer:** the maintainer who produced the reachability evidence.
- **Expiry:** **2026-12-17 23:59 UTC**. The exception is void after this time
  unless renewed in writing.
- **Interim review:** 2026-12-01. If no upstream patch exists, the owner must
  either renew with a new expiry or choose a different remediation.
- **Renewal:** a renewal must repeat the reachability check and record the
  current dependency graph; it cannot be approved by default.

## 9. Approval and release boundary

This proposal is **pending**. It becomes effective only when the owner records
approval in section 12.

If approved:

- It permits a release to be considered despite the `GHSA-fc5q-39xc-vjpf`
  finding, provided every required engineering check passes and the release
  record cites this approval.
- It does **not** approve deployment, publication, provider action, or any
  external release action.
- It does **not** authorize ignoring any other audit finding.
- It does **not** change the audit script's exit code or the CI policy.
- It does **not** authorize a maintained fork or a vendored patch.

The release record must state:

- `engineeringChecks: passed`
- `dependencyAudit: failed (GHSA-fc5q-39xc-vjpf exception approved)`
- `releaseApproval: separate owner decision`
- `exceptionExpiry: 2026-12-17`

## 10. Verification plan

Before relying on the exception, run the diagnostic Linux/Node 22 workflow
against the exact source SHA and confirm:

1. `npm run security:audit` fails with the expected `picomatch` finding; the
   failure is recorded, not suppressed.
2. `npm run lint`, `npm run typegen`, and `npx tsc --noEmit` pass.
3. `npm test` passes.
4. `npm run build` passes and finalizes SRI.
5. The clean-rebuild SRI production check passes.
6. CSP and production smokes pass.
7. Production home/login/Campaign Lab 404 gates pass.
8. The dynamic-chunk fixture passes its tamper-rejection checks.
9. Portable prepared-brief, packshot, local-approval, export failure matrix,
   and provisional export checks pass.
10. The evidence artifact is uploaded even if a check fails.

## 11. Exit criteria

The exception ends automatically when any of the following occurs:

- A patched `picomatch` release is published and adopted; remove the exception
  and rerun both audits.
- The affected dependency chain is removed.
- The owner revokes the exception.
- The expiry passes without renewal.
- A reassessment trigger occurs and the owner does not re-approve.

## 12. Approval record

- [ ] Owner approves the exception as scoped above.
- [ ] Owner confirms the expiry and interim review dates.
- [ ] Owner confirms the reassessment triggers are monitored.
- [ ] Technical reviewer confirms the reachability evidence is current for the
      release SHA.
- [ ] Release record cites this approval.

Approved by: ____________________  Date: __________

Notes:

---

## Appendix A - Alternatives considered

- **Upgrade `picomatch`:** no patched version exists; `4.0.7` is still
  vulnerable.
- **`npm audit fix`:** lands on `picomatch@4.0.7` and still reports 14 high.
- **`@sentry/nextjs@8.38.0`:** excluded by its Next 13-15 peer range, still
  resolves the picomatch chain through `@rollup/plugin-commonjs@26.0.1`, and
  falls inside the low `GHSA-r5w7-f542-q2j4` advisory.
- **`eslint-config-next@16.3.8`:** mismatches Next 16.4.5 and still resolves
  `tinyglobby` / `picomatch` through `typescript-eslint` and
  `eslint-import-resolver-typescript`.
- **Remove Sentry or the ESLint stack:** would clear the chain but does not
  preserve existing behavior.
- **Maintain a first-party patched picomatch:** possible, but creates a
  maintained dependency fork and requires a separate decision.

## Appendix B - Evidence references

Local investigation (not committed):

- `.local/remediation/REPORT.md`
- `.local/remediation/dependency-map.json`
- `.local/remediation/reachability-scan.json`
- `.local/remediation/audit-full.json`
- `.local/remediation/audit-production.json`
- `.local/remediation/security-audit.log`

Diagnostic CI evidence is uploaded by the workflow as
`sri-linux-diagnostics` and includes the audit logs, build/SRI/CSP logs, gate
results, dynamic-chunk results, portable export reports, and the summary JSON.
