# Exact-candidate synthetic Linux rehearsal — 43e2691 approval bundle

Date: 21 November 2026
Candidate: `43e2691e7d347d6e48e0ed65c0a828567b24c7a3`
Status: **bundle prepared locally. No workflow was dispatched, no image was
built, no artifact was uploaded, no edge was started and no external action was
taken. Customer admission remains closed.**

## Authorization reconciliation

| Role/input | Existing fact | Authority conclusion |
| --- | --- | --- |
| Operator | Local Windows agent/user; no Docker or Podman installed | Can prepare files and run static checks only |
| Repository access | `gh` is authenticated to `joserubiobejarano/Ornigami` with `repo` and `workflow` scopes | Capability, not approval for a new dispatch/build/publi­cation |
| Candidate reachability | `43e2691` is **not** on `origin` | A bundle-branch push is required to make the exact SHA fetchable |
| Runner | GitHub-hosted `ubuntu-24.04` is the only observed Linux runner path | One new run requires explicit approval |
| Build daemon | No local daemon; proposed Docker-in-Docker service on the hosted runner | Requires approval to start/pull images |
| Verification/phase daemon | Host runner Docker daemon (fresh before archive load) | Requires approval |
| Temporary HTTPS edge | No running edge; Caddy private-CA pattern exists in prior evidence | Requires approval for temporary local-CA edge |
| Archive custody | No private custody destination is established | Approval must cover the proposed artifact destination or provide a private one |
| Prior successful staging run | `44845147243` succeeded for an older source, but its archive was ephemeral and not retained | Historical evidence only; not authority or acceptance for `43e2691` |

Configuration scopes, prior flags and old successful runs are not treated as
current authorization.

## Proposed topology

- **Runner/operator:** one GitHub-hosted `ubuntu-24.04` runner in
  `joserubiobejarano/Ornigami`, operated by the repository owner.
- **Build daemon:** `docker:27-dind` service on the same runner, exposed only at
  `tcp://127.0.0.1:2375`. Its observed daemon ID must differ from the host daemon.
- **Verification/phase daemon:** the runner's host Docker daemon. It starts with
  no candidate image, loads the retained archive, and is then used for the edge,
  browser, runtime/restore and closed-rollback phases.
- **Helper bind mount:** the host daemon must see
  `<SOURCE_ROOT>/deploy/builder` mounted read-only at `/app/qualify`. The bundle
  checks this with the built image before qualification. Docker-in-Docker only
  receives the build context; it is not used for helper bind mounts or phases.
- **Temporary edge:** pinned `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`,
  `tls internal`, BasicAuth with a generated synthetic password, host mapping
  `127.0.0.1 builder-rehearsal.invalid`, ports 80/443 bound only on the ephemeral
  runner. The Caddy CA is installed into the runner trust store and Chromium NSS.
- **Effective origin:** `https://builder-rehearsal.invalid`. Public DNS, ACME,
  VPS routing and public certificate acceptance remain untested and unauthorized.
- **Archive custody:** GitHub Actions artifact
  `builder-exact-rehearsal-43e2691-<run>-<attempt>` in the same repository,
  retention 7 days. It contains only the synthetic image archive, receipts and
  sanitized evidence. A second job downloads it on a fresh runner, independently
  loads/verifies it, and uploads a retrieval receipt.
  - Access: repository artifact access. If repository artifact visibility is not
    acceptable, the owner must provide a private custody destination/key before
    approval; the bundle will not upload until then.
- **Source fetch:** push this bundle branch (which contains `43e2691` as an
  ancestor) to `origin`; the workflow fetches the exact SHA by object ID, checks
  clean HEAD, verifies both required tips are ancestors and runs the candidate
  harness at that SHA.

## Execution bundle

- `.github/workflows/builder-exact-rehearsal-43e2691.yml`
- `.github/build-requests/builder-exact-rehearsal-43e2691.json`
- `deploy/builder/private-staging/run-exact-rehearsal-linux.sh`
- candidate scripts at `43e2691`, including
  `deploy/builder/private-staging/rehearse-exact-candidate.sh`

The workflow performs:

1. clean supported Node `22.23.3` / vendored npm `11.21.1` install;
2. full suite, TypeScript, lint, security audit and security tests;
3. `ACTION=checkpoint` with the DIND build daemon and host verifier;
4. archive/receipt retention and helper bind-mount check;
5. temporary private-CA Caddy edge with the checkpoint image ID;
6. `ACTION=qualify` through edge, browser/ZIP/revocation, runtime, restart,
   minimisation, both journal negative cases, second restore, lock recovery and
   closed rollback;
7. access closure and owned-resource absence receipts;
8. archive/evidence artifact upload and separate retrieval/load verification.

Test seams, stubs and live providers are disabled for the executed path. The
candidate tree is not modified during the run.

## Resource and storage budget

| Item | Limit |
| --- | --- |
| Dispatches/attempts | 1 / 1 |
| Execute job | 90 minutes |
| Retrieval job | 15 minutes |
| Total runner time requested | 105 minutes |
| Retained archive | 3 GiB maximum |
| Total uploaded artifacts | 3.5 GiB maximum |
| Artifact retention | 7 days |
| Registry publication | none |
| Public DNS/ACME/VPS deployment | none |

Cleanup removes only run-owned containers, networks, volumes, host mapping and
CA. The archive and evidence artifact must exist before cleanup is considered
complete; failed attempts are preserved in the same artifact path.

## Approval request

Approve exactly these external actions for candidate
`43e2691e7d347d6e48e0ed65c0a828567b24c7a3`:

1. push this bundle branch to `origin`, making the exact candidate SHA fetchable;
2. allow the push-triggered workflow to start one GitHub-hosted `ubuntu-24.04`
   run (one attempt);
3. allow pulling the pinned base/build/Caddy images needed by the workflow;
4. allow one temporary private-CA HTTPS edge on that ephemeral runner with the
   hostname mapping above;
5. allow upload/download of the synthetic archive and evidence to the stated
   same-repository Actions artifact for 7 days, including retrieval verification.

No real invitation, customer data, paid provider call, registry publication,
public DNS change, persistent deployment or customer admission is requested.

**Customer admission remains closed.**
