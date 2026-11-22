#!/usr/bin/env bash
# Bounded readiness probe for the exact Docker endpoint used by the builder.
#
# The pinned docker:27-dind image starts dockerd in non-TLS mode, but the
# container being "running"/"healthy" does not prove that the published TCP API
# is accepting requests. This probe runs the real Docker client as the intended
# builder identity, against the exact endpoint, with:
#   * a per-probe timeout (no single attempt can hang), and
#   * an overall deadline (no unbounded retry or blind fixed sleep).
#
# It distinguishes transport/startup failures (connection refused, EOF, timeout)
# from access/configuration errors (permission denied, TLS/certificate, context).
# On failure it retains bounded listener/service diagnostics from the host.
#
# Required:
#   DOCKER_ENDPOINT       unix:///... or tcp://127.0.0.1:<port> / tcp://[::1]:<port>
#   BUILDER_USER          account that must be able to use the endpoint
#   EVIDENCE_DIR          existing directory for receipts/diagnostics
# Optional:
#   PROBE_LABEL           receipt label (default: docker)
#   DOCKER_BIN            docker client path (default: docker)
#   OVERALL_TIMEOUT_SECONDS  default 300
#   PROBE_TIMEOUT_SECONDS    default 15
#   PROBE_INTERVAL_SECONDS   default 2
set -Eeuo pipefail

ENDPOINT="${DOCKER_ENDPOINT:-${ENDPOINT:-}}"
BUILDER_USER="${BUILDER_USER:-}"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
PROBE_LABEL="${PROBE_LABEL:-docker}"
DOCKER_BIN="${DOCKER_BIN:-docker}"
OVERALL_TIMEOUT_SECONDS="${OVERALL_TIMEOUT_SECONDS:-300}"
PROBE_TIMEOUT_SECONDS="${PROBE_TIMEOUT_SECONDS:-15}"
PROBE_INTERVAL_SECONDS="${PROBE_INTERVAL_SECONDS:-2}"

fail() { echo "FAIL: $*" >&2; exit 2; }

