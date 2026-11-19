# Bounded offline brand-import integration

19 November 2026. Implemented library checkpoint, not a customer importer.
Worktree: `C:/Users/joser/.local/ornigami-brand-integration`, branch
`codex/brand-import-integration-20261119`.

The preserved-history merge is `b0fb49539d551e221553ae5b5cf655ab7321fd75`:

- First parent / requested starting point: `686e034f00c162080a0e895060d5c01d56eaf4b7`.
- Integrated transport parent: `9e8801948385d74c65dc77a83d043a6c3d4c5e5d`.

Both foundation guides remain historical records. This checkpoint demonstrates
their working connection and corrects the independent review's timing issue.
The main legacy checkout and existing worktrees were not edited.

## Library and source boundaries

`src/lib/campaign-lab/brand-import/import-brand.ts` exports
`importBrandDraft(seed, reader, options)`. The caller must explicitly provide a
trusted reader, normally `readPublicResource`; no alternative fetch path exists.
The offline command provides `createPublicResourceReader` with synthetic DNS and
Duplex sockets. Node's actual ClientRequest, Agent and HTTP parser handle replies;
the real evidence collector and Sharp adapter process returned bytes.

No endpoint, UI, server action, client catalog, arbitrary token map, campaign
integration, renderer/generator/export change, dependency upgrade or provider call
was added. Manual/no-website authoring stays unchanged. Reader, clock and limit
dependencies are trusted code configuration, never page-derived configuration.
These Node modules must remain outside client bundles. Their functions are not
Next.js Server Actions.

Shared HTML lexical helpers moved unchanged into `html-lexical.ts`. Collector link
roles now use exact rel tokens rather than substring matches; all eight existing
saved evidence sets still replay exactly. `html-discovery.ts` implements a narrower
fetch subset: stylesheet and icon rel tokens, img src, and meta property
og:image/og:image:url. It ignores type/filename claims and lets the collector
validate actual HTTP media type, encoding and raster signature. References resolve
against the seed's recorded final URL. Fragments and trailing DNS dots are removed
for logical-read deduplication; requested and final identities stay in evidence.

No recursive HTML crawl, CSS imports, CSS image traversal, script execution,
downloaded fonts, SVG processing, preload fetching or source-element fetching.
CSS references remain unfetched evidence. HTML base and srcset are explicitly
unsupported and produce ledger issues. This is a lexical subset, not a browser
HTML parser; malformed markup and complex parsing states remain unqualified.

## One operation's bounds

| Boundary | Maximum |
| --- | --- |
| Sequential logical reads, including failed seed/optional reads | 12 |
| Redirects per logical read | 2 |
| HTTP attempts per logical read | 3 |
| HTTP attempts for the entire operation | **36**, never described as 12 wire requests |
| HTML tag enumeration (including irrelevant/duplicate tags) | 256 |
| Raster candidates scheduled | 4 |
| Aggregate body-byte allowance | 4 MiB |
| HTML / raster per resource | 512 KiB |
| CSS per resource | 256 KiB |
| Shared monotonic network allowance | 10,000 ms |

Trusted options may reduce these limits, never increase them. Discovery allocates
at most one candidate per enumerated tag. Unique requested/final URLs are recorded
in a bounded set; duplicates cannot start extra logical reads. Redirect chains
remain bounded even if they revisit a URL. Concurrency is one; no retries/failover.

Before each read, reserve min(per-resource cap, remaining aggregate bytes).
Successful reads release unused reservation and record exact returned bytes/hash.
Failed reads keep their full reservation because the reader might have consumed
an unknown partial body. `retainedBytes` counts returned entity bytes;
`chargedBytes` includes conservative failure reservations. Neither is a packet
counter. Oversized declarations fail before retention; an oversized streamed chunk
can arrive before rejection. Parser-discarded bytes, headers, unread redirect
bodies, socket buffering, total network packet bytes and process RSS are not
bounded by the aggregate retained-body allowance. Headers retain the reader's
16-KiB per-response parser limit. Compression is rejected without decompression.

