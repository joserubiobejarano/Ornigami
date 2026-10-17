set -Eeuo pipefail
builder='ornigami-external-rehearsal'
if docker buildx ls --format '{{.Name}}' | grep -Fxq "$builder"; then
  echo 'Refusing to reuse an existing builder.' >&2
  exit 1
fi
builder_state_volume="buildx_buildkit_${builder}0_state"
if docker volume ls --format '{{.Name}}' | grep -Fxq "$builder_state_volume"; then
  echo 'Refusing to reuse an existing BuildKit state volume.' >&2
  exit 1
fi
printf '[worker.oci]\n  max-parallelism = 1\n' > "$RUNNER_TEMP/buildkitd.toml"
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt 'image=moby/buildkit:v0.33.1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea,memory=8g,memory-swap=8g,cpu-quota=300000,cpu-period=100000' \
  --buildkitd-config "$RUNNER_TEMP/buildkitd.toml" --use --bootstrap
mapfile -t ids < <(docker ps --no-trunc --filter "name=^/buildx_buildkit_${builder}0$" --format '{{.ID}}')
[[ ${#ids[@]} -eq 1 ]]
container_name=$(docker inspect "${ids[0]}" --format '{{.Name}}')
[[ "$container_name" == "/buildx_buildkit_${builder}0" ]]
printf 'builder_name=%s\nbuilder_container_id=%s\n' "$builder" "${ids[0]}" >> "$GITHUB_OUTPUT"
state_volume=$(docker inspect "${ids[0]}" --format '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/var/lib/buildkit")}}{{.Name}}{{end}}{{end}}')
[[ "$state_volume" == "$builder_state_volume" && "$state_volume" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]
printf 'builder_state_volume=%s\n' "$state_volume" >> "$GITHUB_OUTPUT"
docker inspect "${ids[0]}" --format 'memory={{.HostConfig.Memory}} memory_swap={{.HostConfig.MemorySwap}} cpu_quota={{.HostConfig.CpuQuota}} cpu_period={{.HostConfig.CpuPeriod}}'
[[ "$(docker inspect "${ids[0]}" --format '{{.HostConfig.Memory}}')" == 8589934592 ]]
[[ "$(docker inspect "${ids[0]}" --format '{{.HostConfig.MemorySwap}}')" == 8589934592 ]]
[[ "$(docker inspect "${ids[0]}" --format '{{.HostConfig.CpuQuota}}')" == 300000 ]]
[[ "$(docker inspect "${ids[0]}" --format '{{.HostConfig.CpuPeriod}}')" == 100000 ]]
docker exec "${ids[0]}" sh -c 'printf "memory.max="; cat /sys/fs/cgroup/memory.max; printf "memory.swap.max="; cat /sys/fs/cgroup/memory.swap.max; printf "cpu.max="; cat /sys/fs/cgroup/cpu.max'
[[ "$(docker exec "${ids[0]}" cat /sys/fs/cgroup/memory.max)" == 8589934592 ]]
[[ "$(docker exec "${ids[0]}" cat /sys/fs/cgroup/memory.swap.max)" == 0 ]]
[[ "$(docker exec "${ids[0]}" cat /sys/fs/cgroup/cpu.max)" == '300000 100000' ]]
docker exec "${ids[0]}" sh -c '
  for path in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat; do
    printf "==%s==\\n" "$path"
    cat "/sys/fs/cgroup/$path"
  done
' > "$RUNNER_TEMP/builder-before-build.txt"
{
  printf '%s\n' '### BuildKit cgroup limits'
  printf '%s\n' '- memory.max: 8589934592 bytes; memory.swap.max: 0 bytes (Docker memory and memory-swap both capped at 8 GiB total)'
  printf '%s\n' '- cpu.max: 300000 100000; BuildKit OCI worker max-parallelism: 1'
  printf '%s\n' '- Initial memory event and CPU counters captured before build; no retry is configured'
} >> "$ORNIGAMI_JOB_SUMMARY"