[[ -n "$ENDPOINT" ]] || fail "DOCKER_ENDPOINT is required"
[[ -n "$BUILDER_USER" ]] || fail "BUILDER_USER is required"
[[ -n "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR is required"
[[ -d "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR does not exist: $EVIDENCE_DIR"
[[ "$OVERALL_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "OVERALL_TIMEOUT_SECONDS must be a positive integer"
[[ "$PROBE_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "PROBE_TIMEOUT_SECONDS must be a positive integer"
[[ "$PROBE_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "PROBE_INTERVAL_SECONDS must be a positive integer"
command -v timeout >/dev/null 2>&1 || fail "the timeout utility is required"
command -v "$DOCKER_BIN" >/dev/null 2>&1 || fail "Docker client not found: $DOCKER_BIN"
command -v sudo >/dev/null 2>&1 || fail "sudo is required"

case "$ENDPOINT" in
  unix:*) ;;
  tcp:*)
    [[ "$ENDPOINT" =~ ^tcp://(127\.0\.0\.1|\[::1\]):[0-9]+$ ]] \
      || fail "tcp endpoint must be loopback-only: $ENDPOINT"
    ;;
  *)
    fail "endpoint must be unix:///... or loopback tcp://127.0.0.1:<port> / tcp://[::1]:<port>: $ENDPOINT"
    ;;
esac

if [[ "$ENDPOINT" =~ ^tcp://127\.0\.0\.1:([0-9]+)$ ]]; then
  ENDPOINT_PORT="${BASH_REMATCH[1]}"
elif [[ "$ENDPOINT" =~ ^tcp://\[::1\]:([0-9]+)$ ]]; then
  ENDPOINT_PORT="${BASH_REMATCH[1]}"
else
  ENDPOINT_PORT=""
fi

RECEIPT_JSON="$EVIDENCE_DIR/docker-readiness-$PROBE_LABEL.json"
RECEIPT_TXT="$EVIDENCE_DIR/docker-readiness-$PROBE_LABEL.txt"
ATTEMPTS_TSV="$EVIDENCE_DIR/docker-readiness-$PROBE_LABEL-attempts.tsv"
DIAGNOSTICS_TXT="$EVIDENCE_DIR/docker-readiness-$PROBE_LABEL-diagnostics.txt"
WORK_DIR="$(mktemp -d "$EVIDENCE_DIR/.probe-$PROBE_LABEL.XXXXXX")"
cleanup_work() { rm -rf "$WORK_DIR"; }
trap cleanup_work EXIT

: > "$ATTEMPTS_TSV"
rm -f "$DIAGNOSTICS_TXT"

RUNNER_USER="$(id -un)"
RUNNER_UID="$(id -u)"
EFFECTIVE_USER="$RUNNER_USER"
if [[ "$RUNNER_USER" == "$BUILDER_USER" ]]; then
  AS_BUILDER=()
  EFFECTIVE_USER="$(id -un)"
else
  AS_BUILDER=(sudo -n -u "$BUILDER_USER" --)
  EFFECTIVE_USER="$(sudo -n -u "$BUILDER_USER" -- id -un)"
fi
[[ "$EFFECTIVE_USER" == "$BUILDER_USER" ]] \
  || fail "could not execute the probe as $BUILDER_USER (observed $EFFECTIVE_USER)"

BUILDER_DOCKER_BIN="$(sudo -n -u "$BUILDER_USER" -- bash -c "command -v $(printf '%q' "$DOCKER_BIN")" 2>/dev/null || true)"
[[ -n "$BUILDER_DOCKER_BIN" ]] || fail "Docker client is not on $BUILDER_USER's PATH: $DOCKER_BIN"

BUILDER_TIMEOUT="$(sudo -n -u "$BUILDER_USER" -- bash -c 'command -v timeout' 2>/dev/null || true)"
[[ -n "$BUILDER_TIMEOUT" ]] || fail "timeout is not available to $BUILDER_USER"

STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
START_MS="$(date +%s%3N)"
DEADLINE_MS=$((START_MS + OVERALL_TIMEOUT_SECONDS * 1000))
ATTEMPT=0
LAST_STATUS=0
LAST_CLASSIFICATION="not-run"
LAST_OBSERVED=""
DAEMON_ID=""
SERVER_VERSION=""

classify() { # status stderr-file
  local status="$1" file="$2" text=""
  if [[ -f "$file" ]]; then text="$(tr '[:upper:]' '[:lower:]' < "$file" | head -c 4096)"; fi
  if [[ "$status" == "124" || "$status" == "137" ]]; then
    printf 'timeout'
  elif [[ "$text" == *"permission denied"* || "$text" == *"operation not permitted"* || "$text" == *"unauthorized"* || "$text" == *"certificate"* || "$text" == *"x509"* || "$text" == *"tls"* || "$text" == *"https client"* ]]; then
    printf 'access_or_config'
  elif [[ "$text" == *"connection refused"* || "$text" == *"no such host"* || "$text" == *"eof"* || "$text" == *"empty reply"* || "$text" == *"reset by peer"* || "$text" == *"cannot connect"* || "$text" == *"is the docker daemon running"* || "$text" == *"i/o timeout"* || "$text" == *"context deadline exceeded"* ]]; then
    printf 'transient_startup'
  elif [[ "$text" == *"context"* || "$text" == *"invalid"* || "$text" == *"unknown flag"* ]]; then
    printf 'access_or_config'
  else
    printf 'unknown'
  fi
}

while :; do
  NOW_MS="$(date +%s%3N)"
  REMAINING_MS=$((DEADLINE_MS - NOW_MS))
  if (( REMAINING_MS <= 0 )); then break; fi
  ATTEMPT=$((ATTEMPT + 1))
  ATTEMPT_OUT="$WORK_DIR/out.$ATTEMPT"
  ATTEMPT_ERR="$WORK_DIR/err.$ATTEMPT"
  PER_PROBE_SECONDS="$PROBE_TIMEOUT_SECONDS"
  REMAINING_SECONDS=$(( (REMAINING_MS + 999) / 1000 ))
  if (( PER_PROBE_SECONDS > REMAINING_SECONDS )); then PER_PROBE_SECONDS="$REMAINING_SECONDS"; fi
  ATTEMPT_START_MS="$(date +%s%3N)"

  set +e
  "${AS_BUILDER[@]}" env DOCKER_HOST="$ENDPOINT" \
    "$BUILDER_TIMEOUT" --signal=TERM --kill-after=3 "$PER_PROBE_SECONDS" \
    "$BUILDER_DOCKER_BIN" info --format '{{.ID}}' >"$ATTEMPT_OUT" 2>"$ATTEMPT_ERR"
  LAST_STATUS=$?
  set -e
  ATTEMPT_END_MS="$(date +%s%3N)"
  ATTEMPT_ELAPSED_MS=$((ATTEMPT_END_MS - ATTEMPT_START_MS))
  OBSERVED="$(tr -d '\r\n' < "$ATTEMPT_OUT" 2>/dev/null | head -c 256 || true)"
  LAST_OBSERVED="$OBSERVED"

  if [[ "$LAST_STATUS" == "0" && -n "$OBSERVED" ]]; then
    LAST_CLASSIFICATION="ready"
    DAEMON_ID="$OBSERVED"
    set +e
    "${AS_BUILDER[@]}" env DOCKER_HOST="$ENDPOINT" \
      "$BUILDER_TIMEOUT" --signal=TERM --kill-after=3 "$PER_PROBE_SECONDS" \
      "$BUILDER_DOCKER_BIN" version --format '{{.Server.Version}}' >"$WORK_DIR/version" 2>/dev/null
    set -e
    SERVER_VERSION="$(tr -d '\r\n' < "$WORK_DIR/version" 2>/dev/null | head -c 128 || true)"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$ATTEMPT" "$ATTEMPT_ELAPSED_MS" "$LAST_STATUS" \
      "$LAST_CLASSIFICATION" "$ENDPOINT" "$DAEMON_ID" "" >> "$ATTEMPTS_TSV"
    break
  fi

  if [[ "$LAST_STATUS" == "0" && -z "$OBSERVED" ]]; then
    LAST_CLASSIFICATION="empty_response"
  else
    LAST_CLASSIFICATION="$(classify "$LAST_STATUS" "$ATTEMPT_ERR")"
  fi
  ERROR_SUMMARY="$(tr '\r\n' '  ' < "$ATTEMPT_ERR" 2>/dev/null | head -c 500 || true)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$ATTEMPT" "$ATTEMPT_ELAPSED_MS" "$LAST_STATUS" \
    "$LAST_CLASSIFICATION" "$ENDPOINT" "" "$ERROR_SUMMARY" >> "$ATTEMPTS_TSV"

  # Access/configuration errors cannot be fixed by waiting.
  if [[ "$LAST_CLASSIFICATION" == "access_or_config" ]]; then break; fi

  NOW_MS="$(date +%s%3N)"
  REMAINING_MS=$((DEADLINE_MS - NOW_MS))
  if (( REMAINING_MS <= 0 )); then break; fi
  SLEEP_SECONDS="$PROBE_INTERVAL_SECONDS"
  REMAINING_SECONDS=$(( (REMAINING_MS + 999) / 1000 ))
  if (( SLEEP_SECONDS > REMAINING_SECONDS )); then SLEEP_SECONDS="$REMAINING_SECONDS"; fi
  sleep "$SLEEP_SECONDS"
done

FINISHED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
ELAPSED_MS=$(( $(date +%s%3N) - START_MS ))
OK=false
if [[ "$LAST_CLASSIFICATION" == "ready" && -n "$DAEMON_ID" ]]; then OK=true; fi

diagnostics() {
  {
    printf 'generated_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'label=%s\n' "$PROBE_LABEL"
    printf 'endpoint=%s\n' "$ENDPOINT"
    printf 'builder_user=%s\n' "$BUILDER_USER"
    printf 'effective_user=%s\n' "$EFFECTIVE_USER"
    printf 'attempts=%s\n' "$ATTEMPT"
    printf 'last_status=%s\n' "$LAST_STATUS"
    printf 'last_classification=%s\n' "$LAST_CLASSIFICATION"
    printf 'last_observed=%s\n' "$LAST_OBSERVED"
    printf 'elapsed_ms=%s\n' "$ELAPSED_MS"
    printf 'overall_timeout_seconds=%s\n' "$OVERALL_TIMEOUT_SECONDS"
    printf 'probe_timeout_seconds=%s\n' "$PROBE_TIMEOUT_SECONDS"
    printf 'runner_user=%s\n' "$RUNNER_USER"
    printf 'runner_uid=%s\n' "$RUNNER_UID"
    printf '\n--- attempts ---\n'
    cat "$ATTEMPTS_TSV" 2>/dev/null || true
    printf '\n--- host listener ---\n'
    if [[ -n "$ENDPOINT_PORT" ]]; then
      ss -ltn "sport = :$ENDPOINT_PORT" 2>&1 || true
      ss -ltnp "sport = :$ENDPOINT_PORT" 2>&1 || true
    else
      printf 'not applicable for %s\n' "$ENDPOINT"
    fi
    printf '\n--- host docker containers (bounded) ---\n'
    docker ps -a --no-trunc --format '{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}\t{{.Ports}}' 2>&1 | head -c 131072 || true
    printf '\n--- host docker info (bounded) ---\n'
    docker info 2>&1 | head -c 32768 || true
    if [[ -n "$ENDPOINT_PORT" ]]; then
      printf '\n--- matching container diagnostics (bounded) ---\n'
      match_ids="$(docker ps -a --no-trunc --format '{{.ID}}\t{{.Ports}}' 2>/dev/null \
        | awk -v port=":$ENDPOINT_PORT" 'index($0, port) { print $1 }' | head -n 4)"
      if [[ -z "$match_ids" ]]; then
        printf 'no container publishes port %s\n' "$ENDPOINT_PORT"
      fi
      while IFS= read -r id; do
        [[ -n "$id" ]] || continue
        printf '\n### container %s\n' "$id"
        docker inspect "$id" 2>&1 | head -c 65536 || true
        printf '\n### logs %s\n' "$id"
        docker logs --tail 200 "$id" 2>&1 | head -c 131072 || true
      done <<< "$match_ids"
    fi
  } > "$DIAGNOSTICS_TXT" 2>&1 || true
  # Hard bound the retained diagnostics even if a service is noisy.
  if [[ -f "$DIAGNOSTICS_TXT" ]]; then
    head -c 1048576 "$DIAGNOSTICS_TXT" > "$DIAGNOSTICS_TXT.tmp" 2>/dev/null || true
    mv "$DIAGNOSTICS_TXT.tmp" "$DIAGNOSTICS_TXT" 2>/dev/null || true
  fi
}

if [[ "$OK" != "true" ]]; then diagnostics; fi

node - "$RECEIPT_JSON" "$PROBE_LABEL" "$ENDPOINT" "$BUILDER_USER" "$EFFECTIVE_USER" \
  "$OK" "$LAST_CLASSIFICATION" "$ATTEMPT" "$ELAPSED_MS" "$DAEMON_ID" "$SERVER_VERSION" \
  "$LAST_STATUS" "$LAST_OBSERVED" "$OVERALL_TIMEOUT_SECONDS" "$PROBE_TIMEOUT_SECONDS" \
  "$STARTED_AT" "$FINISHED_AT" "$DIAGNOSTICS_TXT" <<'NODE'
const fs = require("node:fs");
const [
  file, label, endpoint, builderUser, effectiveUser, ok, classification, attempts,
  elapsedMs, daemonId, serverVersion, lastStatus, lastObserved, overallTimeoutSeconds,
  probeTimeoutSeconds, startedAt, finishedAt, diagnosticsPath,
] = process.argv.slice(2);
const receipt = {
  ok: ok === "true",
  label,
  endpoint,
  builderUser,
  effectiveUser,
  classification,
  attempts: Number(attempts),
  elapsedMs: Number(elapsedMs),
  daemonId: daemonId || null,
  serverVersion: serverVersion || null,
  lastExitStatus: Number(lastStatus),
  lastObserved: lastObserved || null,
  overallTimeoutSeconds: Number(overallTimeoutSeconds),
  probeTimeoutSeconds: Number(probeTimeoutSeconds),
  startedAt,
  finishedAt,
  diagnostics: isFile(diagnosticsPath) ? diagnosticsPath : null,
};
function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt)}\n`);
NODE

{
  printf 'label=%s\n' "$PROBE_LABEL"
  printf 'endpoint=%s\n' "$ENDPOINT"
  printf 'builder_user=%s\n' "$BUILDER_USER"
  printf 'effective_user=%s\n' "$EFFECTIVE_USER"
  printf 'ok=%s\n' "$OK"
  printf 'classification=%s\n' "$LAST_CLASSIFICATION"
  printf 'attempts=%s\n' "$ATTEMPT"
  printf 'elapsed_ms=%s\n' "$ELAPSED_MS"
  printf 'daemon_id=%s\n' "${DAEMON_ID:-}"
  printf 'server_version=%s\n' "${SERVER_VERSION:-}"
  printf 'overall_timeout_seconds=%s\n' "$OVERALL_TIMEOUT_SECONDS"
  printf 'probe_timeout_seconds=%s\n' "$PROBE_TIMEOUT_SECONDS"
  printf 'started_at=%s\n' "$STARTED_AT"
  printf 'finished_at=%s\n' "$FINISHED_AT"
  printf 'diagnostics=%s\n' "$([[ -f "$DIAGNOSTICS_TXT" ]] && printf '%s' "$DIAGNOSTICS_TXT" || true)"
} > "$RECEIPT_TXT"

if [[ "$OK" == "true" ]]; then
  printf 'docker endpoint ready: %s (%s) attempts=%s elapsed_ms=%s daemon=%s\n' \
    "$ENDPOINT" "$PROBE_LABEL" "$ATTEMPT" "$ELAPSED_MS" "$DAEMON_ID" >&2
  exit 0
fi

printf 'docker endpoint NOT ready: %s (%s) classification=%s attempts=%s elapsed_ms=%s last_status=%s\n' \
  "$ENDPOINT" "$PROBE_LABEL" "$LAST_CLASSIFICATION" "$ATTEMPT" "$ELAPSED_MS" "$LAST_STATUS" >&2
if [[ -f "$DIAGNOSTICS_TXT" ]]; then
  printf 'diagnostics retained at %s\n' "$DIAGNOSTICS_TXT" >&2
fi
exit 1
