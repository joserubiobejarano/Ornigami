#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  printf 'Usage: %s <40-character-candidate-commit-sha>\n' "$0" >&2
  printf 'Set ORNIGAMI_REHEARSAL_CONTROLPLANE_NAMES to a comma-separated exact allowlist of running control-plane container names.\n' >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
candidate_sha=$1
[[ $candidate_sha =~ ^[0-9a-f]{40}$ ]] || usage
: "${ORNIGAMI_REHEARSAL_CONTROLPLANE_NAMES:?Set the exact running control-plane container name allowlist}"
: "${ORNIGAMI_SOURCE_ARCHIVE:?Set the exact git archive file used to create this selective source context}"
: "${ORNIGAMI_SOURCE_ARCHIVE_SHA256:?Set the SHA-256 recorded when creating the git archive}"

short_sha=${candidate_sha:0:12}
builder="ornigami-rehearsal-${short_sha}"
image="ornigami:rehearsal-${candidate_sha}"
container="ornigami-rehearsal-${short_sha}"
cache_volume="ornigami-rehearsal-cache-${short_sha}"
report_dir="/var/tmp/ornigami-rehearsal-${short_sha}"
report="$report_dir/report.txt"
build_log="$report_dir/build.log"
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
started_epoch=$(date +%s)

[[ $ORNIGAMI_SOURCE_ARCHIVE_SHA256 =~ ^[0-9a-f]{64}$ && -f $ORNIGAMI_SOURCE_ARCHIVE ]] || {
  printf 'A readable source archive and its lowercase SHA-256 are required.\n' >&2
  exit 1
}
actual_archive_sha=$(sha256sum -- "$ORNIGAMI_SOURCE_ARCHIVE" | awk '{print $1}')
archive_commit=$(git get-tar-commit-id <"$ORNIGAMI_SOURCE_ARCHIVE")
[[ $actual_archive_sha == "$ORNIGAMI_SOURCE_ARCHIVE_SHA256" && $archive_commit == "$candidate_sha" ]] || {
  printf 'Source archive hash or embedded commit does not match the candidate SHA.\n' >&2
  exit 1
}
command -v docker >/dev/null || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null || { printf 'Docker daemon is unavailable.\n' >&2; exit 1; }

mem_available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
mem_available_mib=$((mem_available_kib / 1024))
if (( mem_available_mib < 2560 )); then
  printf 'Refusing rehearsal: only %s MiB host memory is available; need at least 2560 MiB.\n' "$mem_available_mib" >&2
  exit 1
fi
cpu_count=$(getconf _NPROCESSORS_ONLN)
load_1m=$(awk '{print $1}' /proc/loadavg)
if ! awk -v load="$load_1m" -v cpus="$cpu_count" 'BEGIN { exit !(load < cpus * 0.75) }'; then
  printf 'Refusing rehearsal: 1-minute host load %s is too high for %s online CPUs.\n' "$load_1m" "$cpu_count" >&2
  exit 1
fi

