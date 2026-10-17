set +e
{
  printf '\n### Disk and Docker usage before cleanup\n\n'
  printf '%s\n' '```text'
  df -PB1 "$RUNNER_TEMP"
  docker system df
  for path in "$RUNNER_TEMP/source" "$RUNNER_TEMP/ornigami-image.tar" "$RUNNER_TEMP/trivy-cache" "$RUNNER_TEMP/trivy.db" "$RUNNER_TEMP/java-db"; do
    [[ -e "$path" ]] || continue
    du -sb "$path"
  done
  printf '%s\n' '```'
} >> "$GITHUB_STEP_SUMMARY" 2>&1
builder_actual_id=''
builder_actual_name=''
if [[ -n "$OWNED_BUILDER_CONTAINER_ID" ]]; then
  builder_actual_id=$(docker inspect "$OWNED_BUILDER_CONTAINER_ID" --format '{{.Id}}' 2>/dev/null || true)
  builder_actual_name=$(docker inspect "$OWNED_BUILDER_CONTAINER_ID" --format '{{.Name}}' 2>/dev/null || true)
fi
if [[ -n "$OWNED_BUILDER_CONTAINER_ID" && "$builder_actual_id" == "$OWNED_BUILDER_CONTAINER_ID" && "$builder_actual_name" == "/buildx_buildkit_${OWNED_BUILDER_NAME}0" && "$(docker inspect "$OWNED_BUILDER_CONTAINER_ID" --format '{{.State.Running}}' 2>/dev/null)" == true ]]; then
  docker exec "$OWNED_BUILDER_CONTAINER_ID" sh -c '
    for path in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat; do
      printf "==%s==\\n" "$path"
      cat "/sys/fs/cgroup/$path"
    done
  ' > "$RUNNER_TEMP/builder-final.txt"
  if [[ -s "$RUNNER_TEMP/builder-final.txt" ]]; then
    {
      printf '\n### Final builder cgroup counters before cleanup\n\n'
      printf '%s\n' '```text'
      cat "$RUNNER_TEMP/builder-final.txt"
      printf '%s\n' '```'
    } >> "$GITHUB_STEP_SUMMARY"
  fi
else
  printf '\n### Final builder cgroup counters\n\n- Unavailable: the exact BuildKit container created by this run was not present and running for capture.\n' >> "$GITHUB_STEP_SUMMARY"
fi
if [[ -n "$OWNED_BUILDER_CONTAINER_ID" && "$builder_actual_id" == "$OWNED_BUILDER_CONTAINER_ID" && "$builder_actual_name" == "/buildx_buildkit_${OWNED_BUILDER_NAME}0" ]]; then
  docker rm -f "$OWNED_BUILDER_CONTAINER_ID" >/dev/null 2>&1 || true
fi
if [[ -n "$OWNED_BUILDER_STATE_VOLUME" && "$builder_actual_id" == "$OWNED_BUILDER_CONTAINER_ID" && "$builder_actual_name" == "/buildx_buildkit_${OWNED_BUILDER_NAME}0" ]]; then
  state_volume=$(docker volume inspect "$OWNED_BUILDER_STATE_VOLUME" --format '{{.Name}}' 2>/dev/null || true)
  volume_users=$(docker ps -aq --filter "volume=$OWNED_BUILDER_STATE_VOLUME" --no-trunc 2>/dev/null || true)
  if [[ "$state_volume" == "$OWNED_BUILDER_STATE_VOLUME" && -z "$volume_users" ]]; then
    docker volume rm "$OWNED_BUILDER_STATE_VOLUME" >/dev/null 2>&1 || true
  else
    printf 'Preserved BuildKit state volume %s because it was unavailable or still attached.\n' "$OWNED_BUILDER_STATE_VOLUME" >> "$GITHUB_STEP_SUMMARY"
  fi
fi
if [[ -n "$OWNED_IMAGE_TAG" && -n "$OWNED_IMAGE_ID" ]]; then
  current_image_id=$(docker image inspect "$OWNED_IMAGE_TAG" --format '{{.Id}}' 2>/dev/null || true)
  if [[ "$current_image_id" == "$OWNED_IMAGE_ID" ]]; then
    docker image rm "$OWNED_IMAGE_TAG" >/dev/null 2>&1 || true
  fi
fi
rm -f -- "$RUNNER_TEMP/ornigami-image.tar" "$RUNNER_TEMP/node-base.tar" "$RUNNER_TEMP/trivy.json"
{
  printf '\n### Disk after cleanup\n\n'
  printf '%s\n' '```text'
  df -PB1 "$RUNNER_TEMP"
  printf '%s\n' '```'
} >> "$GITHUB_STEP_SUMMARY" 2>&1

if [[ -f "$RUNNER_TEMP/source/scripts/framework-prototype/serial-scan-driver.mjs" && -x "$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" ]]; then
  "$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" "$RUNNER_TEMP/source/scripts/framework-prototype/serial-scan-driver.mjs" cleanup | tee -a "$GITHUB_STEP_SUMMARY"
fi
