# Palette review usability qualification

20 November 2026, Europe/Madrid. Dedicated worktree `C:/Users/joser/.local/ornigami-palette-review-usability`, branch `codex/palette-review-usability-20261120`, from clean `13b1e9a8d62b76181b1bb0da6adfb7196945916e`.

The existing intake/editor review now has one paginated visual color browser, broad color names, search, source/opacity filters and three comparable pending role cards. Exact RGBA/category duplicates share a swatch without merging their evidence. Every observation can be inspected and explicitly assigned by its real candidate ID. UI colors and photo samples remain separate. Explicit Apply, existing server palette validation and ordinary generation/approval/export remain the acceptance boundary.

Runtime/test freeze: **`b079fbf7e56a3269c9124efc5f5176eec1f56951`**. The later evidence commit changes no runtime files. All 347 tests, TypeScript, focused lint, fresh production build and affected production gates passed at this freeze. A fresh normal browser journey on that source produced the export below. Earlier broader interaction checks used `9ee34da`; the only later implementation change made the keyboard-help paragraph visible. Current-source keyboard, desktop/mobile and complete authoring/export checks were repeated.

## Result and gallery

[Before/after gallery](examples/palette-review/GALLERY.md), [assistance record](examples/palette-review/assistance-record.json), [UI checks](examples/palette-review/ui-checks.json), [source/ID proof](examples/palette-review/final-export-proof.json).

The deterministic large fixture has 128 color observations: 120 UI observations, 23 UI color groups, eight photo observations/groups, cross-source duplicates, near colors, alpha and conditional/dark-theme uncertainty. Small and insufficient sets have three and zero UI candidates. CSS source records are synthetic schema fixtures with deterministic hashes/offsets; photo observations come from the existing fictional Rose evidence. They are not IANA data or a replay of missing live bodies. No live operational data was copied into fixtures.

Before: three color dropdowns, each 129 options including default, with no visual browsing. After: twelve swatches per page, a second UI page with eleven, one swatch tab stop per page, optional provenance inspection for the chosen color and compared pending roles. Search matches descriptive families, hex, source names, IDs, hints and uncertainty. Source/opacity filters affect groups while preserving every member. Source order is retained; no score/ranking or frequent-color brand-role inference is introduced.

Native buttons, labels and selects remain usable with Tab/Enter. Arrow keys move among visible swatches by row/column; Home/End reach visible endpoints. Import focus lands on the first role card. Keyboard guidance is visible and described to assistive technology. Search with no results leaves pending selections intact and exposes Clear filters. Small/empty views preserve manual/default setup. No new animation, font, template or generated-page design was introduced.

Source/ID integrity and grouping are implemented in `src/lib/campaign-lab/palette-browser.ts`; `brand-evidence-review.tsx` remains the existing shared intake/editor component. The existing `BrandEvidenceSelection`, `reviewPalette`, snapshot parser/resolver, generation controller and exporter are reused. The API/transport/import engine and source authority are unchanged.

## Working browser verification

All work used the ordinary development-only offer intake at `http://127.0.0.1:3041/campaign-lab/offer` with the unchanged offline launcher/guard and local fonts. The website-read control was not activated. Native file choosers supplied saved evidence, frozen Rose brief and original packshot.

Observed checks:

