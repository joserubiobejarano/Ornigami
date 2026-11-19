# Local font delivery and offline qualification — 19 November 2026

Worktree: `C:/Users/joser/.local/ornigami-offline-fonts`, branch
`codex/offline-fonts-egress-20261119`. Integration merge `40ba4bb463d85c50bb8b76580bf32af711538e87`
has parents `46f1691618942d9155e244b717b9ba6f6c9351a0` and
`0b37d62dd09c3768bc85429f9a7ffcd310f7c5e7`. Application/guard freeze before
the final cold build: `89f485d77103ba9e537f1a0a67d76fc9543693e5`. The final
clean commit adds the read-only metadata auditor, corrects the specimen console
font count and adds this record/evidence to that frozen tree; it does not change
application/guard code.

The normal Clear offer journey works offline. All five previously remote web
families now ship as unmodified admitted WOFF2 programs. A fully portable
Editorial font package is **not established**: its existing design explicitly
selects Georgia/Arial, whose web redistribution rights have not been established
locally. Those families were neither substituted nor copied. This qualification
preserves the accepted Windows typography; it does not claim platform-independent
Editorial appearance or permission to redistribute Microsoft fonts.

## Inventory and delivery

[`public/fonts/manifest.json`](../public/fonts/manifest.json) records every file's
SHA-256, length, embedded name IDs 0/1/16/14, variable axes, exact CSS unicode
range, declared weights, variable binding, provenance and matching notice.
The source is the pre-failure Session 1 build selected by the accepted typography
helper, `C:/Users/joser/.local/ornigami-brand-url-session1/.next/static/media`.
No failed-canary body was adopted as a font source. A later read-only hash audit
verified all 19 retained bodies/373,051 bytes against their old ledger. Runtime delivery uses only committed
`public/fonts` and `src/app/local-fonts.css`; no font hook or old build is needed.

| Family | Requested normal weights | Binding | Programs | Rights evidence |
| --- | --- | --- | --- | --- |
| Bricolage Grotesque | 700, 800 | `--font-display` | 3 | Embedded 2022 Bricolage Project copyright + SIL OFL URL |
| Inter | 400, 500, 600 | `--font-sans` | 7 | Embedded 2016 Inter Project copyright + OFL URL; existing export notice |
| Geist Mono | 400, 600 | `--font-mono` | 6 | Embedded 2024 Geist Project copyright + OFL URL |
| EB Garamond | 400, 500 | `--font-direction-display` | 7 | Embedded 2017 EB Garamond Project copyright + OFL URL; existing export notice |
| Jost | 400, 500, 600, 700 | `--font-direction-body` | 3 | Embedded 2020 Jost Project copyright + SIL OFL URL; existing export notice |

All programs are normal style; no italic binary was requested by these loaders.
Every inherited delivered subset/unicode range is retained, including non-Latin
subsets. The old loaders requested Latin preloading but delivered additional
subsets on demand. The exact inherited static weight descriptors over variable
programs are retained, including existing browser weight synthesis behavior.
Bricolage's embedded legacy family name is `Bricolage Grotesque 96pt ExtraBold`;
the manifest also records its typographic family and weight axis rather than
guessing identity from the filename. No binary was re-encoded or renamed inside
its font tables. Full family-specific OFL notices accompany all five families.

`src/lib/campaign-lab/font-licenses.ts` retains its existing matching rules for
the original three families and adds only **exact-name** matching for the two
identified local families. Unknown names containing Geist/Bricolage still fail;
their acceptance was not broadened through the historical alias matcher. Delivery
uses real family names, so it introduces no new generated alias acceptance.
The approved ZIP contains seven Inter programs, all hash-mapped back to the
admitted manifest, its Inter license and a notice. Receipt byte hashes,
references, frozen brief/packshot, palette provenance and false confirmation
flags pass the existing export auditor.

Georgia/Arial are intentional primary faces in `visual-directions.ts`; the
Morrow/story and older fixture stacks also name system faces. Generic/UI,
Arial, Georgia, Iowan Old Style, Palatino Linotype, Times New Roman, SFMono,
Menlo, Monaco, Consolas and Liberation Mono fallback names remain platform
stacks, not newly bundled fonts. [`system-font-limit.json`](examples/offline-fonts/system-font-limit.json)
records the concrete installed Arial regular/bold and Georgia regular file
hashes, embedded notices and absent admitted web redistribution evidence.
Regular Editorial Georgia is 400 and Arial body inherits the existing normal/
emphasized styles. No font-family, commercial copy, palette, fact, media or
template 1.0.1 sizing was changed to resolve that limit.

