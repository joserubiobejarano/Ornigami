# Bounded public-network qualification

19 November 2026. Session 2 of `BRAND_URL_NEXT_TASKS_20261119.md`.
Base: `deb4b365996706f050604b59e1d3a403ed0f9216`.
Branch: `codex/brand-public-network-20261119`, dedicated worktree
`C:/Users/joser/.local/ornigami-brand-public-network`.

Observed result: **three genuine protected HTTPS text reads succeeded** on this
Windows x64 workstation, Node 24.11.1, bundled OpenSSL 3.5.4. All three returned
HTTP 200, negotiated TLS 1.3 / HTTP/1.1 ALPN, had authorized certificates and
closed sockets. No production code, UI, dependencies or other session was changed.
This records a local observation; it does not enable the URL feature or qualify
deployment/public release.

## Command and explicit execution

From this worktree using existing installed dependencies:

```powershell
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qualify-brand-public-network.mts --dry-run
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qualify-brand-public-network.mts --execute
```

Only one exact option is accepted. Missing/unknown/additional arguments exit 2
before network work. Dry-run prints the fixed targets, budgets and non-secret
runtime metadata and performs no DNS/socket/storage work. The warning flag
suppresses the inherited module-type warning that otherwise prints local paths.
There are no URL, limit, proxy, output-directory or test-provider CLI overrides.

Execute creates an exclusive persistent `EXECUTION_RESERVED` marker in the fixed
ignored `.local/brand-public-network-20261119/` directory. Concurrent or subsequent
executions in that worktree refuse with exit 2 before any reader call. The marker
survives failures and is never automatically deleted. **Do not remove it or use a
new worktree to repeat this run under the completed authorization.** Copying the
command elsewhere is not a cross-machine/global authorization counter. A future
live run requires its own explicit bounded scope. Dry-run/offline tests remain safe.

## Bounds and accounting

- HTTPS `example.com` and `www.iana.org` only, default port 443. No credentials,
  numeric URL hosts, subdomains, trailing-dot alternatives or third-party hosts.
- At most two fixed seed GETs, then at most two directly linked stylesheet GETs
  on those exact hosts. The qualification command deliberately narrows CSS paths
  to `.css` suffixes, enumerates at most 256 HTML tags and deduplicates references.
  It does not follow CSS imports, media, fonts, icons, images or scripts. No raster
  resource is supplied to the collector/native decoder. Sharp is imported by the
  existing collector module but no raster decoding is invoked by this command.
- Four logical calls maximum, no retries, `maxRedirects: 0`. A redirect produces
  the existing reader's `REDIRECT_LIMIT`; its Location is unavailable to this
  command and no follow-up probe is made. It may proceed to the other fixed seed
  after that outcome, not retry/follow the redirected seed.
- Every attempt reserves 262,144 entity bytes **before** calling the reader;
  the private ledger is written and synced first. Reservations are never refunded,
  including on failure, and cannot exceed 1,048,576 bytes. Returned bytes are a
  separate measured counter. A reserved call may conservatively count even if
  cancellation during storage prevents invocation. No process resume/retry exists.
- One absolute 30,000-ms monotonic network deadline and shared AbortSignal cover
  the sequential run. Each reader receives that same deadline/signal and a
  remaining timeout. The reader retains its own cleanup timers; none resets the
  common deadline. Reservation/storage time consumes this allowance. Collection
  after the network phase cannot schedule more reads and is not preemptible.
- Stop on cancellation, deadline, DNS/network/address-policy failure, command
  invariant/storage failure, exhausted allowance, or HTTP 401/403/407/429/451.
  SIGINT/SIGTERM abort the common signal. Failure consumes its reservation and
  cannot cause another-host fallback after a network/access failure.

The byte allowances describe entity bytes returned/retained or reserved, not
packets, HTTP headers, TLS overhead, unread redirect data, DNS packets, buffering
or RSS. An oversized incoming chunk can reach Node before the reader rejects it.
Zero retries refers to GET attempts; Node's resolver owns normal DNS query behavior.

## Actual implementation and instrumentation

The execute path calls the exported **default `readPublicResource`**, including
its original Resolver, public-address checks, numeric connection pinning, Node
request/agent/parser and `tls.connect`. No resolver, socket, clock or request is
substituted for the live run. Production TLS options, identity checks and trust
are preserved. No environment/trust-store change was made; the executing process
had neither `NODE_TLS_REJECT_UNAUTHORIZED=0` nor `NODE_EXTRA_CA_CERTS` configured.

Trusted passive instrumentation subscribes to Node's `net.client.socket`
diagnostics channel only during each read. It observes connect, secureConnect and
close events on the real TLSSocket. Private evidence records peer address/family,
port, local address, client servername property, authorization, protocol, ALPN,
cipher, certificate fingerprint/issuer/SAN/dates and closure. It neither replaces
connection options nor changes certificate checks. Diagnostic availability varies
with Node versions. The client servername property records local configuration;
it is not an independent capture of the remote server's received ClientHello.
The earlier isolated TLS suite supplies that server-side SNI evidence separately.
No independent packet capture or server log was obtained. Full DNS answer sets
are not captured by this passive seam; the production resolver/policy executes.

