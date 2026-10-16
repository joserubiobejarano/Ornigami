#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  printf 'Usage: %s IMAGE\n' "$0" >&2
  printf 'Optional SOURCE_SHA must match the image OCI revision label. No secrets or network access are used.\n' >&2
  exit 2
}

if [[ $# -eq 1 && $1 == --help ]]; then
  printf 'Usage: %s IMAGE\n' "$0"
  printf 'Optional SOURCE_SHA must match the image OCI revision label. No secrets or network access are used.\n'
  exit 0
fi
[[ $# -eq 1 ]] || usage
image=$1
[[ $image =~ ^[A-Za-z0-9][A-Za-z0-9._/:@-]*$ ]] || usage
source_sha=${SOURCE_SHA:-}
if [[ -n $source_sha && ! $source_sha =~ ^[0-9a-f]{40}$ ]]; then
  printf 'SOURCE_SHA must be a full lowercase 40-character SHA.\n' >&2
  exit 2
fi
command -v docker >/dev/null || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null || { printf 'Docker daemon is unavailable.\n' >&2; exit 1; }

image_id=$(docker image inspect --format '{{.Id}}' "$image")
image_size=$(docker image inspect --format '{{.Size}}' "$image")
image_platform=$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")
image_user=$(docker image inspect --format '{{.Config.User}}' "$image")
image_revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
image_origin=$(docker image inspect --format '{{index .Config.Labels "org.ornigami.public-origin"}}' "$image")
[[ $image_platform == linux/amd64 && ( $image_user == node || $image_user == 1000:1000 ) ]] || {
  printf 'Image must be linux/amd64 and configured for its nonroot Node user.\n' >&2
  exit 1
}
[[ $image_revision =~ ^[0-9a-f]{40}$ ]] || { printf 'Image revision label is missing or invalid.\n' >&2; exit 1; }
if [[ -n $source_sha && $image_revision != "$source_sha" ]]; then
  printf 'Image revision label does not match SOURCE_SHA.\n' >&2
  exit 1
fi
[[ $image_origin == https://rehearsal.invalid ]] || {
  printf 'Image origin label must be the fictional rehearsal origin.\n' >&2
  exit 1
}

short_sha=${image_revision:0:12}
run_id=$(cat /proc/sys/kernel/random/uuid)
name="ornigami-runtime-${short_sha}-${run_id}"
cache_volume="ornigami-runtime-cache-${short_sha}-${run_id}"
report_root=${RUNNER_TEMP:-/tmp}
report_dir="$report_root/ornigami-runtime-acceptance-${short_sha}-${run_id}"
report="$report_dir/report.txt"
mkdir -m 700 -- "$report_dir"
container_created=false
volume_created=false
final_result=failed
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
started_epoch=$(date +%s)

capture_cgroup() {
  local target=$1 prefix=$2
  if ! docker exec "$target" sh -c '
    for path in memory.max memory.swap.max memory.current memory.peak memory.events memory.stat memory.pressure cpu.max cpu.stat pids.max; do
      if [ -r "/sys/fs/cgroup/$path" ]; then printf "==%s==\n" "$path"; cat "/sys/fs/cgroup/$path"; fi
    done
  ' >"$report_dir/${prefix}-cgroup.txt" 2>&1; then
    printf 'Cgroup capture failed for %s.\n' "$target" >&2
    return 1
  fi
  for key in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat pids.max; do
    grep -Fxq "==$key==" "$report_dir/${prefix}-cgroup.txt" || {
      printf 'Cgroup metric %s is missing for %s.\n' "$key" "$target" >&2
      return 1
    }
  done
}

assert_cgroup_metrics() {
  local file=$1
  awk '
    /^==memory.max==$/ { if (getline <= 0 || $0 != "805306368") exit 1; memory=1; next }
    /^==memory.swap.max==$/ { if (getline <= 0 || $0 != "0") exit 1; swap=1; next }
    /^==memory.peak==$/ { if (getline <= 0 || $0 !~ /^[0-9]+$/ || $0 == "0") exit 1; peak=1; next }
    /^==cpu.max==$/ { if (getline <= 0 || $0 != "75000 100000") exit 1; cpu=1; next }
    /^==pids.max==$/ { if (getline <= 0 || $0 != "128") exit 1; pids=1; next }
    /^==cpu.stat==$/ { in_cpu=1; next }
    /^==memory.events==$/ { in_events=1; next }
    /^==/ { in_cpu=0; in_events=0; next }
    in_cpu && $1 == "usage_usec" && $2 ~ /^[0-9]+$/ { usage=1 }
    in_events && $1 == "oom" { if ($2 != "0") exit 1; oom=1 }
    in_events && $1 == "oom_kill" { if ($2 != "0") exit 1; oom_kill=1 }
    END { if (!(memory && swap && peak && cpu && pids && usage && oom && oom_kill)) exit 1 }
  ' "$file" || {
    printf 'Cgroup limits, CPU accounting, or OOM counters failed validation in %s.\n' "$file" >&2
    return 1
  }
}

capture_runtime_state() {
  if [[ $container_created == true ]] && docker container inspect "$name" >/dev/null 2>&1; then
    docker inspect --format 'state={{.State.Status}} oom_killed={{.State.OOMKilled}} exit_code={{.State.ExitCode}} memory={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} nanocpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} readonly={{.HostConfig.ReadonlyRootfs}} network={{.HostConfig.NetworkMode}} port_bindings={{json .HostConfig.PortBindings}}' "$name" \
      >>"$report" 2>/dev/null || true
    capture_cgroup "$name" runtime-final || true
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  capture_runtime_state
  if [[ $final_result != passed ]]; then
    printf 'result=failed\nexit_status=%s\n' "$status" >>"$report"
  fi
  if [[ $container_created == true ]]; then docker rm -f "$name" >/dev/null 2>&1 || true; fi
  if [[ $volume_created == true ]]; then docker volume rm "$cache_volume" >/dev/null 2>&1 || true; fi
  printf 'report=%s\n' "$report"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'image=%s\nimage_id=%s\nimage_size_bytes=%s\nimage_platform=%s\nimage_user=%s\nimage_revision=%s\nimage_origin=%s\nstarted_at_utc=%s\n' \
  "$image" "$image_id" "$image_size" "$image_platform" "$image_user" "$image_revision" "$image_origin" "$started_at" >"$report"
df -Pk / "$report_root" >"$report_dir/host-disk-before.txt" 2>&1 || true

runtime_args=(
  --detach
  --name "$name"
  --stop-timeout 45
  --label "org.ornigami.acceptance.revision=$image_revision"
  --network none
  --read-only
  --user 1000:1000
  --init
  --memory 768m
  --memory-swap 768m
  --cpus 0.75
  --pids-limit 128
  --cap-drop ALL
  --security-opt no-new-privileges:true
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777
  --mount "type=volume,src=$cache_volume,dst=/app/.next/cache"
  --env NODE_ENV=production
  --env HOSTNAME=0.0.0.0
  --env PORT=3000
  --env NODE_OPTIONS=--max-old-space-size=512
  --env NEXT_TELEMETRY_DISABLED=1
  --env NEXT_PUBLIC_APP_URL=https://rehearsal.invalid
  --env AUTH_URL=https://rehearsal.invalid
  --env AUTH_SECRET=rehearsal-only-synthetic-auth-secret-not-for-use
  --env GOOGLE_CLIENT_ID=rehearsal.invalid
  --env GOOGLE_CLIENT_SECRET=rehearsal-only-placeholder-not-a-provider-credential
  --env CRON_SECRET=rehearsal-only-synthetic-cron-secret-not-for-use
  --env TOKEN_ENCRYPTION_KEY=rehearsal-only-synthetic-token-key-not-for-use
  --env REVIEW_BOOSTER_UNSUBSCRIBE_SECRET=rehearsal-only-synthetic-unsubscribe-secret-not-for-use
  --env OPENAI_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED=false
  --env ORNIGAMI_COOLIFY_REPLIES_ACCEPTED=false
  --env RESEND_RECONCILIATION_ENABLED=false
  --env PRIVACY_ACCOUNT_DELETION_ENABLED=false
  --env PRIVACY_RETENTION_ENABLED=false
  --env PRIVACY_RETENTION_APPLY=false
  "$image"
)

docker volume create "$cache_volume" >/dev/null
volume_created=true
docker run "${runtime_args[@]}" >/dev/null
container_created=true

wait_for_health() {
  local attempt state
  for attempt in {1..60}; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$name")
    [[ $state == healthy ]] && return 0
    [[ $state != unhealthy && $state != missing ]] || {
      printf 'Container health failed: %s.\n' "$state" >&2
      docker logs --tail 40 "$name" >&2 || true
      return 1
    }
    if [[ $(docker inspect --format '{{.State.Running}}' "$name") != true ]]; then
      printf 'Application container exited before HTTP health passed.\n' >&2
      docker logs --tail 40 "$name" >&2 || true
      return 1
    fi
    sleep 2
  done
  printf 'Application did not become healthy within 120 seconds.\n' >&2
  docker logs --tail 40 "$name" >&2 || true
  return 1
}

cache_listing() {
  docker exec "$name" node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const root = "/app/.next/cache/images";
    const files = [];
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) files.push([path.relative(root, file), fs.statSync(file).size, require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex")]);
      }
    }
    walk(root);
    files.sort((a, b) => a[0].localeCompare(b[0]));
    process.stdout.write(JSON.stringify(files));
  '
}

verify_runtime_config() {
  local observed
  observed=$(docker exec "$name" node -e '
    const fs = require("node:fs");
    const expected = [
      "OPENAI_ENABLED", "ORNIGAMI_COOLIFY_CRON_ENABLED",
      "ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED",
      "ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED",
      "ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED", "ORNIGAMI_COOLIFY_REPLIES_ACCEPTED",
      "RESEND_RECONCILIATION_ENABLED", "PRIVACY_ACCOUNT_DELETION_ENABLED",
      "PRIVACY_RETENTION_ENABLED", "PRIVACY_RETENTION_APPLY",
    ];
    if (expected.some((name) => process.env[name] !== "false")) process.exit(1);
    if (["DATABASE_URL", "OPENAI_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "SENTRY_AUTH_TOKEN"].some((name) => process.env[name])) process.exit(2);
    if (process.env.GOOGLE_CLIENT_ID !== "rehearsal.invalid" || process.env.GOOGLE_CLIENT_SECRET !== "rehearsal-only-placeholder-not-a-provider-credential"
      || process.env.AUTH_SECRET !== "rehearsal-only-synthetic-auth-secret-not-for-use"
      || process.env.CRON_SECRET !== "rehearsal-only-synthetic-cron-secret-not-for-use"
      || process.env.TOKEN_ENCRYPTION_KEY !== "rehearsal-only-synthetic-token-key-not-for-use"
      || process.env.REVIEW_BOOSTER_UNSUBSCRIBE_SECRET !== "rehearsal-only-synthetic-unsubscribe-secret-not-for-use") process.exit(3);
    process.stdout.write("all_features_disabled;no_database_or_provider_secrets;synthetic_google_only");
  ')
  printf 'runtime_env=%s\n' "$observed" >>"$report"
}

verify_runtime_config
wait_for_health
runtime_uid=$(docker exec "$name" id -u)
[[ $runtime_uid == 1000 ]] || { printf 'Runtime UID is not 1000.\n' >&2; exit 1; }
readonly_result=$(docker exec "$name" node -e '
  const fs = require("node:fs");
  try { fs.writeFileSync("/app/.rehearsal-write-probe", "x"); process.exit(2); }
  catch (error) { process.exit(error.code === "EROFS" || error.code === "EACCES" ? 0 : 3); }
' && printf rejected || printf writable)
[[ $readonly_result == rejected ]] || { printf 'Runtime root filesystem accepted a write.\n' >&2; exit 1; }
docker exec "$name" node -e 'require("node:fs").writeFileSync("/tmp/rehearsal-write-probe", "ok")'

runtime_limits=$(docker inspect --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}' "$name")
expected_limits_prefix='805306368|805306368|750000000|128|true|none|'
expected_limits_suffix='|["ALL"]|["no-new-privileges:true"]'
[[ $runtime_limits == "${expected_limits_prefix}null${expected_limits_suffix}" || \
   $runtime_limits == "${expected_limits_prefix}{}${expected_limits_suffix}" ]] || {
  printf 'Runtime container limits do not match expected values: %s\n' "$runtime_limits" >&2
  exit 1
}
docker exec "$name" node -e '
  const fs = require("node:fs");
  const read = (name) => fs.readFileSync(`/sys/fs/cgroup/${name}`, "utf8").trim();
  if (read("memory.max") !== "805306368" || read("memory.swap.max") !== "0" || read("cpu.max") !== "75000 100000" || read("pids.max") !== "128") process.exit(1);
  const events = Object.fromEntries(read("memory.events").split("\n").map((line) => line.split(/\s+/)));
  if (events.oom_kill !== "0") process.exit(2);
'
printf 'runtime_uid=%s\nruntime_inspect_limits=%s\nroot_write=rejected\ntmp_write=allowed\n' "$runtime_uid" "$runtime_limits" >>"$report"

docker exec -i "$name" node --input-type=module - <<'NODE' >"$report_dir/http-cold.txt" 2>&1
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const base = "http://127.0.0.1:3000";
async function request(path, init = {}) {
  return fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
}
async function expectStatus(path, status, init) {
  const response = await request(path, init);
  assert.equal(response.status, status, `${path} expected ${status}, got ${response.status}`);
  return response;
}
async function expectLoginRedirect(path, init) {
  const response = await request(path, init);
  assert.ok([302, 303, 307, 308].includes(response.status), `${path} expected login redirect, got ${response.status}`);
  const location = new URL(response.headers.get("location"), base);
  assert.equal(location.origin, "https://rehearsal.invalid", `${path} did not use the configured canonical origin`);
  assert.equal(location.pathname, "/login", `${path} did not redirect to login`);
  await response.body?.cancel();
}
function rawRequest(path, headers) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: 3000, path, method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("HTTP request timed out")));
    req.once("error", reject);
    req.end();
  });
}
function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
}
function assertCsp(response) {
  const csp = response.headers.get("content-security-policy") ?? "";
  const scriptPolicy = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] ?? "";
  assert.ok(scriptPolicy, "CSP has no script-src");
  assert.doesNotMatch(scriptPolicy, /'unsafe-(?:inline|eval)'/);
  const nonce = scriptPolicy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "dynamic response CSP has no nonce");
  return nonce;
}
function walkHtml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walkHtml(path) : entry.isFile() && path.endsWith(".html") ? [path] : [];
  });
}

