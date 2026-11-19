# Offline brand evidence foundation — Session 1

19 November 2026. Base: `2e05e3e35411a6894c4a9a6a969b284406801a63`.
Branch: `codex/brand-evidence-session1-20261119`.

`collectBrandKitDraft(resources)` in `src/lib/campaign-lab/brand-import/brand-evidence.ts`
assembles `BrandKitDraft` schema `1.0.0`, extractor `ornigami-brand-evidence/1.0.0`.
It accepts already-supplied resources with an explicit `html`, `css` or `raster` kind:

```ts
{ kind, requestedUrl, finalUrl, status, contentType, body: Uint8Array }
```

No fetch, DNS, browser, model, endpoint, UI, persistence or campaign integration exists
in this library. The resource shape is structurally compatible with Session 2; it
does not import or modify that session's files. Node crypto and the existing native
Sharp installation are required. This is not a Cloudflare Workers adapter. No
package or lockfile changes were needed.

## Evidence contract

Sources retain requested/final URLs, status, media type, byte length, exact supplied
byte SHA-256, source outcome and bounded issue codes. Source IDs hash the kind,
URLs, status, media type and byte hash; identical sources are deduplicated. There is
no invented fetch time: the caller supplied bytes, and collection makes no claim
about their origin, authenticity, freshness or a verified server response.

Each suggestion links its source ID and byte hash, extraction method, bounded exact
source quote and UTF-16 offset, review status, confidence rationale and uncertainty.
Offsets address decoded UTF-8 source strings (BOM retained), not byte offsets or DOM
positions. Values may be entity-decoded/normalized while quotes remain literal.
Raster suggestions have no text offset; their evidence describes the sampling
method and their details retain original dimensions, sampled count and fraction.
Source files in the examples let a reviewer independently check each hash/quote.

Observed literals, inferred role hints and accepted values are separate fields.
Confidence is a heuristic about literal evidence, never a calibrated probability
of brand correctness. CSS `details.rank` is a lexical salience hint: theme metadata
3, `--brand*` declarations 2, other declarations 1. It is not a palette selection;
output remains in source order. Generic/framework declarations remain uncertain.
No neutral, ink or background is discarded for lacking saturation. Raster
frequency is only sample coverage, with a denominator including invisible pixels;
only the eight most frequent visible samples are retained. UI colors and image
palettes have distinct categories and are never merged or ranked against each other.

`acceptedValues` is always empty. Brand, campaign-fact and media-rights approvals
are always false. Even source copy claiming approval stays untrusted text. A
`possible-logo` hint comes only from attributes, not logo recognition. Marketplace
UI can belong to the marketplace rather than a seller. No observed claim, price,
destination, image or font is an approved campaign input or license grant.

`draft` means supported UI evidence was found, not a complete kit. `incomplete`
means no supported UI color was found, including text-only, image-only, empty and
JS-only inputs. `unsupported` means all supplied unique sources used unsupported
formats. Mixed successes keep per-source failures and an explicit partial-evidence
gap. These outcomes never invent a style or supply direction defaults.

## Bounds and supported subset

Preflight rejects the entire batch before hashing/parsing/native decoding if it
exceeds 12 resources, 4 MiB total, 512 KiB per HTML/raster or 256 KiB per CSS, URLs
of 2,048 characters or a media-type string of 240 characters. Rejected preflight
input produces no source/candidate records and has an explicit gap. A bounded
snapshot of every body is taken before the first await, preventing caller mutation
during raster analysis from changing later evidence.

Output caps: 256 suggestions per batch, 240 characters per evidence quote,
4,000 body-text characters per HTML resource, 240 per text segment, 4,000 per
title/description and 2,048 per discovered URL. Truncation and candidate exhaustion
are explicit source issues. Sources failing status/URL/encoding checks get no
suggestions. Only 2xx integer statuses and credential-free absolute HTTP(S) source
URLs are accepted as metadata. URL normalization is **not** network authorization;
private hostnames can be recorded as data without any connection being attempted.

Only UTF-8 `text/html` and `text/css` are parsed; explicitly declared non-UTF-8
HTTP charsets and invalid UTF-8 bytes fail closed. Absent charset is treated as
UTF-8; no HTML charset sniffing or encoding conversion is implemented. Comments,
scripts, templates, SVG, iframe and noscript blocks are excluded lexically; markup
is never executed or rendered. Body text is source text, not proven visible text.
Hidden content, malformed markup, escaped CSS identifiers and complex HTML parsing
states are not fully interpreted. JSON is data, not sanitized HTML; never insert
its values into a page with `innerHTML`. Example reports escape all JSON and use a
restrictive CSP. Inspect raw source fixture HTML as data rather than rendering it.

Colors: hexadecimal 3/4/6/8 digits; strict numeric RGB/RGBA comma or space/slash
syntax; `black`, `white`, `transparent`. Alpha is retained (normalized RGBA8 plus
numeric alpha); fractional RGB alpha is rounded only in the RGBA8 representation.
No background composition, HSL, other named colors, modern color spaces, variables,
gradients, cascade, selector matching or computed style evaluation. Unsupported
color-bearing declarations are flagged rather than guessed. Media/theme evidence
coexists with unresolved conditions; no theme is selected. Theme-color describes
browser chrome, not an accepted accent. CSS strings/comments cannot seed colors.

