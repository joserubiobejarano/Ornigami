# Guard compatibility and offline source-window rehearsal

19 November 2026. Worktree `C:/Users/joser/.local/ornigami-guard-rehearsal`,
branch `codex/guard-compat-rehearsal-20261119`, based on
`e4858682ca3c12817f19f26f5ec8180d01886831`. Guard/controller freeze for final
cold qualification: `0fe9a0ebc3a02d147966aa751b07ffa3a158a38a`.
Subsequent support commit `5d4e6f674af728493717fd17725cca4ac1c491d5` only closes
test/probe stdin explicitly; its focused rehearsal passes. Evidence is committed
separately. No application, protected transport, font, template, palette, asset,
dependency, retired launcher or reservation source was changed.

## Compatibility result

Both reported defects reproduced before edits with finite local Node children.
[`compat-before.json`](examples/guard-rehearsal/compat-before.json) and
[`compat-after.json`](examples/guard-rehearsal/compat-after.json) retain the values:

| Operation | Ordinary Node | Old guard | Corrected guard |
| --- | --- | --- | --- |
| `execFile(file, options, callback)` | callback once | callback absent | callback once |
| Returned callback handle | ChildProcess | ChildProcess | ChildProcess |
| `promisify(execFile)` output | `{stdout:'out',stderr:'err'}` | `'out'` | `{stdout:'out',stderr:'err'}` |
| Promise `.child` | ChildProcess | absent | ChildProcess |

The wrapper now normalizes the documented callback/argument/options forms
explicitly, retaining native handles and delegating execution/error handling to
Node. The custom promisifier calls the **guarded** function, attaches `.child`,
returns both output streams, and annotates rejected errors with stdout/stderr.
It does not restore Node's original hook, which closes over the unguarded function.
Native synchronous argument errors remain synchronous. Tests also cover Buffer
outputs, exit-code errors, ENOENT, callback-once error/timeout completion and
AbortSignal cancellation. All local children have finite completion/timeouts;
available asynchronous stdin handles are closed.

| Other claimed helper | Exercised forms |
| --- | --- |
| spawn | file/options; file/args/options; native ChildProcess and streams |
| spawnSync | file/options/input; file/args/options |
| execFileSync | file/options/input; file/args/options; native output |
| fork | module/options; module/args/options; IPC message and close |

Minimal child environments retain the mandatory `NODE_OPTIONS` preload and
`ORNIGAMI_OFFLINE_LOG`; all other supplied options/environment values continue
through the native API. Those two enforced settings intentionally override child
values. Children assert preload presence and actual DNS refusal before the safe
underlying resolver seam. `exec`/`execSync` and unrelated APIs were not wrapped.
This is qualified on Windows with Node 24.11.1, not a universal runtime/platform
compatibility claim. The custom hook uses this runtime's `Promise.withResolvers`.

Commands:

```powershell
node scripts/guard-compat-probe.cjs
node --test tests/guard-compat.test.cjs tests/source-policy.test.cjs tests/offline-guard.test.cjs
```

For a minimal old-code reproduction without starting any app/live launcher:
save `git show e485868:scripts/support/offline-guard.cjs` to an owned temporary
`.cjs` file, then run `node --require <that-file> scripts/guard-compat-probe.cjs worker`.
The worker closes callback-child stdin, uses a 1.5-second child timeout and emits
the callback count, promise result and child-property presence. The parent probe
also has a five-second deadline. No external probe is involved.

## Executable offline control

```powershell
node scripts/offline-canary-rehearsal.mjs
node scripts/offline-canary-rehearsal.mjs --serve
```

Default invocation runs the five focused tests, saves a synthetic source-policy
trace in `.local/guard-rehearsal/source-policy.json`, and exits. `--serve` first
passes those checks, then starts the existing offline launcher on
`http://127.0.0.1:3041`. No live argument/mode or reservation path exists.
The server uses `ORNIGAMI_BRAND_URL_MODE=synthetic`, URL live false,
OpenAI false, local-test generation, synthetic auth placeholders and the guard
preload. It does not arm an IANA source window. No dotenv, Google-font mock,
provider credential or permit is inherited into the app from the test controller.

The qualification-only controller in `scripts/support/source-window.cjs` is
created only by trusted local code. It has no environment/body-based arming
mechanism, HTTP admin route or application import. One controller permits one
transaction and cannot be reused. A transaction's asynchronous context alone
does not authorize network work: a sequential owned reader scope, validated DNS
binding and exact HTTP/TLS phase are also required. Concurrent/nested reads fail.

`source-reader.mts` composes the **existing** protected reader with the installed
guard. The fixture test constructs the **existing** API handler using its trusted
reader factory and runs it inside a controller transaction. The ordinary browser
route is unchanged and continues using the app's existing `brand-url.example`
synthetic reader. The two synthetic paths are deliberately distinct.

