# Native source adapter and normal-route bridge — offline qualification

20 November 2026, Europe/Madrid. Dedicated worktree
`C:/Users/joser/.local/ornigami-live-source-adapter`, branch
`codex/live-source-adapter-20261119`, base
`9d9724055f874dd8d91805f333f2070a818bdd2a`.

The native backend now exists and genuinely captures/delegates to Node Resolver
and TLS primitives by default. The normal brand-evidence route receives it from
trusted local control. Current qualification replaces only the physical calls
before capture, so **all source bytes and wire events here are simulated**.
No IANA request, actual external DNS/TCP/TLS operation, live reservation or
owner-approved execution record was made.

Final functional guard/bridge freeze for cold build:
`882e9bf1124b9d7d043d3b271cf2fbc2bf214f46`. Browser server source and final
test-support head: `ec0f47f042309353c756e715636d375d964c3baf`; that later commit
only adds background-refusal assertions. Application, support and evidence
commits remain distinct. The final evidence commit changes no runtime source.

## Wiring map

| Layer | Concrete implementation / responsibility |
| --- | --- |
| Readiness entry | `scripts/native-source-readiness.mjs`: default offline tests; optional **only** `--serve-simulated`. No public live/execute option. |
| Trusted runner | `native-run-control.mjs`: validate fixed plan/SHA before claim/startup; choose physical instrumentation only for offline simulation; fork the qualification server with mandatory guard preloads and safe environment. |
| Private control | Parent/child Node IPC after closed startup/compilation. Child revalidates plan and record digest; no HTTP arming route. |
| Server | `native-app-server.mjs`: standard Next request handler on loopback, existing router; closed bridge installed before `app.prepare()`. Warm root/login/offer and invalid API input before accepting the parent's one-shot grant. No replacement API/generation/export handler. |
| Normal route | `src/app/api/campaign-lab/brand-evidence/route.ts` supplies `registeredSourceBridge` to the existing `createBrandUrlHandler`. |
| Existing handler | Availability, mode, origin, body schema/limits and concurrency checks precede bridge/reader work. Environment-only live mode without a bridge now returns 503, before reader creation. Absent/off and ordinary synthetic behavior remain available; production still returns 404 first. |
| App adapter | `brand-source-bridge.ts` composes the existing `createPublicResourceReader` with trusted control. The global Symbol holds functions from the preload's **same** controller/AsyncLocalStorage module, rather than a second bundled controller instance. |
| Controller | `source-window.cjs`: explicit `synthetic` versus registered `native` backend; one transaction, scoped sequential reader, fixed hostname/GET/header contract, address/TLS/TCP phases, entity reservations and closure. The old synthetic backend/tests remain supported. |
| Native backend | `native-backend.cjs`: private captures of `Resolver.prototype.resolve4/resolve6` and `tls.connect`, before the guard patches them. Every delegation checks owned controller/backend/phase first. Only the bound numeric connection during that TLS call can pass the Socket guard. |
| Existing UI | Website URL → evidence panel → explicit Apply → existing local-test generation → fresh local approval → existing standalone export. No picker, renderer, model pipeline or export implementation was added. |

The adapter uses the ordinary protected reader's Resolver semantics: a fresh
Resolver, A and AAAA queries, ENODATA/ENOTFOUND handling, cancellation and combined
answer validation. This is **not** the previous rehearsal adapter's `dns.lookup`
path. The protected reader itself, address policy, TLS identity callback, redirect,
framing, header/entity limits and deadline implementation are unchanged.

The adapter forwards the protected reader's own DNS abort signal as well as the
source-window signal. A focused test holds both native resolver queries and
proves resource timeout cancels them **before transaction finally**, rather than
waiting for the outer ten-second window. Native TLS retains the reader's numeric
host/family, IANA SNI, `rejectUnauthorized:true`, identity callback and HTTP/1.1
ALPN. Its pinned lookup callback cannot substitute another DNS destination.

## Authority and future execution contract