- Visual discovery and role assignment through swatches; source inspection was separate from discovery. The final accent was found with the plain-language query `blue` and keyboard interaction, then explicitly assigned. No JSON editing or numbered long-color-list search was used for assignment.
- Exact duplicate observations from base, dark-theme and conditional CSS remained separately selectable. The final snapshot references three original source IDs/hashes, preserving conditional uncertainty in the saved draft and inspection record.
- ArrowRight/Home/End and Enter moved/activated focus; current-source keyboard behavior was repeated with the visible hint. One swatch tab stop was observed on each visible page. This is not an independent screen-reader or OS accessibility audit.
- No-result search, clear filters, source filtering, alpha filtering and second-page access retained pending choices. Photo evidence had its own view and identity disclaimer, including an RGBA also present in the UI category.
- Alpha selection blocked Apply until an explicit opaque correction. `#888888` failed contrast; `#123456` recovered. An external white accent override immediately blocked validation; a valid override and direction change refreshed it, and clearing the override exposed the pending choice. No draft was mutated.
- A malformed replacement file displayed an error while retaining the valid draft, pending correction and enabled Apply. Existing file/URL delayed success/error/cancellation regressions passed; the shared latest-selection authority is unchanged. A failed replacement no longer strands the prior valid review behind the old import-error gate.
- Three role selections were compared and explicitly applied. Frozen commercial inputs/packshot were preserved. After initial local approval of `1af95a2d9eae59ba`, loading evidence, searching and changing pending selections kept export enabled and the rendered accent `#6b2340`. Explicit Apply of a changed accent cleared approval/locked export. Local generation, review and fresh approval then completed.
- A second fresh normal journey at the final freeze produced the final artifact. Both normal-height 1440×900 and 375×812 views were inspected; local Inter 600 and the 600×700 original packshot were loaded. Mobile document width stayed within the viewport. The browser viewport was reset.

[Approval preserved during pending review](examples/palette-review/pending-keeps-approval.txt) and [explicit Apply clears approval](examples/palette-review/apply-clears-approval.txt) retain the actual UI states. The browser capture API returns JPEG content-area pixels smaller than requested viewport dimensions; both measurements are disclosed, with no tall viewport substitutions.

## Fresh local approval and exact export

Approved/rendered revision: **`9bb8a66f71e530ae`**. Fresh approval recorded at `2026-11-20T01:10:53.689Z` (UTC), local-preview scope only.

[Actual downloaded ZIP](examples/palette-review/rose-final-approved.zip), [exact receipt](examples/palette-review/final-receipt.json), [audit](examples/palette-review/final-export-proof.json), [existing verifier output](examples/palette-review/logs/export-final-audit.log).

ZIP SHA-256: `290c6fba1e262db273d8b3477d4ffdd520056e53e7393f066a09550ebe781c78`.

The final selected roles are accent `#163f64`, page `#fff8fa`, surface `#f5e6ea`. Each selection links to its original candidate, original RGBA, source ID/hash, method and review status. No group ID or invented representative source enters the snapshot. Source bytes, owner, campaign-facts and media-rights approval flags in the imported snapshot remain false, separately from the visible exact commercial/media attestations and local-preview approval.

ZIP CRC, all 13 listed file hashes/lengths, 23 resource references, HTML/receipt/revision agreement, exact Unicode commercial values/facts, alt/rights and original packshot bytes pass. Packshot hash remains `cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`. Seven Inter programs match the admitted manifest; all 26 font metadata/license audits pass. The exported license text is byte-identical to the accepted archive. Styles/NOTICE are identical after exporter-derived font aliases are mapped to program hashes: this run uses loopback port 3041, the comparison archive used 3043. No licensing text or font was rewritten to pass.

The final desktop article is 909 px wide with a 42.5301 px heading / 40.8289 px line height; mobile is 300 px with 35.5 px / 34.08 px. Existing renderer, template 1.0.1, revision identity implementation, export/generation code and all public/font assets are unchanged Git objects. The editor change does not bump template or revision-identity versions. Original source/uncertainty remains in the draft/UI; the existing compact receipt does not contain all raw evidence or warnings. Keep the linked synthetic fixture/proof with the receipt. Native direct-file playback remains unassessed.

## Commands and results

```powershell
node --experimental-strip-types tests/support/palette-review-fixtures.mts
$env:NODE_OPTIONS='--require=C:/Users/joser/.local/ornigami-palette-review-usability/tests/support/palette-test-egress.cjs'
$env:PALETTE_TEST_EGRESS_LOG='C:/Users/joser/.local/ornigami-palette-review-usability/.local/palette-review/test-egress-current.jsonl'
$paletteSuites=Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $paletteSuites
Remove-Item Env:NODE_OPTIONS
Remove-Item Env:PALETTE_TEST_EGRESS_LOG
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/components/campaign-lab/brand-evidence-review.tsx src/lib/campaign-lab/palette-browser.ts tests/campaign-lab-palette-browser.test.mts tests/support/palette-review-fixtures.mts tests/support/palette-test-egress.cjs
node scripts/offline-qualify.mjs dev
node scripts/offline-qualify.mjs build
node scripts/offline-qualify.mjs node scripts/production-smoke.mjs
node scripts/offline-qualify.mjs node scripts/check-brand-url-production.mjs .local/palette-review/production-gates-final.json
python scripts/audit-local-fonts.py
node scripts/offline-qualify.mjs node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/palette-review/final-export
python .local/palette-review/audit-export.py rose-final-approved.zip
```

