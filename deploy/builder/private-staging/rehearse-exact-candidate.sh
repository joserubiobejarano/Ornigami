#!/usr/bin/env bash
# Prepare, checkpoint or resume one exact-candidate rehearsal.
#
# Actions:
#   ACTION=plan        validate inputs and write a plan; no engine/origin contact
#   ACTION=checkpoint  build once, verify the archive on a separate daemon,
#                      verify/transfer to the phase daemon, then stop and emit
#                      concrete edge-setup instructions
#   ACTION=qualify     resume from the checkpoint after authorized edge setup;
#                      verify archive/receipt/edge identity, then qualify the
#                      same immutable image ID
#
# Canonical interface: ACTION=plan|checkpoint|qualify. The default is plan.
# Obsolete REHEARSAL_MODE/PLAN_ONLY/EXECUTE/RESUME inputs are rejected rather
# than silently mapped to a different action.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

REHEARSAL_DIR="${REHEARSAL_DIR:?REHEARSAL_DIR is required}"
BUILD_ENGINE_INPUT="${BUILD_ENGINE:-}"
BUILD_ENGINE_BIN_INPUT="${BUILD_ENGINE_BIN:-}"
VERIFY_ENGINE_INPUT="${VERIFY_ENGINE:-}"
VERIFY_ENGINE_BIN_INPUT="${VERIFY_ENGINE_BIN:-}"
PHASE_ENGINE_INPUT="${PHASE_ENGINE:-}"
PHASE_ENGINE_BIN_INPUT="${PHASE_ENGINE_BIN:-}"
ACTION="${ACTION:-plan}"
for obsolete in REHEARSAL_MODE PLAN_ONLY EXECUTE RESUME; do
  if [[ -n "${!obsolete:-}" ]]; then
    echo "FAIL: $obsolete is obsolete; use ACTION=plan|checkpoint|qualify." >&2
    exit 1
  fi
done
case "$ACTION" in
  plan|checkpoint|qualify) ;;
  *)
    echo "FAIL: ACTION must be plan, checkpoint or qualify: $ACTION" >&2
    exit 1
    ;;
esac

CHECKPOINT_FILE="$REHEARSAL_DIR/checkpoint.json"
ARCHIVE_VERIFY_DIR="$REHEARSAL_DIR/archive-verification"
PHASE_VERIFY_DIR="$REHEARSAL_DIR/phase-archive-verification"
IMAGE_OUTPUT_DIR="$REHEARSAL_DIR/image"
PLAN_FILE="$REHEARSAL_DIR/rehearsal-plan.json"
RUNBOOK_FILE="$REHEARSAL_DIR/RUNBOOK.txt"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

NODE_BIN="${NODE_BIN:-node}"
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required"

field() {
  local file="$1" key="$2"
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const key = process.argv[2];
    let current = value;
    for (const part of key.split(".")) {
      current = current?.[part];
    }
    process.stdout.write(current === undefined || current === null ? "" : String(current));
  ' "$file" "$key"
}