The fixed policy is one existing brand-evidence transaction, first seed
`https://www.iana.org/`, HTTPS/443/GET only, at most four admitted GETs including
redirects, 1 MiB conservative entity reservations and a single ten-second source
deadline. Only HTML and directly linked CSS are eligible. No third-party hosts,
numeric URL targets, credentials, arbitrary headers/options, images/fonts/scripts,
raw public TCP permission, model configuration or public host maps are admitted.

Captured primitives are private closures, **not unconditional network access**.
They require the registered backend identity and owned resolving/TLS phase.
TCP admission is a one-use, exact address/family/443 ticket while the validated
native TLS primitive is executing. Outside that phase the original default-deny
guard remains active. Full DNS answer sets are checked/frozen; a public first
answer does not excuse a later private answer. HTTP Host/SNI/certificate identity
remain bound to the approved hostname. Source authority closes on completion,
cancel/deadline/budget, and is not inherited by startup work, compilation workers
or normal children. The corrected execFile callback/promise/preload contracts
remain unchanged and green.

The normal route cannot construct a grant from URL/body/Origin/boolean fields.
The trusted server's bridge is initially unarmed and stays closed during warm
compilation. Private IPC can arm one dormant controller; only its matching API
action enters the scope. A consumed controller cannot be rearmed or reused.
Generation/export occur on separate requests after the source transaction closes.

For a **later** real execution, the executable trusted function is
`startSourceApplication({plan, recordPath})`. It has no public CLI/HTTP counterpart.
Its `owner-approved-native` branch exists; it does not load physical fixtures.
It requires all of the following, none supplied as an approval here:

1. A fresh explicit bounded owner instruction after review of the exact clean SHA.
2. An owner-supplied immutable approval record matching that SHA and the exact
   fixed policy, required approval status/instruction and a new run ID.
3. A matching strict plan (kind, source SHA and fixed seed only). Missing,
   unapproved, malformed or wrong-source plans fail before claim/startup/network.
4. An exclusive claim under `~/.local/ornigami-source-execution-claims/`, keyed by
   the record's run ID. Copying the record/worktree does not select a fresh claim
   path. No automatic renewal, retry or marker reset exists.
5. Revalidation of record content/digest across parent/child IPC before arming.
   A changed record cannot acquire the already-claimed authority.

No approved record, claim directory or claim file was created during this task.
No retired launcher was invoked or reused. The current default command never
selects that owner-approved branch. Future actual DNS/TLS/IANA behavior, record
creation and the authorized real run remain to be reviewed/exercised; this
document does not authorize them.

## Exact native-path offline proof

```powershell
node scripts/native-source-readiness.mjs
node scripts/native-source-readiness.mjs --serve-simulated
```

Run readiness directly, not beneath another guard launcher. Its preflight
refuses an already loaded parent guard, whose mandatory child environment could
otherwise replace test preloads. Physical instrumentation must precede native
capture. Both the native contract and simulated server verify capture identity
before any source operation; a late-instrumentation test uses a separate physical
fail-safe and proves refusal with zero captured calls. The approved-native server
branch conversely refuses an instrumented capture.

`native-fixtures.cjs` intercepts physical Resolver/TLS/socket calls before capture,
preserves actual loopback app traffic and refuses external OS fall-through. It
does not replace the controller, existing API factory, app adapter, protected
reader or HTTP parser. An admitted native TLS seam passes through the bound TCP
guard to its instrumented primitive. This is positive delegation evidence, not
just an import-string/never-reached-backend check.

[`native-contract.json`](examples/native-source/native-contract.json) records ten
scenario groups and all instrumented admissions. Seven top-level focused tests
pass: two native tests plus the five accepted guard/compatibility/policy tests.

