# Saved brand evidence review and application

Current optional URL entry uses the same review/apply path: [Session 1 HTML/CSS URL workflow](./campaign-lab-brand-url.md), development-only and non-live by default. This saved-file acceptance remains retained evidence.

Follow-up: [combined recovery and TLS verification](./campaign-lab-brand-recovery.md)
demonstrates and fixes external-control recovery, simplifies evidence defaults,
and verifies a fresh local approval/export with both histories preserved.

19 November 2026. Base `fb293a03135dd90e2cd07ff8d3fa9d2fdafdd775`; branch `codex/brand-review-apply-20261119`; worktree `C:/Users/joser/.local/ornigami-brand-review-apply`. The requested integration worktree already existed clean at the base. It, all other worktrees and the dirty legacy checkout were preserved.

The normal `/campaign-lab/offer` intake and ordinary editor accept optional **Brand evidence JSON**. An operator selects/corrects supported roles, applies a compact snapshot, generates with the existing resolver, inspects, locally approves and downloads the exact approved appearance. No parallel renderer or export path was added.

## Contract

Draft/extractor remain `1.0.0` / `ornigami-brand-evidence/1.0.0`. A 512 KiB file limit is checked before reading, and UTF-8 bytes are checked again before JSON parsing. Strict schemas bound counts, lengths, IDs/hashes, offsets, methods/categories, duplicate IDs and source/hash references. Unknown executable/catalog/token configuration and purported approvals are rejected. React renders evidence as plain text; references are never followed.

The new separately versioned, parsed/frozen `ornigami-brand-snapshot/1.0.0` supports only `accent`, `page`, `surface`, with 1–3 explicit selections. Each retains candidate/source IDs, source hash, original RGBA, selected opaque value, method/category and selected/corrected status. Schema/extractor and local-review method are recorded. No draft/source quotes are sent through generation or export. All four snapshot authority flags remain false: owner, campaign facts, media rights and original source bytes. Importing a hash verifies neither original website bytes nor authenticity.

Opaque six-digit colors only: translucency remains evidence and requires an explicit opaque correction. UI and photograph samples are distinct groups. Photograph frequency is never automatic UI identity. Explicit accent override wins, then reviewed role, then direction default. Removing the override exposes the reviewed role. Direction typography/geometry and all unselected roles remain app-owned.

Contrast rejects invalid combinations without rewriting evidence: 4.5:1 for ink/page, muted/page, accent/page, action ink/accent, ink and accent on the rendered 9% accent offer tint, detail ink/background and the 62% detail-label composite. Focus uses ink on page, exceeding its 3:1 requirement. Surface is the image frame; no text is rendered on it. The renderer owns dependent action ink.

Applying/removing a palette, editing appearance or switching direction clears approval and invalidates/aborts old requests. The last valid preview remains until a current replacement arrives. The browser brief, server and local fallback use the same app-owned resolver. Effective tokens and compact provenance participate in existing rendered identity/appearance metadata; old ordinary briefs and receipt schema 1 remain readable. No client catalog, token map, clock or transport is accepted.

Session storage contains text, compact snapshot and override intent, never raw draft/source text, File/blob, commercial confirmations or preview approval. Refresh requires packshot reselection, confirmations and fresh review. Replacing a prepared brief clears unrelated kit/review state. Invalid prepared snapshots (including contrast failures) are rejected atomically, and intake palette errors are shown beside the accent control. Invalid persisted snapshots are rejected; unfinished legacy accent text stays recoverable for correction before generation.

## Healthy-image correction

Import ledger `ornigami-brand-import/1.1.0` separates `evidenceWarnings` from `extractionFailures`. Successfully sampled raster caveats remain on their sources and in warnings, and no longer force partial status. Unsupported, corrupt, missing or unresolved resources remain partial/incomplete. Completion grants no approval. The type retains readable v1.0 ledgers; historical committed v1.0 examples were preserved.

## Actual browser journey and revisions

Frozen local campaigns: [Rose](examples/brand-review/rose/) and [Fjord](examples/brand-review/fjord/), including source HTML, packshot, prepared brief, saved draft, snapshot and downloaded receipts. Fjord contains useful partial evidence: unresolved CSS and an unsupported SVG.

| Browser action | Observed result |
| --- | --- |
| Rose brief, packshot, exact confirmations, saved evidence and three role selections | Ordinary intake/editor preserved commercial inputs and approved media. |
| Local-test success → inspect → approve → ZIP | `8b3a10b42f5a9785`, Clear with rose palette. |
| Invalid JSON after approval; valid same-file evidence retries | Invalid Apply blocked; approved preview/export preserved. Valid retry succeeded. |
| Translucent candidate; propose white correction | Alpha warning retained; low contrast rejected. |
| Opaque `#123456` correction → Apply | Export immediately locked; previous valid preview retained until generation. Original `#12345680` remains in snapshot. |
| Override `#6b2340` → generate; remove override → Editorial → generate | Override won, removal exposed the correction, direction changed without changing campaign inputs. |
| Refresh/restoration and reselection | Compact correction/override restored; packshot, confirmations and approval did not. |
| Corrected fresh approval/export | `ead895d89e720a2b`, Editorial and corrected accent. |
| Replace prepared brief with Fjord | Rose kit and review state cleared. |
| Load partial evidence → apply roles → invalid local provider → fallback → approve/export | Eight forbidden proposal changes rejected; exact Fjord inputs/palette retained. `0cc39d127f53fbca`. |

Four downloaded packages were independently checked for every file length/hash, resource closure, fonts/licenses, exact packshot hash/alt, campaign strings, snapshot flags and HTML/receipt/revision agreement. Rose/Fjord Clear exports contain 13 recorded files including Inter; Editorial correction contains 4 files and uses system fonts. [Validation results](examples/brand-review/export-validation.json), [timeout/override validation](examples/brand-review/export-validation-timeout.json).

