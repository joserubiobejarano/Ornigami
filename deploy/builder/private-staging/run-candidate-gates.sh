#!/usr/bin/env bash
# Candidate dependency, test, TypeScript, lint and security gate.
#
# This helper is invoked as a child process by run-exact-rehearsal-linux.sh so
# that clearing rehearsal selectors cannot affect the later checkpoint and
# qualification phases. It runs as the intended builder identity.
#
# Required:
#   SOURCE_ROOT              clean candidate checkout owned by the builder
#   NPM_CLI_FOR_REHEARSAL    vendored npm-cli.js
#   A04_PG_BIN               PostgreSQL 17 bin directory
# Optional:
#   NODE_BIN                 Node 22 binary (default: node)
#   CANDIDATE_TEST_JOBS      test concurrency (default: 1)
set -Eeuo pipefail

SOURCE_ROOT="${SOURCE_ROOT:?SOURCE_ROOT is required}"
NPM_CLI_FOR_REHEARSAL="${NPM_CLI_FOR_REHEARSAL:?NPM_CLI_FOR_REHEARSAL is required}"
A04_PG_BIN="${A04_PG_BIN:?A04_PG_BIN is required}"
NODE_BIN="${NODE_BIN:-node}"
CANDIDATE_TEST_JOBS="${CANDIDATE_TEST_JOBS:-1}"

[[ -d "$SOURCE_ROOT" ]] || { echo "FAIL: SOURCE_ROOT is not a directory: $SOURCE_ROOT" >&2; exit 1; }
[[ -n "$A04_PG_BIN" ]] || { echo "FAIL: A04_PG_BIN is required" >&2; exit 1; }
[[ -x "$A04_PG_BIN/initdb" ]] || { echo "FAIL: A04_PG_BIN does not contain executable initdb: $A04_PG_BIN" >&2; exit 1; }
[[ -x "$A04_PG_BIN/postgres" ]] || { echo "FAIL: A04_PG_BIN does not contain executable postgres: $A04_PG_BIN" >&2; exit 1; }
command -v "$NODE_BIN" >/dev/null 2>&1 || { echo "FAIL: Node binary not found: $NODE_BIN" >&2; exit 1; }
[[ -f "$NPM_CLI_FOR_REHEARSAL" ]] || { echo "FAIL: vendored npm CLI not found: $NPM_CLI_FOR_REHEARSAL" >&2; exit 1; }

cd "$SOURCE_ROOT"

# Rehearsal orchestration variables must not leak into the candidate suite. This
# process is a child, so the parent still holds the values used later by
# ACTION=checkpoint and ACTION=qualify.
unset BUILD_ENDPOINT VERIFY_ENDPOINT PHASE_ENDPOINT \
      BUILD_CONTEXT VERIFY_CONTEXT PHASE_CONTEXT \
      BUILD_ENGINE VERIFY_ENGINE PHASE_ENGINE \
      BUILD_ENGINE_BIN VERIFY_ENGINE_BIN PHASE_ENGINE_BIN \
      REHEARSAL_DIR ACTION SOURCE_SHA HARNESS_SHA WORKFLOW_SHA \
      DOCKER_HOST_ENDPOINT BUILD_DAEMON_READINESS_SECONDS \
      HOST_DAEMON_READINESS_SECONDS DAEMON_PROBE_TIMEOUT_SECONDS \
      STAGING_ORIGIN STAGING_HOST APP_URL

# Preserve the PostgreSQL/toolchain values the test processes need.
export A04_PG_BIN
export PG_BIN="${PG_BIN:-$A04_PG_BIN}"

mapfile -t candidate_test_suites < <(
  find tests -maxdepth 1 -type f \( -name '*.test.mjs' -o -name '*.test.mts' \) | sort
)
[[ "${#candidate_test_suites[@]}" -gt 0 ]] || {
  echo "FAIL: no candidate test suites discovered" >&2
  exit 1
}

{
  printf 'candidate_gate_node=%s\n' "$(command -v "$NODE_BIN")"
  printf 'candidate_gate_npm=%s\n' "$NPM_CLI_FOR_REHEARSAL"
  printf 'candidate_gate_pg_bin=%s\n' "$A04_PG_BIN"
  printf 'candidate_gate_initdb=%s\n' "$A04_PG_BIN/initdb"
  printf 'candidate_gate_postgres=%s\n' "$A04_PG_BIN/postgres"
  printf 'candidate_gate_test_count=%s\n' "${#candidate_test_suites[@]}"
  printf 'candidate_gate_test_concurrency=%s\n' "$CANDIDATE_TEST_JOBS"
  printf 'candidate_gate_rehearsal_selectors_cleared=true\n'
} >&2

"$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" ci --no-audit --no-fund
"$NODE_BIN" --experimental-strip-types --test --test-concurrency="$CANDIDATE_TEST_JOBS" "${candidate_test_suites[@]}"
"$NODE_BIN" node_modules/typescript/bin/tsc --noEmit
"$NODE_BIN" node_modules/eslint/bin/eslint.js .
"$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" run security:audit
"$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" run test:security

printf 'candidate_gate_status=pass\n'
