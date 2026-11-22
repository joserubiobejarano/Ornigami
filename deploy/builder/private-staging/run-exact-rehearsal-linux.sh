#!/usr/bin/env bash
# Run one exact-candidate synthetic Linux rehearsal.
#
# This wrapper is intentionally outside the application source it tests. It
# consumes the frozen candidate at SOURCE_SHA and the candidate's own
# ACTION=checkpoint|qualify interface. It never modifies the candidate tree.
#
# Required external authority: runner/daemon execution, temporary private-HTTPS
# edge, and artifact custody. No registry publication, public DNS, deployment,
# real invitation, customer data or paid provider call is performed.
set -Eeuo pipefail

SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
HARNESS_SHA="${HARNESS_SHA:?HARNESS_SHA is required}"
WORKFLOW_SHA="${WORKFLOW_SHA:?WORKFLOW_SHA is required}"
REHEARSAL_DIR="${REHEARSAL_DIR:?REHEARSAL_DIR is required}"
EVIDENCE_ROOT="${EVIDENCE_ROOT:?EVIDENCE_ROOT is required}"
EXPORT_STAGING="${EXPORT_STAGING:?EXPORT_STAGING is required}"
STAGING_ORIGIN="${STAGING_ORIGIN:?STAGING_ORIGIN is required}"
STAGING_HOST="${STAGING_HOST:?STAGING_HOST is required}"
CADDY_IMAGE="${CADDY_IMAGE:?CADDY_IMAGE is required}"
BUILD_ENDPOINT="${BUILD_ENDPOINT:?BUILD_ENDPOINT is required}"
BUILD_CONTEXT="${BUILD_CONTEXT:-default}"
VERIFY_ENGINE="${VERIFY_ENGINE:-docker}"
VERIFY_CONTEXT="${VERIFY_CONTEXT:-default}"
PHASE_ENGINE="${PHASE_ENGINE:-$VERIFY_ENGINE}"
PHASE_CONTEXT="${PHASE_CONTEXT:-$VERIFY_CONTEXT}"
STAGING_BASIC_AUTH_USER="${STAGING_BASIC_AUTH_USER:-staging-operator}"
BUILDER_STORE_VOLUME="${BUILDER_STORE_VOLUME:?BUILDER_STORE_VOLUME is required}"
BUILDER_RUNTIME_STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:-ornigami-builder-store-v1}"
BROWSER_PLAYWRIGHT="${BROWSER_PLAYWRIGHT:-}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-}"
NPM_CLI_FOR_REHEARSAL="${NPM_CLI_FOR_REHEARSAL:?NPM_CLI_FOR_REHEARSAL is required}"
BUILDER_USER="${BUILDER_USER:-$(id -un)}"
DOCKER_HOST_ENDPOINT="${DOCKER_HOST_ENDPOINT:-unix:///var/run/docker.sock}"
BUILD_DAEMON_READINESS_SECONDS="${BUILD_DAEMON_READINESS_SECONDS:-420}"
HOST_DAEMON_READINESS_SECONDS="${HOST_DAEMON_READINESS_SECONDS:-20}"
DAEMON_PROBE_TIMEOUT_SECONDS="${DAEMON_PROBE_TIMEOUT_SECONDS:-20}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${PROJECT:-ornigami-builder-rehearsal-${SOURCE_SHA:0:12}}"
IMAGE_DIR="$REHEARSAL_DIR/image"
STAGING_DIR="$REHEARSAL_DIR/edge"
LOG_DIR="$EVIDENCE_ROOT/logs"
CUSTODY_DIR="$EVIDENCE_ROOT/custody"
# ACTION=checkpoint owns creation of REHEARSAL_DIR; only its parent exists here.
mkdir -p "$(dirname "$REHEARSAL_DIR")" "$LOG_DIR" "$EVIDENCE_ROOT/checkpoint" "$EVIDENCE_ROOT/edge" "$CUSTODY_DIR"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

assert_loopback_tcp() {
  local port="$1" label="$2" listeners address
  listeners="$(ss -ltn "sport = :$port" 2>/dev/null | awk 'NR > 1 { print $4 }')"
  [[ -n "$listeners" ]] || fail "$label has no listener on port $port"
  while IFS= read -r address; do
    [[ -n "$address" ]] || continue
    case "$address" in
      "127.0.0.1:$port"|"[::1]:$port") ;;
      *) fail "$label is not loopback-only: $address" ;;
    esac
  done <<< "$listeners"
}
read_field() {
  local file="$1" key="$2"
  node -e '
    const fs=require("node:fs");
    const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    let current=value;
    for (const part of process.argv[2].split(".")) current=current?.[part];
    process.stdout.write(current === undefined || current === null ? "" : String(current));
  ' "$file" "$key"
}

