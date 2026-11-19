# URL evidence to palette review — Session 1

19 November 2026. Base `deb4b365996706f050604b59e1d3a403ed0f9216`; branch `codex/brand-url-session1-20261119`; dedicated worktree `C:/Users/joser/.local/ornigami-brand-url-session1`. Existing source worktrees and dirty legacy work were preserved. This is a development-only HTML/CSS workflow, not public-network qualification or deployment.

Website URL entry lives in the existing **Brand evidence** panel in normal `/campaign-lab/offer` intake and its editor. Returned evidence uses the same schema, picker, correction/contrast review, snapshot resolver, generation, approval and export. Manual directions, explicit overrides and saved-file import remain available. Reviewing suggestions does not change page inputs or invalidate valid approval.

## API and server enablement

`POST /api/campaign-lab/brand-evidence`, same-origin `application/json`:

```json
{"url":"https://brand-url.example/rose","requestId":"operator-1"}
```

Only URL and optional requestId are accepted. URL: HTTP/HTTPS, up to 2,048 characters, no credentials/custom port; protected-reader hostname/address/redirect policy remains authoritative. Request ID: 1–80 ASCII letters/digits/underscore/hyphen. Transport, clock, limits, source HTML, catalog and all other fields are rejected. Actual UTF-8 body bytes are counted independently of Content-Length.

Origin is compared with actual HTTP Host and Request protocol, never forwarded headers. Missing/foreign Origin and cross-site Fetch Metadata fail closed. Next internally uses localhost for a browser visiting 127.0.0.1; the initial Request-URL-only comparison was corrected after an actual-browser 403 reproduction. Responses are no-store/nosniff JSON. Raw source/drafts are not logged, persisted, copied to receipts or sent to generation providers; only the compact reviewed snapshot proceeds.

| Trusted server configuration | Behavior |
| --- | --- |
| NODE_ENV other than development | 404 before body validation, reader construction or source work, regardless of other flags |
| ORNIGAMI_BRAND_URL_MODE unset/off/unknown, or live without its opt-in | 503; saved evidence/manual authoring still works |
| ORNIGAMI_BRAND_URL_MODE=synthetic | App-owned in-memory replies through the real protected reader; zero OS DNS/TCP requests |
| ORNIGAMI_BRAND_URL_MODE=live and ORNIGAMI_BRAND_URL_LIVE=true | Explicit development-only live adapter configuration; not used or authorized in this session |

Model flags cannot enable URL network access. Browser/API verification used synthetic mode, URL live false, OPENAI_ENABLED=false, local-test generation and generation live false. Live enablement requires Session 2's reviewed receipts and a later explicitly scoped run. Production stays unavailable even with both live opt-ins set.

Success returns `{ok:true,draft,requestId?,summary,mode}`. Summary contains operation status, logical reads, retained and conservatively charged bytes. Mode distinguishes synthetic from protected-text-read. Draft/extractor remain 1.0.0 / ornigami-brand-evidence/1.0.0. Both server and client apply the same saved-file schema and 512-KiB draft cap; overflow is recoverable 413, never silent truncation. Safe failures use 400/403/404/408/413/415/422/429/503. Diagnostic unsupported/incomplete drafts can return 200 with explicit rejected/incomplete operation status and manual fallback.

## Exact work limits

| Boundary | Limit |
| --- | --- |
| Active API work | 2 per handler/process; excess 429 before body reading |
| Request bytes/body time | 4,096 bytes / 2,000 ms; stalled reads cancel |
| Trusted orchestrator policy | resourcePolicy html-css; ledger policy html-css/1.0.0 |
| Logical reads | Seed HTML plus at most 3 directly linked stylesheets; sequential, no retries |
| Redirects | 2 per read; at most 12 scheduled HTTP attempts across 4 logical reads |
| Entity bytes | 1 MiB aggregate; HTML 512 KiB, CSS 256 KiB per resource |
| Shared network deadline | 10,000 monotonic milliseconds, including inter-read collection/discovery checks |
| Discovery | 128 tags; no recursive graph |
| URL media/font/script reads and raster decoding | Zero |
| Draft / total response-client envelope | 524,288 / 532,480 bytes |
| Client wait | 15 seconds, then abort |

