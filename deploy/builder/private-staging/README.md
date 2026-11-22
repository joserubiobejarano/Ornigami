# Synthetic private staging package — builder

Status: **review package only. Nothing was published, deployed, resolved in DNS,
or exposed.** This package binds a future synthetic-only private staging
acceptance to the qualified builder source
`4e3e00af212a3d97de582ab6fca6ecca8d0665dd`.

## Tested source and evidence

| Item | Value |
| --- | --- |
| Tested candidate source | `4e3e00af212a3d97de582ab6fca6ecca8d0665dd` |
| Passing Linux rehearsal | [run 44831470383](https://github.com/joserubiobejarano/Ornigami/actions/runs/44831470383) |
| Rehearsal local image ID | `sha256:954699fc57eedeae636830e82d056ca97e799bc1f6a49161582854129a73b980` |
| Rehearsal image platform | `linux/amd64` |
| Rehearsal image origin label | `http://127.0.0.1:3100` (loopback only) |
| Actions artifact | `builder-linux-qualification-44831470383-1` |
| Actions artifact digest | `sha256:50f5965eaec8f5ea1359a33519d71fe082e554343ac81b9600962b359df7c7da` |

The Actions artifact digest is **evidence transport identity**, not an image
digest. The loopback image ID above is **not** a registry digest and must not be
used to claim an actual-origin image is retained or deployable.

Run `44845147243` later qualified an actual-origin image locally. It recorded
image ID `sha256:f9a28737303852399ea604d569bd08c6ebc9293a75e4c01852f419f36ba40d12`
and rebuilt `sha256:4ec0396623b49cc94ba5f3b75c4b2eafa270999b39991b30c2daf9ade9d652f`
for the restore/rollback harness. Those two IDs are different, so the historical
package did not pass the same image through every phase. Its archive was
ephemeral and not retained, and bit-for-bit reproducibility from source was not
proven. See the [correction](../../../docs/handoffs/BUILDER_PRIVATE_STAGING_ACCEPTANCE_4E3E00A_CORRECTION_20261121.md)
and use the existing-image path below for fresh evidence.

## Proposed contract

| Area | Proposal | Status |
| --- | --- | --- |
| Host | Dedicated Linux x86_64 VPS with Docker; provider, region, IP and capacity pending. Do not use the shared Contabo/Coolify host unless the owner explicitly selects it and resolves proxy/firewall coexistence. | Pending |
| HTTPS origin | `https://builder-staging.ornigami.com` (root path, no prefix) | Pending DNS/TLS/edge approval |
| Private access | Caddy BasicAuth at the edge with an owner-held bcrypt record, then builder invite-only session gate. No credential is committed. | Pending access record |
| Proxy routing | Caddy container attached to `edge` and `builder_internal`; app only on `builder_internal`, no published app port. TLS terminates at Caddy. | Proposed |
| App topology | One app replica, UID/GID `1000:1000`, read-only root, only documented writable paths. | Tested locally/Linux |
| Volume | Named `ornigami-builder-store-v1` at `/data/builder`, one writer, root `1000:1000` mode `0700`, store file `0600`. Fresh volume initialized before writer/import. | Tested in rehearsal |
| Runtime egress | App only on `builder_internal` (`internal: true`); no provider, database, mail, billing, Sentry or paid-service credentials. Caddy is the separate edge process. | Proposed/tested in container |
| Rollback | Stop app or run this same image with `BUILDER_RUNTIME_MODE=closed` and the same volume. Preserve store/usage; do not use the old parent image in invite mode. | Tested in rehearsal |

Pending target details: provider/region/IP, DNS A/AAAA, ACME contact/certificate
issuer, Caddy image digest, BasicAuth user/hash custody, host firewall and
existing proxy coexistence, backup directory/encryption/retention, owner
privacy/support/retention sign-off and the exact private registry destination.

## Actual-origin image

The tested image was built for loopback. The actual staging image must be rebuilt
from the same source with the real origin:

```bash
SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
APP_URL=https://builder-staging.ornigami.com \
REGISTRY_REFERENCE=<private-registry>/ornigami-builder-staging@sha256:<digest-pending> \
OUTPUT_DIR=<new-local-evidence-dir> \
  deploy/builder/private-staging/build-and-retain.sh
```

The script requires a clean checkout at `SOURCE_SHA`, builds
`linux/amd64`, verifies the revision/origin/user/platform labels, saves the image
archive and writes `image-identity.json` plus `archive-receipt.json` with the
local image ID and archive SHA-256. It does not push. The receipt remains
`handoffComplete=false` until the archive is loaded and verified on a fresh or
isolated daemon:

```bash
ARCHIVE_PATH=<archive.tar> \
RECEIPT_PATH=<image-identity-dir>/archive-receipt.json \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
EXPECTED_IMAGE_ID=sha256:<resolved-image-id> \
EXPECTED_ORIGIN=https://builder-staging.ornigami.com \
EXPECTED_PLATFORM=linux/amd64 \
EXPECTED_USER=1000:1000 \
HARNESS_SHA=<harness-commit> \
EVIDENCE_DIR=<new-archive-verification-dir> \
  node deploy/builder/private-staging/verify-image-archive.mjs
```

This script checks the archive hash, requires the image to be absent on the
target daemon, loads it, and re-verifies the exact immutable image ID, source
SHA, origin, platform and user. A missing archive, missing receipt, hash
mismatch, pre-existing image or identity mismatch exits non-zero and records an
incomplete handoff. `REQUIRE_FRESH_DAEMON=0` is a deliberate bypass and always
exits incomplete/non-independent, recording which checks were performed.
Neither the local image ID nor an archive checksum proves bit-for-bit
reproducibility from source.

## Existing-image qualification

Use this path when an image was built or retained elsewhere. It accepts only an
immutable reference (`sha256:<64-hex>` or `repo@sha256:<64-hex>`), resolves it to
the local image ID, and verifies source, origin, platform and user **before**
creating run resources. It never rebuilds, retags a substitute or falls back to
a build. `QUALIFICATION_PATH` selects the scope explicitly.

### HTTPS private-edge path

An HTTPS image must use this path. It verifies the running edge app container is
the same image ID and origin, then runs edge, browser/ZIP/revocation, edge
runtime and isolated populated restart/restore/lock/closed rollback receipts
with that same ID.

```bash
QUALIFICATION_PATH=https-edge \
IMAGE_REFERENCE=sha256:f9a28737303852399ea604d569bd08c6ebc9293a75e4c01852f419f36ba40d12 \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
EXPECTED_ORIGIN=https://builder-staging.ornigami.com \
STAGING_ORIGIN=https://builder-staging.ornigami.com \
STAGING_BASIC_AUTH_USER=<private-user> \
STAGING_BASIC_AUTH_PASSWORD=<private-password> \
EDGE_APP_CONTAINER=<running-edge-app-container> \
EDGE_PROXY_CONTAINER=<running-caddy-container> \
EDGE_STORE_VOLUME=ornigami-builder-store-v1 \
BUILDER_OPERATOR_VOLUME=ornigami-builder-store-v1 \
BUILDER_RUNTIME_STORE_HOST_ID=ornigami-builder-store-v1 \
EXPECTED_PLATFORM=linux/amd64 \
EXPECTED_USER=1000:1000 \
HARNESS_SHA=<harness-commit> \
EVIDENCE_DIR=<new-existing-image-evidence-dir> \
  deploy/builder/private-staging/qualify-existing-image.sh
```

The summary records `applicationSourceSha`, `harnessSha`, `imageId`,
`applicationOrigin` and `effectiveRuntimeOrigin` separately. The effective
runtime origin remains the HTTPS application origin; no loopback address is
substituted. `edge/`, `browser/`, `runtime-edge/` and `rollback/` must all name
the same image ID. An app container running a different image, a conflicting
`APP_URL`/`STAGING_ORIGIN`, a non-HTTPS origin, or missing edge prerequisites
fails before the evidence directory or run resources are created.

### Diagnostic HTTP-loopback path

This is a separately identified local diagnostic scope. It is only valid for an
image whose configured origin is `http://127.0.0.1:<port>`; it never counts as
HTTPS acceptance.

```bash
QUALIFICATION_PATH=http-loopback \
IMAGE_REFERENCE=sha256:<loopback-image-id> \
EXPECTED_SOURCE_SHA=<source-sha> \
EXPECTED_ORIGIN=http://127.0.0.1:3100 \
EXPECTED_PLATFORM=linux/amd64 \
EXPECTED_USER=1000:1000 \
HARNESS_SHA=<harness-commit> \
EVIDENCE_DIR=<new-loopback-evidence-dir> \
  deploy/builder/private-staging/qualify-existing-image.sh
```

Its receipts explicitly record `https_acceptance=false` and
`acceptance_scope=diagnostic-http-loopback`. Registry references are only pulled
when `PULL_EXISTING_IMAGE=1` is explicitly set; no tag is created.

After separate publication authorization:

```bash
docker tag <local-image> <private-registry>/ornigami-builder-staging:<source-sha>
docker push <private-registry>/ornigami-builder-staging:<source-sha>
docker image inspect --format '{{json .RepoDigests}}' <private-registry>/ornigami-builder-staging:<source-sha>
```

Retain the immutable `repo@sha256:<digest>`, not the mutable tag. On a separate
host, independently pull and verify the exact digest:

```bash
IMAGE_REFERENCE=<private-registry>/ornigami-builder-staging@sha256:<digest> \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
EXPECTED_ORIGIN=https://builder-staging.ornigami.com \
EXPECTED_PLATFORM=linux/amd64 \
EVIDENCE_DIR=<new-verification-dir> \
  deploy/builder/private-staging/verify-retained-image.sh
```

Acceptance must name all four identities together: source SHA, immutable image
digest, `linux/amd64` platform and the exact HTTPS origin. Do not substitute the
Actions artifact digest, local image ID or mutable tag for the image digest.

## Configuration references

- [`compose.private-staging.reference.yml`](./compose.private-staging.reference.yml)
  — one app, one Caddy edge, internal app network, one persistent volume, no app
  port. All images/origin/access values are required inputs; nothing is deployed
  by its presence.
- [`Caddyfile.example`](./Caddyfile.example) — private BasicAuth, TLS, HSTS,
  trusted Host/proto forwarding and removal of alternate client-IP headers.
- [`staging-contract.example.json`](./staging-contract.example.json) —
  machine-readable proposal with pending target fields and separate image vs
  Actions evidence identities.

The reference Compose includes a one-shot `store-init` service. It runs as
`0:0`, with `--network none --read-only` semantics, only the persistent volume,
and finishes before the app starts. It initializes the volume root to
`1000:1000` mode `0700` and fails startup if the engine did not apply it.

The Caddy and app image references are deliberately not defaulted to unpinned
tags. The Caddy image must be selected and pinned separately. The BasicAuth
bcrypt record must come from a protected owner reference; escape Compose `$`
interpolation as required.

## Acceptance commands and expected results

Run only in the separately authorized synthetic staging session.

### 1. Edge, TLS, private access, CSP, initial SRI

```bash
STAGING_ORIGIN=https://builder-staging.ornigami.com \
STAGING_BASIC_AUTH_USER=<private-user> \
STAGING_BASIC_AUTH_PASSWORD=<private-password> \
EXPECTED_IMAGE_ID=sha256:<resolved-image-id> \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
HARNESS_SHA=<harness-commit> \
STAGING_EVIDENCE_DIR=<new-edge-evidence-dir> \
  node deploy/builder/private-staging/accept-edge.mjs
```

Expected: all checks `ok`: verified TLS, HTTP-to-HTTPS redirect, anonymous and
wrong-credential denial, authorized `200`, HSTS, builder CSP without
`unsafe-inline`/`unsafe-eval`, anonymous builder/session/generation denial,
unexpected Host rejection, and initial script SRI/hash verification. The result
records the application source SHA, harness SHA and immutable image ID
separately, and `edge-sri-scripts.json` records each script URL, declared
integrity and observed SHA-256. No real invite or paid call is made.

### 2. Browser/ZIP/revocation and dynamic SRI

Run on the staging host with access to the packaged image and volume:

```bash
STAGING_ORIGIN=https://builder-staging.ornigami.com \
STAGING_BASIC_AUTH_USER=<private-user> \
STAGING_BASIC_AUTH_PASSWORD=<private-password> \
BUILDER_OPERATOR_IMAGE=sha256:<resolved-image-id> \
BUILDER_OPERATOR_VOLUME=ornigami-builder-store-v1 \
BUILDER_RUNTIME_STORE_HOST_ID=ornigami-builder-store-v1 \
IMAGE_MODE=existing \
EXPECTED_IMAGE_ID=sha256:<resolved-image-id> \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
HARNESS_SHA=<harness-commit> \
QUALIFICATION_PATH=https-edge \
BROWSER_EVIDENCE_DIR=<new-browser-evidence-dir> \
  deploy/builder/private-staging/accept-browser.sh
```

Expected: `browser_acceptance=pass`, `origin:reachable`, `csp:header`, script
audits at the login page, after login, after generation, after refresh, after
edit, in a second tab and for subject B. Every audit records script URLs,
declared integrity, observed SHA-256, and inserted/removed delta scripts. It also
covers two-tab generation, replay `409`, a fresh approved ZIP audit, online
subject-A revocation while open, subject-B unaffected, and sign-out storage
clearing. The reused browser journey also verifies authenticated ZIP contents and
the existing revocation checks. Generation and refresh did not add script URLs in
the recorded historical run, but its two summary-only audits did not retain URLs
or hashes. The updated harness establishes the actual login/generation delta and
does not claim dynamic-chunk coverage without it.

### 3. Live runtime isolation and volume contract

```bash
APP_CONTAINER=<app-container> \
PROXY_CONTAINER=<caddy-container> \
STORE_VOLUME=ornigami-builder-store-v1 \
EXPECTED_ORIGIN=https://builder-staging.ornigami.com \
EXPECTED_SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
EXPECTED_IMAGE_ID=sha256:<resolved-image-id> \
HARNESS_SHA=<harness-commit> \
EVIDENCE_DIR=<new-runtime-evidence-dir> \
  deploy/builder/private-staging/accept-runtime.sh
```

Expected: read-only root, `1000:1000`, the exact immutable image ID, no
published app port, only internal app network(s), denied public egress, no
forbidden provider/database/mail/Sentry environment, volume label, root
`1000:1000:700`, store file `1000:1000:600` when populated, and proxy
publishing only the approved bindings. Proxy `HostConfig.PortBindings` is parsed
structurally against the explicit `PROXY_BINDING_PROFILE`:

- `wildcard` (default; existing internet-facing scope): container
  ports/protocols exactly `80/tcp`, `443/tcp`, `443/udp`; host ports `80`, `443`,
  `443`; bind addresses empty, `0.0.0.0` or `::`.
- `loopback` (temporary local private-edge scope): the same exact container/host
  ports, but bind addresses only `127.0.0.1` or `::1`.

The selected profile is recorded in `checks.tsv`, `results.txt`,
`identity.json` and `proxy-bindings.json`. Any extra container port (including
`8080`), altered host port, unexpected address, extra protocol, duplicate
binding or mixture of wildcard and loopback addresses fails. This script is
read-only.

### 4. Populated backup/restore, lock recovery and closed rollback

```bash
SOURCE_SHA=4e3e00af212a3d97de582ab6fca6ecca8d0665dd \
APP_URL=https://builder-staging.ornigami.com \
QUALIFICATION_PATH=https-edge \
IMAGE_MODE=existing \
EXPECTED_IMAGE_ID=sha256:<resolved-image-id> \
HARNESS_SHA=<harness-commit> \
EVIDENCE_DIR=<new-partial-runtime-evidence-dir> \
  deploy/builder/private-staging/accept-runtime-rollback.sh
```

Expected: the existing Linux harness passes restore root `0700`, store `0600`,
hash/record preservation, foreign-scope lock recovery and same-image closed
rollback. It also applies a reviewed minimisation to the stopped authoritative
store, prepares and replays the resulting journal into an older backup, verifies
that the minimised subject is denied after restore, and runs a second restore
cycle from a newer snapshot where journal A+B is replayed while receipt A is
preserved and only B is applied. The results must record
`minimization_applied=true`, `restore_gate_blocked_reopen=true`,
`restore_replay_completed=true`, `restored_access_denied=true`,
`second_restore_cycle=true` and
`second_restore_receipt_history_preserved=true`.

Journal events are version `2` with canonical `intentDigest`; prepared gates and
attempt receipts are version `3` with ordered `{id,intentDigest}`
`journalCommitments`. The same-image negative cases must pass both before and
after preparation: a reused-id journal with a recomputed digest is rejected by
the preserved receipt/backup commitments before preparation, and different
evidence submitted after preparation is rejected by the prepared-attempt guard.
Both must leave the store hash unchanged, keep the gate closed and leave the
control subject active. Required markers are
`changed_intent_before_prepare_blocked=true`,
`changed_evidence_after_prepare_blocked=true`,
`prior_commitments_preserved=true`, `same_id_changed_intent_replay_blocked=true`,
`changed_intent_gate_preserved=true` and `control_subject_access=true`.

In existing-image mode the harness builds nothing; the results must record
`image_mode=existing`, the exact
`image_id`, the application source SHA and the harness SHA separately. Because
browser is intentionally skipped here, the result must contain
`browser_journey=skipped`, `full_acceptance=false` and
`acceptance_scope=partial`. It cannot be the full acceptance receipt by itself.

Full acceptance requires the edge, staging browser, live runtime and
runtime/rollback receipts together, plus the independently pulled or
archive-loaded image identity. Each receipt must name the same application
source SHA and immutable image ID while recording the harness SHA separately.
Keep each receipt separate.

### One exact-candidate rehearsal

`rehearse-exact-candidate.sh` has three explicit actions:

1. `ACTION=plan` (default) validates inputs and writes the plan/RUNBOOK. It
   contacts no engine, registry or origin.
2. `ACTION=checkpoint` builds the exact source SHA once, retains the archive,
   verifies it on a fresh daemon, verifies a transfer on the phase daemon when
   that daemon is different, and stops with `CHECKPOINT_READY.txt`. The new image
   is not running on the verification daemon; edge setup remains an explicit
   external authorization step.
3. `ACTION=qualify` resumes from `checkpoint.json`, re-verifies the existing
   archive/receipt, the observed daemon identities and the running edge app, then
   runs qualification with that same immutable image ID. It never builds again,
   substitutes an image, erases prior attempts or accepts changed
   source/origin/daemon inputs.

Engine routing is per phase:

- `*_ENGINE` is `docker` or `podman`; `*_ENGINE_BIN` optionally names the binary.
- Use one daemon selector: a Docker `*_CONTEXT`, or an explicit endpoint via
  `*_ENDPOINT`, `*_DOCKER_HOST` (Docker) or `*_CONTAINER_HOST` (Podman).
- Do not combine a non-default context with an endpoint. Podman context routing
  is not supported; use an explicit endpoint.
- Observed daemon identities, not selector names or image absence, decide
  independence. Build and verification resolving to the same observed daemon
  fails before build. Docker identity uses the daemon `ID`; Podman identity uses
  `Host.Hostname` plus `Store.GraphRoot`.
- If the phase daemon differs from the verification daemon, the archive is
  loaded and verified on a fresh phase daemon before qualification.

Plan:

```bash
ACTION=plan \
SOURCE_SHA=<exact-candidate-sha> \
APP_URL=https://builder-staging.ornigami.com \
REHEARSAL_DIR=<new-directory> \
BUILD_CONTEXT=build-runner \
VERIFY_CONTEXT=isolated-daemon \
PHASE_CONTEXT=isolated-daemon \
  deploy/builder/private-staging/rehearse-exact-candidate.sh
```

Checkpoint:

```bash
ACTION=checkpoint \
SOURCE_SHA=<exact-candidate-sha> \
APP_URL=https://builder-staging.ornigami.com \
HARNESS_SHA=<harness-sha> \
REHEARSAL_DIR=<same-new-directory> \
BUILD_ENGINE=docker BUILD_CONTEXT=build-runner \
VERIFY_ENGINE=docker VERIFY_CONTEXT=isolated-daemon \
PHASE_ENGINE=docker PHASE_CONTEXT=isolated-daemon \
  deploy/builder/private-staging/rehearse-exact-candidate.sh
```

After the checkpoint prints the verified image ID, configure the private HTTPS
edge with that exact ID. Then resume:

```bash
ACTION=qualify \
REHEARSAL_DIR=<same-directory> \
EDGE_APP_CONTAINER=<running-edge-app> \
EDGE_PROXY_CONTAINER=<running-caddy> \
EDGE_STORE_VOLUME=<edge-store-volume> \
BUILDER_OPERATOR_VOLUME=<edge-store-volume> \
BUILDER_RUNTIME_STORE_HOST_ID=<edge-store-host-id> \
STAGING_BASIC_AUTH_USER=<private-user> \
STAGING_BASIC_AUTH_PASSWORD=<private-password> \
  deploy/builder/private-staging/rehearse-exact-candidate.sh
```

Supply the same source/origin/daemon inputs if overriding checkpoint defaults;
changed values are rejected. The script links source SHA, harness SHA, immutable
image ID, archive SHA-256/size, effective HTTPS origin, daemon identities and
every phase receipt. It never pushes, deploys, changes DNS or opens customer
admission. Remote execution, edge changes, archive custody/storage and any
registry publication require explicit authorization.

## Qualification evidence matrix

| Behavior | Local coverage in this package | Still requires real Linux/edge execution |
| --- | --- | --- |
| Immutable reference resolution, source/origin/platform/user checks | Focused unit tests and stub-engine shell tests | Image from the accepted registry/archive |
| Existing-image mode cannot build or retag | Stub-engine call log assertions on mount-only and failure paths | Confirm with the real engine and exact retained ID |
| HTTPS vs loopback origin contract | Shell regression with conflicting inputs and HTTPS mount-only receipt | Full HTTPS browser against the private edge |
| Edge/TLS/private access/CSP/initial SRI | Edge script contract checks | Real DNS/TLS/Caddy/BasicAuth endpoint |
| Browser/ZIP/revocation/dynamic SRI | Browser harness contract checks | Real browser run through the HTTPS edge |
| Edge runtime isolation/proxy bindings | Structural parser regressions | Live app/proxy container inspection |
| Populated restart/restore/lock/closed rollback | Existing Linux harness, stub mount-only path | Real isolated volume/container execution |
| Archive handoff | Receipt/hash/bypass/incomplete tests | Fresh/isolated daemon load and independent custody |
| Public/real-customer admission | Not covered | Separate customer/privacy/security/host gates |

## Rollback

Preferred rollback on any staging failure:

1. Remove the app from Caddy/proxy traffic; keep the proxy or return a closed
   notice.
2. Stop the app container. Do not run overlapping replicas.
3. Preserve `ornigami-builder-store-v1` and every subject/session/usage record.
4. Either leave it stopped or start **this same retained image** with
   `BUILDER_RUNTIME_MODE=closed` and the same volume. Closed mode serves `/` with
   `200`, keeps `/builder` `404` and session `401`, and preserves the store hash
   and records.
5. Do not delete the store, clear usage or edit `identity-store.json`.
6. Do not run the old parent image in invite mode: it does not enforce
   generation budgets.

The existing qualification already proves the closed rollback contract; repeat
it against the actual-origin image in step 4 above.

## Boundary

Publication, deployment, DNS, TLS/edge changes, registry push, real invitations
and paid calls remain outside this package and require the separately authorized
staging session. No customer data, secret, bcrypt record or connection string is
committed here.