## Commands and results

Run from the dedicated worktree with synthetic configuration, local-test provider and live generation false; no real provider credentials or dotenv files.

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/campaign-lab-brand-outcomes.test.mts` | 2 passed: healthy HTML/CSS/PNG versus unsupported/corrupt/missing resources. Existing cases cover JS-only/empty evidence. |
| Campaign Lab discovery: `Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs` passed to `node --experimental-strip-types --test` | **288 passed, 0 failed, 0 skipped**. Includes new strict-schema, alpha/contrast, two-campaign generation, precedence, restoration and deferred file-reader cases. |
| `node node_modules/typescript/bin/tsc --noEmit` | Exit 0. Production build also typechecked all scripts/tests. |
| Focused `node node_modules/eslint/bin/eslint.js` on all 12 changed/new application modules | Exit 0; exact invocation in the session transcript, `.local/lint-final.log` retained. |
| `npm run build` | Exit 0: optimized webpack, TypeScript, SRI finalization and static CSP hashes. |
| `npm run test:build` | Exit 0: CSP hash parity/nonces, protected dashboard, OG image, auth/Google/billing boundaries and Campaign Lab development-only page/generation gates. Static hash file remains parity-checked rather than consumed by runtime CSP. |
| `node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/rose-export .local/rose-corrected-export .local/fjord-export` | Exit 0, three original/corrected packages; fourth timeout/override package separately below. |
| `node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/fjord-timeout-export --expect-accent=#123456` | Exit 0: explicit effective override and exact approved timeout package. |
| `git diff --check` | Exit 0 before commit. |

File-reader tests defer old success/error while newer selection completes, cover cancellation, reject oversize before `text()`, and retry identical input. Existing request-gate tests cover delayed old generation responses. Shared-service tests cover both campaigns through success, invalid and timeout fallback. The final development-browser run also used a 2500 ms timeout provider: an accent edit while the old request was pending left revision `0cc39d127f53fbca` visible, with fresh-preview/approval locks after the old deadline. Generating the current edit then produced timeout fallback `e209038f6d26c17b`, locally approved and exported with explicit `#123456` override above the reviewed `#163f64` accent. No custom network interception was used.

Initial suite run: 286/287, exposing legacy partial-accent restoration; fixed with its failure log preserved. First production build compiled but failed a verifier callback type annotation; fixed and log preserved. First export verifier needed Windows separator normalization, without changing package bytes. Existing module-type/Sentry deprecation notices remain. No dependency upgrade was made.

## Gallery, assistance and limits

[Normal-height gallery and geometry](examples/brand-review/GALLERY.md). Requested page viewports were verified at 1440×900 and 375×812; actual screenshot content excludes scrollbar areas. Failed/misframed captures are retained under `.local/failed-gallery` rather than passed off as successful target captures.

Keyboard Tab navigation in the final 375×812 run reached the CTA with `:focus-visible` true and a 3px ink outline; document width was 360px inside the 375px viewport, with no horizontal overflow. Labels were exercised through accessible selectors and keyboard text entry.

The Fjord article was inspected as the sole visual subject of its desktop capture, with editor context retained: 909×736.23, x466/y36.91 after a 450px scroll. The cool page/navy CTA and approved packshot work together; exact terms sit beside the action and facts have clear hierarchy. The long product name occupies four lines at this preview width, a composition tradeoff. Rose's correction changes palette/type without rewriting its offer. The 375px evidence panel remains readable but long with details expanded. These are bounded synthetic palette-fit judgments, not recognition or customer brand-fidelity claims.

UX: rejected evidence preserves valid work and Apply is explicit. DX: the compact resolver serves generation/fallback/identity/export. AX: frozen fixtures, source hashes and receipts make decisions reproducible. Manual/no-website directions and static default remain available; no hosted/live-version behavior changed.

All preparation, entry, selections/corrections, synthetic attestations, inspection, approval and export were root-agent-assisted using the Browser skill. No subagents or independent customer participants were used. This is not an independent usability trial. Hot reload/provider-mode changes caused refreshes; later actions waited for hydration. The browser helper initially failed to emit a change for same-path packshot reselection after refresh. Identical bytes under a temporary filename, then original-file reselection, succeeded; media bytes never changed. Evidence retry and deferred-read behavior have dedicated tests.

Direct `file:` navigation was policy-blocked (HTTP/HTTPS only); it was not bypassed. Native direct-file/offline browser playback remains unqualified. Package bytes and HTML/receipt agreement were checked without another browser or a serving workaround. Automatic approval review also rejected an additional local production preview-server command with “blocked by policy”; it was not retried. Production smoke passed in its own controlled process and confirms Campaign Lab is development-only. The already-authorized, safer development-only server was used for final timeout/keyboard checks, without retrying production startup.

No live URL reads/import endpoint, paid calls, remote asset/font import, dependency upgrade, push, deployment or new animation. Original-byte authenticity, owner confirmation, media rights, full typography/geometry, live URL egress/TLS and native decoder isolation remain later scopes. All existing warnings/provenance/false approval flags remain intact.

Ignored `.local/` evidence retains successful/failed logs, ZIPs, extracted packages and failed captures. Existing worktrees and legacy work were preserved.

Browser assistance detail: initial page navigation timed out during Next compilation, then DOM readiness succeeded. An upload helper retained the prior tab after new-tab recovery; explicitly passing the current tab corrected the helper. A temporary viewport override targeted a different active tab; the misnamed capture was retained in `.local/failed-gallery` and replaced with a verified 360×780 mobile bitmap. No application change was needed for these tooling corrections.
