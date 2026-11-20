#!/usr/bin/env bash
# Build the actual-origin candidate image and retain a local reviewable archive.
# This script never pushes to a registry or deploys.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
APP_URL="${APP_URL:?APP_URL is required, e.g. https://builder-staging.example}"
REGISTRY_REFERENCE="${REGISTRY_REFERENCE:-}"
OUTPUT_DIR="${OUTPUT_DIR:?OUTPUT_DIR must be a new directory}"
PLATFORM="${PLATFORM:-linux/amd64}"
IMAGE="${IMAGE:-ornigami-builder:actual-${SOURCE_SHA:0:12}}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA must be 40 hex"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail "HEAD does not equal SOURCE_SHA"
[[ -z "$(git status --porcelain)" ]] || fail "worktree must be clean"
[[ "$APP_URL" == https://* ]] || fail "actual staging APP_URL must use https"
[[ ! -e "$OUTPUT_DIR" ]] || fail "OUTPUT_DIR already exists: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

ENGINE="${ENGINE:-docker}"
command -v "$ENGINE" >/dev/null 2>&1 || fail "$ENGINE is required"
"$ENGINE" info >/dev/null 2>&1 || fail "$ENGINE daemon is not usable"

note "Building $PLATFORM image for $APP_URL from $SOURCE_SHA"
"$ENGINE" build --platform "$PLATFORM" \
  --label "org.ornigami.qualify.run=staging-${SOURCE_SHA:0:12}" \
  --label "org.ornigami.qualify.source-sha=$SOURCE_SHA" \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  --build-arg ORNIGAMI_SOURCE_SHA="$SOURCE_SHA" \
  -f deploy/builder/Dockerfile \
  -t "$IMAGE" "$ROOT"

IMAGE_ID="$("$ENGINE" image inspect --format '{{.Id}}' "$IMAGE")"
REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
ORIGIN_LABEL="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$IMAGE")"
IMAGE_USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE")"
IMAGE_PLATFORM="$("$ENGINE" image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")"

[[ "$REVISION" == "$SOURCE_SHA" ]] || fail "revision label mismatch"
[[ "$ORIGIN_LABEL" == "$APP_URL" ]] || fail "origin label mismatch"
[[ "$IMAGE_USER" == "1000:1000" ]] || fail "image user mismatch"
[[ "$IMAGE_PLATFORM" == "$PLATFORM" ]] || fail "image platform mismatch"

ARCHIVE="$OUTPUT_DIR/ornigami-builder-${SOURCE_SHA:0:12}.tar"
note "Saving local archive"
"$ENGINE" image save -o "$ARCHIVE" "$IMAGE"
ARCHIVE_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
ARCHIVE_BYTES="$(stat -c '%s' "$ARCHIVE")"
"$ENGINE" image inspect "$IMAGE" > "$OUTPUT_DIR/image-inspect.json"

cat > "$OUTPUT_DIR/image-identity.json" <<EOF
{
  "sourceSha": "$SOURCE_SHA",
  "origin": "$APP_URL",
  "platform": "$PLATFORM",
  "imageReference": "$IMAGE",
  "localImageId": "$IMAGE_ID",
  "revisionLabel": "$REVISION",
  "originLabel": "$ORIGIN_LABEL",
  "archive": "$ARCHIVE",
  "archiveSha256": "$ARCHIVE_SHA256",
  "archiveBytes": $ARCHIVE_BYTES,
  "registryReference": "${REGISTRY_REFERENCE:-pending}",
  "registryDigest": "pending independent push and pull",
  "actionsEvidenceDigest": "separate record; never used as image identity"
}
EOF

cat > "$OUTPUT_DIR/VERIFY.txt" <<EOF
Local image ID: $IMAGE_ID
Platform: $IMAGE_PLATFORM
Revision: $REVISION
Origin: $ORIGIN_LABEL
Archive SHA-256: $ARCHIVE_SHA256

Registry publication is not authorized by this script. On the authorized
staging session, push this exact local image to the approved private registry,
then record the immutable repo digest:

  $ENGINE tag "$IMAGE" "$REGISTRY_REFERENCE"
  $ENGINE push "$REGISTRY_REFERENCE"
  $ENGINE image inspect --format '{{json .RepoDigests}}' "$REGISTRY_REFERENCE"

Independently pull and verify on a separate host with:

  deploy/builder/private-staging/verify-retained-image.sh
EOF

note "Wrote $OUTPUT_DIR/image-identity.json"
cat "$OUTPUT_DIR/image-identity.json"
