set -Eeuo pipefail
mkdir -p "$ORNIGAMI_EVIDENCE_DIR/stage-scans"
database_repository=$("$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" --max-old-space-size=512 "$RUNNER_TEMP/source/scripts/framework-prototype/official-db-publication.mjs" "$SOURCE_SHA" "$ORNIGAMI_EVIDENCE_DIR/stage-scans/db-publication.json")
caller=$(id -un)
set +e
sudo -n systemd-run --scope --quiet --expand-environment=no --unit="ornigami-db-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" -p MemoryMax=2147483648 -p MemorySwapMax=0 -p CPUQuota=100% \
  /usr/sbin/runuser -u "$caller" -- env NODE_OPTIONS=--max-old-space-size=512 GOMEMLIMIT=1536MiB \
  "$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" "$RUNNER_TEMP/source/scripts/framework-prototype/bounded-scan-worker.mjs" "$ORNIGAMI_EVIDENCE_DIR/stage-scans/database-resources.json" "$RUNNER_TEMP/trivy" image --download-db-only --no-progress --db-repository "$database_repository" --cache-dir "$RUNNER_TEMP/trivy-cache" > "$ORNIGAMI_EVIDENCE_DIR/stage-scans/database-download.log" 2>&1
download_rc=$?
printf '%s\n' "$download_rc" > "$ORNIGAMI_EVIDENCE_DIR/stage-scans/database-download-exit.txt"
exit "$download_rc"

