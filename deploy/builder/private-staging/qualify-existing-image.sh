#!/usr/bin/env bash
# Qualify an already-built image without invoking a build.
#
# The supplied reference must be immutable (sha256:<64-hex> or
# repo@sha256:<64-hex>). It is resolved to the local image ID and verified
# before any run resource is created. QUALIFICATION_PATH selects the explicit
# scope:
#   https-edge     private HTTPS edge + browser/ZIP/revocation + edge runtime +
#                  isolated populated restart/restore/lock/closed rollback
#   http-loopback  local diagnostic transport for a loopback HTTP image
#
# An HTTPS image cannot be qualified through the loopback path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IMAGE_REFERENCE="${IMAGE_REFERENCE:?IMAGE_REFERENCE must be an immutable image ID or repo@sha256 digest}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:?EXPECTED_ORIGIN is required}"
EXPECTED_PLATFORM="${EXPECTED_PLATFORM:-linux/amd64}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR must be a new directory}"
QUALIFICATION_PATH="${QUALIFICATION_PATH:?QUALIFICATION_PATH must be https-edge or http-loopback}"
ENGINE="${ENGINE:-docker}"
NODE_BIN="${NODE_BIN:-node}"
PULL_EXISTING_IMAGE="${PULL_EXISTING_IMAGE:-0}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
APP_URL_INPUT="${APP_URL:-}"
MOUNT_ONLY="${MOUNT_ONLY:-0}"
PROXY_BINDING_PROFILE="${PROXY_BINDING_PROFILE:-wildcard}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$IMAGE_REFERENCE" =~ ^sha256:[0-9a-f]{64}$ || "$IMAGE_REFERENCE" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]] \
  || fail "IMAGE_REFERENCE must be an immutable image ID or repo@sha256 digest: $IMAGE_REFERENCE"
[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_SOURCE_SHA must be 40 hex"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$QUALIFICATION_PATH" == "https-edge" || "$QUALIFICATION_PATH" == "http-loopback" ]] \
  || fail "QUALIFICATION_PATH must be https-edge or http-loopback"
[[ "$PROXY_BINDING_PROFILE" == "wildcard" || "$PROXY_BINDING_PROFILE" == "loopback" ]] \
  || fail "PROXY_BINDING_PROFILE must be wildcard or loopback"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"
command -v "$ENGINE" >/dev/null 2>&1 || fail "$ENGINE is required"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required"

"$NODE_BIN" -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$EXPECTED_ORIGIN" || fail "EXPECTED_ORIGIN must be an exact origin"