const appOutput = "/app/.next/server/app";
const manifestPath = "/app/.next/static-csp-hashes.json";
assert.ok(existsSync(manifestPath), "static CSP hash manifest is missing");
const builtHashes = new Set();
const staticScript = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
for (const file of walkHtml(appOutput)) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(staticScript)) {
    if (match[1]) builtHashes.add(createHash("sha256").update(match[1], "utf8").digest("base64"));
  }
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(manifest.length > 0, "static CSP manifest contains no hashes");
assert.deepEqual([...builtHashes].sort(), manifest, "static CSP manifest does not match built HTML");

const home = await expectStatus("/", 200);
assert.match(home.headers.get("content-type") ?? "", /text\/html/);
assertSecurityHeaders(home);
const nonce = assertCsp(home);
const html = await home.text();
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const inline = scripts.filter(([, attrs, body]) => {
  const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const executable = !type || type === "module" || /^(?:text|application)\/(?:javascript|ecmascript)$/.test(type);
  return !/\bsrc\s*=/.test(attrs) && executable && body.trim();
});
assert.ok(inline.length > 0, "landing page has no inline hydration scripts");
for (const [, attrs] of inline) assert.equal(attrs.match(/\bnonce=["']([^"']+)["']/i)?.[1], nonce, "inline script nonce mismatches CSP");