Every read receives the common AbortSignal, remaining timeout and absolute shared
monotonic deadline. The reader checks that absolute deadline before DNS/connect,
redirect handling, chunk retention and return; it cannot reset a full allowance
for each optional resource. Checks also surround collection awaits and scheduling.
Cancellation yields `status: cancelled`, `draft: null`; earlier bounded source
bytes/ledger can remain inspectable. Late DNS/body results cannot start another
hop or publish a successful draft. Timers/listeners/sockets are cleaned up.

Collection, synchronous parsing and native Sharp work are **not preemptible**.
Elapsed time while collecting reduces the remaining network allowance, but this
does not establish a hard whole-process deadline. A native hang cannot be stopped
by the AbortSignal. Isolation/termination and hosting memory/egress qualification
are separate work. The post-collection check prevents publishing a late draft.

## Evidence and failures

Seed transport failure returns no draft. Rejected/unsupported seed bytes may
produce a diagnostic draft with no observations, but ledger status stays rejected
and discovery never runs. Useful HTML survives optional CSS/image failures with
explicit partial status, safe transport error codes and per-source extraction
issues. Empty/JS-only HTML stays incomplete. No defaults or brand roles are
invented. `acceptedValues` stays empty and all three approval fields stay false.
Even a complete ledger means only completion of this bounded collection subset.

Entries preserve requested/final URLs, response status, returned-byte length and
SHA-256. Draft candidates retain exact quote offsets and source hashes. Failure
codes omit raw error messages, response bodies, headers and abort reasons.
Report cardinality is bounded by the limits above, source URLs by 2,048 chars,
media metadata/quotes by 240 chars and collector text/candidate bounds by its
existing contract. URLs and source text remain untrusted evidence and may contain
secrets; do not place whole ledgers in public logs. JSON is not executable HTML.
The inspectable report escapes draft text and has a restrictive CSP.

## Portable reproduction

From this worktree with the existing installed dependencies (no installation):

```powershell
node --experimental-strip-types scripts/brand-import-example.mts
node --experimental-strip-types --test tests/campaign-lab-brand-import.test.mts tests/campaign-lab-brand-resource-transport.test.mts tests/campaign-lab-brand-evidence.test.mts
$tests = @(Get-ChildItem tests/campaign-lab*.test.* | Sort-Object Name | ForEach-Object { $_.FullName })
node --experimental-strip-types --test @tests
node node_modules/typescript/bin/tsc --noEmit --pretty false --incremental false
$files = @(Get-ChildItem src/lib/campaign-lab/brand-import/*.ts,tests/campaign-lab-brand-import.test.mts,tests/campaign-lab-brand-resource-transport.test.mts,tests/campaign-lab-brand-evidence.test.mts,tests/fixtures/brand-import/offline.ts,scripts/brand-import-example.mts | ForEach-Object { $_.FullName })
node node_modules/eslint/bin/eslint.js @files
git diff --check
```

The example accepts no live URL argument. Outputs in
`docs/examples/brand-import/partial/`: `draft.json`, `ledger.json`, `resources.json`,
exact `source-*` bytes and escaped `report.html`. Scoped attributes preserve fixture
bytes and LF reports. The example has four logical reads, four fixture HTTP
attempts (including the seed redirect), 606 returned bytes, and a forbidden CDN DNS
answer that creates **no socket**. It preserves neutral CSS colors separately from
the synthetic magenta raster. Its ledger has a 12-attempt scheduled upper bound
and 36-attempt operation upper bound; these bounds are not measured attempts.

Node v24.11.1; dependencies reused via an ignored junction to the existing
`ornigami-brand-directions/node_modules`. No dependency/lockfile mutation.

Final results on the implementation source:

