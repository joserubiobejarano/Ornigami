#!/usr/bin/env bash
# Prepare or execute one exact-candidate rehearsal:
#   1. build the exact source SHA once and retain the local archive;
#   2. independently load and verify that archive on a separate daemon context;
#   3. qualify the exact same immutable image ID through edge, browser, runtime,
#      restore/replay and closed-rollback phases.
#
# The default is PLAN_ONLY=1: it validates the inputs, writes a reviewable plan
# and never contacts an engine, registry or origin. Execution requires
# EXECUTE=1 plus all staging inputs and the separate authorized host/edge
# session. This script never pushes an image, deploys, changes DNS or admits a
# customer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
APP_URL="${APP_URL:?APP_URL must be the exact HTTPS application origin}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
PLATFORM="${PLATFORM:-linux/amd64}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
REHEARSAL_DIR="${REHEARSAL_DIR:?REHEARSAL_DIR must be a new directory}"
PLAN_ONLY="${PLAN_ONLY:-1}"
EXECUTE="${EXECUTE:-0}"
BUILD_ENGINE="${BUILD_ENGINE:-docker}"
VERIFY_ENGINE="${VERIFY_ENGINE:-docker}"
PHASE_ENGINE="${PHASE_ENGINE:-$VERIFY_ENGINE}"
BUILD_CONTEXT="${BUILD_CONTEXT:-${BUILD_DOCKER_HOST:-local-build-engine}}"
VERIFY_CONTEXT="${VERIFY_CONTEXT:-${VERIFY_DOCKER_HOST:-isolated-verify-engine}}"
PHASE_CONTEXT="${PHASE_CONTEXT:-${PHASE_DOCKER_HOST:-$VERIFY_CONTEXT}}"
ARCHIVE_VERIFY_DIR="$REHEARSAL_DIR/archive-verification"
QUALIFICATION_DIR="$REHEARSAL_DIR/qualification"
IMAGE_OUTPUT_DIR="$REHEARSAL_DIR/image"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA must be 40 hex"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$APP_URL" == https://* ]] || fail "APP_URL must use https"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail "HEAD does not equal SOURCE_SHA"
[[ -z "$(git status --porcelain)" ]] || fail "worktree must be clean"
[[ ! -e "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR already exists: $REHEARSAL_DIR"
[[ "$PLAN_ONLY" == "0" || "$PLAN_ONLY" == "1" ]] || fail "PLAN_ONLY must be 0 or 1"
[[ "$EXECUTE" == "0" || "$EXECUTE" == "1" ]] || fail "EXECUTE must be 0 or 1"
if [[ "$EXECUTE" == "1" ]]; then
  [[ "$PLAN_ONLY" == "0" ]] || fail "EXECUTE=1 requires PLAN_ONLY=0"
  [[ "$BUILD_CONTEXT" != "$VERIFY_CONTEXT" ]] \
    || fail "archive verification must use a daemon context independent of the build"
fi

NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required"
"$NODE_BIN" -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$APP_URL" || fail "APP_URL must be an exact origin"

mkdir -p "$REHEARSAL_DIR"
cat > "$REHEARSAL_DIR/rehearsal-plan.json" <<EOF
{
  "schemaVersion": 1,
  "status": "planned",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$APP_URL",
  "platform": "$PLATFORM",
  "user": "$EXPECTED_USER",
  "buildOnce": true,
  "archiveRetained": true,
  "independentArchiveVerification": true,
  "sameImageIdForEveryPhase": true,
  "build": {
    "engine": "$BUILD_ENGINE",
    "daemonContext": "$BUILD_CONTEXT",
    "outputDir": "$IMAGE_OUTPUT_DIR"
  },
  "archiveVerification": {
    "engine": "$VERIFY_ENGINE",
    "daemonContext": "$VERIFY_CONTEXT",
    "evidenceDir": "$ARCHIVE_VERIFY_DIR"
  },
  "qualification": {
    "engine": "$PHASE_ENGINE",
    "daemonContext": "$PHASE_CONTEXT",
    "evidenceDir": "$QUALIFICATION_DIR",
    "qualificationPath": "https-edge",
    "phases": ["edge", "browser", "runtime", "restore", "minimization", "journal-replay", "second-restore", "closed-rollback"]
  },
  "externalGates": [
    "authorized Linux builder host and container engine",
    "authorized private staging HTTPS origin, DNS/TLS edge and BasicAuth custody",
    "authorized isolated artifact-storage/custody location for the retained archive",
    "separately authorized remote execution and artifact-storage actions"
  ],
  "customerAdmission": "closed"
}
EOF

cat > "$REHEARSAL_DIR/RUNBOOK.txt" <<EOF
Exact-candidate rehearsal plan
==============================

Application source SHA: $SOURCE_SHA
Acceptance harness SHA: $HARNESS_SHA
Effective HTTPS origin:  $APP_URL
Platform/user:           $PLATFORM / $EXPECTED_USER
Build daemon context:    $BUILD_CONTEXT
Verify daemon context:   $VERIFY_CONTEXT (must differ from build)
Phase daemon context:    $PHASE_CONTEXT

1. Build once and retain the archive

   SOURCE_SHA=$SOURCE_SHA \\
   APP_URL=$APP_URL \\
   HARNESS_SHA=$HARNESS_SHA \\
   OUTPUT_DIR=$IMAGE_OUTPUT_DIR \\
   PLATFORM=$PLATFORM \\
   ENGINE=$BUILD_ENGINE \\
     deploy/builder/private-staging/build-and-retain.sh

   Required outputs: image-identity.json, archive-receipt.json and the archive
   named by archive-receipt.json. The receipt remains handoffComplete=false.

2. Independently reload and verify the retained archive

   Use a fresh/isolated daemon whose context is $VERIFY_CONTEXT, not the build
   daemon. The verifier refuses a daemon that already contains the image.

   ARCHIVE_PATH=<archive-receipt.archivePath> \\
   RECEIPT_PATH=$IMAGE_OUTPUT_DIR/archive-receipt.json \\
   EXPECTED_SOURCE_SHA=$SOURCE_SHA \\
   EXPECTED_IMAGE_ID=<archive-receipt.imageId> \\
   EXPECTED_ORIGIN=$APP_URL \\
   EXPECTED_PLATFORM=$PLATFORM \\
   EXPECTED_USER=$EXPECTED_USER \\
   HARNESS_SHA=$HARNESS_SHA \\
   EVIDENCE_DIR=$ARCHIVE_VERIFY_DIR \\
   ENGINE=$VERIFY_ENGINE \\
     node deploy/builder/private-staging/verify-image-archive.mjs

   Required: complete=true, independentHandoff=true and the loaded image ID
   equal to the receipt image ID.

3. Qualify that same image ID for every required phase

   QUALIFICATION_PATH=https-edge \\
   IMAGE_REFERENCE=<archive-receipt.imageId> \\
   EXPECTED_SOURCE_SHA=$SOURCE_SHA \\
   EXPECTED_ORIGIN=$APP_URL \\
   STAGING_ORIGIN=$APP_URL \\
   EXPECTED_PLATFORM=$PLATFORM \\
   EXPECTED_USER=$EXPECTED_USER \\
   HARNESS_SHA=$HARNESS_SHA \\
   EVIDENCE_DIR=$QUALIFICATION_DIR \\
   ENGINE=$PHASE_ENGINE \\
     deploy/builder/private-staging/qualify-existing-image.sh

   Required inputs: STAGING_BASIC_AUTH_USER/PASSWORD,
   EDGE_APP_CONTAINER, EDGE_PROXY_CONTAINER, BUILDER_OPERATOR_VOLUME and
   BUILDER_RUNTIME_STORE_HOST_ID. The existing-image wrapper never builds or
   retags and checks the same image ID in edge, browser, runtime and rollback
   receipts.

4. Link immutable identities

   Preserve together: source SHA, harness SHA, immutable image ID, archive
   SHA-256 and size, effective HTTPS origin, edge/browser/runtime/rollback
   receipts, minimization journal hash, restore attempt/receipt IDs and the
   second-restore receipt history. Do not substitute an Actions artifact
   digest, mutable tag, loopback origin or rebuilt image.

Authorization boundary
-----------------------
This plan does not authorize remote execution, registry publication, artifact
storage, DNS/TLS/edge changes, deployment, real invitations or paid calls.
Obtain those approvals before EXECUTE=1. Customer admission remains closed.
EOF

if [[ "$EXECUTE" != "1" ]]; then
  note "Plan written to $REHEARSAL_DIR/rehearsal-plan.json and RUNBOOK.txt"
  note "No engine, registry or origin was contacted. Customer admission remains closed."
  exit 0
fi

[[ -n "${STAGING_BASIC_AUTH_USER:-}" && -n "${STAGING_BASIC_AUTH_PASSWORD:-}" ]] \
  || fail "STAGING_BASIC_AUTH_USER/PASSWORD are required for execution"
[[ -n "${EDGE_APP_CONTAINER:-}" && -n "${EDGE_PROXY_CONTAINER:-}" ]] \
  || fail "EDGE_APP_CONTAINER/EDGE_PROXY_CONTAINER are required for execution"
[[ -n "${BUILDER_OPERATOR_VOLUME:-}" && -n "${BUILDER_RUNTIME_STORE_HOST_ID:-}" ]] \
  || fail "BUILDER_OPERATOR_VOLUME/BUILDER_RUNTIME_STORE_HOST_ID are required for execution"

build_env=(ENGINE="$BUILD_ENGINE")
[[ -n "${BUILD_DOCKER_HOST:-}" ]] && build_env+=(DOCKER_HOST="$BUILD_DOCKER_HOST")
verify_env=(ENGINE="$VERIFY_ENGINE")
[[ -n "${VERIFY_DOCKER_HOST:-}" ]] && verify_env+=(DOCKER_HOST="$VERIFY_DOCKER_HOST")
phase_env=(ENGINE="$PHASE_ENGINE")
[[ -n "${PHASE_DOCKER_HOST:-}" ]] && phase_env+=(DOCKER_HOST="$PHASE_DOCKER_HOST")

note "Building the exact candidate once"
env "${build_env[@]}" \
  SOURCE_SHA="$SOURCE_SHA" \
  APP_URL="$APP_URL" \
  HARNESS_SHA="$HARNESS_SHA" \
  OUTPUT_DIR="$IMAGE_OUTPUT_DIR" \
  PLATFORM="$PLATFORM" \
  "$ROOT/deploy/builder/private-staging/build-and-retain.sh"

IMAGE_ID="$("$NODE_BIN" -e '
  const fs = require("node:fs");
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(receipt.imageId ?? "");
' "$IMAGE_OUTPUT_DIR/archive-receipt.json")"
ARCHIVE_PATH="$("$NODE_BIN" -e '
  const fs = require("node:fs");
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(receipt.archivePath ?? "");
' "$IMAGE_OUTPUT_DIR/archive-receipt.json")"
[[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "archive receipt did not record an immutable image ID"
[[ -f "$ARCHIVE_PATH" ]] || fail "archive receipt points at a missing archive: $ARCHIVE_PATH"

note "Independently loading and verifying the retained archive"
env "${verify_env[@]}" \
  ARCHIVE_PATH="$ARCHIVE_PATH" \
  RECEIPT_PATH="$IMAGE_OUTPUT_DIR/archive-receipt.json" \
  EXPECTED_SOURCE_SHA="$SOURCE_SHA" \
  EXPECTED_IMAGE_ID="$IMAGE_ID" \
  EXPECTED_ORIGIN="$APP_URL" \
  EXPECTED_PLATFORM="$PLATFORM" \
  EXPECTED_USER="$EXPECTED_USER" \
  HARNESS_SHA="$HARNESS_SHA" \
  EVIDENCE_DIR="$ARCHIVE_VERIFY_DIR" \
  "$NODE_BIN" deploy/builder/private-staging/verify-image-archive.mjs

note "Qualifying the exact same image ID through every phase"
env "${phase_env[@]}" \
  QUALIFICATION_PATH=https-edge \
  IMAGE_REFERENCE="$IMAGE_ID" \
  EXPECTED_SOURCE_SHA="$SOURCE_SHA" \
  EXPECTED_ORIGIN="$APP_URL" \
  STAGING_ORIGIN="$APP_URL" \
  STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
  STAGING_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
  EDGE_APP_CONTAINER="$EDGE_APP_CONTAINER" \
  EDGE_PROXY_CONTAINER="$EDGE_PROXY_CONTAINER" \
  BUILDER_OPERATOR_VOLUME="$BUILDER_OPERATOR_VOLUME" \
  BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
  EXPECTED_PLATFORM="$PLATFORM" \
  EXPECTED_USER="$EXPECTED_USER" \
  HARNESS_SHA="$HARNESS_SHA" \
  EVIDENCE_DIR="$QUALIFICATION_DIR" \
  "$ROOT/deploy/builder/private-staging/qualify-existing-image.sh"

note "Verify the immutable identity chain across the retained receipts"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [dir, imageId, sourceSha, harnessSha, origin] = process.argv.slice(1);
  const archive = JSON.parse(fs.readFileSync(path.join(dir, "archive-verification", "archive-verification.json"), "utf8"));
  const qualification = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "existing-image-qualification.json"), "utf8"));
  const edge = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "edge", "edge-results.json"), "utf8"));
  const browser = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "browser", "results.json"), "utf8"));
  const runtime = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "runtime-edge", "identity.json"), "utf8"));
  const rollback = fs.readFileSync(path.join(dir, "qualification", "rollback", "results.txt"), "utf8");
  const match = (value, expected, label) => {
    if (value !== expected) throw new Error(`${label} mismatch: ${value} !== ${expected}`);
  };
  match(archive.complete, true, "archive complete");
  match(archive.independentHandoff, true, "archive independence");
  match(archive.imageId, imageId, "archive image ID");
  match(archive.applicationSourceSha, sourceSha, "archive source SHA");
  match(archive.applicationOrigin, origin, "archive origin");
  match(qualification.imageId, imageId, "qualification image ID");
  match(qualification.applicationSourceSha, sourceSha, "qualification source SHA");
  match(qualification.harnessSha, harnessSha, "qualification harness SHA");
  match(qualification.applicationOrigin, origin, "qualification origin");
  match(qualification.effectiveRuntimeOrigin, origin, "effective runtime origin");
  match(qualification.sameImageIdAcrossPhases, true, "same image across phases");
  match(qualification.buildInvoked, false, "qualification build invocation");
  match(edge.identity?.imageId, imageId, "edge image ID");
  match(browser.identity?.imageId, imageId, "browser image ID");
  match(browser.identity?.applicationOrigin, origin, "browser origin");
  match(runtime.imageId, imageId, "runtime image ID");
  match(runtime.origin, origin, "runtime origin");
  for (const expected of [
    `image_id=${imageId}`,
    `application_source_sha=${sourceSha}`,
    `harness_sha=${harnessSha}`,
    "qualification_path=https-edge",
    `effective_runtime_origin=${origin}`,
    "minimization_applied=true",
    "restore_gate_blocked_reopen=true",
    "restore_replay_completed=true",
    "restored_access_denied=true",
    "second_restore_cycle=true",
  ]) {
    if (!rollback.split(/\r?\n/).includes(expected)) throw new Error(`rollback missing ${expected}`);
  }
' "$REHEARSAL_DIR" "$IMAGE_ID" "$SOURCE_SHA" "$HARNESS_SHA" "$APP_URL"

cat > "$REHEARSAL_DIR/rehearsal-identities.json" <<EOF
{
  "schemaVersion": 1,
  "status": "complete",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$IMAGE_ID",
  "archivePath": "$ARCHIVE_PATH",
  "applicationOrigin": "$APP_URL",
  "effectiveRuntimeOrigin": "$APP_URL",
  "buildDaemonContext": "$BUILD_CONTEXT",
  "verifyDaemonContext": "$VERIFY_CONTEXT",
  "phaseDaemonContext": "$PHASE_CONTEXT",
  "sameImageIdForEveryPhase": true,
  "buildInvokedOnce": true,
  "archiveIndependentlyVerified": true,
  "customerAdmission": "closed"
}
EOF
cat > "$REHEARSAL_DIR/REHEARSAL_COMPLETE.txt" <<EOF
Exact-candidate rehearsal complete.
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_id=$IMAGE_ID
application_origin=$APP_URL
effective_runtime_origin=$APP_URL
customer_admission=closed
EOF

note "Exact-candidate rehearsal complete; customer admission remains closed."
