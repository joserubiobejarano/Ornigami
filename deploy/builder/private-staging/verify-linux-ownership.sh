#!/usr/bin/env bash
# Lightweight Linux preflight for the runner/builder ownership boundary.
#
# Runs before dependency installation, full suites or image building.
#
# Observation rules:
#   * Everything that reads or writes builder-private data runs as the builder
#     (sudo -u BUILDER_USER). No command substitution runs before sudo changes
#     identity.
#   * Runner-denial assertions and all runner logs/uploads/diagnostics run as
#     the runner.
#   * The builder root and store stay 0700/0600. This script never adds runner
#     traversal to satisfy a positive assertion.
#
# Outputs (all runner-owned, all retained in the runner log root):
#   ownership-preflight.txt              key=value summary
#   ownership-preflight-observations.tsv key/value/effective-user observations
#   ownership-preflight.json             machine-readable summary
#   ownership-preflight-failure.txt      failed assertion, expected/observed
set -Eeuo pipefail

RUNNER_USER="${RUNNER_USER:?RUNNER_USER is required}"
BUILDER_USER="${BUILDER_USER:?BUILDER_USER is required}"
SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
CONTROL_ROOT="${CONTROL_ROOT:-$SOURCE_ROOT}"
EMERGENCY_DIAGNOSTICS_ROOT="${EMERGENCY_DIAGNOSTICS_ROOT:?EMERGENCY_DIAGNOSTICS_ROOT is required}"
RUNNER_LOG_ROOT="${RUNNER_LOG_ROOT:?RUNNER_LOG_ROOT is required}"
BUILDER_EVIDENCE_ROOT="${BUILDER_EVIDENCE_ROOT:?BUILDER_EVIDENCE_ROOT is required}"
EXPORT_STAGING="${EXPORT_STAGING:?EXPORT_STAGING is required}"
UPLOAD_STAGING="${UPLOAD_STAGING:?UPLOAD_STAGING is required}"
DOCKER_HOST_ENDPOINT="${DOCKER_HOST_ENDPOINT:-unix:///var/run/docker.sock}"
DOCKER_BUILD_ENDPOINT="${DOCKER_BUILD_ENDPOINT:-tcp://127.0.0.1:2375}"
PREFLIGHT_SKIP_DOCKER="${PREFLIGHT_SKIP_DOCKER:-0}"
NODE_BIN="${NODE_BIN:-node}"

SUMMARY_FILE="$RUNNER_LOG_ROOT/ownership-preflight.txt"
TSV_FILE="$RUNNER_LOG_ROOT/ownership-preflight-observations.tsv"
JSON_FILE="$RUNNER_LOG_ROOT/ownership-preflight.json"
FAILURE_FILE="$RUNNER_LOG_ROOT/ownership-preflight-failure.txt"

rm -f "$FAILURE_FILE"
: > "$TSV_FILE"

record() { # key value effective-user
  local key="${1//$'\t'/ }" value="${2//$'\t'/ }" effective="${3//$'\t'/ }"
  value="${value//$'\n'/ }"
  printf '%s\t%s\t%s\n' "$key" "$value" "$effective" >> "$TSV_FILE"
}

write_summary() { # status
  local status="$1"
  {
    printf 'status=%s\n' "$status"
    awk -F '\t' '{ printf "%s=%s\n", $1, $2 }' "$TSV_FILE"
    if [[ -f "$FAILURE_FILE" ]]; then
      cat "$FAILURE_FILE"
    fi
  } > "$SUMMARY_FILE"
  cat "$SUMMARY_FILE"
}

write_json() { # status
  local status="$1" sep="" key value effective
  json_escape() {
    local s="${1//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\t'/\\t}"
    s="${s//$'\n'/\\n}"
    printf '%s' "$s"
  }
  {
    printf '{\n  "status": %s,\n  "observations": [\n' "$status"
    while IFS=$'\t' read -r key value effective; do
      printf '%s    {"key": "%s", "value": "%s", "effectiveUser": "%s"}' \
        "$sep" "$(json_escape "$key")" "$(json_escape "$value")" "$(json_escape "$effective")"
      sep=$',\n'
    done < "$TSV_FILE"
    printf '\n  ]\n}\n'
  } > "$JSON_FILE"
}

