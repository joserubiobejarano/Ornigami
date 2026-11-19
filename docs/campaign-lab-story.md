# Bounded Morrow explanatory story — Session 2

## Definition-driven correction (19 November 2026)

The following section supersedes the original two-panel implementation and its
agent evidence claims below. Historical records remain in the Session 2 worktree.
The old final twelve static/instant/motion viewport filenames were misleading:
all corresponding final DOM records measured 1440 CSS px. They do not establish
responsive acceptance. The independent review's twelve genuinely measured app
captures are separate review evidence, not repairs to the old agent run.

`StoryDefinition` schema 1 is an app-owned typed, closed contract: ID/version,
campaign ID, sequence presentation and 2–3 unique copy/asset references with
approved roles, fact IDs and bounded control headings. Unknown configuration,
unsupported counts, missing copy/source records, wrong roles or ambiguous assets
fail before rendering/export. Content comes from the supplied catalog fixture,
never a global fixed campaign. The two registered definitions are
`morrow-rib-story` (prototype/rib detail) and `morrow-product-story` (adds the
approved product transition with the reviewed pour illustration). The third
beat's wording is exactly `advertorial.productTransition`; its underlying source
is the referenced approved interior fact, not a newly invented quotation or a
claim that the pour illustration demonstrates physical performance. Source roles,
review metadata and exact hashes remain attached to all three illustrations.

One renderer/runtime handles both lengths. Track/panel geometry and directional
translation derive from the validated count, retaining the existing 250 ms cue.
Static remains the default. Instant and motion are optional. Reduced motion uses
instant changes; initialization/image failure restores the complete static
narrative. Root/track transient state is excluded from canonical export capture.

The ordinary editor and story development route now share `usePreviewReview`:
approval state, revision-specific image gate, export eligibility/guard and async
packaging/cancellation. Both use the same readiness summary and existing snapshot
and bundle functions. Definition/mode edits synchronously revoke approval and
abort active packaging; every required image must load before approval. This is
shared internal machinery on a separate experimental route, not a general story
visual editor or public/customer intake integration.

Export captures a deep copy of the resolved definition and a minimal source
catalog synchronously with the article, assets, approval and guard. Packaging
re-resolves that captured source and verifies its content/config/runtime revision,
commercial fields, brand and asset records, rather than resolving global Morrow.
Story revision identity is now `product-story@2`; ordinary offer identity 6 and
historical single-image receipts remain compatible. Repository SVG permission
is an explicit app-owned registry of exact ID/path/hash/role records, including
pour. General packaging no longer contains two campaign-specific SVG paths.
Public SVG uploads, inline SVG, remote assets and executable customer config stay
unsupported. LF checkout rules preserve all three existing approved SVG hashes.

Fail-closed global lookup still throws a typed known ambiguity error with both
identities. Ordinary form/advertorial validation, initial state and generation
translate known missing/conflicting IDs into named actionable issues. Initial
load remains usable without approval; invalid edits retain the last valid
preview. The API returns structured 422 validation for this condition. Unrelated
exceptions are not indiscriminately caught. Fix source IDs and reload; no record
is silently selected or removed.

The existing archive auditor now supports two definitions:
`node --experimental-strip-types scripts/campaign-lab-story-audit.mjs <ignored-output> --definitions`.
Place actual approved browser downloads at `<output>/<definition-id>/<mode>.zip`.
It audits CRC, distinct exact-byte assets, provenance, all hashes/local references,
receipt/HTML identity, canonical equality per definition, and packaged runtime
logic at both lengths. Runtime VM checks are event doubles, not disconnected
browser, OS media or layout acceptance. Legacy three-archive invocation remains
supported for historical archive review.

For real app captures, use the browser skill and
`scripts/support/story-browser-evidence.mjs` through its supported Node execution
surface. Navigate first, wait for hydration/image readiness, then apply each
320/375/768/1440 viewport. The helper asserts actual innerWidth before and after
the article-only JPEG, records client width/DPR, article/panel/track geometry,
mode/definition, loaded-image count and screenshot pixel dimensions, and fails
mismatches. Captures use an explicitly recorded 3600px-high viewport so the whole
article fits without screenshot-induced resizing; unchanged client/article
geometry is asserted as well. These qualify responsive widths, not a physical
phone screen. Scrolled rectangles use document coordinates for capture.
Initial/selected states remain distinct. Do not infer viewport width
from a filename or count hidden content as an animation benefit.

Private final evidence/commands and the critical review live under
`C:/Users/joser/.local/ornigami-story-definitions/.local/story-definitions/`.
Direct-file browser playback remains unassessed following the prior protocol
denial; do not retry or bypass it. Touch, OS motion settings, other engines,
physical devices, screen readers and disconnected runtime networking remain
unassessed where unsupported. No claim of comprehension/conversion lift follows
from engineering reuse or valid exports.

## Historical Session 2 implementation notes

This manually selected local experiment starts at `23888acac288c3662ca99488d169f7c8cdfa0f43`, whose ancestry includes `9b44031`. Session 1 is retained unchanged. Run the development server and open `/campaign-lab/story?mode=static`, `instant`, or `motion`. These operator previews are development only; the standalone exports work without Next or a provider. This is not publication or owner adoption.

