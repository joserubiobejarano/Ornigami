# Palette filtered-observation correction

20 November 2026, Europe/Madrid. Dedicated `codex/palette-filter-selection-20261120` worktree at `C:/Users/joser/.local/ornigami-palette-filter-selection`, from clean `c6992856d3c17606bff9cbe469753fbb58ea1bf5`.

Runtime freeze: **`75eb49885d92518e63804d8919ca72f0e0748f54`**. The later evidence commit changes no runtime behavior. Both reported failures were reproduced in the actual browser before editing: a dark-theme source filter and the exact dark candidate-ID search opened base candidate `738273…d36b5`.

The correction shares one observation-matching helper between group filtering and inspection. The visual browser, all group members, role/Apply controls and original provenance remain intact. No importer, schema, renderer, template or revision identity was changed.

## Matching and explicit selection

- Source and every query word must match the same original observation. Group filtering retains the entire group; matching members are a separate view, never replacements for original evidence.
- Opening a swatch initially selects the exact candidate-ID match when present, otherwise the first matching observation in original source order. This is a deterministic default, not ranking or brand-role authority.
- Explicit member selection is bound to its normalized filter context. A different context resolves inspection from current matching members. Returning to an explicit selection's context can retain it; if it is outside those filters, disclosure remains mandatory before Use.
- Every original observation remains in the observation selector. Outside-filter options are marked; an outside selection displays a status identifying its source and a distinct `Use outside-filter…` action label.
- No-result groups hide inspection. Search/filter changes never call role selection or Apply. Pending corrections and accepted appearance remain unchanged. `Inspect selected observation` clears filters and explicitly inspects that role's actual candidate, including a non-first member.
- Explicit Use still chooses the inspected original candidate. Explicit Apply still uses the existing contrast/schema/resolver path and approval invalidation behavior. Existing photo separation, alpha correction, external override precedence and failed-import recovery remain shared.

Implementation is limited to `palette-browser.ts`, its existing review component wiring and six new focused regressions. Source and candidate identities are not synthesized during inspection.

## Actual interaction evidence

[Before/after interaction proof and captures](examples/palette-filter-selection/INTERACTIONS.md), [assistance](examples/palette-filter-selection/assistance-record.json), [source identity](examples/palette-filter-selection/source-identity.json).

The normal saved-evidence intake at loopback port 3041 reproduced both failures at the base, then verified the corrected source/default and exact-ID inspection. Tests included live filter changes with inspection open, contradictory source/query/no-result behavior, explicit outside-filter selection/Use, clearing filters and Inspect selected. All six original observations remained accessible.

Keyboard Enter was used to inspect and Use at requested desktop 1440×900 and mobile 375×812 widths. The unchanged palette browser and local source uncertainty remained visible. A malformed replacement retained valid choices/Apply. One automation click attempted Inspect selected while its existing disclosure had closed after Use; opening that disclosure resolved the interaction without code or policy changes. No product-test failure or blocked surface is claimed as passed.

After three filtered selections were applied, changing filters refreshed inspection to a different base surface observation. Inspect selected and the final receipt still referenced the original conditional source: pending/applied roles were not silently rewritten. Actual before/after DOM records are linked in INTERACTIONS.md. These checks are agent-assisted, not independent customer usability testing.

## Fresh normal campaign approval/export

The unchanged frozen Rose brief and original packshot were loaded by native file choosers. The operator recorded each inspected candidate before Use, explicitly applied the three roles, separately confirmed the exact offer/destination/media attestations, generated once with local-test, reviewed both widths, freshly approved and exported through existing controls. No website-read action, source authority, consumed launcher or paid call was used.

Approved/rendered revision: **`1af95a2d9eae59ba`**, fresh local-preview approval at `2026-11-20T01:36:00.778Z` (UTC).

[Actual ZIP](examples/palette-filter-selection/rose-approved.zip), [exact receipt](examples/palette-filter-selection/receipt.json), [inspected/selected/receipt audit](examples/palette-filter-selection/export-proof.json), [existing verifier result](examples/palette-filter-selection/logs/export-audit.log).

ZIP SHA-256: `22477b78eb7a7f9f5d566725cbcff0ed25b0bd5e9b53159a70adf438339838da`.

| Role | Inspected = selected = receipt candidate ID | Original source ID |
| --- | --- | --- |
| accent #6b2340 | `d99add5313115f0d416d72a34e938dcf83d1eb3af3310040f7cffaaa25324972` | `38f5b897ce20742f84fa48424e1424a20068b09b55aeb3a4fe8a6dc41cccc1cf` |
| page #fff8fa | `8961de6fff1fc4f57130bd78efbbea4791a98b81be2806dfc97f434a09799fee` | `1b652ea70ed7df06227d6043a9bb818eb6b29fef63a7c63de95c15d03430d4b7` |
| surface #f5e6ea | `fe9949cfe2c92626b62d28cad812ae4ce94e0d87cf64993b5c16388e822d58c4` | `3359975f0da2e8791868a1ce6d64c05d806b09a791db71e83b894d205a3107e1` |