Results: **347/347** Campaign Lab tests (341 baseline plus six new grouping/selection tests), no failures/skips/cancellations on the final run; TypeScript and focused lint pass; cold webpack build, build TypeScript, 24 static pages, existing SRI/CSP finalizers, production smoke and development-only API/page gates pass. Production negative checks deliberately set ignored live booleans; the unavailable route rejected before source work. [Logs](examples/palette-review/logs/campaign-current.log), [production gates](examples/palette-review/logs/production-gates-final.json).

Both production attempts used fresh owned `.next` outputs; previous dev/build outputs were moved only within verified owned paths and remain preserved. Installed dependencies were reused by junction, without copying another worktree's cache or installing/upgrading anything. The final server cold-compiled its separate dev output. Closed guard/preload inheritance covers startup/build children, Node HTTP(S)/fetch/DNS/socket boundaries. [Enforcement](examples/palette-review/enforcement.json) records closed initializations and denied background work; no external dev/build socket delegation occurred. No native bridge/grant/approved record/claim or consumed launcher was used.

The first attempt to run the entire suite under the application guard failed 42 fixture expectations and cancelled one (304 passed), because that guard intentionally rejects the suite's injected transport/in-memory TLS paths. That raw failure is preserved. The final suite used a test-only physical DNS/socket fail-safe, allowing in-memory TLS while refusing every OS fallthrough, including loopback. All 43 observed test processes reported zero physical fallthrough and zero unexpected primitive calls; a separate negative DNS/TCP probe confirmed the fail-safe refuses before the OS. Production enforcement was never relaxed. This is trusted Node interception, not an OS firewall or adversarial-code sandbox.

## Preservation and limits

[Preservation](examples/palette-review/preservation.json) reconfirms six retired record hashes/lengths, nineteen retained failed bodies/373,051 bytes and the consumed native-canary claim unchanged. The dirty main checkout and other worktrees remain untouched. [Source identity](examples/palette-review/source-identity.json) pins unchanged runtime areas and tested implementation hashes. [Owned-server stop proof](examples/palette-review/stop-verification.json) shows no remaining recorded process/listener. Both owned dev trees were identity-checked before termination; production checks shut down their own servers.

[Failures](examples/palette-review/failures.json) records the incompatible first test harness, a NOTICE filename-alias audit assumption, initial cold browser timeout and an old error-tab policy refusal. All were preserved and resolved without a source-policy change or direct-file bypass. Raw logs, earlier successful ZIP, intermediate captures and outputs remain under `.local/palette-review`; final artifacts are separately named. No blocked surface is claimed as qualified.

UX: bounded swatches/search and compared roles replace repeated long color lists, with explicit Apply preserving accepted work. DX: one pure grouping/filter/selection helper and the existing review component; schema, controller, generation and export paths stay shared. AX: accessible names, bounded pagination, deterministic fixtures and exact candidate/source links make the same controls inspectable without hidden state injection.

Remaining usability limits: broad color-family names are approximate browsing aids; conditional/cascade/role applicability stays unresolved; alpha still needs an explicit hex correction. A very large duplicate group can still have a long provenance-observation selector. Only the current browser runtime and requested widths were exercised; independent neutral/customer usability, timed efficiency, screen readers, touch and other engines/devices remain unassessed. Full brand typography/layout recovery, hosting and publication are outside this task.

No actual external request was sent. Denied background attempts are retained in the guard logs. There were no paid calls, external downloads, dependency changes, new animations, push, deployment or publication. Local ZIP downloads are the existing export path. Assistance is disclosed; this is a completed bounded implementation/qualification, not an independent customer trial or an assertion of brand ownership.
