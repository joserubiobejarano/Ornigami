#!/usr/bin/env bash
# Qualify an already-built immutable image from a retained archive.
#
# The image's application source SHA and the current acceptance harness SHA are
# recorded separately. The original archive receipt is copied unchanged; this
# wrapper never rewrites the producer's receipt to make identities agree.
set -Eeuo pipefail

SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
HARNESS_SHA="${HARNESS_SHA:?HARNESS_SHA is required}"
PRODUCER_HARNESS_SHA="${PRODUCER_HARNESS_SHA:?PRODUCER_HARNESS_SHA is required}"
WORKFLOW_SHA="${WORKFLOW_SHA:?WORKFLOW_SHA is required}"
IMAGE_REFERENCE="${IMAGE_REFERENCE:?IMAGE_REFERENCE is required}"
ARCHIVE_PATH="${ARCHIVE_PATH:?ARCHIVE_PATH is required}"
ARCHIVE_RECEIPT_PATH="${ARCHIVE_RECEIPT_PATH:?ARCHIVE_RECEIPT_PATH is required}"
ARCHIVE_SHA256="${ARCHIVE_SHA256:?ARCHIVE_SHA256 is required}"
ARCHIVE_BYTES="${ARCHIVE_BYTES:?ARCHIVE_BYTES is required}"
APP_URL="${APP_URL:?APP_URL is required}"
CADDY_IMAGE="${CADDY_IMAGE:?CADDY_IMAGE is required}"
PROJECT="${PROJECT:?PROJECT is required}"
EVIDENCE_ROOT="${EVIDENCE_ROOT:?EVIDENCE_ROOT is required}"
EXPORT_STAGING="${EXPORT_STAGING:?EXPORT_STAGING is required}"
BUILDER_STORE_VOLUME="${BUILDER_STORE_VOLUME:?BUILDER_STORE_VOLUME is required}"
BUILDER_RUNTIME_STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:?BUILDER_RUNTIME_STORE_HOST_ID is required}"
STAGING_BASIC_AUTH_USER="${STAGING_BASIC_AUTH_USER:-staging-operator}"
BROWSER_PLAYWRIGHT="${BROWSER_PLAYWRIGHT:-}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-}"
BUILDER_USER="${BUILDER_USER:-$(id -un)}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=retained-evidence.sh
source "$SCRIPT_DIR/retained-evidence.sh"
STAGING_HOST="$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$APP_URL")"
REHEARSAL_DIR="$EVIDENCE_ROOT/existing-image"
STAGING_DIR="$REHEARSAL_DIR/edge"
CADDY_DATA_VOLUME="${PROJECT}-caddy-data"
CADDY_CONFIG_VOLUME="${PROJECT}-caddy-config"
LOG_DIR="$EVIDENCE_ROOT/logs"
CUSTODY_DIR="$EVIDENCE_ROOT/custody"
prepare_retained_evidence_root "$EVIDENCE_ROOT"
retained_require_dir "$REHEARSAL_DIR" "rehearsal evidence"
retained_require_dir "$STAGING_DIR" "edge evidence"

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

# Test-only seam. It is disabled unless an explicit test sets it and stops
# before archive access, image load or any edge/network action.
if [[ "${RETAINED_EVIDENCE_PREPARE_ONLY:-0}" == "1" ]]; then
  note "Evidence preparation self-test; stopping before archive access"
  exit 0
fi

