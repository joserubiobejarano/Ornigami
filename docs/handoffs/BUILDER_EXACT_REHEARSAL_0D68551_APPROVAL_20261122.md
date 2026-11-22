# Exact-candidate synthetic Linux rehearsal — 0d68551 repaired approval bundle

Date: 22 November 2026
Candidate and harness: `0d68551324ce3f441478f613d2f4eb48b9be4f3f`
Preserved historical baseline: `43e2691e7d347d6e48e0ed65c0a828567b24c7a3`
Repaired execution bundle: `170c5cc69864d079f4c2a6b20bdc8406c11df9dc`
Proposed trigger branch: `ci/builder-exact-rehearsal-0d68551-20261122`
Status: **bundle repaired locally. No workflow was dispatched, no image was
built, no artifact was uploaded, no edge was started and no external action was
taken. Customer admission remains closed.**

## Why the previous attempt failed

Run `44973330432` (bundle `b77ed1b5`, candidate `43e2691`) failed at
`mkdir -p "$EVIDENCE_ROOT/logs": Permission denied`. The builder-owned evidence
root was `0755`, so the runner could not create its own log directory inside it.
The fallback diagnostics then copied the failed directory without a bound, the
custody upload was skipped, and the final gate reported `FAIL: custody upload is
incomplete`. The candidate and the preserved historical baseline are unchanged
and are not patched during execution.

## Candidate and harness change

The Caddy acceptance validator required wildcard bind addresses while the
rehearsal publishes only `127.0.0.1`. Fixing the caller alone would either
weaken the wildcard check or expose the edge. The harness therefore gains an
explicit `loopback` profile next to the existing strict `wildcard` profile:

| Profile | Container ports | Host ports | Accepted addresses |
| --- | --- | --- | --- |
| `wildcard` (default; existing scope) | exactly `80/tcp`, `443/tcp`, `443/udp` | `80`, `443`, `443` | empty, `0.0.0.0`, `::` |
| `loopback` (this rehearsal) | exactly `80/tcp`, `443/tcp`, `443/udp` | `80`, `443`, `443` | `127.0.0.1`, `::1` only |

Extra container ports (including `8080`), changed host ports, wrong addresses,
duplicate bindings and mixtures of profiles are rejected. The profile is chosen
explicitly by the caller, forwarded through
`run-exact-rehearsal-linux.sh` → `rehearse-exact-candidate.sh` →
`qualify-existing-image.sh`, validated by the real
`proxy-bindings.mjs`, and recorded in `checks.tsv`, `results.txt`,
`identity.json`, `proxy-bindings.json` and
`edge/proxy-binding-profile.txt`.

The new harness/candidate is
`0d68551324ce3f441478f613d2f4eb48b9be4f3f` (parent `43e2691`). Its focused
private-staging suite passed 15/15 locally. `43e2691` remains the historical
baseline and is never modified.

## Ownership matrix

The runner and a distinct UID-1000 builder share no writable directory. The
live identity store keeps `0700/0600`; nothing is made world-writable and no
`chmod 777` is used anywhere.

| Path / object | Owner:group | Mode | Written by | Read by | Upload treatment |
| --- | --- | --- | --- | --- | --- |
| `/tmp/ornigami-exact-rehearsal-0d68551` (evidence parent) | runner | `0755` | runner install | runner; builder only traverses | not uploaded directly |
| Emergency root `/tmp/ornigami-exact-rehearsal-emergency-0d68551-<run>-<attempt>` | runner | `0700` | first workflow step, before checkout or builder setup | runner | not uploaded directly |
| Runner logs (`emergency/logs`) | runner | `0700` | runner steps, `tee`, preflight | runner | copied into bounded upload/diagnostics by the runner |
| Runner diagnostics (`emergency/diagnostics`) | runner | `0700` | runner | runner | diagnostics artifact path |
| Runner receipts (`emergency/receipts`) | runner | `0700` | runner | runner | not uploaded (control records) |
| Builder evidence root (`.../builder`) | builder | `0700` | builder | builder only; runner direct read denied by preflight | never uploaded directly |
| `REHEARSAL_DIR` (`.../builder/rehearsal`) | builder | builder root policy | candidate `ACTION=checkpoint` (absent before) | builder | selected files exported |
| Builder secrets (`.../builder/secrets`) | builder | dir `0700`, files `0600` | builder | builder | never exported; deleted on cleanup |
| Approved export staging (`.../staging`) | builder:runner | `2770` setgid | builder allowlisted export | runner | sole source of approved builder evidence |
| Exported files under staging | builder:runner | files `0640`, dirs `0750` | builder export | runner | bounded upload staging |
| Runner upload staging (`.../upload`) | runner | `0700` | runner staging script | runner | custody artifact |
| Staging and budget receipts | runner | runner-only | runner helpers | runner | bounded diagnostic copy only |
| Live identity store preflight | builder | root `0700`, file `0600` | builder | builder only; runner direct read denied | not uploaded |
| GitHub Actions artifact | repository artifact store | n/a | runner `upload-artifact` | retrieval job | retained 7 days |

Every workflow step, shell redirection, `tee`, budget helper and upload reader
uses one of these roots. Builder output reaches the runner only through
`EXPORT_STAGING`; the runner never reads `BUILDER_EVIDENCE_ROOT` directly.

## Reviewed defects and repairs

