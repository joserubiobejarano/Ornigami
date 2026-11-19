# Column-aware offer headlines

19 November 2026. Session 2 of `BRAND_LIVE_CANARY_TYPE_HANDOFF_20261119.md`.
Base `761e273a5b7b8cd601276d796393c95c2d5394fc`; branch
`codex/offer-column-type-20261119`, worktree
`C:/Users/joser/.local/ornigami-offer-column-type`.

The repeated four-word desktop stack is corrected without changing its text.
Rose/Fjord/Harbor Clear now use two balanced lines in the normal 354px copy
column. Morrow's longer approved opening retains a larger heading field and
natural wrapping. This is a presentation correction, not a brand extraction,
copywriting, network, motion or publication change.

## Change and version

Previously headline `cqi` units measured the whole campaign article, even after
its hero split into two columns. A 909px article produced 76.8px display type in
only 353.7px of copy width. The new CSS-module wrapper encloses **only the h1**
and establishes its usable inline-size container. Body/offer/detail/close type
still measures the original campaign container. Existing named campaign queries
and layouts remain intact; advertorial/story renderers are separate and unchanged.

Offer-led type is `clamp(2rem, calc(1rem + 7.5cqi), 4rem)`. The rem base retains
mobile presence while the gentler slope limits growth in a 600px single-column
pane. The editorial-layout formula is unchanged but now measures its own padded
heading field. Neither formula measures characters or depends on a brand/name.
There are no line clamps, fixed heights, rewritten words or JS sizing loops.
Heading-only `overflow-wrap:anywhere` provides an emergency escape for otherwise
unbreakable identifiers; `word-break` remains normal. Ordinary NBSP groups stay
together when they fit, and the source/canonical NBSP text is unchanged.

The offer template advances **1.0.0 → 1.0.1**. Its version already participates
in canonical revisions, so a historical approval cannot approve the new output.
Identity schema stays 6; direction, guidance, motion and advertorial versions do
not migrate. Tests compare old/new identity objects and prove their only change
is the offer template version, then reject the old approval against the new
revision. Historical receipts/exports remain unchanged and readable; an actual
approved 1.0.0 Rose archive was audited beside the four new archives.

## Frozen material and measurement method

[Frozen briefs, facts, themes and asset hashes](examples/offer-type/frozen.json)
record Rose/Fjord from the existing prepared briefs and PNGs, Harbor from `sparse`
and Morrow from `long-copy`, including its approved flow-control opening. Harbor
and Morrow retain their original CTA labels, destinations and selected facts.
For comparison, each campaign has fixed Clear and Editorial theme variants;
every variant's assets, palette, fonts, facts, offer, action and static motion
are identical between before and after. Rose/Fjord use the normal manual direction
path, without importing or changing a reviewed palette. This is synthetic material.

The offline specimen command uses the actual React `CampaignPage`/`PreviewImage`
renderer, real Next Image component, actual template builder and raw CSS module
with its local names. A test-only loader resolves TSX/aliases/CSS names for SSR.
Specimens are not approvals and do not simulate hydration or editor state. The
ordinary intake/generation/approval/export checks below independently cover those.
Stress variants are unapproved direct-render probes, not revised campaign claims
or export examples; their copied parent revisions are not approval evidence.

Existing local built font bytes are reused through Next's offline font hook—no
Arial substitution for Inter, no font download or family/source change. Geometry
is read from the DOM, with character Range rectangles for actual line text/count.
Both viewport and article/column widths are recorded. Measurements cover:

- 320, 375, 768 and 1440px viewports (1000px capture height).
- Independently constrained 600px and 909px article panes in a 1440px viewport.
- Four campaigns × two directions, plus long descriptive name, long unbroken
  identifier and NBSP probes in both directions: **168 measurements / 84 pairs**.

[Raw measurements](examples/offer-type/measurements.json) include heading/column
dimensions, font/line height, actual line text, offer/action/image positions and
overflow/load results. [Comparison](examples/offer-type/comparison.json) is the
compact numeric matrix. Before images use the original stylesheet and renderer;
after images use the final recipe. All retained final specimens loaded their
packshots. No source text, asset framing, offer/action dimensions or font family
was changed to improve a measurement.

| Specimen at 909px article | Heading column | Font before → after | Lines | Heading height | CTA top |
| --- | --- | --- | --- | --- | --- |
| Rose Clear | 353.7px | 76.8 → 42.53px | 4 → 2 | 294.9 → 81.7px | 504.7 → 378.3px |
| Fjord Clear | 353.7px | 76.8 → 42.53px | 4 → 2 | 294.9 → 81.7px | 504.7 → 378.3px |
| Harbor Clear | 353.7px | 76.8 → 42.53px | 4 → 2 | 294.9 → 81.7px | 554.7 → 410.3px |
| Morrow Clear | 821px | 76.36 → 68.96px | 4 → 3 | 302.4 → 204.8px | 798.7 → 701.2px |
| Morrow Editorial | 821px | 76.36 → 68.96px | 4 → 3 | 302.4 → 204.8px | 787.7 → 690.2px |

