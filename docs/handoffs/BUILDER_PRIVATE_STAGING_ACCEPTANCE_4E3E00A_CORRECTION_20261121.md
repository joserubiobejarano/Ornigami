# Correction to synthetic private staging acceptance — run 44845147243

This correction accompanies, but does not overwrite, the original run evidence
on `codex/ornigami-builder-private-staging-evidence-20261121`:
`docs/handoffs/BUILDER_PRIVATE_STAGING_ACCEPTANCE_4E3E00A_20261121.md`. The run
log and local evidence under `.local/builder-private-staging-20261121/run-44845147243/`
remain historical records.

## Corrected historical summary

The original summary overstated three properties:

1. **Two different images were used.** The HTTPS/browser/runtime image was
   `sha256:f9a28737303852399ea604d569bd08c6ebc9293a75e4c01852f419f36ba40d12`.
   The restore/lock/closed-rollback wrapper invoked `qualify-linux.sh` in build
   mode and rebuilt
   `sha256:4ec0396623b49cc94ba5f3b75c4b2eafa270999b39991b30c2daf9ade9d652f`.
   Therefore the historical run did **not** prove populated restart, fresh-volume
   restore, lock recovery or closed rollback against the same image that served
   the edge/browser checks.
2. **The archive handoff was incomplete.** The image archive was created on the
   ephemeral runner, hashed as
   `9fbf72ae11f64177587c65417968a5ba5b6237475a829726edae671da2c55a56`, and did
   not survive the job. There is no retained archive or archive receipt, no load
   on a fresh daemon and no independent archive verification. The local image ID
   and archive hash are not a registry digest. The claim that the image was
   "reproducible from the exact source SHA" was not proven bit-for-bit; the two
   different rebuild IDs are direct evidence that a rebuild is not automatically
   the same image.
3. **Dynamic-chunk SRI coverage was not established.** The historical browser
   evidence retained only two audit summaries, both reporting 8 scripts with no
   issues. It did not retain script URLs, declared integrity values or observed
   hashes, and the "initial" audit was already after login. The run therefore did
   not establish whether login, generation, refresh, edit or a second tab inserted
   or removed a script/chunk. It must not be cited as dynamic-chunk coverage. A
   source search found no explicit `next/dynamic`, `React.lazy` or `dynamic()`
   imports in `builder-runtime/` or `src/`; the ordinary candidate is route
   navigation from `/` to `/builder`. The historical generation transition stayed
   at 8 scripts, but the login transition was not captured.

The historical proxy check was also substring-based (`80/tcp`/`443/tcp` present,
`3000/tcp` absent). It did not structurally reject an extra `8080`, an altered
host port, an unexpected bind address or an extra protocol.

## Implemented closure in this package

- `qualify-existing-image.sh` accepts only an immutable `sha256:<64-hex>` image
  ID or `repo@sha256:<64-hex>` reference, resolves it to the local image ID and
  verifies application source, origin, platform and user before any run resource
  is created. It then invokes the qualification harness in `IMAGE_MODE=existing`;
  the build branch is skipped and the same resolved ID is used for the packaged
  operator, browser, restart, fresh-volume restore, lock recovery and closed
  rollback. `IMAGE_VALIDATE_ONLY=1` exercises the image contract with no build or
  runtime resources.
- `build-and-retain.sh` now writes `archive-receipt.json` with separate
  application source SHA, harness SHA, image ID, origin, platform, user, archive
  path, archive SHA-256 and size. The receipt starts with
  `handoffComplete=false`.
- `verify-image-archive.mjs` checks the receipt and archive hash, requires a
  fresh daemon, loads the archive, re-inspects the exact image ID and verifies
  source, origin, platform and user. Missing archive, missing receipt, hash
  mismatch, pre-existing image or identity mismatch remains incomplete and exits
  non-zero.
