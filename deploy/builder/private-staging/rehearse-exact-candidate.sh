#!/usr/bin/env bash
# Prepare, checkpoint or resume one exact-candidate rehearsal:
#   1. build the exact source SHA once and retain the archive/receipt in an
#      explicitly authorized custody directory;
#   2. independently load and verify that archive on a separate daemon context;
#   3. stop at the edge-setup checkpoint;
#   4. resume against the matching private HTTPS edge and run browser, runtime,
#      restore, minimisation, journal replay, second restore and closed rollback
#      with the same immutable image ID.
#
# REHEARSAL_MODE=plan (default) writes a reviewable plan and contacts no engine,
# registry or origin. prepare/run modes require authority flags and a new
# custody directory. resume requires the edge and custody authority plus the
# checkpoint created by prepare. This script never pushes an image, deploys,
# changes DNS or admits a customer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
APP_URL="${APP_URL:?APP_URL must be the exact HTTPS application origin}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
PLATFORM="${PLATFORM:-linux/amd64}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
REHEARSAL_DIR="${REHEARSAL_DIR:?REHEARSAL_DIR must be a new directory for plan/prepare or the prepared directory for resume}"
PLAN_ONLY="${PLAN_ONLY:-1}"
EXECUTE="${EXECUTE:-0}"
REHEARSAL_MODE="${REHEARSAL_MODE:-}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
BUILD_ENGINE="${BUILD_ENGINE:-docker}"
VERIFY_ENGINE="${VERIFY_ENGINE:-docker}"
PHASE_ENGINE="${PHASE_ENGINE:-$VERIFY_ENGINE}"
BUILD_CONTEXT="${BUILD_CONTEXT:-${BUILD_DOCKER_HOST:-local-build-engine}}"
VERIFY_CONTEXT="${VERIFY_CONTEXT:-${VERIFY_DOCKER_HOST:-isolated-verify-engine}}"
PHASE_CONTEXT="${PHASE_CONTEXT:-${PHASE_DOCKER_HOST:-$VERIFY_CONTEXT}}"
QUALIFICATION_RUNNER="${QUALIFICATION_RUNNER:-$ROOT/deploy/builder/private-staging/qualify-existing-image.sh}"
ARTIFACT_CUSTODY_DIR="${ARTIFACT_CUSTODY_DIR:-}"
RUNNER_AUTHORIZED="${RUNNER_AUTHORIZED:-0}"
DAEMON_AUTHORIZED="${DAEMON_AUTHORIZED:-0}"
EDGE_AUTHORIZED="${EDGE_AUTHORIZED:-0}"
ARTIFACT_CUSTODY_AUTHORIZED="${ARTIFACT_CUSTODY_AUTHORIZED:-0}"
ARCHIVE_VERIFY_DIR="$REHEARSAL_DIR/archive-verification"
QUALIFICATION_DIR="$REHEARSAL_DIR/qualification"
CHECKPOINT_FILE="$REHEARSAL_DIR/rehearsal-checkpoint.json"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

if [[ -z "$REHEARSAL_MODE" ]]; then
  if [[ "$EXECUTE" == "1" ]]; then
    REHEARSAL_MODE="all"
  else
    REHEARSAL_MODE="plan"
  fi
fi
case "$REHEARSAL_MODE" in
  plan|prepare|resume|all) ;;
  *) fail "REHEARSAL_MODE must be plan, prepare, resume or all" ;;
esac
if [[ "$REHEARSAL_MODE" == "plan" ]]; then
  PLAN_ONLY=1
else
  PLAN_ONLY=0
fi
if [[ "$REHEARSAL_MODE" == "plan" && "$PLAN_ONLY" != "1" ]]; then
  fail "PLAN_ONLY=0 requires REHEARSAL_MODE=prepare, resume or all"
fi
[[ "$PLAN_ONLY" == "0" || "$PLAN_ONLY" == "1" ]] || fail "PLAN_ONLY must be 0 or 1"
[[ "$EXECUTE" == "0" || "$EXECUTE" == "1" ]] || fail "EXECUTE must be 0 or 1"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA must be 40 hex"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$APP_URL" == https://* ]] || fail "APP_URL must use https"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail "HEAD does not equal SOURCE_SHA"
if [[ "$ALLOW_DIRTY" != "1" ]]; then
  [[ -z "$(git status --porcelain)" ]] || fail "worktree must be clean"
