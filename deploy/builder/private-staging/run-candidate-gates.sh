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

# Explicit allowlist boundary for every candidate command. Production and
# rehearsal selectors cannot silently affect the suite; only toolchain, home/
# temp, PostgreSQL, CI, network-trust and documented fixture configuration pass.
ALLOWLIST_NAMES=(
  PATH HOME TMPDIR TEMP TMP LANG LC_ALL LC_CTYPE LC_MESSAGES TZ
  CI GITHUB_ACTIONS NODE_OPTIONS NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR
  HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy
  SYSTEMROOT WINDIR COMSPEC PATHEXT
  A04_PG_BIN A06_PG_BIN A07_PG_BIN A08_PG_BIN PG_BIN PGDATA PGHOST PGPORT PGUSER
  NODE_BIN NPM_CLI_FOR_REHEARSAL PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD NEXT_TELEMETRY_DISABLED
)
GATE_ENV=()
GATE_ALLOWLIST=()
for name in "${ALLOWLIST_NAMES[@]}"; do
  if [[ -n "${!name+x}" ]]; then
    GATE_ENV+=("${name}=${!name}")
    GATE_ALLOWLIST+=("$name")
  fi
done
if [[ ! " ${GATE_ALLOWLIST[*]} " =~ " PG_BIN " ]]; then
  GATE_ENV+=("PG_BIN=$A04_PG_BIN")
  GATE_ALLOWLIST+=("PG_BIN")
fi

run_gate() {
  env -i "${GATE_ENV[@]}" "$@"
}

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
  printf 'candidate_gate_environment_allowlist=%s\n' "$(IFS=,; printf '%s' "${GATE_ALLOWLIST[*]}")"
  printf 'candidate_gate_rehearsal_selectors_cleared=true\n'
} >&2

run_gate "$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" ci --no-audit --no-fund
run_gate "$NODE_BIN" --experimental-strip-types --test --test-concurrency="$CANDIDATE_TEST_JOBS" "${candidate_test_suites[@]}"
run_gate "$NODE_BIN" node_modules/typescript/bin/tsc --noEmit
run_gate "$NODE_BIN" node_modules/eslint/bin/eslint.js .
run_gate "$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" run security:audit
run_gate "$NODE_BIN" "$NPM_CLI_FOR_REHEARSAL" run test:security

printf 'candidate_gate_status=pass\n'
