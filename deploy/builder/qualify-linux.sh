#!/usr/bin/env bash
# Builder-only Linux packaging qualification.
#
# This script is intentionally packaging/runtime scoped. Application behavior
# (invite/session/budget journeys) belongs to Sessions 1 and 2.
#
# Final qualification MUST run from a clean checkout of the merged candidate:
#   SOURCE_SHA="$(git rev-parse HEAD)" ./deploy/builder/qualify-linux.sh
#
# If neither Docker nor Podman is installed, the script prints the reproducible
# command plan and exits 2 with Linux execution marked pending.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:-$(git rev-parse HEAD)}"
APP_URL="${APP_URL:-http://127.0.0.1:3100}"
IMAGE="${IMAGE:-ornigami-builder:local}"
CONTAINER="${CONTAINER:-ornigami-builder-qualify}"
RESTORE_CONTAINER="${CONTAINER}-restore"
CLOSED_CONTAINER="${CONTAINER}-closed"
NETWORK="${NETWORK:-ornigami-builder-qualify-internal}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/.local/builder-linux-qualification}"
STORE_DIR="${STORE_DIR:-$EVIDENCE_DIR/store}"
BACKUP_DIR="${BACKUP_DIR:-$EVIDENCE_DIR/backup}"
RESTORE_DIR="${RESTORE_DIR:-$EVIDENCE_DIR/restore}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

ENGINE="${ENGINE:-}"
if [[ -z "$ENGINE" ]]; then
  for candidate in docker podman; do
    if command -v "$candidate" >/dev/null 2>&1; then ENGINE="$candidate"; break; fi
  done
fi

print_plan() {
  cat <<EOF
Linux execution pending: no Docker or Podman engine is available.

Reproducible command plan (run on an authorized Linux runner):

  cd "$ROOT"
  SOURCE_SHA="\$(git rev-parse HEAD)"
  APP_URL="http://127.0.0.1:3100"
  docker build -f deploy/builder/Dockerfile \\
    --platform linux/amd64 \\
    --build-arg NEXT_PUBLIC_APP_URL="\$APP_URL" \\
    --build-arg ORNIGAMI_SOURCE_SHA="\$SOURCE_SHA" \\
    -t ornigami-builder:local .

  docker network create --internal ornigami-builder-qualify-internal
  mkdir -p .local/builder-linux-qualification/store
  chown 1000:1000 .local/builder-linux-qualification/store
  docker run -d --name ornigami-builder-qualify \\
    --read-only \\
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \\
    --tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m \\
    --tmpfs /home/node:rw,noexec,nosuid,size=16m \\
    --mount type=bind,src="\$PWD/.local/builder-linux-qualification/store",dst=/data/builder \\
    --network ornigami-builder-qualify-internal \\
    --user 1000:1000 \\
    -e BUILDER_RUNTIME_MODE=invite \\
    -e BUILDER_RUNTIME_STORE_DIR=/data/builder \\
    -e BUILDER_RUNTIME_SESSION_TTL_SECONDS=3600 \\
    -e NEXT_PUBLIC_APP_URL="\$APP_URL" \\
    ornigami-builder:local

  # Then run this script with ENGINE=docker to execute the full assertion set.
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

note "Engine: $ENGINE"
note "Source SHA: $SOURCE_SHA"
note "Image: $IMAGE"
note "Evidence: $EVIDENCE_DIR"

rm -rf "$EVIDENCE_DIR"
mkdir -p "$STORE_DIR" "$BACKUP_DIR/store" "$RESTORE_DIR"

# The runtime is UID/GID 1000. A bind-mounted store must be writable by it.
if [[ "$(id -u)" -eq 0 ]]; then
  chown -R 1000:1000 "$STORE_DIR" "$RESTORE_DIR"
elif [[ "$(id -u)" -ne 1000 ]]; then
  fail "Run as root or UID 1000, or use a named volume on the authorized runner"
fi

note "Build image"
"$ENGINE" build --platform linux/amd64 \
  -f deploy/builder/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  --build-arg ORNIGAMI_SOURCE_SHA="$SOURCE_SHA" \
  -t "$IMAGE" "$ROOT"

REVISION="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")"
SINGLE_REPLICA="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.ornigami.single-replica" }}' "$IMAGE")"
IMAGE_USER="$("$ENGINE" image inspect --format '{{.Config.User}}' "$IMAGE")"
HEALTH_CMD="$("$ENGINE" image inspect --format '{{json .Config.Healthcheck}}' "$IMAGE")"
[[ "$REVISION" == "$SOURCE_SHA" ]] || fail "image revision label mismatch: $REVISION"
[[ "$SINGLE_REPLICA" == "true" ]] || fail "image must be labelled single-replica=true"
[[ "$IMAGE_USER" == "1000:1000" ]] || fail "image runtime user must be 1000:1000, got $IMAGE_USER"
[[ "$HEALTH_CMD" == *"127.0.0.1:3000"* ]] || fail "builder health check is missing"