fail() { # assertion expected observed effective-user
  trap - ERR
  local assertion="$1" expected="$2" observed="$3" effective="$4"
  record "failure_assertion" "$assertion" "$effective"
  record "failure_expected" "$expected" "$effective"
  record "failure_observed" "$observed" "$effective"
  {
    printf 'status=1\n'
    printf 'assertion=%s\n' "$assertion"
    printf 'expected=%s\n' "$expected"
    printf 'observed=%s\n' "$observed"
    printf 'effective_user=%s\n' "$effective"
    printf 'runner_user=%s\n' "$RUNNER_USER"
    printf 'builder_user=%s\n' "$BUILDER_USER"
  } > "$FAILURE_FILE"
  printf 'FAIL: %s: expected [%s], observed [%s] (effective user: %s)\n' \
    "$assertion" "$expected" "$observed" "$effective" >&2
  write_summary 1 || true
  write_json 1 || true
  exit 1
}

on_unexpected_error() { # status
  trap - ERR
  local status="$1" command="${BASH_COMMAND:-unknown}"
  record "failure_assertion" "unexpected_command_failure" "$RUNNER_USER"
  record "failure_expected" "command succeeds" "$RUNNER_USER"
  record "failure_observed" "exit $status: $command" "$RUNNER_USER"
  {
    printf 'status=%s\n' "$status"
    printf 'assertion=unexpected_command_failure\n'
    printf 'expected=command succeeds\n'
    printf 'observed=exit %s: %s\n' "$status" "$command"
    printf 'effective_user=%s\n' "$RUNNER_USER"
  } > "$FAILURE_FILE"
  printf 'FAIL: unexpected command failure (exit %s): %s\n' "$status" "$command" >&2
  write_summary "$status" || true
  write_json "$status" || true
  exit "$status"
}
trap 'on_unexpected_error $?' ERR

as_builder() { sudo -u "$BUILDER_USER" -- "$@"; }
as_builder_shell() { sudo -u "$BUILDER_USER" -- env HOME="$builder_home" bash -c "$1" _ "${@:2}"; }
builder_stat() { # format path -> value; runs stat as builder
  local out
  if out="$(sudo -u "$BUILDER_USER" -- stat -c "$1" -- "$2" 2>&1)"; then
    printf '%s' "$out"
  else
    printf 'stat-failed:%s' "${out//$'\n'/ }"
  fi
}
runner_stat() { stat -c "$1" -- "$2" 2>/dev/null || printf 'stat-failed'; }

require_builder_flag() { # assertion path flag expected
  local assertion="$1" path="$2" flag="$3" expected="$4"
  if ! as_builder test "-$flag" "$path" 2>/dev/null; then
    fail "$assertion" "$expected" "test -$flag failed as $BUILDER_USER" "$BUILDER_USER"
  fi
  record "$assertion" "true" "$BUILDER_USER"
}

require_runner_denied() { # assertion path
  local assertion="$1" path="$2"
  if [[ -r "$path" || -x "$path" ]]; then
    fail "$assertion" "runner has no read/execute access" "readable or executable by $RUNNER_USER" "$RUNNER_USER"
  fi
  record "$assertion" "true" "$RUNNER_USER"
}

require_builder_denied() { # assertion path
  local assertion="$1" path="$2"
  if as_builder test -r "$path" 2>/dev/null || as_builder test -x "$path" 2>/dev/null; then
    fail "$assertion" "builder has no read/execute access" "readable or executable by $BUILDER_USER" "$BUILDER_USER"
  fi
  record "$assertion" "true" "$BUILDER_USER"
}

require_mode() { # assertion actual expected effective
  local assertion="$1" actual="$2" expected="$3" effective="$4"
  if [[ "$actual" != "$expected" ]]; then
    fail "$assertion" "$expected" "$actual" "$effective"
  fi
  record "$assertion" "$actual" "$effective"
}

runner_uid="$(id -u "$RUNNER_USER")"
runner_gid="$(id -g "$RUNNER_USER")"
runner_group="$(id -gn "$RUNNER_USER")"
runner_groups="$(id -Gn "$RUNNER_USER" | tr ' ' ',')"
builder_uid="$(id -u "$BUILDER_USER")"
builder_gid="$(id -g "$BUILDER_USER")"
builder_group="$(id -gn "$BUILDER_USER")"
builder_groups="$(id -Gn "$BUILDER_USER" | tr ' ' ',')"
builder_home="$(getent passwd "$BUILDER_USER" | cut -d: -f6)"