- `proxy-bindings.mjs` parses `HostConfig.PortBindings` structurally. The
  approved surface is exactly `80/tcp` on host `80`, `443/tcp` on host `443` and
  `443/udp` on host `443`, with wildcard bind addresses only. Extra ports,
  protocols, host ports, addresses and duplicate bindings are rejected.
- `qualify-browser.mjs` audits scripts at the login landing page, after login,
  after initial generation, after refresh, after edit, in a second tab and for
  subject B. Each audit records URL, declared integrity, observed SHA-256,
  inserted scripts and removed scripts. A registry retains scripts that were
  inserted and later removed. `accept-browser.sh` fails if any of those records
  or hashes is missing.
- The edge, browser, runtime and rollback receipts now record the application
  source SHA, harness SHA and immutable image ID separately.

No application runtime behavior was changed. No CI run, registry publication,
archive/image publication, deployment, DNS change, real invitation or paid call
was performed by this closure.

## Reproducible evidence plan

Run these in a separately authorized staging session; each step writes a new
evidence directory.

1. **Build or select one immutable image.**
   - Build path: from a clean checkout of the exact source, run
     `build-and-retain.sh` with the approved HTTPS origin. Preserve
     `image-identity.json`, `archive-receipt.json` and the archive.
   - Existing-image path: use the already retained image ID/digest. Do not
     rebuild.
2. **Prove the archive handoff.** On a fresh/isolated daemon, run
   `verify-image-archive.mjs` with the archive, receipt and expected source,
   image ID, origin, platform and user. Require `complete=true`; otherwise the
   handoff remains incomplete.
3. **Qualify the same image.** Run `qualify-existing-image.sh` with the image ID
   from step 1/2, browser enabled, and a new evidence directory. Require
   `image_mode=existing`, `image_id=<same ID>`, `application_source_sha`,
   `harness_sha`, operator/browser/restart/restore/lock/closed checks and one
   identity summary. Assert no `build` call occurred.
4. **Edge acceptance.** Run `accept-edge.mjs` against the authorized origin with
   the same `EXPECTED_IMAGE_ID`, `EXPECTED_SOURCE_SHA` and `HARNESS_SHA`. Preserve
   `edge-results.json` and `edge-sri-scripts.json`.
5. **Live runtime/proxy acceptance.** Run `accept-runtime.sh` with the same image
   ID. Preserve `checks.tsv` and `proxy-bindings.json`. Negative fixtures for
   `8080`, altered host ports, unexpected addresses and unexpected protocols are
   covered by the focused regression test.
6. **Partial runtime/restore/lock/closed receipt.** Run
   `accept-runtime-rollback.sh` with `IMAGE_MODE=existing` and the same
   `EXPECTED_IMAGE_ID`. Require the partial markers and the same image ID. If a
   separate full browser shell is used, keep its receipt separate.
7. **Reconcile identities.** Compare every receipt's application source SHA,
   harness SHA and image ID. The source SHA and image ID must match across phases;
   the harness SHA may differ only when the harness changed and must be recorded
   explicitly. Do not substitute an Actions artifact digest, local image ID,
   mutable tag or rebuilt image for the accepted image ID.

## Remaining gates

- Public DNS, public ACME TLS, a dedicated public VPS route and registry
  publication remain untested and unauthorized.
- The historical archive was not retained. A new archive must be copied into
  approved custody, verified on a fresh/isolated daemon and recorded with its
  receipt before the handoff is complete.
- A fresh authorized Linux runner must execute the updated existing-image and
  browser phases. The historical run cannot be upgraded by documentation alone.
- Dynamic-chunk coverage exists only when the updated browser evidence records
  the actual inserted/removed URLs and hashes for ordinary interactions. If no
  additional scripts are inserted, state that result precisely rather than
  claiming chunk coverage.
- Real-customer admission remains NO-GO: customer retention/deletion, encrypted
  off-host backup and key custody, deletion-journal replay, support routing,
  customer-notice acceptance and permanent framework maintenance remain open.
- No further paid calls, real invitations, deployments, DNS changes or external
  publications are authorized by this correction.