fi

if [[ "$REHEARSAL_MODE" == "plan" || "$REHEARSAL_MODE" == "prepare" || "$REHEARSAL_MODE" == "all" ]]; then
  [[ ! -e "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR already exists: $REHEARSAL_DIR"
else
  [[ -d "$REHEARSAL_DIR" ]] || fail "resume requires an existing REHEARSAL_DIR: $REHEARSAL_DIR"
  [[ -f "$CHECKPOINT_FILE" ]] || fail "resume requires a prepared checkpoint: $CHECKPOINT_FILE"
fi

if [[ "$REHEARSAL_MODE" != "plan" ]]; then
  [[ "$RUNNER_AUTHORIZED" == "1" ]] \
    || fail "runner authority is not established (set RUNNER_AUTHORIZED=1 only after approval)"
  [[ "$DAEMON_AUTHORIZED" == "1" ]] \
    || fail "daemon authority is not established (set DAEMON_AUTHORIZED=1 only after approval)"
  [[ "$ARTIFACT_CUSTODY_AUTHORIZED" == "1" ]] \
    || fail "artifact-custody authority is not established (set ARTIFACT_CUSTODY_AUTHORIZED=1 only after approval)"
  if [[ "$REHEARSAL_MODE" == "resume" || "$REHEARSAL_MODE" == "all" ]]; then
    [[ "$EDGE_AUTHORIZED" == "1" ]] \
      || fail "edge authority is not established (set EDGE_AUTHORIZED=1 only after approval)"
  fi
  [[ "$BUILD_CONTEXT" != "$VERIFY_CONTEXT" ]] \
    || fail "archive verification must use a daemon context independent of the build"
  [[ "$PHASE_CONTEXT" == "$VERIFY_CONTEXT" ]] \
    || fail "the phase daemon must be the independently verified daemon context"
fi

NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required"
"$NODE_BIN" -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$APP_URL" || fail "APP_URL must be an exact origin"

json_file_field() {
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    let value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const segment of process.argv.slice(2)) {
      value = Array.isArray(value) ? value[Number(segment)] : value?.[segment];
    }
    process.stdout.write(value === undefined || value === null ? "" : String(value));
  ' "$@"
}

if [[ "$REHEARSAL_MODE" == "plan" ]]; then
  [[ -z "$ARTIFACT_CUSTODY_DIR" ]] && ARTIFACT_CUSTODY_DIR="$REHEARSAL_DIR/custody"
  mkdir -p "$REHEARSAL_DIR"
  cat > "$REHEARSAL_DIR/rehearsal-plan.json" <<EOF
{
  "schemaVersion": 2,
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
  "checkpoint": {
    "stopAt": "edge-setup",
    "prepareMode": "REHEARSAL_MODE=prepare",
    "resumeMode": "REHEARSAL_MODE=resume"
  },
  "custody": {
    "directory": "$ARTIFACT_CUSTODY_DIR",
    "requiresExplicitAuthorization": true
  },
  "build": {
    "engine": "$BUILD_ENGINE",
    "daemonContext": "$BUILD_CONTEXT",
    "outputDir": "$ARTIFACT_CUSTODY_DIR/image"
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
    "phases": ["edge", "browser", "runtime", "restore", "minimization", "journal-replay", "same-id-changed-intent-negative", "second-restore", "closed-rollback"]
  },
  "authority": {
    "runner": false,
    "daemon": false,
    "edge": false,
    "artifactCustody": false
  },
  "externalGates": [
    "authorized Linux runner and container-engine daemon",
    "authorized private staging HTTPS origin, DNS/TLS edge and BasicAuth custody",
    "authorized artifact-custody location for the retained archive and receipt",
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
Phase daemon context:    $PHASE_CONTEXT (must equal verify)
Artifact custody path:   $ARTIFACT_CUSTODY_DIR (new, authorized)

Stage 1 - prepare and stop at edge-setup

   SOURCE_SHA=$SOURCE_SHA \\
   APP_URL=$APP_URL \\
   HARNESS_SHA=$HARNESS_SHA \\
   REHEARSAL_DIR=$REHEARSAL_DIR \\
   REHEARSAL_MODE=prepare \\
   PLAN_ONLY=0 \\
   RUNNER_AUTHORIZED=1 \\
   DAEMON_AUTHORIZED=1 \\
   ARTIFACT_CUSTODY_AUTHORIZED=1 \\
   ARTIFACT_CUSTODY_DIR=$ARTIFACT_CUSTODY_DIR \\
   BUILD_CONTEXT=$BUILD_CONTEXT \\
   VERIFY_CONTEXT=$VERIFY_CONTEXT \\
   PHASE_CONTEXT=$PHASE_CONTEXT \\
     deploy/builder/private-staging/rehearse-exact-candidate.sh

   This builds once, writes the archive and archive-receipt.json under custody,
   independently loads and verifies the archive, then writes
   rehearsal-checkpoint.json with state=edge-setup. It stops before any edge,
   browser, runtime or qualification container is created.

Stage 2 - resume against the matching private HTTPS edge

   SOURCE_SHA=$SOURCE_SHA \\
   APP_URL=$APP_URL \\
   HARNESS_SHA=$HARNESS_SHA \\
   REHEARSAL_DIR=$REHEARSAL_DIR \\
   REHEARSAL_MODE=resume \\
   PLAN_ONLY=0 \\
   RUNNER_AUTHORIZED=1 \\
   DAEMON_AUTHORIZED=1 \\
   EDGE_AUTHORIZED=1 \\
   ARTIFACT_CUSTODY_AUTHORIZED=1 \\
   BUILD_CONTEXT=$BUILD_CONTEXT \\
   VERIFY_CONTEXT=$VERIFY_CONTEXT \\
   PHASE_CONTEXT=$PHASE_CONTEXT \\
   STAGING_BASIC_AUTH_USER=<private-user> \\
   STAGING_BASIC_AUTH_PASSWORD=<private-password> \\
   EDGE_APP_CONTAINER=<running-edge-app-container> \\
   EDGE_PROXY_CONTAINER=<running-caddy-container> \\
   BUILDER_OPERATOR_VOLUME=<store-volume> \\
   BUILDER_RUNTIME_STORE_HOST_ID=<store-host-id> \\
     deploy/builder/private-staging/rehearse-exact-candidate.sh

   Resume reads the checkpoint, rechecks the archive SHA-256 and identity,
   requires the same source/image/origin/custody, then runs the existing-image
   qualification. It never builds, retags or substitutes an image.

Required immutable identities
-----------------------------
application source SHA -> acceptance harness SHA -> immutable image ID
-> retained archive SHA-256 and size -> effective HTTPS origin
-> edge/browser/runtime/restore/replay/rollback receipts
-> minimisation journal hash, restore attempt IDs and receipt history.

The same image ID must appear in every phase. A changed journal intent after a
restore attempt is prepared must be rejected; the gate stays closed and the
control subject remains active. An Actions artifact digest, mutable tag,
loopback origin, rebuilt image or linked dependency result cannot substitute.

Authorization boundary
----------------------
This plan does not authorize remote execution, registry publication, artifact
storage, DNS/TLS/edge changes, deployment, real invitations or paid calls.
Obtain runner, daemon, edge and artifact-custody authority before prepare or
resume. Customer admission remains closed.
EOF
  note "Plan written to $REHEARSAL_DIR/rehearsal-plan.json and RUNBOOK.txt"
  note "No engine, registry or origin was contacted. Customer admission remains closed."
  exit 0
fi

build_env=(ENGINE="$BUILD_ENGINE")
[[ -n "${BUILD_DOCKER_HOST:-}" ]] && build_env+=(DOCKER_HOST="$BUILD_DOCKER_HOST")
verify_env=(ENGINE="$VERIFY_ENGINE")
[[ -n "${VERIFY_DOCKER_HOST:-}" ]] && verify_env+=(DOCKER_HOST="$VERIFY_DOCKER_HOST")
phase_env=(ENGINE="$PHASE_ENGINE")
[[ -n "${PHASE_DOCKER_HOST:-}" ]] && phase_env+=(DOCKER_HOST="$PHASE_DOCKER_HOST")

prepare_phase() {
  [[ -n "$ARTIFACT_CUSTODY_DIR" ]] || fail "ARTIFACT_CUSTODY_DIR is required for prepare"
  [[ ! -e "$ARTIFACT_CUSTODY_DIR" ]] || fail "ARTIFACT_CUSTODY_DIR already exists: $ARTIFACT_CUSTODY_DIR"
  mkdir -p "$REHEARSAL_DIR"
  mkdir -p "$(dirname "$ARTIFACT_CUSTODY_DIR")"
  mkdir "$ARTIFACT_CUSTODY_DIR"
  local image_dir="$ARTIFACT_CUSTODY_DIR/image"
  [[ ! -e "$image_dir" ]] || fail "image output already exists: $image_dir"

  note "Building the exact candidate once into authorized custody"
  env "${build_env[@]}" \
    SOURCE_SHA="$SOURCE_SHA" \
    APP_URL="$APP_URL" \
    HARNESS_SHA="$HARNESS_SHA" \
    OUTPUT_DIR="$image_dir" \
    PLATFORM="$PLATFORM" \
    "$ROOT/deploy/builder/private-staging/build-and-retain.sh"

  local receipt="$image_dir/archive-receipt.json"
  [[ -f "$receipt" ]] || fail "archive receipt is missing: $receipt"
  local image_id archive_path archive_sha archive_bytes origin platform user
  image_id="$(json_file_field "$receipt" imageId)"
  archive_path="$(json_file_field "$receipt" archivePath)"
  archive_sha="$(json_file_field "$receipt" archiveSha256)"
  archive_bytes="$(json_file_field "$receipt" archiveBytes)"
  origin="$(json_file_field "$receipt" origin)"
  platform="$(json_file_field "$receipt" platform)"
  user="$(json_file_field "$receipt" user)"
  [[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "archive receipt did not record an immutable image ID"
  [[ -f "$archive_path" ]] || fail "archive receipt points at a missing archive: $archive_path"
  [[ "$origin" == "$APP_URL" ]] || fail "archive receipt origin mismatch: $origin"
  [[ "$platform" == "$PLATFORM" ]] || fail "archive receipt platform mismatch: $platform"
  [[ "$user" == "$EXPECTED_USER" ]] || fail "archive receipt user mismatch: $user"

  note "Independently loading and verifying the retained archive"
  env "${verify_env[@]}" \
    ARCHIVE_PATH="$archive_path" \
    RECEIPT_PATH="$receipt" \
    EXPECTED_SOURCE_SHA="$SOURCE_SHA" \
    EXPECTED_IMAGE_ID="$image_id" \
    EXPECTED_ORIGIN="$APP_URL" \
    EXPECTED_PLATFORM="$PLATFORM" \
    EXPECTED_USER="$EXPECTED_USER" \
    HARNESS_SHA="$HARNESS_SHA" \
    EVIDENCE_DIR="$ARCHIVE_VERIFY_DIR" \
    "$NODE_BIN" deploy/builder/private-staging/verify-image-archive.mjs

  local verified_image
  verified_image="$(json_file_field "$ARCHIVE_VERIFY_DIR/archive-verification.json" imageId)"
  [[ "$verified_image" == "$image_id" ]] || fail "archive verification image ID mismatch"
  [[ "$(json_file_field "$ARCHIVE_VERIFY_DIR/archive-verification.json" complete)" == "true" ]] \
    || fail "archive verification did not complete"

  cat > "$CHECKPOINT_FILE" <<EOF
{
  "schemaVersion": 1,
  "state": "edge-setup",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$image_id",
  "archivePath": "$archive_path",
  "archiveSha256": "$archive_sha",
  "archiveBytes": $archive_bytes,
  "applicationOrigin": "$APP_URL",
  "effectiveRuntimeOrigin": "$APP_URL",
  "platform": "$platform",
  "user": "$user",
  "custodyDir": "$ARTIFACT_CUSTODY_DIR",
  "imageOutputDir": "$image_dir",
  "archiveReceipt": "$receipt",
  "archiveVerification": "$ARCHIVE_VERIFY_DIR/archive-verification.json",
  "buildDaemonContext": "$BUILD_CONTEXT",
  "verifyDaemonContext": "$VERIFY_CONTEXT",
  "phaseDaemonContext": "$PHASE_CONTEXT",
  "buildInvokedOnce": true,
  "archiveIndependentlyVerified": true,
  "sameImageIdForEveryPhase": true,
  "customerAdmission": "closed"
}
EOF
  note "Checkpoint reached: edge-setup"
  note "Image ID: $image_id"
  note "Archive: $archive_path ($archive_sha)"
  note "No edge, browser, runtime or qualification container was created."
}

resume_phase() {
  local checkpoint_source checkpoint_harness checkpoint_image checkpoint_archive
  local checkpoint_sha checkpoint_origin checkpoint_platform checkpoint_user
  local checkpoint_custody checkpoint_verify_context checkpoint_build_context checkpoint_phase_context
  checkpoint_source="$(json_file_field "$CHECKPOINT_FILE" applicationSourceSha)"
  checkpoint_harness="$(json_file_field "$CHECKPOINT_FILE" harnessSha)"
  checkpoint_image="$(json_file_field "$CHECKPOINT_FILE" imageId)"
  checkpoint_archive="$(json_file_field "$CHECKPOINT_FILE" archivePath)"
  checkpoint_sha="$(json_file_field "$CHECKPOINT_FILE" archiveSha256)"
  checkpoint_origin="$(json_file_field "$CHECKPOINT_FILE" applicationOrigin)"
  checkpoint_platform="$(json_file_field "$CHECKPOINT_FILE" platform)"
  checkpoint_user="$(json_file_field "$CHECKPOINT_FILE" user)"
  checkpoint_custody="$(json_file_field "$CHECKPOINT_FILE" custodyDir)"
  checkpoint_build_context="$(json_file_field "$CHECKPOINT_FILE" buildDaemonContext)"
  checkpoint_verify_context="$(json_file_field "$CHECKPOINT_FILE" verifyDaemonContext)"
  checkpoint_phase_context="$(json_file_field "$CHECKPOINT_FILE" phaseDaemonContext)"
  [[ "$(json_file_field "$CHECKPOINT_FILE" state)" == "edge-setup" ]] \
    || fail "checkpoint is not at edge-setup"
  [[ "$checkpoint_source" == "$SOURCE_SHA" ]] || fail "checkpoint source SHA mismatch"
  [[ "$checkpoint_harness" == "$HARNESS_SHA" ]] || fail "checkpoint harness SHA mismatch"
  [[ "$checkpoint_origin" == "$APP_URL" ]] || fail "checkpoint origin mismatch"
  [[ "$checkpoint_platform" == "$PLATFORM" ]] || fail "checkpoint platform mismatch"
  [[ "$checkpoint_user" == "$EXPECTED_USER" ]] || fail "checkpoint user mismatch"
  [[ "$checkpoint_build_context" == "$BUILD_CONTEXT" ]] || fail "checkpoint build context mismatch"
  [[ "$checkpoint_verify_context" == "$VERIFY_CONTEXT" ]] || fail "checkpoint verify context mismatch"
  [[ "$checkpoint_phase_context" == "$PHASE_CONTEXT" ]] || fail "checkpoint phase context mismatch"
  if [[ -n "$ARTIFACT_CUSTODY_DIR" && "$ARTIFACT_CUSTODY_DIR" != "$checkpoint_custody" ]]; then
    fail "checkpoint custody mismatch: $ARTIFACT_CUSTODY_DIR != $checkpoint_custody"
  fi
  ARTIFACT_CUSTODY_DIR="$checkpoint_custody"
  [[ -d "$ARTIFACT_CUSTODY_DIR" ]] || fail "custody directory is missing: $ARTIFACT_CUSTODY_DIR"
  [[ -f "$checkpoint_archive" ]] || fail "retained archive is missing: $checkpoint_archive"
  [[ "$(sha256sum "$checkpoint_archive" | awk '{print $1}')" == "$checkpoint_sha" ]] \
    || fail "retained archive SHA-256 no longer matches the checkpoint"
  [[ "$(json_file_field "$ARCHIVE_VERIFY_DIR/archive-verification.json" complete)" == "true" ]] \
    || fail "independent archive verification evidence is missing or incomplete"
  [[ "$(json_file_field "$ARCHIVE_VERIFY_DIR/archive-verification.json" imageId)" == "$checkpoint_image" ]] \
    || fail "archive verification image ID no longer matches the checkpoint"

  [[ -n "${STAGING_BASIC_AUTH_USER:-}" && -n "${STAGING_BASIC_AUTH_PASSWORD:-}" ]] \
    || fail "STAGING_BASIC_AUTH_USER/PASSWORD are required for resume"
  [[ -n "${EDGE_APP_CONTAINER:-}" && -n "${EDGE_PROXY_CONTAINER:-}" ]] \
    || fail "EDGE_APP_CONTAINER/EDGE_PROXY_CONTAINER are required for resume"
  [[ -n "${BUILDER_OPERATOR_VOLUME:-}" && -n "${BUILDER_RUNTIME_STORE_HOST_ID:-}" ]] \
    || fail "BUILDER_OPERATOR_VOLUME/BUILDER_RUNTIME_STORE_HOST_ID are required for resume"

  note "Resuming at edge-setup with the same image ID $checkpoint_image"
  env "${phase_env[@]}" \
    QUALIFICATION_PATH=https-edge \
    IMAGE_REFERENCE="$checkpoint_image" \
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
    "$QUALIFICATION_RUNNER"

  note "Verify the immutable identity chain across the retained receipts"
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [dir, imageId, sourceSha, harnessSha, origin] = process.argv.slice(1);
    const archive = JSON.parse(fs.readFileSync(path.join(dir, "archive-verification", "archive-verification.json"), "utf8"));
    const checkpoint = JSON.parse(fs.readFileSync(path.join(dir, "rehearsal-checkpoint.json"), "utf8"));
    const qualification = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "existing-image-qualification.json"), "utf8"));
    const edge = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "edge", "edge-results.json"), "utf8"));
    const browser = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "browser", "results.json"), "utf8"));
    const runtime = JSON.parse(fs.readFileSync(path.join(dir, "qualification", "runtime-edge", "identity.json"), "utf8"));
    const rollback = fs.readFileSync(path.join(dir, "qualification", "rollback", "results.txt"), "utf8");
    const match = (value, expected, label) => {
      if (value !== expected) throw new Error(`${label} mismatch: ${value} !== ${expected}`);
    };
    match(checkpoint.state, "edge-setup", "checkpoint state");
    match(checkpoint.imageId, imageId, "checkpoint image ID");
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
      "same_id_changed_intent_replay_blocked=true",
      "changed_intent_gate_preserved=true",
      "control_subject_access=true",
    ]) {
      if (!rollback.split(/\r?\n/).includes(expected)) throw new Error(`rollback missing ${expected}`);
    }
  ' "$REHEARSAL_DIR" "$checkpoint_image" "$SOURCE_SHA" "$HARNESS_SHA" "$APP_URL"

  cat > "$REHEARSAL_DIR/rehearsal-identities.json" <<EOF
{
  "schemaVersion": 1,
  "status": "complete",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$checkpoint_image",
  "archivePath": "$checkpoint_archive",
  "archiveSha256": "$checkpoint_sha",
  "applicationOrigin": "$APP_URL",
  "effectiveRuntimeOrigin": "$APP_URL",
  "custodyDir": "$ARTIFACT_CUSTODY_DIR",
  "buildDaemonContext": "$BUILD_CONTEXT",
  "verifyDaemonContext": "$VERIFY_CONTEXT",
  "phaseDaemonContext": "$PHASE_CONTEXT",
  "checkpointStop": "edge-setup",
  "checkpointResumed": true,
  "sameImageIdForEveryPhase": true,
  "buildInvokedOnce": true,
  "archiveIndependentlyVerified": true,
  "sameIdChangedIntentReplayBlocked": true,
  "controlSubjectAccess": true,
  "customerAdmission": "closed"
}
EOF
  cat > "$REHEARSAL_DIR/REHEARSAL_COMPLETE.txt" <<EOF
Exact-candidate rehearsal complete.
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_id=$checkpoint_image
application_origin=$APP_URL
effective_runtime_origin=$APP_URL
checkpoint_stop=edge-setup
checkpoint_resumed=true
same_id_changed_intent_replay_blocked=true
control_subject_access=true
customer_admission=closed
EOF
  note "Exact-candidate rehearsal complete; customer admission remains closed."
}

case "$REHEARSAL_MODE" in
  prepare)
    prepare_phase
    ;;
  resume)
    resume_phase
    ;;
  all)
    prepare_phase
    resume_phase
    ;;
esac