The audit verifies all three candidate/source/hash links against both the actual pre-Use DOM records and the unchanged synthetic fixture. Conditional/theme uncertainty remains in the draft/proof, with source/owner/facts/media authority flags false in the compact snapshot. Commercial/media attestations are separate; local preview approval is not publication approval.

ZIP CRC, all 13 listed file hashes/lengths, 23 resource references, HTML/receipt/revision agreement, exact Unicode commercial inputs/facts/alt/rights and original packshot bytes pass. Packshot SHA-256 remains `cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`. Seven Inter programs match admitted assets; styles.css, the seven font binaries, license and NOTICE are byte-identical to the prior accepted export. The prior accepted ZIP remains separately at `docs/examples/palette-review/rose-final-approved.zip`, unchanged SHA-256 `290c6fba1e262db273d8b3477d4ffdd520056e53e7393f066a09550ebe781c78`.

[Desktop](examples/palette-filter-selection/preview-desktop.jpg) and [mobile](examples/palette-filter-selection/preview-mobile.jpg) previews preserve template 1.0.1 and the existing Inter geometry. Both have loaded original imagery/fonts and no mobile horizontal overflow. The renderer/identity implementation is unchanged; the different revision from the prior blue export reflects explicitly different selected palette/provenance, not a template bump. The existing receipt is compact, so retain the linked synthetic source and uncertainty proof alongside it. Native direct-file playback remains unassessed.

## Commands/results and closure

```powershell
node --experimental-strip-types --test tests/campaign-lab-palette-inspection.test.mts
$env:NODE_OPTIONS='--require=C:/Users/joser/.local/ornigami-palette-filter-selection/tests/support/palette-test-egress.cjs'
$env:PALETTE_TEST_EGRESS_LOG='C:/Users/joser/.local/ornigami-palette-filter-selection/.local/filter-selection/test-egress.jsonl'
$filterSuites=Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $filterSuites
Remove-Item Env:NODE_OPTIONS
Remove-Item Env:PALETTE_TEST_EGRESS_LOG
node node_modules/eslint/bin/eslint.js src/lib/campaign-lab/palette-browser.ts src/components/campaign-lab/brand-evidence-review.tsx tests/campaign-lab-palette-inspection.test.mts
node node_modules/typescript/bin/tsc --noEmit
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
node scripts/offline-qualify.mjs node scripts/check-brand-url-production.mjs .local/filter-selection/production-gates.json
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/filter-selection/export
```

Six focused regressions and **353/353** Campaign Lab tests pass (347 existing plus six), no skips/failures/cancellations. Focused lint, whole-project TypeScript, fresh owned production build, SRI/CSP finalizers, production smoke and development-only page/API gates pass. TypeScript ran only after stopping the development server, before build regenerated its types. No generated-type race was introduced.

Startup/build use the unchanged mandatory offline guard and admitted local fonts. Existing in-memory transport tests use the already accepted physical-network-denying preload. [Enforcement](examples/palette-filter-selection/enforcement.json) records closed initializations, denied background attempts and zero external socket delegation; all 44 test processes reported zero physical fallthrough/unexpected primitive calls. This is trusted Node interception, not an OS firewall or arbitrary-code sandbox.

The owned dev process tree was identity-checked and terminated; [stop proof](examples/palette-filter-selection/stop-verification.json) shows no remaining recorded process or port-3041 listener. Production checks closed their own servers. The prior dev output is retained under `.local/filter-selection/owned-dev-output`; build started from fresh owned outputs. No installed dependency or cache from another worktree was downloaded/copied. The dependency junction reuses installed modules only.

[Preservation](examples/palette-filter-selection/preservation.json) verifies six retired records, nineteen failed bodies/373,051 bytes and the consumed canary claim unchanged. No new authority record/claim or live transaction occurred. Other worktrees and the dirty main checkout were untouched.

Remaining limits are unchanged: no computed CSS/brand-role/ownership inference, no independent customer or native screen-reader/touch/cross-engine qualification, and no publication gate. Initial matching is a stable source-order convenience; intentionally selecting outside filters remains an explicit operator decision. No redesign, actual external requests, paid calls, external downloads, dependency changes, push, CI or deployment occurred. The ZIP download is the existing local export path.
