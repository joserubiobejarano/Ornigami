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

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse HEAD)}"
APP_URL_EXPLICIT="${APP_URL:+1}"
APP_URL="${APP_URL:-http://127.0.0.1:3100}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
QUALIFY_SELF_TEST="${QUALIFY_SELF_TEST:-0}"
KEEP_ON_FAILURE="${KEEP_ON_FAILURE:-1}"
KEEP_VOLUMES="${KEEP_VOLUMES:-1}"
REMOVE_IMAGE="${REMOVE_IMAGE:-0}"
STORE_MODE="${STORE_MODE:-volume}"
STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:-${STORE_HOST_ID:-ornigami-builder-store}}"
NODE_BIN="${NODE_BIN:-node}"
BROWSER_PHASE="${BROWSER_PHASE:-1}"
HOST_PORT=""

RUN_ID="${RUN_ID:-${SOURCE_SHA:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM:-0}}"
EVIDENCE_ROOT="${EVIDENCE_ROOT:-$ROOT/.local/builder-linux-qualification}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$EVIDENCE_ROOT/runs/$RUN_ID}"
BACKUP_DIR="${BACKUP_DIR:-$EVIDENCE_DIR/backup}"
RESTORE_DIR="${RESTORE_DIR:-$EVIDENCE_DIR/restore}"
STORE_EXPORT_DIR="${STORE_EXPORT_DIR:-$EVIDENCE_DIR/store-export}"
BROWSER_EVIDENCE_DIR="${BROWSER_EVIDENCE_DIR:-$EVIDENCE_DIR/browser}"
IMAGE="${IMAGE:-ornigami-builder:qualify-$RUN_ID}"
CONTAINER="${CONTAINER:-ornigami-builder-qualify-$RUN_ID}"
RESTORE_CONTAINER="${RESTORE_CONTAINER:-$CONTAINER-restore}"
CLOSED_CONTAINER="${CLOSED_CONTAINER:-$CONTAINER-closed}"
NETWORK="${NETWORK:-ornigami-builder-qualify-net-$RUN_ID}"
STORE_VOLUME="${STORE_VOLUME:-ornigami-builder-store-$RUN_ID}"
RESTORE_VOLUME="${RESTORE_VOLUME:-ornigami-builder-restore-$RUN_ID}"
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
RESTORE_DIR="$(abspath "$RESTORE_DIR")"
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
if [[ "$(git rev-parse HEAD)" != "$SOURCE_SHA" ]]; then
  fail "SOURCE_SHA does not match HEAD; final qualification must use the merged candidate"
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
if [[ "$QUALIFY_SELF_TEST" != "1" && "$(id -u)" -ne 0 && "$(id -u)" -ne 1000 ]]; then
  fail "Run as root or UID 1000 so the UID 1000 container can write the backup/evidence helpers"
fi
if ! "$ENGINE" info >/dev/null 2>&1; then
  fail "$ENGINE is present but its daemon is not usable"
fi
if [[ "$BROWSER_PHASE" != "0" && "$BROWSER_PHASE" != "1" ]]; then
  fail "BROWSER_PHASE must be 0 or 1"
fi

# The browser phase needs an exact loopback origin and a published loopback
# port. The container itself stays on the internal no-egress network; only
# ingress from the host loopback is added.
if [[ "$BROWSER_PHASE" == "1" ]]; then
  if [[ -n "$APP_URL_EXPLICIT" ]]; then
    HOST_PORT="$("$NODE_BIN" -e 'const u=new URL(process.argv[1]);process.stdout.write(u.port)' "$APP_URL")"
    [[ -n "$HOST_PORT" ]] \
      || fail "BROWSER_PHASE requires an explicit loopback port in APP_URL"
  else
    HOST_PORT="$("$NODE_BIN" -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
    APP_URL="http://127.0.0.1:$HOST_PORT"
  fi
  APP_URL_PROTOCOL="$("$NODE_BIN" -e 'process.stdout.write(new URL(process.argv[1]).protocol)' "$APP_URL")"
  APP_URL_HOST="$("$NODE_BIN" -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$APP_URL")"
  [[ "$APP_URL_PROTOCOL" == "http:" ]] \
    || fail "BROWSER_PHASE requires APP_URL=http://127.0.0.1:<port>"
  [[ "$APP_URL_HOST" == "127.0.0.1" ]] \
    || fail "BROWSER_PHASE requires a 127.0.0.1 APP_URL (set BROWSER_PHASE=0 for a non-browser smoke)"
  [[ "$HOST_PORT" =~ ^[0-9]+$ && "$HOST_PORT" -ge 1 && "$HOST_PORT" -le 65535 ]] \
    || fail "APP_URL must include a valid loopback port"
