# Bounded local preparation receipts

Implementation source: **25b536d833bf99b02d87b807ac17fdf9d53e5575**, local branch
`codex/ornigami-capture-remediation-20261017`. `IMPLEMENTATION.patch` contains the
exact seven-file committed change, including tests; `IDENTITIES.json` binds Git
blobs/canonical hashes and unchanged framework package/patch/lock identities.
This evidence does not identify a newly built image.

- `LOCAL_TEST_ATTEMPTS.json` indexes all five bounded local checks. The final run
  has 40 passed / zero failed / zero skipped. Two intermediate one-test failures
  show Windows/Git Bash install-mode limitations; they remain preserved. The final
  Windows test adapter verifies the requested Linux 700 mode and models directory
  creation; actual Linux mode enforcement is untested here. Production assertions
  are unchanged. No test invoked real Docker, Trivy, custody or provider APIs.
- Each attempt retains its stdout/stderr, exit and resource receipt. The first
  receipt's hardcoded heap field is wrong; its spec configured 512 MiB. Later
  receipts report the actual configured options after the local supervisor's
  reporting repair. Final peak job committed memory is 86,568,960 bytes under the
  4 GiB/3 CPU job cap. These are Windows counters, not Linux OOM proof.
- `LOCAL_CHECKS.json` records 16 Bash syntax checks, five unchanged immutable
  application inputs and 194 preserved historical evidence file hashes. No full
  build, installation, new image or external trial was performed.
- `DEBIAN_VENDOR_RECHECK.json` contains primary vendor version tables, observed
  response hashes and the exact 43 affected package/advisory rows. Unstable fixed
  versions are research references, not compatible approved Trixie updates.
- `DISTROLESS_REGISTRY_METADATA.json` is read-only official registry metadata for
  two possible parents: manifests/config only, no layers, signature verification,
  image scans or execution. Node patch and native compatibility remain unverified.
- `NATIVE_COMPATIBILITY_INPUTS.json` separates committed lock possibilities from
  package metadata actually present in the prior Linux final scan. It does not
  claim an ELF/library closure or that every installed native variant was loaded.
- `STAGE_SCANNING.md` prepares future complete image/tooling inventory collection.
  The collector is not wired into the workflow. Its real scanner, archive, OS and
  native coverage limitations remain future gates, including scratch frontend and
  npm-root metadata identification. No finding is suppressed.

`SHA256SUMS.json` is a separate local inventory. The previous trial ZIPs, original
runner manifests, failed security gates, artifact completeness failures and
separately attributed supplemental recovery were not rewritten. Historical owner
custody is independent; no new owner acknowledgment occurred during this work.
