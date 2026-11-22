#!/usr/bin/env bash
# Verify that the control plane, candidate source and harness identities are
# separate, immutable and anchored to the triggering commit.
set -Eeuo pipefail

CONTROL_ROOT="${CONTROL_ROOT:?CONTROL_ROOT is required}"
SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
WORKFLOW_SHA="${WORKFLOW_SHA:?WORKFLOW_SHA is required}"
SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
HARNESS_SHA="${HARNESS_SHA:?HARNESS_SHA is required}"
REQUIRE_TIPS="${REQUIRE_TIPS:-1}"

fail() { echo "FAIL: $*" >&2; exit 1; }

[[ "$WORKFLOW_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "workflow SHA is not 40 hex"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "source SHA is not 40 hex"
[[ "$HARNESS_SHA" == "$SOURCE_SHA" ]] || fail "harness SHA must equal source SHA"

control_head="$(git -C "$CONTROL_ROOT" rev-parse HEAD)"
source_head="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
[[ "$control_head" == "$WORKFLOW_SHA" ]] \
  || fail "control-plane HEAD $control_head does not equal triggering workflow SHA $WORKFLOW_SHA"
[[ "$source_head" == "$SOURCE_SHA" ]] \
  || fail "source HEAD $source_head does not equal candidate SHA $SOURCE_SHA"
[[ -z "$(git -C "$SOURCE_ROOT" status --porcelain --untracked-files=all)" ]] \
  || fail "candidate source tree is dirty"

if [[ "$REQUIRE_TIPS" == "1" ]]; then
  git -C "$SOURCE_ROOT" merge-base --is-ancestor 340ee97c51ca56c87cd9ec36bc642f2e67ea67bd "$SOURCE_SHA" \
    || fail "orchestration tip is not an ancestor of the source"
  git -C "$SOURCE_ROOT" merge-base --is-ancestor ebb487da11118ff458ecbdf1d268f2ebd5ceb5b1 "$SOURCE_SHA" \
    || fail "journal tip is not an ancestor of the source"
fi

cat <<EOF
controlPlaneHead=$control_head
workflowSha=$WORKFLOW_SHA
applicationSourceSha=$SOURCE_SHA
harnessSha=$HARNESS_SHA
sourceClean=true
requiredTipsAncestors=$REQUIRE_TIPS
EOF
