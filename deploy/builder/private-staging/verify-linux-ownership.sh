#!/usr/bin/env bash
# Lightweight Linux preflight for the runner/builder ownership boundary.
# Runs before dependency installation, full suites or image building.
set -Eeuo pipefail

RUNNER_USER="${RUNNER_USER:?RUNNER_USER is required}"
BUILDER_USER="${BUILDER_USER:?BUILDER_USER is required}"
SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
EMERGENCY_DIAGNOSTICS_ROOT="${EMERGENCY_DIAGNOSTICS_ROOT:?EMERGENCY_DIAGNOSTICS_ROOT is required}"
RUNNER_LOG_ROOT="${RUNNER_LOG_ROOT:?RUNNER_LOG_ROOT is required}"
BUILDER_EVIDENCE_ROOT="${BUILDER_EVIDENCE_ROOT:?BUILDER_EVIDENCE_ROOT is required}"
EXPORT_STAGING="${EXPORT_STAGING:?EXPORT_STAGING is required}"
UPLOAD_STAGING="${UPLOAD_STAGING:?UPLOAD_STAGING is required}"
NODE_BIN="${NODE_BIN:-node}"

fail() { echo "FAIL: $1" >&2; exit 1; }
command -v "$NODE_BIN" >/dev/null 2>&1 || fail "$NODE_BIN is required for the proxy profile preflight"
runner_uid="$(id -u "$RUNNER_USER")"
builder_uid="$(id -u "$BUILDER_USER")"
builder_gid="$(id -g "$BUILDER_USER")"
builder_group="$(id -gn "$BUILDER_USER")"
runner_group="$(id -gn "$RUNNER_USER")"

[[ "$builder_uid" == "1000" ]] || fail "builder UID is $builder_uid, expected 1000"
[[ "$runner_uid" != "$builder_uid" ]] || fail "runner and builder share UID $runner_uid"
[[ "$RUNNER_USER" != "$BUILDER_USER" ]] || fail "runner and builder are the same user"
[[ -d "$EMERGENCY_DIAGNOSTICS_ROOT" ]] || fail "runner emergency diagnostics root is missing"

sudo -u "$BUILDER_USER" env HOME="$(getent passwd "$BUILDER_USER" | cut -d: -f6)" \
  bash -c 'printf "%s\n" builder-ok > "$1/preflight-builder.txt"' _ "$BUILDER_EVIDENCE_ROOT"
[[ -r "$BUILDER_EVIDENCE_ROOT/preflight-builder.txt" ]] \
  && fail "runner can read builder working evidence directly"
sudo -u "$BUILDER_USER" test "$(stat -c '%u:%g:%a' "$BUILDER_EVIDENCE_ROOT")" = "$builder_uid:$builder_gid:700" \
  || fail "builder evidence root must be builder-owned 0700"

sudo -u "$BUILDER_USER" install -m 0640 /dev/null "$EXPORT_STAGING/preflight-export.txt"
sudo -u "$BUILDER_USER" bash -c 'printf "%s\n" export-ok > "$1"' _ "$EXPORT_STAGING/preflight-export.txt"
[[ "$(cat "$EXPORT_STAGING/preflight-export.txt")" == "export-ok" ]] \
  || fail "runner cannot read approved builder export staging"
[[ "$(stat -c '%a' "$EXPORT_STAGING/preflight-export.txt")" == "640" ]] \
  || fail "approved export file mode is not 0640"
rm -f "$EXPORT_STAGING/preflight-export.txt"

printf '%s\n' runner-ok > "$RUNNER_LOG_ROOT/preflight-runner.txt"
if sudo -u "$BUILDER_USER" test -r "$RUNNER_LOG_ROOT/preflight-runner.txt"; then
  fail "builder can read runner logs"
fi
chmod 0700 "$UPLOAD_STAGING"
printf '%s\n' upload-ok > "$UPLOAD_STAGING/preflight-upload.txt"
if sudo -u "$BUILDER_USER" test -r "$UPLOAD_STAGING/preflight-upload.txt"; then
  fail "builder can read runner upload staging"
fi

store_dir="$BUILDER_EVIDENCE_ROOT/preflight-store"
sudo -u "$BUILDER_USER" bash -c '
  set -Eeuo pipefail
  dir="$1"
  mkdir -m 0700 "$dir"
  printf "%s\n" store-ok > "$dir/identity-store.json"
  chmod 0600 "$dir/identity-store.json"
' _ "$store_dir"
[[ "$(stat -c '%a' "$store_dir")" == "700" ]] || fail "preflight store root is not 0700"
[[ "$(stat -c '%a' "$store_dir/identity-store.json")" == "600" ]] || fail "preflight store file is not 0600"
if [[ -r "$store_dir/identity-store.json" ]]; then fail "runner can read the builder store"; fi

loopback='{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"80"}],"443/tcp":[{"HostIp":"127.0.0.1","HostPort":"443"}],"443/udp":[{"HostIp":"127.0.0.1","HostPort":"443"}]}'
wildcard='{"80/tcp":[{"HostIp":"","HostPort":"80"}],"443/tcp":[{"HostIp":"0.0.0.0","HostPort":"443"}],"443/udp":[{"HostIp":"::","HostPort":"443"}]}'
"$NODE_BIN" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$loopback" --profile loopback >/dev/null \
  || fail "loopback proxy binding profile failed validation"
"$NODE_BIN" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$wildcard" --profile wildcard >/dev/null \
  || fail "wildcard proxy binding profile failed validation"
if "$NODE_BIN" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$loopback" --profile wildcard >/dev/null 2>&1; then
  fail "wildcard profile accepted loopback bindings"
fi
if "$NODE_BIN" "$SOURCE_ROOT/deploy/builder/private-staging/proxy-bindings.mjs" \
  --bindings-json "$wildcard" --profile loopback >/dev/null 2>&1; then
  fail "loopback profile accepted wildcard bindings"
fi

{
  printf 'runner_user=%s\n' "$RUNNER_USER"
  printf 'runner_uid=%s\n' "$runner_uid"
  printf 'builder_user=%s\n' "$BUILDER_USER"
  printf 'builder_uid=%s\n' "$builder_uid"
  printf 'builder_groups=%s\n' "$(id -Gn "$BUILDER_USER" | tr ' ' ',')"
  printf 'builder_evidence_mode=0700\n'
  printf 'export_staging_file_mode=0640\n'
  printf 'runner_logs_builder_unreadable=true\n'
  printf 'upload_staging_builder_unreadable=true\n'
  printf 'builder_store_root_mode=0700\n'
  printf 'builder_store_file_mode=0600\n'
  printf 'loopback_profile=valid\n'
  printf 'wildcard_profile=valid\n'
  printf 'mixed_profiles_rejected=true\n'
} | tee "$RUNNER_LOG_ROOT/ownership-preflight.txt"