### Enforced future policy, rehearsed with fixtures

| Boundary | Enforced rule / evidence |
| --- | --- |
| Startup, compilation, ordinary children | No controller or transferable permit; preload installed first. Every captured initialization reports closed / no live backend. Child inside a source transaction still refuses IANA before its underlying seam. |
| Transaction | One existing brand-evidence action per controller; second attempt rejected. URL/body `permit` field fails strict API validation; a valid body cannot arm an unarmed reader. Production returns 404 before reader factory creation. |
| Seed / URL | Exactly `https://www.iana.org/` first; HTTPS `www.iana.org:443` only thereafter. Other hosts, numeric URLs, credentials, fragments, HTTP and other ports fail before fixture DNS. |
| HTTP | GET only; four admissions total, including redirects. Only `https.request` with the protected reader's exact options and fixed Host/identity-encoding/close headers is admitted. No credentials, duplicate/extra headers or destination-option overrides. Fetch, HTTP/2 and arbitrary HTTP helpers get no source exemption. |
| DNS | Only the adapter's owned all-address lookup phase, for that hostname/window. The mandatory synthetic resolver supplies addresses; existing `isPublicAddress` and the unchanged protected reader reject private/mismatched addresses before connection. No blanket public/private DNS permission. |
| Numeric connection | Only TLS for the reader's bound address/family, port 443, IANA SNI, `rejectUnauthorized:true`, hostname-check function and HTTP/1.1 ALPN, in its one connection phase. Raw external TCP remains denied. Wrong numeric address/family/port/SNI/verification settings never reach the fixture connector. |
| Entity / media | Existing reader byte/deadline/certificate-option logic remains in use. 1 MiB conservative reservations; failed reads retain their full charge. First resource HTML, subsequent directly linked resources CSS. Guard checks response headers before entity collection; other media/third-party redirects are destroyed. Images/fonts/scripts get no resource-read permission. |
| Completion / budget | Scope closes in transaction finally; four GET admissions or exhausted charged-byte budget close further authority. Complete single-read and four-GET cases are separately traced. |
| Cancel / deadline | Request/reader cancellation closes immediately and aborts the protected reader; the pending synthetic stream closes. A single ten-second source deadline checks before resolution/connection and expires autonomously through the trusted clock. |
| Background work | No source exemption for fonts, telemetry, arbitrary fetch or other hosts. Closed/expired continuations are refused. Loopback and required local Windows IPC retain the ordinary qualification behavior. |

The controller requires injected synthetic DNS/TLS functions and the existing
public-address validator. **There is no live backend in this implementation.**
It cannot turn the normal rehearsal command into a live canary. A future real
DNS/TLS/numeric-connection backend and trusted run-control integration require
separate implementation/review and fresh authorization; this task supplies
executable offline policy/control evidence, not a live-ready socket bypass.
Creating a controller is not an execution allowance or persistent reservation.

[`source-policy.json`](examples/guard-rehearsal/source-policy.json) contains nine
passing scenario groups, explicit synthetic admissions/rejections, closure and
fixture wire requests. The existing API/protected-reader composition admits four
GETs and observes exactly `/`, `/one.css`, `/two.css`, `/three.css`; no image or
script read occurs. GET admission is counted before request construction: a
subsequent TLS rejection can consume an admission without writing a GET. Unit
rejection traces are labeled separately from the successful four-wire-GET case.
All tests finish with **zero calls to the synthetic forbidden underlying OS
resolver/connector seams**. No actual external test probe was used.

The fixture response explicitly says it is synthetic, and the API mode remains
`synthetic`; these are not IANA observations/evidence. The synthetic TLS stream
does not perform a real handshake or validate a live certificate. It verifies
the options and reuse of the protected reader; it cannot qualify actual IANA,
DNS, certificates, response size/content or network timing.

## Cold qualification and normal authoring

The dedicated worktree began without `.next`. No warm cache was copied. Existing
installed dependencies are a `node_modules` junction to the admitted Session 1
installation; this is dependency reuse, not a build/font-cache dependency.
Every cold production attempt used a fresh owned `.next`/`.next/cache`. Earlier
owned outputs were checked against the exact worktree path and moved intact to
`.local/guard-rehearsal/first-cold-output` and `second-cold-output`. Final dev
compiled into a previously absent `.next/dev` and its own cache. No recursive
deletion, dependency installation or font mock occurred.

```powershell
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
node scripts/offline-qualify.mjs node scripts/check-brand-url-production.mjs .local/guard-rehearsal/production-gates-final.json
$suites = Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $suites
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js scripts/support/offline-guard.cjs scripts/support/source-window.cjs scripts/support/source-reader.mts scripts/guard-compat-probe.cjs scripts/offline-canary-rehearsal.mjs tests/guard-compat.test.cjs tests/source-policy.test.cjs tests/support/guard-seams.cjs tests/support/guard-child.cjs tests/support/guard-contract.cjs tests/support/source-policy.mts
python scripts/audit-local-fonts.py
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/guard-rehearsal/rose-export
```

