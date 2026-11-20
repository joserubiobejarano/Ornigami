#!/usr/bin/env bash
# Run the existing browser/ZIP/revocation journey against the actual HTTPS
# staging origin through private BasicAuth. Run on the staging host so the
# packaged operator can use the same image and persistent volume.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

STAGING_ORIGIN="${STAGING_ORIGIN:?STAGING_ORIGIN is required}"
STAGING_BASIC_AUTH_USER="${STAGING_BASIC_AUTH_USER:?STAGING_BASIC_AUTH_USER is required}"
STAGING_BASIC_AUTH_PASSWORD="${STAGING_BASIC_AUTH_PASSWORD:?STAGING_BASIC_AUTH_PASSWORD is required}"
BUILDER_OPERATOR_IMAGE="${BUILDER_OPERATOR_IMAGE:?BUILDER_OPERATOR_IMAGE is required}"
BUILDER_OPERATOR_VOLUME="${BUILDER_OPERATOR_VOLUME:?BUILDER_OPERATOR_VOLUME is required}"
BUILDER_RUNTIME_STORE_HOST_ID="${BUILDER_RUNTIME_STORE_HOST_ID:?BUILDER_RUNTIME_STORE_HOST_ID is required}"
BROWSER_EVIDENCE_DIR="${BROWSER_EVIDENCE_DIR:?BROWSER_EVIDENCE_DIR must be a new directory}"
ENGINE="${ENGINE:-docker}"

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ "$STAGING_ORIGIN" == https://* ]] || fail "STAGING_ORIGIN must be https"
[[ ! -e "$BROWSER_EVIDENCE_DIR" ]] || fail "BROWSER_EVIDENCE_DIR already exists: $BROWSER_EVIDENCE_DIR"

BROWSER_BASE_URL="$STAGING_ORIGIN" \
BROWSER_ALLOW_REMOTE_ORIGIN=1 \
BROWSER_REQUIRE_BASIC_AUTH=1 \
BROWSER_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
BROWSER_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
BROWSER_EVIDENCE_DIR="$BROWSER_EVIDENCE_DIR" \
BROWSER_OPERATOR_MODE=container \
BROWSER_PACKSHOT="$ROOT/public/campaign-assets/harbor-field-bottle.webp" \
ENGINE="$ENGINE" \
BUILDER_OPERATOR_IMAGE="$BUILDER_OPERATOR_IMAGE" \
BUILDER_OPERATOR_VOLUME="$BUILDER_OPERATOR_VOLUME" \
BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
  node deploy/builder/qualify-browser.mjs

node -e '
  const fs = require("node:fs");
  const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const required = [
    "origin:reachable", "csp:header", "sri:initial", "sri:after-initial-generation",
    "login:a", "generate:initial", "generate:after-refresh", "generate:after-edit",
    "browser-a:zip-audit", "two-tabs:second-preview", "idempotency:replay-409",
    "login:b", "b:initial-generation", "revoke-a:workspace-cleared",
    "revoke-a:second-tab-cleared", "revoke-a:no-workspace-text",
    "revoke-a:cannot-generate", "revoke-a:b-session-active",
    "revoke-a:b-can-generate", "signout:b-signed-out", "signout:b-storage-cleared",
  ];
  const names = new Set((r.checks || []).map((check) => check.name));
  if (r.ok !== true) throw new Error("browser results are not ok");
  for (const name of required) if (!names.has(name)) throw new Error(`missing browser check: ${name}`);
  if (!Array.isArray(r.exports) || r.exports.length < 1) throw new Error("missing ZIP export evidence");
  if (!Array.isArray(r.scriptAudits) || r.scriptAudits.some((audit) => audit.issues.length > 0)) {
    throw new Error("SRI script audit failed");
  }
  console.log(JSON.stringify({ ok: true, checks: r.checks.length, exports: r.exports.length }, null, 2));
' "$BROWSER_EVIDENCE_DIR/results.json"

printf 'browser_acceptance=pass\nfull_origin=staging\n' > "$BROWSER_EVIDENCE_DIR/ACCEPTED.txt"
