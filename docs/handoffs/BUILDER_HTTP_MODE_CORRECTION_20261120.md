# Builder HTTP mode correction and focused verification

20 November 2026. Local source correction only. No workflow was dispatched, no
image was published, no deployment/DNS change occurred, no real invitation was
issued and no paid call was made.

## Exact source

- Branch: `codex/ornigami-builder-http-mode-20261120`
- Base: `14fcd03f43ba2e7fe5e878d6d310556c91626765`
- Candidate code SHA: `088f9cf4915fa5829b9dce676c59b6840373a238`
- Worktree: `C:/Users/joser/.local/ornigami-builder-http-mode-20261120`
- Retained evidence: run `44799494500` at base `14fcd03`, saved under
  `.local/builder-linux-qualification-20261120/` in the primary checkout. Its
  temporary workflow is retained at
  `.local/builder-linux-qualification-20261120/builder-linux-qualification.yml`.

This handoff is documentation-only after the candidate code SHA. The next Linux
run must checkout the candidate SHA itself.

## Retained failure

Run `44799494500` built the exact image and passed the image/read-only/UID
contract, then stopped at the first HTTP smoke:

```text
anonymous /builder expected status 404, got 307
QUALIFY HTTP FAIL: anonymous /builder expected status 404, got 307
```

The application was already behaving correctly for invite mode:
`builder-runtime/app/builder/page.tsx` redirects an anonymous invitation session
to `/?error=session`. The qualification probe had one stale expectation for both
modes. No application behavior was changed.

## Corrections

### Mode-aware HTTP probe

`deploy/builder/qualify-http.mjs` now requires `smoke --mode invite|closed`:

- **Invite:** home `200`; anonymous `/builder` `307`; `Location` must resolve to
  the same qualification origin (internal base or configured external origin)
  at `/?error=session`; anonymous session `401`; anonymous generation `404`.
- **Closed:** home `200`; anonymous `/builder` `404` with no `Location`;
  anonymous session `401`; anonymous generation `404`.

`deploy/builder/qualify-linux.sh` passes the matching mode at the invite and
closed-rollback call sites. `tests/builder-qualify-http.test.mts` covers both
correct modes, swapped mode behavior, missing/wrong redirect targets, an
off-origin redirect, and mandatory session/generation denial.

### Node 22.23.3 IPv6 certificate identity

Node `22.23.3` applies `domainToASCII()` to the hostname before IP detection in
`tls.checkServerIdentity()`. A valid IPv6 literal is therefore treated as a DNS
name and reports `Cert does not contain a DNS name` even when an exact
`IP Address:` SAN is present. Node 24 does not have this behavior.

`src/lib/campaign-lab/brand-import/public-resource-fetch.ts` keeps Node's
verification result for all accepted identities. Only when Node rejects an IPv6
literal does it recover an exact canonical IP SAN match; a missing or different
IP SAN still returns Node's original error. TLS verification, SNI/Host policy,
and negative DNS/IP identity coverage remain intact. The focused test now also
checks alternate IPv6 spelling, a different IPv6 SAN and a DNS-only SAN.

### Toolchain negative test isolation

`tests/toolchain-contract.test.mjs` now passes explicit malformed
source/run/attempt values while simulating inherited GitHub Actions variables
(`SOURCE_SHA`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `RUNNER_TEMP`,
`ORNIGAMI_EVIDENCE_DIR`). Invalid input must fail with `source/run` before any
evidence path is read; the environment is restored after the test.

### Bash discovery

`tests/coolify-runtime-acceptance.test.mjs` now resolves an executable Bash from
`BASH`, OS-specific absolute paths, or `which`/`where` instead of checking
whether the relative name `bash` exists in the repository directory. On Linux
this resolves `/bin/bash` (or `/usr/bin/bash`), so the 14 extracted shell tests
execute instead of reporting `Bash is unavailable`.

The builder README's HTTP contract now distinguishes invite `307` from closed
`404`.

## Focused verification

Run with Node `v22.23.3` and GitHub Actions-like variables set:

| Check | Result |
| --- | --- |
| Focused HTTP, transport, toolchain and runtime-acceptance suites | **55/55 pass**, 0 fail, **0 skipped** |
| Remaining skips in that focused set | none |
| `npx tsc --noEmit` | pass |
| Focused ESLint on changed files | 0 errors; one pre-existing unused-parameter warning in the transport test |
| `node --check deploy/builder/qualify-http.mjs` | pass |
| `bash -n deploy/builder/qualify-linux.sh` | pass |
| `node scripts/builder-linux-qualify-self-test.mjs` | **9/9 pass** |

The 14 previously skipped shell tests were executed by the fixed discovery.
This is local focused verification, not Linux/container evidence.

## Next authorized Linux command

From a clean checkout of the candidate code SHA:

```bash
git checkout 088f9cf4915fa5829b9dce676c59b6840373a238
git status --porcelain                       # must be empty

SOURCE_SHA="088f9cf4915fa5829b9dce676c59b6840373a238" \
APP_URL="http://127.0.0.1:3100" \
BROWSER_PHASE=1 \
  ./deploy/builder/qualify-linux.sh
```

The retained temporary workflow from run `44799494500` is available as the
rehearsal harness reference. Dispatch, deployment, registry publication and DNS
changes remain for the separately authorized rehearsal.
