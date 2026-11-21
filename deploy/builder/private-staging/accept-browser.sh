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
IMAGE_MODE="${IMAGE_MODE:-build}"
EXPECTED_IMAGE_ID="${EXPECTED_IMAGE_ID:-}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:-}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"

fail() { echo "FAIL: $*" >&2; exit 1; }
[[ "$STAGING_ORIGIN" == https://* ]] || fail "STAGING_ORIGIN must be https"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ "$IMAGE_MODE" != "existing" || "$BUILDER_OPERATOR_IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "existing-image mode requires BUILDER_OPERATOR_IMAGE to be the immutable image ID"
[[ ! -e "$BROWSER_EVIDENCE_DIR" ]] || fail "BROWSER_EVIDENCE_DIR already exists: $BROWSER_EVIDENCE_DIR"
command -v "$ENGINE" >/dev/null 2>&1 || fail "$ENGINE is required to resolve the operator image"
OPERATOR_IMAGE_ID="$("$ENGINE" image inspect --format '{{.Id}}' "$BUILDER_OPERATOR_IMAGE" 2>/dev/null)" \
  || fail "operator image is not present on this daemon: $BUILDER_OPERATOR_IMAGE"
[[ "$OPERATOR_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "operator image did not resolve to an immutable ID"
if [[ -n "$EXPECTED_IMAGE_ID" ]]; then
  [[ "$OPERATOR_IMAGE_ID" == "$EXPECTED_IMAGE_ID" ]] \
    || fail "operator image ID mismatch: expected $EXPECTED_IMAGE_ID, got $OPERATOR_IMAGE_ID"
fi
if [[ -z "$EXPECTED_SOURCE_SHA" ]]; then
  EXPECTED_SOURCE_SHA="$("$ENGINE" image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$OPERATOR_IMAGE_ID")"
fi
[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_SOURCE_SHA must be 40 hex"

mkdir -p "$BROWSER_EVIDENCE_DIR"
cat > "$BROWSER_EVIDENCE_DIR/identity.json" <<EOF
{
  "applicationSourceSha": "$EXPECTED_SOURCE_SHA",
  "harnessSha": "$HARNESS_SHA",
  "imageId": "$OPERATOR_IMAGE_ID",
  "imageMode": "$IMAGE_MODE",
  "operatorImageInput": "$BUILDER_OPERATOR_IMAGE"
}
EOF

BROWSER_BASE_URL="$STAGING_ORIGIN" \
BROWSER_ALLOW_REMOTE_ORIGIN=1 \
BROWSER_REQUIRE_BASIC_AUTH=1 \
BROWSER_BASIC_AUTH_USER="$STAGING_BASIC_AUTH_USER" \
BROWSER_BASIC_AUTH_PASSWORD="$STAGING_BASIC_AUTH_PASSWORD" \
BROWSER_EVIDENCE_DIR="$BROWSER_EVIDENCE_DIR" \
BROWSER_OPERATOR_MODE=container \
BROWSER_PACKSHOT="$ROOT/public/campaign-assets/harbor-field-bottle.webp" \
BROWSER_IMAGE_ID="$OPERATOR_IMAGE_ID" \
BROWSER_SOURCE_SHA="$EXPECTED_SOURCE_SHA" \
BROWSER_HARNESS_SHA="$HARNESS_SHA" \
ENGINE="$ENGINE" \
BUILDER_OPERATOR_IMAGE="$OPERATOR_IMAGE_ID" \
BUILDER_OPERATOR_VOLUME="$BUILDER_OPERATOR_VOLUME" \
BUILDER_RUNTIME_STORE_HOST_ID="$BUILDER_RUNTIME_STORE_HOST_ID" \
  node deploy/builder/qualify-browser.mjs

node -e '
  const fs = require("node:fs");
  const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const required = [
    "origin:reachable", "csp:header",
    "sri:initial:login-page", "sri:initial", "sri:after-initial-generation",
    "sri:after-refresh", "sri:after-edit", "sri:second-tab", "sri:after-second-tab",
    "sri:b-login:login-page", "sri:b-login", "sri:after-b-generation",
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
  if (!Array.isArray(r.scriptAudits) || r.scriptAudits.length < 5 || r.scriptAudits.some((audit) => audit.issues.length > 0)) {
    throw new Error("SRI script audit failed");
  }
  for (const audit of r.scriptAudits) {
    if (!Array.isArray(audit.scriptRecords) || audit.scriptRecords.length === 0) {
      throw new Error(`SRI audit ${audit.label} did not record script URLs`);
    }
    for (const script of audit.scriptRecords) {
      if (!script.src) throw new Error(`SRI audit ${audit.label} has a script without a URL`);
      if (script.verified && !/^[0-9a-f]{64}$/.test(script.sha256 || "")) {
        throw new Error(`SRI audit ${audit.label} did not record a SHA-256 for ${script.src}`);
      }
    }
    if (!Array.isArray(audit.inserted) || !Array.isArray(audit.removed)) {
      throw new Error(`SRI audit ${audit.label} did not record inserted/removed scripts`);
    }
  }
  if (!Array.isArray(r.scriptRegistry) || r.scriptRegistry.length === 0) {
    throw new Error("SRI script registry is missing");
  }
  for (const entry of r.scriptRegistry) {
    if (!entry.src || !/^[0-9a-f]{64}$/.test(entry.lastSha256 || "")) {
      throw new Error(`SRI script registry lacks URL/hash for ${entry.src || "<missing>"}`);
    }
  }
  if (!r.identity || !/^sha256:[0-9a-f]{64}$/.test(r.identity.imageId || "")) {
    throw new Error("browser results did not record the immutable image ID");
  }
  if (!/^[0-9a-f]{40}$/.test(r.identity.applicationSourceSha || "") ||
      !/^[0-9a-f]{40}$/.test(r.identity.harnessSha || "")) {
    throw new Error("browser results did not record source and harness SHAs");
  }
  console.log(JSON.stringify({ ok: true, checks: r.checks.length, exports: r.exports.length, scriptAudits: r.scriptAudits.length }, null, 2));
' "$BROWSER_EVIDENCE_DIR/results.json"

printf 'browser_acceptance=pass\nfull_origin=staging\nimage_mode=%s\nimage_id=%s\napplication_source_sha=%s\nharness_sha=%s\n' \
  "$IMAGE_MODE" "$OPERATOR_IMAGE_ID" "$EXPECTED_SOURCE_SHA" "$HARNESS_SHA" > "$BROWSER_EVIDENCE_DIR/ACCEPTED.txt"
