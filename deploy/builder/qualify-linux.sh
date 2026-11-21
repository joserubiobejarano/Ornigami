#!/usr/bin/env bash
# Builder-only Linux packaging and runtime qualification.
#
# This script is intentionally packaging/runtime scoped. Application behavior
# (invite/session/budget journeys) belongs to Sessions 1 and 2.
#
# Final qualification MUST run from a clean checkout of the merged candidate:
#   SOURCE_SHA="$(git rev-parse HEAD)" ./deploy/builder/qualify-linux.sh
#
# Rerun safety: every run gets a unique run id, evidence directory, image tag,
# network, volume and container names. Existing paths/resources are never
# deleted or reused. Only resources labelled with this run id are cleaned up.
# Volumes are retained by default for audit; set KEEP_VOLUMES=0 to remove them.
#
# If neither Docker nor Podman is installed, the script prints the reproducible
# command plan and exits 2 with Linux execution marked pending.
#
# SELF-TEST (no build/runtime execution; used by the local harness):
#   QUALIFY_SELF_TEST=1 ALLOW_DIRTY=1 ALLOW_NON_LINUX_ENGINE=1 \
#   SOURCE_SHA="$(git rev-parse HEAD)" ENGINE=<stub-or-engine> \
#   EVIDENCE_DIR=<new-path> ./deploy/builder/qualify-linux.sh
#
# MOUNT-ONLY (real engine; stops after the four writable-path probes):
#   MOUNT_ONLY=1 BROWSER_PHASE=0 KEEP_VOLUMES=0 REMOVE_IMAGE=1 \
#   SOURCE_SHA="$(git rev-parse HEAD)" ./deploy/builder/qualify-linux.sh
#
# DIAGNOSTIC (real engine; host path before/after same-container restart):
#   DIAGNOSTIC=1 BROWSER_PHASE=1 KEEP_VOLUMES=0 \
#   SOURCE_SHA="$(git rev-parse HEAD)" ./deploy/builder/qualify-linux.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse HEAD)}"
APP_URL_EXPLICIT="${APP_URL:+1}"
APP_URL="${APP_URL:-http://127.0.0.1:3100}"
QUALIFICATION_PATH="${QUALIFICATION_PATH:-}"
APPLICATION_ORIGIN="${APPLICATION_ORIGIN:-}"
BROWSER_ORIGIN="${BROWSER_ORIGIN:-}"
IMAGE_MODE="${IMAGE_MODE:-build}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:-}"
EXPECTED_PLATFORM="${EXPECTED_PLATFORM:-linux/amd64}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
PLATFORM="${PLATFORM:-$EXPECTED_PLATFORM}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
QUALIFY_SELF_TEST="${QUALIFY_SELF_TEST:-0}"
KEEP_ON_FAILURE="${KEEP_ON_FAILURE:-1}"
KEEP_VOLUMES="${KEEP_VOLUMES:-1}"
REMOVE_IMAGE="${REMOVE_IMAGE:-0}"
MOUNT_ONLY="${MOUNT_ONLY:-0}"
DIAGNOSTIC="${DIAGNOSTIC:-0}"
IMAGE_VALIDATE_ONLY="${IMAGE_VALIDATE_ONLY:-0}"
STORE_MODE="${STORE_MODE:-volume}"
STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:-${STORE_HOST_ID:-ornigami-builder-store}}"
NODE_BIN="${NODE_BIN:-node}"
BROWSER_PHASE="${BROWSER_PHASE:-1}"
HOST_PORT=""

RUN_ID="${RUN_ID:-${SOURCE_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM:-0}}"
EVIDENCE_ROOT="${EVIDENCE_ROOT:-$ROOT/.local/builder-linux-qualification}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$EVIDENCE_ROOT/runs/$RUN_ID}"
BACKUP_DIR="${BACKUP_DIR:-$EVIDENCE_DIR/backup}"
BACKUP2_DIR="${BACKUP2_DIR:-$EVIDENCE_DIR/backup2}"
RESTORE_DIR="${RESTORE_DIR:-$EVIDENCE_DIR/restore}"
RESTORE2_DIR="${RESTORE2_DIR:-$EVIDENCE_DIR/restore2}"
STORE_EXPORT_DIR="${STORE_EXPORT_DIR:-$EVIDENCE_DIR/store-export}"
BROWSER_EVIDENCE_DIR="${BROWSER_EVIDENCE_DIR:-$EVIDENCE_DIR/browser}"
IMAGE="${IMAGE:-ornigami-builder:qualify-$RUN_ID}"
CONTAINER="${CONTAINER:-ornigami-builder-qualify-$RUN_ID}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-$CONTAINER-restore}"
RESTORE2_CONTAINER="${RESTORE2_CONTAINER:-$CONTAINER-restore2}"
CLOSED_CONTAINER="${CLOSED_CONTAINER:-$CONTAINER-closed}"
NETWORK="${NETWORK:-ornigami-builder-qualify-net-$RUN_ID}"
STORE_VOLUME="${STORE_VOLUME:-ornigami-builder-store-$RUN_ID}"
RESTORE_VOLUME="${RESTORE_VOLUME:-ornigami-builder-restore-$RUN_ID}"
RESTORE2_VOLUME="${RESTORE2_VOLUME:-ornigami-builder-restore2-$RUN_ID}"
STORE_DIR="${STORE_DIR:-}"

abspath() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$ROOT" "$1" ;;
  esac
}
EVIDENCE_ROOT="$(abspath "$EVIDENCE_ROOT")"
EVIDENCE_DIR="$(abspath "$EVIDENCE_DIR")"
BACKUP_DIR="$(abspath "$BACKUP_DIR")"
BACKUP2_DIR="$(abspath "$BACKUP2_DIR")"
RESTORE_DIR="$(abspath "$RESTORE_DIR")"
RESTORE2_DIR="$(abspath "$RESTORE2_DIR")"
STORE_EXPORT_DIR="$(abspath "$STORE_EXPORT_DIR")"
BROWSER_EVIDENCE_DIR="$(abspath "$BROWSER_EVIDENCE_DIR")"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

ENGINE="${ENGINE:-}"
if [[ -z "$ENGINE" ]]; then
  for candidate in docker podman; do
    if command -v "$candidate" >/dev/null 2>&1; then ENGINE="$candidate"; break; fi
  done
fi

# ---------------------------------------------------------------------------
# Planning output when no container engine exists.
# ---------------------------------------------------------------------------
print_plan() {
  cat <<EOF
Linux execution pending: no Docker or Podman engine is available.

This plan is run-scoped. Every rerun uses a new RUN_ID and refuses to reuse an
existing evidence path, image, container, network or volume.

  cd "$ROOT"
  SOURCE_SHA="\$(git rev-parse HEAD)"
  APP_URL="$APP_URL"
  RUN_ID="\${RUN_ID:-<unique>}"

  # The default is a named persistent volume; bind mode is also supported with
  # STORE_MODE=bind STORE_DIR=<new-empty-host-directory>.
  STORE_MODE=volume \\
  STORE_HOST_ID="$STORE_HOST_ID" \\
  ./deploy/builder/qualify-linux.sh

Exact equivalent image build command:

  docker build -f deploy/builder/Dockerfile \\
    --platform linux/amd64 \\
    --label org.ornigami.qualify.run="\$RUN_ID" \\
    --build-arg NEXT_PUBLIC_APP_URL="\$APP_URL" \\
    --build-arg ORNIGAMI_SOURCE_SHA="\$SOURCE_SHA" \\
    -t "$IMAGE" .

Supported operator CLI path (same image, same volume, same host id):

  BUILDER_OPERATOR_IMAGE="$IMAGE" \\
  BUILDER_OPERATOR_VOLUME="$STORE_VOLUME" \\
  BUILDER_RUNTIME_STORE_HOST_ID="$STORE_HOST_ID" \\
    ./deploy/builder/operator.sh lock-status --json

On the authorized Linux runner use ENGINE=docker (or ENGINE=podman). The script
creates a new run directory under "$EVIDENCE_ROOT/runs/<run-id>/",
builds the image, exercises the named volume, UID 1000, read-only root, restart,
fresh-container restore, lock recovery, session/revocation/reservation state and
the same-image closed rollback. It never deletes a pre-existing path or resource.
EOF
}

if [[ -z "$ENGINE" ]] || ! command -v "$ENGINE" >/dev/null 2>&1; then
  print_plan
  exit 2
fi