[[ "$IMAGE_REFERENCE" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "IMAGE_REFERENCE must be an immutable image ID"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_SHA must be 40 hex"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$PRODUCER_HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "PRODUCER_HARNESS_SHA must be 40 hex"
[[ "$APP_URL" == https://* ]] || fail "APP_URL must be HTTPS"
[[ "$ARCHIVE_BYTES" =~ ^[0-9]+$ ]] || fail "ARCHIVE_BYTES must be an integer"
[[ -f "$ARCHIVE_PATH" ]] || fail "archive is missing: $ARCHIVE_PATH"
[[ -f "$ARCHIVE_RECEIPT_PATH" ]] || fail "archive receipt is missing: $ARCHIVE_RECEIPT_PATH"

note "Verify retained archive producer identity"
ACTUAL_ARCHIVE_SHA256="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
ACTUAL_ARCHIVE_BYTES="$(stat -c '%s' "$ARCHIVE_PATH")"
[[ "$ACTUAL_ARCHIVE_SHA256" == "$ARCHIVE_SHA256" ]] || fail "retained archive hash mismatch"
[[ "$ACTUAL_ARCHIVE_BYTES" == "$ARCHIVE_BYTES" ]] || fail "retained archive size mismatch"
{
  printf 'producer_application_source_sha=%s\n' "$SOURCE_SHA"
  printf 'producer_harness_sha=%s\n' "$PRODUCER_HARNESS_SHA"
  printf 'consumer_harness_sha=%s\n' "$HARNESS_SHA"
  printf 'archive_sha256=%s\n' "$ACTUAL_ARCHIVE_SHA256"
  printf 'archive_bytes=%s\n' "$ACTUAL_ARCHIVE_BYTES"
} > "$EVIDENCE_ROOT/archive-producer-identity.txt"

note "Verify the retained archive receipt still describes this exact producer image"
node - "$ARCHIVE_RECEIPT_PATH" "$SOURCE_SHA" "$PRODUCER_HARNESS_SHA" "$IMAGE_REFERENCE" \
  "$ACTUAL_ARCHIVE_SHA256" "$ACTUAL_ARCHIVE_BYTES" "$APP_URL" <<'NODE'
const fs = require("node:fs");
const [receiptPath, source, harness, image, sha, bytes, origin] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const match = (value, expected, label) => {
  if (value !== expected) throw new Error(`${label} mismatch: ${value} !== ${expected}`);
};
match(receipt.receiptType, "builder-image-archive", "receipt type");
match(receipt.applicationSourceSha, source, "producer application source");
match(receipt.harnessSha, harness, "producer harness");
match(receipt.imageId, image, "image ID");
match(receipt.archiveSha256, sha, "archive hash");
match(Number(receipt.archiveBytes), Number(bytes), "archive bytes");
match(receipt.origin, origin, "application origin");
match(receipt.platform, "linux/amd64", "platform");
match(receipt.user, "1000:1000", "user");
console.log(JSON.stringify({ ok: true, receiptType: receipt.receiptType, imageId: receipt.imageId }, null, 2));
NODE

note "Load the retained archive and verify the immutable image identity"
docker load -i "$ARCHIVE_PATH" 2>&1 | tee "$LOG_DIR/image-load.log"
LOADED_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE_REFERENCE")"
[[ "$LOADED_IMAGE_ID" == "$IMAGE_REFERENCE" ]] || fail "loaded image ID mismatch: $LOADED_IMAGE_ID"
docker image inspect "$IMAGE_REFERENCE" > "$EVIDENCE_ROOT/image-inspect.json"
node "$SCRIPT_DIR/image-identity.mjs" \
  --inspect "$EVIDENCE_ROOT/image-inspect.json" \
  --expected-image-id "$IMAGE_REFERENCE" \
  --expected-source-sha "$SOURCE_SHA" \
  --expected-origin "$APP_URL" \
  --expected-platform linux/amd64 \
  --expected-user 1000:1000 \
  --output "$EVIDENCE_ROOT/image-identity-verification.json" >/dev/null

BASIC_PASSWORD=""
BASIC_HASH=""
CLEANUP_FAILURES=0

export_approved_evidence() {
  export_retained_evidence "$EVIDENCE_ROOT" "$EXPORT_STAGING"
}

cleanup() {
  local status=$? compose_status=0 ownership_status=0 ca_status=0
  local origin_unreachable=0 http_listener_absent=0 https_listener_absent=0
  set +e
  if [[ -f "$STAGING_DIR/compose.yml" ]]; then
    env BUILDER_IMAGE="$IMAGE_REFERENCE" CADDY_IMAGE="$CADDY_IMAGE" \
      STAGING_ORIGIN="$APP_URL" STAGING_HOST="$STAGING_HOST" \
      ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
      STAGING_BASIC_AUTH_HASH="${BASIC_HASH:-}" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
      CADDY_DATA_VOLUME="$CADDY_DATA_VOLUME" CADDY_CONFIG_VOLUME="$CADDY_CONFIG_VOLUME" \
      docker compose -p "$PROJECT" --project-directory "$STAGING_DIR" -f "$STAGING_DIR/compose.yml" \
      logs --no-color > "$LOG_DIR/compose-final.log" 2>&1 || true
    env BUILDER_IMAGE="$IMAGE_REFERENCE" CADDY_IMAGE="$CADDY_IMAGE" \
      STAGING_ORIGIN="$APP_URL" STAGING_HOST="$STAGING_HOST" \
      ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
      STAGING_BASIC_AUTH_HASH="${BASIC_HASH:-}" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
      CADDY_DATA_VOLUME="$CADDY_DATA_VOLUME" CADDY_CONFIG_VOLUME="$CADDY_CONFIG_VOLUME" \
      docker compose -p "$PROJECT" --project-directory "$STAGING_DIR" -f "$STAGING_DIR/compose.yml" \
      down -v --remove-orphans > "$LOG_DIR/compose-down.log" 2>&1
    compose_status=$?
  fi
  DOCKER_BIN=docker PROJECT="$PROJECT" EVIDENCE_DIR="$EVIDENCE_ROOT" \
    bash "$SCRIPT_DIR/cleanup-owned-resources.sh" > "$LOG_DIR/cleanup-owned-resources.log" 2>&1
  ownership_status=$?
  [[ "$compose_status" -eq 0 ]] || CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
  [[ "$ownership_status" -eq 0 ]] || CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))

  for _ in {1..10}; do
    if curl -ksS --max-time 5 --resolve "$STAGING_HOST:443:127.0.0.1" \
      -o /dev/null "https://$STAGING_HOST/" 2>/dev/null; then
      origin_unreachable=0
    else
      origin_unreachable=1
    fi
    [[ -z "$(ss -ltn "sport = :80" 2>/dev/null | awk 'NR > 1')" ]] && http_listener_absent=1 || http_listener_absent=0
    [[ -z "$(ss -ltn "sport = :443" 2>/dev/null | awk 'NR > 1')" ]] && https_listener_absent=1 || https_listener_absent=0
    [[ "$origin_unreachable" == "1" && "$http_listener_absent" == "1" && "$https_listener_absent" == "1" ]] && break
    sleep 1
  done
  [[ "$origin_unreachable" == "1" ]] || { CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1)); echo "FAIL: origin still answered" >> "$LOG_DIR/cleanup-owned-resources.log"; }
  [[ "$http_listener_absent" == "1" ]] || { CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1)); echo "FAIL: port 80 still listening" >> "$LOG_DIR/cleanup-owned-resources.log"; }
  [[ "$https_listener_absent" == "1" ]] || { CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1)); echo "FAIL: port 443 still listening" >> "$LOG_DIR/cleanup-owned-resources.log"; }

  if grep -q "[[:space:]]$STAGING_HOST\$" /etc/hosts 2>/dev/null; then
    sudo sed -i "\\|[[:space:]]$STAGING_HOST\$|d" /etc/hosts
  fi
  if grep -q "[[:space:]]$STAGING_HOST\$" /etc/hosts 2>/dev/null; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: host mapping remains" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  sudo rm -f /usr/local/share/ca-certificates/ornigami-builder-rehearsal-ca.crt
  sudo update-ca-certificates >/dev/null 2>&1
  ca_status=$?
  [[ "$ca_status" -eq 0 && ! -e /usr/local/share/ca-certificates/ornigami-builder-rehearsal-ca.crt ]] \
    || { CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1)); echo "FAIL: private CA removal incomplete" >> "$LOG_DIR/cleanup-owned-resources.log"; }
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
    if [[ -f "$EVIDENCE_ROOT/cleanup-receipt.txt" ]]; then cat "$EVIDENCE_ROOT/cleanup-receipt.txt"; fi
  } > "$EVIDENCE_ROOT/access-closed.txt"
  cp "$EVIDENCE_ROOT/access-closed.txt" "$CUSTODY_DIR/access-closed.txt" 2>/dev/null || true
  if ! export_approved_evidence; then
    CLEANUP_FAILURES=$((CLEANUP_FAILURES + 1))
    echo "FAIL: approved evidence export failed" >> "$LOG_DIR/cleanup-owned-resources.log"
  fi
  bash "$SCRIPT_DIR/finalize-rehearsal-status.sh" "$status" "$CLEANUP_FAILURES" \
    > "$EVIDENCE_ROOT/final-status.txt" 2>&1
  cp "$EVIDENCE_ROOT/final-status.txt" "$CUSTODY_DIR/final-status.txt" 2>/dev/null || true
  cp "$EVIDENCE_ROOT/final-status.txt" "$EXPORT_STAGING/final-status.txt" 2>/dev/null || true
  chmod 0640 "$EXPORT_STAGING/final-status.txt" 2>/dev/null || true
  bash "$SCRIPT_DIR/finalize-rehearsal-status.sh" "$status" "$CLEANUP_FAILURES" >/dev/null
  local final=$?
  cat "$EVIDENCE_ROOT/final-status.txt"
  exit "$final"
}
trap cleanup EXIT

