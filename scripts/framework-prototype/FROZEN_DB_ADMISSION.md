# Frozen DB admission contract

Local repair only; no DB download, scan, app build or Linux trial was performed.
The previous run's rejected metadata/clock is absent and its precise rejection
cannot be recovered by these changes. Historical security gates remain failed.

`trivy-metadata-contract.json` pins Trivy 0.76.0 source commit
`531360e5d2a88e732373f1614ba99a38738538b8`, its exact trivy-db dependency
`cbebf2ecd6df42d36463844a45e689afee51c70f`, and inspected source hashes. Schema
Version 2 has Go fields Version, UpdatedAt, NextUpdate and DownloadedAt. The
fixture is fictional data in that real schema, not a downloaded database. Go
RFC3339Nano values/offsets are accepted with the existing millisecond comparisons.

The reviewed rule remains `UpdatedAt <= actual guard clock < NextUpdate`, with
zero clock grace and no new maximum-age rule. Upstream's default update decision
can also treat DownloadedAt within one hour as current; this fallback is **not**
adopted. Missing/null/zero DownloadedAt keeps upstream Go zero-value semantics and
does not extend freshness. A future DownloadedAt is recorded as an observation,
not a lease extension. Required timestamps still fail if missing/invalid. Version
2, valid calendar and canonical RFC3339 shape are compatibility checks matching
the pinned publisher, not a relaxed expiry/security threshold. Any proposal to
accept expired DBs, add clock grace or make DownloadedAt a new freshness rule needs
separate review.

Before decoding metadata, the helper fsyncs its bounded original bytes, byte
identity and initial OS clock. It also records scanner/DB hashes and a second
clock immediately before validation, then saves parsed timestamps, explicit
reason codes and a failed/passed index. Clock records identify the Node guard's
actual OS wall clock/monotonic observation; they do not claim a separate trace of
Trivy internals. No environment or credentials are recorded. DB bytes are not
uploaded. Metadata over 64 KiB fails closed: retain only the prefix, original
stat size and prefix hash; full-original hash is explicitly unavailable, never
fabricated. Existing output directories are refused, preserving old evidence.

The workflow downloads once, admits once under 2 GiB/1 CPU/zero swap, then
requires that exact source-bound receipt. Failed admission marks all nine roles
skipped before any dependent pull/scan/build. Later identity/lease checks do not
reparse metadata or renew the lease. They stream hashes and stop on changed
metadata/DB/tool, expiry or backward wall clock. No schema/timestamp rejection is
repeated per role. Scan failure indexes exist before prerequisite checks. Shared
failure, protocol errors and incomplete role receipts stop subsequent roles;
positive advisory findings still fail unchanged thresholds and remain visible.

Capture requires attempted admission's clock/raw identity/parsed result receipts,
verifies retained bytes against identity, and writes a hashed manifest even if
diagnostics are absent or corrupt. Successful, rejected, skipped and tampered
capture are tested independently of owner custody. A capture pass cannot make
security evidence complete, and custody never changes either result.

No replacement DB, real Trivy invocation or Go compilation was used locally.
Linux cgroup execution and real downloaded metadata handling remain untested.
The modified image workflow is a **full image workflow**, not the proposed
admission-only test; do not trigger it to test just DB admission. The handoff
proposes a separate narrowly triggered, one-job Linux admission-only run with no
Docker/image/scan/build steps. It requires its own prepared workflow review and
separate authorization; none is approved or running here.