| Case | Verified result |
| --- | --- |
| Unowned backend | Captured Resolver/TLS not called. |
| Admitted native read | Two captured resolver methods, one native TLS seam, one bound TCP seam and one HTTP GET wire event reached; completion closes authority. |
| Full answers/errors | Mixed public/private answers reject before TLS; native resolver and TLS failures terminate without a GET wire event. |
| Invalid scope | Wrong host/protocol/port/credentials/numeric URL/method/binding rejected before relevant captures. Raw TCP, fonts, npm update, Sentry, third-party requests and fetch remain refused during owned source reads. An ordinary child gets no source scope. |
| Redirects | Same-host loops stop at four admissions/wire GETs; a third-party redirect stops after the first GET, before its DNS. |
| Bytes | Exact 1 MiB succeeds then closes budget; one-byte-over fails and retains the full conservative reservation. |
| Cancel/deadline | Pending native DNS is cancelled; deadline/cancel closes authority; second transactions/closed continuations refuse. Reader-specific DNS timeout propagation is separately asserted. |
| Real TLS engine | Existing public test CA/cert and in-memory wire are reused through the captured-native seam. ClientHello SNI is IANA; Node rejects the admitted `brand.example` test certificate with `ERR_TLS_CERT_ALTNAME_INVALID`; no HTTP GET is written. |
| Plans/gates | Missing/unapproved/wrong plans refuse before startup/claim; live env flags alone return 503; production/off gates precede reader work. |
| Normal handler | Installed trusted bridge reaches the same native backend and emits synthetic mode plus an explicit simulation gap; second action fails without renewal. |

The inherited Campaign Lab suite also exercises successful real TLS-engine
handshakes and the accepted transport failures over admitted in-memory fixtures.
No test cert purports to be an IANA credential; no new cert was fabricated.
There is no successful physical IANA TLS/network claim here.

GET admissions are counted before construction; DNS/TLS failure may consume an
admission without wire bytes. Both are reported separately. Controller trace
`synthetic:false` identifies the **native backend kind**, not physical live I/O;
the surrounding `physical:simulation` and seam `instrumented-no-OS` / wire
`simulated:true` fields explicitly describe this run. Physical external OS calls
are zero in the instrumented tests; this is not an OS packet/firewall claim.

## Normal browser journey and fresh export

The final normal Next route, not a separate injected-handler demo, was exercised
at `http://127.0.0.1:3043/campaign-lab/offer` using the Browser skill. The trusted
runner warmed root/login/offer and an invalid API POST while unarmed, then armed
the one controller privately. The operator loaded the unchanged Rose brief and
packshot using native file choosers, entered the fixed target URL and clicked
the existing Read website colors button.

The panel explicitly displayed **Synthetic evidence — no website was contacted**
and `SOURCE_NETWORK_SIMULATED`, with two sources/five colors/zero raster colors.
The source bytes are the existing app-owned synthetic fixture, replayed as the
target inside instrumentation, not actual IANA evidence. `/theme.png` is the
admitted misleading filename for a directly linked **text/css** response; no
image is fetched/decoded. Source hashes remain unverified imported claims.

The final server trace proves startup/preparation/armed-idle all closed with zero
native calls. The one actual API action then reached **four resolver method
seams, two native TLS seams, two bound TCP seams and two simulated wire GETs**
(`/`, `/theme.png`), charged 478 entity bytes, and closed. The native seam log
still has exactly those ten rows after generation and export. No refetch or
source authority accompanies either later operation.

The operator explicitly selected/applied the same supported palette roles,
separately confirmed exact offer/destination/media rights, generated local-test
output, checked image/font readiness, freshly approved and exported. Assistance
was agent-driven file selection, review/Apply, confirmations, viewport/scroll
positioning and artifact retention; no hidden browser state or fetch was injected.
This is not an independent usability test. An earlier partial source/generation
trial was preserved before the DNS-signal correction; the final journey used a
new server/controller/tab and freshly loaded original files.

