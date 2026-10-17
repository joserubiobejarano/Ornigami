set -Eeuo pipefail
[[ "$ARTIFACT_ID" =~ ^[0-9]+$ && "$ARTIFACT_DIGEST" =~ ^[0-9a-f]{64}$ ]]
context="ornigami/evidence-local/${GITHUB_RUN_ID}/${GITHUB_RUN_ATTEMPT}"
description="artifact=${ARTIFACT_ID};sha256=${ARTIFACT_DIGEST}"
printf 'Custody required run=%s attempt=%s request=%s artifact=%s sha256=%s\n' "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" "$GITHUB_SHA" "$ARTIFACT_ID" "$ARTIFACT_DIGEST"
for observation in $(seq 1 60); do
  statuses=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/statuses?per_page=100")
  if jq -e --arg context "$context" --arg description "$description" --arg owner "$GITHUB_REPOSITORY_OWNER" 'any(.[]; .context==$context and .description==$description and .state=="success" and .creator.login==$owner)' <<< "$statuses" >/dev/null; then
    exit 0
  fi
  sleep 10
done
echo 'Custody deadline failed; no acceptance; uploaded evidence remains retained.' >&2
exit 1

