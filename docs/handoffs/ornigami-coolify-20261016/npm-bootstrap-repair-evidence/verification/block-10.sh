set -Eeuo pipefail
build_start_epoch=$(date +%s)
build_start_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "build_start_epoch=$build_start_epoch" >> "$GITHUB_OUTPUT"
echo "build_start_utc=$build_start_utc" >> "$GITHUB_OUTPUT"
build_rc=0
stop_file="$RUNNER_TEMP/ornigami-full-build-observer.stop"
node "$RUNNER_TEMP/source/scripts/framework-prototype/observe-buildkit.mjs" "$BUILDKIT_CONTAINER_ID" "$ORNIGAMI_EVIDENCE_DIR/runner/full-build-observations.jsonl" "$stop_file" > "$ORNIGAMI_EVIDENCE_DIR/runner/observer.log" 2>&1 &
observer_pid=$!
trap 'touch "$stop_file"; wait "$observer_pid" || true' EXIT
build_timeout=$(( ORNIGAMI_WORK_DEADLINE_EPOCH - $(date +%s) ))
[[ "$build_timeout" -gt 0 ]]
mkdir -p "$ORNIGAMI_EVIDENCE_DIR/build"
set +e
timeout --signal=TERM --kill-after=30s "$build_timeout"s docker buildx build \
  --builder ornigami-external-rehearsal \
  --platform linux/amd64 \
  --load \
  --tag "ornigami:rehearsal-${SOURCE_SHA}" \
  --build-arg NEXT_PUBLIC_APP_URL=https://rehearsal.invalid \
  --build-arg "ORNIGAMI_SOURCE_SHA=${SOURCE_SHA}" \
  --build-arg ORNIGAMI_BUILD_HEAP_MIB=4096 \
  --build-arg ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true \
  --build-arg ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false \
  --build-arg ORNIGAMI_BUILD_WEBPACK_WORKER=false \
  "$RUNNER_TEMP/source" 2>&1 | tee "$ORNIGAMI_EVIDENCE_DIR/build/stdout.log"
pipeline_status=("${PIPESTATUS[@]}")
build_rc=${pipeline_status[0]}
tee_rc=${pipeline_status[1]}
set -e
printf 'docker_exit_code=%s\nlog_exit_code=%s\n' "$build_rc" "$tee_rc" > "$ORNIGAMI_EVIDENCE_DIR/build/exit-code.txt"
if [[ "$build_rc" -eq 0 && "$tee_rc" -ne 0 ]]; then build_rc=$tee_rc; fi
build_end_epoch=$(date +%s)
build_end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
build_seconds=$((build_end_epoch - build_start_epoch))
echo "build_end_epoch=$build_end_epoch" >> "$GITHUB_OUTPUT"
echo "build_end_utc=$build_end_utc" >> "$GITHUB_OUTPUT"
echo "build_seconds=$build_seconds" >> "$GITHUB_OUTPUT"
echo "build_exit_code=$build_rc" >> "$GITHUB_OUTPUT"
builder_id=$(docker inspect "$BUILDKIT_CONTAINER_ID" --format '{{.Id}}' 2>/dev/null || true)
builder_name=$(docker inspect "$BUILDKIT_CONTAINER_ID" --format '{{.Name}}' 2>/dev/null || true)
if [[ "$builder_id" == "$BUILDKIT_CONTAINER_ID" && "$builder_name" == "/buildx_buildkit_${BUILDKIT_CONTAINER_NAME}0" ]]; then
  capture_rc=0
  docker exec "$builder_id" sh -c '
    for path in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat; do
      printf "==%s==\\n" "$path"
      cat "/sys/fs/cgroup/$path"
    done
  ' > "$RUNNER_TEMP/builder-after-build.txt" || capture_rc=$?
  {
    printf '\n### Build result and cgroup counters\n\n'
    printf '%s\n' "- Build interval: ${build_start_utc} to ${build_end_utc} UTC (${build_seconds} seconds)"
    printf '%s\n' "- Build command exit code: ${build_rc}"
    if [[ "$capture_rc" -eq 0 ]]; then
      printf '%s\n' '- Observed builder counters immediately after build:'
      printf '%s\n' '```text'
      cat "$RUNNER_TEMP/builder-after-build.txt"
      printf '%s\n' '```'
    else
      printf '%s\n' '- Builder cgroup counters unavailable after build; resource acceptance will fail if an image was produced.'
    fi
  } >> "$ORNIGAMI_JOB_SUMMARY"
else
  printf '\n### Build result\n\n- Build interval: %s to %s UTC (%s seconds)\n- Build command exit code: %s\n- Builder cgroup counters: unavailable; builder container not running\n' \
    "$build_start_utc" "$build_end_utc" "$build_seconds" "$build_rc" >> "$ORNIGAMI_JOB_SUMMARY"
fi
[[ "$build_rc" -eq 0 ]]
image="ornigami:rehearsal-${SOURCE_SHA}"
image_revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
image_platform=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')
image_id=$(docker image inspect "$image" --format '{{.Id}}')
[[ "$image_revision" == "$SOURCE_SHA" && "$image_platform" == linux/amd64 ]]
printf 'image_tag=%s\nimage_id=%s\n' "$image" "$image_id" >> "$GITHUB_OUTPUT"
printf '\n### Local image identity\n\n- Image ID: `%s`\n- Platform: `%s`\n- Source revision label: `%s`\n- Image delivery: local runner only; no image publication\n' \
  "$image_id" "$image_platform" "$image_revision" >> "$ORNIGAMI_JOB_SUMMARY"
{
  printf 'image_id=%s\nimage_platform=%s\nimage_revision=%s\n' "$image_id" "$image_platform" "$image_revision"
} > "$ORNIGAMI_EVIDENCE_DIR/image-identity.txt"

