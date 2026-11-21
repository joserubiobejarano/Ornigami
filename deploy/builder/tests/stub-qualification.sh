#!/usr/bin/env bash
# Test-only qualification receipt writer for exact-candidate orchestration tests.
# It never contacts an edge or browser. REHEARSAL_TEST_MODE=1 is required by the
# orchestration script before this path can be selected.
set -euo pipefail

EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR is required}"
IMAGE_REFERENCE="${IMAGE_REFERENCE:?IMAGE_REFERENCE is required}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
HARNESS_SHA="${HARNESS_SHA:?HARNESS_SHA is required}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:?EXPECTED_ORIGIN is required}"
[[ ! -e "$EVIDENCE_DIR" ]] || { echo "stub qualification: evidence exists" >&2; exit 1; }
mkdir -p "$EVIDENCE_DIR/edge" "$EVIDENCE_DIR/browser" "$EVIDENCE_DIR/runtime-edge" "$EVIDENCE_DIR/rollback"

cat > "$EVIDENCE_DIR/qualification-env.json" <<EOF
{
  "engine": "${ENGINE:-}",
  "dockerContext": "${DOCKER_CONTEXT:-}",
  "dockerHost": "${DOCKER_HOST:-}",
  "containerHost": "${CONTAINER_HOST:-}",
  "imageReference": "$IMAGE_REFERENCE",
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$EXPECTED_ORIGIN",
  "edgeAppContainer": "${EDGE_APP_CONTAINER:-}"
}
EOF

if [[ "${STUB_QUAL_FAIL:-0}" == "1" ]]; then
  printf 'interrupted qualification\n' > "$EVIDENCE_DIR/PARTIAL.txt"
  exit 1
fi

cat > "$EVIDENCE_DIR/existing-image-qualification.json" <<EOF
{
  "schemaVersion": 2,
  "mode": "existing-image",
  "qualificationPath": "https-edge",
  "imageReference": "$IMAGE_REFERENCE",
  "imageId": "$IMAGE_REFERENCE",
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$EXPECTED_ORIGIN",
  "effectiveRuntimeOrigin": "$EXPECTED_ORIGIN",
  "sameImageIdAcrossPhases": true,
  "buildInvoked": false,
  "httpsAcceptance": true,
  "fullHttpsAcceptance": true
}
EOF
cat > "$EVIDENCE_DIR/edge/edge-results.json" <<EOF
{"identity":{"imageId":"$IMAGE_REFERENCE","applicationSourceSha":"$EXPECTED_SOURCE_SHA","harnessSha":"$HARNESS_SHA"}}
EOF
cat > "$EVIDENCE_DIR/browser/results.json" <<EOF
{"identity":{"imageId":"$IMAGE_REFERENCE","applicationSourceSha":"$EXPECTED_SOURCE_SHA","harnessSha":"$HARNESS_SHA","applicationOrigin":"$EXPECTED_ORIGIN","qualificationPath":"https-edge"}}
EOF
cat > "$EVIDENCE_DIR/runtime-edge/identity.json" <<EOF
{"imageId":"$IMAGE_REFERENCE","applicationSourceSha":"$EXPECTED_SOURCE_SHA","harnessSha":"$HARNESS_SHA","origin":"$EXPECTED_ORIGIN"}
EOF
cat > "$EVIDENCE_DIR/rollback/results.txt" <<EOF
image_id=$IMAGE_REFERENCE
application_source_sha=$EXPECTED_SOURCE_SHA
harness_sha=$HARNESS_SHA
qualification_path=https-edge
effective_runtime_origin=$EXPECTED_ORIGIN
minimization_applied=true
restore_gate_blocked_reopen=true
restore_replay_completed=true
restored_access_denied=true
second_restore_cycle=true
EOF
