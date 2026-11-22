# Retained-image qualification, 22 November 2026

> **Historical failure record.** This attempt (`45034113780`) was superseded by
> the successful retained-image qualification in run `45043028345`. Preserve
> this record as failure evidence; do not repeat its next-step recommendation
> for the unchanged image. See
> [the accepted result](./BUILDER_RETAINED_IMAGE_QUALIFICATION_20261122_R2.md).

This record covers the browser diagnosis, retained-archive verification and
single retained-image qualification attempt for run `45030190736`. It is a
failure record, not a qualification receipt.

## Identities

| Item | Value |
| --- | --- |
| Application source | `156259d0c4330b185a0844711b7004b0b4467887` |
| Original archive-producing harness | `156259d0c4330b185a0844711b7004b0b4467887` |
| Current consumer harness | `6ef785961d3f5c6084650ee9a119b78943a598e6` |
| Qualification workflow SHA | `e3d8a1d1844cd647d1d63f7e6185c185e33b9911` |
| Code fixes landed on codex at | `d0ffbe5e4a1e17bd352746d0e644fae121e32852` |
| Retained image | `sha256:d50ef3d2c02cf002433dfc48e03efdcae895f9ae3d1f6042b17bc9cfe8836b57` |
| Retained archive | `a44a81f843033f50479dad8d5dd196acc8587b9e5c31090b7794df51a680d7df` |
| Archive size | `1,000,632,832` bytes |
| Effective origin | `https://builder-rehearsal.invalid` |
| Browser mode | `no-sandbox` (explicit synthetic-CI exception) |

The producer receipt was copied unchanged. It still records `handoffComplete:
false` and `archiveVerifiedOnFreshDaemon: false`; the independent retrieval
result below is separate evidence and does not rewrite that receipt.

## Browser diagnosis

The exact pinned Playwright Chromium was launched as the builder identity
(UID/GID `1000`, HOME `/home/ubuntu`) without building or serving the
application.

| Run | Result | Observed cause |
| --- | --- | --- |
| `45032704154` | Failed before launch | The smoke evidence directory was under a runner-owned `0700` parent; the builder could not traverse it. |
| `45032884714` | Passed | Chromium `149.0.7827.55`; data-page evaluation, screenshot and clean shutdown passed; temp and evidence directories writable; effective mode `no-sandbox`. |

The qualification workflow repeated the smoke before the journey under the same
builder user and browser configuration. That smoke also passed (`ok: true`,
UID/GID `1000`, `no-sandbox`, Chromium `149.0.7827.55`). The later qualification
failure was not a browser-launch failure.

## Archive verification

The retained archive was retrieved and verified independently of qualification:

- Local retained copy: hash and size matched the constants above.
- Qualification runner: `docker load` succeeded, the loaded image ID matched,
  and `image-identity.mjs` confirmed source, origin, platform and user.
- Fresh retrieval runner: `verify-image-archive.mjs` returned `ok: true`,
  `complete: true`, `independentHandoff: true`; the image was absent before
  load, the load succeeded, and all identity checks passed.

The retrieval job then failed while writing its receipt because a nested
heredoc terminator was indented. No retrieval receipt artifact was uploaded, so
the verification above remains a successful step result, not a completed
retrieval receipt.

## Qualification attempt

Run `45034113780` was the single qualification start (two jobs: qualification
and fresh retrieval). The qualification job stopped at 2m28s, before any
edge/browser/runtime/rollback acceptance phase:

```
==> Pull pinned temporary edge and generate private access
... Caddy image pulled successfully ...
run-retained-image-qualification-linux.sh: line 243:
  /tmp/.../builder/edge/caddy-digests.json: No such file or directory
final_status=1
cleanup_failures=0
reason=preserved_primary_failure
```

The wrapper had not created `$EVIDENCE_ROOT/edge` before writing the Caddy
digest file. No nested qualification receipt exists. The job preserved the
archive, producer receipt, image inspection, image identity verification,
browser-smoke evidence and failure logs.

Closure passed: `origin_unreachable=1`, ports 80/443 absent, zero remaining
containers/networks/volumes, private CA removed, and cleanup exit `0`.

## Fixes after the attempt

- `b22d73d`: create the `edge` evidence root before first use; close the
  retrieval heredoc at the YAML block indentation.
- `93f4ba4`: document the retained-archive wrapper.
- `d0ffbe5`: export `host.txt` and `cleanup-receipt.txt` even when
  qualification fails.

These fixes were tested locally. The qualification attempt was not retried.

## Workflow start ledger

| Workflow | Run | Result |
| --- | --- | --- |
| Browser smoke #1 | `45032704154` | Failure (evidence-directory setup) |
| Browser smoke #2 | `45032884714` | Success |
| Retained-image qualification | `45034113780` | Failure (missing edge directory) |
| Incidental Quality/Security on pushed SHAs | `45032690084`, `45032690113`, `45032704058`, `45032704073`, `45032871592`, `45032871597`, `45032884712`, `45032884728`, `45034113675`, `45034113686`, `45034771816`, `45034771786`, `45034927128`, `45034927040` | Recorded; not qualification authority. Later documentation pushes may add more incidental runs. |

## Custody

| Artifact | Size | Expiry (UTC) |
| --- | --- | --- |
| `builder-exact-rehearsal-0d68551-staged-45030190736-1` (original archive) | `256,994,265` B | `2026-11-29T14:06:24Z` |
| `builder-gate-receipt-45030190736-1` | `79,506` B | `2026-11-29T14:02:40Z` |
| `builder-retained-image-qualification-45034113780-1` (archive + failure evidence) | `256,789,416` B | `2026-11-29T14:42:48Z` |
| `builder-browser-smoke-45032884714-1` | `3,403` B | `2026-11-29T14:28:07Z` |
| `builder-browser-smoke-45032704154-1` | `1,504` B | `2026-11-29T14:26:06Z` |

Local copies are under ignored `.local/retained/staged-run-45030190736/` and
`.local/retained/run-45034113780/`. The latter contains the log-extracted
independent verification, browser smoke, image identity, closure proof and
hashes; it is not a generated retrieval receipt.

## Decision

- Browser launch diagnosis: **GO** for the proven synthetic-CI environment.
- Archive hash, size and image identity: **GO**; independent load verified.
- Retained-image qualification: **NO-GO**. No acceptance phases ran and no
  qualification receipt exists.
- Retrieval receipt upload: **incomplete**; do not represent the step result as
  a receipt.
- Customer admission: **closed**.
- Registry publication, public DNS/ACME, persistent deployment and
  default-branch merge: not attempted.

The missing edge evidence directory was fixed in `d0ffbe5`. This attempt is
historical: the unchanged image was later accepted in run `45043028345`. Do not
retry this failed attempt or rebuild the unchanged image.