note "Record producer/consumer and daemon identities"
record_retained_host_identity \
  "$EVIDENCE_ROOT" "$SOURCE_SHA" "$PRODUCER_HARNESS_SHA" "$HARNESS_SHA" "$WORKFLOW_SHA" \
  "$APP_URL" "$IMAGE_REFERENCE" "$ARCHIVE_SHA256" "$ARCHIVE_BYTES"

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
  env BUILDER_IMAGE="$IMAGE_REFERENCE" CADDY_IMAGE="$CADDY_IMAGE" \
    STAGING_ORIGIN="$APP_URL" STAGING_HOST="$STAGING_HOST" \
    ACME_EMAIL="staging@ornigami.invalid" STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
    STAGING_BASIC_AUTH_HASH="$BASIC_HASH" BUILDER_STORE_VOLUME="$BUILDER_STORE_VOLUME" \
    CADDY_DATA_VOLUME="$CADDY_DATA_VOLUME" CADDY_CONFIG_VOLUME="$CADDY_CONFIG_VOLUME" \
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
  printf 'home=%s\nbuilder=%s\nsession=%s\n' "$CLOSED_HOME" "$CLOSED_BUILDER" "$CLOSED_SESSION"
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

note "Start the retained image in invite mode"
compose invite up -d --force-recreate app 2>&1 | tee "$LOG_DIR/compose-up-invite.log"
APP_ID="$(wait_app_healthy invite)"
PROXY_ID="$(compose invite ps -q proxy)"
wait_edge
printf 'proxy_binding_profile=loopback\n' > "$EVIDENCE_ROOT/edge/proxy-binding-profile.txt"