Results: 341/341 Campaign Lab tests, five focused guard/contract/policy tests,
TypeScript, focused lint and 26/26 embedded font/program/license audits pass.
Final cold webpack compilation: 50 seconds; build TypeScript: 15.5 seconds;
24 static pages, SRI finalization and two generated CSP hashes pass. Production
smoke covers CSP/nonce/hydration, security/auth boundaries, Open Graph and
development-only gates; the source API rejects before outbound work in production.
That negative test deliberately supplies ignored live opt-ins to the unavailable
production route, not to a functioning live reader.

Cold dev's normal offer route returned 200 in 18.7 seconds, followed by root,
login and Campaign Lab route compilation. The final normal API returned 200 for
synthetic evidence and local-test generation. All 22 final build process IDs,
including the 15 page-data workers, initialized closed with no live backend.
The final build blocked three Sentry telemetry calls before request construction.
Aggregated dev logs (earlier and final starts) block four npm version checks.
No font-loader request occurs; no non-loopback Node connection is admitted.
The Windows connection observation shows only loopback peers. Counts and raw
logs are in [`enforcement.json`](examples/guard-rehearsal/enforcement.json).

Browser assistance used the [Browser skill](C:/Users/joser/.codex/plugins/cache/openai-bundled/browser/26.1111.21308/skills/control-in-app-browser/SKILL.md)
and in-app Chromium: load the frozen Rose brief and exact packshot through native
file choosers, inspect five colors/two synthetic sources, select accent/page/
surface, explicitly Apply, separately attest offer/destination/media, generate
local-test output, wait for images/fonts, freshly approve and download the ZIP.
No hidden browser state or fetch was injected. An initial trial was stopped for
guard-header hardening before generation/export; the final journey used a fresh
tab and freshly loaded the original files. Cold navigation timeouts were followed
by visible DOM checks after compilation; they were not treated as app failures
or successful navigation until the page was visible.

Fresh local approval `3eafc0d2a1662f57` was recorded at
`2026-11-19T22:20:17.368Z`, exported at `22:20:17.846Z`.
[`rose-approved.zip`](examples/guard-rehearsal/rose-approved.zip) and its
[`receipt.json`](examples/guard-rehearsal/receipt.json) pass 13 file length/hash
checks, 23 archive references and HTML/receipt/revision agreement. Seven bundled
Inter programs match the admitted manifest. Packshot hash remains
`cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`.
Offer, destination, facts, alt text, media statement and template 1.0.1 are intact.
Imported source-byte/owner confirmation flags remain false, separately from the
operator's commercial/media attestations. This is local approval, not publication.

New HTML/CSS bytes are identical to the accepted font-session export; the new
909-px preview preserves the same 42.5301-px Inter heading, 40.8289-px line height,
two phrase lines and image fit. This preserves the previously accepted matching-
width appearance; it does not reuse the old approval. Normal-height desktop
1440×900 and mobile 375×812 captures accompany DOM geometry. No native direct-file
playback was attempted or inferred from archive checks. No font or Editorial
substitution/design work was performed; its accepted system-font limitation stays.

## Failures, preservation and limits

Saved first failures include the actual callback/promise reproduction, a test
expecting a source-specific error where the ordinary guard correctly rejected
earlier, and an integration refusal because a fractional timeout violated the
protected reader's integer option contract. Flooring the bounded timeout fixed
that refusal without changing the protected transport. The first TypeScript run
also required `NODE_ENV` in a typed minimal test environment. Those outputs stay
under `.local/guard-rehearsal`, with selected logs committed. Later exact-header
hardening repeated cold qualification from a fresh owned output; all prior
outputs are preserved. No failed evidence was deleted or reclassified as live
success. Source/control support commits and this evidence record remain separate.

[`preservation.json`](examples/guard-rehearsal/preservation.json) verifies all six
retired marker/ledger/failure records and all 19 retained bodies/373,051 bytes.
No old launch/execute command, marker reset/copy or fresh reservation was used.
Other worktrees and the dirty main checkout are preserved. The qualification
server is stopped after verification; no live-enabled server was started.

This remains trusted Node plumbing, **not an OS firewall or adversarial process
sandbox**. Native addons, external executables, deliberate monkey-patch removal,
unrelated unwrapped process APIs and alternate runtimes are outside that claim.
Only the tested Windows/Node environment and captured compilation children are
qualified. No actual external DNS/TLS/source transaction, paid call, external download,
upgrade, public CI, push, deployment or public-use claim follows from this task.
