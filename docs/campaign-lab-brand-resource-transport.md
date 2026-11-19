# Public resource transport foundation

Session 2, 19 November 2026. Base: `2e05e3e35411a6894c4a9a6a969b284406801a63`.
This is an integration-free Node library. No URL endpoint, UI, collector changes,
live requests, dependencies, deployment or paid calls are included.

## Integration

In a future separately authorized Node server adapter, import
`readPublicResource` from `src/lib/campaign-lab/brand-import/public-resource-fetch.ts`.
Call `await readPublicResource(url, { maxBytes: 512 * 1024, timeoutMs: 4000,
maxRedirects: 3, signal })`. This example is an API illustration, not a request
executed in this task. Keep this module out of client bundles.

The result is structurally compatible with Session 1:
`{ requestedUrl: string, finalUrl: string, status: number,
contentType: string | null, body: Uint8Array }`. The body is a Node Buffer
(a Uint8Array). URLs are normalized, fragments removed, and trailing DNS dots
removed consistently. A final HTTP error status is returned as data, so the
orchestrator must decide whether it is usable. Only 301/302/303/307/308 redirect.
No HTTP content-type trust or resource-kind validation is implied.

Catch `ResourceReadError` and inspect its `code`. Codes are `INVALID_OPTIONS`,
`INVALID_URL`, `BLOCKED_DESTINATION`, `DNS_FAILED`, `NETWORK_FAILED`, `DEADLINE`,
`CANCELLED`, `TOO_LARGE`, `UNSUPPORTED_ENCODING`, `INVALID_RESPONSE`, and
`REDIRECT_LIMIT`. Messages omit source errors, raw headers, bodies and URL secrets.
The module does not log. Callers should likewise avoid logging imported secrets.

Use the default transport in application code. `createPublicResourceReader`
accepts **trusted** DNS/socket dependencies for offline tests or a separately
reviewed adapter; a malicious injected connector can bypass the policy. Never
derive those dependencies or TLS options from an imported resource.

## Supported limits and threat boundary

- Node HTTP/1.1 GET only, HTTP port 80 and HTTPS port 443 respectively, including
  explicit default ports. Other ports, protocols and URL credentials fail.
  HTTPS-to-HTTP redirects are supported and receive the same destination checks;
  HTTP is unencrypted. No cookies, authorization, arbitrary headers, proxy agent,
  environment-derived credentials, retries, connection pooling or socket reuse.
- Each hop resolves A and AAAA using a fresh Node DNS Resolver, not native fetch,
  OS hosts-file lookup or a browser. All returned addresses must pass, including
  mixed-family answers; empty results or more than 64 addresses fail. Resolver
  errors other than ENODATA/ENOTFOUND fail. One validated address is selected;
  there is no automatic alternate-address fallback or second DNS resolution.
- The actual agent `createConnection` discards hostname-based connection options
  and passes the numeric validated address and family to `net.connect` or
  `tls.connect`. TLS retains the original DNS hostname as SNI, explicitly sets
  `rejectUnauthorized: true`, uses Node's standard `checkServerIdentity` against
  the original hostname/IP, and offers only HTTP/1.1 via ALPN. IP literals omit
  SNI and retain IP certificate checking. Host remains the URL authority.
- IPv4 policy denies private, loopback, link-local/metadata, carrier NAT,
  documentation, benchmarking, protocol-assignment, multicast/reserved ranges,
  deprecated 6to4 relay space and Azure's platform virtual address. IPv6 is
  deliberately narrower than all potentially public allocations: only ordinary
  2000::/3 global unicast, excluding 2001::/23 special-use, 2001:db8::/32,
  2002::/16 6to4 and 3fff::/20 documentation. All mapped/compatible IPv4, NAT64,
  zones, local, multicast and unallocated families fail, including mapped public
  IPv4. Some legitimate special-use destinations are intentionally unsupported.
  The table is conservative application policy, not an automatically updated
  IANA registry or protection against deployment-specific public-address routes.
- `maxBytes` is mandatory, a positive integer up to 8 MiB. Actual **HTTP entity
  stream bytes** are counted before retention, independently of declared length.
  Missing Content-Length and chunked transfer work; an excessive declaration
  fails early. Only absent/identity content encoding is supported. Compression
  is rejected without decompression. Redirect bodies are destroyed unread.
  Node owns HTTP framing: understated lengths may cause a parser error; excess
  bytes are never reused as another resource. The library cannot count bytes
  discarded by Node's parser or prevent an in-flight socket chunk from arriving.
