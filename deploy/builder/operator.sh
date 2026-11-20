#!/usr/bin/env bash
# Supported operator CLI path for the packaged builder runtime.
#
# It runs the operator inside the exact runtime image, with no network, the
# runtime UID and the same store volume. This avoids host Node/version drift and
# lets the operator share the runtime's stable store host id.
#
# Required:
#   BUILDER_OPERATOR_IMAGE   exact image, e.g. ornigami-builder:<sha>
#   BUILDER_RUNTIME_STORE_HOST_ID
#                            the same constant used by the runtime for this
#                            volume; lock metadata and recovery depend on it
#   one of:
#     BUILDER_OPERATOR_VOLUME   named volume mounted at /data/builder
#     BUILDER_OPERATOR_STORE    absolute host directory mounted at /data/builder
#
# Optional:
#   ENGINE=docker|podman        default: first available
#   --print-command             print the exact engine command and exit
#
# Examples:
#   BUILDER_OPERATOR_IMAGE=ornigami-builder:abc1234 \
#   BUILDER_OPERATOR_VOLUME=ornigami-builder-store \
#   BUILDER_RUNTIME_STORE_HOST_ID=ornigami-builder-store-v1 \
#     ./deploy/builder/operator.sh list --json
#
#   ./deploy/builder/operator.sh --print-command lock-status --json

set -euo pipefail

usage() {
  sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

PRINT_ONLY=0
if [[ "${1:-}" == "--print-command" ]]; then
  PRINT_ONLY=1
  shift
fi
if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

COMMAND="$1"
shift
case "$COMMAND" in
  issue|revoke-invite|revoke-session|revoke-subject|reconcile-usage|lock-status|recover-lock|list) ;;
  *)
    echo "Unsupported operator command: $COMMAND" >&2
    usage >&2
    exit 2
    ;;
esac

ENGINE="${ENGINE:-}"
if [[ -z "$ENGINE" ]]; then
  for candidate in docker podman; do
    if command -v "$candidate" >/dev/null 2>&1; then ENGINE="$candidate"; break; fi
  done
fi
if [[ -z "$ENGINE" ]]; then
  if [[ "$PRINT_ONLY" == "1" ]]; then
    ENGINE="docker"
  else
    echo "No Docker or Podman engine found; set ENGINE explicitly." >&2
    exit 2
  fi
fi
if [[ "$PRINT_ONLY" != "1" ]] && ! command -v "$ENGINE" >/dev/null 2>&1; then
  echo "Engine not found: $ENGINE" >&2
  exit 2
fi

IMAGE="${BUILDER_OPERATOR_IMAGE:-}"
HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:-}"
VOLUME="${BUILDER_OPERATOR_VOLUME:-}"
BIND_STORE="${BUILDER_OPERATOR_STORE:-}"

[[ -n "$IMAGE" ]] || { echo "BUILDER_OPERATOR_IMAGE is required." >&2; exit 2; }
[[ -n "$HOST_ID" ]] || {
  echo "BUILDER_RUNTIME_STORE_HOST_ID is required and must equal the runtime value." >&2
  exit 2
}
if [[ -n "$VOLUME" && -n "$BIND_STORE" ]]; then
  echo "Set only one of BUILDER_OPERATOR_VOLUME or BUILDER_OPERATOR_STORE." >&2
  exit 2
fi
if [[ -z "$VOLUME" && -z "$BIND_STORE" ]]; then
  echo "Set BUILDER_OPERATOR_VOLUME or BUILDER_OPERATOR_STORE." >&2
  exit 2
fi
if [[ -n "$BIND_STORE" ]]; then
  [[ "$BIND_STORE" = /* ]] || {
    echo "BUILDER_OPERATOR_STORE must be an absolute path." >&2
    exit 2
  }
  if [[ "$PRINT_ONLY" != "1" && ! -d "$BIND_STORE" ]]; then
    echo "BUILDER_OPERATOR_STORE does not exist: $BIND_STORE" >&2
    exit 2
  fi
  MOUNT=(--mount "type=bind,src=$BIND_STORE,dst=/data/builder")
else
  MOUNT=(--mount "type=volume,src=$VOLUME,dst=/data/builder")
fi

RUN=(
  "$ENGINE" run --rm
  --network none
  --read-only
  --tmpfs /tmp:rw,noexec,nosuid,size=16m
  --tmpfs /home/node:rw,noexec,nosuid,size=16m
  --user 1000:1000
  "${MOUNT[@]}"
  -e "BUILDER_RUNTIME_STORE_HOST_ID=$HOST_ID"
  "$IMAGE"
  --experimental-strip-types /app/scripts/builder-invite-operator.mjs
  "$COMMAND" --store /data/builder "$@"
)

if [[ "$PRINT_ONLY" == "1" ]]; then
  printf '%q ' "${RUN[@]}"
  printf '\n'
  exit 0
fi

exec "${RUN[@]}"
