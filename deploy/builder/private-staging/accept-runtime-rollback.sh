#!/usr/bin/env bash
# Reuse the Linux qualification harness for populated restore, lock recovery and
# same-image closed rollback with an actual-origin image. Browser is intentionally
# skipped here; the staging browser acceptance is a separate check. This wrapper
# therefore records PARTIAL evidence and must not be presented as full acceptance.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SOURCE_SHA="${SOURCE_SHA:?SOURCE_SHA is required}"
APP_URL="${APP_URL:?APP_URL is required}"
EVIDENCE_DIR="${EVIDENCE_DIR:?EVIDENCE_DIR must be a new directory}"
RUN_ID="${RUN_ID:-staging-runtime-$(date -u +%Y%m%dT%H%M%SZ)}"
ENGINE="${ENGINE:-docker}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$APP_URL" == https://* ]] || fail "APP_URL must be the actual https origin"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"

note "Running synthetic runtime/restore/lock/closed-rollback checks"
SOURCE_SHA="$SOURCE_SHA" \
APP_URL="$APP_URL" \
BROWSER_PHASE=0 \
RUN_ID="$RUN_ID" \
EVIDENCE_DIR="$EVIDENCE_DIR" \
KEEP_ON_FAILURE=1 \
KEEP_VOLUMES=0 \
REMOVE_IMAGE=0 \
ENGINE="$ENGINE" \
  ./deploy/builder/qualify-linux.sh

RESULTS="$EVIDENCE_DIR/results.txt"
[[ -f "$RESULTS" ]] || fail "qualification results are missing"
for expected in \
  "ok=true" \
  "browser_journey=skipped" \
  "full_acceptance=false" \
  "acceptance_scope=partial" \
  "restore_root_mode=0700" \
  "restore_store_mode=0600" \
  "restore_records_preserved=true" \
  "fresh_container_restore=true" \
  "lock_recovery=true" \
  "closed_rollback_preserved_store=true" \
  "closed_records_preserved=true" \
  "egress_blocked=true"; do
  grep -qx "$expected" "$RESULTS" || fail "missing result: $expected"
done

cat > "$EVIDENCE_DIR/PARTIAL.txt" <<EOF
This run exercised the actual-origin image's runtime, populated synthetic
restore, lock recovery and same-image closed rollback with BROWSER_PHASE=0.
It is PARTIAL evidence. Browser/ZIP/revocation acceptance must be provided by
the separate staging browser check before full acceptance.
EOF
note "Partial runtime/restore/rollback acceptance passed"
cat "$EVIDENCE_DIR/PARTIAL.txt"
