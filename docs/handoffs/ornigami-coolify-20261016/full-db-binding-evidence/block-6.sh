set -Eeuo pipefail
caller=$(id -un)
sudo -n systemd-run --scope --quiet --expand-environment=no --unit="ornigami-db-admit-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" -p MemoryMax=2147483648 -p MemorySwapMax=0 -p CPUQuota=100% \
  /usr/sbin/runuser -u "$caller" -- env NODE_OPTIONS=--max-old-space-size=512 SOURCE_SHA="$SOURCE_SHA" RUNNER_TEMP="$RUNNER_TEMP" ORNIGAMI_EVIDENCE_DIR="$ORNIGAMI_EVIDENCE_DIR" \
  "$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" "$RUNNER_TEMP/source/scripts/framework-prototype/bounded-scan-worker.mjs" "$ORNIGAMI_EVIDENCE_DIR/stage-scans/database-admission-resources.json" "$RUNNER_TEMP/node-v22.23.3-linux-x64/bin/node" "$RUNNER_TEMP/source/scripts/framework-prototype/serial-scan-driver.mjs" admit