record "runner_user" "$RUNNER_USER" "$RUNNER_USER"
record "runner_uid" "$runner_uid" "$RUNNER_USER"
record "runner_gid" "$runner_gid" "$RUNNER_USER"
record "runner_groups" "$runner_groups" "$RUNNER_USER"
record "builder_user" "$BUILDER_USER" "$RUNNER_USER"
record "builder_uid" "$builder_uid" "$RUNNER_USER"
record "builder_gid" "$builder_gid" "$RUNNER_USER"
record "builder_groups" "$builder_groups" "$RUNNER_USER"
record "builder_home" "$builder_home" "$RUNNER_USER"

require_mode "builder_uid_is_1000" "$builder_uid" "1000" "$RUNNER_USER"
if [[ "$runner_uid" == "$builder_uid" ]]; then
  fail "distinct_identities" "runner UID differs from builder UID" "both are $runner_uid" "$RUNNER_USER"
fi
if [[ "$RUNNER_USER" == "$BUILDER_USER" ]]; then
  fail "distinct_accounts" "runner and builder are different accounts" "both are $RUNNER_USER" "$RUNNER_USER"
fi
record "distinct_identities" "true" "$RUNNER_USER"

if [[ ! -d "$EMERGENCY_DIAGNOSTICS_ROOT" ]]; then
  fail "runner_emergency_diagnostics_root" "existing runner-owned directory" "missing: $EMERGENCY_DIAGNOSTICS_ROOT" "$RUNNER_USER"
fi

# --- required capabilities before expensive phases -------------------------
# Sudo operations the rehearsal actually needs: temporary /etc/hosts mapping,
# private-CA trust update and owned-resource cleanup.
if ! as_builder sudo -n true 2>/dev/null; then
  fail "builder_passwordless_sudo" "sudo -n true succeeds as builder" "denied" "$BUILDER_USER"
fi
record "builder_passwordless_sudo" "true" "$BUILDER_USER"
for sudo_target in /etc/hosts /usr/local/share/ca-certificates; do
  if ! as_builder sudo -n test -w "$sudo_target" 2>/dev/null; then
    fail "builder_sudo_write_${sudo_target//\//_}" "sudo write access to $sudo_target" "denied" "$BUILDER_USER"
  fi
  record "builder_sudo_write_${sudo_target//\//_}" "true" "$BUILDER_USER"
done

# Source and helper traversal must work as the builder before installation.
require_builder_flag "builder_source_traverse" "$SOURCE_ROOT" "x" "execute access to $SOURCE_ROOT"
require_builder_flag "builder_source_write" "$SOURCE_ROOT" "w" "write access to $SOURCE_ROOT"
require_builder_flag "builder_candidate_helper" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" "r" "readable candidate validator"
require_builder_flag "builder_control_helper" "$CONTROL_ROOT/deploy/builder/private-staging/run-exact-rehearsal-linux.sh" "r" "readable control wrapper"
require_builder_flag "builder_home_write" "$builder_home" "w" "writable builder home"

# --- builder-private evidence root (observed as builder) -------------------
require_mode "builder_evidence_owner_mode" "$(builder_stat '%u:%g:%a' "$BUILDER_EVIDENCE_ROOT")" \
  "$builder_uid:$builder_gid:700" "$BUILDER_USER"
as_builder_shell 'umask 077; printf "%s\n" builder-ok > "$1"' "$BUILDER_EVIDENCE_ROOT/preflight-builder.txt"
require_builder_flag "builder_evidence_write" "$BUILDER_EVIDENCE_ROOT/preflight-builder.txt" "w" "builder-writable evidence file"
require_builder_flag "builder_evidence_read" "$BUILDER_EVIDENCE_ROOT/preflight-builder.txt" "r" "builder-readable evidence file"
require_runner_denied "runner_cannot_read_builder_evidence" "$BUILDER_EVIDENCE_ROOT/preflight-builder.txt"
require_runner_denied "runner_cannot_traverse_builder_root" "$BUILDER_EVIDENCE_ROOT"

# --- live-store shape (observed as builder; 0700/0600 preserved) ------------
store_dir="$BUILDER_EVIDENCE_ROOT/preflight-store"
store_file="$store_dir/identity-store.json"
if ! as_builder test -e "$store_dir"; then
  as_builder mkdir -m 0700 -- "$store_dir"
fi
if ! as_builder test -e "$store_file"; then
  as_builder_shell 'umask 077; printf "%s\n" store-ok > "$1"' "$store_file"
fi
require_mode "builder_store_root_owner_mode" "$(builder_stat '%u:%g:%a' "$store_dir")" \
  "$builder_uid:$builder_gid:700" "$BUILDER_USER"