cd "$SOURCE_ROOT"
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail "source HEAD mismatch"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || fail "source tree is dirty"
[[ "$HARNESS_SHA" == "$SOURCE_SHA" ]] || fail "harness SHA must equal the candidate SHA"
node -e 'const [a,b]=process.argv.slice(1);const p=require("node:path");process.exit(p.resolve(a)===p.resolve(b)?0:1)' \
  "$SOURCE_ROOT" "$PWD" || fail "SOURCE_ROOT is not the current directory"

BASIC_PASSWORD=""
BASIC_HASH=""
CLEANUP_FAILURES=0

export_approved_evidence() {
  local stage="$EXPORT_STAGING" file directory
  [[ -d "$stage" ]] || { echo "FAIL: approved export staging is missing: $stage" >&2; return 1; }
  mkdir -p "$stage/logs" "$stage/checkpoint" "$stage/edge" "$stage/custody"
  if [[ -d "$EVIDENCE_ROOT/logs" ]]; then cp -R "$EVIDENCE_ROOT/logs/." "$stage/logs/"; fi
  if [[ -d "$EVIDENCE_ROOT/checkpoint" ]]; then cp -R "$EVIDENCE_ROOT/checkpoint/." "$stage/checkpoint/"; fi
  if [[ -d "$EVIDENCE_ROOT/edge" ]]; then cp -R "$EVIDENCE_ROOT/edge/." "$stage/edge/"; fi
  if [[ -d "$EVIDENCE_ROOT/custody" ]]; then cp -R "$EVIDENCE_ROOT/custody/." "$stage/custody/"; fi
  for file in host.txt daemons.txt package-lock.json access-closed.txt cleanup-receipt.txt; do
    if [[ -f "$EVIDENCE_ROOT/$file" ]]; then cp "$EVIDENCE_ROOT/$file" "$stage/$file"; fi
  done
  if [[ -d "$REHEARSAL_DIR" ]]; then
    for file in checkpoint.json CHECKPOINT_READY.txt rehearsal-identities.json REHEARSAL_COMPLETE.txt; do
      if [[ -f "$REHEARSAL_DIR/$file" ]]; then cp "$REHEARSAL_DIR/$file" "$stage/$file"; fi
    done
    for directory in "$REHEARSAL_DIR"/qualification-attempt-*; do
      [[ -d "$directory" ]] && cp -R "$directory" "$stage/"
    done
  fi
  # Preserve the built archive and its receipt even when qualification fails
  # after the checkpoint. This makes a failed full rehearsal reviewable without
  # a second run; the staging budget still enforces the archive/artifact caps.
  if [[ -f "$IMAGE_DIR/archive-receipt.json" ]]; then
    mkdir -p "$stage/custody"
    cp "$IMAGE_DIR/archive-receipt.json" "$stage/custody/archive-receipt.json"
  fi
  if [[ -f "$IMAGE_DIR/image-identity.json" ]]; then
    mkdir -p "$stage/custody"
    cp "$IMAGE_DIR/image-identity.json" "$stage/custody/image-identity.json"
  fi
  if [[ -n "${ARCHIVE_PATH:-}" && -f "$ARCHIVE_PATH" && ! -f "$stage/custody/$(basename "$ARCHIVE_PATH")" ]]; then
    mkdir -p "$stage/custody"
    cp "$ARCHIVE_PATH" "$stage/custody/$(basename "$ARCHIVE_PATH")"
  fi
  find "$stage" -mindepth 1 -type d -exec chmod 0750 {} +
  find "$stage" -type f -exec chmod 0640 {} +
}