fi

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
require_absent_path "RESTORE_DIR" "$RESTORE_DIR"
require_absent_path "STORE_EXPORT_DIR" "$STORE_EXPORT_DIR"
require_absent_path "BROWSER_EVIDENCE_DIR" "$BROWSER_EVIDENCE_DIR"
require_absent_image
require_absent_container "$CONTAINER"
require_absent_container "$RESTORE_CONTAINER"
require_absent_container "$CLOSED_CONTAINER"
require_absent_network
require_absent_volume "$STORE_VOLUME"
if [[ "$STORE_MODE" == "volume" ]]; then
  require_absent_volume "$RESTORE_VOLUME"
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

created_container=0
created_restore_container=0
created_closed_container=0
created_network=0
created_store_volume=0
created_restore_volume=0
created_image=0

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
  if [[ "$status" -ne 0 && "$KEEP_ON_FAILURE" == "1" ]]; then
    stop_owned_container "$CONTAINER" "$created_container"
    stop_owned_container "$RESTORE_CONTAINER" "$created_restore_container"
    stop_owned_container "$CLOSED_CONTAINER" "$created_closed_container"
    note "Failure: retained this run's containers/network/volumes for inspection."
    note "Evidence: $EVIDENCE_DIR"
    exit "$status"
  fi
  remove_container "$CONTAINER" "$created_container"
  remove_container "$RESTORE_CONTAINER" "$created_restore_container"
  remove_container "$CLOSED_CONTAINER" "$created_closed_container"
  remove_network
  if [[ "$KEEP_VOLUMES" != "1" ]]; then
    remove_volume "$STORE_VOLUME" "$created_store_volume"
    remove_volume "$RESTORE_VOLUME" "$created_restore_volume"
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
    "$ENGINE" volume create \
      --label "org.ornigami.qualify.run=$RUN_ID" "$STORE_VOLUME" >/dev/null
    created_store_volume=1
    STORE_SOURCE="$STORE_VOLUME"
  else
    mkdir "$STORE_DIR"
    STORE_SOURCE="$STORE_DIR"
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
source_sha=$SOURCE_SHA
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
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m \
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
    --tmpfs /tmp:rw,noexec,nosuid,size=16m \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m \
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

http_run() {
  local name="$1"
  shift
  "$ENGINE" exec "$name" /nodejs/bin/node \
    /app/qualify/qualify-http.mjs "$@" 2>>"$HTTP_LOG"
}