The runner accepts trusted injected dependencies only for offline unit tests.
Those synthetic results are separate from the three real observations below.
No test provider can be selected through the execute CLI.

## Sanitized observed result and ledger

Execute exited **0**, stop `COMPLETE`. Actual network phase: **513 ms**.
Three logical reservations, three real TCP/TLS connections and three successful
HTTP responses were observed. There were zero failed attempts, zero retries and
zero redirects. No fourth call or additional probe was made.

| Index | Target / kind | Status | Media type | Returned bytes | Read elapsed |
| --- | --- | --- | --- | --- | --- |
| 0 | example.com seed HTML | 200 | text/html; charset=utf-8 | 577 | 214 ms |
| 1 | www.iana.org seed HTML | 200 | text/html; charset=UTF-8 | 6,253 | 161 ms |
| 2 | www.iana.org directly linked CSS | 200 | text/css | 121,482 | 124 ms |

All peer ports were 443; client servername matched the allowlisted target.
Every connection reported `authorized=true`, `TLSv1.3`, `http/1.1`, `closed=true`.
Requested and final URLs were identical for every response; exact CSS URL and
connection/network details remain private. No certificate-date override was used:
verification used the real workstation clock, real peer chains and Node trust.
This does not make future certificate validity, DNS, content or availability claims.

| Index | Exact returned entity SHA-256 |
| --- | --- |
| 0 | `25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484` |
| 1 | `3793e4caa03841cf2eb77906231a8b66db18dfbf6791d163a26ac19c777f8a55` |
| 2 | `da1cf0c0c131c67b7e5d8d77d1d36011dc275b3dca49bdc20e0b99b07eec12e0` |

Reserved: **786,432 / 1,048,576 bytes**. Returned: **128,312 bytes**.
Remaining authorization was not spent. All three supported text resources went
to the existing `collectBrandKitDraft`: outcome `draft`, 3 sources, 178 candidates,
0 accepted values; brand/campaignFacts/mediaRights approvals all false. This is
unreviewed lexical evidence, not computed browser styles, publisher ownership,
approved campaign facts, identity acceptance or permission to use assets.

## Private evidence

All files below are beneath the worktree's ignored
`.local/brand-public-network-20261119/`; ignore status was verified with Git:

| File | Contents |
| --- | --- |
| `EXECUTION_RESERVED` | Persistent one-shot execution reservation |
| `machine.json` | Exact Node/OpenSSL/OS release/version, host and executable details |
| `ledger.json` | Full requested/final URLs, media types, safe outcome/status, timing, reservations, bytes and hashes |
| `connections.json` | Actual connection/TLS/certificate evidence; includes private interface data |
| `body-0.bin`, `body-1.bin`, `body-2.bin` | Exact unmodified response entity bytes |
| `unreviewed-draft.json` | Inspectable collector draft including source text excerpts; private |
| `sanitized-summary.json` | Safe summary printed by the command |

If execution fails, preserve the marker/ledger and any `command-failure.json`.
No live body, source text, draft candidates, interface address, machine hostname or machine inventory
was committed. Synthetic unit-test HTML/CSS is the only new tracked source content.
POSIX creation modes are requested; this does not establish Windows ACL isolation.

## Offline verification

```powershell
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/campaign-lab-brand-public-network.test.mts
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/campaign-lab-brand-resource-transport.test.mts tests/campaign-lab-brand-tls.test.mts tests/campaign-lab-brand-evidence.test.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js scripts/qualify-brand-public-network.mts scripts/support/brand-public-network.mts tests/campaign-lab-brand-public-network.test.mts
$suites = @(Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | Sort-Object Name | ForEach-Object { $_.FullName })
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test @suites
git diff --check
```

Focused command: 10 tests passed. Relevant transport/TLS/collector: 50 passed.
Full Campaign Lab: 319 passed. TypeScript, focused lint and whitespace: exit 0.
Offline tests cover allowlists, no network in dry-run/invalid CLI (DNS/TCP traps),
exclusive concurrent/persistent reservation, four-call/full-reservation bounds,
two-seed/CSS-only discovery, no recursive/hidden requests, failure charging,
redirect no-follow settings, restriction/unsupported outcomes, shared deadline,
abort, late scheduling and reader byte/final-URL contract violations.
Actual TLS rejection and transport parser behavior are covered by the inherited
real-TLS/in-memory suites, not mocked certificate callbacks. Initial typechecking
found the installed Node types omit the observed TLSSocket servername property;
a local optional type refinement corrected instrumentation without transport edits.
Dependencies were reused via an ignored node_modules junction; nothing installed.

## Qualification limits

Only this run on Windows x64 / Node 24.11.1 / OpenSSL 3.5.4 was exercised live.
No alternate-runtime live run consumed more authorization. Real reads establish
the permitted success path and observed closure, not real-network rejection,
cancellation, DNS-cancel, timeout, redirect or private-routing failure behavior.
Those failure paths remain offline-qualified within their documented limits.
No proxy, alternate trust store, system routing, Render, Cloudflare, Linux, IPv6
connection, deployment egress, TLS 1.2-only negotiation, revocation, packet loss,
load, certificate rotation, native image processing or public-release claim follows.
Session 1 live enablement still requires a separate explicitly scoped exercise.
