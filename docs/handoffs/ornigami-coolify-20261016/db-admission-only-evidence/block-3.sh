set -Eeuo pipefail
[[ $(date +%s) -lt "$DB_ONLY_DEADLINE" ]]
cd "$DB_ONLY_ROOT/source"
remaining=$(( DB_ONLY_DEADLINE - $(date +%s) ))
(( remaining > 0 && remaining <= 600 ))
sudo -n systemd-run --scope --quiet --expand-environment=no --unit="ornigami-db-only-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" -p MemoryMax=2147483648 -p MemorySwapMax=0 -p CPUQuota=100% \
  /usr/sbin/runuser -u "$(id -un)" -- env NODE_OPTIONS=--max-old-space-size=512 timeout --kill-after=5s "${remaining}s" \
  "$DB_ONLY_ROOT/tools/node" --max-old-space-size=512 scripts/framework-prototype/admission-only-worker.mjs "$DB_ONLY_ROOT" "$SOURCE_SHA"