The same two-beat narrative, exact offer/destination/action, facts, brand tokens and illustration bytes serve all variants. `story.ts` closes the configuration over approved `prototype-wall` → `morrow-prototype` (product-evidence/body) and `rib-revision` → `morrow-ribs` (product-detail/interior). Text and source records come from the existing reviewed Morrow advertorial fixture; its story and hashes agree with the `rich-angle` evaluation case. The optional pour image is deliberately unused: showing water does not establish flow, taste, speed or performance. These are fictional synthetic illustrations, not experimental evidence or real-brand photographs.

Static exposes both beats in reading order. The other modes expose explicit numbered native buttons, with left/right/home/end keys and native tap activation. The same viewport and content track remain mounted. Instant changes selection without animation. Motion uses only a 250 ms transform transition and the established `cubic-bezier(0.23, 1, 0.32, 1)` curve: forward and backward travel preserve sequence direction and interrupted selections retarget from the current position. Keyboard changes and reduced motion remain instant. Panels retain their largest shared height to keep the facts and CTA stable; the shorter beat therefore has some empty space on mobile. Native page scrolling is untouched.

No-JS, missing runtime and failed initialization retain the complete canonical static narrative with hidden enhancement controls. Image failure restores that static state; alt text and story text remain. Every illustration must load before local approval/export. No entrance animation, autoplay, model recipe selection, new dependency or inspection modal was added. The existing inspection recipes and offer editor remain separate.

## Identity and export

The template-scoped `product-story@1` revision covers the full resolved brief, approved copy and fact source records, brand, assets (IDs, source, fit, hashes, rights, alt), closed configuration, owned runtime source and CSS. This detector is not a cryptographic provenance assertion; receipt files receive SHA-256. Each mode needs fresh local-preview approval. Changing modes reloads the preview and clears approval; revoke synchronously cancels asynchronous export via the existing guard. Configuration/runtime changes fail the current-config gate.

Export now optionally accepts the closed story and its asset list. Before awaiting anything it clones all asset records, configuration, article, approval and style inputs, and verifies every displayed image against its explicit approved ID/src/alt. Canonicalization removes enhancement selection, inert/hidden panel state, transforms, data/event hooks and executable content. Each image gets its own inert placeholder, later replaced by its own local file. Every fetched asset hash is checked; receipt `assets` retains the complete approved record plus local file and exported hash. The historical primary `asset` field and schema-1 receipts remain compatible. General customer SVG uploads and arbitrary inline SVG/scripts remain unsupported; only the two exact approved repository SVG records enter this story path. LF checkout rules preserve their approved bytes on Windows.

The existing `createCatalog` concatenation is retained, but `getAsset` now throws a named actionable ambiguity error when an ID appears more than once. A deliberate pilot/base conflict changes source, hash and contain/cover fit. The original source returns the base entry; this source rejects it. The story page displays that failure instead of rendering an ambiguous sequence. This is a bounded resolver correction, not a storage/tenant isolation redesign.

## Authoring and verification

Taste remains art direction through the approved Morrow tokens/composition. Only Emil Kowalski's focused `animate` guidance was read from the retained local snapshot, revision `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c`, MIT. The existing full notice is included in enhanced exports. No remote catalog, new library, model call or model authority was used. Project rules take precedence over the guidance's softer reduced-motion suggestion: reduction here means instant selection.

Focused contract tests: `node --experimental-strip-types --test tests/campaign-lab-story.test.mts`. Regressions: run all `tests/campaign-lab*.test.mts`, then TypeScript, focused ESLint, offline mocked-font production build and affected development-only route gates. The portable archive auditor is `node --experimental-strip-types scripts/campaign-lab-story-audit.mjs .local/story-session2 <baseline-worktree>` after copying the three normal browser downloads to `static.zip`, `instant.zip`, and `motion.zip`. It verifies CRC, every receipt hash, distinct image hashes/alt/provenance, identical canonical narrative, sanitization and local references, extracts previews and writes the comparison index.

Private evidence stays in ignored `.local/story-session2/`: exact commit, logs, three ZIPs/receipts, comparison index, viewport captures, measured transition frames, baseline collision and critical review. Browser coverage must distinguish actual app-browser input/playback from runtime event-double tests. The app browser supplies viewport resizing and DOM readings but no supported touch/media/network emulation or animation timeline API. Do not infer native device, OS reduced-motion, network-disconnection, other-engine, screen-reader or performance qualification from those doubles. Missing-runtime copies exercise the actual browser fallback surface; they are not an OS JavaScript-disable setting. No conversion/comprehension study was performed.

Recommendation: retain static as default. Retain instant as an optional compact sequence; its gain is reader-controlled focus and less simultaneous content, traded against hiding the second beat. Retain motion only as an experimental option: directional continuity is visible, but no measured understanding gain over instant has been established. Nothing warrants making animation the default. UX: full static recovery and stable offer/action. DX: one component/runtime plus legacy-compatible exporter and explicit ambiguity errors. AX: closed copy/fact/asset IDs and named gates, without provider authority expansion.