start_runtime() {
  local name="$1" source="$2" mode="$3" publish="${4:-0}"
  local publish_args=()
  if [[ "$publish" == "1" ]]; then
    publish_args=(-p "127.0.0.1:$HOST_PORT:3000")
  fi
  build_store_mount_args "$source" \
    || fail "runtime mount construction failed for $source"
  "$ENGINE" run -d --name "$name" \
    --label "org.ornigami.qualify.run=$RUN_ID" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m \
    "${STORE_MOUNT_ARGS[@]}" \
    --mount "type=bind,src=$ROOT/deploy/builder,dst=/app/qualify,readonly" \
    --network "$NETWORK" \
    "${publish_args[@]}" \
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

# ---------------------------------------------------------------------------
# Build and image contract.
# ---------------------------------------------------------------------------
note "Build image"
"$ENGINE" build --platform linux/amd64 \
  --label "org.ornigami.qualify.run=$RUN_ID" \
  --label "org.ornigami.qualify.source-sha=$SOURCE_SHA" \
  -f deploy/builder/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  --build-arg ORNIGAMI_SOURCE_SHA="$SOURCE_SHA" \
  -t "$IMAGE" "$ROOT"
created_image=1

REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
SINGLE_REPLICA="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.single-replica" }}' "$IMAGE")"
IMAGE_USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE")"
HEALTH_CMD="$("$ENGINE" image inspect --format '{{json .Config.Healthcheck}}' "$IMAGE")"
OPERATOR_CLI="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.operator-cli" }}' "$IMAGE")"
RUN_LABEL="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.qualify.run" }}' "$IMAGE")"
check "image:revision" "$REVISION" "$SOURCE_SHA"
check "image:single-replica" "$SINGLE_REPLICA" "true"
check "image:user" "$IMAGE_USER" "1000:1000"
check_contains "image:health" "$HEALTH_CMD" "127.0.0.1:3000"
check "image:operator-cli" "$OPERATOR_CLI" "/app/scripts/builder-invite-operator.mjs"
check "image:run-label" "$RUN_LABEL" "$RUN_ID"

# ---------------------------------------------------------------------------
# Create run-scoped network and persistent volume.
# ---------------------------------------------------------------------------
note "Create internal network and persistent store volume"
"$ENGINE" network create --internal \
  --label "org.ornigami.qualify.run=$RUN_ID" "$NETWORK" >/dev/null
created_network=1
if [[ "$STORE_MODE" == "bind" ]]; then
  mkdir "$STORE_DIR"
  if [[ "$(id -u)" -eq 0 ]]; then chown -R 1000:1000 "$STORE_DIR"; fi
  STORE_SOURCE="$STORE_DIR"
else
  "$ENGINE" volume create \
    --label "org.ornigami.qualify.run=$RUN_ID" "$STORE_VOLUME" >/dev/null
  created_store_volume=1
  STORE_SOURCE="$STORE_VOLUME"
fi

# ---------------------------------------------------------------------------
# Invite runtime with read-only root, UID 1000 and the persistent volume.
# ---------------------------------------------------------------------------
note "Start invite runtime with read-only root"
RUNTIME_PUBLISH=0
if [[ "$BROWSER_PHASE" == "1" ]]; then RUNTIME_PUBLISH=1; fi
created_container=1
start_runtime "$CONTAINER" "$STORE_SOURCE" invite "$RUNTIME_PUBLISH"
wait_health "$CONTAINER"
check "runtime:read-only-root" \
  "$("$ENGINE" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$CONTAINER")" "true"
check "runtime:user" \
  "$(exec_node "$CONTAINER" 'process.stdout.write(`${process.getuid()}:${process.getgid()}`)')" "1000:1000"
http_run "$CONTAINER" smoke --mode invite >/dev/null
check "http:smoke:invite" "ok" "ok"

exec_node "$CONTAINER" 'const fs=require("fs");try{fs.writeFileSync("/app/forbidden","x");process.exit(1)}catch(e){if(e.code!=="EROFS")throw e}'
exec_node "$CONTAINER" 'const fs=require("fs");for(const p of ["/data/builder/.probe","/tmp/.probe","/app/builder-runtime/.next/cache/.probe","/home/node/.probe"]){fs.writeFileSync(p,"ok");fs.unlinkSync(p)}'
# The store is created by the first operator write; its owner/mode is checked
# after the synthetic invites below.

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
TOKEN_A="$(printf '%s' "$INVITE_A_JSON" | json_field token)"
TOKEN_B="$(printf '%s' "$INVITE_B_JSON" | json_field token)"
SUBJECT_A="$(printf '%s' "$INVITE_A_JSON" | json_field subjectId)"
SUBJECT_B="$(printf '%s' "$INVITE_B_JSON" | json_field subjectId)"
[[ -n "$TOKEN_A" && -n "$TOKEN_B" ]] || fail "operator did not return invite tokens"