Fresh local revision: **`857e1840864dd44f`**, approved
`2026-11-19T23:18:12.419Z`. The changed revision from the accepted export reflects
changed evidence provenance, not changed campaign content or typography.
[`rose-approved.zip`](examples/native-source/rose-approved.zip) and the matching
[`receipt.json`](examples/native-source/receipt.json) pass 13 file hashes/lengths,
23 references and HTML/receipt/revision agreement. The frozen offer, destination,
facts, alt text, rights statement and packshot hash
`cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`
remain exact. Owner/source verification flags remain false and separate from
operator commercial/media attestations.

The existing compact receipt intentionally does not copy source URLs or raw
draft gaps; its provenance is `imported-claims-unverified`. Simulation is labeled
in the API/review and run evidence, not inferred as real from compact hashes.
Raw fixture HTML/CSS and the target website URL are absent from the receipt;
no raw-source/model or new receipt schema was introduced.

Seven Inter binaries match the admitted manifest, and all 26 font metadata/
license audits pass. The new 909-px preview preserves 42.5301-px heading size,
40.8289-px line height, two phrase lines and accepted image fit. Export CSS is
identical after local font references are mapped to program hashes: the existing
exporter derives font aliases from source URLs, so port 3043 changes filenames
relative to the accepted port-3041 archive. No binary, declaration, weight,
unicode range, font family or template 1.0.1 design changed. Normal-height
1440×900 desktop and 375×812 mobile captures accompany DOM geometry.
Native direct-file playback was not attempted or inferred from archive checks.

## Commands, cold results and preservation

```powershell
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
node scripts/offline-qualify.mjs node scripts/check-brand-url-production.mjs .local/native-adapter/production-gates.json
$suites = Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $suites
node node_modules/typescript/bin/tsc --noEmit
python scripts/audit-local-fonts.py
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/native-adapter/rose-export
```

Full focused-lint file list and zero exit statuses are retained in the logs/source
record. Results: **341/341** Campaign Lab tests; **7/7** focused tests; TypeScript,
focused lint, 26 font audits, cold production build, SRI/CSP and production smoke/
development-only API gates pass. The negative production test deliberately sets
ignored live opt-ins on an unavailable route, never a working source grant.

Each production attempt started with fresh owned build/cache outputs. Earlier
outputs are intact under `.local/native-adapter/first-cold-output` and
`pre-dns-signal-output`; no warm cache or font mock was copied. Final production
webpack compilation took 40 seconds, build TypeScript 11.7 seconds, 24 static
pages 3 seconds, then existing SRI/CSP finalizers passed. Dev's separate
`.next/dev` cache was absent before final startup; closed warm root/login/offer
compilation took 14.3/6.0/5.9 seconds. Installed dependencies are reused by the
existing junction, with no installation or upgrade.

Failures are preserved under `.local/native-adapter`: initial TypeScript optional
shape/inference errors; a raw-TCP error-code difference corrected by retaining the
ordinary deny path outside the native TCP phase; the reader-specific DNS-signal
finding; and two over-specific audit assumptions (raw API gaps in a compact
snapshot, identical aliases across changed loopback ports). Those last assertions
were replaced with the actual existing contracts and program/CSS identity checks;
no application/export change was made to force them to pass. All cold intermediate
outputs and the partial UI trial remain intact.

Retired-record/body checks reconfirm all six referenced artifacts and all 19
failed bodies/373,051 bytes unchanged. Accepted public assets, font/license and
template/render/export sources remain unchanged. Other worktrees and the dirty
main checkout are preserved. Qualification servers are stopped at completion;
no live-enabled server, actual external request, live reservation, paid call,
external download, upgrade, public CI, push or deployment was introduced.

Remaining limits: trusted Node plumbing is not an OS firewall/adversarial code
sandbox; native addons/unrelated executable escape surfaces are not isolated.
Only tested Windows/Node 24.11.1 and captured children are qualified. Actual
external DNS/TLS/IANA availability, live wire timing/content, successful owner-
approved record/claim execution and other engines/devices remain unexercised.
The accepted Editorial system-font choice is untouched, not redesigned or newly
licensed. Future execution requires the separate fresh prerequisites above.
