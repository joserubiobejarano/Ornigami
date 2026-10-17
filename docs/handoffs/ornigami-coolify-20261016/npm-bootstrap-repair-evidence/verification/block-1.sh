set -Eeuo pipefail
[[ "$GITHUB_EVENT_NAME" == push ]]
[[ "$GITHUB_REF" == refs/heads/codex/ornigami-sri-local-prototype-f-20261016 ]]
[[ "$REQUEST_SHA" =~ ^[0-9a-f]{40}$ && "$REQUEST_SHA" == "$GITHUB_SHA" ]]
[[ "$GITHUB_RUN_ATTEMPT" == 1 && "$RUN_WORKFLOW_SHA" == "$GITHUB_SHA" ]]
[[ "$RUN_WORKFLOW_REF" == 'joserubiobejarano/Ornigami/.github/workflows/ornigami-image-rehearsal.yml@refs/heads/codex/ornigami-sri-local-prototype-f-20261016' ]]
repo_dir="$RUNNER_TEMP/request-repository"
repo='https://github.com/joserubiobejarano/Ornigami.git'
mkdir "$repo_dir"
git -C "$repo_dir" init --quiet
git -C "$repo_dir" remote add origin "$repo"
git -C "$repo_dir" fetch --quiet --no-tags origin "$REQUEST_SHA"
actual_request_sha=$(git -C "$repo_dir" rev-parse FETCH_HEAD)
[[ "$actual_request_sha" == "$REQUEST_SHA" ]]
git -C "$repo_dir" checkout --quiet --detach "$REQUEST_SHA"
read -r commit_sha first_parent extra_parents < <(git -C "$repo_dir" rev-list --parents -n1 "$REQUEST_SHA")
[[ "$commit_sha" == "$REQUEST_SHA" && -n "$first_parent" && -z "${extra_parents:-}" ]]
mapfile -t changed_paths < <(git -C "$repo_dir" diff --name-only "$first_parent" "$REQUEST_SHA")
[[ ${#changed_paths[@]} -eq 1 && "${changed_paths[0]}" == .github/build-requests/ornigami.json ]]
git -C "$repo_dir" show "$REQUEST_SHA:.github/build-requests/ornigami.json" > "$RUNNER_TEMP/ornigami-build-request.json"
jq -e 'type == "object" and (keys == ["packageLockSha256", "sourceSha"]) and (.sourceSha | type == "string" and test("^[0-9a-f]{40}$")) and (.packageLockSha256 | type == "string" and test("^[0-9a-f]{64}$"))' "$RUNNER_TEMP/ornigami-build-request.json" >/dev/null
SOURCE_SHA=$(jq -r '.sourceSha' "$RUNNER_TEMP/ornigami-build-request.json")
[[ "$SOURCE_SHA" == "$first_parent" ]]
EXPECTED_LOCK_SHA256=$(jq -r '.packageLockSha256' "$RUNNER_TEMP/ornigami-build-request.json")
echo "SOURCE_SHA=$SOURCE_SHA" >> "$GITHUB_ENV"
echo "EXPECTED_LOCK_SHA256=$EXPECTED_LOCK_SHA256" >> "$GITHUB_ENV"
echo "REQUEST_SHA=$REQUEST_SHA" >> "$GITHUB_ENV"
git -C "$repo_dir" merge-base --is-ancestor "$SOURCE_SHA" "$REQUEST_SHA"
source_lock_sha=$(git -C "$repo_dir" show "$SOURCE_SHA:package-lock.json" | sha256sum | cut -d' ' -f1)
if [[ "$source_lock_sha" != "$EXPECTED_LOCK_SHA256" ]]; then
  printf 'Build request package-lock SHA-256 mismatch: request=%s candidate_git_blob=%s. Refusing to build.\n' \
    "$EXPECTED_LOCK_SHA256" "$source_lock_sha" >&2
  exit 1
fi
candidate_workflow_blob=$(git -C "$repo_dir" rev-parse "$SOURCE_SHA:.github/workflows/ornigami-image-rehearsal.yml")
request_workflow_blob=$(git -C "$repo_dir" rev-parse "$REQUEST_SHA:.github/workflows/ornigami-image-rehearsal.yml")
[[ "$candidate_workflow_blob" == "$request_workflow_blob" ]]
git -C "$repo_dir" worktree add --quiet --detach "$RUNNER_TEMP/source" "$SOURCE_SHA"
actual_sha=$(git -C "$RUNNER_TEMP/source" rev-parse HEAD)
[[ "$actual_sha" == "$SOURCE_SHA" ]]
[[ -z "$(git -C "$RUNNER_TEMP/source" status --porcelain --untracked-files=all)" ]]
for required in Dockerfile package.json package-lock.json deploy/coolify/linux-runtime-acceptance.sh; do
  [[ -f "$RUNNER_TEMP/source/$required" ]]
done
checkout_lock_sha=$(sha256sum "$RUNNER_TEMP/source/package-lock.json" | cut -d' ' -f1)
[[ "$checkout_lock_sha" == "$source_lock_sha" ]]
{
  printf '%s\n' '### Build request admission'
  printf '%s\n' "- Request commit: \`$REQUEST_SHA\`"
  printf '%s\n' "- Commit: \`$actual_sha\`"
  printf '%s\n' "- Committed package-lock.json SHA-256: \`$source_lock_sha\`"
  printf '%s\n' "- Detached checkout package-lock.json SHA-256: \`$checkout_lock_sha\`"
  printf '%s\n' '- Request marker: exact source and lock fields; only marker changed in single-parent request commit'
  printf '%s\n' '- Workflow blob: identical at candidate and request commits'
  printf '%s\n' '- Candidate is an ancestor of the request commit'
  printf '%s\n' '- Checkout: detached exact candidate; clean before build'
} >> "$ORNIGAMI_JOB_SUMMARY"
{
  printf 'request_sha=%s\nsource_sha=%s\nexpected_lock_sha256=%s\nsource_lock_sha256=%s\ncheckout_lock_sha256=%s\ncandidate_workflow_blob=%s\nrequest_workflow_blob=%s\n' \
    "$REQUEST_SHA" "$SOURCE_SHA" "$EXPECTED_LOCK_SHA256" "$source_lock_sha" "$checkout_lock_sha" "$candidate_workflow_blob" "$request_workflow_blob"
} > "$ORNIGAMI_EVIDENCE_DIR/source-identity.txt"
printf 'workflow_sha=%s\nworkflow_ref=%s\n' "$RUN_WORKFLOW_SHA" "$RUN_WORKFLOW_REF" >> "$ORNIGAMI_EVIDENCE_DIR/source-identity.txt"