let verifiedSRI = 0;
for (const [, attrs] of scripts) {
  const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
  if (!src) continue;
  const assetUrl = new URL(src, base);
  assert.equal(assetUrl.origin, base, `unexpected external script source ${assetUrl.origin}`);
  const integrity = attrs.match(/\bintegrity=["']([^"']+)["']/i)?.[1];
  assert.match(integrity ?? "", /^sha256-[A-Za-z0-9+/]+=*$/i, `script ${assetUrl.pathname} lacks SHA-256 SRI`);
  const asset = await request(assetUrl.pathname + assetUrl.search);
  assert.equal(asset.status, 200, `script asset ${assetUrl.pathname} did not load`);
  const bytes = Buffer.from(await asset.arrayBuffer());
  const actual = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
  assert.equal(actual, integrity, `SRI digest mismatch for ${assetUrl.pathname}`);
  verifiedSRI++;
}
assert.ok(verifiedSRI > 0, "landing page had no SRI-protected script assets");

const login = await expectStatus("/login", 200);
assertSecurityHeaders(login);
const loginNonce = assertCsp(login);
assert.notEqual(loginNonce, nonce, "CSP nonce did not rotate between requests");
await expectLoginRedirect("/dashboard");
const hostileDashboard = await rawRequest("/dashboard", {
  host: "attacker.invalid",
  "x-forwarded-host": "attacker.invalid",
  "x-forwarded-proto": "http",
});
assert.ok([302, 303, 307, 308].includes(hostileDashboard.status), "hostile forwarded host request must remain a login redirect");
const hostileLocation = new URL(hostileDashboard.headers.location, base);
assert.equal(hostileLocation.origin, "https://rehearsal.invalid", "application redirect accepted hostile host/protocol headers");
assert.equal(hostileLocation.pathname, "/login");
const robots = await expectStatus("/robots.txt", 200);
await robots.body?.cancel();
const og = await expectStatus("/opengraph-image", 200);
assert.match(og.headers.get("content-type") ?? "", /image\/png/);
assert.deepEqual([...new Uint8Array(await og.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

const session = await expectStatus("/api/auth/session", 200);
assert.equal(await session.json(), null, "anonymous Auth.js session should be empty");
await expectLoginRedirect("/api/google/oauth/start");
await expectLoginRedirect("/api/stripe/checkout", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_id: "replies", billing_period: "monthly" }),
});
const openai = await expectStatus("/api/openai/review-reply", 403, {
  method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: "{}",
});
await openai.body?.cancel();
const deletion = await expectStatus("/api/privacy/delete", 503, {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}",
});
await deletion.body?.cancel();
for (const path of ["/api/cron/health", "/api/cron/review-booster", "/api/cron/review-replies", "/api/cron/privacy"]) {
  const missing = await expectStatus(path, 401);
  await missing.body?.cancel();
  const wrong = await expectStatus(path, 401, { headers: { authorization: "Bearer rehearsal-wrong-token" } });
  await wrong.body?.cancel();
}

