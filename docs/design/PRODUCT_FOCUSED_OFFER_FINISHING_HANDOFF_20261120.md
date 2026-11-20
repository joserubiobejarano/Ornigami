# Product-focused offer finishing pass: handoff

20 November 2026, Europe/Madrid. Implementation `c78bdae9421e1e42bd6b3fc8b77f2ec596bb125b` on `codex/product-focused-offer-finishing-20261120`, from accepted source `923f39962d4ecd0d6312bd1bed34797fc9283b94`.

## Scope delivered

This is one bounded presentation pass on the accepted direct-offer composition. It addresses only the two observed issues:

1. **Desktop separation.** Product focus `1.1.0` starts the desktop support block directly below the headline instead of anchoring it to the packshot baseline. The two-column frame and packshot position are unchanged.
2. **Reviewed emphasis.** Normal intake, preview, prepared JSON, session restoration and the browser HTTP boundary now expose the existing optional `offerPrice` exact-substring contract. Only the reviewed substring is wrapped. There is no currency search, price inference, reference-price inference or discount discovery.

The implementation keeps template `1.0.1`, visual direction `1.0.0`, rendered identity `6` and receipt schema version 1. The active composition recipe moves to `1.1.0`; historical receipts that name `1.0.0` remain readable, but do not reproduce the new pixel result.

## Before and after evidence

Normal-height viewport captures at 375×812, 768×1024 and 1440×900 are in ignored `.local/visual-finishing/`:

- Gallery: `.local/visual-finishing/index.html`
- Measurements: `before/results.json`, `after/results.json`
- Exports and receipts: `after/downloads/`, `after/extracted/`
- Audit: `.local/visual-finishing/audit-results.json` from `node .local/visual-finishing/audit.mjs`
- Logs: `.local/visual-finishing/campaign-tests-final.log`, `typescript-final.log`, `lint-final.log`, `build.log`, `production-smoke.log`

| Scenario | Desktop heading→offer before | After | Mobile/tablet result |
| --- | --- | --- | --- |
| Synthetic square, Clear | 85 px | 24 px | product order and 260/360 px contained packshot unchanged |
| Synthetic wide, Editorial long copy | 24 px | 24 px | long copy remains legible; reviewed date phrase wraps cleanly |
| Existing private Momisa, Editorial | 210 px | 24 px | product recognition and contained packshot preserved |

The exact reviewed `$9`, `$4.94` and synthetic date phrase appear only in the exact-match emphasis span. No horizontal overflow occurred at any measured viewport. Product image bounds, `contain` fit, DOM order, destinations and CTA labels stayed fixed.

Keyboard Tab reached the CTA with `:focus-visible`, a 3 px solid outline and 3 px offset. The CTA kept its exact `https://` destination, `_blank` target and `noopener noreferrer` relationship.

## Verification

- Campaign Lab tests: **367/367 pass**, including new exact-emphasis intake/API/renderer/revision/legacy-receipt checks.
- Whole-project TypeScript: pass.
- Focused ESLint on changed source/tests: pass.
- Offline build with webpack, SRI finalization and static CSP hashes: pass.
- Production smoke: pass, including development-only Campaign Lab/generation gates.
- Actual API boundary: valid reviewed emphasis `200`, non-matching substring `422` with an `offerPrice` issue, omitted field `200` with compatible default behavior.
- Fresh local approvals and exports: three synthetic/private ZIPs; 126 audit assertions passed for approval/revision agreement, composition `1.1.0`, exact offer/price/destination, HTML/receipt metadata, file lengths/hashes and original packshot bytes.
- Editing the reviewed emphasis after approval cleared approval and disabled export. A regenerated/freshly approved export preserved the exact inputs.

## Remaining subjective judgments

- The heavier emphasis is a taste choice; it is intentionally stronger without becoming a badge or link.
- The long-copy date phrase can wrap across lines at narrow widths. It remains readable and does not overflow; a shorter reviewed price is more visually compact.
- This is agent-assisted local evidence. Owner design adoption, independent customer usability, cross-engine/system-font parity, conversion performance, native direct-file playback, deployment and publication remain unassessed.