exec_node "$CONTAINER" 'const fs=require("fs");const p="/data/builder/identity-store.json";const s=fs.statSync(p);if(s.uid!==1000||s.gid!==1000)throw Error(`store ownership ${s.uid}:${s.gid}`);if((s.mode&0o777)!==0o600)throw Error(`store mode ${(s.mode&0o777).toString(8)}`);const j=JSON.parse(fs.readFileSync(p,"utf8"));if(j.version!==1||!Array.isArray(j.usage)||j.subjects.length<2)throw Error("unexpected store shape")'
check "store:owned-0600" "true" "true"

note "Redeem two synthetic invites"
COOKIE_A="$(http_run "$CONTAINER" redeem "$TOKEN_A" --print-cookie)"
COOKIE_B="$(http_run "$CONTAINER" redeem "$TOKEN_B" --print-cookie)"
[[ -n "$COOKIE_A" && -n "$COOKIE_B" ]] || fail "redeem did not return session cookies"
http_run "$CONTAINER" session "$COOKIE_A" --subject "$SUBJECT_A" >/dev/null
http_run "$CONTAINER" session "$COOKIE_B" --subject "$SUBJECT_B" >/dev/null

LIST_JSON="$(op_json "$STORE_SOURCE" list)"
SESSION_A="$(printf '%s' "$LIST_JSON" | find_session_id "$SUBJECT_A")"
SESSION_B="$(printf '%s' "$LIST_JSON" | find_session_id "$SUBJECT_B")"
[[ -n "$SESSION_A" && -n "$SESSION_B" ]] || fail "could not resolve synthetic session ids"

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
note "Restart the same container and verify state"
"$ENGINE" restart "$CONTAINER" >/dev/null
wait_health "$CONTAINER"
http_run "$CONTAINER" session "$COOKIE_A" --subject "$SUBJECT_A" >/dev/null
http_run "$CONTAINER" session "$COOKIE_B" --expect-status 401 >/dev/null
http_run "$CONTAINER" generate "$COOKIE_A" "$SUBJECT_A" "$("$NODE_BIN" -e 'process.stdout.write(require("node:crypto").randomUUID())')" --expect-status 429 --expect-code subject_concurrency >/dev/null
USAGE_AFTER_RESTART="$(op_json "$STORE_SOURCE" list | usage_key "$USAGE_ID")"
check "restart:usage-unchanged" "$USAGE_AFTER_RESTART" "$USAGE_BEFORE"
check "restart:store-unchanged" "$(store_hash "$STORE_SOURCE")" "$STORE_HASH_BASELINE"

# ---------------------------------------------------------------------------
# Browser phase against the built container through the loopback-only test
# origin. The container remains on the internal default-deny network; the
# published port is host-loopback ingress only. Test hooks and the live
# provider stay disabled. The operator revokes synthetic subject A while its
# workspace is open, then signs out synthetic subject B.
# ---------------------------------------------------------------------------
if [[ "$BROWSER_PHASE" == "1" ]]; then
  note "Run the browser phase against $APP_URL"
  browser_env=(
    "BROWSER_BASE_URL=$APP_URL"
    "BROWSER_EVIDENCE_DIR=$BROWSER_EVIDENCE_DIR"
    "BROWSER_OPERATOR_MODE=container"
    "BROWSER_PACKSHOT=$ROOT/public/campaign-assets/harbor-field-bottle.webp"
    "ENGINE=$ENGINE"
    "BUILDER_OPERATOR_IMAGE=$IMAGE"
    "BUILDER_RUNTIME_STORE_HOST_ID=$STORE_HOST_ID"
  )
  if [[ "$STORE_MODE" == "volume" ]]; then
    browser_env+=("BUILDER_OPERATOR_VOLUME=$STORE_VOLUME")
  else
    browser_env+=("BUILDER_OPERATOR_STORE=$STORE_DIR")
  fi
  env "${browser_env[@]}" "$NODE_BIN" deploy/builder/qualify-browser.mjs
  check "browser:journey" "ok" "ok"
  # The browser phase legitimately writes synthetic subjects, sessions and
  # usage. Capture the post-browser store for the backup/restore/lock checks;
  # the earlier restart hash remains the proof that the seeded state survived
  # the restart before the browser phase.
  STORE_HASH_BASELINE="$(store_hash "$STORE_SOURCE")"
  [[ "$STORE_HASH_BASELINE" != "missing" ]] || fail "post-browser store hash is missing"