if [[ "$ACTION" == "qualify" ]]; then
  [[ -d "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR does not exist: $REHEARSAL_DIR"
  [[ -f "$CHECKPOINT_FILE" ]] || fail "checkpoint is missing: $CHECKPOINT_FILE"
  [[ ! -e "$REHEARSAL_DIR/REHEARSAL_COMPLETE.txt" ]] || fail "rehearsal is already complete"
  SOURCE_SHA="${SOURCE_SHA:-$(field "$CHECKPOINT_FILE" applicationSourceSha)}"
  APP_URL="${APP_URL:-$(field "$CHECKPOINT_FILE" applicationOrigin)}"
  HARNESS_SHA="${HARNESS_SHA:-$(field "$CHECKPOINT_FILE" harnessSha)}"
  PLATFORM="${PLATFORM:-$(field "$CHECKPOINT_FILE" platform)}"
  EXPECTED_USER="${EXPECTED_USER:-$(field "$CHECKPOINT_FILE" user)}"
  if [[ -n "$BUILD_ENGINE_INPUT" || -n "$BUILD_ENGINE_BIN_INPUT" ]]; then
    BUILD_ENGINE="${BUILD_ENGINE_INPUT:-$(field "$CHECKPOINT_FILE" build.engine)}"
    BUILD_ENGINE_BIN="$BUILD_ENGINE_BIN_INPUT"
  else
    BUILD_ENGINE="$(field "$CHECKPOINT_FILE" build.engine)"
    BUILD_ENGINE_BIN="$(field "$CHECKPOINT_FILE" build.engineBin)"
  fi
  if [[ -n "$VERIFY_ENGINE_INPUT" || -n "$VERIFY_ENGINE_BIN_INPUT" ]]; then
    VERIFY_ENGINE="${VERIFY_ENGINE_INPUT:-$(field "$CHECKPOINT_FILE" verification.engine)}"
    VERIFY_ENGINE_BIN="$VERIFY_ENGINE_BIN_INPUT"
  else
    VERIFY_ENGINE="$(field "$CHECKPOINT_FILE" verification.engine)"
    VERIFY_ENGINE_BIN="$(field "$CHECKPOINT_FILE" verification.engineBin)"
  fi
  if [[ -n "$PHASE_ENGINE_INPUT" || -n "$PHASE_ENGINE_BIN_INPUT" ]]; then
    PHASE_ENGINE="${PHASE_ENGINE_INPUT:-$(field "$CHECKPOINT_FILE" phase.engine)}"
    PHASE_ENGINE_BIN="$PHASE_ENGINE_BIN_INPUT"
  else
    PHASE_ENGINE="$(field "$CHECKPOINT_FILE" phase.engine)"
    PHASE_ENGINE_BIN="$(field "$CHECKPOINT_FILE" phase.engineBin)"
  fi
  BUILD_CONTEXT="${BUILD_CONTEXT:-$(field "$CHECKPOINT_FILE" build.context)}"
  BUILD_ENDPOINT="${BUILD_ENDPOINT:-$(field "$CHECKPOINT_FILE" build.endpoint)}"
  VERIFY_CONTEXT="${VERIFY_CONTEXT:-$(field "$CHECKPOINT_FILE" verification.context)}"
  VERIFY_ENDPOINT="${VERIFY_ENDPOINT:-$(field "$CHECKPOINT_FILE" verification.endpoint)}"
  PHASE_CONTEXT="${PHASE_CONTEXT:-$(field "$CHECKPOINT_FILE" phase.context)}"
  PHASE_ENDPOINT="${PHASE_ENDPOINT:-$(field "$CHECKPOINT_FILE" phase.endpoint)}"
else
  SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
  APP_URL="${APP_URL:?APP_URL must be the exact HTTPS application origin}"
  HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
  PLATFORM="${PLATFORM:-linux/amd64}"
  EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
  BUILD_ENGINE="${BUILD_ENGINE:-docker}"
  BUILD_CONTEXT="${BUILD_CONTEXT:-default}"
  VERIFY_ENGINE="${VERIFY_ENGINE:-docker}"
  VERIFY_CONTEXT="${VERIFY_CONTEXT:-default}"
  PHASE_ENGINE="${PHASE_ENGINE:-$VERIFY_ENGINE}"
  PHASE_CONTEXT="${PHASE_CONTEXT:-$VERIFY_CONTEXT}"
fi
: "${BUILD_CONTEXT:=default}"
: "${VERIFY_CONTEXT:=default}"
: "${PHASE_CONTEXT:=$VERIFY_CONTEXT}"
BUILD_ENDPOINT="${BUILD_ENDPOINT:-${BUILD_DOCKER_HOST:-${BUILD_CONTAINER_HOST:-}}}"
VERIFY_ENDPOINT="${VERIFY_ENDPOINT:-${VERIFY_DOCKER_HOST:-${VERIFY_CONTAINER_HOST:-}}}"
PHASE_ENDPOINT="${PHASE_ENDPOINT:-${PHASE_DOCKER_HOST:-${PHASE_CONTAINER_HOST:-}}}"

[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA must be 40 hex"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$APP_URL" == https://* ]] || fail "APP_URL must use https"
[[ "$(git rev-parse HEAD)" == "$HARNESS_SHA" ]] || fail "current HEAD does not equal HARNESS_SHA"
if [[ "$ACTION" != "qualify" ]]; then
  [[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail "HEAD does not equal SOURCE_SHA"
  [[ -z "$(git status --porcelain)" || "${ALLOW_DIRTY:-0}" == "1" ]] \
    || fail "worktree must be clean (or set ALLOW_DIRTY=1 for a deliberate non-final smoke)"
fi
"$NODE_BIN" -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$APP_URL" || fail "APP_URL must be an exact origin"

normalize_engine() {
  local prefix="$1" value="$2"
  local kind_var="${prefix}_ENGINE_KIND"
  local bin_var="${prefix}_ENGINE_BIN"
  local kind_override="${!kind_var:-}"
  local bin_override="${!bin_var:-}"
  local kind bin
  if [[ "$value" == "docker" || "$value" == "podman" ]]; then
    kind="$value"
    bin="${bin_override:-$value}"
  else
    kind="${kind_override:-$(basename "$value")}"
    bin="${bin_override:-$value}"
  fi
  [[ "$kind" == "docker" || "$kind" == "podman" ]] \
    || fail "$prefix engine must be docker or podman (or set ${kind_var}); got $value"
  printf '%s|%s' "$kind" "$bin"
}

resolve_endpoint() {
  local prefix="$1" engine="$2"
  local generic_var="${prefix}_ENDPOINT"
  local docker_var="${prefix}_DOCKER_HOST"
  local container_var="${prefix}_CONTAINER_HOST"
  local generic="${!generic_var:-}"
  local docker_host="${!docker_var:-}"
  local container_host="${!container_var:-}"
  local chosen=""
  if [[ "$engine" == "docker" ]]; then
    [[ -z "$container_host" ]] || fail "$prefix uses Docker and must not set ${container_var}"
    chosen="${generic:-$docker_host}"
    if [[ -n "$generic" && -n "$docker_host" && "$generic" != "$docker_host" ]]; then
      fail "$prefix endpoint inputs conflict: ${generic_var} and ${docker_var}"
    fi
  elif [[ "$engine" == "podman" ]]; then
    [[ -z "$docker_host" ]] || fail "$prefix uses Podman and must not set ${docker_var}"
    chosen="${generic:-$container_host}"
    if [[ -n "$generic" && -n "$container_host" && "$generic" != "$container_host" ]]; then
      fail "$prefix endpoint inputs conflict: ${generic_var} and ${container_var}"
    fi
  else
    fail "$prefix engine must be docker or podman: $engine"
  fi
  printf '%s' "$chosen"
}

route_engine() {
  local engine="$1" context="$2" endpoint="$3" prefix="$4" engine_bin="$5"
  ROUTED_ENV=(ENGINE="$engine_bin")
  if [[ -n "$endpoint" ]]; then
    if [[ -n "$context" && "$context" != "default" ]]; then
      fail "$prefix must select one daemon: set either ${prefix}_CONTEXT or ${prefix}_ENDPOINT, not both"
    fi
    if [[ "$engine" == "docker" ]]; then
      ROUTED_ENV+=(DOCKER_HOST="$endpoint")
    else
      ROUTED_ENV+=(CONTAINER_HOST="$endpoint")
    fi
  elif [[ "$context" != "default" ]]; then
    if [[ "$engine" == "podman" ]]; then
      fail "$prefix Podman context routing is unsupported; use ${prefix}_ENDPOINT/CONTAINER_HOST"
    fi
    ROUTED_ENV+=(DOCKER_CONTEXT="$context")
  fi
}

BUILD_ENGINE_NORMALIZED="$(normalize_engine BUILD "$BUILD_ENGINE")"
BUILD_ENGINE_KIND="${BUILD_ENGINE_NORMALIZED%%|*}"
BUILD_ENGINE_BIN="${BUILD_ENGINE_NORMALIZED#*|}"
VERIFY_ENGINE_NORMALIZED="$(normalize_engine VERIFY "$VERIFY_ENGINE")"
VERIFY_ENGINE_KIND="${VERIFY_ENGINE_NORMALIZED%%|*}"
VERIFY_ENGINE_BIN="${VERIFY_ENGINE_NORMALIZED#*|}"
PHASE_ENGINE_NORMALIZED="$(normalize_engine PHASE "$PHASE_ENGINE")"
PHASE_ENGINE_KIND="${PHASE_ENGINE_NORMALIZED%%|*}"
PHASE_ENGINE_BIN="${PHASE_ENGINE_NORMALIZED#*|}"

BUILD_ENDPOINT="$(resolve_endpoint BUILD "$BUILD_ENGINE_KIND")"
VERIFY_ENDPOINT="$(resolve_endpoint VERIFY "$VERIFY_ENGINE_KIND")"
PHASE_ENDPOINT="$(resolve_endpoint PHASE "$PHASE_ENGINE_KIND")"
route_engine "$BUILD_ENGINE_KIND" "$BUILD_CONTEXT" "$BUILD_ENDPOINT" BUILD "$BUILD_ENGINE_BIN"
build_env=("${ROUTED_ENV[@]}")
route_engine "$VERIFY_ENGINE_KIND" "$VERIFY_CONTEXT" "$VERIFY_ENDPOINT" VERIFY "$VERIFY_ENGINE_BIN"
verify_env=("${ROUTED_ENV[@]}")
route_engine "$PHASE_ENGINE_KIND" "$PHASE_CONTEXT" "$PHASE_ENDPOINT" PHASE "$PHASE_ENGINE_BIN"
phase_env=("${ROUTED_ENV[@]}")

daemon_identity() {
  local engine_kind="$1" engine_bin="$2" prefix="$3"; shift 3
  local format id
  if [[ "$engine_kind" == "docker" ]]; then
    format='{{.ID}}'
  else
    format='{{.Host.Hostname}}|{{.Store.GraphRoot}}'
  fi
  id="$(env "$@" "$engine_bin" info --format "$format" 2>/dev/null)" \
    || fail "$prefix daemon identity query failed for $engine_bin"
  [[ -n "$id" ]] || fail "$prefix daemon identity is empty for $engine_bin"
  printf '%s:%s' "$engine_kind" "$id"
}

if [[ "$ACTION" == "plan" ]]; then
  [[ ! -e "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR already exists: $REHEARSAL_DIR"
else
  if [[ "$ACTION" == "checkpoint" ]]; then
    [[ ! -e "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR already exists: $REHEARSAL_DIR"
  fi
fi

if [[ "$ACTION" == "plan" ]]; then
  mkdir -p "$REHEARSAL_DIR"
  cat > "$PLAN_FILE" <<EOF
{
  "schemaVersion": 2,
  "status": "planned",
  "action": "plan",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$APP_URL",
  "platform": "$PLATFORM",
  "user": "$EXPECTED_USER",
  "buildOnce": true,
  "archiveRetained": true,
  "independentArchiveVerification": true,
  "sameImageIdForEveryPhase": true,
  "build": {"engine": "$BUILD_ENGINE_KIND", "engineBin": "$BUILD_ENGINE_BIN", "context": "$BUILD_CONTEXT", "endpoint": "$BUILD_ENDPOINT", "daemonIdentity": "pending", "outputDir": "$IMAGE_OUTPUT_DIR"},
  "verification": {"engine": "$VERIFY_ENGINE_KIND", "engineBin": "$VERIFY_ENGINE_BIN", "context": "$VERIFY_CONTEXT", "endpoint": "$VERIFY_ENDPOINT", "daemonIdentity": "pending", "evidenceDir": "$ARCHIVE_VERIFY_DIR"},
  "phase": {"engine": "$PHASE_ENGINE_KIND", "engineBin": "$PHASE_ENGINE_BIN", "context": "$PHASE_CONTEXT", "endpoint": "$PHASE_ENDPOINT", "daemonIdentity": "pending", "evidenceDir": "$REHEARSAL_DIR/qualification-attempt-1"},
  "checkpoint": {"required": true, "file": "$CHECKPOINT_FILE", "edgeSetupBeforeQualification": true},
  "externalGates": [
    "authorized Linux builder host and container engine",
    "authorized isolated archive-verification daemon",
    "authorized phase/edge daemon and private HTTPS edge",
    "authorized archive custody/storage and separate execution"
  ],
  "customerAdmission": "closed"
}
EOF
  cat > "$RUNBOOK_FILE" <<EOF
Exact-candidate rehearsal plan
==============================

Application source SHA: $SOURCE_SHA
Acceptance harness SHA: $HARNESS_SHA
Effective HTTPS origin:  $APP_URL
Platform/user:           $PLATFORM / $EXPECTED_USER

Build daemon:   $BUILD_ENGINE context=$BUILD_CONTEXT endpoint=${BUILD_ENDPOINT:-<default>}
Verify daemon:  $VERIFY_ENGINE context=$VERIFY_CONTEXT endpoint=${VERIFY_ENDPOINT:-<default>} (must be observed different)
Phase daemon:   $PHASE_ENGINE context=$PHASE_CONTEXT endpoint=${PHASE_ENDPOINT:-<default>}

Actions
-------
1. Checkpoint (build once, verify archive, prepare edge transition):

   ACTION=checkpoint REHEARSAL_DIR=$REHEARSAL_DIR ... \\
     bash deploy/builder/private-staging/rehearse-exact-candidate.sh

2. Configure the authorized private HTTPS edge with the checked image ID.
   Do not deploy automatically; the checkpoint prints the concrete identity
   and setup inputs.

3. Resume after edge setup:

   ACTION=qualify REHEARSAL_DIR=$REHEARSAL_DIR ... \\
     bash deploy/builder/private-staging/rehearse-exact-candidate.sh

Routing precedence
------------------
Each phase accepts one daemon selector:
- a Docker context via *_CONTEXT (Docker only), or
- an explicit endpoint via *_ENDPOINT, *_DOCKER_HOST (Docker) or
  *_CONTAINER_HOST (Podman).
Do not set both a non-default context and an endpoint. Observed daemon
identities, not selector names or image absence, decide independence.

Authorization boundary
----------------------
No engine, registry or origin is contacted in plan mode. Execution does not
authorize deployment, registry publication, artifact storage, DNS/TLS changes,
real invitations or paid calls. Customer admission remains closed.
EOF
  note "Plan written to $PLAN_FILE and $RUNBOOK_FILE"
  note "No engine, registry or origin was contacted. Customer admission remains closed."
  exit 0
fi

if [[ "$ACTION" == "checkpoint" ]]; then
  BUILD_DAEMON_ID="$(daemon_identity "$BUILD_ENGINE_KIND" "$BUILD_ENGINE_BIN" BUILD "${build_env[@]}")"
  VERIFY_DAEMON_ID="$(daemon_identity "$VERIFY_ENGINE_KIND" "$VERIFY_ENGINE_BIN" VERIFY "${verify_env[@]}")"
  PHASE_DAEMON_ID="$(daemon_identity "$PHASE_ENGINE_KIND" "$PHASE_ENGINE_BIN" PHASE "${phase_env[@]}")"
  [[ "$BUILD_DAEMON_ID" != "$VERIFY_DAEMON_ID" ]] \
    || fail "build and archive-verification selectors resolve to the same daemon: $BUILD_DAEMON_ID"
  if [[ "$PHASE_DAEMON_ID" == "$BUILD_DAEMON_ID" && "$PHASE_DAEMON_ID" != "$VERIFY_DAEMON_ID" ]]; then
    fail "phase daemon is the build daemon but not the verification daemon; use a fresh phase daemon or the verification daemon"
  fi

  mkdir -p "$REHEARSAL_DIR"
  cat > "$PLAN_FILE" <<EOF
{
  "schemaVersion": 2,
  "status": "checkpointing",
  "action": "checkpoint",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$APP_URL",
  "platform": "$PLATFORM",
  "user": "$EXPECTED_USER",
  "build": {"engine": "$BUILD_ENGINE_KIND", "engineBin": "$BUILD_ENGINE_BIN", "context": "$BUILD_CONTEXT", "endpoint": "$BUILD_ENDPOINT", "daemonIdentity": "$BUILD_DAEMON_ID", "outputDir": "$IMAGE_OUTPUT_DIR"},
  "verification": {"engine": "$VERIFY_ENGINE_KIND", "engineBin": "$VERIFY_ENGINE_BIN", "context": "$VERIFY_CONTEXT", "endpoint": "$VERIFY_ENDPOINT", "daemonIdentity": "$VERIFY_DAEMON_ID", "evidenceDir": "$ARCHIVE_VERIFY_DIR"},
  "phase": {"engine": "$PHASE_ENGINE_KIND", "engineBin": "$PHASE_ENGINE_BIN", "context": "$PHASE_CONTEXT", "endpoint": "$PHASE_ENDPOINT", "daemonIdentity": "$PHASE_DAEMON_ID"}
}
EOF

  note "Building the exact candidate once"
  env "${build_env[@]}" \
    SOURCE_SHA="$SOURCE_SHA" APP_URL="$APP_URL" HARNESS_SHA="$HARNESS_SHA" \
    OUTPUT_DIR="$IMAGE_OUTPUT_DIR" PLATFORM="$PLATFORM" ALLOW_DIRTY="${ALLOW_DIRTY:-0}" \
    "$ROOT/deploy/builder/private-staging/build-and-retain.sh"

  IMAGE_ID="$(field "$IMAGE_OUTPUT_DIR/archive-receipt.json" imageId)"
  ARCHIVE_PATH="$(field "$IMAGE_OUTPUT_DIR/archive-receipt.json" archivePath)"
  ARCHIVE_SHA256="$(field "$IMAGE_OUTPUT_DIR/archive-receipt.json" archiveSha256)"
  ARCHIVE_BYTES="$(field "$IMAGE_OUTPUT_DIR/archive-receipt.json" archiveBytes)"
  [[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "archive receipt did not record an immutable image ID"
  [[ -f "$ARCHIVE_PATH" ]] || fail "archive receipt points at a missing archive: $ARCHIVE_PATH"
  [[ "$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')" == "$ARCHIVE_SHA256" ]] || fail "archive hash changed before verification"

  note "Independently loading and verifying the retained archive"
  env "${verify_env[@]}" \
    ARCHIVE_PATH="$ARCHIVE_PATH" RECEIPT_PATH="$IMAGE_OUTPUT_DIR/archive-receipt.json" \
    EXPECTED_SOURCE_SHA="$SOURCE_SHA" EXPECTED_IMAGE_ID="$IMAGE_ID" EXPECTED_ORIGIN="$APP_URL" \
    EXPECTED_PLATFORM="$PLATFORM" EXPECTED_USER="$EXPECTED_USER" HARNESS_SHA="$HARNESS_SHA" \
    EVIDENCE_DIR="$ARCHIVE_VERIFY_DIR" REQUIRE_FRESH_DAEMON=1 \
    "$NODE_BIN" deploy/builder/private-staging/verify-image-archive.mjs
  VERIFY_COMPLETE="$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" complete)"
  VERIFY_INDEPENDENT="$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" independentHandoff)"
  VERIFY_IMAGE_ABSENT="$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" checks.imageAbsentBeforeLoad)"
  VERIFY_LOAD_SUCCEEDED="$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" checks.loadSucceeded)"
  [[ "$VERIFY_COMPLETE" == "true" && "$VERIFY_INDEPENDENT" == "true" ]] \
    || fail "archive verification did not complete independently"
  [[ "$VERIFY_IMAGE_ABSENT" == "true" && "$VERIFY_LOAD_SUCCEEDED" == "true" ]] \
    || fail "archive verification did not prove fresh absence and load"

  PHASE_TRANSFER_REQUIRED=false
  PHASE_TRANSFER_DIR=""
  PHASE_TRANSFER_COMPLETE=false
  if [[ "$PHASE_DAEMON_ID" != "$VERIFY_DAEMON_ID" ]]; then
    PHASE_TRANSFER_REQUIRED=true
    PHASE_TRANSFER_DIR="$PHASE_VERIFY_DIR"
    note "Transferring and verifying the archived image on the phase daemon"
    env "${phase_env[@]}" \
      ARCHIVE_PATH="$ARCHIVE_PATH" RECEIPT_PATH="$IMAGE_OUTPUT_DIR/archive-receipt.json" \
      EXPECTED_SOURCE_SHA="$SOURCE_SHA" EXPECTED_IMAGE_ID="$IMAGE_ID" EXPECTED_ORIGIN="$APP_URL" \
      EXPECTED_PLATFORM="$PLATFORM" EXPECTED_USER="$EXPECTED_USER" HARNESS_SHA="$HARNESS_SHA" \
      EVIDENCE_DIR="$PHASE_TRANSFER_DIR" REQUIRE_FRESH_DAEMON=1 \
      "$NODE_BIN" deploy/builder/private-staging/verify-image-archive.mjs
    PHASE_TRANSFER_COMPLETE="$(field "$PHASE_TRANSFER_DIR/archive-verification.json" complete)"
    [[ "$PHASE_TRANSFER_COMPLETE" == "true" ]] || fail "phase-daemon archive transfer did not verify"
  fi

  cat > "$CHECKPOINT_FILE" <<EOF
{
  "schemaVersion": 2,
  "status": "awaiting-edge-setup",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$IMAGE_ID",
  "imageReference": "$IMAGE_ID",
  "archivePath": "$ARCHIVE_PATH",
  "archiveSha256": "$ARCHIVE_SHA256",
  "archiveBytes": $ARCHIVE_BYTES,
  "applicationOrigin": "$APP_URL",
  "effectiveRuntimeOrigin": "$APP_URL",
  "platform": "$PLATFORM",
  "user": "$EXPECTED_USER",
  "build": {"engine": "$BUILD_ENGINE_KIND", "engineBin": "$BUILD_ENGINE_BIN", "context": "$BUILD_CONTEXT", "endpoint": "$BUILD_ENDPOINT", "daemonIdentity": "$BUILD_DAEMON_ID", "outputDir": "$IMAGE_OUTPUT_DIR"},
  "verification": {"engine": "$VERIFY_ENGINE_KIND", "engineBin": "$VERIFY_ENGINE_BIN", "context": "$VERIFY_CONTEXT", "endpoint": "$VERIFY_ENDPOINT", "daemonIdentity": "$VERIFY_DAEMON_ID", "evidenceDir": "$ARCHIVE_VERIFY_DIR", "complete": $VERIFY_COMPLETE, "independentHandoff": $VERIFY_INDEPENDENT, "freshDaemonRequired": true, "imageAbsentBeforeLoad": $VERIFY_IMAGE_ABSENT, "loadSucceeded": $VERIFY_LOAD_SUCCEEDED},
  "phase": {"engine": "$PHASE_ENGINE_KIND", "engineBin": "$PHASE_ENGINE_BIN", "context": "$PHASE_CONTEXT", "endpoint": "$PHASE_ENDPOINT", "daemonIdentity": "$PHASE_DAEMON_ID", "transferRequired": $PHASE_TRANSFER_REQUIRED, "transferEvidenceDir": "$PHASE_TRANSFER_DIR", "transferComplete": $PHASE_TRANSFER_COMPLETE},
  "edgeSetupRequired": true,
  "qualificationStarted": false,
  "customerAdmission": "closed"
}
EOF
  cat > "$REHEARSAL_DIR/CHECKPOINT_READY.txt" <<EOF
Checkpoint ready: verified immutable image identity
===================================================

application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_id=$IMAGE_ID
application_origin=$APP_URL
effective_runtime_origin=$APP_URL
archive_sha256=$ARCHIVE_SHA256
archive_bytes=$ARCHIVE_BYTES
build_daemon=$BUILD_DAEMON_ID
verify_daemon=$VERIFY_DAEMON_ID
phase_daemon=$PHASE_DAEMON_ID
phase_transfer=$PHASE_TRANSFER_REQUIRED

The archive was loaded and verified on a fresh daemon and is not running there.
Configure the authorized private HTTPS edge with exactly this image ID:

  BUILDER_IMAGE=$IMAGE_ID
  STAGING_ORIGIN=$APP_URL
  (plus the approved Caddy/BasicAuth/volume inputs)

Then resume; this does not deploy anything automatically:

  ACTION=qualify REHEARSAL_DIR=$REHEARSAL_DIR \\
  EDGE_APP_CONTAINER=<running-edge-app> \\
  EDGE_PROXY_CONTAINER=<running-caddy> \\
  EDGE_STORE_VOLUME=<edge-store-volume> \\
  BUILDER_OPERATOR_VOLUME=<edge-store-volume> \\
  BUILDER_RUNTIME_STORE_HOST_ID=<edge-store-host-id> \\
  STAGING_BASIC_AUTH_USER=<private-user> \\
  STAGING_BASIC_AUTH_PASSWORD=<private-password> \\
    bash deploy/builder/private-staging/rehearse-exact-candidate.sh

Customer admission remains closed. This checkpoint grants no deployment,
registry publication, DNS/TLS change or customer authority.
EOF
  note "Checkpoint written to $CHECKPOINT_FILE"
  note "Edge setup is required before qualification; customer admission remains closed."
  exit 0
fi

# ------------------------------- resume -----------------------------------
checkpoint_field() { field "$CHECKPOINT_FILE" "$1"; }
for pair in \
  "applicationSourceSha|$SOURCE_SHA" \
  "harnessSha|$HARNESS_SHA" \
  "applicationOrigin|$APP_URL" \
  "platform|$PLATFORM" \
  "user|$EXPECTED_USER" \
  "build.engine|$BUILD_ENGINE_KIND" \
  "build.engineBin|$BUILD_ENGINE_BIN" \
  "build.context|$BUILD_CONTEXT" \
  "build.endpoint|$BUILD_ENDPOINT" \
  "verification.engine|$VERIFY_ENGINE_KIND" \
  "verification.engineBin|$VERIFY_ENGINE_BIN" \
  "verification.context|$VERIFY_CONTEXT" \
  "verification.endpoint|$VERIFY_ENDPOINT" \
  "phase.engine|$PHASE_ENGINE_KIND" \
  "phase.engineBin|$PHASE_ENGINE_BIN" \
  "phase.context|$PHASE_CONTEXT" \
  "phase.endpoint|$PHASE_ENDPOINT"; do
  key="${pair%%|*}"
  expected="${pair#*|}"
  actual="$(checkpoint_field "$key")"
  [[ "$actual" == "$expected" ]] || fail "resume input changed: $key checkpoint=[$actual] supplied=[$expected]"
done

CHECKPOINT_IMAGE_ID="$(checkpoint_field imageId)"
CHECKPOINT_ARCHIVE_PATH="$(checkpoint_field archivePath)"
CHECKPOINT_ARCHIVE_SHA="$(checkpoint_field archiveSha256)"
CHECKPOINT_ARCHIVE_BYTES="$(checkpoint_field archiveBytes)"
CHECKPOINT_VERIFY_DAEMON="$(checkpoint_field verification.daemonIdentity)"
CHECKPOINT_PHASE_DAEMON="$(checkpoint_field phase.daemonIdentity)"
CHECKPOINT_TRANSFER_REQUIRED="$(checkpoint_field phase.transferRequired)"
[[ -f "$ARCHIVE_VERIFY_DIR/archive-verification.json" ]] \
  || fail "archive verification evidence is missing"
[[ "$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" complete)" == "true" ]] \
  || fail "archive verification evidence is not complete"
[[ "$(field "$ARCHIVE_VERIFY_DIR/archive-verification.json" independentHandoff)" == "true" ]] \
  || fail "archive verification evidence is not independent"
[[ "$CHECKPOINT_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "checkpoint image ID is invalid"
[[ -f "$CHECKPOINT_ARCHIVE_PATH" ]] || fail "checkpoint archive is missing: $CHECKPOINT_ARCHIVE_PATH"
[[ "$(sha256sum "$CHECKPOINT_ARCHIVE_PATH" | awk '{print $1}')" == "$CHECKPOINT_ARCHIVE_SHA" ]] \
  || fail "checkpoint archive hash changed"
[[ "$(stat -c '%s' "$CHECKPOINT_ARCHIVE_PATH")" == "$CHECKPOINT_ARCHIVE_BYTES" ]] \
  || fail "checkpoint archive size changed"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const [checkpointPath, receiptPath] = process.argv.slice(1);
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const pairs = [
    ["source", checkpoint.applicationSourceSha, receipt.applicationSourceSha ?? receipt.sourceSha],
    ["harness", checkpoint.harnessSha, receipt.harnessSha],
    ["image", checkpoint.imageId, receipt.imageId ?? receipt.localImageId],
    ["origin", checkpoint.applicationOrigin, receipt.origin],
    ["platform", checkpoint.platform, receipt.platform],
    ["user", checkpoint.user, receipt.user],
    ["archive hash", checkpoint.archiveSha256, receipt.archiveSha256],
    ["archive bytes", String(checkpoint.archiveBytes), String(receipt.archiveBytes)],
  ];
  for (const [name, left, right] of pairs) {
    if (left !== right) throw new Error(`${name} changed: checkpoint=${left} receipt=${right}`);
  }
' "$CHECKPOINT_FILE" "$IMAGE_OUTPUT_DIR/archive-receipt.json" \
  || fail "checkpoint and archive receipt no longer agree"
[[ "$(checkpoint_field verification.complete)" == "true" ]] \
  || fail "checkpoint archive verification is not complete"
[[ "$(checkpoint_field verification.independentHandoff)" == "true" ]] \
  || fail "checkpoint archive verification is not independent"
[[ "$(checkpoint_field verification.imageAbsentBeforeLoad)" == "true" ]] \
  || fail "checkpoint did not prove fresh image absence"
[[ "$(checkpoint_field verification.loadSucceeded)" == "true" ]] \
  || fail "checkpoint did not prove archive load"
if [[ "$(checkpoint_field phase.transferRequired)" == "true" ]]; then
  [[ "$(checkpoint_field phase.transferComplete)" == "true" ]] \
    || fail "checkpoint phase transfer is not complete"
fi

BUILD_DAEMON_ID="$(daemon_identity "$BUILD_ENGINE_KIND" "$BUILD_ENGINE_BIN" BUILD "${build_env[@]}")"
VERIFY_DAEMON_ID="$(daemon_identity "$VERIFY_ENGINE_KIND" "$VERIFY_ENGINE_BIN" VERIFY "${verify_env[@]}")"
PHASE_DAEMON_ID="$(daemon_identity "$PHASE_ENGINE_KIND" "$PHASE_ENGINE_BIN" PHASE "${phase_env[@]}")"
[[ "$BUILD_DAEMON_ID" != "$VERIFY_DAEMON_ID" ]] \
  || fail "resume build and verification selectors resolve to the same daemon"
[[ "$BUILD_DAEMON_ID" == "$(checkpoint_field build.daemonIdentity)" ]] || fail "build daemon identity changed"
[[ "$VERIFY_DAEMON_ID" == "$CHECKPOINT_VERIFY_DAEMON" ]] || fail "verification daemon identity changed"
[[ "$PHASE_DAEMON_ID" == "$CHECKPOINT_PHASE_DAEMON" ]] || fail "phase daemon identity changed"
if [[ "$CHECKPOINT_TRANSFER_REQUIRED" == "true" ]]; then
  [[ -f "$PHASE_VERIFY_DIR/archive-verification.json" ]] \
    || fail "phase-daemon transfer evidence is missing"
  [[ "$(field "$PHASE_VERIFY_DIR/archive-verification.json" complete)" == "true" ]] \
    || fail "phase-daemon transfer evidence is not complete"
  [[ "$(field "$PHASE_VERIFY_DIR/archive-verification.json" independentHandoff)" == "true" ]] \
    || fail "phase-daemon transfer evidence is not independent"
fi

PHASE_IMAGE_ID="$(env "${phase_env[@]}" "$PHASE_ENGINE" image inspect --format '{{.Id}}' "$CHECKPOINT_IMAGE_ID" 2>/dev/null)" \
  || fail "checkpoint image ID is absent on the phase daemon"
[[ "$PHASE_IMAGE_ID" == "$CHECKPOINT_IMAGE_ID" ]] || fail "phase daemon image ID changed"
PHASE_SOURCE="$(env "${phase_env[@]}" "$PHASE_ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$CHECKPOINT_IMAGE_ID")"
PHASE_ORIGIN="$(env "${phase_env[@]}" "$PHASE_ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$CHECKPOINT_IMAGE_ID")"
[[ "$PHASE_SOURCE" == "$SOURCE_SHA" ]] || fail "phase daemon source label changed"
[[ "$PHASE_ORIGIN" == "$APP_URL" ]] || fail "phase daemon origin label changed"

EDGE_APP_CONTAINER="${EDGE_APP_CONTAINER:?EDGE_APP_CONTAINER is required for qualification}"
EDGE_PROXY_CONTAINER="${EDGE_PROXY_CONTAINER:?EDGE_PROXY_CONTAINER is required for qualification}"
EDGE_STORE_VOLUME="${EDGE_STORE_VOLUME:-${BUILDER_OPERATOR_VOLUME:-}}"
[[ -n "$EDGE_STORE_VOLUME" ]] || fail "EDGE_STORE_VOLUME or BUILDER_OPERATOR_VOLUME is required"
BUILDER_OPERATOR_VOLUME="${BUILDER_OPERATOR_VOLUME:?BUILDER_OPERATOR_VOLUME is required}"
BUILDER_RUNTIME_STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:?BUILDER_RUNTIME_STORE_HOST_ID is required}"
STAGING_BASIC_AUTH_USER="${STAGING_BASIC_AUTH_USER:?STAGING_BASIC_AUTH_USER is required}"
STAGING_BASIC_AUTH_PASSWORD="${STAGING_BASIC_AUTH_PASSWORD:?STAGING_BASIC_AUTH_PASSWORD is required}"
checkpoint_edge="$(checkpoint_field edgeAppContainer)"
if [[ -n "$checkpoint_edge" && "$checkpoint_edge" != "$EDGE_APP_CONTAINER" ]]; then
  fail "edge app container changed: checkpoint=[$checkpoint_edge] supplied=[$EDGE_APP_CONTAINER]"
fi

EDGE_IMAGE_ID="$(env "${phase_env[@]}" "$PHASE_ENGINE" inspect --format '{{.Image}}' "$EDGE_APP_CONTAINER" 2>/dev/null)" \
  || fail "edge app container is missing: $EDGE_APP_CONTAINER"
[[ "$EDGE_IMAGE_ID" == "$CHECKPOINT_IMAGE_ID" ]] || fail "edge app container image mismatch"
EDGE_RUNNING="$(env "${phase_env[@]}" "$PHASE_ENGINE" inspect --format '{{.State.Running}}' "$EDGE_APP_CONTAINER")"
[[ "$EDGE_RUNNING" == "true" ]] || fail "edge app container is not running"
EDGE_SOURCE="$(env "${phase_env[@]}" "$PHASE_ENGINE" inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$EDGE_APP_CONTAINER")"
EDGE_ORIGIN="$(env "${phase_env[@]}" "$PHASE_ENGINE" inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$EDGE_APP_CONTAINER")"
[[ "$EDGE_SOURCE" == "$SOURCE_SHA" ]] || fail "edge app source label mismatch"
[[ "$EDGE_ORIGIN" == "$APP_URL" ]] || fail "edge app origin label mismatch"
PROXY_RUNNING="$(env "${phase_env[@]}" "$PHASE_ENGINE" inspect --format '{{.State.Running}}' "$EDGE_PROXY_CONTAINER" 2>/dev/null)" \
  || fail "edge proxy container is missing"
[[ "$PROXY_RUNNING" == "true" ]] || fail "edge proxy container is not running"
env "${phase_env[@]}" "$PHASE_ENGINE" volume inspect "$EDGE_STORE_VOLUME" >/dev/null 2>&1 \
  || fail "edge store volume is missing"

ATTEMPT=1
while [[ -e "$REHEARSAL_DIR/qualification-attempt-$ATTEMPT" ]]; do ATTEMPT=$((ATTEMPT + 1)); done
QUALIFICATION_DIR="$REHEARSAL_DIR/qualification-attempt-$ATTEMPT"
ATTEMPT_RECORD="$REHEARSAL_DIR/resume-attempt-$ATTEMPT.json"
QUALIFICATION_SCRIPT="$ROOT/deploy/builder/private-staging/qualify-existing-image.sh"
if [[ "${REHEARSAL_TEST_MODE:-0}" == "1" && -n "${REHEARSAL_QUALIFICATION_SCRIPT:-}" ]]; then
  QUALIFICATION_SCRIPT="$REHEARSAL_QUALIFICATION_SCRIPT"
elif [[ -n "${REHEARSAL_QUALIFICATION_SCRIPT:-}" ]]; then
  fail "REHEARSAL_QUALIFICATION_SCRIPT is only honored with REHEARSAL_TEST_MODE=1"
fi

cat > "$ATTEMPT_RECORD" <<EOF
{
  "schemaVersion": 1,
  "status": "running",
  "attempt": $ATTEMPT,
  "qualificationDir": "$QUALIFICATION_DIR",
  "imageId": "$CHECKPOINT_IMAGE_ID",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "applicationOrigin": "$APP_URL",
  "phaseDaemonIdentity": "$PHASE_DAEMON_ID",
  "edgeAppContainer": "$EDGE_APP_CONTAINER",
  "edgeImageId": "$EDGE_IMAGE_ID"
}
EOF

set +e
env "${phase_env[@]}" \
  QUALIFICATION_PATH=https-edge IMAGE_REFERENCE="$CHECKPOINT_IMAGE_ID" \
  EXPECTED_SOURCE_SHA="$SOURCE_SHA" EXPECTED_ORIGIN="$APP_URL" STAGING_ORIGIN="$APP_URL" \
  STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" STAGING_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
  EDGE_APP_CONTAINER="$EDGE_APP_CONTAINER" EDGE_PROXY_CONTAINER="$EDGE_PROXY_CONTAINER" \
  EDGE_STORE_VOLUME="$EDGE_STORE_VOLUME" BUILDER_OPERATOR_VOLUME="$BUILDER_OPERATOR_VOLUME" \
  BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
  EXPECTED_PLATFORM="$PLATFORM" EXPECTED_USER="$EXPECTED_USER" HARNESS_SHA="$HARNESS_SHA" \
  EVIDENCE_DIR="$QUALIFICATION_DIR" \
  "$QUALIFICATION_SCRIPT"
QUALIFICATION_STATUS=$?
set -e
if [[ "$QUALIFICATION_STATUS" -ne 0 ]]; then
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const file = process.argv[1];
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    value.status = "failed";
    value.exitStatus = Number(process.argv[2]);
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  ' "$ATTEMPT_RECORD" "$QUALIFICATION_STATUS"
  fail "qualification attempt $ATTEMPT failed; evidence retained at $QUALIFICATION_DIR"
fi

note "Reconciling the immutable identity chain across the resumed receipts"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [dir, qualificationDir, imageId, sourceSha, harnessSha, origin] = process.argv.slice(1);
  const archive = JSON.parse(fs.readFileSync(path.join(dir, "archive-verification", "archive-verification.json"), "utf8"));
  const qualification = JSON.parse(fs.readFileSync(path.join(qualificationDir, "existing-image-qualification.json"), "utf8"));
  const edge = JSON.parse(fs.readFileSync(path.join(qualificationDir, "edge", "edge-results.json"), "utf8"));
  const browser = JSON.parse(fs.readFileSync(path.join(qualificationDir, "browser", "results.json"), "utf8"));
  const runtime = JSON.parse(fs.readFileSync(path.join(qualificationDir, "runtime-edge", "identity.json"), "utf8"));
  const rollback = fs.readFileSync(path.join(qualificationDir, "rollback", "results.txt"), "utf8");
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
' "$REHEARSAL_DIR" "$QUALIFICATION_DIR" "$CHECKPOINT_IMAGE_ID" "$SOURCE_SHA" "$HARNESS_SHA" "$APP_URL" \
  || fail "resumed identity chain is incomplete"

"$NODE_BIN" -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.status = "complete";
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
' "$ATTEMPT_RECORD"

cat > "$REHEARSAL_DIR/rehearsal-identities.json" <<EOF
{
  "schemaVersion": 2,
  "status": "complete",
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$CHECKPOINT_IMAGE_ID",
  "archivePath": "$CHECKPOINT_ARCHIVE_PATH",
  "archiveSha256": "$CHECKPOINT_ARCHIVE_SHA",
  "applicationOrigin": "$APP_URL",
  "effectiveRuntimeOrigin": "$APP_URL",
  "buildDaemonIdentity": "$BUILD_DAEMON_ID",
  "verifyDaemonIdentity": "$VERIFY_DAEMON_ID",
  "phaseDaemonIdentity": "$PHASE_DAEMON_ID",
  "phaseTransferRequired": $CHECKPOINT_TRANSFER_REQUIRED,
  "qualificationAttempt": $ATTEMPT,
  "qualificationDir": "$QUALIFICATION_DIR",
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
image_id=$CHECKPOINT_IMAGE_ID
application_origin=$APP_URL
effective_runtime_origin=$APP_URL
build_daemon=$BUILD_DAEMON_ID
verify_daemon=$VERIFY_DAEMON_ID
phase_daemon=$PHASE_DAEMON_ID
qualification_attempt=$ATTEMPT
customer_admission=closed
EOF

note "Exact-candidate rehearsal complete; customer admission remains closed."
