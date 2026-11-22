#!/usr/bin/env bash
# Preserve an earlier failure, but never report success while cleanup failed.
set -Eeuo pipefail

PRIMARY_STATUS="${1:?primary status is required}"
CLEANUP_FAILURES="${2:?cleanup failure count is required}"

[[ "$PRIMARY_STATUS" =~ ^[0-9]+$ ]] || { echo "FAIL: primary status is not an integer" >&2; exit 2; }
[[ "$CLEANUP_FAILURES" =~ ^[0-9]+$ ]] || { echo "FAIL: cleanup failure count is not an integer" >&2; exit 2; }

if (( PRIMARY_STATUS != 0 )); then
  printf 'final_status=%s\ncleanup_failures=%s\nreason=preserved_primary_failure\n' \
    "$PRIMARY_STATUS" "$CLEANUP_FAILURES"
  exit "$PRIMARY_STATUS"
fi
if (( CLEANUP_FAILURES > 0 )); then
  printf 'final_status=1\ncleanup_failures=%s\nreason=cleanup_incomplete\n' "$CLEANUP_FAILURES"
  exit 1
fi
printf 'final_status=0\ncleanup_failures=0\nreason=complete\n'
