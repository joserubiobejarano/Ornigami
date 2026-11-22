# Retained-image qualification result, 22 November 2026 (continuation)

This record covers the successful second qualification campaign for the
retained image from run `45030190736`. It supersedes only the outcome of the
earlier failure record; earlier runs and failures remain preserved.

## Result

Run `45043028345` passed the retained-image qualification and the independent
fresh-runner retrieval. The single immutable image was used for edge, browser,
runtime and rollback phases; no build was invoked.

| Item | Value |
| --- | --- |
| Application source | `156259d0c4330b185a0844711b7004b0b4467887` |
| Producer harness | `156259d0c4330b185a0844711b7004b0b4467887` |
| Consumer harness | `b1c6cce04f1fd5ad6ffdbdc3834bf28e8c1a2144` |
| Qualification workflow | `210dec84a0677bd8d70061d443eb1f94e8272652` |
| Code fix tip on codex | `be642e819dba1d3768073d2664b776d32143a192` |
| Image ID | `sha256:d50ef3d2c02cf002433dfc48e03efdcae895f9ae3d1f6042b17bc9cfe8836b57` |
| Archive SHA-256 | `a44a81f843033f50479dad8d5dd196acc8587b9e5c31090b7794df51a680d7df` |
| Archive bytes | `1,000,632,832` |
| Effective origin | `https://builder-rehearsal.invalid` |
| Browser mode | `no-sandbox` (explicit synthetic-CI exception) |
| Customer admission | `closed` |

The producer receipt was copied unchanged. It still records
`handoffComplete: false` and `registryReference: pending`; no registry
publication occurred.

## Browser launch correction

The first continuation attempt (`45040466908`) failed on an unbound
`BROWSER_MODE`; the second (`45041603878`) reached the edge and then failed in
the journey with the historical Crashpad/SIGTRAP signature after the wrapper
prepared an NSS database in the shared builder home.

The correction:

- derives `browserMode` through a tested helper before the journey environment;
- runs a measured smoke in a fresh builder home with a fresh NSS database;
- runs the journey in a separate fresh home with the private CA installed in
  that home's NSS database;
- records `browserMode` consistently in smoke, journey, custody and retrieval
  receipts.

The final run recorded:

- workflow-level smoke: UID/GID `1000`, HOME `/home/ubuntu`, mode `no-sandbox`,
  Chromium `149.0.7827.55`, data page, screenshot, clean close;
- journey-home smoke: UID/GID `1000`, HOME
  `/tmp/ornigami-retained-qualification-45043028345-1/builder/browser-smoke-home`,
  writable home/config/cache/temp/evidence, mode `no-sandbox`, clean close;
- journey environment: fresh home
  `/tmp/ornigami-retained-qualification-45043028345-1/builder/browser-home`,
  NSS database listing `OrnigamiBuilderRehearsal C,,`, mode `no-sandbox`.

## Phase results

| Phase | Result |
| --- | --- |
| HTTPS private edge | 12/12 checks, including TLS verification, redirect, anonymous/wrong/authorized access, HSTS, CSP, unexpected host and initial SRI |
| Browser / ZIP / revocation / SRI | 32/32 checks; 1 ZIP export; 4 screenshots; 10 dynamic SRI audits with 0 issues; 10 registry entries with SHA-256; login A/B, two tabs, replay-409, revocation and sign-out cleanup |
| Edge runtime containment | 16/16 checks: image ID, source, origin, read-only root, user `1000:1000`, no published app ports, internal network, egress denied, no provider env, volume ownership/mode, loopback proxy bindings |
| Runtime / minimization / restore / rollback | 98 checks; `ok=true`; minimization applied with 2 journal events; first restore and second restore preserved records, journal/receipt history and denied access; changed-intent and changed-evidence negative cases remained blocked; lock recovery and closed rollback passed; egress blocked |
| Access closure | `final_status=0`, `cleanup_failures=0`; origin unreachable; ports 80 and 443 absent; zero remaining containers, networks and volumes; private CA removed |
| Archive retrieval | `complete=true`, `independentHandoff=true`; archive hash/size and image identity matched; image absent before load; load and identity verification passed |
| Retrieval receipt | `status=complete`, `qualificationStatus=complete`, `archiveVerification=complete`; `browserMode=no-sandbox`; customer admission closed |

