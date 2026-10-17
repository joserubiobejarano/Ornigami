set -Eeuo pipefail
evidence_dir="$RUNNER_TEMP/ornigami-evidence"
# GITHUB_STEP_SUMMARY is step-local. Export a stable pre-upload path.
ORNIGAMI_JOB_SUMMARY="$RUNNER_TEMP/ornigami-job-summary.md"
echo "ORNIGAMI_JOB_SUMMARY=$ORNIGAMI_JOB_SUMMARY" >> "$GITHUB_ENV"
install -d -m 700 "$evidence_dir" "$evidence_dir/build" "$evidence_dir/scans" "$evidence_dir/runner" "$evidence_dir/runtime" "$evidence_dir/browser"
printf '# Ornigami diagnostic evidence\n\nRun %s / attempt %s; request %s.\n' "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_SHA" > "$ORNIGAMI_JOB_SUMMARY"
printf '%s\n' 'This artifact contains public rehearsal evidence only. It excludes the local image archive and credentials.' > "$evidence_dir/README.txt"
printf 'run_id=%s\nrun_attempt=%s\nrequest_sha=%s\nref=%s\nevent=%s\n' \
  "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_SHA" "$GITHUB_REF" "$GITHUB_EVENT_NAME" > "$evidence_dir/run-identity.txt"
echo "ORNIGAMI_EVIDENCE_DIR=$evidence_dir" >> "$GITHUB_ENV"
echo "ORNIGAMI_WORK_DEADLINE_EPOCH=$(( $(date +%s) + 1440 ))" >> "$GITHUB_ENV"