cleanup_container() {
  local name="$1"
  "$ENGINE" rm -f "$name" >/dev/null 2>&1 || true
}
cleanup() {
  cleanup_container "$CONTAINER"
  cleanup_container "$RESTORE_CONTAINER"
  cleanup_container "$CLOSED_CONTAINER"
  "$ENGINE" network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup_container "$CONTAINER"
cleanup_container "$RESTORE_CONTAINER"
cleanup_container "$CLOSED_CONTAINER"
"$ENGINE" network rm "$NETWORK" >/dev/null 2>&1 || true
"$ENGINE" network create --internal "$NETWORK" >/dev/null

start_runtime() {
  local name="$1" store="$2" mode="$3"
  "$ENGINE" run -d --name "$name" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --tmpfs /app/builder-runtime/.next/cache:rw,noexec,nosuid,size=64m \
    --tmpfs /home/node:rw,noexec,nosuid,size=16m \
    --mount type=bind,src="$store",dst=/data/builder \
    --network "$NETWORK" \
    --user 1000:1000 \
    -e NODE_ENV=production \
    -e BUILDER_RUNTIME_MODE="$mode" \
    -e BUILDER_RUNTIME_STORE_DIR=/data/builder \
    -e BUILDER_RUNTIME_SESSION_TTL_SECONDS=3600 \
    -e NEXT_PUBLIC_APP_URL="$APP_URL" \
    "$IMAGE" >/dev/null
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
  local name="$1"; shift
  "$ENGINE" exec "$name" /nodejs/bin/node -e "$*"
}

http_status() {
  local name="$1" url="$2"
  exec_node "$name" "fetch('$url',{redirect:'manual',signal:AbortSignal.timeout(3000)}).then(async r=>{await r.body?.cancel();process.stdout.write(String(r.status))}).catch(e=>{console.error(e);process.exit(1)})"
}

note "Start invite runtime with read-only root"
start_runtime "$CONTAINER" "$STORE_DIR" invite
wait_health "$CONTAINER"

[[ "$("$ENGINE" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$CONTAINER")" == "true" ]] || fail "container root is not read-only"
[[ "$(exec_node "$CONTAINER" 'process.stdout.write(`${process.getuid()}:${process.getgid()}`)')" == "1000:1000" ]] || fail "runtime is not UID/GID 1000"
[[ "$(http_status "$CONTAINER" http://127.0.0.1:3000/)" == "200" ]] || fail "builder home is not 200"
[[ "$(http_status "$CONTAINER" http://127.0.0.1:3000/builder)" == "404" ]] || fail "anonymous /builder is not 404"
[[ "$(http_status "$CONTAINER" http://127.0.0.1:3000/api/builder/session)" == "401" ]] || fail "anonymous session is not 401"

note "Verify only the declared writable paths are needed"
exec_node "$CONTAINER" 'const fs=require("fs");try{fs.writeFileSync("/app/forbidden","x");process.exit(1)}catch(e){if(e.code!=="EROFS")throw e}'
exec_node "$CONTAINER" 'const fs=require("fs");for(const p of ["/data/builder/.probe","/tmp/.probe","/app/builder-runtime/.next/cache/.probe","/home/node/.probe"]){fs.writeFileSync(p,"ok");fs.unlinkSync(p)}'
exec_node "$CONTAINER" 'const fs=require("fs");const p="/data/builder/identity-store.json";const s=fs.statSync(p);if(s.uid!==1000||s.gid!==1000)throw Error(`store ownership ${s.uid}:${s.gid}`);if((s.mode&0o777)!==0o600)throw Error(`store mode ${(s.mode&0o777).toString(8)}`);const j=JSON.parse(fs.readFileSync(p,"utf8"));if(j.version!==1||!Array.isArray(j.usage))throw Error("unexpected store shape")'

note "Verify no external egress"
exec_node "$CONTAINER" 'fetch("https://example.com",{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(1)).catch(()=>process.exit(0))' || fail "runtime reached the public network"

if "$ENGINE" inspect --format '{{json .Config.Env}}' "$CONTAINER" | grep -E 'DATABASE_URL|OPENAI|STRIPE|RESEND|SENTRY|GOOGLE_CLIENT|AUTH_SECRET' >/dev/null; then
  fail "forbidden provider/database/billing/mail/Sentry configuration is present"
fi

STORE_HASH_BEFORE="$(sha256sum "$STORE_DIR/identity-store.json" | awk '{print $1}')"
note "Restart and verify store durability"
"$ENGINE" restart "$CONTAINER" >/dev/null
wait_health "$CONTAINER"
[[ "$(http_status "$CONTAINER" http://127.0.0.1:3000/)" == "200" ]] || fail "builder home is not 200 after restart"
STORE_HASH_AFTER="$(sha256sum "$STORE_DIR/identity-store.json" | awk '{print $1}')"
[[ "$STORE_HASH_BEFORE" == "$STORE_HASH_AFTER" ]] || fail "store changed across a no-write restart"

note "Back up stopped store and restore into a fresh container"
"$ENGINE" stop "$CONTAINER" >/dev/null
cp -a "$STORE_DIR/." "$BACKUP_DIR/store/"
[[ -f "$BACKUP_DIR/store/identity-store.json" ]] || fail "backup did not contain identity-store.json"
cp -a "$BACKUP_DIR/store/." "$RESTORE_DIR/"
if [[ "$(id -u)" -eq 0 ]]; then chown -R 1000:1000 "$RESTORE_DIR"; fi
STORE_HASH_BACKUP="$(sha256sum "$BACKUP_DIR/store/identity-store.json" | awk '{print $1}')"
STORE_HASH_RESTORE="$(sha256sum "$RESTORE_DIR/identity-store.json" | awk '{print $1}')"
[[ "$STORE_HASH_BACKUP" == "$STORE_HASH_RESTORE" ]] || fail "restored store hash mismatch"

start_runtime "$RESTORE_CONTAINER" "$RESTORE_DIR" invite
wait_health "$RESTORE_CONTAINER"
[[ "$(http_status "$RESTORE_CONTAINER" http://127.0.0.1:3000/)" == "200" ]] || fail "restored builder home is not 200"
[[ "$(http_status "$RESTORE_CONTAINER" http://127.0.0.1:3000/api/builder/session)" == "401" ]] || fail "restored anonymous session is not 401"
exec_node "$RESTORE_CONTAINER" 'const fs=require("fs");const s=fs.statSync("/data/builder/identity-store.json");if(s.uid!==1000||s.gid!==1000)throw Error("restored store ownership drift")'

note "Demonstrate stop-or-close rollback preserving the same store"
"$ENGINE" stop "$RESTORE_CONTAINER" >/dev/null
"$ENGINE" stop "$CONTAINER" >/dev/null 2>&1 || true
start_runtime "$CLOSED_CONTAINER" "$STORE_DIR" closed
wait_health "$CLOSED_CONTAINER"
[[ "$(http_status "$CLOSED_CONTAINER" http://127.0.0.1:3000/)" == "200" ]] || fail "closed builder home is not 200"
[[ "$(http_status "$CLOSED_CONTAINER" http://127.0.0.1:3000/builder)" == "404" ]] || fail "closed /builder is not 404"
[[ "$(http_status "$CLOSED_CONTAINER" http://127.0.0.1:3000/api/builder/session)" == "401" ]] || fail "closed session is not 401"
STORE_HASH_CLOSED="$(sha256sum "$STORE_DIR/identity-store.json" | awk '{print $1}')"
[[ "$STORE_HASH_BEFORE" == "$STORE_HASH_CLOSED" ]] || fail "closed rollback changed the usage/identity store"

cat > "$EVIDENCE_DIR/results.txt" <<EOF
ok=true
engine=$ENGINE
source_sha=$SOURCE_SHA
image=$IMAGE
app_url=$APP_URL
runtime_user=1000:1000
read_only_root=true
writable_paths=/data/builder,/tmp,/app/builder-runtime/.next/cache,/home/node
store_sha256=$STORE_HASH_BEFORE
backup_sha256=$STORE_HASH_BACKUP
restart_preserved_store=true
fresh_container_restore=true
egress_blocked=true
closed_rollback_preserved_store=true
single_replica=true
EOF

note "PASS: builder Linux packaging qualification"
cat "$EVIDENCE_DIR/results.txt"