Offer/action top coordinates are relative to the specimen article; image/copy
vertical centering can move their starts. For Rose Clear, offer top moves
419.7 → 293.3px while its 70px block and the 52px CTA retain their sizes.
Editorial's full-width heading is a different composition: Rose stays one line,
Fjord moves two → one. It is not forced into the Clear column's line count.

At 320px, Clear uses 37px versus 37.6px before. In the 600px pane it uses 58px
versus 63px; the long descriptive Clear probe becomes four lines rather than
five. The identifier now wraps visibly instead of extending beyond its column
and being clipped by the article. All final pairs have no heading/document
overflow and keep readable type; no universal line-count assertion is applied
to long copy. One long tablet case loses its 15px vertical scrollbar, widening
the available article/image slightly. Its image aspect/contain framing remains
unchanged; the verifier explicitly distinguishes that from equal-width geometry.

## Visual assessment

[Capture gallery](examples/offer-type/GALLERY.md) supplies before/after desktop
and mobile views for all four campaigns/directions, plus Rose/Fjord 600px panes.

The Clear correction is materially better: product names read as phrases rather
than four isolated poster words, and the exact offer/action form a coherent group
beside the unchanged full packshot. The title remains distinct from 18px body
copy without overpowering the product. Harbor's quieter title gives its lede and
three facts room. Editorial retains its serif hierarchy and wider heading field;
Morrow's three-line desktop opening is calmer without suppressing its narrative.

Tradeoffs remain. Clear's shorter copy sits vertically centered with substantial
space above it beside a tall product image. That whitespace supports recognition,
but the composition is less dramatic. Editorial still gives substantial space to
the image/detail/closing sections; mobile offer/action can remain below the first
screen. Long names still require scrolling, and identifiers remain visually dense
despite becoming fully readable. This work deliberately does not reorder the
approved product/offer sequence or shorten copy to make those tradeoffs disappear.
The synthetic Rose/Fjord packshots are functional fixtures, not proof of customer
brand fidelity. Viewport captures and agent judgment are not independent usability.

## Normal generation, approval and export

Through the real `/campaign-lab/offer` UI: prepared brief → original PNG → exact
operator attestations → preview → local-test generation → fresh local approval →
ZIP. Direction changes locked the old export before regeneration. Final approved
examples (static, unchanged inputs) are committed as synthetic ZIPs:

| Campaign | Direction | Approved revision | Files |
| --- | --- | --- | --- |
| [Rose](examples/offer-type/final-rose-clear.zip) | Clear | `008c9297e41d08d4` | 13 |
| [Rose](examples/offer-type/final-rose-editorial.zip) | Editorial | `56d21bb267e85282` | 4 |
| [Fjord](examples/offer-type/final-fjord-clear.zip) | Clear | `48289216c9b39c22` | 13 |
| [Fjord](examples/offer-type/final-fjord-editorial.zip) | Editorial | `6c25b54b03177144` | 4 |

[Archive audit](examples/offer-type/export-audit.json) checks every receipt file
hash/length, asset hash/alt, commercial fields/facts, palette, direction, static
motion, references/fonts and HTML/receipt/revision agreement, including the old
1.0.0 archive. No historical receipt was edited. [Export parity](examples/offer-type/export-parity.json)
shows exact heading text, font size, line height and line breaks for all four
normal previews and their exact exported HTML/CSS at matching 909px article widths.
The preview viewport was 1440px; local HTTP export replay used 1425px to account
for the editor's scrollbar/shell difference. These are matched containers, not a
claim that all outer viewports produce identical shell widths.

The local-test provider chose the supported offer-led layout for these exports,
including Editorial direction; the deterministic wider editorial-layout specimens
above also exercise that layout. Clear normal/export type is 42.5301px and two
lines; Editorial normal/export type is 47.1449px and two lines. The renderer's
wrapper/container rules survive the real captured-style export extraction.

A separate normal mobile journey at actual 375×812 produced a 300px article,
35.5px two-line Fjord Editorial heading, no document overflow and a loaded image.
Keyboard focus on the CTA reported focus-visible with a 3px ink outline; the
destination was inspected without activating the external link.
[Mobile evidence](examples/offer-type/keyboard-mobile.json).
No direct-file navigation was attempted or bypassed. Local HTTP replay establishes
typography/reference behavior; native standalone-file playback remains unqualified.