cleanup() {
  local status=$? compose_status=0 ownership_status=0 ca_status=0
  local origin_unreachable=0 http_listener_absent=0 https_listener_absent=0
  set +e
  if [[ -f "$STAGING_DIR/compose.yml" ]]; then
    env BUILDER_IMAGE="${IMAGE_ID:-unavailable}" CADDY_IMAGE="$CADDY_IMAGE" \
      STAGING_ORIGIN="$STAGING_ORIGIN" STAGING_HOST="$STAGING_HOST" \
      ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
      STAGING_BASIC_AUTH_HASH="${BASIC_HASH:-}" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
      docker compose -p "$PROJECT" --project-directory "$STAGING_DIR" -f "$STAGING_DIR/compose.yml" \
      logs --no-color > "$LOG_DIR/compose-final.log" 2>&1 || true
    env BUILDER_IMAGE="${IMAGE_ID:-unavailable}" CADDY_IMAGE="$CADDY_IMAGE" \
      STAGING_ORIGIN="$STAGING_ORIGIN" STAGING_HOST="$STAGING_HOST" \
      ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
      STAGING_BASIC_AUTH_HASH="${BASIC_HASH:-}" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
      docker compose -p "$PROJECT" --project-directory "$STAGING_DIR" -f "$STAGING_DIR/compose.yml" \
      down -v --remove-orphans > "$LOG_DIR/compose-down.log" 2>&1
    compose_status=$?
  fi
  DOCKER_BIN=docker PROJECT="$PROJECT" EVIDENCE_DIR="$EVIDENCE_ROOT" \
    bash "$SCRIPT_DIR/cleanup-owned-resources.sh" > "$LOG_DIR/cleanup-owned-resources.log" 2>&1
  ownership_status=$?
  if [[ "$compose_status" -ne 0 ]]; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: compose down exited $compose_status" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  if [[ "$ownership_status" -ne 0 ]]; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
  fi

  # Prove the private origin is closed and both published listeners are gone.
  # Use --resolve so DNS/hosts removal cannot mask a still-running listener.
  # Container teardown can release the proxy socket a moment after `compose
  # down`; allow a short bounded wait, then record the final observation.
  for _ in {1..10}; do
    if curl -ksS --max-time 5 --resolve "$STAGING_HOST:443:127.0.0.1" \
      -o /dev/null "https://$STAGING_HOST/" 2>/dev/null; then
      origin_unreachable=0
    else
      origin_unreachable=1
    fi
    if [[ -z "$(ss -ltn "sport = :80" 2>/dev/null | awk 'NR > 1')" ]]; then
      http_listener_absent=1
    else
      http_listener_absent=0
    fi
    if [[ -z "$(ss -ltn "sport = :443" 2>/dev/null | awk 'NR > 1')" ]]; then
      https_listener_absent=1
    else
      https_listener_absent=0
    fi
    [[ "$origin_unreachable" == "1" && "$http_listener_absent" == "1" && "$https_listener_absent" == "1" ]] && break
    sleep 1
  done
  [[ "$origin_unreachable" == "1" ]] || {
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: private origin still answered after cleanup: $STAGING_ORIGIN" >> "$LOG_DIR/cleanup-owned-resources.log"
  }
  [[ "$http_listener_absent" == "1" ]] || {
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: port 80 still has a listener after cleanup" >> "$LOG_DIR/cleanup-owned-resources.log"
  }
  [[ "$https_listener_absent" == "1" ]] || {
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: port 443 still has a listener after cleanup" >> "$LOG_DIR/cleanup-owned-resources.log"
  }

  if grep -q "[[:space:]]$STAGING_HOST\$" /etc/hosts 2>/dev/null; then
    sudo sed -i "\\|[[:space:]]$STAGING_HOST\$|d" /etc/hosts
  fi
  if grep -q "[[:space:]]$STAGING_HOST\$" /etc/hosts 2>/dev/null; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: host mapping remains: $STAGING_HOST" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  sudo rm -f /usr/local/share/ca-certificates/ornigami-builder-rehearsal-ca.crt
  sudo update-ca-certificates >/dev/null 2>&1
  ca_status=$?
  if [[ "$ca_status" -ne 0 || -e /usr/local/share/ca-certificates/ornigami-builder-rehearsal-ca.crt ]]; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: private CA removal/trust update incomplete" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  rm -f "$EVIDENCE_ROOT/secrets/basic-password" "$EVIDENCE_ROOT/secrets/basic-hash"
  {
    printf 'primary_exit=%s\n' "$status"
    printf 'cleanup_failures=%s\n' "$CLEANUP_FAILURES"
    printf 'compose_down_exit=%s\n' "$compose_status"
    printf 'owned_resource_cleanup_exit=%s\n' "$ownership_status"
    printf 'ca_cleanup_exit=%s\n' "$ca_status"
    printf 'origin_unreachable=%s\n' "$origin_unreachable"
    printf 'http_listener_absent=%s\n' "$http_listener_absent"
    printf 'https_listener_absent=%s\n' "$https_listener_absent"
    if [[ -f "$EVIDENCE_ROOT/cleanup-receipt.txt" ]]; then
      cat "$EVIDENCE_ROOT/cleanup-receipt.txt"
    fi
  } > "$EVIDENCE_ROOT/access-closed.txt"
  cp "$EVIDENCE_ROOT/access-closed.txt" "$CUSTODY_DIR/access-closed.txt" 2>/dev/null || true
  if ! export_approved_evidence; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: approved evidence export failed" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  write_final_status() {
    bash "$SCRIPT_DIR/finalize-rehearsal-status.sh" "$status" "$CLEANUP_FAILURES" \
      > "$EVIDENCE_ROOT/final-status.txt" 2>&1
    cp "$EVIDENCE_ROOT/final-status.txt" "$CUSTODY_DIR/final-status.txt" 2>/dev/null || return 1
    if [[ -d "$EXPORT_STAGING" ]]; then
      cp "$EVIDENCE_ROOT/final-status.txt" "$EXPORT_STAGING/final-status.txt" 2>/dev/null || return 1
      chmod 0640 "$EXPORT_STAGING/final-status.txt" 2>/dev/null || return 1
    fi
    return 0
  }
  if ! write_final_status; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    write_final_status || true
  fi
  bash "$SCRIPT_DIR/finalize-rehearsal-status.sh" "$status" "$CLEANUP_FAILURES" >/dev/null
  local final=$?
  cat "$EVIDENCE_ROOT/final-status.txt"
  exit "$final"
}
trap cleanup EXIT

