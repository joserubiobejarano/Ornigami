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

require_executable() { # root path
  local root="$1" path="$2" mode
  if [[ -z "$(git -C "$root" ls-files -s -- "$path")" ]]; then
    return 0
  fi
  mode="$(git -C "$root" ls-files -s -- "$path" | awk '{print $1}')"
  [[ "$mode" == "100755" ]] \
    || fail "helper is not executable in $root: $path (mode ${mode:-missing})"
}

# These helpers are invoked directly (not through an interpreter) somewhere in
# the candidate/control path. A mode-only checkout regression would otherwise
# fail late, after installation or after a build.
for path in \
  deploy/builder/private-staging/build-and-retain.sh \
  deploy/builder/private-staging/qualify-existing-image.sh \
  deploy/builder/private-staging/accept-browser.sh \
  deploy/builder/private-staging/accept-runtime.sh \
  deploy/builder/private-staging/accept-runtime-rollback.sh \
  deploy/builder/private-staging/rehearse-exact-candidate.sh \
  deploy/builder/qualify-linux.sh; do
  require_executable "$SOURCE_ROOT" "$path"
done
for path in \
  deploy/builder/private-staging/run-exact-rehearsal-linux.sh \
  deploy/builder/private-staging/cleanup-owned-resources.sh \
  deploy/builder/private-staging/finalize-rehearsal-status.sh \
  deploy/builder/private-staging/assert-closed-smoke.sh \
  deploy/builder/private-staging/probe-docker-endpoint.sh; do
  require_executable "$CONTROL_ROOT" "$path"
done

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