## Reproduction and checks

Node 24.11.1, Windows x64; installed dependencies reused through an ignored
node_modules junction. The relevant installed Next CSS guide was read. No
dependency, URL/API/network source, palette/font family or shared checkpoint changed.

```powershell
# Existing local build supplies the same font bytes; this never fetches.
node scripts/support/offer-type-local-fonts.mjs C:/Users/joser/.local/ornigami-brand-url-session1/.next
$env:NEXT_FONT_GOOGLE_MOCKED_RESPONSES = (Join-Path (Get-Location) '.local/type-fonts/responses.cjs')
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:NODE_OPTIONS = '--require=./scripts/support/offer-type-offline.cjs'
$env:CAMPAIGN_LAB_GENERATION_PROVIDER = 'local-test'
$env:CAMPAIGN_LAB_GENERATION_LIVE = 'false'
$env:OPENAI_ENABLED = 'false'
# Use synthetic auth/Google placeholders as required by the local app; no dotenv.
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3152
# Separate terminal: real React/CSS specimens. Run before on the base source,
# then after on the final source, preserving before outputs.
node --experimental-strip-types scripts/support/offer-type-render.mjs before
node --experimental-strip-types scripts/support/offer-type-render.mjs after
node scripts/support/offer-type-serve.mjs
```

Set the browser viewport explicitly, navigate the local specimen URLs and read
`measureOfferType` from `scripts/support/offer-type-measure.mjs` through the
documented read-only browser evaluation API. URLs are `/before/rose-clear.html`,
`/after/rose-clear.html`, and analogous campaign/direction names; `-pane600` /
`-pane909` suffixes constrain content independently. The loader and fixture file
must be present at the same paths when reproducing baseline specimens in a fresh
base checkout; do not modify an existing source worktree to reproduce them.

```powershell
node --experimental-strip-types --test tests/campaign-lab-offer-type.test.mts tests/campaign-lab-revision-identity.test.mts tests/campaign-lab-export.test.mts tests/campaign-lab-advertorial.test.mts tests/campaign-lab-design-harness.test.mts
$suites = @(Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | Sort-Object Name | ForEach-Object { $_.FullName })
node --experimental-strip-types --test @suites
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/components/campaign-lab/campaign-page.tsx src/lib/campaign-lab/template.ts tests/campaign-lab-offer-type.test.mts tests/fixtures/campaign-lab/offer-type.mts tests/campaign-lab-advertorial.test.mts tests/campaign-lab-design-harness.test.mts scripts/support/offer-type-*.mjs scripts/support/offer-type-offline.cjs scripts/verify-offer-type-*.mts
node --experimental-strip-types scripts/verify-offer-type-evidence.mts
node --experimental-strip-types scripts/verify-offer-type-exports.mts
npm run build
node scripts/production-smoke.mjs
git diff --check
```

Final results: **55 focused and 321 complete Campaign Lab tests passed**, no failures/skips/cancellations;
whole-project TypeScript and focused lint passed; 168-measurement geometry/freeze
audit and five-archive/four-parity audit passed. Final optimized build, SRI/CSP
finalization and production smoke passed. Production checks cover CSP/nonce
behavior, protected/auth/provider boundaries and development-only Campaign Lab
page/generation gates. The offline preload denies external Node TCP connections
during the build; ordinary production source has no dependency on it.

Private `.local/typography/` retains developer/build/test logs, original ZIPs,
extracted archives, specimen HTML and superseded/failed trials. Initial font-hook
formatting prevented packaging a local font; corrected before retained baseline
and final captures. Early asset-replay paths were corrected and affected specimens
remeasured. The first pure-percentage scale was superseded by the final recipe.
An incorrectly labeled Clear archive was retained privately and replaced with a
freshly selected/generated/approved Editorial archive. Initial fixture format/type
and direction-comparison assertions were corrected, with failure logs preserved.
Inherited module-type/Sentry deprecation warnings remain.

UX: approved names read in phrases while exact terms and CTA stay together.
DX: one scoped renderer wrapper and one template patch serve preview/export.
AX: frozen inputs, measured lines, hashes and separate approval artifacts make
the comparison inspectable. Manual/no-website authoring and static default remain
available; no hosted live version was changed.

Remaining gates: other engines/devices/font availability, native direct-file
playback, independent customer usability, website typography extraction, general
brand fidelity, deployment egress and public release. No external website/model
request, paid call, dependency upgrade, push or deployment occurred. Session 1's
canary evidence was neither run nor modified; a later typography integration
requires fresh preview approval/export without another fetch.
