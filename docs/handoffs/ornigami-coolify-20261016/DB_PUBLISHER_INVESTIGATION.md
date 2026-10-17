# Official DB publisher investigation — 17 October 2026

**Decision: external publisher dependency; do not repeat the admission request.** No fresh official publication was established during the bounded investigation, ending **2026-10-17T13:10:58Z**. The current official GHCR manifest matches the last successful publisher upload; six later scheduled builds failed before publication. Sampled official logs identify a Debian version-parsing failure. No endpoint, Trivy version, mirror, freshness-policy or advisory exception is proposed for immediate adoption.

This task used retained evidence, read-only official publisher/registry metadata and checksum-recorded official source. No DB layer, full database, scanner binary, dependency or image was downloaded; no scanner/build/external runner, push, VPS/deployment/provider operation, hold restoration or upstream write/contact occurred. Source candidate **2ae7f60ce8edd1880b24924a0e213f34abd97ed1** and published request **97fc2b86f2efe55683242e8b20a38a79fdebfb1e** remain unchanged. Prior run/custody approval is consumed.

## Exact official identities observed

| Item | Identity |
| --- | --- |
| Configured registry/tag | `ghcr.io/aquasecurity/trivy-db:2` |
| Current manifest digest | `sha256:9dd4076bb4c826ace2a305983a2285de1044fbf99d27eb619b91abc4dfc1b43c` |
| Manifest type/size | OCI image manifest, schemaVersion 2; **616 bytes**; no index returned |
| Manifest artifact type | `application/vnd.aquasec.trivy.config.v1+json` |
| Manifest created annotation | `2026-10-16T01:20:52Z` |
| Config descriptor | `sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`; OCI empty config, inline `{}`, 2 bytes |
| Compressed DB-layer descriptor | `sha256:21c41a540cbf645dc6f754e5dd54e0c44efafc4e4085315b4dd51e63ed88feb5`; **134,244,714 bytes**, **not fetched** |
| Layer media type/title | `application/vnd.aquasec.trivy.db.layer.v1.tar+gzip` / `db.tar.gz` |
| Official last successful publication | [38828255551](https://github.com/aquasecurity/trivy-db/actions/runs/38828255551), attempt 1; GHCR `:2` pushed **2026-10-16T01:20:53.0631495Z** with the exact current manifest digest |
| Official publisher source/main and pinned DB module commit | `cbebf2ecd6df42d36463844a45e689afee51c70f` |
| Pinned Trivy 0.76.0 source commit | `531360e5d2a88e732373f1614ba99a38738538b8` |

GET of the tag and GET by immutable digest returned identical manifest bytes. Their SHA-256 matched `Docker-Content-Digest` and ETag. Default HEAD, `Cache-Control: no-cache` HEAD/GET and final no-cache HEAD returned the same digest. Final server Date was **17 October 13:10:58 GMT**; latest publisher run remained **39031246212 / failure**. No blob URL was requested, including config blobs; the config above was already inline. An anonymous registry token existed only in memory and was not retained. Layer descriptor size/hash are metadata observations, not a local compressed-layer hash or DB-content proof.

[Registry observations](./db-publisher-evidence/REGISTRY_OBSERVATION.json), [bounded request/header receipts](./db-publisher-evidence/REGISTRY_REQUESTS.json), [exact tag manifest](./db-publisher-evidence/registry-tag-manifest.json), [digest manifest](./db-publisher-evidence/registry-digest-manifest.json), [final observation](./db-publisher-evidence/FINAL_OBSERVATION.json).

## Publisher chronology and supported explanation

The pinned [official publication workflow](https://github.com/aquasecurity/trivy-db/blob/cbebf2ecd6df42d36463844a45e689afee51c70f/.github/workflows/cron.yml) schedules every six hours, builds schema 2, then compresses and publishes. Failed DB construction prevents those later steps. The observed current digest is recorded in the last successful GHCR `:2` upload log, not inferred solely from its timestamp.

| Scheduled run | Start UTC | Result / registry upload |
| --- | --- | --- |
| [38828255551](https://github.com/aquasecurity/trivy-db/actions/runs/38828255551) | Oct 16 00:13:32 | Success / succeeded; current digest published |
| [38859594790](https://github.com/aquasecurity/trivy-db/actions/runs/38859594790) | Oct 16 06:09:11 | DB build failed / skipped |
| [38898441139](https://github.com/aquasecurity/trivy-db/actions/runs/38898441139) | Oct 16 12:08:17 | DB build failed / skipped |
| [38944776605](https://github.com/aquasecurity/trivy-db/actions/runs/38944776605) | Oct 16 18:06:28 | DB build failed / skipped |
| [38985388805](https://github.com/aquasecurity/trivy-db/actions/runs/38985388805) | Oct 17 00:13:49 | DB build failed / skipped |
| [39008766209](https://github.com/aquasecurity/trivy-db/actions/runs/39008766209) | Oct 17 06:07:50 | DB build failed / skipped; completed before our trial |
| [39031246212](https://github.com/aquasecurity/trivy-db/actions/runs/39031246212) | Oct 17 12:06:47 | DB build failed / skipped; completed 12:55:42, after our trial |

All six job inventories directly show **Build database: failure** and **Upload assets to registries: skipped**. Four bounded per-job log responses were retained: last successful, first failed, last failed before our trial, and latest failed. Requested 128 KiB suffix ranges were answered HTTP 200; all complete returned per-job bodies fit below 128 KiB and matched Content-Length. They are not a claim to have downloaded every historical run log. Signed redirect locations and authentication headers were discarded.

Three sampled failed-job logs directly report **`upstream_version must start with digit`**, with package **zziplib**, vulnerability **CVE-2026-111142**, and **`sid_ver: undetermined`**. Release context differs (trixie, bookworm, forky). These identify the immediate DB-construction failure in those sampled runs; the other three failures are established at step level, not assumed to have identical inner errors.

**Supported conclusion:** the official pipeline was failing to construct/publish refreshed data; the configured tag still served the exact last successful publication during our observation. This explains the lack of a newer official refresh without requiring a local-cache malfunction. Official pretrial failures already existed before run 39032144805; the later 12:55 error is corroboration, not retroactive evidence of the state at 12:20.

[Full publisher run inventory](./db-publisher-evidence/publisher-runs.json), [successful upload log](./db-publisher-evidence/publisher-last-successful-log-tail.txt), [pretrial failure log](./db-publisher-evidence/publisher-pretrial-failed-log-tail.txt), [first failure log](./db-publisher-evidence/publisher-first-failed-log-tail.txt), [latest failure log](./db-publisher-evidence/publisher-latest-failed-log-tail.txt), [log response receipts](./db-publisher-evidence/PUBLISHER_LOG_RECEIPTS.json).

## What remains observation versus inference

- **Direct:** our retained post-download metadata expired at `2026-10-17T01:13:54.947090202Z`; actual guard time was `12:21:01.336Z`; sole rejection was `NextUpdate-expired`, expired by 40,026,389 ms. The original 153 bytes remain unchanged, SHA-256 `b5a896b8af7c6235ce5ea8e55d91d8df95ce6f292dbdc171acbad0335c2bfb10`.
- **Direct:** current tag/digest responses match the last successful publisher's logged digest; later inspected uploads were skipped. No newer official publication is established.
- **Not a recovered historical identity:** our earlier trial did not retain its resolved OCI manifest or compressed-layer digest/HTTP response headers. We cannot cryptographically prove today which digest that invocation resolved. Its uncompressed DB hash `bf1f1b29d76cae9ff085d418cb4bfdb3906b6069f837abdef06558b8102dd1db` is a different object from the compressed-layer and manifest hashes above. Timestamp consistency and publisher history support the explanation but do not fill that missing receipt.
- **Not original archive metadata:** the retained `.original.bin` is the exact file supplied to our guard after Trivy completed. Pinned Trivy rewrites DownloadedAt after extraction; it is not a byte-for-byte sample of the metadata inside the archive. UpdatedAt/NextUpdate are not renewed by that operation.
- **Cache limits:** current requests had no returned Age or Cache-Control header. A no-cache request yielding the same digest does not prove absence of every CDN/proxy/cache, prove origin revalidation, or establish historical transport behavior. No trace of the earlier runner's HTTP transactions exists. We did not switch endpoints or query fallback mirrors.
- **Data-origin limit:** logs establish failure on the bare SID version sentinel. [PR 700](https://github.com/aquasecurity/trivy-db/pull/700) attributes it to a Debian tracker typo; we did not fetch the Debian feed/tracker commit or independently reproduce that upstream data change. That part remains a contributor explanation. No claim is made that Ornigami contains zziplib or has this CVE; this is a publisher parsing error, not a new app scan finding.
- **Previous failure remains unexplained:** run 39027472379 lacked original rejected metadata/clock. Neither this investigation nor the newer rejection recovers its precise cause or repairs its earlier completeness failure.

## Pinned Trivy handling and compatibility

The exact [0.76.0 DB client](https://github.com/aquasecurity/trivy/blob/531360e5d2a88e732373f1614ba99a38738538b8/pkg/db/db.go) requests a download if required local files are absent; our run used a newly owned empty cache and logged that download. After extraction it updates DownloadedAt. Its normal cached-data rule also permits a recent-download hour; our independent guard deliberately does **not** adopt that extension. Successful transfer/exit 0 is therefore not our freshness acceptance.

[Repository parsing](https://github.com/aquasecurity/trivy/blob/531360e5d2a88e732373f1614ba99a38738538b8/pkg/flag/db_flags.go) accepts OCI digest references without appending a schema tag to a digest. The [OCI artifact loader](https://github.com/aquasecurity/trivy/blob/531360e5d2a88e732373f1614ba99a38738538b8/pkg/oci/artifact.go) resolves a reference, expects one DB layer of the specified media type and unpacks it. Its image/layer reuse is per object/invocation, not proof of a persistent response cache. Multiple repository fallback exists for configured lists; this run supplied one explicit repository. Mirror options are handled separately; none was configured in the reviewed workflow and no mirror-selection message appears in the retained download log.

The inspected [remote layer](https://github.com/aquasecurity/trivy/blob/531360e5d2a88e732373f1614ba99a38738538b8/pkg/remote/remote.go) passes references through to go-containerregistry. The pinned HTTP wrapper clones Go's default transport and applies user-agent/optional tracing; this source inspection found no added persistent HTTP-response cache there. Standard proxy/underlying transport behavior is not thereby excluded. We did not run Trivy to test these paths.

Consequently a **future reviewed candidate** can keep Trivy 0.76.0 and the same official host, using `--db-repository ghcr.io/aquasecurity/trivy-db@sha256:<approved-new-manifest>` once a newer compatible publication exists. This is code-reading compatibility evidence, not a Linux execution result. Current workflow/controller hardcode `:2`; changing that argument and adding manifest/layer receipts requires a new exact local candidate/review. There is no fresh digest to put there today, and the old digest above is not offered as a fresh remedy. No runtime/workflow/request/lock/package/endpoint/tool changes were implemented in this task.

[Ten exact pinned source files and checksums](./db-publisher-evidence/SOURCE_RECEIPTS.json), [offline checks](./db-publisher-evidence/CHECKS.json).

## Pending upstream proposals and concrete decision

At inspection both proposals remained open/unmerged against base **cbebf2ecd6df42d36463844a45e689afee51c70f**:

| Proposal | Exact inspected head | Disposition here |
| --- | --- | --- |
| [700](https://github.com/aquasecurity/trivy-db/pull/700) | `214dcba6855c92025bdb6b421118c5b307e369ef` | Description proposes CVE-specific skipping; not adopted or recommended as an advisory exception |
| [701](https://github.com/aquasecurity/trivy-db/pull/701) | `c5bd08fa8b11f74bf426bac4c471fc240a2f91a4` | Description proposes retaining the advisory as unknown/unfixed; remains unmerged, contributor test claims not reproduced here, no complete official publication established |

**Recommended remedy:** wait for official publication recovery through a fix that preserves the advisory, or corrected official input. Do not build a private substitute DB, cherry-pick an unmerged workaround, filter the CVE, change Trivy/schema/endpoint, use a mirror, extend freshness or force admission. A successful PR check/merge alone is insufficient: require an actual successful official upload and a changed immutable manifest, then review its provenance and compatible DB format. If an eventual official change drops advisories, flag that coverage decision rather than silently accepting it.

**Smallest justified next approval:** after upstream reports publication recovery, one bounded **metadata-only** recheck of official run/job status and GHCR manifest/digest, with no blob download, scanner or external runner. No new admission-only trial is justified now. If that recheck establishes a newer publication, prepare a separately reviewed exact digest-bound local candidate, retaining the same source/package/tool/resource/security contracts. Only a subsequent separately approved one-download admission attempt can establish the new internal DB timestamps against the actual clock. OCI created time and successful publication alone do not prove NextUpdate is valid.

That future attempt must retain manifest/layer identities before transfer, bind the exact official digest, download once with no replacement, retain original guard inputs/identities/clocks/reasons, enforce **UpdatedAt <= actual clock < NextUpdate**, **zero grace**, **no DownloadedAt extension**, fail/skip on rejection, and run the previously skipped Linux fixtures only after shared admission passes. Keep 2 GiB/1 CPU/zero swap/512 MiB heap, disk reserve, work/job/custody deadlines and independent custody/completeness. Any actual run/custody acknowledgment needs its own exact-source approval. No image/security/release acceptance follows.

## Local scope, checks and retained limits

The metadata collector receipts cover 18 publisher API responses, two PR details, ten pinned source files, five initial registry metadata requests plus final HEAD, and four bounded job-log responses. Exploratory read-only discovery/search preceded those retained probes; the ledger is not claimed to enumerate every underlying authentication/redirect HTTP request. Registry GET bodies totaled **1,232 bytes** (two manifests); no `/blobs/` request occurred. Per-source bound 64 KiB; registry body bound 256 KiB; per-job CLI buffer 192 KiB; publisher API buffers 512 KiB; explicit timeouts and finite fixed lists. Node probes used the already installed Node 22.23.3 with 512 MiB heap. No package installation, Go execution, scanner or builder. The anonymous token and signed log locations were discarded.

Five offline verification groups pass: exact manifest/header/digest binding with no blob routes, publication chronology/log digest match and sampled error contexts, pinned source/unmerged proposal identities, unchanged retained rejection plus **916 historical evidence files**, and credential/signed-URL pattern review. Initial offline log matching wrongly assumed Digest immediately followed Pushed; an ArtifactType line intervened. The exact-digest expectation was preserved while fixing record parsing; original logs and first verifier remain retained. Initial long worktree path failed Windows checkout; a short isolated worktree with command-scoped long-path support succeeded. No global configuration or other worktree was changed.

All collectors are one-off read-only audit scripts retained as evidence, not registered/scheduled automation or a new production downloader. No continuing maintenance assignment or permission to repeat their network calls is implied. No live hold configuration was touched; effective live integrations were not rechecked because no publication was attempted. All historical app/base/final security findings, including the 43 Debian highs, remain unresolved. Build/runtime/retained-image/recovery/adoption/origin/cron/provider/release gates remain unchanged. No new data was used to reinterpret the old missing-metadata failure.

[Machine-readable findings](./db-publisher-evidence/FINDINGS.json), [complete evidence hashes](./db-publisher-evidence/SHA256SUMS.json), [local verification notes](./db-publisher-evidence/LOCAL_VERIFICATION_NOTES.json).
