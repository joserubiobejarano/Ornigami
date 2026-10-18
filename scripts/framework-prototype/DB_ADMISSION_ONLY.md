# Dedicated frozen DB admission diagnostic

This workflow is locally prepared, **not registered, published or authorized to run**. It does not establish image, security, runtime, framework-adoption or release acceptance. Historical failed scans and incomplete artifacts remain evidence, not corrected results.

## Publication and request protocol (future separate approval)

Workflow: `.github/workflows/ornigami-db-admission-only.yml`. The only push trigger is branch `codex/ornigami-sri-local-prototype-f-20261016` and path `.github/build-requests/ornigami-db-admission.json`. There is no dispatch/default-branch dependency, PR trigger or scheduled trigger. The local implementation branch is not the publication target.

Before any future publication, freshly verify Vercel/Netlify/Coolify/other integration holds, watchers, active operations, exact candidate/package/lock/workflow identities, no competing trial and included public GitHub Actions/artifact capacity. Existing recorded holds are not fresh proof. Stop on uncertainty or drift. Keep QR staging untouched.

1. Publish only the approved candidate to the existing restricted branch, without force and without either request-marker change. Confirm no unintended workflow/build/deployment started. CI/security already exclude this branch; the full image workflow watches only the unchanged `.github/build-requests/ornigami.json`.
2. Starting **exactly at that candidate**, create one single-parent, request-only child commit. Add/update only the new diagnostic request path with exactly these keys:

   ```json
   {
     "purpose": "ornigami-db-admission-only-v1",
     "sourceSha": "<approved 40-character candidate SHA>",
     "packageLockSha256": "4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815"
   }
   ```

   No live marker is included in this preparation. Do not modify the full-build marker. Push this child once, without force. The request must name its immediate parent; lock bytes must match; candidate/request diagnostic workflow, full workflow and full marker Git blobs must match. Require the executed `github.workflow_sha` to equal the request SHA and `github.workflow_ref` to equal this exact workflow on the restricted branch, using [GitHub's workflow identity contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context). The runner fetches the public request with depth two and checks out the exact parent detached. No arbitrary workflow/source selectors or merge request commits are accepted. The local `verifyProtocol(repo, requestSha)` helper tests the same invariants against actual local Git histories; the workflow independently checks them before candidate-owned execution.
3. Admit **exactly one attempt** on one standard public `ubuntu-24.04` job. A workflow rerun is rejected by `run_attempt == 1`. Shared concurrency group `ornigami-external-image-build` prevents overlap with the full image workflow; cancellation is disabled. Do not queue another request/retry on failure. This does not itself prove live integration holds.

## Tools, boundaries and deadlines

Node 22.23.3/OpenSSL 3.5.8 remains unchanged. Node Linux amd64 archive SHA-256 `df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`; Trivy 0.76.0 archive `e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7`; Trivy executable `1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19`. Verify archives before extraction and scanner bytes before execution. Exact actual versions and executable/archive identities go into bootstrap logs. No package manager/dependency installation, image pull, scanner image, vulnerability scan or app build occurs. Host git/curl/tar/bash/timeout/systemd/Python/jq/gh are standard runner administrative tools, inventoried rather than falsely called checksum-pinned downloads. Pinned upload-artifact action: `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`.

Tool preparation and diagnostic work use **serial** verified systemd scopes: 2 GiB memory, 1 CPU, zero swap; Node heap 512 MiB. Bootstrap timeout 180 seconds plus 5-second kill grace. The worker deadline is 360 seconds, each command at most 180 seconds, and an outer work deadline of 600 seconds from initialization cannot be extended. Required admission: Linux x64, at least two online host CPUs, 3 GiB available host memory, 20 GiB free disk reserve, working sudo/systemd/cgroup v2 and exact memory/swap/CPU controls. No fallback on unsupported tooling/protocol. The diagnostic records timestamped wall/monotonic/cgroup/disk observations every second and before/after work; memory peak, max/OOM/kill counters and CPU observations remain visible. Nonzero memory-limit/OOM counters fail resource admission. Bootstrap records initial controls and final peak/events/CPU/disk even on ordinary failure. A hard kill may leave incomplete diagnostics; capture then fails rather than inventing counters. Source fetch and evidence/custody/cleanup are administrative host steps outside worker scopes; the whole job has a 25-minute deadline.

The cache starts empty in a uniquely claimed private runner-temp directory. Exactly **one Trivy DB-download invocation** uses `image --download-db-only --no-progress --db-repository ghcr.io/aquasecurity/trivy-db:2 --cache-dir <owned cache>`. The single explicit supported repository avoids Trivy's default mirror fallback; flags and default repository ordering were verified in the [exact pinned upstream source](https://github.com/aquasecurity/trivy/blob/531360e5d2a88e732373f1614ba99a38738538b8/pkg/flag/db_flags.go). This retrieves the OCI **DB artifact only**, not a container image; there is no second DB/Java DB or replacement download. No orchestration retry is configured; this is not a promise that upstream HTTP libraries make only one network request. Download stdout/stderr, exit/signal/error and command clocks are retained. The tool has a 180-second execution deadline. No added-package or network fallback is available.

One shared admission runs even after download failure, to retain partial/missing metadata diagnostics. It uses the unchanged reviewed helper/policy: schema 2, canonical timestamps, `UpdatedAt <= actual guard clock < NextUpdate`, zero grace and no DownloadedAt extension. Retain bounded original metadata (64 KiB), available original/retained identities, DB hash (not contents), scanner hash, initial and validation OS clocks, raw/parsed values and explicit errors before returning failure. An interrupted index remains failed/incomplete. Failure stops all dependent work; every image/scan/build phase is out of scope. On successful download **and** admission only, run built-in-only `tests/frozen-db-admission.test.mjs` with controlled clocks and fictional bytes on Linux. Its fixture results are separately labeled and cannot substitute for the real downloaded DB result.

## Evidence, custody and cleanup

Always capture phase outcomes, skipped reasons, required receipts, nonempty summary and a SHA-256/byte-count manifest. Rejected admission may have **complete diagnostic evidence** while its admission gate fails; interrupted or missing receipts fail completeness. Complete capture, successful custody, freshness, resource and fictional-fixture gates are separate. Artifact is capped at 64 MiB of content and retained for 30 days subject to repository policy. No actual DB bytes, tool archives, app secrets or credentials are uploaded. Failed source admission uses workflow-owned inline capture rather than executing candidate code.

**The proposed run requires one separately authorized owner-authenticated custody acknowledgment**, within ten minutes of upload. The prepared helper additionally binds the diagnostic workflow path, attempt one and exact artifact name. Its underlying helper verifies owner/run/request/artifact identity, ZIP SHA-256, durable fsync save and read-back before posting one run-specific status. Invoke only after future explicit approval:

```text
node scripts/framework-prototype/retain-db-admission-evidence.mjs RUN_ID 1 REQUEST_SHA ARTIFACT_ID ZIP_SHA256 NEW_LOCAL_DIRECTORY --acknowledge
```

Custody does not claim manifest completeness or successful security admission. Assess the downloaded manifest separately. No status is posted during local tests (fake APIs only). The workflow token can only read statuses. No acknowledgment is currently authorized.

Only verified custody permits explicit cleanup. Cleanup has a 90-second deadline plus five-second kill grace; it verifies exact current run/attempt/request/ref against the ownership receipt, resolved direct-child runner-temp location and absence of symlinks/junctions before removing that claimed directory. It never prunes shared paths or container resources. On failed custody, explicit cleanup is skipped with an error; platform ephemeral-runner teardown is outside our control and uploaded evidence remains the fallback. Failed source protocol likewise leaves cleanup to platform teardown, without executing candidate cleanup code. After successful cleanup, recover **finished logs and summary** durably and separately: cleanup free-disk/removal/read-back receipts were produced after the immutable artifact and cannot be claimed part of it. No blanket guarantee of capture on runner cancellation/hard termination is possible; such evidence is incomplete.

## Local verification versus future Linux proof

Local tests use actual temporary Git histories, controlled clocks/fictional metadata and DB/tool files, mocked executor/API responses, actual Python capture/cleanup and syntax checks. They never download DBs or invoke the scanner. Local Windows Job Object tests can enforce 2 GiB/1 CPU/512 MiB heap; Linux zero-swap/cgroup behavior, real tool bootstrap/protocol execution, actual DB provenance/freshness, memory peaks and runner artifacts remain untested until the separately approved diagnostic.

Passing that diagnostic would establish DB-handling behavior only. The 43 historical Debian highs, complete parent/intermediate/final scans, native/runtime/CSP/SRI/browser/restart/cache acceptance, compiler memory investigation, retained deployable image and maintenance/recovery/origin decisions remain outside its acceptance scope. Holds, cron/provider/live-release gates stay closed. No VPS or QR operation is included.
