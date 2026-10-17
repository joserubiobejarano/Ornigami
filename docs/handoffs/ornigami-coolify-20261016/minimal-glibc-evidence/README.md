# Local feasibility evidence

This directory contains sanitized local evidence for source
`5d1659d6fcce05be476d6bd8ab1932f9448db031`. No new Linux image was built or
scanned. It does not supersede the historical failed security/completeness gates.

`IDENTITIES.json` hashes committed bytes, not Windows working-tree line endings.
Signature receipts are real local cosign verification; admission/scanner unit
fixtures are identified as fixtures in test names. Static ELF/package receipts
use actual digest/integrity-verified public parent/package archives. Downloaded
executables, native package archives, image layers and Node archives are excluded.

`PARENT_ADMISSION.json` records the earlier signature/content phase, when static
closure was still pending. `STATIC_COMPATIBILITY.json` and both native-closure
receipts record its subsequent passing result. Neither establishes Linux loading.

`attempt-1`/`checks-1` retain the AVIF harness failure and its 73 passing unit tests.
`attempt-2`/`checks-2` retain 78 passing tests. Top-level test logs and `checks-3`
are final: 79 passing tests after malformed-index/spool-boundary additions. Windows
codecs use the existing read-only Windows dependency tree, not a new Linux install.
The preliminary fixture error had session tool output only, as explicitly recorded
in `LOCAL_FAILURE_HISTORY.json`; no raw receipt has been fabricated.

`checks-*` contain bounded supervisor logs, configured limits, observed peak memory,
disk observations and exit codes. They cannot provide Linux OOM counters. Only
future Linux scopes can validate cgroup behavior, Docker archives, cache-only
exports and real scans. The actionlint ZIP checksum was verified against the
official release; optional unavailable shellcheck/pyflakes adapters were disabled,
with all Bash/Python blocks checked separately for syntax.

`implementation.patch` reproduces the source delta from its recorded parent.
`HISTORICAL_PRESERVATION.json` records read-back verification of 396 older evidence
files, without modifying their manifests. `SHA256SUMS.json` binds this directory's
files and is independent of artifact custody or acceptance.
