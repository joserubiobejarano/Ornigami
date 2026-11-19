# Experimental campaign presentation recipes

The development-only Campaign Lab editor has an **Experimental presentation**
selector for direct offers. This experiment keeps Taste as the existing visual
baseline. The original three-recipe experiment is followed by a bounded reuse
qualification of static/inspection pairs for Harbor Field and Morrow. Neither
experiment needs a model call or extends the proposal contract.

## Owned recipe contract

| Recipe | Purpose and behavior | Reduced motion / failure | Recommendation for this campaign |
| --- | --- | --- | --- |
| `none` | Static product and full offer; ordinary focus/press feedback; no enhancement script | Full readable campaign and native CTA | Retain as default/reference. |
| `quiet-product` | A single image emphasis: scale 1.025 → 1, 250 ms, `cubic-bezier(0.23, 1, 0.32, 1)`; no delayed copy or moving CTA | No entrance when reduced; cancel on preference change, offscreen or hidden document; never restart after cancellation; initialization failure stays static | Reject as default for this sparse campaign: adds no information. Keep only as an explicit experimental option. |
| `product-inspect` | Same approved packshot in native modal; click/tap/Enter; enlarge at native pixels, fit, directional pan buttons and native scrolling; Close, Escape, backdrop dismissal, focus restoration | Instant state changes and the same inspection under reduced motion; no dead trigger when initialization fails; no-JS/missing runtime retains original image and CTA | Retain as optional inspection, not a universal default. It makes the label/closure visible at mobile scale without adding a new claim or view. |

Recipes are defined in `src/lib/campaign-lab/motion.ts`; settings are closed,
typed, and resolved by owned code. There is no executable user configuration,
external service, animation dependency, drag requirement, looping decoration,
or scroll hijacking. The existing Motion package is not needed. Image fit is now
resolved from approved asset metadata/role; product heroes default to `contain`,
other roles to `cover`, and a reviewed asset may explicitly override fit. A
contained product hero in an arch uses the natural aspect without the compact
330 px cap; the arch mask remains. Framed/compact layouts keep their responsive
cap. This resolves the bottle crop and avoids narrow letterboxing in the arch,
with a documented increase in tablet scroll height. CTA
feedback uses opacity and focus outlines without moving the action.

## Preview, identity, and export

Selecting a recipe marks presentation pending, clears approval, and locks export.
The request captures both brief and recipe. Preview and recipe share one accepted
state and commit together only when the current request accepts a result or a
validated local fallback. Server rejection, local validation, edits during a
delayed request and stale responses preserve the complete last accepted article,
recipe, revision and runtime. Generate preview and approve again through the
existing flow. Rendered identity is now **version 6** (the original experiment
used 5), including effective fit/frame, recipe/settings, runtime version and a
change detector over the actual owned runtime and CSS. Recipe/runtime policy is
1.1.0; old receipts remain readable. A changed configuration cannot reuse approval.
The change detector is not a cryptographic provenance claim; packaged files
receive SHA-256 through the existing export receipt.