The rollback receipt intentionally records `browser_journey=skipped` and
`acceptance_scope=partial`; it is combined with the separate 32-check browser
phase, and the top-level existing-image receipt records
`fullHttpsAcceptance=true` and `buildInvoked=false`.

## Runner and daemon identities

| Job | Runner | Daemon ID |
| --- | --- | --- |
| Qualification | `GitHub Actions 1000002232` | `1aa92226-258c-4db5-8d0c-78884a2760b5` |
| Fresh retrieval | `GitHub Actions 1000002233` | `1aa92226-258c-4db5-8d0c-78884a2760b5` |

The runner names are distinct. The daemon ID string is identical because the
hosted runner image ships the same Docker identity; the independence proof is
the distinct runner plus `imageAbsentBeforeLoad=true`, `freshDaemonVerified=true`
and a completed load/identity check on the retrieval job.

## Workflow starts and budget

| Workflow start | Branch | Result | Qualify / retrieval duration |
| --- | --- | --- | --- |
| `45040466908` | `ci/...-r3` | Failure: unbound `BROWSER_MODE` | 2m10s / 1m17s |
| `45041603878` | `ci/...-r4` | Failure: journey Crashpad/SIGTRAP | 2m7s / 44s |
| `45043028345` | `ci/...-r5` | Success | 3m46s / 51s |

Aggregate execution time was about 8m3s (ceiling 90 minutes); aggregate
retrieval time was about 2m52s (ceiling 15 minutes). The `r2` push produced no
qualification run because it carried no changed request file; it is preserved
but did not consume a workflow start.

Incidental quality/security runs for this continuation:

- harness `b1c6cce`: `45038399038`, `45038399073` — success;
- codex `36c9c9e`: `45039411967` success, `45039411867` failure (historical
  heredoc witness fixed in `d7a9f74`);
- codex `d7a9f74`: `45039862532`, `45039862576` — success; `r2` push:
  `45040322495`, `45040322494` — success;
- `r3` `80f77c5`: `45040466917`, `45040466910` — success;
- `r3` `34bbb50`: `45040995262`, `45040995272` — success;
- `r4` `6af8ce8`: `45041603822`, `45041603739` — success;
- `r4` `8326cd9`: `45042554823`, `45042554870` — success;
- codex `5c2aa8a`: `45041027778`, `45041027843` — success;
- codex `be642e8`: `45042584922` success, `45042585010` failure (unrelated
  PostgreSQL quota test);
- `r5` `210dec8`: `45043028321`, `45043028233` — success.

A scheduled Cron health run `45037722737` failed independently; it is not part
of this qualification.

## Custody

| Artifact | Size | Expiry (UTC) |
| --- | ---: | --- |
| `builder-retained-image-qualification-45043028345-1` | `258,566,207` B | `2026-11-29T16:21:16Z` |
| `builder-retained-image-retrieval-45043028345-1` | `2,866` B | `2026-11-29T16:22:31Z` |
| `builder-exact-rehearsal-0d68551-staged-45030190736-1` (original archive) | `256,994,265` B | `2026-11-29T14:06:24Z` |
| `builder-gate-receipt-45030190736-1` | `79,506` B | `2026-11-29T14:02:40Z` |

Local evidence is under ignored `.local/retained/run-45043028345/` with a
SHA-256 manifest, and the original archive remains at
`.local/retained/staged-run-45030190736/`. The local archive hash and size were
re-verified after the run.

## Decision

- **GO** for the retained immutable image, application source
  `156259d0c4330b185a0844711b7004b0b4467887`, consumer harness
  `b1c6cce04f1fd5ad6ffdbdc3834bf28e8c1a2144`, through the synthetic
  loopback-only private HTTPS edge.
- **GO** for archive retrieval, custody and the `no-sandbox` synthetic-CI
  browser exception in this scope.
- **NO-GO** for registry publication, public DNS/ACME, persistent deployment,
  customer admission or a default-branch merge. Those actions were not
  attempted and remain separately gated.
- The rollback phase's partial browser scope is compensated by the separate
  full browser/ZIP/revocation/SRI receipt; do not present the rollback partial
  alone as full acceptance.