| Defect | Repair |
| --- | --- |
| Builder-owned evidence root blocked runner logs and diagnostics | Runner owns the evidence parent, logs, diagnostics, emergencies and upload staging; the builder writes only its own `0700` root. Approved evidence crosses the boundary through `EXPORT_STAGING` (`2770`, exported files `0640`). |
| Diagnostics depended on the failed evidence directory and copied without a bound | A runner-owned emergency root is created in the first workflow step, before checkout, builder setup, dependencies, or the rehearsal script. On overflow the runner rebuilds diagnostics from runner-owned logs only, appends bounded receipts, and runs a final size enforcement after every copy/append. The unbounded `cp -a` fallback is removed. |
| Loopback Compose bindings failed the wildcard-only validator | Explicit `wildcard`/`loopback` profiles in the real validator, selected by the caller and recorded in evidence. Generated Compose bindings are extracted and passed through the real validator with `--profile loopback` before the edge starts. |
| Archive and total-upload limits were checked before all copies | Archives are copied first; every copy counts toward the archive and total limits; diagnostics are bounded during the copy and re-measured on the final upload directory before `upload-artifact`. |
| POSIX ownership was only tested on Windows/Git Bash | A lightweight Linux preflight runs before Node install, dependency install, full suites or image build. It exercises the actual users, modes and profile validator. |

## Linux-boundary verification

`verify-linux-ownership.sh` runs before any installation or image work, and
its output is logged. It proves:

- the runner user differs from the distinct UID-1000 builder and is not the same
  account;
- the builder can write its own evidence root and store, but the runner cannot
  read them directly;
- the builder can write an exported file into the approved staging area, the
  runner can read it, and the file mode is `0640`;
- the builder cannot read runner logs or runner upload staging;
- `0700/0600` live-store modes are preserved;
- the loopback and wildcard profiles validate through the real validator, and
  each rejects the other profile's addresses.

During the run, generated Compose port bindings are extracted and validated
with `--profile loopback`, and selected loopback addresses are asserted on the
live listeners. The workflow also proves that an early setup failure still
produces a non-empty, bounded emergency diagnostics artifact from
runner-owned logs, and that oversized logs stay bounded after the complete
fallback sequence.

These checks cannot be proven on Windows/Git Bash; the local suite verifies the
scripts, bounds, profile validator and workflow ordering, and the Linux
preflight proves the POSIX boundary on the next authorized attempt.

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
  host mapping `127.0.0.1 builder-rehearsal.invalid`, and the explicit loopback
  profile (`127.0.0.1:80:80`, `127.0.0.1:443:443`,
  `127.0.0.1:443:443/udp`).
- **Effective origin:** `https://builder-rehearsal.invalid`. Public DNS, ACME,
  VPS routing and public certificate acceptance remain untested and unauthorized.
- **Builder privilege:** the rehearsal requires the UID-1000 builder to have
  passwordless `sudo` for the temporary edge host mapping, private-CA trust
  update and its own cleanup. Runner logs and upload staging are still
  mode-restricted and the preflight checks direct reads without elevation.
- **Archive custody:** same-repository GitHub Actions artifact
  `builder-exact-rehearsal-0d68551-<run>-<attempt>`, retention 7 days. A separate
  fresh-runner job downloads it and independently loads/verifies the archive.
  If repository artifact visibility is unacceptable, a private custody
  destination/key must be supplied before approval.

## Trigger procedure

1. Create the remote branch `ci/builder-exact-rehearsal-0d68551-20261122`
   **once** at the final documentation tip (child of
   `170c5cc69864d079f4c2a6b20bdc8406c11df9dc`) containing the request file and
   workflow. The branch must not already exist locally or remotely.
2. The initial branch-creation push is the only trigger. Do not push a second
   request commit and do not reuse an existing branch.
3. If the branch already exists, stop; use a new reviewed bundle/branch name
   rather than an undocumented second push.

## Execution sequence

1. Create the runner-owned emergency root and identity record.
2. Verify control-plane SHA, initial-creation event, exact source SHA, clean
   tree, harness SHA and both required tip ancestries.
3. Create the distinct UID-1000 builder, runner-owned evidence parent, builder
   `0700` evidence root, `2770` export staging and `0700` upload staging.
4. Run the Linux ownership/profile preflight before installation.
5. Clean Node `22.23.3` / vendored npm `11.21.1` install, then install Linux
   test/browser prerequisites.
6. Run the builder wrapper: full suite, TypeScript, lint, security audit and
   security tests.
7. `ACTION=checkpoint`: build once, retain archive/receipt, independently verify,
   stop at `edge-setup`.
8. Start the loopback-only temporary private-CA Caddy edge with the checkpoint
   image ID; validate generated Compose bindings with the real loopback profile.
9. `ACTION=qualify`: same immutable image through edge, browser/ZIP/revocation,
   runtime, restart, minimisation, both journal negatives, second restore, lock
   recovery and closed rollback.
10. Close access; fail unless owned resources are absent and required closure
    checks pass.
11. Export approved evidence to runner-owned staging, enforce archive, total and
    diagnostic budgets on the final directory, upload within budget, and
    independently retrieve/verify the archive on a fresh runner.

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
`0d68551324ce3f441478f613d2f4eb48b9be4f3f`, using execution bundle
`170c5cc69864d079f4c2a6b20bdc8406c11df9dc` and one new unused branch:

1. create/push `ci/builder-exact-rehearsal-0d68551-20261122` once at the final
   documentation tip, making the exact candidate SHA fetchable and scheduling
   exactly one run;
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