note "Qualify the retained immutable image"
(
  cd "$SOURCE_ROOT"
  env QUALIFICATION_PATH=https-edge \
    IMAGE_REFERENCE="$IMAGE_REFERENCE" \
    EXPECTED_SOURCE_SHA="$SOURCE_SHA" EXPECTED_ORIGIN="$APP_URL" STAGING_ORIGIN="$APP_URL" \
    STAGING_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" STAGING_BASIC_AUTH_PASSWORD="$BASIC_PASSWORD" \
    EDGE_APP_CONTAINER="$APP_ID" EDGE_PROXY_CONTAINER="$PROXY_ID" \
    EDGE_STORE_VOLUME="$BUILDER_STORE_VOLUME" BUILDER_OPERATOR_VOLUME="$BUILDER_STORE_VOLUME" \
    BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
    EXPECTED_PLATFORM=linux/amd64 EXPECTED_USER=1000:1000 HARNESS_SHA="$HARNESS_SHA" \
    PROXY_BINDING_PROFILE=loopback EVIDENCE_DIR="$REHEARSAL_DIR/existing-image-qualification" \
    NODE_EXTRA_CA_CERTS="$EVIDENCE_ROOT/edge/root.crt" \
    BROWSER_MODE="$BROWSER_MODE" BROWSER_CHROMIUM_SANDBOX="$BROWSER_CHROMIUM_SANDBOX" \
    BROWSER_PLAYWRIGHT="$BROWSER_PLAYWRIGHT" PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" \
    bash deploy/builder/private-staging/qualify-existing-image.sh
) 2>&1 | tee "$LOG_DIR/qualification.log"

