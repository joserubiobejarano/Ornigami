set -Eeuo pipefail
evidence="$ORNIGAMI_EVIDENCE_DIR/framework-browser"
mkdir -p "$evidence"
node_archive="$RUNNER_TEMP/node-v22.23.3-linux-x64.tar.xz"
curl --fail --silent --show-error --location --output "$node_archive" \
  https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz
printf '%s  %s\n' df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de "$node_archive" | sha256sum --check
tar -xJf "$node_archive" -C "$RUNNER_TEMP"
node_dir="$RUNNER_TEMP/node-v22.23.3-linux-x64"
git -C "$RUNNER_TEMP/source" rev-parse HEAD > "$evidence/source-sha.txt"
sha256sum "$RUNNER_TEMP/source/vendor/framework/next-16.4.2-ornigami-sri.2.tgz" > "$evidence/framework-package-sha256.txt"
browser_timeout=$(( ORNIGAMI_WORK_DEADLINE_EPOCH - $(date +%s) ))
[[ "$browser_timeout" -ge 60 ]]
if [[ "$browser_timeout" -gt 900 ]]; then browser_timeout=900; fi
command -v systemd-run >/dev/null
command -v google-chrome >/dev/null || command -v chromium >/dev/null
caller=$(id -un)
set +e
sudo -n systemd-run --scope --quiet --expand-environment=no \
  --unit="ornigami-browser-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" \
  -p MemoryMax=8589934592 -p MemorySwapMax=0 -p CPUQuota=300% \
  /usr/sbin/runuser -u "$caller" -- \
  env GITHUB_ACTIONS=true GITHUB_REPOSITORY=joserubiobejarano/Ornigami \
  timeout --signal=TERM --kill-after=20s "$browser_timeout"s \
  bash "$RUNNER_TEMP/source/scripts/framework-prototype/linux-fixture-trial.sh" \
    "$RUNNER_TEMP/source" "$RUNNER_TEMP/ornigami-browser-work" "$node_dir" "$evidence" \
  2>&1 | tee "$evidence/trial.log"
result=${PIPESTATUS[0]}
set -e
printf '%s\n' "$result" > "$evidence/scope-exit-code.txt"
echo "exit_code=$result" >> "$GITHUB_OUTPUT"
exit "$result"