if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
  [[ "$EXPECTED_ORIGIN" == https://* ]] || fail "https-edge requires an HTTPS EXPECTED_ORIGIN"
  STAGING_ORIGIN="${STAGING_ORIGIN:?STAGING_ORIGIN is required for https-edge}"
  [[ "$STAGING_ORIGIN" == "$EXPECTED_ORIGIN" ]] \
    || fail "STAGING_ORIGIN [$STAGING_ORIGIN] conflicts with the image origin [$EXPECTED_ORIGIN]"
  [[ -z "$APP_URL_INPUT" || "$APP_URL_INPUT" == "$EXPECTED_ORIGIN" ]] \
    || fail "APP_URL [$APP_URL_INPUT] conflicts with the image origin [$EXPECTED_ORIGIN]"
  STAGING_BASIC_AUTH_USER="${STAGING_BASIC_AUTH_USER:?STAGING_BASIC_AUTH_USER is required for https-edge}"
  STAGING_BASIC_AUTH_PASSWORD="${STAGING_BASIC_AUTH_PASSWORD:?STAGING_BASIC_AUTH_PASSWORD is required for https-edge}"
  EDGE_APP_CONTAINER="${EDGE_APP_CONTAINER:?EDGE_APP_CONTAINER is required for https-edge}"
  EDGE_PROXY_CONTAINER="${EDGE_PROXY_CONTAINER:?EDGE_PROXY_CONTAINER is required for https-edge}"
  BUILDER_OPERATOR_VOLUME="${BUILDER_OPERATOR_VOLUME:?BUILDER_OPERATOR_VOLUME is required for https-edge}"
  BUILDER_RUNTIME_STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:?BUILDER_RUNTIME_STORE_HOST_ID is required for https-edge}"
  EDGE_STORE_VOLUME="${EDGE_STORE_VOLUME:-$BUILDER_OPERATOR_VOLUME}"
else
  [[ "$EXPECTED_ORIGIN" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] \
    || fail "http-loopback requires EXPECTED_ORIGIN=http://127.0.0.1:<port>"
  [[ -z "$APP_URL_INPUT" || "$APP_URL_INPUT" == "$EXPECTED_ORIGIN" ]] \
    || fail "APP_URL [$APP_URL_INPUT] conflicts with the image origin [$EXPECTED_ORIGIN]"
fi

"$ENGINE" info >/dev/null 2>&1 || fail "$ENGINE daemon is not usable"

if [[ "$PULL_EXISTING_IMAGE" == "1" && "$IMAGE_REFERENCE" == *"@sha256:"* ]]; then
  note "Pulling the exact immutable reference (no tag is created)"
  "$ENGINE" pull --platform "$EXPECTED_PLATFORM" "$IMAGE_REFERENCE"
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-${TEMP:-/tmp}}/ornigami-existing-image.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
if ! "$ENGINE" image inspect "$IMAGE_REFERENCE" > "$TEMP_DIR/image-inspect.json" 2>"$TEMP_DIR/inspect.err"; then
  cat "$TEMP_DIR/inspect.err" >&2 || true
  fail "immutable image reference is not present on this daemon: $IMAGE_REFERENCE"
fi
IMAGE_ID="$("$NODE_BIN" -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const image = Array.isArray(value) ? value[0] : value;
  process.stdout.write(image?.Id ?? "");
' "$TEMP_DIR/image-inspect.json")"
[[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "could not resolve an immutable image ID from $IMAGE_REFERENCE"
if [[ "$IMAGE_REFERENCE" == sha256:* && "$IMAGE_ID" != "$IMAGE_REFERENCE" ]]; then
  fail "image ID did not resolve to itself: $IMAGE_REFERENCE -> $IMAGE_ID"
fi

note "Resolved $IMAGE_REFERENCE to $IMAGE_ID"
"$NODE_BIN" deploy/builder/private-staging/image-identity.mjs \
  --inspect "$TEMP_DIR/image-inspect.json" \
  --expected-image-id "$IMAGE_ID" \
  --expected-source-sha "$EXPECTED_SOURCE_SHA" \
  --expected-origin "$EXPECTED_ORIGIN" \
  --expected-platform "$EXPECTED_PLATFORM" \
  --expected-user "$EXPECTED_USER" \
  --output "$TEMP_DIR/identity-verification.json" >/dev/null

if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
  EDGE_IMAGE_ID="$("$ENGINE" inspect --format '{{.Image}}' "$EDGE_APP_CONTAINER" 2>/dev/null)" \
    || fail "edge app container is not present: $EDGE_APP_CONTAINER"
  [[ "$EDGE_IMAGE_ID" == "$IMAGE_ID" ]] \
    || fail "edge app container image mismatch: expected $IMAGE_ID, got $EDGE_IMAGE_ID"
  EDGE_RUNNING="$("$ENGINE" inspect --format '{{.State.Running}}' "$EDGE_APP_CONTAINER")"
  [[ "$EDGE_RUNNING" == "true" ]] || fail "edge app container is not running: $EDGE_APP_CONTAINER"
  EDGE_REVISION_LABEL="$("$ENGINE" inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$EDGE_APP_CONTAINER")"
  EDGE_ORIGIN_LABEL="$("$ENGINE" inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$EDGE_APP_CONTAINER")"
  [[ "$EDGE_REVISION_LABEL" == "$EXPECTED_SOURCE_SHA" ]] \
    || fail "edge app source label mismatch: expected $EXPECTED_SOURCE_SHA, got $EDGE_REVISION_LABEL"
  [[ "$EDGE_ORIGIN_LABEL" == "$EXPECTED_ORIGIN" ]] \
    || fail "edge app origin label mismatch: expected $EXPECTED_ORIGIN, got $EDGE_ORIGIN_LABEL"
  PROXY_RUNNING="$("$ENGINE" inspect --format '{{.State.Running}}' "$EDGE_PROXY_CONTAINER" 2>/dev/null)" \
    || fail "edge proxy container is not present: $EDGE_PROXY_CONTAINER"
  [[ "$PROXY_RUNNING" == "true" ]] || fail "edge proxy container is not running: $EDGE_PROXY_CONTAINER"
  "$ENGINE" volume inspect "$EDGE_STORE_VOLUME" >/dev/null 2>&1 \
    || fail "edge store volume is not present: $EDGE_STORE_VOLUME"
fi

mkdir -p "$EVIDENCE_DIR"
cp "$TEMP_DIR/identity-verification.json" "$EVIDENCE_DIR/image-identity-verification.json"
cp "$TEMP_DIR/image-inspect.json" "$EVIDENCE_DIR/image-inspect.json"

if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
  note "Running HTTPS private-edge edge acceptance"
  STAGING_ORIGIN="$EXPECTED_ORIGIN" \
  STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
  STAGING_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
  EXPECTED_IMAGE_ID="$IMAGE_ID" \
  EXPECTED_SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
  HARNESS_SHA="$HARNESS_SHA" \
  STAGING_EVIDENCE_DIR="$EVIDENCE_DIR/edge" \
    "$NODE_BIN" deploy/builder/private-staging/accept-edge.mjs

  note "Running HTTPS private-edge browser/ZIP/revocation acceptance"
  STAGING_ORIGIN="$EXPECTED_ORIGIN" \
  STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
  STAGING_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
  BUILDER_OPERATOR_IMAGE="$IMAGE_ID" \
  BUILDER_OPERATOR_VOLUME="$BUILDER_OPERATOR_VOLUME" \
  BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
  IMAGE_MODE=existing \
  EXPECTED_IMAGE_ID="$IMAGE_ID" \
  EXPECTED_SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
  HARNESS_SHA="$HARNESS_SHA" \
  QUALIFICATION_PATH=https-edge \
  BROWSER_EVIDENCE_DIR="$EVIDENCE_DIR/browser" \
  ENGINE="$ENGINE" \
    "$ROOT/deploy/builder/private-staging/accept-browser.sh"

  note "Running edge runtime/isolation acceptance"
  APP_CONTAINER="$EDGE_APP_CONTAINER" \
  PROXY_CONTAINER="$EDGE_PROXY_CONTAINER" \
  STORE_VOLUME="$EDGE_STORE_VOLUME" \
  EXPECTED_ORIGIN="$EXPECTED_ORIGIN" \
  EXPECTED_SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
  EXPECTED_IMAGE_ID="$IMAGE_ID" \
  HARNESS_SHA="$HARNESS_SHA" \
  EVIDENCE_DIR="$EVIDENCE_DIR/runtime-edge" \
  ENGINE="$ENGINE" \
  NODE_BIN="$NODE_BIN" \
  PROXY_BINDING_PROFILE="$PROXY_BINDING_PROFILE" \
    "$ROOT/deploy/builder/private-staging/accept-runtime.sh"

  note "Running isolated populated restart/restore/lock/closed rollback"
  SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
  APP_URL="$EXPECTED_ORIGIN" \
  QUALIFICATION_PATH=https-edge \
  IMAGE_MODE=existing \
  EXPECTED_IMAGE_ID="$IMAGE_ID" \
  HARNESS_SHA="$HARNESS_SHA" \
  EVIDENCE_DIR="$EVIDENCE_DIR/rollback" \
  ENGINE="$ENGINE" \
    "$ROOT/deploy/builder/private-staging/accept-runtime-rollback.sh"

  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [dir, imageId, sourceSha, harnessSha, origin] = process.argv.slice(1);
    const edge = JSON.parse(fs.readFileSync(path.join(dir, "edge", "edge-results.json"), "utf8"));
    const browser = JSON.parse(fs.readFileSync(path.join(dir, "browser", "results.json"), "utf8"));
    const runtime = JSON.parse(fs.readFileSync(path.join(dir, "runtime-edge", "identity.json"), "utf8"));
    const rollback = fs.readFileSync(path.join(dir, "rollback", "results.txt"), "utf8");
    const match = (value, expected, label) => {
      if (value !== expected) throw new Error(`${label} mismatch: ${value} !== ${expected}`);
    };
    match(edge.identity?.imageId, imageId, "edge image ID");
    match(edge.identity?.applicationSourceSha, sourceSha, "edge source SHA");
    match(edge.identity?.harnessSha, harnessSha, "edge harness SHA");
    match(browser.identity?.imageId, imageId, "browser image ID");
    match(browser.identity?.applicationSourceSha, sourceSha, "browser source SHA");
    match(browser.identity?.harnessSha, harnessSha, "browser harness SHA");
    match(browser.identity?.qualificationPath, "https-edge", "browser path");
    match(browser.identity?.applicationOrigin, origin, "browser origin");
    match(runtime.imageId, imageId, "runtime image ID");
    match(runtime.applicationSourceSha, sourceSha, "runtime source SHA");
    match(runtime.harnessSha, harnessSha, "runtime harness SHA");
    match(runtime.origin, origin, "runtime origin");
    for (const expected of [
      `image_id=${imageId}`,
      `application_source_sha=${sourceSha}`,
      `harness_sha=${harnessSha}`,
      "qualification_path=https-edge",
      `effective_runtime_origin=${origin}`,
    ]) {
      if (!rollback.split(/\r?\n/).includes(expected)) throw new Error(`rollback missing ${expected}`);
    }
  ' "$EVIDENCE_DIR" "$IMAGE_ID" "$EXPECTED_SOURCE_SHA" "$HARNESS_SHA" "$EXPECTED_ORIGIN"

  cat > "$EVIDENCE_DIR/existing-image-qualification.json" <<EOF
{
  "schemaVersion": 2,
  "mode": "existing-image",
  "qualificationPath": "https-edge",
  "imageReference": "$IMAGE_REFERENCE",
  "imageId": "$IMAGE_ID",
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$EXPECTED_ORIGIN",
  "effectiveRuntimeOrigin": "$EXPECTED_ORIGIN",
  "diagnosticTransportOrigin": null,
  "edgeAppContainer": "$EDGE_APP_CONTAINER",
  "edgeImageId": "$EDGE_IMAGE_ID",
  "sameImageIdAcrossPhases": true,
  "buildInvoked": false,
  "httpsAcceptance": true,
  "fullHttpsAcceptance": true,
  "phases": ["edge", "browser", "runtime", "rollback"],
  "runtimeEvidence": "rollback/results.txt"
}
EOF
else
  note "Running diagnostic HTTP-loopback qualification (not HTTPS acceptance)"
  IMAGE_MODE=existing \
  IMAGE="$IMAGE_ID" \
  SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
  APP_URL="$EXPECTED_ORIGIN" \
  QUALIFICATION_PATH=http-loopback \
  APPLICATION_ORIGIN="$EXPECTED_ORIGIN" \
  BROWSER_ORIGIN="$EXPECTED_ORIGIN" \
  EXPECTED_ORIGIN="$EXPECTED_ORIGIN" \
  EXPECTED_PLATFORM="$EXPECTED_PLATFORM" \
  EXPECTED_USER="$EXPECTED_USER" \
  HARNESS_SHA="$HARNESS_SHA" \
  MOUNT_ONLY="$MOUNT_ONLY" \
  EVIDENCE_DIR="$EVIDENCE_DIR/runtime" \
    "$ROOT/deploy/builder/qualify-linux.sh"

  RUNTIME_RESULTS="$EVIDENCE_DIR/runtime/results.txt"
  [[ -f "$RUNTIME_RESULTS" ]] || fail "runtime qualification results are missing"
  grep -qx "image_mode=existing" "$RUNTIME_RESULTS" || fail "runtime did not record existing-image mode"
  grep -qx "image_id=$IMAGE_ID" "$RUNTIME_RESULTS" || fail "runtime did not use the resolved image ID"
  grep -qx "application_source_sha=$EXPECTED_SOURCE_SHA" "$RUNTIME_RESULTS" || fail "runtime source SHA mismatch"
  grep -qx "harness_sha=$HARNESS_SHA" "$RUNTIME_RESULTS" || fail "runtime harness SHA mismatch"
  grep -qx "qualification_path=http-loopback" "$RUNTIME_RESULTS" || fail "runtime path mismatch"
  grep -qx "effective_runtime_origin=$EXPECTED_ORIGIN" "$RUNTIME_RESULTS" || fail "runtime origin mismatch"
  grep -qx "browser_origin=$EXPECTED_ORIGIN" "$RUNTIME_RESULTS" || fail "browser origin mismatch"
  grep -qx "https_acceptance=false" "$RUNTIME_RESULTS" || fail "loopback path must not claim HTTPS acceptance"
  if grep -qx "mount_only=true" "$RUNTIME_RESULTS"; then
    FULL_LOOPBACK=false
  else
    grep -qx "acceptance_scope=diagnostic-http-loopback" "$RUNTIME_RESULTS" || fail "loopback scope mismatch"
    FULL_LOOPBACK=true
  fi

  cat > "$EVIDENCE_DIR/existing-image-qualification.json" <<EOF
{
  "schemaVersion": 2,
  "mode": "existing-image",
  "qualificationPath": "http-loopback",
  "imageReference": "$IMAGE_REFERENCE",
  "imageId": "$IMAGE_ID",
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$EXPECTED_ORIGIN",
  "effectiveRuntimeOrigin": "$EXPECTED_ORIGIN",
  "diagnosticTransportOrigin": "$EXPECTED_ORIGIN",
  "sameImageIdAcrossPhases": true,
  "buildInvoked": false,
  "httpsAcceptance": false,
  "fullHttpsAcceptance": false,
  "fullLoopbackAcceptance": $FULL_LOOPBACK,
  "phases": ["loopback-runtime", "loopback-browser", "loopback-restore", "loopback-rollback"],
  "runtimeEvidence": "runtime/results.txt"
}
EOF
fi

note "Existing-image qualification passed ($QUALIFICATION_PATH)"
cat "$EVIDENCE_DIR/existing-image-qualification.json"
