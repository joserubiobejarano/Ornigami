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
IMAGE_MODE="${IMAGE_MODE:-build}"
EXPECTED_IMAGE_ID="${EXPECTED_IMAGE_ID:-}"
HARNESS_SHA="${HARNESS_SHA:-$(git rev-parse HEAD)}"
QUALIFICATION_PATH="${QUALIFICATION_PATH:-https-edge}"

fail() { echo "FAIL: $*" >&2; exit 1; }
note() { echo "==> $*"; }

[[ "$APP_URL" == https://* ]] || fail "APP_URL must be the actual https origin"
[[ "$QUALIFICATION_PATH" == "https-edge" ]] || fail "runtime/restore/rollback wrapper requires QUALIFICATION_PATH=https-edge"
[[ "$HARNESS_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "HARNESS_SHA must be 40 hex"
[[ ! -e "$EVIDENCE_DIR" ]] || fail "EVIDENCE_DIR already exists: $EVIDENCE_DIR"
if [[ "$IMAGE_MODE" == "existing" ]]; then
  [[ "$EXPECTED_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "existing-image mode requires EXPECTED_IMAGE_ID"
else
  [[ -z "$EXPECTED_IMAGE_ID" || "$EXPECTED_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "EXPECTED_IMAGE_ID must be immutable"
fi

note "Running synthetic runtime/restore/lock/closed-rollback checks"
SOURCE_SHA="$SOURCE_SHA" \
APP_URL="$APP_URL" \
QUALIFICATION_PATH="$QUALIFICATION_PATH" \
APPLICATION_ORIGIN="$APP_URL" \
BROWSER_ORIGIN="$APP_URL" \
IMAGE_MODE="$IMAGE_MODE" \
IMAGE="${EXPECTED_IMAGE_ID:-${IMAGE:-ornigami-builder:qualify-$RUN_ID}}" \
EXPECTED_IMAGE_ID="$EXPECTED_IMAGE_ID" \
EXPECTED_ORIGIN="$APP_URL" \
HARNESS_SHA="$HARNESS_SHA" \
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
  "image_mode=$IMAGE_MODE" \
  "qualification_path=$QUALIFICATION_PATH" \
  "application_origin=$APP_URL" \
  "effective_runtime_origin=$APP_URL" \
  "application_source_sha=$SOURCE_SHA" \
  "harness_sha=$HARNESS_SHA" \
  "browser_journey=skipped" \
  "full_acceptance=false" \
  "acceptance_scope=partial" \
  "restore_root_mode=0700" \
  "restore_store_mode=0600" \
  "restore_records_preserved=true" \
  "restore_records_match_minimized_source=true" \
  "minimization_applied=true" \
  "minimization_journal_events=2" \
  "restore_gate_blocked_reopen=true" \
  "restore_replay_completed=true" \
  "restore_replay_ready=true" \
  "restored_access_denied=true" \
  "second_restore_cycle=true" \
  "second_restore_applied_events=1" \
  "second_restore_replayed_events=2" \
  "second_restore_receipt_history_preserved=true" \
  "same_id_changed_intent_replay_blocked=true" \
  "changed_intent_gate_preserved=true" \
  "control_subject_access=true" \
  "fresh_container_restore=true" \
  "lock_recovery=true" \
  "closed_rollback_preserved_store=true" \
  "closed_records_preserved=true" \
  "egress_blocked=true"; do
  grep -qx "$expected" "$RESULTS" || fail "missing result: $expected"
done
grep -Eq '^image_id=sha256:[0-9a-f]{64}$' "$RESULTS" || fail "results do not record an immutable image ID"
if [[ "$IMAGE_MODE" == "existing" ]]; then
  grep -qx "image_id=$EXPECTED_IMAGE_ID" "$RESULTS" || fail "results did not use the supplied image ID"
fi

cat > "$EVIDENCE_DIR/PARTIAL.txt" <<EOF
This run exercised the actual-origin image's runtime, populated synthetic
restore, lock recovery and same-image closed rollback with BROWSER_PHASE=0.
It is PARTIAL evidence. Browser/ZIP/revocation acceptance must be provided by
the separate staging browser check before full acceptance.
EOF
note "Partial runtime/restore/rollback acceptance passed"
cat "$EVIDENCE_DIR/PARTIAL.txt"
