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
command -v python3 >/dev/null || { printf 'Python 3 is required for sanitized acceptance receipts.\n' >&2; exit 1; }
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
stderr_raw="$report_dir/stderr.raw"
exec 3>&2
exec 2>"$stderr_raw"
container_created=false
volume_created=false
owned_container_id=
final_result=failed
cold_http_failed=false
cache_check_failed=false
restart_http_passed=false
recreate_http_passed=false
restart_cache_passed=false
recreate_cache_passed=false
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
started_epoch=$(date +%s)
failure_line=
failure_command=

record_error_context() {
  local status=$1 line=$2 command=$3
  if [[ -z $failure_line ]]; then
    failure_line=$line
    printf -v failure_command '%q' "$command"
    failure_status=$status
  fi
  return 0
}

trap 'record_error_context "$?" "$LINENO" "$BASH_COMMAND"' ERR

sanitize_file() {
  python3 - "$1" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read(65536)
text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s]+@", r"\1[REDACTED]@", text)
text = re.sub(r'("?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)"?\s*:\s*)"(?:\\.|[^"\\])*"', r'\1"[REDACTED]"', text, flags=re.I)
text = re.sub(r"(?i)\b(bearer)\s+[^\s,;]+", r"\1 [REDACTED]", text)
text = re.sub(r"(?im)\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*[:=][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*", lambda m: m.group(1) + ": [REDACTED]", text)
text = re.sub(r"(?i)\b(x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)\b(\s*[:=]\s*)([^\s,;]+)", r"\1\2[REDACTED]", text)
text = re.sub(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[REDACTED_EMAIL]", text)
text = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b", "[REDACTED_JWT]", text)
text = re.sub(r"nonce-[A-Za-z0-9+/=_-]+", "nonce-[REDACTED]", text)
text = re.sub(r"rehearsal-only-[A-Za-z0-9-]+", "[REDACTED_SYNTHETIC_SECRET]", text)
lines = text.splitlines()
print("\n".join(line[:2000] for line in lines[:120]), end="\n" if text.endswith("\n") else "")
if len(lines) > 120: print("[truncated after 120 lines]")
PY
}

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
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker inspect --format 'state={{.State.Status}} oom_killed={{.State.OOMKilled}} exit_code={{.State.ExitCode}} memory={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} nanocpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} readonly={{.HostConfig.ReadonlyRootfs}} network={{.HostConfig.NetworkMode}} port_bindings={{json .HostConfig.PortBindings}}' "$name" \
      >"$report_dir/container-state-final.raw" 2>/dev/null || true
    if [[ -s $report_dir/container-state-final.raw ]]; then
      if sanitize_file "$report_dir/container-state-final.raw" >"$report_dir/container-state-final.txt" && [[ -s $report_dir/container-state-final.txt ]]; then
        cat "$report_dir/container-state-final.txt" >>"$report"
        rm -f -- "$report_dir/container-state-final.raw"
      else
        diagnostic_capture_failed=true
      fi
    fi
    capture_cgroup "$name" runtime-final || true
  fi
}

cleanup_owned_resources() {
  local cleanup_failed=false container_cleanup=not_created volume_cleanup=not_created
  local container_remove_failed=false volume_remove_failed=false
  local current_id inventory_ids inventory_volumes
  local container_absence_verified=false volume_absence_verified=false
  if [[ $container_created == true ]]; then
    container_cleanup=failed
    if [[ -n $owned_container_id ]]; then
      if current_id=$(docker inspect --format '{{.Id}}' "$name" 2>/dev/null); then
        if [[ $current_id == "$owned_container_id" ]]; then
          if docker rm -f "$owned_container_id" >/dev/null 2>&1; then container_cleanup=removed; else container_remove_failed=true; fi
        else
          container_cleanup=identity_drift_preserved
        fi
      fi
      if inventory_ids=$(docker ps --all --quiet --no-trunc 2>/dev/null); then
        if grep -Fxq -- "$owned_container_id" <<<"$inventory_ids"; then container_cleanup=present_after_cleanup
        else
          container_absence_verified=true
          if [[ $container_remove_failed == true ]]; then container_cleanup=remove_error_absent
          elif [[ $container_cleanup == removed || $container_cleanup == failed ]]; then container_cleanup=absent
          fi
        fi
      else
        container_cleanup=inventory_unavailable
      fi
      if [[ $container_absence_verified != true || $container_remove_failed == true || $container_cleanup == identity_drift_preserved ]]; then cleanup_failed=true; fi
    else
      container_cleanup=identity_unavailable
      cleanup_failed=true
    fi
  fi
  if [[ $volume_created == true ]]; then
    volume_cleanup=failed
    if docker volume rm "$cache_volume" >/dev/null 2>&1; then volume_cleanup=removed; else volume_remove_failed=true; fi
    if inventory_volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null); then
      if grep -Fxq -- "$cache_volume" <<<"$inventory_volumes"; then volume_cleanup=present_after_cleanup
      else
        volume_absence_verified=true
        if [[ $volume_remove_failed == true ]]; then volume_cleanup=remove_error_absent
        elif [[ $volume_cleanup == removed || $volume_cleanup == failed ]]; then volume_cleanup=absent
        fi
      fi
    else
      volume_cleanup=inventory_unavailable
    fi
    if [[ $volume_absence_verified != true || $volume_remove_failed == true ]]; then cleanup_failed=true; fi
  fi
  printf 'cleanup_container=%s\ncleanup_container_absence_verified=%s\ncleanup_container_remove_error=%s\ncleanup_cache_volume=%s\ncleanup_cache_volume_absence_verified=%s\ncleanup_cache_volume_remove_error=%s\n' \
    "$container_cleanup" "$container_absence_verified" "$container_remove_failed" \
    "$volume_cleanup" "$volume_absence_verified" "$volume_remove_failed" >>"$report"
  if ! python3 - "$report_dir/cleanup.json" "$container_cleanup" "$container_absence_verified" "$container_remove_failed" "$volume_cleanup" "$volume_absence_verified" "$volume_remove_failed" <<'PY'
