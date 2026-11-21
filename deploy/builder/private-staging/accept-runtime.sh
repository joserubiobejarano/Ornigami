#!/usr/bin/env bash
# Read-only runtime/volume/proxy acceptance on the staging host.
# This script does not start, stop, publish or modify the application.
set -euo pipefail

APP_CONTAINER="${APP_CONTAINER:?APP_CONTAINER is required}"
PROXY_CONTAINER="${PROXY_CONTAINER:-}"
STORE_VOLUME="${STORE_VOLUME:?STORE_VOLUME is required}"
EXPECTED_ORIGIN="${EXPECTED_ORIGIN:?EXPECTED_ORIGIN is required}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
EXPECTED_IMAGE_ID="${EXPECTED_IMAGE_ID:?EXPECTED_IMAGE_ID is required}"
EXPECTED_USER="${EXPECTED_USER:-1000:1000}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR must be a new directory}"
ENGINE="${ENGINE:-docker}"
NODE_BIN="${NODE_BIN:-node}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }
[[ "$EXPECTED_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "EXPECTED_IMAGE_ID must be immutable sha256:<64-hex>"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"
CHECKS="$EVIDENCE_DIR/checks.tsv"
: > "$CHECKS"

check() {
  local name="$1" actual="$2" expected="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'fail\t%s\t%s\n' "$name" "$actual" >> "$CHECKS"
    fail "$name: expected [$expected], got [$actual]"
  fi
  printf 'ok\t%s\t%s\n' "$name" "$actual" >> "$CHECKS"
  note "PASS $name"
}

[[ "$("$ENGINE" inspect --format '{{.State.Running}}' "$APP_CONTAINER")" == "true" ]]
[[ "$("$ENGINE" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$APP_CONTAINER")" == "healthy" ]]
check "app:read-only-root" "$("$ENGINE" inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$APP_CONTAINER")" "true"
check "app:user" "$("$ENGINE" inspect --format '{{.Config.User}}' "$APP_CONTAINER")" "$EXPECTED_USER"
check "app:image-id" "$("$ENGINE" inspect --format '{{.Image}}' "$APP_CONTAINER")" "$EXPECTED_IMAGE_ID"
APP_PORTS="$("$ENGINE" inspect --format '{{json .HostConfig.PortBindings}}' "$APP_CONTAINER")"
[[ "$APP_PORTS" == "{}" || "$APP_PORTS" == "null" ]] || fail "app has published ports: $APP_PORTS"
printf 'ok\tapp:no-published-ports\t%s\n' "$APP_PORTS" >> "$CHECKS"
check "app:revision" "$("$ENGINE" inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$APP_CONTAINER")" "$EXPECTED_SOURCE_SHA"
check "app:origin" "$("$ENGINE" inspect --format '{{ index .Config.Labels "org.ornigami.public-origin" }}' "$APP_CONTAINER")" "$EXPECTED_ORIGIN"

NETWORKS="$("$ENGINE" inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$APP_CONTAINER")"
[[ -n "$NETWORKS" ]] || fail "app has no network"
while IFS= read -r network; do
  [[ -n "$network" ]] || continue
  check "app:network-internal:$network" "$("$ENGINE" network inspect --format '{{.Internal}}' "$network")" "true"
done <<< "$NETWORKS"

if "$ENGINE" port "$APP_CONTAINER" 3000 >/dev/null 2>&1; then
  fail "app port 3000 is published"
fi
printf 'ok\tapp:port-3000-unpublished\ttrue\n' >> "$CHECKS"

if "$ENGINE" exec "$APP_CONTAINER" /nodejs/bin/node -e \
  'fetch("https://example.com",{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(1)).catch(()=>process.exit(0))'; then
  printf 'ok\tapp:egress-denied\ttrue\n' >> "$CHECKS"
else
  fail "app reached the public network"
fi

if "$ENGINE" inspect --format '{{json .Config.Env}}' "$APP_CONTAINER" | grep -E 'DATABASE_URL|OPENAI|STRIPE|RESEND|SENTRY|GOOGLE_CLIENT|AUTH_SECRET' >/dev/null; then
  fail "forbidden provider/database/mail/Sentry environment is present"
fi
printf 'ok\tapp:no-provider-env\ttrue\n' >> "$CHECKS"

check "volume:label" "$("$ENGINE" volume inspect --format '{{ index .Labels "org.ornigami.staging" }}' "$STORE_VOLUME" 2>/dev/null || true)" "true"
ROOT_STAT="$("$ENGINE" run --rm --network none --user 1000:1000 \
  --mount "type=volume,src=$STORE_VOLUME,dst=/data/builder,readonly" \
  "$("$ENGINE" inspect --format '{{.Image}}' "$APP_CONTAINER")" -e \
  'const fs=require("node:fs"),p="/data/builder",s=fs.statSync(p);process.stdout.write(`${s.uid}:${s.gid}:${(s.mode&0o777).toString(8)}`)')"
check "volume:root" "$ROOT_STAT" "1000:1000:700"

STORE_STAT="$("$ENGINE" run --rm --network none --user 1000:1000 \
  --mount "type=volume,src=$STORE_VOLUME,dst=/data/builder,readonly" \
  "$("$ENGINE" inspect --format '{{.Image}}' "$APP_CONTAINER")" -e \
  'const fs=require("node:fs"),p="/data/builder/identity-store.json";if(!fs.existsSync(p)){process.stdout.write("absent");process.exit(0)}const s=fs.statSync(p);process.stdout.write(`${s.uid}:${s.gid}:${(s.mode&0o777).toString(8)}`)')"
[[ "$STORE_STAT" == "absent" || "$STORE_STAT" == "1000:1000:600" ]] || fail "store file mismatch: $STORE_STAT"
printf 'ok\tvolume:store-file\t%s\n' "$STORE_STAT" >> "$CHECKS"

if [[ -n "$PROXY_CONTAINER" ]]; then
  PROXY_PORTS="$("$ENGINE" inspect --format '{{json .HostConfig.PortBindings}}' "$PROXY_CONTAINER")"
  "$NODE_BIN" deploy/builder/private-staging/proxy-bindings.mjs \
    --bindings-json "$PROXY_PORTS" \
    --output "$EVIDENCE_DIR/proxy-bindings.json" >/dev/null \
    || fail "proxy published ports are not the approved structure: $PROXY_PORTS"
  printf 'ok\tproxy:ports\t80/tcp=80,443/tcp=443,443/udp=443 wildcard-only\n' >> "$CHECKS"
  PROXY_NETWORKS="$("$ENGINE" inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$PROXY_CONTAINER")"
  shared=0
  while IFS= read -r network; do
    [[ -n "$network" ]] || continue
    if grep -qx "$network" <<< "$PROXY_NETWORKS"; then shared=1; fi
  done <<< "$NETWORKS"
  [[ "$shared" == "1" ]] || fail "proxy does not share the app network"
  printf 'ok\tproxy:internal-network\ttrue\n' >> "$CHECKS"
else
  printf 'skip\tproxy:inspection\tPROXY_CONTAINER not supplied\n' >> "$CHECKS"
fi

printf 'ok=true\n' > "$EVIDENCE_DIR/results.txt"
cat > "$EVIDENCE_DIR/identity.json" <<EOF
{
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$EXPECTED_IMAGE_ID",
  "origin": "$EXPECTED_ORIGIN"
}
EOF
note "Runtime acceptance passed; evidence: $EVIDENCE_DIR"
