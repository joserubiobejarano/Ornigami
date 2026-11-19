# Isolated TLS qualification

19 November 2026. Base `fb293a03135dd90e2cd07ff8d3fa9d2fdafdd775`.
Branch `codex/brand-tls-qualification-20261119`, dedicated worktree
`C:/Users/joser/.local/ornigami-brand-tls`. Only new tests, support, synthetic
fixtures, regeneration script and this guide are owned by this qualification.
No production files, existing tests, dependencies or shared checkpoints changed.

## What executes

The existing `createPublicResourceReader`, address policy, redirect loop,
deadline/cancellation handling, Node ClientRequest, per-hop HTTP/HTTPS Agent,
HTTP parser, Node TLS client/server engines and OpenSSL certificate verification
all execute. The connector spreads the reader's original options unchanged into
`tls.connect`, adding only an isolated Duplex socket and a fixture-specific CA.
`rejectUnauthorized: true` and the reader's real identity callback remain active.
The server's SNICallback records the hostname parsed from the actual ClientHello;
the server decrypts and records the actual HTTP request, including Host.

Injected pieces are DNS answers (`93.184.216.34`, never contacted), physical
in-memory wires, synthetic server certificates/responses and, for deterministic
deadline tests, a manually advanced monotonic clock. HTTPS uses a TLSSocket server;
HTTP uses the same wire without TLS. Responses are synthetic HTTP/1.1 byte streams
handled by the real client parser. There is no HTTP server listener or TCP service.
No direct invocation or replacement of certificate identity checks proves a case.
No live DNS, network request, trust-store/environment modification, download or
paid call was used.

## Certificate inventory and regeneration

**All committed private keys are public synthetic test fixtures. Never use them
for authentication, encryption outside these tests, or a real service.** CA private
keys exist only in the generation script's temporary directory and are deleted.
The `.example` names are reserved synthetic names, unrelated to customer domains.

| Certificate basename | Issuer | SAN / purpose | Validity (UTC) |
| --- | --- | --- | --- |
| `trusted-ca` | self | PUBLIC SYNTHETIC trusted TEST CA | 2020-01-01 to 2040-01-01 |
| `unknown-ca` | self | PUBLIC SYNTHETIC unknown TEST CA; never trusted by client | 2020-01-01 to 2040-01-01 |
| `origin` | trusted-ca | DNS:brand.example | 2020-01-01 to 2040-01-01 |
| `cdn` | trusted-ca | DNS:cdn.example | 2020-01-01 to 2040-01-01 |
| `wrong` | trusted-ca | DNS:wrong.example | 2020-01-01 to 2040-01-01 |
| `expired` | trusted-ca | DNS:brand.example | 2020-01-01 to 2021-01-01 |
| `unknown` | unknown-ca | DNS:brand.example | 2020-01-01 to 2040-01-01 |

All endpoints above are at 00:00:00 UTC. Tests use the real system wall clock for
TLS and require a date strictly after 2021-01-01 and before 2040-01-01. An inventory
test checks every certificate's exact dates, label and leaf SAN. These assumptions
are satisfied on the qualification date; the test clock does not fake TLS time.
CA/leaf keys are RSA 2048, SHA-256 signatures, with explicit CA constraints,
key usage, and serverAuth EKU on leaves. Only `trusted-ca.cert.pem` is supplied
as client trust. The unknown root is retained as inventory, never injected as trust.

From the worktree, with an installed OpenSSL executable (no packages required):

```powershell
node scripts/generate-brand-tls-fixtures.mjs <path-to-openssl>
```

Omit the argument if `openssl` is on PATH. On this machine the supplied argument
was `C:/Program Files/Git/usr/bin/openssl.exe`, OpenSSL 3.5.4 (30 Sep 2025).
The tracked script contains no workstation-specific path. Generation uses explicit
start/end dates above; fresh random keys mean PEM bytes/fingerprints change.
Regeneration overwrites only named fixture files, so use a review worktree and
rerun qualification afterward. No CA key or signing database is retained.

## Expected and observed matrix

