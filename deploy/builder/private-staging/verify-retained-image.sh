#!/usr/bin/env bash
# Independently pull and verify a retained actual-origin builder image.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IMAGE_REFERENCE="${IMAGE_REFERENCE:?IMAGE_REFERENCE must be repo@sha256:<digest>}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:?EXPECTED_ORIGIN is required}"
EXPECTED_PLATFORM="${EXPECTED_PLATFORM:-linux/amd64}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR must be a new directory}"
ENGINE="${ENGINE:-docker}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$IMAGE_REFERENCE" == *"@sha256:"* ]] || fail "use an immutable repo@sha256 digest"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"
"$ENGINE" pull --platform "$EXPECTED_PLATFORM" "$IMAGE_REFERENCE"

IMAGE_ID="$("$ENGINE" image inspect --format '{{.Id}}' "$IMAGE_REFERENCE")"
REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE_REFERENCE")"
ORIGIN="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$IMAGE_REFERENCE")"
USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE_REFERENCE")"
PLATFORM="$("$ENGINE" image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_REFERENCE")"
REPO_DIGESTS="$("$ENGINE" image inspect --format '{{json .RepoDigests}}' "$IMAGE_REFERENCE")"

[[ "$REVISION" == "$EXPECTED_SOURCE_SHA" ]] || fail "revision label mismatch: $REVISION"
[[ "$ORIGIN" == "$EXPECTED_ORIGIN" ]] || fail "origin label mismatch: $ORIGIN"
[[ "$USER" == "1000:1000" ]] || fail "image user mismatch: $USER"
[[ "$PLATFORM" == "$EXPECTED_PLATFORM" ]] || fail "platform mismatch: $PLATFORM"
[[ "$REPO_DIGESTS" == *"${IMAGE_REFERENCE#*@}"* ]] || fail "pulled image digest is absent from RepoDigests"

"$ENGINE" image inspect "$IMAGE_REFERENCE" > "$EVIDENCE_DIR/image-inspect.json"
cat > "$EVIDENCE_DIR/verification.json" <<EOF
{
  "sourceSha": "$EXPECTED_SOURCE_SHA",
  "origin": "$EXPECTED_ORIGIN",
  "platform": "$PLATFORM",
  "imageReference": "$IMAGE_REFERENCE",
  "localImageId": "$IMAGE_ID",
  "revisionLabel": "$REVISION",
  "originLabel": "$ORIGIN",
  "user": "$USER",
  "repoDigests": $REPO_DIGESTS,
  "verified": true
}
EOF
note "Independent image verification passed"
cat "$EVIDENCE_DIR/verification.json"
