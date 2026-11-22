#!/usr/bin/env bash
# Remove and verify only resources positively labelled as owned by this run.
set -Eeuo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
PROJECT="${PROJECT:?PROJECT is required}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR is required}"
mkdir -p "$EVIDENCE_DIR"

failures=0
errors=()
record_error() {
  failures=$((failures + 1))
  errors+=("$1")
  echo "FAIL: $1" >&2
}

container_ids="$("$DOCKER_BIN" ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null)" \
  || { record_error "container inventory failed"; container_ids=""; }
network_ids="$("$DOCKER_BIN" network ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null)" \
  || { record_error "network inventory failed"; network_ids=""; }
volume_names="$("$DOCKER_BIN" volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null)" \
  || { record_error "volume inventory failed"; volume_names=""; }

for id in $container_ids; do
  [[ -n "$id" ]] || continue
  if ! "$DOCKER_BIN" rm -f "$id" >/dev/null 2>&1; then
    record_error "container removal failed: $id"
  fi
  if "$DOCKER_BIN" inspect "$id" >/dev/null 2>&1; then
    record_error "container still present: $id"
  fi
done

for name in $network_ids; do
  [[ -n "$name" ]] || continue
  if ! "$DOCKER_BIN" network rm "$name" >/dev/null 2>&1; then
    record_error "network removal failed: $name"
  fi
  if "$DOCKER_BIN" network inspect "$name" >/dev/null 2>&1; then
    record_error "network still present: $name"
  fi
done

for name in $volume_names; do
  [[ -n "$name" ]] || continue
  if ! "$DOCKER_BIN" volume rm "$name" >/dev/null 2>&1; then
    record_error "volume removal failed: $name"
  fi
  if "$DOCKER_BIN" volume inspect "$name" >/dev/null 2>&1; then
    record_error "volume still present: $name"
  fi
done

remaining_containers="$("$DOCKER_BIN" ps -aq --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l)" \
  || { record_error "container absence check failed"; remaining_containers="unknown"; }
remaining_networks="$("$DOCKER_BIN" network ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l)" \
  || { record_error "network absence check failed"; remaining_networks="unknown"; }
remaining_volumes="$("$DOCKER_BIN" volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null | wc -l)" \
  || { record_error "volume absence check failed"; remaining_volumes="unknown"; }

[[ "$remaining_containers" == "0" ]] || record_error "owned containers remain: $remaining_containers"
[[ "$remaining_networks" == "0" ]] || record_error "owned networks remain: $remaining_networks"
[[ "$remaining_volumes" == "0" ]] || record_error "owned volumes remain: $remaining_volumes"

{
  printf 'project=%s\n' "$PROJECT"
  printf 'container_inventory=%s\n' "$(printf '%s' "$container_ids" | wc -w)"
  printf 'network_inventory=%s\n' "$(printf '%s' "$network_ids" | wc -w)"
  printf 'volume_inventory=%s\n' "$(printf '%s' "$volume_names" | wc -w)"
  printf 'remaining_containers=%s\n' "$remaining_containers"
  printf 'remaining_networks=%s\n' "$remaining_networks"
  printf 'remaining_volumes=%s\n' "$remaining_volumes"
  printf 'cleanup_failures=%s\n' "$failures"
  for error in "${errors[@]}"; do printf 'error=%s\n' "$error"; done
} > "$EVIDENCE_DIR/cleanup-receipt.txt"

cat "$EVIDENCE_DIR/cleanup-receipt.txt"
exit "$(( failures > 0 ? 1 : 0 ))"