Failures keep their whole byte reservation. Entity counters are not packet/header/parser-buffer/RSS bounds. Body plus import allowance is nominally 12 seconds plus bounded parsing/serialization/scheduling overhead; synchronous work and event-loop starvation are not hard-real-time preemption. Admission is per process, not distributed rate limiting or public-service isolation.

The existing orchestrator's full supplied-byte/raster behavior remains unchanged when no policy is selected. Text-only skips non-CSS discovery before scheduling. A stylesheet called theme.png with CSS MIME is text; a stylesheet returning image MIME stays unsupported and never decodes. CSS import/font/script/image references remain observations or visible method gaps. Intentional media omission is an evidence note, while genuine missing CSS/CDN failures stay partial.

## Cancellation and authority

BrandEvidenceSelection owns one sequence for file/URL reads. New selection, URL edit, cancel and unmount abort/invalidate older work. Old success or error cannot overwrite current draft/error/pending state. Same-URL/file retry works. Failed/cancelled imports preserve the brief, approved packshot, applied kit and valid preview/approval. Pending/invalid suggestions cannot Apply.

URL and returned evidence stay in component memory. Existing session storage saves only campaign text/compact snapshot/override intent, never raw source/draft, File/blob, URL or approval. Website titles, claims, offers, destinations, media and fonts are never promoted to campaign inputs. Collector approvals and snapshot owner/fact/media/source-authenticity flags remain false. Hashing protected bytes does not establish publisher ownership, freshness, computed styles or media licensing. Synthetic origin is explicit in the UI.

## Actual browser verification

Frozen [brief](examples/brand-url/brief.json) and [approved packshot](examples/brand-url/packshot.png) reuse the accepted synthetic Rose campaign. Packshot SHA-256 stays `cdb29be4bb74777f7d10c9eae5b3ada849e6701190cc2bfdc546bdc7fee3c1d6`. The evidence URL differs from the approved campaign destination. No real site was contacted.

App-owned fixture replies live in src/lib/campaign-lab/brand-import/url-synthetic.ts: rose, partial, slow, js-only, missing, unsupported, redirect, misleading, theme.png and raster.css. Unknown paths are synthetic 404s; other hostnames resolve only to a blocked loopback fixture answer. The real protected reader/parser executes against Duplex streams, not OS DNS/sockets or genuine TLS.

| Actual action | Result |
| --- | --- |
| Normal brief/packshot/attestations, enter rose URL | Existing panel: 2 sources, 5 UI colors, 0 image samples, explicit synthetic notice; commercial fields untouched |
| Choose roles, Apply, local-test Generate, freshly approve/export | Initial revision 3329275df706c388 |
| Forbidden redirect after approval | Safe error; current approved export remained available |
| Slow URL then saved Fjord file | File's distinct 3-source/8-photo evidence won; URL result could not overwrite it; applied Rose theme unchanged |
| Slow URL then Cancel read | Request cancelled; approved export still usable |
| Partial URL | Missing CSS and blocked CDN visible; useful HTML/CSS colors survived with zero raster candidates |
| Translucent #12345680, white correction | Alpha retained; contrast rejection shown |
| Correct #4b2030; external white override then #123456 | Apply rejected/recovered from current controls without rereading evidence |
| Apply and Generate | Old approval/export locked; exact offer/destination/facts/media preserved |
| Fresh approval/export with override | 253ce5a4daca0f08, effective accent #123456 |
| Remove override, regenerate, freshly approve/export | 6dcd21c8efb48e88, effective #4b2030; original RGBA retained as correction |
| JS-only URL | Manual path, no invented kit; approved page/export preserved |
| Same partial URL retry twice | Succeeded; review alone did not Apply or invalidate approval |
| Keyboard/mobile | Tab reached CTA, focus-visible true, 3px ink outline; 375×812 viewport with document width 360 and no horizontal overflow |

All three downloaded ZIPs passed the existing export verifier: file bytes/hashes/references, Inter fonts/licenses, packshot hash/alt, exact commercial fields, effective palette and approved/rendered revision. [Receipts/snapshot](examples/brand-url/), [normal audit](examples/brand-url/exports.json), [override audit](examples/brand-url/export-override.json). No raw source text appears in receipts.

