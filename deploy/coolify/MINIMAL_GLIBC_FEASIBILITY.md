# Minimal glibc feasibility candidate

Local prototype only. No image has been built or accepted from this candidate.
All 43 historical Debian highs remain unresolved pending exact-image scans.
Framework adoption, release, registry publication and provider gates remain closed.

`scripts/framework-prototype/minimal-parent-policy.json` binds the signed Distroless
Debian 13 parents, their indexes/manifests/configs, the official Node binary and
Node 22.23.3/OpenSSL 3.5.8. No Node version change is proposed. Signature admission
uses exact publisher identities, not a permissive identity regex. These checks do
not establish a SLSA build attestation or a vulnerability-free image.

The debug parent supplies explicit BusyBox tooling only to build stages. npm
11.21.1 is checksum-pinned and its complete installed tree must be inventoried and
scanned. Install/build run as UID:GID 1000:1000; the final parent contains neither
BusyBox nor npm. Numeric cache ownership and read-only-root/tmpfs/named-cache
contracts are retained. Runtime cgroup, identity, disk and codec probes use Node.
Source maps and all existing HTTP/CSP/SRI assertions remain required.

The new lock changes only 15 libc metadata fields obtained from integrity-verified
upstream package manifests. Versions, resolved URLs, integrity pins and the custom
framework package are unchanged. `native-platform-policy.json` records old/new lock
checksums and all 16 Linux x64 package archives examined. npm's actual virtual-tree
platform checker accepts nine GNU/generic packages and rejects seven musl packages;
a fresh Linux cold installation remains required.

The serial scanner requires nine distinct roles: both original parents,
build-base, deps, builder, prod-deps, runner, BuildKit and Dockerfile frontend.
Each archive is config/layer-bound, completely inventoried and scanned without
ignores, with full severities and zero critical/high acceptance. A bare Go frontend
may lack an OS database only when its hash-bound filesystem proves every native
object is covered by Go package inventory. Unknown native files fail coverage.
Each inventory/scan phase uses a separate 2 GiB/1 CPU/zero-swap scope; scans never
overlap the compiler. BuildKit stays 8 GiB/3 CPU/zero swap, heap 4 GiB, serial worker.

One future approved primary build could export intermediates from its existing
cache. Those exports are bounded and reject noncached RUN events or unrecognized
progress; they cannot be retried. BuildKit emits progress after work can start:
the abort guard is not proof that no process started. Its raw progress protocol,
cache retention, export compatibility and available disk/time need Linux proof.
An export failure means incomplete evidence and no acceptance; no cold rebuild or
capacity increase is allowed as fallback. No exports or build ran locally.

The workflow preserves timestamped cgroup observations, compiler stdout/exit,
per-phase scan/resource receipts and independently required restart/recreation
snapshots. Raw archive spools remain outside artifact directories and are removed
only within their recorded ownership scope. Invalid scan indexes are preserved;
capture fails after writing a hashed manifest. Custody remains a separate check.

Future Linux validation must prove actual npm/glibc selection, Node/OpenSSL/ABI/CPU,
dynamic loading and all image formats, HTTP/CSP/SRI/browser corruption rejection,
restart/recreation/cache persistence, all nine complete scans and resource receipts,
and failed/skipped capture paths. The older Dockerfile frontend pin may itself have
advisories: its scan must fail unchanged thresholds if so. No headroom claim follows
from the historical 8 GiB peak/three limit events or these small Windows checks.

Detailed signed-parent receipts, focused local results and exact source identities
are handed off in the preparation worktree's
`docs/handoffs/ornigami-coolify-20261016/MINIMAL_GLIBC_FEASIBILITY.md`.