## Trusted qualification contract

Run from this checkout with its locked dependencies available:

```powershell
node scripts/offline-qualify.mjs dev
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
node scripts/offline-qualify.mjs node scripts/check-brand-url-production.mjs .local/offline/production-gates-final.json
```

The launcher accepts only `dev`, `build`, or explicit local `node` arguments.
It builds an environment without dotenv, provider credentials or the temporary
Google-font mock hook. URL mode is synthetic, URL live is false, OpenAI is off,
generation is local-test and auth values are synthetic. Dev binds only
`127.0.0.1:3041`. Build runs ordinary webpack production compilation followed by
the existing SRI/CSP scripts. It changes no application availability or transport
policy. The production-gate test deliberately supplies ignored live opt-ins to
an unavailable production route; it never enables a working live reader.

Before framework/application code, Node preloads `scripts/support/offline-guard.cjs`.
It denies non-loopback fetch, HTTP(S), HTTP/2, DNS (callback/promise/Resolver),
TCP and TLS paths; UDP sends are refused and UDP connects require loopback.
Only literal localhost/127.0.0.1/::1 are admitted, not private networks.
Windows IPC must be a local `\\.\pipe\` path. Local data/blob fetch is allowed
without a network exception. Child Node environments retain `NODE_OPTIONS`
and the audit log even when trusted scripts construct a small environment;
ESM builtin bindings are synchronized. Guard initialization is logged in the
Next CLI/server and compilation children, including all 15 page-data workers.

The existing synthetic reader uses Node HTTP parsing over an injected Duplex.
Only the fixture host `brand-url.example` in synthetic mode with an agent's own
injected connector can reach that parsing path. Its connector still encounters
the DNS/TCP/TLS boundaries. This is a logical synthetic HTTP operation, not a
network admission or protected-transport edit. No image/font/script source read
is introduced. Real external probe requests were never used to test the guard.

This is a trusted Node qualification boundary, **not an OS firewall**, packet
capture, adversarial JS sandbox or native-addon isolation. A hostile process
could replace monkey patches or launch an independent runtime. Only trusted
qualification commands are covered. Browser/OS networking is not intercepted;
all browser navigations and actual asset requests in this task were loopback.
Logs distinguish denial, Node connect calls, synthetic streams and initialization.
The sampled Windows connection table contains only loopback peers for the
qualification server. Zero admitted non-loopback Node connections is the
observed/guarded result, not a claim to monitor the entire computer.

## Reproduction and results

Installed dependencies were reused through a `node_modules` junction to the
existing Session 1 installation. No dependency was installed or upgraded.
No `.next` or font mock response was copied. Initial `.next` was absent; each
cold production attempt began with the owned `.next` absent. Prior owned outputs
were preserved by exact-path moves under `.local/offline`, never recursive
deletion. Dev uses its owned `.next/dev` output/cache. The first successful
cold dev output is `.local/offline/cold-dev-output`; later owned outputs and
all trials remain private under `.local/offline`.

```powershell
python scripts/audit-local-fonts.py
node --test tests/offline-guard.test.cjs
$suites = Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $suites
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/app/layout.tsx src/app/campaign-lab/page.tsx src/app/campaign-lab/direction/page.tsx src/app/campaign-lab/direction/preview/page.tsx src/lib/campaign-lab/font-licenses.ts scripts/offline-qualify.mjs scripts/support/offline-guard.cjs scripts/support/offer-type-render.mjs scripts/support/offer-type-serve.mjs tests/offline-guard.test.cjs tests/campaign-lab-local-fonts.test.mjs
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/support/offer-type-render.mjs after
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/offline/rose-export-final
```

Metadata audit: 26/26; guard seam/child/local-data tests: 3/3; complete Campaign
Lab discovery: 341/341 (339 inherited + two local-font cases), no skips;
TypeScript and focused lint pass. No remote font import remains in application
source. The inherited negative preflight/reservation tests remain unchanged and
pass in discovery; no live reservation/launcher was run.

Cold dev compiled root, login, normal offer and Campaign Lab. The private
Momisa direction/standalone direction modules compiled, but their actual page
content requires the absent private approved Momisa input and correctly shows
404; this is not a newly completed Momisa commercial journey. A supplemental
local specimen verifies all 13 requested family/weight combinations and Unicode
glyphs with `document.fonts.check`; production loopback responses for all 26
programs match admitted hashes. This supplements the normal app journey.

Final production build, SRI finalization, static CSP generation, production
smoke (including Open Graph, nonce/hydration/security/development gates) and
URL unavailable-before-source-work checks pass. Remaining blocked attempts are
Next package version checks (npm registry) and Sentry build telemetry. They were
refused before DNS/connect and are reported in `enforcement.json`; **no font
loader network attempt occurred**. Qualification does not treat blocked telemetry
as successful egress or a reason to relax enforcement.

## Browser journey and appearance

The agent used the [Browser skill](C:/Users/joser/.codex/plugins/cache/openai-bundled/browser/26.1111.21308/skills/control-in-app-browser/SKILL.md)
and the in-app Chromium browser. Frozen `docs/examples/brand-url/brief.json`
and `packshot.png` were loaded through the native file chooser. The exact Rose
brief, offer, destination, facts, media-rights statement and packshot hash
`cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`
remain unchanged. Synthetic URL `/rose` produced two evidence sources and five
UI colors, no raster evidence. The operator selected accent/page/surface,
explicitly applied, separately confirmed offer/destination/media, generated via
local-test, waited for image/font readiness, freshly approved and downloaded.

Final approved revision: `3eafc0d2a1662f57`. The final ZIP and separate receipt
are under `docs/examples/offline-fonts`. Evidence is neither owner confirmation
nor media rights: snapshot `ownerConfirmed`/`sourceBytesVerified` remain false,
and operator attestations retain their separate meaning.

At preview viewport 1440×900 and loopback export replay 1425×900 the article
is exactly 909 px wide. Heading 42.5301 px, line height 40.8289 px, two phrase
lines, heading/offer/action/image sizes and image fit agree exactly; see
`parity.json`. No appearance metric or font program changed from template 1.0.1,
so that version is preserved; approval was obtained anew, never restored.
All 24 Rose/Fjord/Harbor/Morrow × Clear/Editorial comparisons at 375/768/1440
and the accepted comparison height 1000 match prior font size/line height/line
breaks/article width, with no overflow. Separate normal-height 900/812 trials
are retained: Harbor's 812-height scrollbar reduces its column by 15 px and
correctly changes its responsive font size; that is not a changed font program.
Normal-height screenshots are viewport captures, never stretched tall pages.
Desktop DOM1440×900 produces a1425×891 bitmap and mobile DOM375×812 a360×780
bitmap in this app; the CSS measurements record actual DOM widths/heights.

Loopback archive replay and audits do not establish native `file:` playback.
The earlier direct-file surface remains blocked and was not retried or bypassed.
Other engines/devices, font synthesis differences and portable system-primary
Editorial rendering remain unqualified.

## Assistance, failures and preservation

This was agent-assisted, not an independent usability test. Assistance included
file selection, evidence-role selection, explicit attestations and approval,
viewport/scroll positioning, archive retention and audits. A new tab has no old
session brief: one final trial attempted confirmation before importing it and
was correctly disabled; importing the frozen brief resets prior selection, so
the source was reread and explicitly applied after import. No hidden browser
state was injected. Read-only font iteration returned no serialized faces in
the browser DOM scope; readiness checks, actual CSS and hash-verified font bytes
were used instead. Unsupported performance access and a guessed download-save
method failed; the supported download `path()` API retained the actual ZIP.
Navigation timeouts during cold compile were followed by visible DOM checks.
A stopped-server tab showed a blocked data error page; a fresh tab was used
for the authorized loopback workflow, without opening that data page.

The initial socket seam test exposed normalized-array handling, corrected before
cold startup. A Windows preload quoting failure prevented framework startup;
forward-slash paths fixed it. An over-strict high-level HTTP check refused the
injected synthetic stream without making an outbound request; the narrowly
described injected-stream path fixed this. An intermediate guard also refused
an empty-host local fetch during prerender while the build still passed; the
final guard explicitly supports data/blob fetch and passed another cold build.
Windows IPC was subsequently narrowed and the final cold build repeated.
An initial CJS lint failure was fixed with a scoped explanation. A supplemental
Unicode specimen was first written with the Windows default encoding and then
corrected to UTF-8. Early screenshots taken before paint/positioning are kept as
private trials, not presented as completed preview captures.
The final committed-artifact byte audit caught Git newline normalization in 11
text evidence files. A scoped evidence `.gitattributes` plus renormalized staging
preserves their original bytes; the audit was repeated against committed blobs.

All failed logs/outputs, the original guard source and intermediate archives
remain under `.local/offline`. Original failed-live bodies and worktrees were
untouched. `retired-records.json` reconciles both retired markers/ledgers against
their previously recorded hashes. Neither allowance was reset/reserved/reused.
No external request, download, paid/model call, upgrade, push or deployment was
performed. Qualification servers are stopped after verification; no live-enabled
server is started by this task.