Actual API checks cover healthy/partial/JS-only/missing/unsupported/misleading MIME/private redirect, invalid/oversized JSON and foreign Origin. Three concurrent slow requests returned 200, 200, 429. With URL flags unset, dev returned 503 before request validation/source work. Built production with both live flags set returned 404 for valid/forbidden-field requests and offer page. [Synthetic](examples/brand-url/api-synthetic.json), [off](examples/brand-url/api-off.json), [production](examples/brand-url/api-production.json).

## Commands and results

From the dedicated worktree:

```powershell
node --experimental-strip-types --test tests/campaign-lab-brand-url.test.mts
$suites = Get-ChildItem tests/campaign-lab*.test.mts,tests/campaign-lab*.test.mjs | ForEach-Object FullName
node --experimental-strip-types --test $suites
node node_modules/typescript/bin/tsc --noEmit
npm run build
npm run test:build
node --experimental-strip-types scripts/check-brand-url-api.mts http://127.0.0.1:3029 synthetic .local/api-synthetic.json
# Restart dev with both URL flags unset:
node --experimental-strip-types scripts/check-brand-url-api.mts http://127.0.0.1:3029 off .local/api-off.json
node scripts/check-brand-url-production.mjs .local/api-production.json
node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/url-initial .local/url-corrected
node --experimental-strip-types scripts/verify-brand-review-exports.mts .local/url-override --expect-accent=#123456
```

10 focused and **319 complete Campaign Lab tests (309 inherited)** passed, no failures/skips/cancellations. Whole-project TypeScript, focused lint on all nine changed/new application/script/test modules, optimized build, production smoke, actual API gates and three export audits passed. Full lint invocation is retained in the transcript and .local/lint-final.log. Production smoke covers CSP/SRI parity/nonces, anonymous auth/Google/billing boundaries, protected dashboard and existing development-only page/generation gates. Static CSP output remains parity-checked rather than consumed at runtime.

Focused cases also cover resource/byte/deadline accounting, disconnect/stalled-body cancellation, slot release, every file/URL late-success/error direction, retry/cancel, expanded response 413 and actual request bytes. A child-process decoder mock is a trap: text-only image/MIME cases call it zero times, while a supplied-raster positive control calls it once. Core transport/address/TLS modules and Session 2 qualification files were not edited.

Earlier failures remain in .local: initial strip-only TypeScript parameter-property syntax was corrected; actual browser Origin mismatch was corrected with a regression; initial navigation timed out while compilation finished. No failure evidence was deleted. Existing module-type/Sentry notices remain. A long shell-based report write was rejected by automatic command review; the non-executing documentation was written using literal file patches instead.

## Gallery, assistance and limits

[Normal-height gallery](examples/brand-url/GALLERY.md) records DOM viewports 1440×900 and 375×812 separately from returned JPEG sizes 1425×891 / 360×780. No tall capture stands in for normal height. Desktop's inherited heavy title still occupies four lines. The exact offer remains beside the CTA. The corrected warm palette fits the unchanged synthetic packshot; this is bounded palette fit, not real-brand recognition. Mobile URL/button/file controls fit; warnings stay collapsed by default.

All data entry, attestations, selections/corrections, inspection, approval and export were root-agent-assisted through the Browser skill. No subagents or independent customers participated. This is not independent usability or public self-serve qualification. UX: one explicit review/apply path preserves valid work. DX: one protected orchestrator and existing resolver/export. AX: bounded synthetic fixtures, request receipts and frozen campaign checks are reproducible.

Live public DNS/TCP/TLS, Session 2 receipts, deployment egress, distributed rate limits/isolation, computed styles, full brand extraction, original publisher authenticity, owner confirmation and media licensing remain separate. Inherited direct-file/native playback was already policy-blocked; it was not retried or bypassed. Package bytes/resources were verified without claiming that surface.

No real external requests, paid calls, upgrades, push, deployment, animations or core transport changes. Ignored .local retains logs, downloaded ZIPs and extracted packages. Tracked examples are synthetic campaign data and compact receipts only.