Discovery covers stylesheet/icon/preload links, `img`/`source` src, OG images,
CSS `url()` and quoted `@import`. Relative URLs resolve against the actual final
resource URL, including external stylesheets. CDN/cross-origin references are
retained with `fetched: false`; this field describes discovery, even if the caller
independently supplies matching bytes as another source. Discovery does not follow
references. Unsupported schemes/credentialed references are dropped with an issue;
srcset is flagged but not parsed. Inline SVG, font inspection, geometry and actual
typography are out of scope. Font URLs are only resource suggestions; no font is
downloaded, packaged, licensed or seeded as an observed default.

Raster processing is sequential, maximum four unique images, 4 million decoded
pixels each. PNG/JPEG/WebP signatures are checked before native decoding; declared
media type must agree. SVG/PDF/GIF and animated/multipage images are unsupported;
corrupt data and decode limits are rejected with safe issue codes. Sharp metadata
and decoder both enforce the pixel cap; no oversized raster is fully decoded for
palette analysis. Nearest-neighbour samples are at most 64×64, converted to sRGB,
retaining sampled alpha and neutrals, ignoring fully transparent pixels. No opaque
matte is invented. ICC conversion/sampling can change source pixel values; these
are sampled image colors, not exact original pixels or inferred website UI.
Work is bounded by bytes/counts/pixels, not a hard native-code wall-clock deadline
or a measured host-memory guarantee. Native decoder isolation/time limits remain a
deployment concern. No live-site, browser, physical-device or security certification
is claimed.

## Source attribution and licensing

Inspected the local sibling Contentor repository at exact commit
`1721bd90b54f7bbaf8f41d0435cbea7bf2f96b2b`, specifically:

- `src/lib/brands/website-url.ts`: protocol/credential-aware normalization concept.
- `src/lib/brands/website-autofill.ts`: bounded text/metadata collection, attribute
  hints, stylesheet/image discovery, declaration salience and small raster sampling.
- `src/lib/brands/website-autofill.test.ts`: synthetic collector and palette cases.

This implementation selectively adapts those collector concepts with independently
written code and new synthetic fixtures. No Contentor implementation/test blocks,
fetch/model integration, defaults, or UI were copied. Important deliberate changes
are exact per-resource hashes/quotes, retained alpha/neutrals, separated UI/image
evidence, explicit failures and no image-first brand palette promotion.

No root source-code LICENSE/COPYING or general licensing grant was found in that
commit's tracked tree. The found marketing-skill/font licenses apply to their own
assets, not this collector. This attribution does not grant a blanket right to
copy Contentor source; further literal reuse requires license/owner review. No
Contentor fonts or licensed assets were imported. Existing Sharp retains its own
installed package license (Apache-2.0); no dependency source was vendored.

## Reproduction and results

Run locally from this worktree; these commands perform no network requests:

```powershell
node --experimental-strip-types --test tests/campaign-lab-brand-evidence.test.mts
node --experimental-strip-types scripts/brand-evidence-examples.mts
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
node node_modules/eslint/bin/eslint.js src/lib/campaign-lab/brand-import/evidence-types.ts src/lib/campaign-lab/brand-import/brand-evidence.ts src/lib/campaign-lab/brand-import/raster-evidence.ts tests/campaign-lab-brand-evidence.test.mts tests/fixtures/brand-evidence/synthetic.ts scripts/brand-evidence-examples.mts
```

Verification passed: **14 focused tests**, whole-project TypeScript (no emit), and
focused ESLint. The eight example sets were generated offline successfully.
Focused tests verify hashes against actual bytes, literal quote offsets including
entities/BOM/emoji, deterministic output, source URL identity, CDN discovery,
misleading claims, ignored inert content, report escaping, alpha and neutrals,
unsupported colors/themes, corrupt and oversized images, bytes/count/output limits,
media/signature mismatch, invisible pixels, bad statuses/encoding and byte-mutation
isolation. Node's existing typeless-package warning is informational; package mode
was left unchanged.

Inspectable portable fixtures are in `docs/examples/brand-evidence/`. Each contains
`resources.json`, exact `source-*` bytes, `draft.json` and escaped `report.html`.
The generator is reproducible with the installed Sharp/libvips version; binary
encoding/hashes can vary with encoder versions. Committed inputs are the canonical
hash-check targets. A scoped `.gitattributes` marks source fixtures `-text`, preserving
their bytes/hashes across Windows/Unix checkouts. A replay test loads every saved
input from disk and checks the entire saved draft and escaped report.

| Synthetic case | Outcome | Candidates / sources | Result |
| --- | --- | --- | --- |
| monochrome-photo-conflict | draft | 11 / 3 | UI #111/#fff/#eee remain separate from #ff0080 image |
| themes-alpha-modern | draft | 11 / 1 | Both themes retained; alpha retained; var/oklch unsupported; font reference only |
| misleading-content | draft | 6 / 1 | Claims remain unapproved text; script/template ignored; hostile text escaped |
| js-only | incomplete | 0 / 1 | No invented defaults |
| no-site | incomplete | 0 / 0 | Manual path remains available to future integration |
| unsupported-svg | unsupported | 0 / 1 | No SVG decoder invoked |
| corrupt-raster | incomplete | 0 / 1 | Explicit rejected source |
| oversized-raster | incomplete | 0 / 1 | 2001×2000 exceeds 4-million-pixel cap |

## Integration boundary

A later orchestrator must qualify transport/deployment, shared network budgets,
source cache/freshness, permissions and lifecycle. Review must establish identity,
asset rights and supported color roles/contrast before producing any accepted kit.
Apply accepted values only through the existing app-owned resolver, respecting
operator overrides and fresh preview approval. This branch changes no intake,
generation, renderer, export or manual campaign behavior and never supplies remote
HTML/CSS or arbitrary tokens to them.
