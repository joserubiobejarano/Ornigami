#!/usr/bin/env bash
# Local routing double for qualify-existing-image.sh. It writes identity-linked
# synthetic receipts only; it never contacts an edge, browser or container.
set -euo pipefail

STATE="${STUB_STATE:?STUB_STATE is required}"
[[ "$QUALIFICATION_PATH" == "https-edge" ]] || { echo "expected https-edge" >&2; exit 1; }
[[ "$IMAGE_REFERENCE" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "expected immutable image ID" >&2; exit 1; }
[[ "$STAGING_ORIGIN" == "$EXPECTED_ORIGIN" ]] || { echo "origin mismatch" >&2; exit 1; }
[[ "$EXPECTED_ORIGIN" == https://* ]] || { echo "expected HTTPS origin" >&2; exit 1; }
mkdir -p "$EVIDENCE_DIR/edge" "$EVIDENCE_DIR/browser" "$EVIDENCE_DIR/runtime-edge" "$EVIDENCE_DIR/rollback"
printf '%s\t%s\t%s\n' "$IMAGE_REFERENCE" "$EXPECTED_ORIGIN" "$HARNESS_SHA" >> "$STATE/qualification-calls.log"

cat > "$EVIDENCE_DIR/edge/edge-results.json" <<EOF
{
  "identity": {
    "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
    "harnessSha": "$HARNESS_SHA",
    "imageId": "$IMAGE_REFERENCE",
    "applicationOrigin": "$EXPECTED_ORIGIN"
  },
  "checks": [{"name": "stub-edge", "ok": true}]
}
EOF

cat > "$EVIDENCE_DIR/browser/results.json" <<EOF
{
  "identity": {
    "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
    "harnessSha": "$HARNESS_SHA",
    "imageId": "$IMAGE_REFERENCE",
    "qualificationPath": "https-edge",
    "applicationOrigin": "$EXPECTED_ORIGIN",
    "effectiveRuntimeOrigin": "$EXPECTED_ORIGIN"
  },
  "checks": [{"name": "stub-browser", "ok": true}]
}
EOF

cat > "$EVIDENCE_DIR/runtime-edge/identity.json" <<EOF
{
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$IMAGE_REFERENCE",
  "origin": "$EXPECTED_ORIGIN"
}
EOF

cat > "$EVIDENCE_DIR/rollback/results.txt" <<EOF
ok=true
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
same_id_changed_intent_replay_blocked=true
changed_intent_gate_preserved=true
control_subject_access=true
EOF

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
  "phases": ["edge", "browser", "runtime", "rollback"]
}
EOF