IFS=',' read -r -a allowed_names <<< "$ORNIGAMI_REHEARSAL_CONTROLPLANE_NAMES"
((${#allowed_names[@]} > 0)) || usage
for i in "${!allowed_names[@]}"; do
  allowed_names[$i]=$(printf '%s' "${allowed_names[$i]}" | xargs)
  [[ -n ${allowed_names[$i]} ]] || usage
done
mapfile -t running_names < <(docker ps --format '{{.Names}}')
for running_name in "${running_names[@]}"; do
  allowed=false
  for allowed_name in "${allowed_names[@]}"; do
    if [[ $running_name == "$allowed_name" ]]; then allowed=true; break; fi
  done
  if [[ $allowed != true ]]; then
    printf 'Refusing rehearsal: running container is outside the control-plane allowlist: %s\n' "$running_name" >&2
    exit 1
  fi
done

if docker buildx ls --format '{{.Name}}' | grep -Fxq "$builder"; then
  printf 'Refusing rehearsal: temporary builder name already exists: %s\n' "$builder" >&2
  exit 1
fi
if docker image inspect "$image" >/dev/null 2>&1; then
  printf 'Refusing rehearsal: candidate image tag already exists: %s\n' "$image" >&2
  exit 1
fi
if docker container inspect "$container" >/dev/null 2>&1 || docker volume inspect "$cache_volume" >/dev/null 2>&1; then
  printf 'Refusing rehearsal: a rehearsal container or cache volume already exists for this SHA.\n' >&2
  exit 1
fi
[[ ! -e "$report_dir" ]] || { printf 'Refusing to overwrite existing report directory: %s\n' "$report_dir" >&2; exit 1; }
mkdir -m 700 -- "$report_dir"

tmp_dir=$(mktemp -d /tmp/ornigami-buildkit.XXXXXX)
context_dir="$tmp_dir/source-context"
builder_created=false
container_created=false
volume_created=false
builder_id=''
build_started_epoch=''
build_elapsed_seconds=''
runtime_started=false

capture_cgroup() {
  local target_container=$1
  local prefix=$2
  docker exec "$target_container" sh -c '
    for path in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events /sys/fs/cgroup/cpu.max /sys/fs/cgroup/cpu.stat; do
      if [ -r "$path" ]; then printf "==%s==\n" "${path#/sys/fs/cgroup/}"; cat "$path"; fi
    done
  ' | awk '/^==[a-z0-9._-]+==$/ || /^[a-z_]+ [0-9]+$/ || /^[0-9]+( [0-9]+)?$/ || /^[0-9]+$/' >"$report_dir/${prefix}-cgroup.txt" || true
  docker exec "$target_container" sh -c '
    for status in /proc/[0-9]*/status; do
      [ -r "$status" ] || continue
      process_dir=${status%/status}
      executable=$(readlink "$process_dir/exe" 2>/dev/null || true)
      case "$executable" in
        */node)
        printf "==node-process==\n"
        awk "/^(Name|VmRSS|VmHWM):/ {print}" "$status"
          ;;
      esac
    done
  ' | awk '/^==node-process==$/ || /^(Name|VmRSS|VmHWM):[[:space:][:alnum:]_().-]+$/' >"$report_dir/${prefix}-process-memory.txt" || true
}

cleanup() {
  status=$?
  trap - EXIT
  if [[ -f $report && -n $build_started_epoch && -z $build_elapsed_seconds ]]; then
    printf 'build_elapsed_seconds=%s\n' "$(($(date +%s) - build_started_epoch))" >>"$report"
  fi
  if [[ -n $builder_id ]] && docker container inspect "$builder_id" >/dev/null 2>&1; then
    builder_state=$(docker inspect --format '{{.State.Status}}' "$builder_id" 2>/dev/null || printf unknown)
    builder_oom=$(docker inspect --format '{{.State.OOMKilled}}' "$builder_id" 2>/dev/null || printf unknown)
    builder_error=$(docker inspect --format '{{.State.Error}}' "$builder_id" 2>/dev/null | tr -cd '[:alnum:] _.-' | cut -c1-180)
    printf 'builder_state=%s\nbuilder_oom_killed=%s\nbuilder_state_error=%s\n' \
      "$builder_state" "$builder_oom" "${builder_error:-none}" >>"$report"
    capture_cgroup "$builder_id" builder
    if [[ -s $report_dir/builder-cgroup.txt ]]; then
      printf 'builder_cgroup_metrics=available\n' >>"$report"
    else
      printf 'builder_cgroup_metrics=unavailable\n' >>"$report"
    fi
  fi
  if [[ $runtime_started == true ]] && docker container inspect "$container" >/dev/null 2>&1; then
    capture_cgroup "$container" runtime-final
  fi
  finished_epoch=$(date +%s)
  if [[ -f $report ]]; then
    printf 'finished_at_utc=%s\nelapsed_total_seconds=%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((finished_epoch - started_epoch))" >>"$report"
  fi
  if [[ $container_created == true ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  if [[ $volume_created == true ]]; then
    docker volume rm "$cache_volume" >/dev/null 2>&1 || true
  fi
  if [[ $builder_created == true ]]; then
    docker buildx rm "$builder" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp_dir"
  if (( status != 0 )); then
    printf 'result=failed\nexit_status=%s\n' "$status" >>"$report"
    printf 'Rehearsal failed (exit %s); no retry was attempted. Candidate image, if created, is retained. Report: %s\n' "$status" "$report" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

mkdir -m 700 -- "$context_dir"
tar --extract --file="$ORNIGAMI_SOURCE_ARCHIVE" --directory="$context_dir" --no-same-owner
if find "$context_dir" -type l -print -quit | grep -q .; then
  printf 'Refusing a source archive containing symlinks.\n' >&2
  exit 1
fi
for required in Dockerfile .dockerignore compose.coolify.yaml scripts/coolify-image-rehearsal.sh package-lock.json; do
  [[ -f "$context_dir/$required" ]] || { printf 'Required source file missing: %s\n' "$required" >&2; exit 1; }
done
for private_path in .local .stripe-cli .vercel .claude .codex .npmrc; do
  [[ ! -e "$context_dir/$private_path" ]] || { printf 'Refusing a context containing private path: %s\n' "$private_path" >&2; exit 1; }
done
if find "$context_dir" -type f \
  \( -name '.env' -o \( -name '.env.*' ! -name '.env.example' \) -o -name '*.env' \
     -o \( -name '*.env.*' ! -name '*.env.example' \) -o -name '.npmrc' \
     -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \
     -o -name '*.crt' -o -name '*.cer' -o -name '*.der' \) -print -quit | grep -q .; then
  printf 'Refusing a build context containing an environment or key file.\n' >&2
  exit 1
fi

lock_hash=$(sha256sum "$context_dir/package-lock.json" | awk '{print $1}')
cat >"$tmp_dir/buildkitd.toml" <<'EOF'
[worker.oci]
  max-parallelism = 1
EOF

{
  printf 'candidate_sha=%s\n' "$candidate_sha"
  printf 'package_lock_sha256=%s\n' "$lock_hash"
  printf 'source_archive_sha256=%s\n' "$actual_archive_sha"
  printf 'started_at_utc=%s\n' "$started_at"
  printf 'host_mem_available_mib=%s\n' "$mem_available_mib"
  printf 'host_cpu_count=%s\n' "$cpu_count"
  printf 'host_load_1m=%s\n' "$load_1m"
  printf 'builder=%s\n' "$builder"
  printf 'builder_memory_limit=2147483648\n'
  printf 'builder_memory_swap_limit=2147483648\n'
  printf 'builder_cpu_quota=150000\n'
  printf 'builder_cpu_period=100000\n'
  printf 'builder_max_parallelism=1\n'
  printf 'build_node_heap_max=1408\n'
  printf 'build_next_worker_cpus=1\n'
  printf 'runtime_network=none\n'
  printf 'runtime_database_url=absent\n'
  printf 'runtime_real_provider_credentials=absent\n'
  printf 'runtime_sentry_credentials=absent\n'
} >"$report"

printf 'Creating isolated BuildKit builder with fixed resource limits.\n'
docker buildx create \
  --name "$builder" \
  --driver docker-container \
  --driver-opt 'memory=2g,memory-swap=2g,cpu-quota=150000,cpu-period=100000' \
  --buildkitd-config "$tmp_dir/buildkitd.toml" >/dev/null
builder_created=true
docker buildx inspect --bootstrap "$builder" >/dev/null
mapfile -t builder_ids < <(docker ps -q --filter "name=buildx_buildkit_${builder}")
((${#builder_ids[@]} == 1)) || { printf 'Could not uniquely identify the temporary BuildKit container.\n' >&2; exit 1; }
builder_id=${builder_ids[0]}

builder_limits=$(docker inspect --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.CpuQuota}}|{{.HostConfig.CpuPeriod}}' "$builder_id")
[[ $builder_limits == '2147483648|2147483648|150000|100000' ]] || {
  printf 'Temporary BuildKit resource limits do not match the required values: %s\n' "$builder_limits" >&2
  exit 1
}
printf 'builder_inspect_limits=%s\n' "$builder_limits" >>"$report"

build_started=$(date +%s)
build_started_epoch=$build_started
printf 'Building candidate image %s (no registry push).\n' "$image"
if ! docker buildx build \
  --builder "$builder" \
  --platform linux/amd64 \
  --provenance=false \
  --load \
  --build-arg NEXT_PUBLIC_APP_URL=https://rehearsal.invalid \
  --build-arg "ORNIGAMI_SOURCE_SHA=$candidate_sha" \
  --label "org.opencontainers.image.revision=$candidate_sha" \
  --tag "$image" \
  "$context_dir" >"$build_log" 2>&1; then
  tail -n 60 "$build_log" >&2
  exit 1
fi
build_finished=$(date +%s)
build_elapsed_seconds=$((build_finished - build_started))
printf 'build_elapsed_seconds=%s\n' "$build_elapsed_seconds" >>"$report"
printf 'build_log=%s\n' "$build_log" >>"$report"

image_info=$(docker image inspect --format '{{.Id}}|{{.Size}}|{{index .Config.Labels "org.opencontainers.image.revision"}}|{{index .Config.Labels "org.ornigami.public-origin"}}' "$image")
IFS='|' read -r image_id image_size image_revision image_origin <<<"$image_info"
[[ $image_revision == "$candidate_sha" && $image_origin == https://rehearsal.invalid ]] || {
  printf 'Candidate revision or build-origin label mismatch.\n' >&2
  exit 1
}
printf 'image_tag=%s\nimage_id=%s\nimage_size_bytes=%s\nimage_revision=%s\n' \
  "$image" "$image_id" "$image_size" "$image_revision" >>"$report"
printf 'image_public_origin=%s\n' "$image_origin" >>"$report"

capture_cgroup "$builder_id" builder
printf 'builder_cgroup_capture=%s\n' "$report_dir/builder-cgroup.txt" >>"$report"

runtime_args=(
  --detach
  --name "$container"
  --stop-timeout 45
  --label "org.ornigami.rehearsal.sha=$candidate_sha"
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
  --env NEXT_PUBLIC_APP_URL=https://rehearsal.invalid
  --env AUTH_URL=https://rehearsal.invalid
  --env AUTH_SECRET=rehearsal-only-synthetic-auth-secret-not-for-use
  --env GOOGLE_CLIENT_ID=rehearsal.invalid
  --env GOOGLE_CLIENT_SECRET=rehearsal-only-placeholder-not-a-provider-credential
  --env CRON_SECRET=rehearsal-only-synthetic-cron-secret-not-for-use
  --env OPENAI_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_REVIEW_BOOSTER_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_REVIEW_REPLIES_ENABLED=false
  --env ORNIGAMI_COOLIFY_CRON_PRIVACY_ENABLED=false
  --env ORNIGAMI_COOLIFY_REPLIES_ACCEPTED=false
  --env PRIVACY_ACCOUNT_DELETION_ENABLED=false
  --env PRIVACY_RETENTION_ENABLED=false
  --env PRIVACY_RETENTION_APPLY=false
  --env RESEND_RECONCILIATION_ENABLED=false
  "$image"
)

docker volume create "$cache_volume" >/dev/null
volume_created=true
docker run "${runtime_args[@]}" >/dev/null
container_created=true
runtime_started=true

request_status() {
  local path=$1 method=$2 body=${3-}
  docker exec "$container" node -e '
    const [path, method, body] = process.argv.slice(1);
    fetch(`http://127.0.0.1:3000${path}`, {
      method,
      body: method === "GET" ? undefined : body,
      headers: { "content-type": "application/json", authorization: "Bearer rehearsal-wrong-token" },
      redirect: "manual",
      signal: AbortSignal.timeout(1500),
    }).then(async (response) => {
      await response.body?.cancel();
      process.stdout.write(String(response.status));
    }).catch(() => process.exit(2));
  ' "$path" "$method" "$body"
}

expect_status() {
  local path=$1 method=$2 expected=$3 body=${4-} actual
  actual=$(request_status "$path" "$method" "$body")
  [[ $actual == "$expected" ]] || {
    printf 'Expected HTTP %s for %s %s, received %s.\n' "$expected" "$method" "$path" "$actual" >&2
    exit 1
  }
  printf 'http_%s_%s=%s\n' "$method" "${path//\//_}" "$actual" >>"$report"
}

wait_for_health() {
  local attempt
  for attempt in {1..40}; do
    if [[ $(request_status /robots.txt GET) == 200 ]]; then return 0; fi
    if [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then
      printf 'Rehearsal application container exited before health passed.\n' >&2
      return 1
    fi
    sleep 1
  done
  printf 'Rehearsal application did not pass its local HTTP healthcheck.\n' >&2
  return 1
}

wait_for_health
runtime_uid=$(docker exec "$container" id -u)
[[ $runtime_uid == 1000 ]] || { printf 'Runtime UID is not 1000.\n' >&2; exit 1; }
readonly_result=$(docker exec "$container" node -e '
  const fs = require("node:fs");
  try { fs.writeFileSync("/app/.rehearsal-write-probe", "x"); process.exit(2); }
  catch (error) { process.exit(error.code === "EROFS" || error.code === "EACCES" ? 0 : 3); }
' && printf rejected || printf writable)
[[ $readonly_result == rejected ]] || { printf 'Runtime root filesystem accepted a write.\n' >&2; exit 1; }
expect_status /api/cron/health GET 401
expect_status /api/cron/review-booster GET 401
expect_status /api/cron/review-replies GET 401
expect_status /api/cron/privacy GET 401
expect_status / GET 200
expect_status /login GET 200
expect_status /api/privacy/delete POST 503 '{}'
expect_status /api/audit/free-profile POST 503 '{}'

marker="/app/.next/cache/.rehearsal-${short_sha}"
docker exec "$container" node -e 'require("node:fs").writeFileSync(process.argv[1], "cache-volume-ok")' "$marker"
docker exec "$container" mkdir -m 700 /tmp/ornigami-cron-dispatch.lock
docker exec "$container" node -e '
  const fs = require("node:fs");
  try { fs.mkdirSync("/tmp/ornigami-cron-dispatch.lock"); process.exit(2); }
  catch (error) { process.exit(error.code === "EEXIST" ? 0 : 3); }
'
docker exec "$container" rmdir /tmp/ornigami-cron-dispatch.lock

runtime_limits=$(docker inspect --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.ReadonlyRootfs}}|{{.HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}' "$container")
[[ $runtime_limits == '805306368|805306368|750000000|128|true|none|null' || \
   $runtime_limits == '805306368|805306368|750000000|128|true|none|{}' ]] || {
  printf 'Runtime container limits do not match the required values: %s\n' "$runtime_limits" >&2
  exit 1
}
printf 'runtime_uid=%s\nruntime_inspect_limits=%s\nroot_write=rejected\ncron_tmp_lock=shared_tmpfs_atomic_mkdir\n' \
  "$runtime_uid" "$runtime_limits" >>"$report"
capture_cgroup "$container" runtime-first
printf 'runtime_cgroup_capture=%s\nruntime_process_memory_capture=%s\n' \
  "$report_dir/runtime-first-cgroup.txt" "$report_dir/runtime-first-process-memory.txt" >>"$report"
if [[ -s $report_dir/runtime-first-process-memory.txt ]]; then
  printf 'runtime_process_memory=available\n' >>"$report"
else
  printf 'runtime_process_memory=unavailable\n' >>"$report"
fi

docker restart --time 45 "$container" >/dev/null
wait_for_health
docker exec "$container" node -e '
  const fs = require("node:fs");
  if (fs.readFileSync(process.argv[1], "utf8") !== "cache-volume-ok") process.exit(1);
' "$marker"
printf 'cache_volume_restart_check=passed\n' >>"$report"

# Recreate only the named rehearsal container; the dedicated cache volume must retain its marker.
docker stop --time 45 "$container" >/dev/null
docker rm "$container" >/dev/null
container_created=false
docker run "${runtime_args[@]}" >/dev/null
container_created=true
wait_for_health
docker exec "$container" node -e '
  const fs = require("node:fs");
  if (fs.readFileSync(process.argv[1], "utf8") !== "cache-volume-ok") process.exit(1);
  fs.unlinkSync(process.argv[1]);
' "$marker"
printf 'cache_volume_recreate_check=passed\n' >>"$report"

printf 'result=passed\n' >>"$report"
printf 'Rehearsal passed. Local candidate image retained as %s; report: %s\n' "$image" "$report"