if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  fail "SOURCE_SHA must be the exact 40-hex merged candidate SHA"
fi
if [[ ! "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HARNESS_SHA must be the exact 40-hex harness commit"
fi
if [[ "$IMAGE_MODE" != "build" && "$IMAGE_MODE" != "existing" ]]; then
  fail "IMAGE_MODE must be build or existing"
fi
if [[ "$IMAGE_MODE" == "existing" ]]; then
  [[ "$IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "existing-image mode requires IMAGE to be the resolved immutable sha256:<64-hex> image ID"
elif [[ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]]; then
  fail "SOURCE_SHA does not match HEAD; final build qualification must use the merged candidate"
fi
if [[ "$ALLOW_DIRTY" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  fail "Worktree is dirty; commit the packaging change and run from the clean merged candidate (or set ALLOW_DIRTY=1 for a non-final smoke)"
fi
if [[ "$(uname -s)" != "Linux" && "${ALLOW_NON_LINUX_ENGINE:-0}" != "1" ]]; then
  fail "This script must run on Linux (set ALLOW_NON_LINUX_ENGINE=1 only for a deliberate non-Linux container-engine smoke)"
fi
if [[ "$QUALIFY_SELF_TEST" != "1" ]] && ! command -v "$NODE_BIN" >/dev/null 2>&1; then
  fail "$NODE_BIN is required to parse operator JSON on the qualification host"
fi
if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ ]]; then
  fail "RUN_ID must match Docker's name pattern [A-Za-z0-9][A-Za-z0-9_.-]{0,63}"
fi
if [[ "$STORE_MODE" != "volume" && "$STORE_MODE" != "bind" ]]; then
  fail "STORE_MODE must be volume or bind"
fi
if [[ "$QUALIFY_SELF_TEST" != "1" && "$IMAGE_VALIDATE_ONLY" != "1" && "${ALLOW_NON_LINUX_ENGINE:-0}" != "1" && "$(id -u)" -ne 0 && "$(id -u)" -ne 1000 ]]; then
  fail "Run as root or UID 1000 so the UID 1000 container can write the backup/evidence helpers"
fi
if ! "$ENGINE" info >/dev/null 2>&1; then
  fail "$ENGINE is present but its daemon is not usable"
fi
if [[ "$BROWSER_PHASE" != "0" && "$BROWSER_PHASE" != "1" ]]; then
  fail "BROWSER_PHASE must be 0 or 1"
fi
if [[ "$MOUNT_ONLY" != "0" && "$MOUNT_ONLY" != "1" ]]; then
  fail "MOUNT_ONLY must be 0 or 1"
fi
if [[ "$DIAGNOSTIC" != "0" && "$DIAGNOSTIC" != "1" ]]; then
  fail "DIAGNOSTIC must be 0 or 1"
fi
if [[ "$IMAGE_VALIDATE_ONLY" != "0" && "$IMAGE_VALIDATE_ONLY" != "1" ]]; then
  fail "IMAGE_VALIDATE_ONLY must be 0 or 1"
fi
if [[ "$DIAGNOSTIC" == "1" && "$BROWSER_PHASE" != "1" ]]; then
  fail "DIAGNOSTIC requires BROWSER_PHASE=1"
fi

# Resolve the path and origins before any run resource is created. The image's
# configured application origin is never replaced by a diagnostic address.
if [[ -z "$QUALIFICATION_PATH" ]]; then
  if [[ "$APP_URL" == https://* ]]; then
    QUALIFICATION_PATH="https-edge"
  else
    QUALIFICATION_PATH="http-loopback"
  fi
fi
if [[ "$QUALIFICATION_PATH" != "http-loopback" && "$QUALIFICATION_PATH" != "https-edge" ]]; then
  fail "QUALIFICATION_PATH must be http-loopback or https-edge"
fi
if [[ "$DIAGNOSTIC" == "1" && "$QUALIFICATION_PATH" != "http-loopback" ]]; then
  fail "DIAGNOSTIC is only supported with http-loopback qualification"
fi

if [[ "$QUALIFICATION_PATH" == "http-loopback" && "$BROWSER_PHASE" == "1" && -z "$APP_URL_EXPLICIT" ]]; then
  HOST_PORT="$("$NODE_BIN" -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
  APP_URL="http://127.0.0.1:$HOST_PORT"
fi

APPLICATION_ORIGIN="${APPLICATION_ORIGIN:-$APP_URL}"
BROWSER_ORIGIN="${BROWSER_ORIGIN:-$APPLICATION_ORIGIN}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:-$APPLICATION_ORIGIN}"
[[ "$APP_URL" == "$APPLICATION_ORIGIN" ]] \
  || fail "APP_URL [$APP_URL] conflicts with APPLICATION_ORIGIN [$APPLICATION_ORIGIN]"
[[ "$BROWSER_ORIGIN" == "$APPLICATION_ORIGIN" ]] \
  || fail "browser/diagnostic origin [$BROWSER_ORIGIN] must equal the configured application origin [$APPLICATION_ORIGIN]; a loopback transport cannot replace an HTTPS application origin"
[[ "$EXPECTED_ORIGIN" == "$APPLICATION_ORIGIN" ]] \
  || fail "EXPECTED_ORIGIN [$EXPECTED_ORIGIN] conflicts with APPLICATION_ORIGIN [$APPLICATION_ORIGIN]"
"$NODE_BIN" -e '
  const value = process.argv[1];
  const url = new URL(value);
  if (url.origin !== value || url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$APPLICATION_ORIGIN" || fail "APPLICATION_ORIGIN must be an exact origin such as https://builder.example"

if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
  [[ "$APPLICATION_ORIGIN" == https://* ]] \
    || fail "https-edge qualification requires an HTTPS application origin"
  if [[ "$BROWSER_PHASE" == "1" ]]; then
    BROWSER_BASIC_AUTH_USER="${BROWSER_BASIC_AUTH_USER:-${STAGING_BASIC_AUTH_USER:-}}"
    BROWSER_BASIC_AUTH_PASSWORD="${BROWSER_BASIC_AUTH_PASSWORD:-${STAGING_BASIC_AUTH_PASSWORD:-}}"
    [[ -n "$BROWSER_BASIC_AUTH_USER" && -n "$BROWSER_BASIC_AUTH_PASSWORD" ]] \
      || fail "https-edge browser qualification requires STAGING_BASIC_AUTH_USER/PASSWORD"
  fi
else
  [[ "$APPLICATION_ORIGIN" =~ ^http://127\.0\.0\.1:([0-9]+)$ ]] \
    || fail "http-loopback qualification requires APPLICATION_ORIGIN=http://127.0.0.1:<port>"
  HOST_PORT="${BASH_REMATCH[1]}"
  [[ "$HOST_PORT" -ge 1 && "$HOST_PORT" -le 65535 ]] || fail "loopback origin has an invalid port"
fi

if [[ "$IMAGE_MODE" == "existing" ]]; then
  "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1 \
    || fail "existing image ID is not present on this daemon: $IMAGE"
  EXISTING_ID="$("$ENGINE" image inspect --format '{{.Id}}' "$IMAGE")"
  EXISTING_REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
  EXISTING_ORIGIN="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$IMAGE")"
  EXISTING_PLATFORM="$("$ENGINE" image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")"
  EXISTING_USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE")"
  [[ "$EXISTING_ID" == "$IMAGE" ]] || fail "image ID did not resolve to itself: $IMAGE -> $EXISTING_ID"
  [[ "$EXISTING_REVISION" == "$SOURCE_SHA" ]] || fail "application source label mismatch: expected $SOURCE_SHA, got $EXISTING_REVISION"
  [[ "$EXISTING_ORIGIN" == "$EXPECTED_ORIGIN" ]] || fail "origin label mismatch: expected $EXPECTED_ORIGIN, got $EXISTING_ORIGIN"
  [[ "$EXISTING_PLATFORM" == "$EXPECTED_PLATFORM" ]] || fail "platform mismatch: expected $EXPECTED_PLATFORM, got $EXISTING_PLATFORM"
  [[ "$EXISTING_USER" == "$EXPECTED_USER" ]] || fail "user mismatch: expected $EXPECTED_USER, got $EXISTING_USER"
fi

# The browser target was resolved with the application origin above. HTTPS
# runs against the private edge; loopback runs use the run-owned host proxy.

# ---------------------------------------------------------------------------
# Collision checks: never reuse or delete another run's resources.
# ---------------------------------------------------------------------------
require_absent_path() {
  local label="$1" value="$2"
  [[ ! -e "$value" ]] || fail "$label already exists and will not be reused: $value"
}
require_absent_image() {
  if "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
    fail "Image tag already exists and will not be overwritten: $IMAGE (choose a new RUN_ID or IMAGE)"
  fi
}
require_absent_container() {
  local name="$1"
  if "$ENGINE" container inspect "$name" >/dev/null 2>&1; then
    fail "Container already exists and will not be reused: $name"
  fi
}
require_absent_network() {
  if "$ENGINE" network inspect "$NETWORK" >/dev/null 2>&1; then
    fail "Network already exists and will not be reused: $NETWORK"
  fi
}
require_absent_volume() {
  local name="$1"
  if "$ENGINE" volume inspect "$name" >/dev/null 2>&1; then
    fail "Volume already exists and will not be reused: $name"
  fi
}

require_absent_path "EVIDENCE_DIR" "$EVIDENCE_DIR"
require_absent_path "BACKUP_DIR" "$BACKUP_DIR"
require_absent_path "BACKUP2_DIR" "$BACKUP2_DIR"
require_absent_path "RESTORE_DIR" "$RESTORE_DIR"
require_absent_path "RESTORE2_DIR" "$RESTORE2_DIR"
require_absent_path "STORE_EXPORT_DIR" "$STORE_EXPORT_DIR"
require_absent_path "BROWSER_EVIDENCE_DIR" "$BROWSER_EVIDENCE_DIR"
if [[ "$IMAGE_MODE" == "build" ]]; then
  require_absent_image
fi
require_absent_container "$CONTAINER"
require_absent_container "$RESTORE_CONTAINER"
require_absent_container "$RESTORE2_CONTAINER"
require_absent_container "$CLOSED_CONTAINER"
require_absent_network
require_absent_volume "$STORE_VOLUME"
if [[ "$STORE_MODE" == "volume" ]]; then
  require_absent_volume "$RESTORE_VOLUME"
  require_absent_volume "$RESTORE2_VOLUME"
fi
if [[ "$STORE_MODE" == "bind" ]]; then
  [[ -n "$STORE_DIR" ]] || fail "STORE_DIR is required when STORE_MODE=bind"
  [[ "$STORE_DIR" = /* ]] || fail "STORE_DIR must be an absolute path"
  require_absent_path "STORE_DIR" "$STORE_DIR"
fi

# ---------------------------------------------------------------------------
# Evidence and run-owned resource tracking.
# ---------------------------------------------------------------------------
mkdir -p "$(dirname "$EVIDENCE_DIR")"
mkdir "$EVIDENCE_DIR"
mkdir "$BACKUP_DIR" "$RESTORE_DIR" "$STORE_EXPORT_DIR"
HTTP_LOG="$EVIDENCE_DIR/http.log"
OP_LOG="$EVIDENCE_DIR/operator.log"
: > "$HTTP_LOG"
: > "$OP_LOG"
# Keep the complete script transcript in the run directory.
exec > >(tee -a "$EVIDENCE_DIR/qualify.log") 2>&1

CHECK_COUNT=0
check() {
  local name="$1" actual="$2" expected="$3"
  CHECK_COUNT=$((CHECK_COUNT + 1))
  if [[ "$actual" != "$expected" ]]; then
    fail "$name: expected [$expected], got [$actual]"
  fi
  printf 'ok\t%s\t%s\n' "$name" "$actual" >> "$EVIDENCE_DIR/checks.tsv"
  note "PASS $name"
}
check_contains() {
  local name="$1" actual="$2" expected="$3"
  CHECK_COUNT=$((CHECK_COUNT + 1))
  if [[ "$actual" != *"$expected"* ]]; then
    fail "$name: expected to contain [$expected], got [$actual]"
  fi
  printf 'ok\t%s\t%s\n' "$name" "$actual" >> "$EVIDENCE_DIR/checks.tsv"
  note "PASS $name"
}
DEFERRED_FAILURES=()
record_result() {
  local name="$1" actual="$2" expected="$3"
  CHECK_COUNT=$((CHECK_COUNT + 1))
  if [[ "$actual" != "$expected" ]]; then
    DEFERRED_FAILURES+=("$name: expected [$expected], got [$actual]")
    printf 'fail\t%s\t%s\n' "$name" "$actual" >> "$EVIDENCE_DIR/checks.tsv"
    note "FAIL $name (collected): expected [$expected], got [$actual]"
    return 0
  fi
  printf 'ok\t%s\t%s\n' "$name" "$actual" >> "$EVIDENCE_DIR/checks.tsv"
  note "PASS $name"
}
flush_deferred_failures() {
  local phase="$1"
  if [[ ${#DEFERRED_FAILURES[@]} -gt 0 ]]; then
    local joined
    joined="$(printf '%s; ' "${DEFERRED_FAILURES[@]}")"
    fail "$phase failed: $joined"
  fi
}

created_container=0
created_restore_container=0
created_restore2_container=0
created_closed_container=0
created_network=0
created_store_volume=0
created_restore_volume=0
created_restore2_volume=0
created_image=0
PROXY_PID=""
PROXY_TARGET=""

stop_host_proxy() {
  if [[ -n "$PROXY_PID" ]]; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
    PROXY_PID=""
  fi
}

container_owned() {
  local name="$1" label
  label="$("$ENGINE" inspect --format '{{ index .Config.Labels "org.ornigami.qualify.run" }}' "$name" 2>/dev/null || true)"
  [[ "$label" == "$RUN_ID" ]]
}
remove_container() {
  local name="$1" created="$2"
  [[ "$created" == "1" ]] || return 0
  if "$ENGINE" container inspect "$name" >/dev/null 2>&1; then
    if container_owned "$name"; then
      "$ENGINE" rm -f "$name" >/dev/null 2>&1 || true
    else
      note "Leaving unowned container untouched: $name"
    fi
  fi
}
stop_owned_container() {
  local name="$1" created="$2"
  [[ "$created" == "1" ]] || return 0
  if "$ENGINE" container inspect "$name" >/dev/null 2>&1; then
    if container_owned "$name"; then
      "$ENGINE" stop "$name" >/dev/null 2>&1 || true
    else
      note "Leaving unowned container untouched: $name"
    fi
  fi
}
remove_network() {
  [[ "$created_network" == "1" ]] || return 0
  if "$ENGINE" network inspect "$NETWORK" >/dev/null 2>&1; then
    local label
    label="$("$ENGINE" network inspect --format '{{ index .Labels "org.ornigami.qualify.run" }}' "$NETWORK" 2>/dev/null || true)"
    if [[ "$label" == "$RUN_ID" ]]; then
      "$ENGINE" network rm "$NETWORK" >/dev/null 2>&1 || true
    else
      note "Leaving unowned network untouched: $NETWORK"
    fi
  fi
}
remove_volume() {
  local name="$1" created="$2"
  [[ "$created" == "1" ]] || return 0
  if "$ENGINE" volume inspect "$name" >/dev/null 2>&1; then
    local label
    label="$("$ENGINE" volume inspect --format '{{ index .Labels "org.ornigami.qualify.run" }}' "$name" 2>/dev/null || true)"
    if [[ "$label" == "$RUN_ID" ]]; then
      "$ENGINE" volume rm "$name" >/dev/null 2>&1 || true
    else
      note "Leaving unowned volume untouched: $name"
    fi
  fi
}
remove_image() {
  [[ "$REMOVE_IMAGE" == "1" && "$created_image" == "1" ]] || return 0
  if "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
    local label
    label="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.qualify.run" }}' "$IMAGE" 2>/dev/null || true)"
    if [[ "$label" == "$RUN_ID" ]]; then
      "$ENGINE" image rm "$IMAGE" >/dev/null 2>&1 || true
    else
      note "Leaving unowned image untouched: $IMAGE"
    fi
  fi
}
cleanup() {
  local status=$?
  set +e
  stop_host_proxy
  if [[ "$status" -ne 0 && "$KEEP_ON_FAILURE" == "1" ]]; then
    stop_owned_container "$CONTAINER" "$created_container"
    stop_owned_container "$RESTORE_CONTAINER" "$created_restore_container"
    stop_owned_container "$RESTORE2_CONTAINER" "$created_restore2_container"
    stop_owned_container "$CLOSED_CONTAINER" "$created_closed_container"
    note "Failure: retained this run's containers/network/volumes for inspection."
    note "Evidence: $EVIDENCE_DIR"
    exit "$status"
  fi
  remove_container "$CONTAINER" "$created_container"
  remove_container "$RESTORE_CONTAINER" "$created_restore_container"
  remove_container "$RESTORE2_CONTAINER" "$created_restore2_container"
  remove_container "$CLOSED_CONTAINER" "$created_closed_container"
  remove_network
  if [[ "$KEEP_VOLUMES" != "1" ]]; then
    remove_volume "$STORE_VOLUME" "$created_store_volume"
    remove_volume "$RESTORE_VOLUME" "$created_restore_volume"
    remove_volume "$RESTORE2_VOLUME" "$created_restore2_volume"
  fi
  remove_image
  exit "$status"
}
trap cleanup EXIT

note "Engine: $ENGINE"
note "Source SHA: $SOURCE_SHA"
note "Run ID: $RUN_ID"
note "Image: $IMAGE"
note "Evidence: $EVIDENCE_DIR"
note "Store mode: $STORE_MODE ($STORE_VOLUME)"
note "Store host ID: $STORE_HOST_ID"

# Build the exact --mount pair once. A failure must abort the run; never let an
# empty or partially built mount array reach the engine.
build_store_mount_args() {
  local source="$1"
  STORE_MOUNT_ARGS=()
  if [[ -z "$source" || "$source" == *","* || "$source" == *$'\n'* ]]; then
    return 1
  fi
  case "$STORE_MODE" in
    volume)
      [[ "$source" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || return 1
      STORE_MOUNT_ARGS=(--mount "type=volume,src=$source,dst=/data/builder")
      ;;
    bind)
      [[ "$source" = /* && -d "$source" ]] || return 1
      STORE_MOUNT_ARGS=(--mount "type=bind,src=$source,dst=/data/builder")
      ;;
    *)
      return 1
      ;;
  esac
  [[ ${#STORE_MOUNT_ARGS[@]} -eq 2 ]] || return 1
  [[ "${STORE_MOUNT_ARGS[0]}" == "--mount" ]] || return 1
  [[ "${STORE_MOUNT_ARGS[1]}" == "type=$STORE_MODE,src=$source,dst=/data/builder" ]] || return 1
  return 0
}

verify_volume_owned() {
  local name="$1" label
  label="$("$ENGINE" volume inspect --format '{{ index .Labels "org.ornigami.qualify.run" }}' "$name" 2>/dev/null || true)"
  [[ "$label" == "$RUN_ID" ]] \
    || fail "Refusing to modify volume not owned by run $RUN_ID: $name (label [$label])"
}

initialize_volume_root() {
  local name="$1"
  verify_volume_owned "$name"
  "$ENGINE" run --rm \
    --label "org.ornigami.qualify.run=$RUN_ID" \
    --network none --read-only --user 0:0 \
    --mount "type=volume,src=$name,dst=/data/builder" \
    "$IMAGE" -e '
      const fs = require("node:fs");
      const p = "/data/builder";
      fs.chownSync(p, 1000, 1000);
      fs.chmodSync(p, 0o700);
      const s = fs.statSync(p);
      if (s.uid !== 1000 || s.gid !== 1000 || (s.mode & 0o777) !== 0o700) {
        throw new Error(`store root initialization failed: ${s.uid}:${s.gid} ${(s.mode & 0o777).toString(8)}`);
      }
    '
  note "Initialized volume store root: $name (1000:1000, 0700)"
}

initialize_bind_root() {
  local path="$1" actual
  [[ "$path" == "$STORE_DIR" || "$path" == "$RESTORE_DIR" ]] \
    || fail "Unexpected bind store root: $path"
  [[ -d "$path" && ! -L "$path" ]] || fail "Bind store root is not a real directory: $path"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown 1000:1000 "$path"
  fi
  chmod 0700 "$path"
  if [[ "$(uname -s)" == "Linux" ]]; then
    actual="$(stat -c '%u:%g:%a' "$path")"
    [[ "$actual" == "1000:1000:700" ]] \
      || fail "Bind store root mismatch: $path expected 1000:1000:700, got $actual"
  fi
  note "Initialized bind store root: $path (1000:1000, 0700)"
}

initialize_store_root() {
  local source="$1"
  case "$STORE_MODE" in
    volume) initialize_volume_root "$source" ;;
    bind) initialize_bind_root "$source" ;;
    *) fail "Unsupported store mode: $STORE_MODE" ;;
  esac
}

# ---------------------------------------------------------------------------
# Self-test: exercise run-scoped naming, collision guards and owned cleanup
# without building or running the application. The local harness uses a stub
# engine; an authorized Linux runner may use a real engine.
# ---------------------------------------------------------------------------
if [[ "$QUALIFY_SELF_TEST" == "1" ]]; then
  note "SELF-TEST: create run-scoped network and store source"
  "$ENGINE" network create --internal \
    --label "org.ornigami.qualify.run=$RUN_ID" "$NETWORK" >/dev/null
  created_network=1
  if [[ "$STORE_MODE" == "volume" ]]; then
    store_label="org.ornigami.qualify.run=$RUN_ID"
    if [[ "${SELF_TEST_FOREIGN_VOLUME:-0}" == "1" ]]; then
      store_label="foreign-volume"
    fi
    "$ENGINE" volume create --label "$store_label" "$STORE_VOLUME" >/dev/null
    created_store_volume=1
    STORE_SOURCE="$STORE_VOLUME"
  else
    mkdir "$STORE_DIR"
    STORE_SOURCE="$STORE_DIR"
  fi
  if [[ "${SELF_TEST_INITIALIZE_STORE:-0}" == "1" ]]; then
    initialize_store_root "$STORE_SOURCE"
  fi
  if [[ "${SELF_TEST_CREATE_CONTAINER:-0}" == "1" ]]; then
    build_store_mount_args "$STORE_SOURCE" \
      || fail "SELF-TEST: could not construct mount arguments for $STORE_SOURCE"
    "$ENGINE" create --name "$CONTAINER" \
      --label "org.ornigami.qualify.run=$RUN_ID" \
      --network "$NETWORK" "${STORE_MOUNT_ARGS[@]}" "$IMAGE" >/dev/null
    created_container=1
  fi
  cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
self_test=true
run_id=$RUN_ID
image_mode=$IMAGE_MODE
image_id=${EXISTING_ID:-$IMAGE}
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
engine=$ENGINE
evidence_dir=$EVIDENCE_DIR
network=$NETWORK
store_source=$STORE_SOURCE
restore_source=${RESTORE_SOURCE:-$RESTORE_VOLUME}
image=$IMAGE
keep_volumes=$KEEP_VOLUMES
EOF
  note "PASS: qualification run-scoping self-test"
  cat "$EVIDENCE_DIR/results.txt"
  exit 0
fi

# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------
prepare_host_dir() {
  mkdir -p "$1"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown -R 1000:1000 "$1"
  fi
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

json_field() {
  "$NODE_BIN" -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      const line = input.trim().split(/\r?\n/).at(-1);
      let value = JSON.parse(line);
      for (const segment of process.argv.slice(1)) {
        value = Array.isArray(value) ? value[Number(segment)] : value?.[segment];
      }
      process.stdout.write(value === undefined || value === null ? "" : String(value));
    });
  ' "$@"
}

find_session_id() {
  "$NODE_BIN" -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      const subjectId = process.argv[1];
      const data = JSON.parse(input.trim().split(/\r?\n/).at(-1));
      const session = data.sessions.find(
        (item) => item.subjectId === subjectId && !item.revokedAt,
      );
      process.stdout.write(session?.id ?? "");
    });
  ' "$1"
}

usage_key() {
  "$NODE_BIN" -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      const usageId = process.argv[1];
      const data = JSON.parse(input.trim().split(/\r?\n/).at(-1));
      const record = data.usage.find((item) => item.id === usageId);
      process.stdout.write(
        record
          ? `${record.state}|${record.costMicros}|${record.recordedAt}|${record.requestKey ?? ""}`
          : "missing",
      );
    });
  ' "$1"
}

operator_run() {
  local source="$1"
  shift
  build_store_mount_args "$source" \
    || fail "operator mount construction failed for $source"
  "$ENGINE" run --rm --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700 \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700 \
    --user 1000:1000 "${STORE_MOUNT_ARGS[@]}" \
    -e "BUILDER_RUNTIME_STORE_HOST_ID=$STORE_HOST_ID" \
    "$IMAGE" --experimental-strip-types \
    /app/scripts/builder-invite-operator.mjs "$@"
}
op_json() {
  local source="$1"
  shift
  operator_run "$source" "$@" --json 2>>"$OP_LOG"
}
seed_run() {
  local source="$1"
  shift
  build_store_mount_args "$source" \
    || fail "seed mount construction failed for $source"
  "$ENGINE" run --rm --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700 \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700 \
    --user 1000:1000 "${STORE_MOUNT_ARGS[@]}" \
    --mount "type=bind,src=$ROOT/deploy/builder,dst=/app/qualify,readonly" \
    -e "BUILDER_RUNTIME_STORE_HOST_ID=$STORE_HOST_ID" \
    "$IMAGE" --experimental-strip-types \
    /app/qualify/qualify-seed.mjs "$@"
}
store_hash() {
  local source="$1"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=volume,src=$source,dst=/data/builder,readonly" \
      "$IMAGE" -e 'const fs=require("fs"),c=require("crypto");const p="/data/builder/identity-store.json";if(!fs.existsSync(p)){process.stdout.write("missing");process.exit(0)}process.stdout.write(c.createHash("sha256").update(fs.readFileSync(p)).digest("hex"))'
  else
    if [[ -f "$source/identity-store.json" ]]; then
      sha256_of "$source/identity-store.json"
    else
      printf 'missing'
    fi
  fi
}
copy_store_out() {
  local source="$1" dest="$2"
  prepare_host_dir "$dest"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=volume,src=$source,dst=/data/builder,readonly" \
      --mount "type=bind,src=$dest,dst=/backup" \
      "$IMAGE" -e 'const fs=require("fs");for(const f of fs.readdirSync("/data/builder")){fs.cpSync(`/data/builder/${f}`,`/backup/${f}`,{recursive:true,preserveTimestamps:true})}'
  else
    cp -a "$source/." "$dest/"
  fi
}
copy_store_in() {
  local source="$1" dest="$2"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=bind,src=$source,dst=/backup,readonly" \
      --mount "type=volume,src=$dest,dst=/data/builder" \
      "$IMAGE" -e 'const fs=require("fs");for(const f of fs.readdirSync("/backup")){fs.cpSync(`/backup/${f}`,`/data/builder/${f}`,{recursive:true,preserveTimestamps:true})}'
  else
    prepare_host_dir "$dest"
    cp -a "$source/." "$dest/"
  fi
}

copy_store_file_out() {
  local source="$1" file="$2" dest="$3"
  prepare_host_dir "$(dirname "$dest")"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=volume,src=$source,dst=/data/builder,readonly" \
      --mount "type=bind,src=$(dirname "$dest"),dst=/out" \
      "$IMAGE" -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);fs.copyFileSync(src,dst)' \
      "/data/builder/$file" "/out/$(basename "$dest")"
  else
    cp "$source/$file" "$dest"
  fi
}

copy_store_file_in() {
  local source="$1" dest="$2" file="$3"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=bind,src=$(dirname "$source"),dst=/in,readonly" \
      --mount "type=volume,src=$dest,dst=/data/builder" \
      "$IMAGE" -e 'const fs=require("fs");const [src,dst]=process.argv.slice(1);fs.copyFileSync(src,dst)' \
      "/in/$(basename "$source")" "/data/builder/$file"
  else
    prepare_host_dir "$dest"
    cp "$source" "$dest/$file"
  fi
}

store_file_exists() {
  local source="$1" file="$2"
  if [[ "$STORE_MODE" == "volume" ]]; then
    "$ENGINE" run --rm --network none --user 1000:1000 \
      --mount "type=volume,src=$source,dst=/data/builder,readonly" \
      "$IMAGE" -e 'process.exit(require("fs").existsSync(process.argv[1]) ? 0 : 1)' \
      "/data/builder/$file" >/dev/null 2>&1
  else
    [[ -f "$source/$file" ]]
  fi
}

journal_event_count() {
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const journal = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(journal.events.length));
  ' "$1"
}

json_array_count() {
  "$NODE_BIN" -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      const value = JSON.parse(input.trim().split(/\r?\n/).at(-1));
      for (const segment of process.argv.slice(1)) {
        const next = Array.isArray(value) ? value[Number(segment)] : value?.[segment];
        if (Array.isArray(next)) {
          process.stdout.write(String(next.length));
          return;
        }
      }
      process.stdout.write("0");
    });
  ' "$@"
}

wait_health() {
  local name="$1"
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    local status
    status="$("$ENGINE" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || true)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead)
        "$ENGINE" logs "$name" >&2 || true
        fail "container $name is $status"
        ;;
    esac
    sleep 2
  done
  "$ENGINE" logs "$name" >&2 || true
  fail "container $name did not become healthy"
}

exec_node() {
  local name="$1"
  shift
  "$ENGINE" exec "$name" /nodejs/bin/node -e "$*"
}

check_writable_path() {
  local name="$1" path="$2" expected_mode="$3"
  local result rc actual_owner actual_mode actual_value
  set +e
  result="$("$ENGINE" exec -e "QUALIFY_PROBE_PATH=$path" "$CONTAINER" /nodejs/bin/node -e '
    const fs = require("node:fs");
    const p = process.env.QUALIFY_PROBE_PATH;
    let owner = "unknown";
    let mode = "unknown";
    let value = "fail";
    try {
      const s = fs.statSync(p);
      owner = s.uid + ":" + s.gid;
      mode = (s.mode & 0o777).toString(8);
      const probe = p + "/.qualify-probe-" + process.pid;
      try {
        fs.writeFileSync(probe, "ok", { flag: "wx" });
        value = fs.readFileSync(probe, "utf8");
        fs.unlinkSync(probe);
      } catch (error) {
        value = "fail:" + (error.code || error.message);
        try { fs.unlinkSync(probe); } catch {}
      }
    } catch (error) {
      value = "fail:" + (error.code || error.message);
    }
    process.stdout.write([owner, mode, value].join("|"));
  ' 2>&1)"
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    result="${result//$'\n'/ }"
    result="unknown|unknown|fail:probe-exit-$rc-$result"
  fi
  IFS='|' read -r actual_owner actual_mode actual_value <<< "$result"
  record_result "writable:$name:owner" "$actual_owner" "1000:1000"
  record_result "writable:$name:mode" "$actual_mode" "$expected_mode"
  record_result "writable:$name:write-delete" "$actual_value" "ok"
}

http_run() {
  local name="$1"
  shift
  "$ENGINE" exec "$name" /nodejs/bin/node \
    /app/qualify/qualify-http.mjs "$@" 2>>"$HTTP_LOG"
}

start_runtime() {
  local name="$1" source="$2" mode="$3"
  build_store_mount_args "$source" \
    || fail "runtime mount construction failed for $source"
  "$ENGINE" run -d --name "$name" \
    --label "org.ornigami.qualify.run=$RUN_ID" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700 \
    --tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m,uid=1000,gid=1000,mode=0700 \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m,uid=1000,gid=1000,mode=0700 \
    "${STORE_MOUNT_ARGS[@]}" \
    --mount "type=bind,src=$ROOT/deploy/builder,dst=/app/qualify,readonly" \
    --network "$NETWORK" \
    --user 1000:1000 \
    -e NODE_ENV=production \
    -e BUILDER_RUNTIME_MODE="$mode" \
    -e BUILDER_RUNTIME_STORE_DIR=/data/builder \
    -e BUILDER_RUNTIME_STORE_HOST_ID="$STORE_HOST_ID" \
    -e BUILDER_RUNTIME_SESSION_TTL_SECONDS=3600 \
    -e BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT=1 \
    -e BUILDER_RUNTIME_ALLOW_TEST_HOOKS=0 \
    -e BUILDER_RUNTIME_TEST_PROVIDER=none \
    -e QUALIFY_BASE_URL=http://127.0.0.1:3000 \
    -e QUALIFY_ORIGIN="$APP_URL" \
    -e NEXT_PUBLIC_APP_URL="$APP_URL" \
    "$IMAGE" >/dev/null
}

start_host_proxy() {
  local name="$1" target_ip
  stop_host_proxy
  target_ip="$("$ENGINE" inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name")"
  [[ -n "$target_ip" ]] || fail "runtime container has no private network address"
  PROXY_TARGET="$target_ip:3000"
  "$NODE_BIN" deploy/builder/qualify-proxy.mjs \
    --listen "127.0.0.1:$HOST_PORT" --target "$PROXY_TARGET" \
    > "$EVIDENCE_DIR/proxy.log" 2>&1 &
  PROXY_PID=$!
  local deadline=$((SECONDS + 10))
  while (( SECONDS < deadline )); do
    if "$NODE_BIN" -e '
      const net = require("node:net");
      const socket = net.connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
      socket.once("connect", () => { socket.destroy(); process.exit(0); });
      socket.once("error", () => process.exit(1));
      setTimeout(() => process.exit(1), 500);
    ' "$HOST_PORT"; then
      note "Host loopback proxy ready: 127.0.0.1:$HOST_PORT -> $PROXY_TARGET"
      return 0
    fi
    kill -0 "$PROXY_PID" 2>/dev/null || fail "host loopback proxy exited early"
    sleep 0.2
  done
  fail "host loopback proxy did not become ready"
}

collect_connectivity() {
  local label="$1"
  local prefix="$EVIDENCE_DIR/connectivity-$label"
  local in_rc=0
  set +e
  http_run "$CONTAINER" smoke --mode invite >/dev/null
  in_rc=$?
  set -e
  {
    "$ENGINE" inspect --format '{{json .State}}' "$CONTAINER"
    "$ENGINE" inspect --format '{{json .NetworkSettings.Networks}}' "$CONTAINER"
    "$ENGINE" inspect --format '{{json .HostConfig.PortBindings}}' "$CONTAINER"
    "$ENGINE" port "$CONTAINER" 3000 || true
    "$ENGINE" network inspect "$NETWORK"
  } > "$prefix-engine.txt" 2>&1 || true
  {
    "$ENGINE" ps -a --filter "label=org.ornigami.qualify.run=$RUN_ID" --no-trunc
    ss -ltnp 2>/dev/null || true
  } > "$prefix-process.txt" 2>&1 || true
  "$NODE_BIN" deploy/builder/qualify-connectivity.mjs \
    --label "$label" \
    --origin "$APP_URL" \
    --proxy-target "$PROXY_TARGET" \
    --in-container-ok "$in_rc" \
    --engine-evidence "$prefix-engine.txt" \
    --output "$prefix.json" \
    --wait-ms 10000 || true
}

# ---------------------------------------------------------------------------
# Build and image contract.
# ---------------------------------------------------------------------------
if [[ "$IMAGE_MODE" == "build" ]]; then
  note "Build image"
  "$ENGINE" build --platform "$PLATFORM" \
    --label "org.ornigami.qualify.run=$RUN_ID" \
    --label "org.ornigami.qualify.source-sha=$SOURCE_SHA" \
    -f deploy/builder/Dockerfile \
    --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
    --build-arg ORNIGAMI_SOURCE_SHA="$SOURCE_SHA" \
    -t "$IMAGE" "$ROOT"
  created_image=1
else
  note "Using existing image ID $IMAGE (no build, tag or substitute)"
fi

IMAGE_ID="$("$ENGINE" image inspect --format '{{.Id}}' "$IMAGE")"
REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
ORIGIN_LABEL="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$IMAGE")"
IMAGE_PLATFORM="$("$ENGINE" image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")"
SINGLE_REPLICA="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.single-replica" }}' "$IMAGE")"
IMAGE_USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE")"
HEALTH_CMD="$("$ENGINE" image inspect --format '{{json .Config.Healthcheck}}' "$IMAGE")"
OPERATOR_CLI="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.operator-cli" }}' "$IMAGE")"
RUN_LABEL="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.qualify.run" }}' "$IMAGE")"
[[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "resolved image ID is not immutable: $IMAGE_ID"
if [[ "$IMAGE_MODE" == "existing" && "$IMAGE_ID" != "$IMAGE" ]]; then
  fail "image ID did not resolve to itself: $IMAGE -> $IMAGE_ID"
fi
printf 'ok\timage:id\t%s\n' "$IMAGE_ID" >> "$EVIDENCE_DIR/checks.tsv"
check "image:revision" "$REVISION" "$SOURCE_SHA"
check "image:origin" "$ORIGIN_LABEL" "$EXPECTED_ORIGIN"
check "image:platform" "$IMAGE_PLATFORM" "$PLATFORM"
check "image:single-replica" "$SINGLE_REPLICA" "true"
check "image:user" "$IMAGE_USER" "$EXPECTED_USER"
check_contains "image:health" "$HEALTH_CMD" "127.0.0.1:3000"
check "image:operator-cli" "$OPERATOR_CLI" "/app/scripts/builder-invite-operator.mjs"
if [[ "$IMAGE_MODE" == "build" ]]; then
  check "image:run-label" "$RUN_LABEL" "$RUN_ID"
else
  printf 'ok\timage:run-label\t%s\n' "$RUN_LABEL" >> "$EVIDENCE_DIR/checks.tsv"
fi

if [[ "$IMAGE_VALIDATE_ONLY" == "1" ]]; then
  cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
image_validate_only=true
self_test=false
engine=$ENGINE
source_sha=$SOURCE_SHA
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_mode=$IMAGE_MODE
image_id=$IMAGE_ID
run_id=$RUN_ID
image=$IMAGE
app_url=$APP_URL
application_origin=$APPLICATION_ORIGIN
browser_origin=$BROWSER_ORIGIN
qualification_path=$QUALIFICATION_PATH
effective_runtime_origin=$APPLICATION_ORIGIN
https_acceptance=${HTTPS_ACCEPTANCE:-false}
diagnostic_transport_origin=${HOST_PORT:+http://127.0.0.1:$HOST_PORT}
expected_origin=$EXPECTED_ORIGIN
checks=$CHECK_COUNT
evidence_dir=$EVIDENCE_DIR
EOF
  note "PASS: image identity validation only (no build, no runtime resources)"
  cat "$EVIDENCE_DIR/results.txt"
  exit 0
fi

# ---------------------------------------------------------------------------
# Create run-scoped network and persistent volume.
# ---------------------------------------------------------------------------
note "Create internal network and persistent store volume"
"$ENGINE" network create --internal \
  --label "org.ornigami.qualify.run=$RUN_ID" "$NETWORK" >/dev/null
created_network=1
if [[ "$STORE_MODE" == "bind" ]]; then
  mkdir "$STORE_DIR"
  STORE_SOURCE="$STORE_DIR"
else
  "$ENGINE" volume create \
    --label "org.ornigami.qualify.run=$RUN_ID" "$STORE_VOLUME" >/dev/null
  created_store_volume=1
  STORE_SOURCE="$STORE_VOLUME"
fi
initialize_store_root "$STORE_SOURCE"

# ---------------------------------------------------------------------------
# Invite runtime with read-only root, UID 1000 and the persistent volume.
# ---------------------------------------------------------------------------
note "Start invite runtime with read-only root"
created_container=1
start_runtime "$CONTAINER" "$STORE_SOURCE" invite
wait_health "$CONTAINER"
check "runtime:read-only-root" \
  "$("$ENGINE" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$CONTAINER")" "true"
check "runtime:user" \
  "$(exec_node "$CONTAINER" 'process.stdout.write(`${process.getuid()}:${process.getgid()}`)')" "1000:1000"
http_run "$CONTAINER" smoke --mode invite >/dev/null
check "http:smoke:invite" "ok" "ok"

exec_node "$CONTAINER" 'const fs=require("fs");try{fs.writeFileSync("/app/forbidden","x");process.exit(1)}catch(e){if(e.code!=="EROFS")throw e}'
check_writable_path "store" "/data/builder" "700"
check_writable_path "tmp" "/tmp" "700"
check_writable_path "next-cache" "/app/builder-runtime/.next/cache" "700"
check_writable_path "home" "/home/node" "700"
flush_deferred_failures "writable paths"

if [[ "$MOUNT_ONLY" == "1" ]]; then
  cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
mount_only=true
self_test=false
engine=$ENGINE
source_sha=$SOURCE_SHA
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_mode=$IMAGE_MODE
image_id=$IMAGE_ID
run_id=$RUN_ID
image=$IMAGE
app_url=$APP_URL
application_origin=$APPLICATION_ORIGIN
browser_origin=$BROWSER_ORIGIN
qualification_path=$QUALIFICATION_PATH
effective_runtime_origin=$APPLICATION_ORIGIN
https_acceptance=${HTTPS_ACCEPTANCE:-false}
diagnostic_transport_origin=${HOST_PORT:+http://127.0.0.1:$HOST_PORT}
store_mode=$STORE_MODE
store_volume=$STORE_VOLUME
runtime_user=1000:1000
read_only_root=true
writable_paths=/data/builder,/tmp,/app/builder-runtime/.next/cache,/home/node
writable_owners=1000:1000
writable_modes=0700
writable_tmpfs_options=rw,noexec,nosuid,uid=1000,gid=1000,mode=0700
checks=$CHECK_COUNT
evidence_dir=$EVIDENCE_DIR
EOF
  note "PASS: mount-only qualification"
  cat "$EVIDENCE_DIR/results.txt"
  exit 0
fi

if [[ "$BROWSER_PHASE" == "1" && "$QUALIFICATION_PATH" == "http-loopback" ]]; then
  start_host_proxy "$CONTAINER"
fi

# The store file is created by the first operator write; its owner/mode is
# checked after the synthetic invites below.

note "Verify no external egress"
if exec_node "$CONTAINER" 'fetch("https://example.com",{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(1)).catch(()=>process.exit(0))'; then :; else
  fail "runtime reached the public network"
fi

if "$ENGINE" inspect --format '{{json .Config.Env}}' "$CONTAINER" | grep -E 'DATABASE_URL|OPENAI|STRIPE|RESEND|SENTRY|GOOGLE_CLIENT|AUTH_SECRET' >/dev/null; then
  fail "forbidden provider/database/billing/mail/Sentry configuration is present"
fi

# ---------------------------------------------------------------------------
# Supported operator CLI path and synthetic identity/session seeding.
# ---------------------------------------------------------------------------
note "Exercise the packaged operator CLI path"
LOCK_STATUS_EMPTY="$(op_json "$STORE_SOURCE" lock-status)"
check "operator:host-id" "$(printf '%s' "$LOCK_STATUS_EMPTY" | json_field hostId)" "$STORE_HOST_ID"
check "operator:empty-lock" "$(printf '%s' "$LOCK_STATUS_EMPTY" | json_field lock owner)" "missing"

INVITE_A_JSON="$(op_json "$STORE_SOURCE" issue --label "Qualify identity A" --ttl-seconds 3600)"
INVITE_B_JSON="$(op_json "$STORE_SOURCE" issue --label "Qualify identity B" --ttl-seconds 3600)"
INVITE_C_JSON="$(op_json "$STORE_SOURCE" issue --label "Qualify control C" --ttl-seconds 3600)"
TOKEN_A="$(printf '%s' "$INVITE_A_JSON" | json_field token)"
TOKEN_B="$(printf '%s' "$INVITE_B_JSON" | json_field token)"
TOKEN_C="$(printf '%s' "$INVITE_C_JSON" | json_field token)"
SUBJECT_A="$(printf '%s' "$INVITE_A_JSON" | json_field subjectId)"
SUBJECT_B="$(printf '%s' "$INVITE_B_JSON" | json_field subjectId)"
SUBJECT_C="$(printf '%s' "$INVITE_C_JSON" | json_field subjectId)"
[[ -n "$TOKEN_A" && -n "$TOKEN_B" && -n "$TOKEN_C" ]] || fail "operator did not return invite tokens"

exec_node "$CONTAINER" 'const fs=require("fs");const p="/data/builder/identity-store.json";const s=fs.statSync(p);if(s.uid!==1000||s.gid!==1000)throw Error(`store ownership ${s.uid}:${s.gid}`);if((s.mode&0o777)!==0o600)throw Error(`store mode ${(s.mode&0o777).toString(8)}`);const j=JSON.parse(fs.readFileSync(p,"utf8"));if(j.version!==1||!Array.isArray(j.usage)||j.subjects.length<3)throw Error("unexpected store shape")'
check "store:owned-0600" "true" "true"

note "Redeem three synthetic invites (A and B targets, C control)"
COOKIE_A="$(http_run "$CONTAINER" redeem "$TOKEN_A" --print-cookie)"
COOKIE_B="$(http_run "$CONTAINER" redeem "$TOKEN_B" --print-cookie)"
COOKIE_C="$(http_run "$CONTAINER" redeem "$TOKEN_C" --print-cookie)"
[[ -n "$COOKIE_A" && -n "$COOKIE_B" && -n "$COOKIE_C" ]] || fail "redeem did not return session cookies"
http_run "$CONTAINER" session "$COOKIE_A" --subject "$SUBJECT_A" >/dev/null
http_run "$CONTAINER" session "$COOKIE_B" --subject "$SUBJECT_B" >/dev/null
http_run "$CONTAINER" session "$COOKIE_C" --subject "$SUBJECT_C" >/dev/null

LIST_JSON="$(op_json "$STORE_SOURCE" list)"
SESSION_A="$(printf '%s' "$LIST_JSON" | find_session_id "$SUBJECT_A")"
SESSION_B="$(printf '%s' "$LIST_JSON" | find_session_id "$SUBJECT_B")"
SESSION_C="$(printf '%s' "$LIST_JSON" | find_session_id "$SUBJECT_C")"
[[ -n "$SESSION_A" && -n "$SESSION_B" && -n "$SESSION_C" ]] || fail "could not resolve synthetic session ids"

note "Revoke identity B and seed identity A's unresolved reservation"
op_json "$STORE_SOURCE" revoke-session --id "$SESSION_B" >/dev/null
READ_KEY="$("$NODE_BIN" -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SEED_JSON="$(seed_run "$STORE_SOURCE" reserve --store /data/builder --subject "$SUBJECT_A" --session "$SESSION_A" --request-key "$READ_KEY")"
USAGE_ID="$(printf '%s' "$SEED_JSON" | json_field id)"
check "seed:reserved" "$(printf '%s' "$SEED_JSON" | json_field state)" "reserved"
USAGE_BEFORE="$(op_json "$STORE_SOURCE" list | usage_key "$USAGE_ID")"
[[ "$USAGE_BEFORE" == reserved\|* ]] || fail "seeded usage record is not reserved: $USAGE_BEFORE"
STORE_HASH_BASELINE="$(store_hash "$STORE_SOURCE")"
[[ "$STORE_HASH_BASELINE" != "missing" ]] || fail "store hash is missing"

# ---------------------------------------------------------------------------
# Restart: a valid session, a revocation and an unresolved reservation retain
# their intended behavior. One replica only: the same container is restarted.
# ---------------------------------------------------------------------------
if [[ "$DIAGNOSTIC" == "1" ]]; then
  collect_connectivity "before-restart"
fi
note "Restart the same container and verify state"
"$ENGINE" restart "$CONTAINER" >/dev/null
wait_health "$CONTAINER"
if [[ "$BROWSER_PHASE" == "1" && "$QUALIFICATION_PATH" == "http-loopback" ]]; then
  start_host_proxy "$CONTAINER"
fi
if [[ "$DIAGNOSTIC" == "1" ]]; then
  collect_connectivity "after-restart"
fi
http_run "$CONTAINER" session "$COOKIE_A" --subject "$SUBJECT_A" >/dev/null
http_run "$CONTAINER" session "$COOKIE_B" --expect-status 401 >/dev/null
http_run "$CONTAINER" session "$COOKIE_C" --subject "$SUBJECT_C" >/dev/null
http_run "$CONTAINER" generate "$COOKIE_A" "$SUBJECT_A" "$("$NODE_BIN" -e 'process.stdout.write(require("node:crypto").randomUUID())')" --expect-status 429 --expect-code subject_concurrency >/dev/null
USAGE_AFTER_RESTART="$(op_json "$STORE_SOURCE" list | usage_key "$USAGE_ID")"
check "restart:usage-unchanged" "$USAGE_AFTER_RESTART" "$USAGE_BEFORE"
check "restart:store-unchanged" "$(store_hash "$STORE_SOURCE")" "$STORE_HASH_BASELINE"

if [[ "$DIAGNOSTIC" == "1" ]]; then
  for label in before-restart after-restart; do
    summary="$EVIDENCE_DIR/connectivity-$label.json"
    for key in inContainer hostTcp hostHttp; do
      value="$("$NODE_BIN" -e '
        const fs = require("node:fs");
        const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        process.stdout.write(value[process.argv[2]]?.ok ? "true" : "false");
      ' "$summary" "$key" 2>/dev/null || printf 'false')"
      record_result "connectivity:$label:$key" "$value" "true"
    done
  done
  flush_deferred_failures "connectivity"
  cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
diagnostic=true
self_test=false
engine=$ENGINE
source_sha=$SOURCE_SHA
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_mode=$IMAGE_MODE
image_id=$IMAGE_ID
run_id=$RUN_ID
image=$IMAGE
app_url=$APP_URL
application_origin=$APPLICATION_ORIGIN
browser_origin=$BROWSER_ORIGIN
qualification_path=$QUALIFICATION_PATH
effective_runtime_origin=$APPLICATION_ORIGIN
https_acceptance=${HTTPS_ACCEPTANCE:-false}
diagnostic_transport_origin=${HOST_PORT:+http://127.0.0.1:$HOST_PORT}
host_connection=loopback-proxy
proxy_target=$PROXY_TARGET
ingress_loopback_only=true
store_mode=$STORE_MODE
store_volume=$STORE_VOLUME
runtime_user=1000:1000
read_only_root=true
writable_paths=/data/builder,/tmp,/app/builder-runtime/.next/cache,/home/node
writable_owners=1000:1000
writable_modes=0700
writable_tmpfs_options=rw,noexec,nosuid,uid=1000,gid=1000,mode=0700
checks=$CHECK_COUNT
evidence_dir=$EVIDENCE_DIR
EOF
  note "PASS: before/after-restart host connectivity diagnostic"
  cat "$EVIDENCE_DIR/results.txt"
  exit 0
fi

# ---------------------------------------------------------------------------
# Browser phase. HTTPS runs against the private edge; the supported loopback
# diagnostic runs through the run-owned host proxy. The application origin is
# never replaced by the diagnostic transport.
# ---------------------------------------------------------------------------
FULL_ACCEPTANCE=false
HTTPS_ACCEPTANCE=false
if [[ "$BROWSER_PHASE" == "1" ]]; then
  note "Run the browser phase against $BROWSER_ORIGIN ($QUALIFICATION_PATH)"
  browser_env=(
    "BROWSER_BASE_URL=$BROWSER_ORIGIN"
    "BROWSER_EVIDENCE_DIR=$BROWSER_EVIDENCE_DIR"
    "BROWSER_OPERATOR_MODE=container"
    "BROWSER_PACKSHOT=$ROOT/public/campaign-assets/harbor-field-bottle.webp"
    "ENGINE=$ENGINE"
    "BUILDER_OPERATOR_IMAGE=$IMAGE"
    "BUILDER_RUNTIME_STORE_HOST_ID=${BROWSER_OPERATOR_STORE_HOST_ID:-$STORE_HOST_ID}"
  )
  if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
    browser_env+=(
      "BROWSER_ALLOW_REMOTE_ORIGIN=1"
      "BROWSER_REQUIRE_BASIC_AUTH=1"
      "BROWSER_BASIC_AUTH_USER=$BROWSER_BASIC_AUTH_USER"
      "BROWSER_BASIC_AUTH_PASSWORD=$BROWSER_BASIC_AUTH_PASSWORD"
    )
  fi
  if [[ -n "${BROWSER_OPERATOR_VOLUME:-}" ]]; then
    browser_env+=("BUILDER_OPERATOR_VOLUME=$BROWSER_OPERATOR_VOLUME")
  elif [[ -n "${BROWSER_OPERATOR_STORE:-}" ]]; then
    browser_env+=("BUILDER_OPERATOR_STORE=$BROWSER_OPERATOR_STORE")
  elif [[ "$STORE_MODE" == "volume" ]]; then
    browser_env+=("BUILDER_OPERATOR_VOLUME=$STORE_VOLUME")
  else
    browser_env+=("BUILDER_OPERATOR_STORE=$STORE_DIR")
  fi
  env "${browser_env[@]}" "$NODE_BIN" deploy/builder/qualify-browser.mjs
  check "browser:journey" "ok" "ok"
  FULL_ACCEPTANCE=true
  if [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
    HTTPS_ACCEPTANCE=true
  fi
  # The browser phase legitimately writes synthetic subjects, sessions and
  # usage. Capture the post-browser store for the backup/restore/lock checks;
  # the earlier restart hash remains the proof that the seeded state survived
  # the restart before the browser phase.
  STORE_HASH_BASELINE="$(store_hash "$STORE_SOURCE")"
  [[ "$STORE_HASH_BASELINE" != "missing" ]] || fail "post-browser store hash is missing"
else
  note "BROWSER_PHASE=0: browser journey skipped; this is partial evidence, not full acceptance"
fi

# ---------------------------------------------------------------------------
# Backup while stopped and restore into a fresh volume and fresh container.
# ---------------------------------------------------------------------------
note "Back up the stopped store and restore into a fresh container"
LIST_BEFORE_BACKUP="$(op_json "$STORE_SOURCE" list)"
printf '%s\n' "$LIST_BEFORE_BACKUP" > "$EVIDENCE_DIR/list-before-backup.json"
"$ENGINE" stop "$CONTAINER" >/dev/null
prepare_host_dir "$BACKUP_DIR/store"
copy_store_out "$STORE_SOURCE" "$BACKUP_DIR/store"
HASH_BACKUP="$(sha256_of "$BACKUP_DIR/store/identity-store.json")"
check "backup:hash" "$HASH_BACKUP" "$STORE_HASH_BASELINE"

# ---------------------------------------------------------------------------
# Minimise subject A in the stopped authoritative store. The backup above
# predates this effect, so the first restore below must replay the journal to
# deny A again. Usage rows and every other subject must remain unchanged.
# ---------------------------------------------------------------------------
note "Apply reviewed minimisation A to the stopped authoritative store"
PLAN_A_JSON="$(op_json "$STORE_SOURCE" minimize --subject "$SUBJECT_A")"
check "minimize:subject-a-plan" "$(printf '%s' "$PLAN_A_JSON" | json_field subjectId)" "$SUBJECT_A"
PLAN_A_RESULT_HASH="$(printf '%s' "$PLAN_A_JSON" | json_field expectedResultHash)"
MINIMIZE_A_JSON="$(op_json "$STORE_SOURCE" minimize-apply --plan "$PLAN_A_JSON" --confirm-subject "$SUBJECT_A")"
check "minimize:subject-a-status" "$(printf '%s' "$MINIMIZE_A_JSON" | json_field status)" "applied"
check "minimize:subject-a-input" "$(printf '%s' "$MINIMIZE_A_JSON" | json_field storeBeforeHash)" "$STORE_HASH_BASELINE"
STORE_HASH_MINIMIZED_A="$(store_hash "$STORE_SOURCE")"
check "minimize:subject-a-result" "$STORE_HASH_MINIMIZED_A" "$PLAN_A_RESULT_HASH"
USAGE_AFTER_MIN_A="$(op_json "$STORE_SOURCE" list | usage_key "$USAGE_ID")"
check "minimize:usage-unchanged" "$USAGE_AFTER_MIN_A" "$USAGE_BEFORE"
LIST_AFTER_MIN_A="$(op_json "$STORE_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_MIN_A" > "$EVIDENCE_DIR/list-authoritative-after-min-a.json"
copy_store_file_out "$STORE_SOURCE" "minimization-journal.json" "$BACKUP_DIR/journal-A.json"
[[ -f "$BACKUP_DIR/journal-A.json" ]] || fail "minimisation journal A was not captured"
JOURNAL_A_SHA="$(sha256_of "$BACKUP_DIR/journal-A.json")"
check "minimize:journal-events" "$(journal_event_count "$BACKUP_DIR/journal-A.json")" "1"

if [[ "$STORE_MODE" == "volume" ]]; then
  "$ENGINE" volume create \
    --label "org.ornigami.qualify.run=$RUN_ID" "$RESTORE_VOLUME" >/dev/null
  created_restore_volume=1
  RESTORE_SOURCE="$RESTORE_VOLUME"
else
  mkdir "$RESTORE_DIR"
  RESTORE_SOURCE="$RESTORE_DIR"
fi
initialize_store_root "$RESTORE_SOURCE"
copy_store_in "$BACKUP_DIR/store" "$RESTORE_SOURCE"
# The restored backup predates minimisation A. Supply the newer journal before
# the gate is opened so replay can prove the restored access denial.
copy_store_file_in "$BACKUP_DIR/journal-A.json" "$RESTORE_SOURCE" "minimization-journal.json"
check "restore:pre-replay-hash" "$(store_hash "$RESTORE_SOURCE")" "$STORE_HASH_BASELINE"

note "Prepare the first restore attempt; the gate must block reopening"
RESTORE_PREPARE_JSON="$(op_json "$RESTORE_SOURCE" restore-prepare --journal /data/builder/minimization-journal.json)"
check "restore:gate-prepared" "$(printf '%s' "$RESTORE_PREPARE_JSON" | json_field prepared)" "true"
check "restore:gate-attempt" "$(store_file_exists "$RESTORE_SOURCE" "restore-replay-gate.json" && printf 'present' || printf 'missing')" "present"
RESTORE_GATE_STATUS="$(operator_run "$RESTORE_SOURCE" replay-status --json 2>>"$OP_LOG" || true)"
check "restore:gate-blocks-reopen" "$(printf '%s' "$RESTORE_GATE_STATUS" | json_field replayReady)" "false"

note "Replay journal A into the older backup and verify restored access denial"
REPLAY_A_JSON="$(op_json "$RESTORE_SOURCE" replay-minimization --journal /data/builder/minimization-journal.json)"
check "restore:replay-status" "$(printf '%s' "$REPLAY_A_JSON" | json_field status)" "complete"
check "restore:replay-events" "$(printf '%s' "$REPLAY_A_JSON" | json_field journalEventCount)" "1"
check "restore:replay-applied-events" "$(printf '%s' "$REPLAY_A_JSON" | json_array_count appliedEventIds)" "1"
check "restore:replay-hash" "$(printf '%s' "$REPLAY_A_JSON" | json_field storeAfterHash)" "$STORE_HASH_MINIMIZED_A"
check "restore:gate-removed" "$(store_file_exists "$RESTORE_SOURCE" "restore-replay-gate.json" && printf 'present' || printf 'missing')" "missing"
RESTORE_REPLAY_READY="$(op_json "$RESTORE_SOURCE" replay-status)"
check "restore:replay-ready" "$(printf '%s' "$RESTORE_REPLAY_READY" | json_field replayReady)" "true"
REPLAY_A_RECEIPT_ID="$(printf '%s' "$REPLAY_A_JSON" | json_field receiptId)"
REPLAY_A_ATTEMPT_ID="$(printf '%s' "$REPLAY_A_JSON" | json_field attemptId)"
[[ -n "$REPLAY_A_RECEIPT_ID" && -n "$REPLAY_A_ATTEMPT_ID" ]] || fail "replay A did not return receipt and attempt ids"

created_restore_container=1
start_runtime "$RESTORE_CONTAINER" "$RESTORE_SOURCE" invite
wait_health "$RESTORE_CONTAINER"
http_run "$RESTORE_CONTAINER" session "$COOKIE_A" --expect-status 401 >/dev/null
http_run "$RESTORE_CONTAINER" session "$COOKIE_B" --expect-status 401 >/dev/null
http_run "$RESTORE_CONTAINER" session "$COOKIE_C" --subject "$SUBJECT_C" >/dev/null
check "restore:access-denied" "true" "true"
check "restore:control-access" "true" "true"
check "restore:root-owner" \
  "$(exec_node "$RESTORE_CONTAINER" 'const s=require("node:fs").statSync("/data/builder");process.stdout.write(`${s.uid}:${s.gid}`)')" "1000:1000"
check "restore:root-mode" \
  "$(exec_node "$RESTORE_CONTAINER" 'const s=require("node:fs").statSync("/data/builder");process.stdout.write((s.mode&0o777).toString(8))')" "700"
check "restore:store-owner" \
  "$(exec_node "$RESTORE_CONTAINER" 'const s=require("node:fs").statSync("/data/builder/identity-store.json");process.stdout.write(`${s.uid}:${s.gid}`)')" "1000:1000"
check "restore:store-mode" \
  "$(exec_node "$RESTORE_CONTAINER" 'const s=require("node:fs").statSync("/data/builder/identity-store.json");process.stdout.write((s.mode&0o777).toString(8))')" "600"
USAGE_AFTER_RESTORE="$(op_json "$RESTORE_SOURCE" list | usage_key "$USAGE_ID")"
check "restore:usage-unchanged" "$USAGE_AFTER_RESTORE" "$USAGE_BEFORE"
LIST_AFTER_RESTORE="$(op_json "$RESTORE_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_RESTORE" > "$EVIDENCE_DIR/list-after-restore.json"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const pick = (value) => ({ subjects: value.subjects, sessions: value.sessions, usage: value.usage });
  if (JSON.stringify(pick(before)) !== JSON.stringify(pick(after))) process.exit(1);
' "$EVIDENCE_DIR/list-authoritative-after-min-a.json" "$EVIDENCE_DIR/list-after-restore.json"
check "restore:records-match-minimized-source" "true" "true"

# ---------------------------------------------------------------------------
# Second restore cycle. Snapshot the first restored store before minimising B,
# grow the journal to A+B, restore the older snapshot and replay the newer
# journal. Receipt A must remain historical while only B is applied.
# ---------------------------------------------------------------------------
note "Snapshot the first restore, minimise B, and replay A+B into a second restore"
"$ENGINE" stop "$RESTORE_CONTAINER" >/dev/null
prepare_host_dir "$BACKUP2_DIR/store"
copy_store_out "$RESTORE_SOURCE" "$BACKUP2_DIR/store"
HASH_BACKUP2="$(sha256_of "$BACKUP2_DIR/store/identity-store.json")"
check "second-restore:backup-hash" "$HASH_BACKUP2" "$STORE_HASH_MINIMIZED_A"
PLAN_B_JSON="$(op_json "$RESTORE_SOURCE" minimize --subject "$SUBJECT_B")"
PLAN_B_RESULT_HASH="$(printf '%s' "$PLAN_B_JSON" | json_field expectedResultHash)"
MINIMIZE_B_JSON="$(op_json "$RESTORE_SOURCE" minimize-apply --plan "$PLAN_B_JSON" --confirm-subject "$SUBJECT_B")"
check "second-restore:minimize-status" "$(printf '%s' "$MINIMIZE_B_JSON" | json_field status)" "applied"
STORE_HASH_MINIMIZED_AB="$(store_hash "$RESTORE_SOURCE")"
check "second-restore:minimize-result" "$STORE_HASH_MINIMIZED_AB" "$PLAN_B_RESULT_HASH"
USAGE_AFTER_MIN_B="$(op_json "$RESTORE_SOURCE" list | usage_key "$USAGE_ID")"
check "second-restore:usage-unchanged" "$USAGE_AFTER_MIN_B" "$USAGE_BEFORE"
LIST_AFTER_MIN_B="$(op_json "$RESTORE_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_MIN_B" > "$EVIDENCE_DIR/list-authoritative-after-min-b.json"
copy_store_file_out "$RESTORE_SOURCE" "minimization-journal.json" "$BACKUP2_DIR/journal-AB.json"
JOURNAL_AB_SHA="$(sha256_of "$BACKUP2_DIR/journal-AB.json")"
check "second-restore:journal-events" "$(journal_event_count "$BACKUP2_DIR/journal-AB.json")" "2"

if [[ "$STORE_MODE" == "volume" ]]; then
  "$ENGINE" volume create \
    --label "org.ornigami.qualify.run=$RUN_ID" "$RESTORE2_VOLUME" >/dev/null
  created_restore2_volume=1
  RESTORE2_SOURCE="$RESTORE2_VOLUME"
else
  mkdir "$RESTORE2_DIR"
  RESTORE2_SOURCE="$RESTORE2_DIR"
fi
initialize_store_root "$RESTORE2_SOURCE"
# Replace the snapshot's older journal A with the newer A+B journal. The
# identity-store bytes still predate B, which is the state replay must fix.
cp "$BACKUP2_DIR/journal-AB.json" "$BACKUP2_DIR/store/minimization-journal.json"
copy_store_in "$BACKUP2_DIR/store" "$RESTORE2_SOURCE"
check "second-restore:pre-replay-hash" "$(store_hash "$RESTORE2_SOURCE")" "$STORE_HASH_MINIMIZED_A"

note "Prepare and replay the second restore cycle"
RESTORE2_PREPARE_JSON="$(op_json "$RESTORE2_SOURCE" restore-prepare --journal /data/builder/minimization-journal.json)"
check "second-restore:gate-prepared" "$(printf '%s' "$RESTORE2_PREPARE_JSON" | json_field prepared)" "true"
RESTORE2_GATE_STATUS="$(operator_run "$RESTORE2_SOURCE" replay-status --json 2>>"$OP_LOG" || true)"
check "second-restore:gate-blocks-reopen" "$(printf '%s' "$RESTORE2_GATE_STATUS" | json_field replayReady)" "false"

# Negative same-image/changed-intent attempt: the attempt was prepared with
# journal A+B, so replay must reject a different journal hash/evidence rather
# than silently rebinding. The gate, store and control subject stay intact.
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const journal = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(journal.events) || journal.events.length !== 2) {
    throw new Error("expected the A+B journal");
  }
  journal.events[0].effectAt = "2030-01-01T00:00:00.000Z";
  fs.writeFileSync(process.argv[2], `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
' "$BACKUP2_DIR/journal-AB.json" "$BACKUP2_DIR/journal-changed-intent.json"
copy_store_file_in "$BACKUP2_DIR/journal-changed-intent.json" "$RESTORE2_SOURCE" "minimization-journal.json"
set +e
operator_run "$RESTORE2_SOURCE" replay-minimization --journal /data/builder/minimization-journal.json --json >/dev/null 2>>"$OP_LOG"
CHANGED_INTENT_RC=$?
set -e
[[ "$CHANGED_INTENT_RC" -ne 0 ]] || fail "changed-intent replay was accepted"
check "second-restore:changed-intent-rejected" "true" "true"
check "second-restore:changed-intent-store-unchanged" "$(store_hash "$RESTORE2_SOURCE")" "$STORE_HASH_MINIMIZED_A"
check "second-restore:changed-intent-gate-preserved" "$(store_file_exists "$RESTORE2_SOURCE" "restore-replay-gate.json" && printf 'present' || printf 'missing')" "present"
RESTORE2_CHANGED_STATUS="$(operator_run "$RESTORE2_SOURCE" replay-status --json 2>>"$OP_LOG" || true)"
check "second-restore:changed-intent-blocks-reopen" "$(printf '%s' "$RESTORE2_CHANGED_STATUS" | json_field replayReady)" "false"
LIST_AFTER_CHANGED_INTENT="$(op_json "$RESTORE2_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_CHANGED_INTENT" > "$EVIDENCE_DIR/list-after-changed-intent.json"
CONTROL_AFTER_CHANGED_INTENT="$("$NODE_BIN" -e '
  const fs = require("node:fs");
  const [file, subjectId, sessionId] = process.argv.slice(1);
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const subject = state.subjects.find((item) => item.id === subjectId);
  const session = state.sessions.find((item) => item.id === sessionId);
  process.stdout.write(
    subject && !subject.revokedAt && session && !session.revokedAt ? "true" : "false",
  );
' "$EVIDENCE_DIR/list-after-changed-intent.json" "$SUBJECT_C" "$SESSION_C")"
check "second-restore:control-access-preserved" "$CONTROL_AFTER_CHANGED_INTENT" "true"
check "second-restore:control-usage-preserved" "$(op_json "$RESTORE2_SOURCE" list | usage_key "$USAGE_ID")" "$USAGE_BEFORE"

# Restore the exact prepared journal and complete the same attempt.
copy_store_file_in "$BACKUP2_DIR/journal-AB.json" "$RESTORE2_SOURCE" "minimization-journal.json"
REPLAY_AB_JSON="$(op_json "$RESTORE2_SOURCE" replay-minimization --journal /data/builder/minimization-journal.json)"
check "second-restore:replay-status" "$(printf '%s' "$REPLAY_AB_JSON" | json_field status)" "complete"
check "second-restore:replay-events" "$(printf '%s' "$REPLAY_AB_JSON" | json_field journalEventCount)" "2"
check "second-restore:replay-applied-events" "$(printf '%s' "$REPLAY_AB_JSON" | json_array_count appliedEventIds)" "1"
check "second-restore:replay-history-events" "$(printf '%s' "$REPLAY_AB_JSON" | json_array_count alreadyAppliedEventIds)" "1"
check "second-restore:previous-receipt" "$(printf '%s' "$REPLAY_AB_JSON" | json_field previousReceiptIds 0)" "$REPLAY_A_RECEIPT_ID"
check "second-restore:receipt-a-preserved" "$(store_file_exists "$RESTORE2_SOURCE" "restore-replay-receipt.${REPLAY_A_ATTEMPT_ID}.json" && printf 'present' || printf 'missing')" "present"
check "second-restore:replay-hash" "$(printf '%s' "$REPLAY_AB_JSON" | json_field storeAfterHash)" "$STORE_HASH_MINIMIZED_AB"
check "second-restore:gate-removed" "$(store_file_exists "$RESTORE2_SOURCE" "restore-replay-gate.json" && printf 'present' || printf 'missing')" "missing"
RESTORE2_REPLAY_READY="$(op_json "$RESTORE2_SOURCE" replay-status)"
check "second-restore:replay-ready" "$(printf '%s' "$RESTORE2_REPLAY_READY" | json_field replayReady)" "true"

created_restore2_container=1
start_runtime "$RESTORE2_CONTAINER" "$RESTORE2_SOURCE" invite
wait_health "$RESTORE2_CONTAINER"
http_run "$RESTORE2_CONTAINER" session "$COOKIE_A" --expect-status 401 >/dev/null
http_run "$RESTORE2_CONTAINER" session "$COOKIE_B" --expect-status 401 >/dev/null
http_run "$RESTORE2_CONTAINER" session "$COOKIE_C" --subject "$SUBJECT_C" >/dev/null
check "second-restore:access-denied" "true" "true"
check "second-restore:control-access" "true" "true"
USAGE_AFTER_RESTORE2="$(op_json "$RESTORE2_SOURCE" list | usage_key "$USAGE_ID")"
check "second-restore:usage-unchanged-after-replay" "$USAGE_AFTER_RESTORE2" "$USAGE_BEFORE"
LIST_AFTER_RESTORE2="$(op_json "$RESTORE2_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_RESTORE2" > "$EVIDENCE_DIR/list-after-restore2.json"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const pick = (value) => ({ subjects: value.subjects, sessions: value.sessions, usage: value.usage });
  if (JSON.stringify(pick(before)) !== JSON.stringify(pick(after))) process.exit(1);
' "$EVIDENCE_DIR/list-authoritative-after-min-b.json" "$EVIDENCE_DIR/list-after-restore2.json"
check "second-restore:records-match-minimized-source" "true" "true"

# ---------------------------------------------------------------------------
# Safe operator lock recovery on the restore copy (never the authoritative
# store). The stale lock simulates a replaced container with a foreign host id.
# ---------------------------------------------------------------------------
note "Exercise safe lock recovery on the second restore copy"
"$ENGINE" stop "$RESTORE2_CONTAINER" >/dev/null
LOCK_SOURCE="$RESTORE2_SOURCE"
STALE_JSON="$(seed_run "$LOCK_SOURCE" stale-lock --store /data/builder --token "qualify-stale-lock" --scope "replaced-container-pid-namespace")"
STALE_TOKEN="$(printf '%s' "$STALE_JSON" | json_field token)"
LOCK_STATUS="$(op_json "$LOCK_SOURCE" lock-status)"
check "lock:foreign-scope" "$(printf '%s' "$LOCK_STATUS" | json_field lock owner)" "foreign_scope"
check "lock:scope" "$(printf '%s' "$LOCK_STATUS" | json_field lock metadata scope)" "replaced-container-pid-namespace"
check "lock:token" "$(printf '%s' "$LOCK_STATUS" | json_field lock metadata token)" "$STALE_TOKEN"
REAP_TOKEN="$(printf '%s' "$LOCK_STATUS" | json_field reapLock metadata token)"
if operator_run "$LOCK_SOURCE" recover-lock --token "$STALE_TOKEN" --json >/dev/null 2>&1; then
  fail "recover-lock accepted recovery without --confirm-no-writers"
fi
if operator_run "$LOCK_SOURCE" recover-lock --token "wrong-token" --confirm-no-writers --json >/dev/null 2>&1; then
  fail "recover-lock accepted a token that did not match the observed lock"
fi
RECOVER_ARGS=(--token "$STALE_TOKEN" --confirm-no-writers)
if [[ -n "$REAP_TOKEN" ]]; then
  RECOVER_ARGS+=(--reap-token "$REAP_TOKEN")
fi
RECOVER_JSON="$(op_json "$LOCK_SOURCE" recover-lock "${RECOVER_ARGS[@]}")"
check_contains "lock:recovered" "$(printf '%s' "$RECOVER_JSON" | json_field recovered)" "identity-store.lock"
check "lock:store-unchanged" "$(printf '%s' "$RECOVER_JSON" | json_field storeUnchanged)" "true"
check "lock:hash" "$(printf '%s' "$RECOVER_JSON" | json_field storeHash)" "$STORE_HASH_MINIMIZED_AB"
op_json "$LOCK_SOURCE" list >/dev/null
check "lock:store-readable" "$(op_json "$LOCK_SOURCE" list | json_field usage 0 id)" "$USAGE_ID"

# ---------------------------------------------------------------------------
# Same-image closed rollback on the authoritative volume. Records survive.
# ---------------------------------------------------------------------------
note "Stop the fresh restores and start the same image in closed mode"
"$ENGINE" stop "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
"$ENGINE" stop "$RESTORE2_CONTAINER" >/dev/null 2>&1 || true
"$ENGINE" stop "$CONTAINER" >/dev/null 2>&1 || true
LIST_BEFORE_CLOSED="$(op_json "$STORE_SOURCE" list)"
HASH_BEFORE_CLOSED="$(store_hash "$STORE_SOURCE")"
printf '%s\n' "$LIST_BEFORE_CLOSED" > "$EVIDENCE_DIR/list-before-closed.json"

created_closed_container=1
start_runtime "$CLOSED_CONTAINER" "$STORE_SOURCE" closed
wait_health "$CLOSED_CONTAINER"
http_run "$CLOSED_CONTAINER" smoke --mode closed >/dev/null
check "http:smoke:closed" "ok" "ok"
check "closed:smoke" "ok" "ok"
check "closed:store-unchanged" "$(store_hash "$STORE_SOURCE")" "$HASH_BEFORE_CLOSED"
LIST_AFTER_CLOSED="$(op_json "$STORE_SOURCE" list)"
printf '%s\n' "$LIST_AFTER_CLOSED" > "$EVIDENCE_DIR/list-after-closed.json"
"$NODE_BIN" -e '
  const fs = require("node:fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const pick = (value) => ({ subjects: value.subjects, sessions: value.sessions, usage: value.usage });
  if (JSON.stringify(pick(before)) !== JSON.stringify(pick(after))) process.exit(1);
' "$EVIDENCE_DIR/list-before-closed.json" "$EVIDENCE_DIR/list-after-closed.json"
check "closed:records-preserved" "true" "true"

"$ENGINE" stop "$CLOSED_CONTAINER" >/dev/null
prepare_host_dir "$STORE_EXPORT_DIR"
copy_store_out "$STORE_SOURCE" "$STORE_EXPORT_DIR"
check "export:hash" "$(sha256_of "$STORE_EXPORT_DIR/identity-store.json")" "$HASH_BEFORE_CLOSED"

cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
self_test=false
engine=$ENGINE
source_sha=$SOURCE_SHA
application_source_sha=$SOURCE_SHA
harness_sha=$HARNESS_SHA
image_mode=$IMAGE_MODE
image_id=$IMAGE_ID
run_id=$RUN_ID
image=$IMAGE
app_url=$APP_URL
application_origin=$APPLICATION_ORIGIN
browser_origin=$BROWSER_ORIGIN
qualification_path=$QUALIFICATION_PATH
effective_runtime_origin=$APPLICATION_ORIGIN
https_acceptance=${HTTPS_ACCEPTANCE:-false}
diagnostic_transport_origin=${HOST_PORT:+http://127.0.0.1:$HOST_PORT}
store_mode=$STORE_MODE
store_host_id=$STORE_HOST_ID
store_volume=$STORE_VOLUME
restore_source=$RESTORE_SOURCE
restore2_source=$RESTORE2_SOURCE
runtime_user=1000:1000
read_only_root=true
writable_paths=/data/builder,/tmp,/app/builder-runtime/.next/cache,/home/node
writable_owners=1000:1000
writable_modes=0700
writable_tmpfs_options=rw,noexec,nosuid,uid=1000,gid=1000,mode=0700
store_sha256=$STORE_HASH_BASELINE
backup_sha256=$HASH_BACKUP
restart_preserved_store=true
fresh_container_restore=true
restore_root_owner=1000:1000
restore_root_mode=0700
restore_store_owner=1000:1000
restore_store_mode=0600
restore_records_preserved=true
restore_records_match_minimized_source=true
minimization_applied=true
minimization_journal_events=2
minimization_journal_sha256=$JOURNAL_AB_SHA
minimized_store_sha256=$STORE_HASH_MINIMIZED_AB
restore_gate_blocked_reopen=true
restore_replay_completed=true
restore_replay_ready=true
restored_access_denied=true
first_restore_journal_sha256=$JOURNAL_A_SHA
first_restore_replay_events=1
second_restore_cycle=true
second_restore_backup_sha256=$HASH_BACKUP2
second_restore_applied_events=1
second_restore_replayed_events=2
second_restore_receipt_history_preserved=true
same_id_changed_intent_replay_blocked=true
changed_intent_gate_preserved=true
control_subject_access=true
session_valid_after_restart=true
session_revoked_after_restart=true
unresolved_reservation_after_restart=true
lock_recovery=true
egress_blocked=true
closed_rollback_preserved_store=true
closed_records_preserved=true
single_replica=true
browser_phase=$BROWSER_PHASE
host_connection=$([[ "$QUALIFICATION_PATH" == "https-edge" ]] && printf 'external-private-edge' || printf 'loopback-proxy')
proxy_target=${PROXY_TARGET:-none}
browser_loopback_proxy=${HOST_PORT:-none}
browser_journey=$([[ "$BROWSER_PHASE" == "1" ]] && printf 'true' || printf 'skipped')
full_acceptance=$FULL_ACCEPTANCE
https_acceptance=$HTTPS_ACCEPTANCE
acceptance_scope=$(
  if [[ "$FULL_ACCEPTANCE" != "true" ]]; then
    printf 'partial'
  elif [[ "$QUALIFICATION_PATH" == "https-edge" ]]; then
    printf 'full-https-private-edge'
  else
    printf 'diagnostic-http-loopback'
  fi
)
checks=$CHECK_COUNT
evidence_dir=$EVIDENCE_DIR
EOF

note "PASS: builder Linux packaging qualification"
cat "$EVIDENCE_DIR/results.txt"
