# Builder qualification custody index — 22 November 2026

Status: **synthetic evidence only; owner-held custody is pending.** This index
does not authorize deletion, retention extension, registry publication or
upload to another service.

## Accepted artifact

| Item | Value |
| --- | --- |
| Qualification run | `45043028345` |
| Application source | `156259d0c4330b185a0844711b7004b0b4467887` |
| Producer harness | `156259d0c4330b185a0844711b7004b0b4467887` |
| Consumer harness checkout | `b1c6cce04f1fd5ad6ffdbdc3834bf28e8c1a2144` |
| Workflow SHA | `210dec84a0677bd8d70061d443eb1f94e8272652` |
| Image | `sha256:d50ef3d2c02cf002433dfc48e03efdcae895f9ae3d1f6042b17bc9cfe8836b57` |
| Archive | `ornigami-builder-156259d0c433.tar` |
| Archive SHA-256 | `a44a81f843033f50479dad8d5dd196acc8587b9e5c31090b7794df51a680d7df` |
| Archive bytes | `1,000,632,832` |
| Effective origin | `https://builder-rehearsal.invalid` |
| Browser mode | `no-sandbox` (synthetic-CI exception) |
| Qualification result | complete for the synthetic private HTTPS edge |
| Customer admission | closed |

## GitHub artifact custody

| Artifact | Size | Expires (UTC) | Evidence |
| --- | ---: | --- | --- |
| `builder-retained-image-qualification-45043028345-1` | `258,566,207` B | `2026-11-29T16:21:16Z` | Archive, custody receipt, nested edge/browser/runtime/rollback receipts and failure-free closure |
| `builder-retained-image-retrieval-45043028345-1` | `2,866` B | `2026-11-29T16:22:31Z` | Independent fresh-runner archive verification and retrieval receipt |
| `builder-exact-rehearsal-0d68551-staged-45030190736-1` | `256,994,265` B | `2026-11-29T14:06:24Z` | Original archive and producer receipt |
| `builder-gate-receipt-45030190736-1` | `79,506` B | `2026-11-29T14:02:40Z` | Original candidate gate receipt |

The latest qualification artifact expiry is **2026-11-29T16:21:16Z**. The
original archive expires earlier, at **2026-11-29T14:06:24Z**.

## Local copies

These are in the preserved control-plane worktree, not in a durable owner
archive:

- `C:/Users/joser/.local/ornigami-gate-contract-20261122/.local/retained/staged-run-45030190736/`
  — original archive, producer receipt and gate evidence.
- `C:/Users/joser/.local/ornigami-gate-contract-20261122/.local/retained/run-45043028345/`
  — custody receipt, nested qualification summary, browser/edge/runtime/rollback
  summaries, retrieval receipt, archive-verification receipt, closure proof,
  `SHA256SUMS`.
- `C:/Users/joser/.local/ornigami-gate-contract-20261122/.local/retained/run-45034113780/`
  — preserved earlier failure evidence; not qualification success evidence.

The local archive hash and size were re-verified as the values in the table
above.

## Retrieval proof

`builder-retained-image-retrieval-45043028345-1/retrieval-receipt.json` records:

- `status=complete`, `retrievalStatus=complete`, `archiveVerification=complete`
- `qualificationStatus=complete`
- `producerHarnessSha=156259d...`, `consumerHarnessSha=b1c6cce...`
- `freshDaemonId=1aa92226-258c-4db5-8d0c-78884a2760b5`
- `qualificationDaemonId=1aa92226-258c-4db5-8d0c-78884a2760b5`
- `customerAdmission=closed`

The qualification and retrieval runners were distinct (`GitHub Actions
1000002232` and `1000002233`). The daemon ID string is identical because the
hosted runner image carries the same Docker identity; `imageAbsentBeforeLoad`
and `freshDaemonVerified` are the independence checks.

## Owner-held custody required before expiry

Before **2026-11-29T16:21:16Z**, the owner must designate an approved
owner-controlled destination and decide whether to copy:

1. the original archive and producer/gate receipts;
2. the qualification custody artifact (`258,566,207` B);
3. the independent retrieval artifact and receipt;
4. the local `SHA256SUMS`-verified evidence set.

No copy, deletion, retention extension or alternate upload was performed in
this session. These actions require explicit owner authority. The local copies
are not a substitute for durable owner custody.

## Limits

- The archive/image is qualified only for the synthetic loopback private edge
  and the explicit `no-sandbox` CI browser exception.
- The producer receipt still records `handoffComplete=false` and
  `registryReference=pending`; there is no registry publication or independent
  pull proof.
- The rollback phase intentionally skips the browser (`browser_journey=skipped`)
  and is paired with the separate 32-check browser receipt.
- Customer admission, persistent hosting, public DNS/ACME and default-branch
  merge remain closed.