import json, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(json.dumps({
    "schemaVersion": 1,
    "container": {"outcome": sys.argv[2], "absenceVerified": sys.argv[3] == "true", "removeError": sys.argv[4] == "true"},
    "cacheVolume": {"outcome": sys.argv[5], "absenceVerified": sys.argv[6] == "true", "removeError": sys.argv[7] == "true"},
}, indent=2) + "\n", encoding="utf-8")
PY
  then
    cleanup_failed=true
  fi
  [[ $cleanup_failed == false ]]
}

cleanup() {
  local status=$?
  local diagnostic_capture_failed=false
  local cleanup_failed=false
  trap - EXIT INT TERM ERR
  set +e
  exec 2>&3
  capture_runtime_state
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker logs --tail 80 "$name" >"$report_dir/container-logs.raw" 2>&1 || true
    if sanitize_file "$report_dir/container-logs.raw" >"$report_dir/container-logs.txt" && [[ -s $report_dir/container-logs.txt ]]; then
      rm -f -- "$report_dir/container-logs.raw"
    else
      diagnostic_capture_failed=true
    fi
  fi
  if ! python3 - "$report_dir" "$final_result" "$status" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
def scrub(text, limit=65536):
    text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s]+@", r"\1[REDACTED]@", text)
    text = re.sub(r'(?i)("?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)"?\s*:\s*)"(?:\\.|[^"\\])*"', r'\1"[REDACTED]"', text)
    text = re.sub(r"(?i)\b(bearer)\s+[^\s,;]+", r"\1 [REDACTED]", text)
    text = re.sub(r"(?im)\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*[:=][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*", lambda m: m.group(1) + ": [REDACTED]", text)
    text = re.sub(r"(?i)\b(x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)\b(\s*[:=]\s*)([^\s,;]+)", r"\1\2[REDACTED]", text)
    text = re.sub(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[REDACTED_EMAIL]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b", "[REDACTED_JWT]", text)
    text = re.sub(r"nonce-[A-Za-z0-9+/=_-]+", "nonce-[REDACTED]", text)
    text = re.sub(r"rehearsal-only-[A-Za-z0-9-]+", "[REDACTED_SYNTHETIC_SECRET]", text)
    return text[:limit]
secret_keys = re.compile(r"authorization|proxy-authorization|cookie|set-cookie|api.?key|access.?token|refresh.?token|token|secret|password|email", re.I)
def scrub_object(value):
    if isinstance(value, dict):
        return {key: "[REDACTED]" if secret_keys.search(str(key)) else scrub_object(item) for key, item in value.items()}
    if isinstance(value, list): return [scrub_object(item) for item in value]
    if isinstance(value, str): return scrub(value)
    return value
def read(name, limit=262144):
    path = root / name
    if not path.exists(): return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text if len(text) <= limit else "[truncated prefix; retaining diagnostic tail]\n" + text[-limit:]
report_text = read("report.txt")
def report_value(key):
    match = re.search(r"(?m)^" + re.escape(key) + r"=(.*)$", report_text)
    return match.group(1) if match else None
http_raw = "\n".join(read(name) for name in ("http-cold.txt", "warm-restart.txt", "warm-recreate.txt"))
http_output = scrub(http_raw)
observations, manifest, sri_assets, sri_script_tags = [], [], [], []
warm_observations, cache_observations = [], []
for filename in ("http-cold.txt", "warm-restart.txt", "warm-recreate.txt"):
    source = read(filename)
    for line in source.splitlines():
        if line.startswith("http_observation="):
            try: warm_observations.append(scrub_object(json.loads(line.split("=", 1)[1])))
            except json.JSONDecodeError: pass
for filename in ("image-cache-prime.json", "image-cache-restart.json", "image-cache-recreate.json"):
    try: cache_observations.append(scrub_object(json.loads(read(filename))))
    except (json.JSONDecodeError, TypeError): pass
cache_errors = [scrub(read(name)) for name in ("image-cache-prime.stderr", "image-cache-restart.stderr", "image-cache-recreate.stderr") if read(name)]
for line in http_raw.splitlines():
    if line.startswith("http_observation="):
        try: observations.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: observations.append({"malformedObservation": scrub(line[:2048])})
    elif line.startswith("sri_asset="):
        try: sri_assets.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: sri_assets.append({"malformedAssetRecord": scrub(line[:2048])})
    elif line.startswith("sri_script_tag="):
        try: sri_script_tags.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: sri_script_tags.append({"malformedScriptTag": scrub(line[:2048])})
    elif line.startswith("acceptance_manifest="):
        try: manifest.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: manifest.append({"malformedManifestContext": scrub(line[:2048])})
assertions = [line for line in http_output.splitlines() if re.search(r"AssertionError|\bError:|expected .*got|did not match|is missing|unexpected", line, re.I)]
diagnostic_tail = [scrub(line) for line in http_raw.splitlines() if not line.startswith(("http_observation=", "acceptance_manifest="))]
receipt = {"schemaVersion": 1, "result": sys.argv[2], "exitStatus": int(sys.argv[3]), "phaseStatuses": {key: report_value(key) for key in ("cold_http_exit_status", "restart_http", "recreate_http", "next_image_cache_restart", "next_image_cache_recreate")}, "httpObservations": warm_observations[-80:], "sriAssets": sri_assets[-80:], "sriScriptTags": sri_script_tags[-80:], "imageCacheObservations": cache_observations[-20:], "imageCacheErrors": cache_errors, "assertions": assertions[-20:], "manifestContext": manifest[-5:], "httpOutputTail": diagnostic_tail[-100:], "containerLogs": scrub(read("container-logs.txt", 32768)).splitlines()[-80:]}
(root / "runtime-http.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
  then
    diagnostic_capture_failed=true
  fi
  [[ -s $report_dir/runtime-http.json ]] || diagnostic_capture_failed=true
  if [[ $final_result != passed ]]; then
    python3 - "$report" "$status" <<'PY' || diagnostic_capture_failed=true
import pathlib, sys
path = pathlib.Path(sys.argv[1])
lines = path.read_text(encoding="utf-8").splitlines()
lines = ["result=failed" if line == "result=passed" else line for line in lines]
if not any(line.startswith("result=") for line in lines):
    lines.append("result=failed")
lines.append("exit_status=" + sys.argv[2])
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY
  if ! python3 - "$report_dir" "$status" "${failure_status:-}" "$failure_line" "$failure_command" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
def read(name, limit=262144):
    path = root / name
    if not path.exists(): return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text if len(text) <= limit else "[truncated prefix; retaining diagnostic tail]\n" + text[-limit:]
report_text = read("report.txt")
def report_value(key):
    match = re.search(r"(?m)^" + re.escape(key) + r"=(.*)$", report_text)
    return match.group(1) if match else None
def scrub(text, limit=65536):
    text = re.sub(r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s]+@", r"\1[REDACTED]@", text)
    text = re.sub(r'(?i)("?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)"?\s*:\s*)"(?:\\.|[^"\\])*"', r'\1"[REDACTED]"', text)
    text = re.sub(r"(?i)\b(bearer)\s+[^\s,;]+", r"\1 [REDACTED]", text)
    text = re.sub(r"(?im)\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*[:=][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*", lambda m: m.group(1) + ": [REDACTED]", text)
    text = re.sub(r"(?i)\b(x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)\b(\s*[:=]\s*)([^\s,;]+)", r"\1\2[REDACTED]", text)
    text = re.sub(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[REDACTED_EMAIL]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b", "[REDACTED_JWT]", text)
    text = re.sub(r"nonce-[A-Za-z0-9+/=_-]+", "nonce-[REDACTED]", text)
    text = re.sub(r"rehearsal-only-[A-Za-z0-9-]+", "[REDACTED_SYNTHETIC_SECRET]", text)
    return text[:limit]
secret_keys = re.compile(r"authorization|proxy-authorization|cookie|set-cookie|api.?key|access.?token|refresh.?token|token|secret|password|email", re.I)
def scrub_object(value):
    if isinstance(value, dict): return {key: "[REDACTED]" if secret_keys.search(str(key)) else scrub_object(item) for key, item in value.items()}
    if isinstance(value, list): return [scrub_object(item) for item in value]
    if isinstance(value, str): return scrub(value)
    return value
http_raw = "\n".join(read(name) for name in ("http-cold.txt", "warm-restart.txt", "warm-recreate.txt"))
http_output = scrub(http_raw)
observations, sri_assets, sri_script_tags = [], [], []
for line in http_raw.splitlines():
    if line.startswith("http_observation="):
        try: observations.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: observations.append({"malformedObservation": scrub(line[:2048])})
    elif line.startswith("sri_asset="):
        try: sri_assets.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: sri_assets.append({"malformedAssetRecord": scrub(line[:2048])})
    elif line.startswith("sri_script_tag="):
        try: sri_script_tags.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: sri_script_tags.append({"malformedScriptTag": scrub(line[:2048])})
assertion_lines = [line for line in http_output.splitlines() if re.search(r"AssertionError|\bError:|expected .*got|did not match|is missing|unexpected", line, re.I)]
manifest_context = []
for line in http_raw.splitlines():
    if line.startswith("acceptance_manifest="):
        try: manifest_context.append(scrub_object(json.loads(line.split("=", 1)[1])))
        except json.JSONDecodeError: manifest_context.append({"malformedManifestContext": scrub(line[:2048])})
image_cache_observations = []
for filename in ("image-cache-prime.json", "image-cache-restart.json", "image-cache-recreate.json"):
    raw = read(filename)
    if raw:
        try: image_cache_observations.append(scrub_object(json.loads(raw)))
        except json.JSONDecodeError: image_cache_observations.append({"diagnostic": scrub(raw)})
failure = {
    "schemaVersion": 1,
    "status": int(sys.argv[2]),
    "phaseStatuses": {key: report_value(key) for key in ("cold_http_exit_status", "restart_http", "recreate_http", "next_image_cache_restart", "next_image_cache_recreate")},
    "failingCommandStatus": int(sys.argv[3]) if sys.argv[3].isdigit() else None,
    "line": sys.argv[4] or None,
    "command": scrub(sys.argv[5], 4000) or None,
    "assertions": assertion_lines[-20:],
    "manifestContext": manifest_context[-5:],
    "httpObservations": observations[-80:],
    "sriAssets": sri_assets[-80:],
    "sriScriptTags": sri_script_tags[-80:],
    "imageCacheObservations": image_cache_observations,
    "imageCacheErrors": [scrub(read(name), 32768) for name in ("image-cache-prime.stderr", "image-cache-restart.stderr", "image-cache-recreate.stderr") if read(name)],
    "httpOutputTail": [scrub(line) for line in http_raw.splitlines() if not line.startswith(("http_observation=", "acceptance_manifest="))][-100:],
    "stderr": scrub(read("stderr.raw"), 32768),
    "containerState": scrub(read("container-state-final.txt"), 4000),
    "containerLogsTail": scrub(read("container-logs.txt"), 32768).splitlines()[-80:],
    "runtimeCgroupPath": "runtime-final-cgroup.txt" if (root / "runtime-final-cgroup.txt").exists() else None,
}
(root / "failure.json").write_text(json.dumps(failure, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
evidence = [f"failure_status={failure['status']}", f"failure_line={failure['line'] or 'unavailable'}", f"failure_command={failure['command'] or 'unavailable'}"]
evidence.append("\n==assertions==\n" + ("\n".join(assertion_lines[-20:]) or "No assertion text was captured."))
evidence.append("\n==http-observations==\n" + ("\n".join(json.dumps(x, ensure_ascii=False) for x in observations[-80:]) or "No HTTP response was captured."))
evidence.append("\n==http-output-tail==\n" + ("\n".join(failure["httpOutputTail"]) or "No HTTP harness output was captured."))
evidence.append("\n==stderr==\n" + (failure["stderr"] or "No stderr was captured."))
evidence.append("\n==container-state==\n" + (failure["containerState"] or "Container state unavailable."))
evidence.append("\n==container-logs-tail==\n" + ("\n".join(failure["containerLogsTail"]) or "No container logs were captured."))
evidence.append("\n==manifest-context==\n" + ("\n".join(json.dumps(x, ensure_ascii=False) for x in manifest_context) or "Manifest checks were not reached."))
(root / "failure-evidence.txt").write_text("\n".join(evidence) + "\n", encoding="utf-8")
PY
    then
      diagnostic_capture_failed=true
    fi
    [[ -s $report_dir/failure.json && -s $report_dir/failure-evidence.txt ]] || diagnostic_capture_failed=true
    printf 'Runtime acceptance failed with status %s; sanitized diagnostics: %s\n' "$status" "$report_dir/failure.json" >&3
    if [[ -s $stderr_raw ]] && ! sanitize_file "$stderr_raw" >&3; then diagnostic_capture_failed=true; fi
  fi
  if [[ $diagnostic_capture_failed == true ]]; then
    printf 'Sanitized runtime diagnostics could not be fully written; private raw capture files were retained locally and are not included in the workflow receipt.\n' >&3
    [[ $status != 0 ]] || status=1
  else
    rm -f -- "$stderr_raw" "$report_dir/http-cold.txt" "$report_dir/warm-restart.txt" "$report_dir/warm-recreate.txt" \
      "$report_dir/image-cache-prime.stderr" "$report_dir/image-cache-restart.stderr" "$report_dir/image-cache-recreate.stderr" \
      "$report_dir/container-logs.raw" "$report_dir/container-state-final.raw"
  fi
  cleanup_owned_resources || cleanup_failed=true
  if [[ $cleanup_failed == true ]]; then
    [[ $status != 0 ]] || status=1
    final_result=failed
    python3 - "$report" "$status" "$report_dir" <<'PY' || diagnostic_capture_failed=true
import json, pathlib, sys
report = pathlib.Path(sys.argv[1])
status = int(sys.argv[2])
root = pathlib.Path(sys.argv[3])
lines = [
    "result=failed" if line == "result=passed" else
    "exit_status=" + str(status) if line.startswith("exit_status=") else line
    for line in report.read_text(encoding="utf-8").splitlines()
]
if not any(line.startswith("exit_status=") for line in lines):
    lines.append("exit_status=" + str(status))
if not any(line.startswith("result=") for line in lines):
    lines.append("result=failed")
report.write_text("\n".join(lines) + "\n", encoding="utf-8")
http_receipt = root / "runtime-http.json"
if http_receipt.exists():
    data = json.loads(http_receipt.read_text(encoding="utf-8"))
    data["result"] = "failed"
    data["exitStatus"] = status
    http_receipt.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
assertion = "Runtime resource cleanup failed; see cleanup.json."
failure_path = root / "failure.json"
if not failure_path.exists():
    failure_path.write_text(json.dumps({
        "schemaVersion": 1,
        "status": status,
        "phase": "cleanup",
        "failingCommandStatus": None,
        "line": None,
        "command": None,
        "assertions": [assertion],
        "cleanupReceipt": "cleanup.json",
    }, indent=2) + "\n", encoding="utf-8")
evidence_path = root / "failure-evidence.txt"
if not evidence_path.exists():
    evidence_path.write_text(
        f"failure_status={status}\nfailure_phase=cleanup\ncleanup_receipt=cleanup.json\n\n==assertions==\n{assertion}\n",
        encoding="utf-8",
    )
PY
  fi
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
container_created=true
docker run "${runtime_args[@]}" >/dev/null
owned_container_id=$(docker inspect --format '{{.Id}}' "$name")

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

if docker exec -i "$name" node --input-type=module - <<'NODE' >"$report_dir/http-cold.txt" 2>&1
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const base = "http://127.0.0.1:3000";
const diagnosticHeaderNames = [
  "cache-control", "content-length", "content-security-policy", "content-type",
  "location", "permissions-policy", "referrer-policy", "server",
  "strict-transport-security", "vary", "x-content-type-options", "x-frame-options", "x-nextjs-cache",
];
function redactDiagnostic(value) {
  return String(value)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1[REDACTED]@")
    .replace(/("?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)"?\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(cookie|set-cookie|authorization|proxy-authorization)\b\s*[:=][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gi, "$1: [REDACTED]")
    .replace(/\b(x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|email)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[REDACTED_JWT]")
    .replace(/nonce-[A-Za-z0-9+/=_-]+/g, "nonce-[REDACTED]")
    .replace(/rehearsal-only-[A-Za-z0-9-]+/g, "[REDACTED_SYNTHETIC_SECRET]")
    .slice(0, 512);
}
function logHttpObservation(path, method, status, headers, body = "") {
  const selected = {};
  for (const name of diagnosticHeaderNames) {
    const value = headers.get ? headers.get(name) : headers[name];
    if (value) selected[name] = redactDiagnostic(value);
  }
  const pathname = new URL(path, base).pathname;
  console.log(`http_observation=${JSON.stringify({ method, path: pathname, status, headers: selected, body: body ? redactDiagnostic(body) : "" })}`);
}
async function failedTextBodyPreview(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const previewType = /^text\/html\b|^application\/(?:json|problem\+json)\b/i.test(contentType);
  if (!previewType && response.status < 400) return "";
  if (!previewType && !/^text\//i.test(contentType)) return "";
  const reader = response.clone().body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  const deadline = Date.now() + 1000;
  try {
    while (size < 1024) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("diagnostic body preview timed out")), remaining); });
      let result;
      try { result = await Promise.race([reader.read(), timeout]); }
      finally { clearTimeout(timer); }
      const { value, done } = result;
      if (done) break;
      const part = value.subarray(0, 1024 - size);
      chunks.push(part);
      size += part.byteLength;
      if (part.byteLength < value.byteLength) break;
    }
  } catch { /* Failure diagnostics are best-effort and bounded. */ }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8");
}
async function request(path, init = {}) {
  const method = init.method ?? "GET";
  const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...init });
  logHttpObservation(path, method, response.status, response.headers, await failedTextBodyPreview(response));
  return response;
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
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        logHttpObservation(path, "GET", res.statusCode, res.headers, res.statusCode >= 400 ? body.toString("utf8", 0, 1024) : "");
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
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
console.log(`acceptance_manifest=${JSON.stringify({ generatedStaticScriptHashCount: builtHashes.size, manifestHashCount: Array.isArray(manifest) ? manifest.length : null, builtHashesMatch: Array.isArray(manifest) && JSON.stringify([...builtHashes].sort()) === JSON.stringify(manifest) })}`);
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
let sriFailure = null;
try {
  for (const [, attrs] of scripts) {
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const assetUrl = new URL(src, base);
    assert.equal(assetUrl.origin, base, `unexpected external script source ${assetUrl.origin}`);
    const integrity = attrs.match(/\bintegrity=["']([^"']+)["']/i)?.[1];
    console.log(`sri_script_tag=${JSON.stringify({path:assetUrl.pathname,integrity:integrity ?? null,noncePresent:/\bnonce=["'][^"']+["']/i.test(attrs)})}`);
    assert.match(integrity ?? "", /^sha256-[A-Za-z0-9+/]+=*$/i, `script ${assetUrl.pathname} lacks SHA-256 SRI`);
    const asset = await request(assetUrl.pathname + assetUrl.search);
    assert.equal(asset.status, 200, `script asset ${assetUrl.pathname} did not load`);
    const bytes = Buffer.from(await asset.arrayBuffer());
    const actual = `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
    console.log(`sri_asset=${JSON.stringify({path:assetUrl.pathname,status:asset.status,bodyBytes:bytes.byteLength,actual,expected:integrity})}`);
    assert.equal(actual, integrity, `SRI digest mismatch for ${assetUrl.pathname}`);
    verifiedSRI++;
  }
  assert.ok(verifiedSRI > 0, "landing page had no SRI-protected script assets");
} catch (error) {
  sriFailure = error;
  console.error(`Deferred SRI assertion (remaining negative-route/image checks will continue): ${error.stack ?? String(error)}`);
}

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
console.log(`static_csp_hash_count=${manifest.length}`);
console.log(`sri_assets_verified=${verifiedSRI}`);
console.log(`hostile_forwarded_redirect_origin=${hostileLocation.origin}`);
console.log(`image_cache_body_sha256=${imageHash}`);
console.log(`image_cache_status_header=${cacheHeader}`);
console.log(`sri_check=${sriFailure ? "failed" : "passed"}`);
if (sriFailure) {
  throw sriFailure;
}
console.log(`HTTP acceptance passed: CSP static manifest parity, nonce hydration, ${verifiedSRI} verified SRI assets, security headers, anonymous auth/provider boundaries, cron rejects, and image optimization.`);
NODE
then
  cold_http_status=0
else
  cold_http_status=$?
  cold_http_failed=true
  record_error_context "$cold_http_status" "$LINENO" 'cold HTTP acceptance block'
fi
printf 'cold_http_exit_status=%s\n' "$cold_http_status" >>"$report"

if [[ ! -s $report_dir/http-cold.txt ]]; then
  printf 'Cold HTTP acceptance output was not captured.\n' >&2
  cold_http_failed=true
  : >"$report_dir/http-cold.txt"
fi

static_csp_count=$(sed -n 's/^static_csp_hash_count=//p' "$report_dir/http-cold.txt")
sri_assets_verified=$(sed -n 's/^sri_assets_verified=//p' "$report_dir/http-cold.txt")
cold_image_hash=$(sed -n 's/^image_cache_body_sha256=//p' "$report_dir/http-cold.txt")
hostile_origin=$(sed -n 's/^hostile_forwarded_redirect_origin=//p' "$report_dir/http-cold.txt")
[[ $static_csp_count =~ ^[1-9][0-9]*$ && $sri_assets_verified =~ ^[1-9][0-9]*$ && $cold_image_hash =~ ^[0-9a-f]{64}$ && $hostile_origin == https://rehearsal.invalid ]] || {
  printf 'Cold HTTP acceptance metrics were missing or invalid.\n' >&2
  record_error_context 1 "$LINENO" 'cold HTTP output metrics'
  cold_http_failed=true
}
printf 'static_csp_hash_count=%s\nsri_assets_verified=%s\nhostile_forwarded_redirect_origin=%s\nimage_cache_body_sha256=%s\n' \
  "$static_csp_count" "$sri_assets_verified" "$hostile_origin" "$cold_image_hash" >>"$report"

if [[ ! $cold_image_hash =~ ^[0-9a-f]{64}$ ]]; then
  if docker exec "$name" node --input-type=module -e '
    import { createHash } from "node:crypto";
    const response=await fetch("http://127.0.0.1:3000/_next/image?url=%2Fornigami-mark-32.png&w=64&q=75",{headers:{accept:"image/webp"},signal:AbortSignal.timeout(10000)});
    const bytes=Buffer.from(await response.arrayBuffer());
    console.log(JSON.stringify({status:response.status,headers:{"content-type":response.headers.get("content-type"),"x-nextjs-cache":response.headers.get("x-nextjs-cache")},bodyBytes:bytes.length,bodySha256:createHash("sha256").update(bytes).digest("hex")}));
    if(!response.ok||bytes.length===0) process.exit(1);
  ' >"$report_dir/image-cache-prime.json" 2>"$report_dir/image-cache-prime.stderr"; then
    cold_image_hash=$(python3 - "$report_dir/image-cache-prime.json" <<'PY'
import json, re, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))["bodySha256"]
if not re.fullmatch(r"[0-9a-f]{64}", value): raise SystemExit(1)
print(value, end="")
PY
    ) || cache_check_failed=true
  else
    record_error_context 1 "$LINENO" 'independent image cache prime'
    cache_check_failed=true
  fi
fi
cache_before=$(cache_listing || printf '[]')
if [[ $cache_before == '[]' ]]; then
  printf 'Next image optimization did not populate its named cache volume.\n' >&2
  record_error_context 1 "$LINENO" 'initial image cache inventory'
  cache_check_failed=true
fi
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
  [[ $cold_image_hash =~ ^[0-9a-f]{64}$ ]] || { printf 'No valid image cache baseline is available after %s.\n' "$phase" >&2; return 1; }
  result=$(docker exec "$name" node --input-type=module -e '
    import { createHash } from "node:crypto";
    const response = await fetch("http://127.0.0.1:3000/_next/image?url=%2Fornigami-mark-32.png&w=64&q=75", {
      headers: { accept: "image/webp" }, signal: AbortSignal.timeout(10000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    process.stdout.write(JSON.stringify({status:response.status,headers:{"content-type":response.headers.get("content-type"),"x-nextjs-cache":response.headers.get("x-nextjs-cache")},bodyBytes:bytes.length,bodySha256:createHash("sha256").update(bytes).digest("hex")}));
    if (!response.ok) process.exit(1);
  ' 2>"$report_dir/image-cache-${phase}.stderr" >"$report_dir/image-cache-${phase}.json") || {
    printf 'Optimized image request failed after %s.\n' "$phase" >&2
    return 1
  }
  result=$(python3 - "$report_dir/image-cache-${phase}.json" <<'PY'
import json, re, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
digest = value.get("bodySha256", "")
if not re.fullmatch(r"[0-9a-f]{64}", digest): raise SystemExit(1)
cache = value.get("headers", {}).get("x-nextjs-cache") or "unavailable"
if "\t" in cache or "\n" in cache: raise SystemExit(1)
print(digest + "\t" + cache, end="")
PY
  ) || { printf 'Image cache response was malformed after %s.\n' "$phase" >&2; return 1; }
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

verify_warm_http() {
  local phase=$1
  docker exec "$name" node --input-type=module -e '
    import assert from "node:assert/strict";
    const response = await fetch("http://127.0.0.1:3000/", { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const selected = {};
    for (const name of ["content-security-policy", "content-type", "location", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security"]) {
      const value = response.headers.get(name); if (value) selected[name] = value;
    }
    const body = (await response.text()).slice(0, 512);
    console.log(`http_observation=${JSON.stringify({method:"GET",path:"/",status:response.status,headers:selected,body})}`);
    assert.equal(response.status, 200, `warm home expected 200, got ${response.status}`);
    assert.ok(selected["content-security-policy"], "warm home has no CSP");
  ' >"$report_dir/warm-${phase}.txt" 2>&1 || {
    printf 'Warm HTTP check failed after %s.\n' "$phase" >&2
    return 1
  }
}

docker restart --time 45 "$name" >/dev/null
wait_for_health
container_id_after_restart=$(docker inspect --format '{{.Id}}' "$name")
[[ $container_id_after_restart == "$container_id_before_restart" ]] || { printf 'Container ID changed during restart.\n' >&2; exit 1; }
if verify_warm_http restart; then restart_http_passed=true; else record_error_context "$?" "$LINENO" 'warm HTTP restart probe'; cold_http_failed=true; fi
if verify_image_cache_hit restart; then restart_cache_passed=true; else record_error_context "$?" "$LINENO" 'image cache restart probe'; cache_check_failed=true; fi
cache_after_restart=$(cache_listing || printf '[]')
if [[ $cache_before == '[]' ]]; then
  cache_check_failed=true
  restart_cache_passed=false
elif [[ $cache_after_restart != "$cache_before" ]]; then
  printf 'Next image cache did not persist unchanged across container restart.\n' >&2
  record_error_context 1 "$LINENO" 'image cache inventory after restart'
  cache_check_failed=true
  restart_cache_passed=false
fi
printf 'container_id_after_restart=%s\nrestart_http=%s\nnext_image_cache_restart=%s\n' "$container_id_after_restart" "$restart_http_passed" "$restart_cache_passed" >>"$report"
capture_cgroup "$name" runtime-after-restart
assert_cgroup_metrics "$report_dir/runtime-after-restart-cgroup.txt"

docker stop --time 45 "$name" >/dev/null
docker rm "$name" >/dev/null
container_created=false
container_created=true
docker run "${runtime_args[@]}" >/dev/null
owned_container_id=$(docker inspect --format '{{.Id}}' "$name")
verify_runtime_config
wait_for_health
container_id_after_recreate=$(docker inspect --format '{{.Id}}' "$name")
[[ $container_id_after_recreate != "$container_id_before_restart" ]] || { printf 'Container ID did not change during recreation.\n' >&2; exit 1; }
image_id_after_recreate=$(docker inspect --format '{{.Image}}' "$name")
[[ $image_id_after_recreate == "$image_id" ]] || { printf 'Image ID changed during recreation.\n' >&2; exit 1; }
cache_mount_after_recreate=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/.next/cache"}}{{.Name}}{{end}}{{end}}' "$name")
[[ $cache_mount_after_recreate == "$cache_volume" ]] || { printf 'Cache volume changed during recreation.\n' >&2; exit 1; }
if verify_warm_http recreate; then recreate_http_passed=true; else record_error_context "$?" "$LINENO" 'warm HTTP recreate probe'; cold_http_failed=true; fi
if verify_image_cache_hit recreate; then recreate_cache_passed=true; else record_error_context "$?" "$LINENO" 'image cache recreate probe'; cache_check_failed=true; fi
cache_after_recreate=$(cache_listing || printf '[]')
if [[ $cache_before == '[]' ]]; then
  cache_check_failed=true
  recreate_cache_passed=false
elif [[ $cache_after_recreate != "$cache_before" ]]; then
  printf 'Next image cache did not persist unchanged across container recreation.\n' >&2
  record_error_context 1 "$LINENO" 'image cache inventory after recreate'
  cache_check_failed=true
  recreate_cache_passed=false
fi
printf 'container_id_after_recreate=%s\ncontainer_identity_check=restart_same_recreate_new\nimage_identity_check=same_image_id_across_recreate\nimage_id_after_recreate=%s\ncache_volume_identity_check=same_named_volume_across_recreate\ncache_mount_after_recreate=%s\n' \
  "$container_id_after_recreate" "$image_id_after_recreate" "$cache_mount_after_recreate" >>"$report"
printf 'recreate_http=%s\nnext_image_cache_recreate=%s\n' "$recreate_http_passed" "$recreate_cache_passed" >>"$report"
capture_cgroup "$name" runtime-after-recreate
assert_cgroup_metrics "$report_dir/runtime-after-recreate-cgroup.txt"
docker exec "$name" df -Pk / /tmp /app/.next/cache >"$report_dir/runtime-disk.txt" 2>&1 || true
df -Pk / "$report_root" >"$report_dir/host-disk-after.txt" 2>&1 || true

if grep -Eq '^oom_kill[[:space:]]+([1-9][0-9]*)$' "$report_dir/runtime-first-cgroup.txt" "$report_dir/runtime-after-restart-cgroup.txt" "$report_dir/runtime-after-recreate-cgroup.txt"; then
  printf 'Runtime cgroup reported an OOM kill.\n' >&2
  exit 1
fi
printf 'cache_persistence_scope=next_image_cache_volume_only;does_not_accept_database_or_media_storage\n' >>"$report"
if [[ $cold_http_failed == true || $cache_check_failed == true ]]; then
  printf 'cold_http_failed=%s\ncache_check_failed=%s\n' "$cold_http_failed" "$cache_check_failed" >>"$report"
  printf 'Runtime acceptance failed: cold HTTP or image-cache persistence checks failed; restart/recreate observations were retained.\n' >&2
  exit 1
fi
finished_epoch=$(date +%s)
printf 'finished_at_utc=%s\nruntime_elapsed_seconds=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$((finished_epoch - started_epoch))" >>"$report"
printf 'result=passed\nruntime_cgroup_metrics=runtime-first-cgroup.txt,runtime-after-restart-cgroup.txt,runtime-after-recreate-cgroup.txt\n' >>"$report"
final_result=passed
printf 'Linux runtime acceptance passed for %s. Local image retained; runtime container and cache volume will be removed.\n' "$image"