note "Record source, runner and daemon identities"
mkdir -p "$EVIDENCE_ROOT/secrets"
chmod 700 "$EVIDENCE_ROOT/secrets"
{
  printf 'source_sha=%s\n' "$SOURCE_SHA"
  printf 'harness_sha=%s\n' "$HARNESS_SHA"
  printf 'workflow_sha=%s\n' "$WORKFLOW_SHA"
  printf 'origin=%s\n' "$STAGING_ORIGIN"
  printf 'host=%s\n' "$STAGING_HOST"
  printf 'runner=%s\n' "$(uname -srm)"
  printf 'os=%s\n' "$(. /etc/os-release; echo "${PRETTY_NAME:-unknown}")"
  printf 'node=%s\n' "$(node --version)"
  printf 'openssl=%s\n' "$(node -p 'process.versions.openssl')"
  printf 'npm=%s\n' "$(node "$NPM_CLI_FOR_REHEARSAL" --version 2>/dev/null || npm --version)"
  printf 'docker_client=%s\n' "$(docker --version)"
  printf 'host_docker_server=%s\n' "$(docker version --format '{{.Server.Version}}')"
} > "$EVIDENCE_ROOT/host.txt"

note "Probe the exact host and build daemon endpoints as the builder"
PROBE_LABEL=host BUILDER_USER="$BUILDER_USER" DOCKER_ENDPOINT="$DOCKER_HOST_ENDPOINT" \
  EVIDENCE_DIR="$LOG_DIR" OVERALL_TIMEOUT_SECONDS="$HOST_DAEMON_READINESS_SECONDS" \
  PROBE_TIMEOUT_SECONDS="$DAEMON_PROBE_TIMEOUT_SECONDS" \
  bash "$SCRIPT_DIR/probe-docker-endpoint.sh" \
  > "$LOG_DIR/docker-readiness-host-console.json" 2> "$LOG_DIR/docker-readiness-host.log" \
  || fail "host Docker endpoint did not become ready at $DOCKER_HOST_ENDPOINT"

PROBE_LABEL=build BUILDER_USER="$BUILDER_USER" DOCKER_ENDPOINT="$BUILD_ENDPOINT" \
  EVIDENCE_DIR="$LOG_DIR" OVERALL_TIMEOUT_SECONDS="$BUILD_DAEMON_READINESS_SECONDS" \
  PROBE_TIMEOUT_SECONDS="$DAEMON_PROBE_TIMEOUT_SECONDS" \
  bash "$SCRIPT_DIR/probe-docker-endpoint.sh" \
  > "$LOG_DIR/docker-readiness-build-console.json" 2> "$LOG_DIR/docker-readiness-build.log" \
  || fail "build daemon did not become ready at $BUILD_ENDPOINT (see retained readiness diagnostics)"