const image = await expectStatus("/_next/image?url=%2Fornigami-mark-32.png&w=64&q=75", 200, { headers: { accept: "image/webp" } });
assert.match(image.headers.get("content-type") ?? "", /^image\//);
const imageBytes = Buffer.from(await image.arrayBuffer());
assert.ok(imageBytes.byteLength > 0, "optimized image response is empty");
const imageHash = createHash("sha256").update(imageBytes).digest("hex");
const cacheHeader = image.headers.get("x-nextjs-cache") ?? "unavailable";
console.log(`HTTP acceptance passed: CSP static manifest parity, nonce hydration, ${verifiedSRI} verified SRI assets, security headers, anonymous auth/provider boundaries, cron rejects, and image optimization.`);
console.log(`static_csp_hash_count=${manifest.length}`);
console.log(`sri_assets_verified=${verifiedSRI}`);
console.log(`hostile_forwarded_redirect_origin=${hostileLocation.origin}`);
console.log(`image_cache_body_sha256=${imageHash}`);
console.log(`image_cache_status_header=${cacheHeader}`);
NODE

if [[ ! -s $report_dir/http-cold.txt ]]; then
  printf 'Cold HTTP acceptance output was not captured.\n' >&2
  exit 1
fi

cache_before=$(cache_listing)
[[ $cache_before != '[]' ]] || { printf 'Next image optimization did not populate its named cache volume.\n' >&2; exit 1; }
static_csp_count=$(sed -n 's/^static_csp_hash_count=//p' "$report_dir/http-cold.txt")
sri_assets_verified=$(sed -n 's/^sri_assets_verified=//p' "$report_dir/http-cold.txt")
cold_image_hash=$(sed -n 's/^image_cache_body_sha256=//p' "$report_dir/http-cold.txt")
hostile_origin=$(sed -n 's/^hostile_forwarded_redirect_origin=//p' "$report_dir/http-cold.txt")
[[ $static_csp_count =~ ^[1-9][0-9]*$ && $sri_assets_verified =~ ^[1-9][0-9]*$ && $cold_image_hash =~ ^[0-9a-f]{64}$ && $hostile_origin == https://rehearsal.invalid ]] || {
  cat "$report_dir/http-cold.txt" >&2
  printf 'Cold HTTP acceptance metrics were missing or invalid.\n' >&2
  exit 1
}
printf 'static_csp_hash_count=%s\nsri_assets_verified=%s\nhostile_forwarded_redirect_origin=%s\nimage_cache_body_sha256=%s\n' \
  "$static_csp_count" "$sri_assets_verified" "$hostile_origin" "$cold_image_hash" >>"$report"
printf 'next_image_cache_before_restart=%s\n' "$cache_before" >>"$report"
container_id_before_restart=$(docker inspect --format '{{.Id}}' "$name")
cache_mount_before_restart=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/.next/cache"}}{{.Name}}{{end}}{{end}}' "$name")
[[ $cache_mount_before_restart == "$cache_volume" ]] || { printf 'Expected cache volume is not mounted.\n' >&2; exit 1; }
printf 'container_id_before_restart=%s\ncache_volume=%s\ncache_mount_before_restart=%s\nimage_id_before_restart=%s\n' \
  "$container_id_before_restart" "$cache_volume" "$cache_mount_before_restart" "$image_id" >>"$report"
capture_cgroup "$name" runtime-first
assert_cgroup_metrics "$report_dir/runtime-first-cgroup.txt"

verify_image_cache_hit() {
  local phase=$1 result digest header
  result=$(docker exec "$name" node --input-type=module -e '
    import { createHash } from "node:crypto";
    const response = await fetch("http://127.0.0.1:3000/_next/image?url=%2Fornigami-mark-32.png&w=64&q=75", {
      headers: { accept: "image/webp" }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) process.exit(1);
    const bytes = Buffer.from(await response.arrayBuffer());
    process.stdout.write(`${createHash("sha256").update(bytes).digest("hex")}\t${response.headers.get("x-nextjs-cache") ?? "unavailable"}`);
  ')
  IFS=$'\t' read -r digest header <<<"$result"
  [[ $digest == "$cold_image_hash" ]] || {
    printf 'Optimized image bytes changed after %s.\n' "$phase" >&2
    return 1
  }
  if [[ -n $header && $header != unavailable ]]; then
    [[ ${header^^} == HIT || ${header^^} == REVALIDATED ]] || {
      printf 'Next image cache response after %s was not a hit: %s\n' "$phase" "$header" >&2
      return 1
    }
    printf 'image_cache_%s=hit (%s)\n' "$phase" "$header" >>"$report"
  else
    printf 'image_cache_%s=content_hash_and_file_continuity_only;hit_header_unavailable\n' "$phase" >>"$report"
  fi
}

docker restart --time 45 "$name" >/dev/null
wait_for_health
container_id_after_restart=$(docker inspect --format '{{.Id}}' "$name")
[[ $container_id_after_restart == "$container_id_before_restart" ]] || { printf 'Container ID changed during restart.\n' >&2; exit 1; }
docker exec "$name" node -e 'fetch("http://127.0.0.1:3000/",{redirect:"manual",signal:AbortSignal.timeout(5000)}).then(async r=>{if(r.status!==200||!r.headers.get("content-security-policy"))process.exit(1);await r.body?.cancel()}).catch(()=>process.exit(2))'
verify_image_cache_hit restart
cache_after_restart=$(cache_listing)
[[ $cache_after_restart == "$cache_before" ]] || { printf 'Next image cache did not persist unchanged across container restart.\n' >&2; exit 1; }
printf 'container_id_after_restart=%s\nrestart_http=200_with_csp\nnext_image_cache_restart=persisted\n' "$container_id_after_restart" >>"$report"
capture_cgroup "$name" runtime-after-restart
assert_cgroup_metrics "$report_dir/runtime-after-restart-cgroup.txt"

docker stop --time 45 "$name" >/dev/null
docker rm "$name" >/dev/null
container_created=false
docker run "${runtime_args[@]}" >/dev/null
container_created=true
verify_runtime_config
wait_for_health
container_id_after_recreate=$(docker inspect --format '{{.Id}}' "$name")
[[ $container_id_after_recreate != "$container_id_before_restart" ]] || { printf 'Container ID did not change during recreation.\n' >&2; exit 1; }
image_id_after_recreate=$(docker inspect --format '{{.Image}}' "$name")
[[ $image_id_after_recreate == "$image_id" ]] || { printf 'Image ID changed during recreation.\n' >&2; exit 1; }
cache_mount_after_recreate=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/.next/cache"}}{{.Name}}{{end}}{{end}}' "$name")
[[ $cache_mount_after_recreate == "$cache_volume" ]] || { printf 'Cache volume changed during recreation.\n' >&2; exit 1; }
docker exec "$name" node -e 'fetch("http://127.0.0.1:3000/",{redirect:"manual",signal:AbortSignal.timeout(5000)}).then(async r=>{if(r.status!==200||!r.headers.get("content-security-policy"))process.exit(1);await r.body?.cancel()}).catch(()=>process.exit(2))'
verify_image_cache_hit recreate
cache_after_recreate=$(cache_listing)
[[ $cache_after_recreate == "$cache_before" ]] || { printf 'Next image cache did not persist unchanged across container recreation.\n' >&2; exit 1; }
printf 'container_id_after_recreate=%s\ncontainer_identity_check=restart_same_recreate_new\nimage_identity_check=same_image_id_across_recreate\nimage_id_after_recreate=%s\ncache_volume_identity_check=same_named_volume_across_recreate\ncache_mount_after_recreate=%s\nrecreate_http=200_with_csp\nnext_image_cache_recreate=persisted\n' \
  "$container_id_after_recreate" "$image_id_after_recreate" "$cache_mount_after_recreate" >>"$report"
capture_cgroup "$name" runtime-after-recreate
assert_cgroup_metrics "$report_dir/runtime-after-recreate-cgroup.txt"
docker exec "$name" df -Pk / /tmp /app/.next/cache >"$report_dir/runtime-disk.txt" 2>&1 || true
df -Pk / "$report_root" >"$report_dir/host-disk-after.txt" 2>&1 || true

if grep -Eq '^oom_kill[[:space:]]+([1-9][0-9]*)$' "$report_dir/runtime-first-cgroup.txt" "$report_dir/runtime-after-restart-cgroup.txt" "$report_dir/runtime-after-recreate-cgroup.txt"; then
  printf 'Runtime cgroup reported an OOM kill.\n' >&2
  exit 1
fi
printf 'cache_persistence_scope=next_image_cache_volume_only;does_not_accept_database_or_media_storage\n' >>"$report"
finished_epoch=$(date +%s)
printf 'finished_at_utc=%s\nruntime_elapsed_seconds=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((finished_epoch - started_epoch))" >>"$report"
printf 'result=passed\nruntime_cgroup_metrics=runtime-first-cgroup.txt,runtime-after-restart-cgroup.txt,runtime-after-recreate-cgroup.txt\n' >>"$report"
final_result=passed
printf 'Linux runtime acceptance passed for %s. Local image retained; runtime container and cache volume will be removed.\n' "$image"