EXISTING_IMAGE_RECEIPT="$REHEARSAL_DIR/existing-image-qualification/existing-image-qualification.json"
[[ -f "$EXISTING_IMAGE_RECEIPT" ]] || fail "existing-image qualification receipt is missing"
node - "$EXISTING_IMAGE_RECEIPT" "$IMAGE_REFERENCE" "$SOURCE_SHA" "$HARNESS_SHA" "$APP_URL" <<'NODE'
const fs = require("node:fs");
const [receiptPath, image, source, harness, origin] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const match = (value, expected, label) => {
  if (value !== expected) throw new Error(`${label} mismatch: ${value} !== ${expected}`);
};
match(receipt.mode, "existing-image", "mode");
match(receipt.qualificationPath, "https-edge", "qualification path");
match(receipt.imageId, image, "image ID");
match(receipt.applicationSourceSha, source, "application source");
match(receipt.harnessSha, harness, "harness");
match(receipt.applicationOrigin, origin, "application origin");
match(receipt.effectiveRuntimeOrigin, origin, "effective runtime origin");
if (receipt.buildInvoked !== false) throw new Error("existing-image qualification invoked a build");
if (receipt.sameImageIdAcrossPhases !== true) throw new Error("phases did not use one image ID");
if (receipt.fullHttpsAcceptance !== true) throw new Error("full HTTPS acceptance is not complete");
console.log(JSON.stringify({ ok: true, phases: receipt.phases }, null, 2));
NODE

case "${BROWSER_CHROMIUM_SANDBOX:-0}" in
  0|"") BROWSER_MODE=no-sandbox; BROWSER_CHROMIUM_SANDBOX=0 ;;
  1) BROWSER_MODE=sandbox; BROWSER_CHROMIUM_SANDBOX=1 ;;
  *) fail "BROWSER_CHROMIUM_SANDBOX must be 0 or 1" ;;
esac

note "Record retained-image custody without rewriting the producer receipt"
cp "$ARCHIVE_PATH" "$CUSTODY_DIR/$(basename "$ARCHIVE_PATH")"
cp "$ARCHIVE_RECEIPT_PATH" "$CUSTODY_DIR/archive-receipt.json"
cp "$EVIDENCE_ROOT/image-inspect.json" "$CUSTODY_DIR/image-inspect.json"
cp "$EVIDENCE_ROOT/image-identity-verification.json" "$CUSTODY_DIR/image-identity-verification.json"
cp "$REHEARSAL_DIR/existing-image-qualification/existing-image-qualification.json" "$CUSTODY_DIR/existing-image-qualification.json"
cp -R "$REHEARSAL_DIR/existing-image-qualification/." "$CUSTODY_DIR/existing-image-qualification" 2>/dev/null || true
cp "$EVIDENCE_ROOT/host.txt" "$CUSTODY_DIR/host.txt"
cp "$EVIDENCE_ROOT/archive-producer-identity.txt" "$CUSTODY_DIR/archive-producer-identity.txt"
node "$SCRIPT_DIR/write-retained-custody-receipt.mjs" \
  --output "$CUSTODY_DIR/retained-image-custody-receipt.json" \
  --source-sha "$SOURCE_SHA" \
  --producer-harness-sha "$PRODUCER_HARNESS_SHA" \
  --consumer-harness-sha "$HARNESS_SHA" \
  --workflow-sha "$WORKFLOW_SHA" \
  --image-id "$IMAGE_REFERENCE" \
  --archive-sha256 "$ACTUAL_ARCHIVE_SHA256" \
  --archive-bytes "$ACTUAL_ARCHIVE_BYTES" \
  --origin "$APP_URL" \
  --qualification-path https-edge \
  --app-container "$APP_ID" \
  --proxy-container "$PROXY_ID" \
  --store-volume "$BUILDER_STORE_VOLUME" \
  --daemon-id "$("$DOCKER_BIN" info --format '{{.ID}}')" \
  --browser-mode "$BROWSER_MODE" \
  --require-distinct-harness >/dev/null
cp -a "$LOG_DIR" "$CUSTODY_DIR/logs" 2>/dev/null || true
cp -a "$EVIDENCE_ROOT/edge" "$CUSTODY_DIR/edge" 2>/dev/null || true

note "Retained-image qualification complete; closing access"