require_mode "builder_store_file_owner_mode" "$(builder_stat '%u:%g:%a' "$store_file")" \
  "$builder_uid:$builder_gid:600" "$BUILDER_USER"
require_builder_flag "builder_store_root_access" "$store_dir" "x" "builder-executable store root"
require_builder_flag "builder_store_file_read" "$store_file" "r" "builder-readable store file"
require_builder_flag "builder_store_file_write" "$store_file" "w" "builder-writable store file"
require_runner_denied "runner_cannot_traverse_store" "$store_dir"
require_runner_denied "runner_cannot_read_store" "$store_file"

# --- approved export staging: builder writes, runner reads -----------------
require_mode "export_staging_owner_mode" "$(runner_stat '%u:%g:%a' "$EXPORT_STAGING")" \
  "$builder_uid:$runner_gid:2770" "$RUNNER_USER"
as_builder install -m 0640 /dev/null "$EXPORT_STAGING/preflight-export.txt"
as_builder_shell 'printf "%s\n" export-ok > "$1"' "$EXPORT_STAGING/preflight-export.txt"
if [[ "$(cat "$EXPORT_STAGING/preflight-export.txt")" != "export-ok" ]]; then
  fail "runner_can_read_export" "runner reads the approved export" "content mismatch or unreadable" "$RUNNER_USER"
fi
require_mode "export_file_mode" "$(runner_stat '%a' "$EXPORT_STAGING/preflight-export.txt")" "640" "$RUNNER_USER"
require_mode "export_file_owner_mode" "$(runner_stat '%u:%g:%a' "$EXPORT_STAGING/preflight-export.txt")" \
  "$builder_uid:$runner_gid:640" "$RUNNER_USER"
record "runner_can_read_export" "true" "$RUNNER_USER"
rm -f "$EXPORT_STAGING/preflight-export.txt"

# --- runner-owned logs, upload staging and diagnostics ---------------------
require_mode "runner_logs_owner_mode" "$(runner_stat '%u:%g:%a' "$RUNNER_LOG_ROOT")" \
  "$runner_uid:$runner_gid:700" "$RUNNER_USER"
require_mode "upload_staging_owner_mode" "$(runner_stat '%u:%g:%a' "$UPLOAD_STAGING")" \
  "$runner_uid:$runner_gid:700" "$RUNNER_USER"
require_mode "emergency_diagnostics_owner_mode" "$(runner_stat '%u:%g:%a' "$EMERGENCY_DIAGNOSTICS_ROOT")" \
  "$runner_uid:$runner_gid:700" "$RUNNER_USER"

printf '%s\n' runner-ok > "$RUNNER_LOG_ROOT/preflight-runner.txt"
printf '%s\n' upload-ok > "$UPLOAD_STAGING/preflight-upload.txt"
require_builder_denied "builder_cannot_read_runner_logs" "$RUNNER_LOG_ROOT/preflight-runner.txt"
require_builder_denied "builder_cannot_traverse_runner_logs" "$RUNNER_LOG_ROOT"
require_builder_denied "builder_cannot_read_upload_staging" "$UPLOAD_STAGING/preflight-upload.txt"
require_builder_denied "builder_cannot_traverse_upload_staging" "$UPLOAD_STAGING"
require_builder_denied "builder_cannot_read_diagnostics" "$EMERGENCY_DIAGNOSTICS_ROOT"

# --- proxy profile validator, executed as the builder ----------------------
node_bin="$(command -v "$NODE_BIN" 2>/dev/null || true)"
if [[ -z "$node_bin" ]]; then
  fail "node_available" "node on the runner PATH" "not found: $NODE_BIN" "$RUNNER_USER"
fi
record "node_bin" "$node_bin" "$RUNNER_USER"
loopback='{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"80"}],"443/tcp":[{"HostIp":"127.0.0.1","HostPort":"443"}],"443/udp":[{"HostIp":"127.0.0.1","HostPort":"443"}]}'
wildcard='{"80/tcp":[{"HostIp":"","HostPort":"80"}],"443/tcp":[{"HostIp":"0.0.0.0","HostPort":"443"}],"443/udp":[{"HostIp":"::","HostPort":"443"}]}'
if ! as_builder "$node_bin" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$loopback" --profile loopback >/dev/null 2>&1; then
  fail "loopback_profile" "loopback bindings validate as builder" "validator rejected loopback" "$BUILDER_USER"
