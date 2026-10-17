set -Eeuo pipefail
[[ "$(uname -m)" == x86_64 ]]
docker info >/dev/null
docker buildx version
docker buildx ls
cpu_count=$(getconf _NPROCESSORS_ONLN)
total_mib=$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)
available_mib=$(awk '/^MemAvailable:/ {print int($2 / 1024)}' /proc/meminfo)
free_disk_bytes=$(df -PB1 "$RUNNER_TEMP" | awk 'NR == 2 {print $4}')
{
  printf '%s\n' '### Runner preflight'
  printf '%s\n' "- Online CPUs: ${cpu_count} (minimum 4)"
  printf '%s\n' "- Total memory: ${total_mib} MiB (minimum 14336 MiB)"
  printf '%s\n' "- Available memory before build: ${available_mib} MiB (minimum 12288 MiB)"
  printf '%s\n' "- Free runner disk before build: ${free_disk_bytes} bytes (minimum 10737418240)"
} >> "$ORNIGAMI_JOB_SUMMARY"
[[ "$cpu_count" =~ ^[0-9]+$ && "$cpu_count" -ge 4 ]]
[[ "$total_mib" =~ ^[0-9]+$ && "$total_mib" -ge 14336 ]]
[[ "$available_mib" =~ ^[0-9]+$ && "$available_mib" -ge 12288 ]]
[[ "$free_disk_bytes" =~ ^[0-9]+$ && "$free_disk_bytes" -ge 10737418240 ]]