else
  note "BROWSER_PHASE=0: browser journey skipped"
fi

# ---------------------------------------------------------------------------
# Backup while stopped and restore into a fresh volume and fresh container.
# ---------------------------------------------------------------------------
note "Back up the stopped store and restore into a fresh container"
"$ENGINE" stop "$CONTAINER" >/dev/null
prepare_host_dir "$BACKUP_DIR/store"
copy_store_out "$STORE_SOURCE" "$BACKUP_DIR/store"
HASH_BACKUP="$(sha256_of "$BACKUP_DIR/store/identity-store.json")"
check "backup:hash" "$HASH_BACKUP" "$STORE_HASH_BASELINE"

if [[ "$STORE_MODE" == "volume" ]]; then
  "$ENGINE" volume create \
    --label "org.ornigami.qualify.run=$RUN_ID" "$RESTORE_VOLUME" >/dev/null
  created_restore_volume=1
  RESTORE_SOURCE="$RESTORE_VOLUME"
else
  RESTORE_SOURCE="$RESTORE_DIR"
fi
copy_store_in "$BACKUP_DIR/store" "$RESTORE_SOURCE"
check "restore:hash" "$(store_hash "$RESTORE_SOURCE")" "$STORE_HASH_BASELINE"

created_restore_container=1
start_runtime "$RESTORE_CONTAINER" "$RESTORE_SOURCE" invite
wait_health "$RESTORE_CONTAINER"
http_run "$RESTORE_CONTAINER" session "$COOKIE_A" --subject "$SUBJECT_A" >/dev/null
http_run "$RESTORE_CONTAINER" session "$COOKIE_B" --expect-status 401 >/dev/null
http_run "$RESTORE_CONTAINER" generate "$COOKIE_A" "$SUBJECT_A" "$("$NODE_BIN" -e 'process.stdout.write(require("node:crypto").randomUUID())')" --expect-status 429 --expect-code subject_concurrency >/dev/null
exec_node "$RESTORE_CONTAINER" 'const fs=require("fs");const s=fs.statSync("/data/builder/identity-store.json");if(s.uid!==1000||s.gid!==1000)throw Error("restored store ownership drift")'
USAGE_AFTER_RESTORE="$(op_json "$RESTORE_SOURCE" list | usage_key "$USAGE_ID")"
check "restore:usage-unchanged" "$USAGE_AFTER_RESTORE" "$USAGE_BEFORE"

# ---------------------------------------------------------------------------
# Safe operator lock recovery on the restore copy (never the authoritative
# store). The stale lock simulates a replaced container with a foreign host id.
# ---------------------------------------------------------------------------
note "Exercise safe lock recovery on the restore copy"
"$ENGINE" stop "$RESTORE_CONTAINER" >/dev/null
STALE_JSON="$(seed_run "$RESTORE_SOURCE" stale-lock --store /data/builder --token "qualify-stale-lock" --scope "replaced-container-pid-namespace")"
STALE_TOKEN="$(printf '%s' "$STALE_JSON" | json_field token)"
LOCK_STATUS="$(op_json "$RESTORE_SOURCE" lock-status)"
check "lock:foreign-scope" "$(printf '%s' "$LOCK_STATUS" | json_field lock owner)" "foreign_scope"
check "lock:scope" "$(printf '%s' "$LOCK_STATUS" | json_field lock metadata scope)" "replaced-container-pid-namespace"
check "lock:token" "$(printf '%s' "$LOCK_STATUS" | json_field lock metadata token)" "$STALE_TOKEN"
REAP_TOKEN="$(printf '%s' "$LOCK_STATUS" | json_field reapLock metadata token)"
if operator_run "$RESTORE_SOURCE" recover-lock --token "$STALE_TOKEN" --json >/dev/null 2>&1; then
  fail "recover-lock accepted recovery without --confirm-no-writers"
