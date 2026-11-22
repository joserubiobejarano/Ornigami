#!/usr/bin/env bash
# Assert the expected closed-mode HTTP surface.
set -Eeuo pipefail

HOME_STATUS="${1:?closed home status is required}"
BUILDER_STATUS="${2:?closed builder status is required}"
SESSION_STATUS="${3:?closed session status is required}"

[[ "$HOME_STATUS" == "200" ]] || { echo "FAIL: closed home expected 200, got $HOME_STATUS" >&2; exit 1; }
[[ "$BUILDER_STATUS" == "404" ]] || { echo "FAIL: closed builder expected 404, got $BUILDER_STATUS" >&2; exit 1; }
[[ "$SESSION_STATUS" == "401" ]] || { echo "FAIL: closed session expected 401, got $SESSION_STATUS" >&2; exit 1; }
printf 'closed_home=%s\nclosed_builder=%s\nclosed_session=%s\n' "$HOME_STATUS" "$BUILDER_STATUS" "$SESSION_STATUS"