- Headers are limited to 16 KiB per response by Node's parser. This is not a
  packet-byte, CPU, RSS or whole-import budget. Buffers and final concatenation
  can transiently use more than `maxBytes`; Node/socket/parser overhead also
  exists. Default redirect count is 3, configurable 0–5.
- One monotonic deadline starts before DNS and spans every connect, TLS, redirect,
  header and body operation. Default 10 seconds, configurable integer 1–30000 ms.
  External AbortSignal maps to CANCELLED regardless of its possibly secret reason.
  Timer expiry maps to DEADLINE. Deadline checks also run before connection,
  processing chunks and returning content, guarding delayed timer callbacks.
  JavaScript event-loop starvation still prevents timely timer scheduling; these
  are asynchronous bounds, not a hard real-time process/memory sandbox.
- Cancellation races DNS completion, cancels the production Resolver's queries,
  and prevents late results/rejections from initiating sockets. Injected resolvers
  should honor their signal; an uncooperative injected promise can remain pending,
  but cannot connect later. Every hop destroys its response, request, socket and
  private agent on success, redirect or failure. Abort listeners and owned stream
  listeners are removed; deferred error handlers stay only until close to safely
  absorb destroy-related events. The overall timer/external listener is cleared
  in finally. Native OS close/cancel completion remains asynchronous.

A later orchestrator must supply resource kinds, status/media validation, shared
total bytes/count/concurrency/deadline budgets, cache/source lifecycle, review,
auth and rate limits. It should pass the remaining shared deadline and cancellation
signal into every resource call. Discovered links are not fetch authorization.
Session 1 can consume supplied results without importing this module. Integrate
the two commits sequentially in a fresh reviewed worktree as the handoff requires.

Render Node is the intended runtime family; no Render execution was performed.
Cloudflare Workers needs a separately qualified transport. This library's Node
DNS/socket/TLS behavior is not a Workers adapter, and it does not qualify Sharp.
Finishing this foundation does not authorize live URL access.

## Offline evidence and remaining qualification

The focused suite uses injected DNS and byte-level Duplex sockets at the actual
TCP/TLS connector boundary. Node's real ClientRequest, Agent and HTTP parser run;
neither top-level fetch nor request/agent is mocked. It proves pinned numeric
connector arguments after DNS changes; original Host/SNI and standard certificate
identity callback; address/family checks; same-host and cross-origin redirect
revalidation; streamed limits/framing; header bounds; cancellation; deadline across
DNS/connect/body/redirects; late DNS and response suppression; socket destruction
and abort-listener cleanup. Test sockets never make real connections.

This does **not** exercise actual TCP routing, a TLS handshake, CA chain/revocation,
real certificate rejection, system DNS/c-ares cancellation, ambient proxy behavior
on a deployment, or Render network policy. The TLS fixture verifies options and
invokes Node's identity checker with synthetic certificates; it does not emulate
a TLS engine. Real TLS/network/IPv6/runtime/egress qualification remains a later
explicitly authorized integration gate. Public IP classification cannot determine
resource ownership or defend against deployment NAT/routing of public addresses
to privileged services; enforce deployment egress controls as part of that gate.

## Source provenance and licensing

Reviewed Contentor commit `1721bd90b54f7bbaf8f41d0435cbea7bf2f96b2b`:
`src/lib/net/private-address.ts`, `safe-fetch.ts`, and their `.test.ts` files.
Its documented check-then-native-fetch DNS gap motivated the pinned connector.
The address threat categories and per-hop/stream-limit cases informed this work.
Implementation and tests here were independently written; no Contentor code was
copied. Its inspected tree/package has no repository-wide LICENSE or package
license declaration; bundled font/skill licenses do not license these modules.
Do not infer an open-source grant or import Contentor source without a separate
rights determination. No third-party package or lockfile changes were needed.

## Verification commands

From the dedicated worktree, using Node v24.11.1 and the existing base's installed
dependency tree via an ignored node_modules junction (no install/network):

```powershell
node --experimental-strip-types --test tests/campaign-lab-brand-resource-transport.test.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/campaign-lab/brand-import/private-address.ts src/lib/campaign-lab/brand-import/public-resource-fetch.ts tests/campaign-lab-brand-resource-transport.test.mts
git diff --check
```

Results: 18 focused test groups passed, full-project TypeScript passed, focused
ESLint passed, and diff whitespace checks passed. The type-stripping test command
emits the base package's module-type warning; no package configuration change is
needed. No live request or production qualification is claimed.