The Session 1 intake correction preserves optional `imageFit: "contain" | "cover"`
through source normalization and the normal pilot loader. Both source and
runtime manifest boundaries reject other supplied values with a named asset
issue. Omission retains role defaults; effective fit/frame uses the existing
identity 6 and receipt contract without a schema change. The reproducible
source-to-editor-to-export proof is documented in
[local pilots](./campaign-lab-pilots.md#synthetic-image-fit-contract-regression).
It changes no motion recipe, inspection behavior or model proposal authority.

Inspection uses existing approved page/surface/ink/muted/accent and button-radius
tokens for its controls, modal, focus, and restrained hover feedback. Neutral
CSS fallbacks cover missing tokens. The modal radius derives from the button
radius with a 16 px geometric cap; Morrow's pill controls do not force an arch
shape onto a dialog. The neutral dimming backdrop uses the ink token where
available. Fit view adapts to the available pane height, including wrapped
controls at 320×480. Native tap highlight is suppressed in favor of the existing
press feedback, preventing a stale tap rectangle over the newly opened image.

The Harbor Field reference now uses its already-supported `product-led` profile
mode: headline is the exact product name, and the complete discount/dates remain
in the offer. Product, offer, destination, facts and packshot are unchanged. This
baseline composition correction is shared by its static/inspection pair and is
not attributed to motion. Morrow retains its approved editorial opening.

Preview directly calls the self-contained `initializeCampaignMotion` function.
The export serializes that same function as a classic local `motion.js` script,
without eval, module imports, CDN requests or React. Its closed JSON configuration
and identity are checked against the HTML metadata and receipt. The fit/frame
decision also appears in metadata and the optional receipt field
`preview.imagePresentation`; historical receipts without it remain readable. The
normal
archive audit now accounts for the allowlisted `motion.js` reference and rejects
other script resources. `none` packages no enhancement script.

The sanitizer still strips scripts, styles and data attributes from the article.
It removes owned inspection UI before serialization and preserves the original
packshot. Owned CSS is packaged once, independently of open/zoomed state. Only
after sanitization does the exporter add the reviewed runtime/configuration.
Snapshotting is synchronous, including a detached settings object; the original
abort/cancellation-on-edit guard remains active through packaging. Every image
still uses the one approved local packshot. Font/license and historical receipt
handling remain intact; old receipts without motion or identity version remain
readable. This is local-preview approval, not owner or publication approval.

## Authoring sources and licenses

- Existing Taste adaptation: `Leonxlnx/taste-skill`, revision
  `f6b76575f949707b4e3c37cd86cb44b0b98643e8`, MIT. Its existing notice remains in
  `src/lib/campaign-lab/generation/guidance/TASTE-SKILL-LICENSE.txt`.
- Emil Kowalski: `https://github.com/emilkowalski/skills`, revision
  `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c`, MIT, copyright 2026 Emil Kowalski.
  Read `skills/animate/SKILL.md`, the button/modal sections of
  `skills/animate/RECIPES.md`, and its referenced `pick-ui-library/SKILL.md`.
  Only these files and LICENSE were fetched into ignored local guidance storage.
  The task's dependency/export constraints take precedence over the guide's
  library recommendation: use the browser's native dialog rather than adding a
  UI package. Keyboard inspection is instant, consistent with the guide's
  restraint rule. Ornigami's explicit static reduced-motion fallback also takes
  precedence over the guide's suggested opacity entrance.
- No global skill installation, automatic discovery, broad collection, paid
  reference, or optional Jakub review was used. No third-party runtime is shipped.
  `motion-NOTICE.txt` preserves source/revision and the MIT attribution in enhanced
  exports; the original implementation follows the repository's ownership terms.

## Reproduce

Use a dedicated builder worktree with its unchanged dependencies and no dotenv
files. Launch development with local-only Google/auth placeholders if required
by the legacy app shell; set `OPENAI_ENABLED=false` and
`CAMPAIGN_LAB_GENERATION_LIVE=false`. No real keys are needed. Where dependencies
are junction-linked, webpack avoids Turbopack's outside-root restriction.

```powershell
$env:OPENAI_ENABLED='false'
$env:CAMPAIGN_LAB_GENERATION_LIVE='false'
$env:GOOGLE_CLIENT_ID='offline-motion-placeholder'
$env:GOOGLE_CLIENT_SECRET='offline-motion-placeholder'
$env:AUTH_SECRET='offline-motion-local-only-placeholder'
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3140
# In another terminal, from the same worktree:
node --experimental-strip-types scripts/campaign-lab-motion-check.mjs --url http://127.0.0.1:3140 --out .local/motion-experiment/reproduction
node --experimental-strip-types scripts/campaign-lab-motion-state-check.mjs --url http://127.0.0.1:3140 --out .local/motion-reuse/state
node --experimental-strip-types scripts/campaign-lab-motion-check.mjs --url http://127.0.0.1:3140 --fixture sparse --recipes none,product-inspect --reuse --out .local/motion-reuse/harbor
node --experimental-strip-types scripts/campaign-lab-motion-check.mjs --url http://127.0.0.1:3140 --fixture long-copy --recipes none,product-inspect --reuse --out .local/motion-reuse/morrow
node --experimental-strip-types --test tests/campaign-lab*.test.mts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

The bounded checker intercepts generation with the same validated frozen preview
for every recipe. It uses the actual editor's approval/export handlers. It then
opens the ZIP's extracted `file://` pages in fresh offline Chromium contexts at
320, 375, 768 and 1440 px. It records source state, frozen input/profile/asset
hashes, canonical content parity, receipt agreement, all archive file hashes,
no overflow/external requests, actual WAAPI start/finish, reduced/no-JS/failure
states, keyboard/touch emulation, panning, repeated activation, dismissal/focus,
in-flight export cancellation, offscreen/preference interruptions and visibility
simulation. An export during enlarged inspection checks canonical snapshotting.
The checker writes a local comparison index, three ZIPs, captures, Playwright
traces, a machine-readable report, payload deltas, navigation timing and observed
layout shifts. Trace files can be opened with the installed Playwright CLI's
`show-trace` command; they require no recording codec.

Also run focused ESLint on the changed TS/TSX/test/checker files, `npm run build`,
`node scripts/production-smoke.mjs`, and verify production 404s for the Campaign
Lab pages and generation endpoint. Retain exact commands and outputs privately.
Do not weaken a gate or upgrade dependencies to hide an unrelated baseline issue.

## Evidence and limits

Private evidence is under `.local/motion-experiment/`. The final report identifies
the exact tested commit and final run directory. Earlier attempts remain there,
including the Turbopack dependency-junction restriction and missing video codec;
the checker uses traces/checkpoints rather than installing another tool.

This is one synthetic campaign in local Chromium on Windows. Touch is emulated;
physical phones, Safari, Firefox, screen readers and field performance are not
qualified. Headless tab activation did not expose a hidden document in the
recorded pre-commit check; native background behavior remains unassessed while
the visibility-event branch is tested explicitly by simulation. Local timing
and CLS observations are small samples, not conversion evidence or proof of a
performance advantage. Approval remains local. Static is a valid winner, and no
recipe is declared owner-approved or broadly adopted.

UX: the offer stays readable while inspection adds a reversible view of the
same product. DX: one owned function and closed recipe contract serve preview
and export. AX: named recipes, versioned identity and explicit fallback keep
selection and recovery bounded without expanding model authority.