- Focused: **50/50** (18 orchestration, 18 transport, 14 evidence), no skips.
- Full Campaign Lab: **281/281**, 26 discovered files, no skips/cancellations.
  This includes 255 existing `.mts` tests, eight existing acceptance-core `.mjs`
  tests, and 18 new orchestration tests. The handoff's expected 255 omitted that
  `.mjs` file; the complete run deliberately includes it. Existing browser intake,
  direction and evidence replay regressions are included.
- Whole-project TypeScript and focused ESLint: exit 0, no diagnostics.
- Offline example: exit 0, expected partial outcome; whitespace check exit 0.

The first full-suite run passed 281/281. A final exact-source run after removing
an EOF blank line also passed 281/281; no full-suite reruns to seek green.
Final logs are ignored `.local/focused-final.log`, `campaign-all-final.log`,
`campaign-all-precommit.log`, `campaign-discovery.txt`, `typescript-final.log`,
`typescript-precommit.log`, `lint-final.log`, `lint-precommit.log`, and
`example-03.log`. All intermediate logs and original reviewer copies remain.

## Deadline correction and retained failures

The redirect test now delivers real Node parser responses at virtual elapsed
40 ms then 80 ms under a 65-ms deadline. Each delivery deliberately blocks the
event loop for 15 real ms. The first hop is guaranteed to precede virtual expiry;
the second redirect cannot open a third hop. A first redirect delivered at virtual
80 ms cannot open hop two. Assertions retain exact connection counts, DEADLINE,
destroyed sockets, cleared timers and removed abort listeners. Trusted injectable
clock scheduling removes scheduler contention from the sequencing proof. Existing
real-time DNS/connect/body deadline and cancellation smokes remain and pass in the
concurrent complete suite.

Preserved evidence, without overwriting/relabeling failures:

| Log in this worktree's ignored `.local/` | Result and correction |
| --- | --- |
| `original-reviewer-all-campaign-tests.log` | Original transport 240/241: redirect assertion actual 1 / expected 2; copied byte-for-byte from transport worktree |
| `original-reviewer-redirect-isolated.log` | Original isolated pass; does not erase concurrent failure |
| `focused-foundations-01.log` | 31/32: exact report replay failed because core.autocrlf converted report LF to CRLF; pinned report eol=lf and restored unchanged repository blobs; all eight replay exactly |
| `example-01.log` | Exit 1: strip-only Node rejected fixture constructor parameter properties; replaced with ordinary field assignments |
| `typescript-01.log` | Exit 2: TS7022 for two inferred test variables; added explicit EvidenceSource/SuppliedBrandResource annotations |
| `diff-check-01.log` | Staged whitespace check found one extra EOF blank line in the new lexical helper; removed that line and repeated exact-source verification |
| `focused-03.log` | 47/48: a virtual-deadline test mixed real and virtual clocks after adding absolute deadlines, opening zero sockets instead of one; both layers now share the same trusted fixture clock |

Original concurrent log SHA-256:
`5002c3066c1381a2fee7f90eb5dc5cd99a74bb640b7ddfa8165746ed7b5ac4b7`.
Original isolated log SHA-256:
`882b60f9e7637d5c6b9a91c8726c00611550302cc25a4ee550cc7097e8c01a78`.
Original source-worktree logs remain untouched. Report contents/drafts/source
fixtures were not regenerated to weaken replay; the new LF attribute makes fresh
Windows checkouts preserve their original report bytes.

## Remaining gates

Live DNS/TLS, actual TCP routing and hosting egress remain **unqualified**.
Native image isolation, hard process time/memory bounds, import UI, editable review,
reviewed BrandKitSnapshot application and public self-serve readiness remain
**unqualified**. No actual site, TLS handshake, endpoint/browser journey, deployment,
paid model, push or public CI was used. Identity/media/commercial permissions still
require independent review. Review this pipeline before starting the dependent
evidence-review/Snapshot task; ordinary campaign behavior is unchanged.
