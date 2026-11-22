# Exact-candidate synthetic Linux rehearsal — 43e2691 repaired approval bundle

Date: 22 November 2026
Candidate: `43e2691e7d347d6e48e0ed65c0a828567b24c7a3`
Bundle base: `588aa66856cc68a903e6b63510ec40cfa2f8322a`
Repaired execution bundle: `d916ff2d1e270217703df4a96c361fff26a41265`
Status: **bundle repaired locally. No workflow was dispatched, no image was
built, no artifact was uploaded, no edge was started and no external action was
taken. Customer admission remains closed.**

Application source and harness remain unchanged at
`43e2691e7d347d6e48e0ed65c0a828567b24c7a3`.

## Reviewed defects and repairs

| Defect | Repair |
| --- | --- |
| Initial publication did not schedule | Job now requires the initial branch-creation push (`created=true`, before all-zero), exact branch, attempt 1. The event gate script verifies the same rule. Trigger is exactly one branch creation; later pushes do not schedule. |
| Rehearsal directory pre-created | Workflow creates only `EVIDENCE_ROOT`; runner creates only the parent of `REHEARSAL_DIR`. The candidate's `ACTION=checkpoint` creates `REHEARSAL_DIR` itself. |
| Mutable control/retrieval checkout | Both control-plane and retrieval checkouts use `${{ github.sha }}`; each verifies `HEAD == WORKFLOW_SHA`. Candidate source uses an authenticated `actions/checkout` at the exact `SOURCE_SHA` with `persist-credentials: false`. |
| Closed-mode and cleanup results not enforced | Closed HTTP is asserted as home `200`, builder `404`, session `401`. Cleanup removes and verifies only positively labelled owned resources. Remaining resources or failed cleanup checks make a successful run fail; an earlier primary failure is preserved. |
| Upload budgets not enforced | Every archive copy counts toward `maxArchiveBytes`; the complete upload set plus receipt reserve counts toward `maxArtifactBytes`. On overflow, only a bounded diagnostic copy without archives is prepared and uploaded. Retrieval evidence has its own upload limit. |
| DinD/Caddy exposure | DinD is pinned to `docker:27-dind@sha256:aa3df78ecf320f5fafdce71c659f1629e96e9de0968305fe1de670e0ca9176ce`, with API published only on `127.0.0.1:2375`. Runtime asserts the listener is loopback-only. Generated Caddy Compose ports are rewritten to `127.0.0.1:80:80`, `127.0.0.1:443:443` and `127.0.0.1:443:443/udp`, then asserted. |
| Exact-source retrieval credentials | Removed manual `git init`/`git fetch`. The candidate is retrieved with the authenticated checkout action at the exact SHA; control-plane and candidate identities are verified separately. |

## Proposed topology

- **Runner/operator:** one GitHub-hosted `ubuntu-24.04` runner in
  `joserubiobejarano/Ornigami`, operated by the repository owner.
- **Build daemon:** pinned `docker:27-dind` service exposed only at
  `tcp://127.0.0.1:2375`.
- **Verification/phase daemon:** host runner Docker daemon. Observed daemon IDs
  must differ.
- **Helper bind mount:** host daemon must see
  `<SOURCE_ROOT>/deploy/builder` read-only at `/app/qualify`; checked with the
  built image before qualification.
- **Temporary edge:** pinned Caddy image with internal CA, synthetic BasicAuth,
  host mapping `127.0.0.1 builder-rehearsal.invalid`, and loopback-only host
  bindings for ports 80/443.
- **Effective origin:** `https://builder-rehearsal.invalid`. Public DNS, ACME,
  VPS routing and public certificate acceptance remain untested and unauthorized.
- **Archive custody:** same-repository GitHub Actions artifact
  `builder-exact-rehearsal-43e2691-<run>-<attempt>`, retention 7 days. A separate
  fresh-runner job downloads it and independently loads/verifies the archive.
  If repository artifact visibility is unacceptable, a private custody
  destination/key must be supplied before approval.

## Trigger procedure

1. Create the remote branch
   `ci/builder-exact-rehearsal-43e2691-20261121` **once** at the final bundle tip
   containing the request file and workflow.
2. The initial branch-creation push is the only trigger. Do not push a second
   request commit and do not reuse an existing branch.
3. If the branch already exists, stop; use a new reviewed bundle/branch name
   rather than an undocumented second push.

## Execution sequence

1. Verify control-plane SHA, initial-creation event, exact source SHA, clean tree,
   harness SHA and both required tip ancestries.
2. Clean Node `22.23.3` / vendored npm `11.21.1` install.
3. Full suite, TypeScript, lint, security audit and security tests.
4. `ACTION=checkpoint`: build once, retain archive/receipt, independently verify,
   stop at `edge-setup`.
5. Start loopback-only temporary private-CA Caddy edge with the checkpoint image ID.
6. `ACTION=qualify`: same immutable image through edge, browser/ZIP/revocation,
   runtime, restart, minimisation, both journal negatives, second restore, lock
   recovery and closed rollback.
7. Close access; fail unless owned resources are absent and required closure checks pass.
8. Upload archive/evidence only within budget; retrieve on a fresh runner and
   independently verify the archive and identity.

## Resource and custody budget

| Item | Limit |
| --- | --- |
| Dispatches/attempts | 1 / 1 |
| Execute job | 90 minutes |
| Retrieval job | 15 minutes |
| Retained archive | 3 GiB maximum |
| Total artifact bytes | 3.5 GiB maximum |
| Bounded diagnostic fallback | 64 MiB maximum |
| Retrieval artifact | 64 MiB maximum |
| Artifact retention | 7 days |
| Registry/public deployment | none |

**Custody expiry:** the archive/evidence artifact expires **7 days after the
run**. Before expiry, the owner must decide to download it into approved private
custody or explicitly extend retention. Expiry leaves no retained rehearsal
archive; there is no automatic extension.

## Approval request

Approve exactly these external actions for
`43e2691e7d347d6e48e0ed65c0a828567b24c7a3`:

1. create/push the dedicated branch once at the final repaired bundle tip,
   making the exact candidate SHA fetchable and scheduling exactly one run;
2. allow one GitHub-hosted `ubuntu-24.04` execution and one retrieval job;
3. allow pulling the pinned build/base/Caddy/DinD images required by the workflow;
4. allow one temporary private-CA HTTPS edge with loopback-only bindings and the
   stated hostname mapping;
5. allow upload/download of the synthetic archive and evidence to the stated
   same-repository Actions artifact for 7 days, including retrieval verification.

No real invitation, customer data, paid provider call, registry publication,
public DNS change, persistent deployment or customer admission is requested.
No execution evidence is claimed.

**Customer admission remains closed.**