fi
if operator_run "$RESTORE_SOURCE" recover-lock --token "wrong-token" --confirm-no-writers --json >/dev/null 2>&1; then
  fail "recover-lock accepted a token that did not match the observed lock"
fi
RECOVER_ARGS=(--token "$STALE_TOKEN" --confirm-no-writers)
if [[ -n "$REAP_TOKEN" ]]; then
  RECOVER_ARGS+=(--reap-token "$REAP_TOKEN")
fi
RECOVER_JSON="$(op_json "$RESTORE_SOURCE" recover-lock "${RECOVER_ARGS[@]}")"
check_contains "lock:recovered" "$(printf '%s' "$RECOVER_JSON" | json_field recovered)" "identity-store.lock"
check "lock:store-unchanged" "$(printf '%s' "$RECOVER_JSON" | json_field storeUnchanged)" "true"
check "lock:hash" "$(printf '%s' "$RECOVER_JSON" | json_field storeHash)" "$STORE_HASH_BASELINE"
op_json "$RESTORE_SOURCE" list >/dev/null
check "lock:store-readable" "$(op_json "$RESTORE_SOURCE" list | json_field usage 0 id)" "$USAGE_ID"

# ---------------------------------------------------------------------------
# Same-image closed rollback on the authoritative volume. Records survive.
# ---------------------------------------------------------------------------
note "Stop the fresh restore and start the same image in closed mode"
"$ENGINE" stop "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
"$ENGINE" stop "$CONTAINER" >/dev/null 2>&1 || true
LIST_BEFORE_CLOSED="$(op_json "$STORE_SOURCE" list)"
HASH_BEFORE_CLOSED="$(store_hash "$STORE_SOURCE")"
printf '%s\n' "$LIST_BEFORE_CLOSED" > "$EVIDENCE_DIR/list-before-closed.json"

created_closed_container=1
start_runtime "$CLOSED_CONTAINER" "$STORE_SOURCE" closed
wait_health "$CLOSED_CONTAINER"
http_run "$CLOSED_CONTAINER" smoke --mode closed >/dev/null
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
run_id=$RUN_ID
image=$IMAGE
app_url=$APP_URL
store_mode=$STORE_MODE
store_host_id=$STORE_HOST_ID
store_volume=$STORE_VOLUME
restore_source=$RESTORE_SOURCE
runtime_user=1000:1000
read_only_root=true
writable_paths=/data/builder,/tmp,/app/builder-runtime/.next/cache,/home/node
store_sha256=$STORE_HASH_BASELINE
backup_sha256=$HASH_BACKUP
restart_preserved_store=true
fresh_container_restore=true
session_valid_after_restart=true
session_revoked_after_restart=true
unresolved_reservation_after_restart=true
lock_recovery=true
egress_blocked=true
closed_rollback_preserved_store=true
closed_records_preserved=true
single_replica=true
browser_phase=$BROWSER_PHASE
browser_origin=$APP_URL
browser_loopback_publish=${HOST_PORT:-none}
browser_journey=$([[ "$BROWSER_PHASE" == "1" ]] && printf 'true' || printf 'skipped')
checks=$CHECK_COUNT
evidence_dir=$EVIDENCE_DIR
EOF

note "PASS: builder Linux packaging qualification"
cat "$EVIDENCE_DIR/results.txt"