fi
if ! as_builder "$node_bin" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$wildcard" --profile wildcard >/dev/null 2>&1; then
  fail "wildcard_profile" "wildcard bindings validate as builder" "validator rejected wildcard" "$BUILDER_USER"
fi
if as_builder "$node_bin" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$loopback" --profile wildcard >/dev/null 2>&1; then
  fail "mixed_profile_rejected" "wildcard rejects loopback addresses" "wildcard accepted loopback" "$BUILDER_USER"
fi
if as_builder "$node_bin" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$wildcard" --profile loopback >/dev/null 2>&1; then
  fail "mixed_profile_rejected" "loopback rejects wildcard addresses" "loopback accepted wildcard" "$BUILDER_USER"
fi
record "loopback_profile" "valid" "$BUILDER_USER"
record "wildcard_profile" "valid" "$BUILDER_USER"
record "mixed_profiles_rejected" "true" "$BUILDER_USER"

# --- Docker endpoint capability, observed last -----------------------------
# A DinD startup failure must not prevent the filesystem fixtures above from
# running or being retained. The workflow also probes the published endpoint
# independently; this check proves both endpoints work as the builder and that
# their observed daemon identities differ.
if [[ "$PREFLIGHT_SKIP_DOCKER" == "1" ]]; then
  record "docker_checks" "skipped" "$RUNNER_USER"
else
  docker_bin="$(as_builder bash -c 'command -v docker' 2>/dev/null || true)"
  if [[ -z "$docker_bin" ]]; then
    fail "builder_docker_client" "docker on the builder PATH" "not found" "$BUILDER_USER"
  fi
  record "builder_docker_client" "$docker_bin" "$BUILDER_USER"

  probe_timeout="${PREFLIGHT_DOCKER_PROBE_TIMEOUT_SECONDS:-10}"
  host_deadline="${PREFLIGHT_HOST_DOCKER_TIMEOUT_SECONDS:-20}"
  build_deadline="${PREFLIGHT_BUILD_DOCKER_TIMEOUT_SECONDS:-60}"
  host_daemon=""
  host_deadline_at=$(( $(date +%s) + host_deadline ))
  while :; do
    if host_daemon="$(as_builder env DOCKER_HOST="$DOCKER_HOST_ENDPOINT" timeout --signal=TERM --kill-after=3 "$probe_timeout" "$docker_bin" info --format '{{.ID}}' 2>/dev/null)" \
      && [[ -n "$host_daemon" ]]; then
      break
    fi
    host_daemon=""
    [[ $(date +%s) -lt $host_deadline_at ]] || break
    sleep 1
  done
  if [[ -z "$host_daemon" ]]; then
    fail "builder_host_docker" "docker info succeeds as builder on $DOCKER_HOST_ENDPOINT" "failed after ${host_deadline}s" "$BUILDER_USER"
  fi
  record "builder_host_docker_id" "$host_daemon" "$BUILDER_USER"

  [[ "$DOCKER_BUILD_ENDPOINT" =~ ^tcp://(127\.0\.0\.1|\[::1\]):[0-9]+$ ]] \
    || fail "builder_build_endpoint_loopback" "loopback-only build endpoint" "$DOCKER_BUILD_ENDPOINT" "$RUNNER_USER"

  build_daemon=""
  build_deadline_at=$(( $(date +%s) + build_deadline ))
  while :; do
    if build_daemon="$(as_builder env DOCKER_HOST="$DOCKER_BUILD_ENDPOINT" timeout --signal=TERM --kill-after=3 "$probe_timeout" "$docker_bin" info --format '{{.ID}}' 2>/dev/null)" \
      && [[ -n "$build_daemon" ]]; then
      break
    fi
    build_daemon=""
    [[ $(date +%s) -lt $build_deadline_at ]] || break
    sleep 1
  done
  if [[ -z "$build_daemon" ]]; then
    record "builder_build_docker_last_status" "failed" "$BUILDER_USER"
    fail "builder_build_docker" "docker info succeeds as builder on $DOCKER_BUILD_ENDPOINT" "failed after ${build_deadline}s" "$BUILDER_USER"
  fi
  record "builder_build_docker_id" "$build_daemon" "$BUILDER_USER"
  if [[ "$build_daemon" == "$host_daemon" ]]; then
    fail "distinct_docker_daemons" "build daemon differs from host daemon" "both are $host_daemon" "$BUILDER_USER"
  fi
  record "distinct_docker_daemons" "true" "$BUILDER_USER"
fi

write_summary 0
write_json 0
trap - ERR