| Case | Observed result / asserted evidence |
| --- | --- |
| Trusted correct hostname | Authorized TLS 1.3; HTTP/1.1 ALPN; ClientHello SNI and decrypted Host both brand.example despite numeric connector host; status/type/body verified |
| Response integrity | `hello`, SHA-256 `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` |
| Wrong-host | Real handshake error `ERR_TLS_CERT_ALTNAME_INVALID`; no secureConnect or HTTP request |
| Unknown CA | Real handshake error `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; no secureConnect or HTTP request |
| Expired | Real handshake error `CERT_HAS_EXPIRED`; no secureConnect or HTTP request |
| Valid redirect to cdn.example | Two DNS/connection attempts, separate ClientHello SNI and Host, trusted matching CDN certificate succeeds |
| Redirect reusing origin certificate | Second handshake rejects hostname mismatch; second peer receives zero HTTP requests; no third connection |
| Held handshake cancellation | Actual TLS handshake record (record type 22) queued; external abort rejects CANCELLED and destroys TLS/wires; release after close produces no completion/request/extra attempt |
| Held handshake deadline | Same evidence with DEADLINE, using clock callback; absolute deadline 123 caps timeout 4000; timer cleared |
| Socket error / malformed TLS record | Held wire failure and plaintext injected as TLS reject NETWORK_FAILED before HTTP; malformed case emits ERR_SSL_* |
| Streamed HTTP and HTTPS success | Separate writes of chunked abc/def parse to abcdef |
| Streamed HTTP and HTTPS truncation | Missing final chunk rejects INVALID_RESPONSE |
| Streamed HTTP and HTTPS bounds | Chunked bytes exceed maxBytes=5 and reject TOO_LARGE; declared 1025 exceeds 1024 before waiting for entity |
| Streamed HTTP and HTTPS cancellation | Abort after first response write destroys unfinished response and rejects CANCELLED |
| Private direct / DNS / TLS redirect | Loopback URL and private DNS answer create no connection; TLS redirect to link-local metadata address creates no second connection or DNS lookup |

Invalid certificate peers are configured with a redirect response that cannot be
sent because no HTTP request arrives. Each invalid origin has exactly one attempt.
Public errors are exact generic ResourceReadError messages with no cause or peer
detail. TLS error codes above are inspected only in trusted test instrumentation.

After success and every exercised failure, assertions check destroyed client,
underlying wire, paired wire and server engine, no queued held bytes, and no reader
abort listeners on resolver/external signals. Deferred close/error work drains via
event-loop turns, not short sleeps. Pair destruction explicitly propagates closure
and tears down the fixture's server engine; that server teardown is fixture-owned.
These assertions establish the reader destroys its client and wire. They do not
independently inventory its private request/agent listeners or heap retention.

## Reproduce and verification results

Existing dependencies were reused through an ignored node_modules junction to
`C:/Users/joser/.local/ornigami-brand-integration/node_modules`; nothing installed.
From this worktree:

```powershell
node --experimental-strip-types --test tests/campaign-lab-brand-tls.test.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js tests/campaign-lab-brand-tls.test.mts tests/support/brand-tls.mts scripts/generate-brand-tls-fixtures.mjs
$suites = @(Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | Sort-Object Name | ForEach-Object { $_.FullName })
node --experimental-strip-types --test @suites
git diff --check
```

Observed on Windows x64:

| Runtime | TLS engine | Focused TLS | Full Campaign Lab (27 files) |
| --- | --- | --- | --- |
| Node 24.11.1 | bundled OpenSSL 3.5.4 | 17 passed, 0 failed/skipped/cancelled | 298 passed, 0 failed/skipped/cancelled |
| Node 24.22.3 | bundled OpenSSL 3.5.9 | 17 passed, 0 failed/skipped/cancelled | 298 passed, 0 failed/skipped/cancelled |

The second runtime was already installed in the Codex app's dependencies; use
its executable in place of `node` in both test commands. Both reported TLS 1.3,
authorized=true for the valid peer and the three rejection codes above.
Full-project TypeScript, focused ESLint and whitespace checks passed (exit 0).
Node emits the existing MODULE_TYPELESS_PACKAGE_JSON warning; package files were
not changed. During fixture development, OpenSSL initially rejected duplicate
origin/expired CNs; the local signing configuration now explicitly permits them.
An initial support-gate generic typing error was corrected before final TypeScript
verification. No failing production case or source fix is outstanding.

## Remaining limits

This qualifies the listed Windows Node/OpenSSL builds and observed negotiation,
not every TLS version, cipher, runtime, OS or physical network condition. No real
TCP routing, public IP ownership, production DNS/resolver cancellation, IPv6
socket, OS hosts behavior, system trust store, proxies, NAT, deployment egress,
certificate revocation/OCSP, certificate rotation, TLS resumption or real network
failure is qualified. No TLS 1.2-only negotiation was forced. HTTPS IP-literal
certificate identity was not exercised. Certificate rejection after redirect is
proved for hostname mismatch; CA/expiry rejection is exercised at the origin.
The controlled clock establishes deadline wiring, not real-time scheduling under
load. In-memory writes buffer bytes without modeling TCP backpressure/half-close
timing, latency, bandwidth, memory bounds or packet loss. No deployment or release
acceptance follows from these tests.