HOST_DAEMON_ID="$(read_field "$LOG_DIR/docker-readiness-host.json" daemonId)"
BUILD_DAEMON_ID="$(read_field "$LOG_DIR/docker-readiness-build.json" daemonId)"
HOST_READINESS_ATTEMPTS="$(read_field "$LOG_DIR/docker-readiness-host.json" attempts)"
BUILD_READINESS_ATTEMPTS="$(read_field "$LOG_DIR/docker-readiness-build.json" attempts)"
HOST_READINESS_ELAPSED_MS="$(read_field "$LOG_DIR/docker-readiness-host.json" elapsedMs)"
BUILD_READINESS_ELAPSED_MS="$(read_field "$LOG_DIR/docker-readiness-build.json" elapsedMs)"
[[ -n "$HOST_DAEMON_ID" ]] || fail "host daemon ID is empty after a successful readiness probe"
[[ -n "$BUILD_DAEMON_ID" ]] || fail "build daemon ID is empty after a successful readiness probe"
[[ "$BUILD_DAEMON_ID" != "$HOST_DAEMON_ID" ]] || fail "build and verification daemons are not independent"
[[ "$BUILD_ENDPOINT" =~ ^tcp://127\.0\.0\.1:([0-9]+)$ ]] \
  || fail "build daemon API must be a loopback-only TCP endpoint: $BUILD_ENDPOINT"
assert_loopback_tcp "${BASH_REMATCH[1]}" "build-daemon-api"
[[ ! -e "$REHEARSAL_DIR" ]] || fail "REHEARSAL_DIR must be absent before ACTION=checkpoint: $REHEARSAL_DIR"
{
  printf 'host_daemon_id=%s\n' "$HOST_DAEMON_ID"
  printf 'build_daemon_id=%s\n' "$BUILD_DAEMON_ID"
  printf 'host_endpoint=%s\n' "$DOCKER_HOST_ENDPOINT"
  printf 'build_endpoint=%s\n' "$BUILD_ENDPOINT"
  printf 'host_readiness_attempts=%s\n' "$HOST_READINESS_ATTEMPTS"
  printf 'build_readiness_attempts=%s\n' "$BUILD_READINESS_ATTEMPTS"
  printf 'host_readiness_elapsed_ms=%s\n' "$HOST_READINESS_ELAPSED_MS"
  printf 'build_readiness_elapsed_ms=%s\n' "$BUILD_READINESS_ELAPSED_MS"
  printf 'build_api_loopback_only=true\n'
} > "$EVIDENCE_ROOT/daemons.txt"
note "Build daemon: $BUILD_DAEMON_ID"
note "Verify/phase daemon: $HOST_DAEMON_ID"

note "Run candidate dependency, test, TypeScript, lint and security gates"
[[ -n "${A04_PG_BIN:-}" ]] || fail "A04_PG_BIN is required for the Linux full suite"
[[ -x "$A04_PG_BIN/initdb" ]] || fail "A04_PG_BIN does not contain initdb: $A04_PG_BIN"
[[ -x "$A04_PG_BIN/postgres" ]] || fail "A04_PG_BIN does not contain postgres: $A04_PG_BIN"
SOURCE_ROOT="$SOURCE_ROOT" \
NPM_CLI_FOR_REHEARSAL="$NPM_CLI_FOR_REHEARSAL" \
NODE_BIN="${NODE_BIN:-node}" \
A04_PG_BIN="$A04_PG_BIN" \
PG_BIN="${PG_BIN:-$A04_PG_BIN}" \
  bash "$SCRIPT_DIR/run-candidate-gates.sh" 2>&1 | tee "$LOG_DIR/candidate-gates.log"
cp "$SOURCE_ROOT/package-lock.json" "$EVIDENCE_ROOT/package-lock.json"

note "ACTION=checkpoint: build once, retain, independently verify, stop"
(
  cd "$SOURCE_ROOT"
  env ACTION=checkpoint \
    SOURCE_SHA="$SOURCE_SHA" HARNESS_SHA="$HARNESS_SHA" APP_URL="$STAGING_ORIGIN" \
    REHEARSAL_DIR="$REHEARSAL_DIR" \
    BUILD_ENGINE=docker BUILD_CONTEXT="$BUILD_CONTEXT" BUILD_ENDPOINT="$BUILD_ENDPOINT" \
    VERIFY_ENGINE="$VERIFY_ENGINE" VERIFY_CONTEXT="$VERIFY_CONTEXT" \
    PHASE_ENGINE="$PHASE_ENGINE" PHASE_CONTEXT="$PHASE_CONTEXT" \
    bash deploy/builder/private-staging/rehearse-exact-candidate.sh
) 2>&1 | tee "$LOG_DIR/checkpoint.log"
cp "$REHEARSAL_DIR/checkpoint.json" "$EVIDENCE_ROOT/checkpoint/checkpoint.json"
cp "$REHEARSAL_DIR/CHECKPOINT_READY.txt" "$EVIDENCE_ROOT/checkpoint/CHECKPOINT_READY.txt"
cp -a "$REHEARSAL_DIR/archive-verification" "$EVIDENCE_ROOT/checkpoint/archive-verification"
IMAGE_ID="$(read_field "$REHEARSAL_DIR/checkpoint.json" imageId)"
ARCHIVE_PATH="$(read_field "$REHEARSAL_DIR/checkpoint.json" archivePath)"
ARCHIVE_SHA="$(read_field "$REHEARSAL_DIR/checkpoint.json" archiveSha256)"
ARCHIVE_BYTES="$(read_field "$REHEARSAL_DIR/checkpoint.json" archiveBytes)"
[[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "checkpoint image ID is invalid"
[[ -f "$ARCHIVE_PATH" ]] || fail "checkpoint archive is missing"

note "Verify helper bind mounts resolve on the host verification daemon"
docker run --rm --network none --read-only --user 1000:1000 \
  --mount "type=bind,src=$SOURCE_ROOT/deploy/builder,dst=/app/qualify,readonly" \
  "$IMAGE_ID" -e '
    const fs=require("node:fs");
    for (const p of ["/app/qualify/qualify-http.mjs","/app/qualify/qualify-seed.mjs","/app/qualify/qualify-proxy.mjs"]) {
      if (!fs.existsSync(p)) throw new Error(`missing helper: ${p}`);
    }
  ' 2>&1 | tee "$LOG_DIR/helper-bind-mount.log"

note "Pull pinned temporary edge and generate private access"
docker pull "$CADDY_IMAGE" 2>&1 | tee "$LOG_DIR/caddy-pull.log"
docker image inspect --format '{{json .RepoDigests}}' "$CADDY_IMAGE" > "$EVIDENCE_ROOT/edge/caddy-digests.json"
BASIC_PASSWORD="$(openssl rand -hex 24)"
BASIC_HASH="$(docker run --rm --entrypoint /usr/bin/caddy "$CADDY_IMAGE" hash-password --plaintext "$BASIC_PASSWORD" | tr -d '\r\n')"
[[ "$BASIC_HASH" == \$2* ]] || fail "Caddy password hash generation failed"
printf '%s' "$BASIC_PASSWORD" > "$EVIDENCE_ROOT/secrets/basic-password"
printf '%s' "$BASIC_HASH" > "$EVIDENCE_ROOT/secrets/basic-hash"
chmod 600 "$EVIDENCE_ROOT/secrets/basic-password" "$EVIDENCE_ROOT/secrets/basic-hash"

note "Prepare temporary private Caddy edge"
mkdir -p "$STAGING_DIR"
cp "$SOURCE_ROOT/deploy/builder/private-staging/compose.private-staging.reference.yml" "$STAGING_DIR/compose.yml"
python3 - "$SOURCE_ROOT/deploy/builder/private-staging/Caddyfile.example" "$STAGING_DIR/Caddyfile" <<'PY'
import sys
source, target = sys.argv[1], sys.argv[2]
text = open(source, encoding="utf-8").read()
needle = "{$STAGING_HOST} {\n"
if needle not in text:
    raise SystemExit("Caddyfile site block not found")
text = text.replace(needle, needle + "\ttls internal\n", 1)
text += "\nhttps://unexpected.invalid {\n\ttls internal\n\trespond \"unexpected host\" 421\n}\n"
open(target, "w", encoding="utf-8").write(text)
PY
python3 - "$STAGING_DIR/compose.yml" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
text = text.replace("./Caddyfile.example", "./Caddyfile", 1)
text = text.replace("BUILDER_RUNTIME_MODE: invite", "BUILDER_RUNTIME_MODE: ${BUILDER_RUNTIME_MODE:-invite}", 1)
text = text.replace('- "80:80"', '- "127.0.0.1:80:80"')
text = text.replace('- "443:443"', '- "127.0.0.1:443:443"')
text = text.replace('- "443:443/udp"', '- "127.0.0.1:443:443/udp"')
open(path, "w", encoding="utf-8").write(text)
PY
if ! getent hosts "$STAGING_HOST" | grep -q '^127\.0\.0\.1'; then
  echo "127.0.0.1 $STAGING_HOST" | sudo tee -a /etc/hosts >/dev/null
fi
getent ahosts "$STAGING_HOST" | head -n 2 > "$EVIDENCE_ROOT/edge/hosts.txt"
for port in 80 443; do
  if ss -ltn "sport = :$port" | grep -q LISTEN; then fail "host port $port is already in use"; fi
done

note "Validate generated Compose bindings with the real loopback profile"
python3 - "$STAGING_DIR/compose.yml" "$EVIDENCE_ROOT/edge/generated-compose-bindings.json" <<'PY'
import json, re, sys
source, target = sys.argv[1], sys.argv[2]
text = open(source, encoding="utf-8").read()
result = {}
for match in re.finditer(r'-\s*"([^"]+):([0-9]+):([0-9]+)(/udp)?"', text):
    host_ip, host_port, container_port, udp = match.groups()
    protocol = "udp" if udp else "tcp"
    key = f"{container_port}/{protocol}"
    result.setdefault(key, []).append({"HostIp": host_ip, "HostPort": host_port})
json.dump(result, open(target, "w", encoding="utf-8"), indent=2)
PY
node "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --input "$EVIDENCE_ROOT/edge/generated-compose-bindings.json" \
  --profile loopback \
  --output "$EVIDENCE_ROOT/edge/generated-bindings-validation.json" >/dev/null \
  || fail "generated Compose bindings are not the approved loopback profile"

compose() {
  local mode="$1"; shift
  env BUILDER_IMAGE="$IMAGE_ID" CADDY_IMAGE="$CADDY_IMAGE" \
    STAGING_ORIGIN="$STAGING_ORIGIN" STAGING_HOST="$STAGING_HOST" \
    ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
    STAGING_BASIC_AUTH_HASH="$BASIC_HASH" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
    BUILDER_RUNTIME_MODE="$mode" \
    docker compose -p "$PROJECT" --project-directory "$STAGING_DIR" -f "$STAGING_DIR/compose.yml" "$@"
}
wait_app_healthy() {
  local mode="$1" id status
  id="$(compose "$mode" ps -q app)"
  [[ -n "$id" ]] || fail "app container is missing"
  for _ in $(seq 1 90); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
    case "$status" in
      healthy) printf '%s\n' "$id"; return 0 ;;
      unhealthy|exited|dead) compose "$mode" logs --no-color app >&2 || true; fail "app is $status" ;;
    esac
    sleep 2
  done
  compose "$mode" logs --no-color app >&2 || true
  fail "app did not become healthy"
}
wait_edge() {
  for _ in $(seq 1 60); do
    if curl -ksS -o /dev/null -u "$STAGING_BASIC_AUTH_USER:$BASIC_PASSWORD" "https://$STAGING_HOST/"; then return 0; fi
    sleep 2
  done
  fail "edge did not answer"
}

note "Start the edge with access closed"
compose closed up -d 2>&1 | tee "$LOG_DIR/compose-up-closed.log"
APP_ID="$(wait_app_healthy closed)"
wait_edge
assert_loopback_tcp 80 "edge-http"
assert_loopback_tcp 443 "edge-https"
CLOSED_HOME="$(curl -ksS -o /dev/null -w '%{http_code}' -u "$STAGING_BASIC_AUTH_USER:$BASIC_PASSWORD" "https://$STAGING_HOST/")"
CLOSED_BUILDER="$(curl -ksS -o /dev/null -w '%{http_code}' -u "$STAGING_BASIC_AUTH_USER:$BASIC_PASSWORD" "https://$STAGING_HOST/builder")"
CLOSED_SESSION="$(curl -ksS -o /dev/null -w '%{http_code}' -u "$STAGING_BASIC_AUTH_USER:$BASIC_PASSWORD" "https://$STAGING_HOST/api/builder/session")"
{
  printf 'home=%s\n' "$CLOSED_HOME"
  printf 'builder=%s\n' "$CLOSED_BUILDER"
  printf 'session=%s\n' "$CLOSED_SESSION"
} | tee "$EVIDENCE_ROOT/edge/closed-smoke.txt"
bash "$SCRIPT_DIR/assert-closed-smoke.sh" "$CLOSED_HOME" "$CLOSED_BUILDER" "$CLOSED_SESSION" \
  | tee -a "$EVIDENCE_ROOT/edge/closed-smoke.txt"

note "Install the private Caddy CA for Node and Chromium"
PROXY_ID="$(compose closed ps -q proxy)"
CA_PATH="$(docker exec "$PROXY_ID" sh -c 'find /data/caddy/pki -name root.crt -type f | head -n 1')"
[[ -n "$CA_PATH" ]] || fail "Caddy root CA was not found"
docker cp "$PROXY_ID:$CA_PATH" "$EVIDENCE_ROOT/edge/root.crt"
sudo chmod 0644 "$EVIDENCE_ROOT/edge/root.crt"
sudo cp "$EVIDENCE_ROOT/edge/root.crt" /usr/local/share/ca-certificates/ornigami-builder-rehearsal-ca.crt
sudo update-ca-certificates 2>&1 | tee "$LOG_DIR/ca-update.log"
rm -rf "$HOME/.pki"
install -d -m 0700 "$HOME/.pki" "$HOME/.pki/nssdb"
printf '\n' > "$EVIDENCE_ROOT/edge/nss-empty-password"
certutil -d "sql:$HOME/.pki/nssdb" -N -f "$EVIDENCE_ROOT/edge/nss-empty-password"
certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n OrnigamiBuilderRehearsal -i "$EVIDENCE_ROOT/edge/root.crt"
certutil -d "sql:$HOME/.pki/nssdb" -L > "$EVIDENCE_ROOT/edge/nss-ca-list.txt"

note "Start the same image in invite mode"
compose invite up -d --force-recreate app 2>&1 | tee "$LOG_DIR/compose-up-invite.log"
APP_ID="$(wait_app_healthy invite)"
PROXY_ID="$(compose invite ps -q proxy)"
wait_edge
printf 'proxy_binding_profile=loopback\n' > "$EVIDENCE_ROOT/edge/proxy-binding-profile.txt"

note "ACTION=qualify: same image ID through every required phase"
(
  cd "$SOURCE_ROOT"
  env ACTION=qualify \
    REHEARSAL_DIR="$REHEARSAL_DIR" \
    BUILD_ENGINE=docker BUILD_CONTEXT="$BUILD_CONTEXT" BUILD_ENDPOINT="$BUILD_ENDPOINT" \
    VERIFY_ENGINE="$VERIFY_ENGINE" VERIFY_CONTEXT="$VERIFY_CONTEXT" \
    PHASE_ENGINE="$PHASE_ENGINE" PHASE_CONTEXT="$PHASE_CONTEXT" \
    STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
    STAGING_BASIC_AUTH_PASSWORD="$BASIC_PASSWORD" \
    PROXY_BINDING_PROFILE=loopback \
    EDGE_APP_CONTAINER="$APP_ID" EDGE_PROXY_CONTAINER="$PROXY_ID" \
    EDGE_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
    BUILDER_OPERATOR_VOLUME="$BUILDER_STORE_VOLUME" \
    BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
    BROWSER_PLAYWRIGHT="$BROWSER_PLAYWRIGHT" \
    PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
    NODE_EXTRA_CA_CERTS="$EVIDENCE_ROOT/edge/root.crt" \
    bash deploy/builder/private-staging/rehearse-exact-candidate.sh
) 2>&1 | tee "$LOG_DIR/qualify.log"

note "Copy retained archive, receipts and phase evidence into custody"
cp "$REHEARSAL_DIR/checkpoint.json" "$CUSTODY_DIR/checkpoint.json"
cp "$REHEARSAL_DIR/CHECKPOINT_READY.txt" "$CUSTODY_DIR/CHECKPOINT_READY.txt"
cp "$REHEARSAL_DIR/rehearsal-identities.json" "$CUSTODY_DIR/rehearsal-identities.json"
cp "$REHEARSAL_DIR/REHEARSAL_COMPLETE.txt" "$CUSTODY_DIR/REHEARSAL_COMPLETE.txt"
cp "$IMAGE_DIR/archive-receipt.json" "$CUSTODY_DIR/archive-receipt.json"
cp "$IMAGE_DIR/image-identity.json" "$CUSTODY_DIR/image-identity.json"
cp "$ARCHIVE_PATH" "$CUSTODY_DIR/$(basename "$ARCHIVE_PATH")"
cp -a "$REHEARSAL_DIR/archive-verification" "$CUSTODY_DIR/archive-verification"
cp -a "$REHEARSAL_DIR/qualification-attempt-1" "$CUSTODY_DIR/qualification-attempt-1" 2>/dev/null || true
ACTUAL_ARCHIVE_SHA="$(sha256sum "$CUSTODY_DIR/$(basename "$ARCHIVE_PATH")" | awk '{print $1}')"
ACTUAL_ARCHIVE_BYTES="$(stat -c '%s' "$CUSTODY_DIR/$(basename "$ARCHIVE_PATH")")"
[[ "$ACTUAL_ARCHIVE_SHA" == "$ARCHIVE_SHA" ]] || fail "retained archive hash changed"
[[ "$ACTUAL_ARCHIVE_BYTES" == "$ARCHIVE_BYTES" ]] || fail "retained archive size changed"
cat > "$CUSTODY_DIR/custody-receipt.json" <<EOF
{
  "schemaVersion": 1,
  "applicationSourceSha": "$SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "workflowSha": "$WORKFLOW_SHA",
  "imageId": "$IMAGE_ID",
  "archivePath": "$CUSTODY_DIR/$(basename "$ARCHIVE_PATH")",
  "archiveSha256": "$ACTUAL_ARCHIVE_SHA",
  "archiveBytes": $ACTUAL_ARCHIVE_BYTES,
  "applicationOrigin": "$STAGING_ORIGIN",
  "buildDaemonId": "$BUILD_DAEMON_ID",
  "verifyPhaseDaemonId": "$HOST_DAEMON_ID",
  "custodyDestination": "github-actions-artifact",
  "retentionDays": 7,
  "customerAdmission": "closed"
}
EOF
cp -a "$LOG_DIR" "$CUSTODY_DIR/logs" 2>/dev/null || true
cp -a "$EVIDENCE_ROOT/edge" "$CUSTODY_DIR/edge" 2>/dev/null || true
cp "$EVIDENCE_ROOT/host.txt" "$EVIDENCE_ROOT/daemons.txt" "$EVIDENCE_ROOT/package-lock.json" "$CUSTODY_DIR/" 2>/dev/null || true
note "Custody bundle ready at $CUSTODY_DIR"

note "Opening evidence is complete; closing access next"
