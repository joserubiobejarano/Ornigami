# Intermediate image inventory and scanning preparation

This helper is prepared locally, not wired into a run. No new image exists. Real
Trivy/archive execution and every intermediate security result remain untested.
Local tests use fake scanner/metadata responses and do not invoke custody APIs.

After separate exact-candidate/run approval, `scan-image-stages.mjs PLAN.json NEW_OUTPUT`
consumes already exported single-image **Docker archives**. It never builds, pulls,
runs containers, publishes, changes limits, suppresses findings or acknowledges
custody. The destination must not exist. Each image needs its archive SHA-256 and
config image ID, checked independently against its archive. Hashing streams the
archive rather than loading gigabytes into the Node heap. Linux amd64 is required.

Plan shape (`<...>` must be replaced by measured, approved identities):

```json
{
  "schema": 1,
  "sourceSha": "<full committed candidate SHA>",
  "trivy": {
    "path": "<checksum-verified Trivy 0.76.0 executable>",
    "sha256": "<extracted binary SHA-256>",
    "cacheDirectory": "<fresh predownloaded cache, frozen for all stages>"
  },
  "images": [
    {
      "stage": "original-base",
      "archive": "<single-image Docker archive>",
      "archiveSha256": "<64 lowercase hex>",
      "imageId": "sha256:<64 lowercase hex>"
    }
  ]
}
```

Include **all** `original-base`, `build-base`, `deps`, `builder`, `prod-deps`,
`runner`, `buildkit`, `dockerfile-frontend` entries. Additional parents/tool images
are allowed, scanned and gated equally. A two-parent minimal-image proposal must
also include `original-runtime-base`; do not treat a debug builder parent as
evidence for a different runtime parent. Do not populate unknown identities with
guesses or reuse an archive under a misleading stage name.

The exact Dockerfile currently has five named stages. During an authorized future
run, export them **serially through the existing 8 GiB/3 CPU/zero-swap BuildKit
builder**, with the exact source context and the same fictional build arguments:
4096 MiB heap, memory optimizations true, source maps retained, webpack worker
false. Use `--target STAGE --output type=docker,dest=STAGE.tar --metadata-file ...`
and `--label org.opencontainers.image.revision=SOURCE_SHA` so builder/runner archive
labels bind to the admitted source. Preserve BuildKit metadata, source/workflow/
lock hashes and archive/config hashes before scanning. Cache reuse is an
optimization, never permission to skip an unbuilt stage or an error.

Only one archive is exported/scanned at a time; remove that run-owned archive
after its scan, inventory and digest receipts are saved. A future driver may call
the same collector per export only if it preserves this aggregate coverage and
final all-stage gate; the current helper expects all plan archives present, so its
all-at-once use requires explicit disk admission for their total size. **Do not
assume serial scanning makes all-at-once archive storage bounded.** Keep at least
20 GiB free plus estimated total archive size when choosing that mode. Admission
must stop rather than purchase/increase capacity. Prefer implementing streaming
serial export/collection after separate run-scope review. Do not add extra parallel
builds or silently rerun a failed export.

Record the exact original parent image(s), BuildKit pinned image and Dockerfile
frontend image resolved by the admitted build; save their archives separately. The
current BuildKit is `moby/buildkit:v0.33.1` at the committed digest. The old build
resolved Dockerfile frontend 1.7 to
`sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`;
the Dockerfile directive is still tag-based. Pinning that frontend and any base
change belongs to the next reviewed implementation, not this capture-only repair.

Every scan requests **all OS/library packages and every severity**, uses an empty
explicit ignore file in a fresh working directory, removes inherited TRIVY_*
overrides and disables ignore-unfixed. Collection exits zero only to retain the
complete report; the independent aggregate gate fails on any high/critical,
scanner error, identity mismatch, missing OS inventory or absent upgraded npm
tree/root version. It continues collecting other stages after a stage error.
Raw JSON, package inventories, arguments, logs, exits, config/arch identity and an
incrementally saved index remain available even when security fails. The npm
11.21.1 root and `/opt/ornigami-npm/` bundled tree must be present in every upgraded
intermediate; a scanner coverage limitation is failure, not a clean result.

Freeze and hash the fresh Trivy DB plus metadata for all stages; reject expired
metadata and DB mutation. Retain scanner release/archive checksum evidence as the
existing workflow does. Scans must precede owner custody and cleanup and be copied
into the final artifact/manifest. Do not upload the archives or embedded build env.
No stage scan is evidence custody; no custody acknowledgment is image acceptance.

Inventory limits: scanner-reported package coverage is not a complete audit of
statically embedded code in Node, SWC, sharp/libvips or downloaded native tooling.
Also collect all installed package manifests, `.node`/ELF file hashes, interpreter/
DT_NEEDED/RPATH/version requirements with an external pinned ELF inspector, and
Node/OpenSSL/sharp/libvips versions. Never run `ldd` on untrusted input or copy an
unchecked library closure. Preserve unknown applicability as open. The approved
run's zero final language highs is not a substitute for these tooling scans.
