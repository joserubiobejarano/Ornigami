#!/usr/bin/env bash
# Qualify an already-built image without invoking a build.
#
# The supplied reference must be immutable (sha256:<64-hex> or
# repo@sha256:<64-hex>). It is resolved to the local image ID and verified
# before the qualification creates any run resource. The resolved ID is then
# used for the runtime, packaged operator, browser phase, restart, fresh-volume
# restore, lock recovery and closed rollback inside qualify-linux.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IMAGE_REFERENCE="${IMAGE_REFERENCE:?IMAGE_REFERENCE must be an immutable image ID or repo@sha256 digest}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:?EXPECTED_ORIGIN is required}"
EXPECTED_PLATFORM="${EXPECTED_PLATFORM:-linux/amd64}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR must be a new directory}"
ENGINE="${ENGINE:-docker}"
NODE_BIN="${NODE_BIN:-node}"
PULL_EXISTING_IMAGE="${PULL_EXISTING_IMAGE:-0}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$IMAGE_REFERENCE" =~ ^sha256:[0-9a-f]{64}$ || "$IMAGE_REFERENCE" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]] \
  || fail "IMAGE_REFERENCE must be an immutable image ID or repo@sha256 digest: $IMAGE_REFERENCE"
[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_SOURCE_SHA must be 40 hex"
[[ "$EXPECTED_ORIGIN" == https://* ]] || fail "EXPECTED_ORIGIN must be the actual https origin"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"
command -v "$ENGINE" >/dev/null 2>&1 || fail "$ENGINE is required"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required"
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

mkdir -p "$EVIDENCE_DIR"
cp "$TEMP_DIR/identity-verification.json" "$EVIDENCE_DIR/image-identity-verification.json"
cp "$TEMP_DIR/image-inspect.json" "$EVIDENCE_DIR/image-inspect.json"

note "Qualifying the existing image ID (build is disabled)"
IMAGE_MODE=existing \
IMAGE="$IMAGE_ID" \
SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
EXPECTED_ORIGIN="$EXPECTED_ORIGIN" \
EXPECTED_PLATFORM="$EXPECTED_PLATFORM" \
EXPECTED_USER="$EXPECTED_USER" \
HARNESS_SHA="$HARNESS_SHA" \
EVIDENCE_DIR="$EVIDENCE_DIR/runtime" \
  "$ROOT/deploy/builder/qualify-linux.sh"

RUNTIME_RESULTS="$EVIDENCE_DIR/runtime/results.txt"
[[ -f "$RUNTIME_RESULTS" ]] || fail "runtime qualification results are missing"
grep -qx "image_mode=existing" "$RUNTIME_RESULTS" || fail "runtime did not record existing-image mode"
grep -qx "image_id=$IMAGE_ID" "$RUNTIME_RESULTS" || fail "runtime did not use the resolved image ID"
grep -qx "application_source_sha=$EXPECTED_SOURCE_SHA" "$RUNTIME_RESULTS" || fail "runtime source SHA mismatch"
grep -qx "harness_sha=$HARNESS_SHA" "$RUNTIME_RESULTS" || fail "runtime harness SHA mismatch"

cat > "$EVIDENCE_DIR/existing-image-qualification.json" <<EOF
{
  "schemaVersion": 1,
  "mode": "existing-image",
  "imageReference": "$IMAGE_REFERENCE",
  "imageId": "$IMAGE_ID",
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "origin": "$EXPECTED_ORIGIN",
  "platform": "$EXPECTED_PLATFORM",
  "user": "$EXPECTED_USER",
  "buildInvoked": false,
  "runtimeEvidence": "runtime/results.txt"
}
EOF

note "Existing-image qualification passed"
cat "$EVIDENCE_DIR/existing-image-qualification.json"
