set -Eeuo pipefail
[[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_RUN_ATTEMPT" == 1 ]]
[[ "$GITHUB_REF" == refs/heads/codex/ornigami-sri-local-prototype-f-20261016 ]]
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$RUN_WORKFLOW_SHA" == "$GITHUB_SHA" ]]
[[ "$RUN_WORKFLOW_REF" == 'joserubiobejarano/Ornigami/.github/workflows/ornigami-db-admission-only.yml@refs/heads/codex/ornigami-sri-local-prototype-f-20261016' ]]
repo="$DB_ONLY_ROOT/source"
git init --quiet "$repo"
git -C "$repo" remote add origin https://github.com/joserubiobejarano/Ornigami.git
timeout --kill-after=5s 60s git -C "$repo" fetch --quiet --no-tags --depth=2 origin "$GITHUB_SHA"
[[ "$(git -C "$repo" rev-parse FETCH_HEAD)" == "$GITHUB_SHA" ]]
read -r request parent extra < <(git -C "$repo" rev-list --parents -n1 "$GITHUB_SHA")
[[ "$request" == "$GITHUB_SHA" && "$parent" =~ ^[0-9a-f]{40}$ && -z "${extra:-}" ]]
mapfile -t changes < <(git -C "$repo" diff --name-only "$parent" "$request")
[[ ${#changes[@]} -eq 1 && "${changes[0]}" == .github/build-requests/ornigami-db-admission.json ]]
git -C "$repo" show "$request:.github/build-requests/ornigami-db-admission.json" > "$DB_ONLY_ROOT/request.json"
jq -e 'type == "object" and keys == ["packageLockSha256","purpose","sourceSha"] and .purpose == "ornigami-db-admission-only-v1" and (.sourceSha | test("^[0-9a-f]{40}$")) and (.packageLockSha256 | test("^[0-9a-f]{64}$"))' "$DB_ONLY_ROOT/request.json" >/dev/null
SOURCE_SHA=$(jq -r .sourceSha "$DB_ONLY_ROOT/request.json")
[[ "$SOURCE_SHA" == "$parent" ]]
for file in .github/workflows/ornigami-db-admission-only.yml .github/workflows/ornigami-image-rehearsal.yml .github/build-requests/ornigami.json; do
  [[ "$(git -C "$repo" rev-parse "$parent:$file")" == "$(git -C "$repo" rev-parse "$request:$file")" ]]
done
lock=$(git -C "$repo" show "$parent:package-lock.json" | sha256sum | cut -d' ' -f1)
[[ "$lock" == "$(jq -r .packageLockSha256 "$DB_ONLY_ROOT/request.json")" ]]
blob=$(git -C "$repo" rev-parse "$parent:.github/workflows/ornigami-db-admission-only.yml")
jq -n --arg requestSha "$request" --arg sourceSha "$SOURCE_SHA" --arg packageLockSha256 "$lock" --arg workflowBlob "$blob" --arg workflowSha "$RUN_WORKFLOW_SHA" --arg workflowRef "$RUN_WORKFLOW_REF" '{requestSha:$requestSha,sourceSha:$sourceSha,packageLockSha256:$packageLockSha256,workflowBlob:$workflowBlob,workflowSha:$workflowSha,workflowRef:$workflowRef}' > "$DB_ONLY_ROOT/evidence/protocol.json"
git -C "$repo" checkout --quiet --detach "$SOURCE_SHA"
[[ -z "$(git -C "$repo" status --porcelain)" ]]
echo "SOURCE_SHA=$SOURCE_SHA" >> "$GITHUB_ENV"

