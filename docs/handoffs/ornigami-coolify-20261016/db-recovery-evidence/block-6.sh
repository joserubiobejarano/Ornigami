set -Eeuo pipefail
if [[ "$CUSTODY_RESULT" != success ]]; then
  echo 'Explicit cleanup skipped: durable custody unverified. Ephemeral runner teardown remains platform-controlled.' | tee -a "$GITHUB_STEP_SUMMARY"
  exit 1
fi
identity=$(jq -n --arg GITHUB_RUN_ID "$GITHUB_RUN_ID" --arg GITHUB_RUN_ATTEMPT "$GITHUB_RUN_ATTEMPT" --arg GITHUB_SHA "$GITHUB_SHA" --arg GITHUB_REF "$GITHUB_REF" '{GITHUB_RUN_ID:$GITHUB_RUN_ID,GITHUB_RUN_ATTEMPT:$GITHUB_RUN_ATTEMPT,GITHUB_SHA:$GITHUB_SHA,GITHUB_REF:$GITHUB_REF}')
timeout --kill-after=5s 90s python3 "$DB_ONLY_ROOT/source/scripts/framework-prototype/admission-only-capture.py" cleanup "$DB_ONLY_ROOT" "$RUNNER_TEMP" "$identity" | tee -a "$GITHUB_STEP_SUMMARY"
echo 'Cleanup observations are in finished job logs/summary, recovered separately after custody. They were produced after the immutable artifact.' >> "$GITHUB_STEP_SUMMARY"
