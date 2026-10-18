#!/usr/bin/env bash
# External trial adapter only. Never run on Contabo. No retry or browser download.
set -Eeuo pipefail
umask 077
[[ $# -eq 4 && $(uname -s) == Linux && $(uname -m) == x86_64 ]]
[[ ${GITHUB_ACTIONS:-} == true && ${GITHUB_REPOSITORY:-} == joserubiobejarano/Ornigami ]]
source_dir=$(realpath "$1")
work_dir=$(realpath -m "$2")
node_dir=$(realpath "$3")
evidence_dir=$(realpath "$4")
[[ ! -e "$work_dir" && -x "$node_dir/bin/node" ]]
[[ $("$node_dir/bin/node" --version) == v22.23.3 ]]
mkdir -p "$work_dir" "$evidence_dir"
group=$(awk -F: '$1 == "0" { print $3 }' /proc/self/cgroup)
[[ -n "$group" && "$group" != / ]]
group_dir="/sys/fs/cgroup$group"
[[ $(cat "$group_dir/memory.max") == 8589934592 && $(cat "$group_dir/memory.swap.max") == 0 ]]
read -r quota period < "$group_dir/cpu.max"
[[ "$quota" =~ ^[0-9]+$ && "$period" =~ ^[0-9]+$ && "$quota" -eq $((period * 3)) ]]
capture() {
  local destination=$1
  for name in memory.max memory.swap.max memory.peak memory.events cpu.max cpu.stat; do
    printf '==%s==\n' "$name"; cat "$group_dir/$name"
  done > "$destination"
}
capture "$evidence_dir/cgroup-before.txt"
df -B1 "$work_dir" > "$evidence_dir/disk-before.txt"
finish() {
  local status=$?
  trap - EXIT
  capture "$evidence_dir/cgroup-after.txt"
  df -B1 "$work_dir" > "$evidence_dir/disk-after.txt"
  du -sb "$work_dir" > "$evidence_dir/work-disk.txt"
  # This is a fresh scope: any OOM event is failure, including a recovered one.
  if awk '$1 ~ /^oom(_kill|_group_kill)?$/ && $2 != 0 { bad=1 } END { exit !bad }' "$group_dir/memory.events"; then
    printf '%s\n' 'OOM event: acceptance failed' > "$evidence_dir/resource-failure.txt"
    status=1
  fi
  printf '%s\n' "$status" > "$evidence_dir/exit-code.txt"
  exit "$status"
}
trap finish EXIT
chrome=$(command -v google-chrome || command -v chromium || true)
[[ -n "$chrome" && -x "$chrome" ]]
mkdir -p "$work_dir/fixture" "$work_dir/packages" "$work_dir/tools" "$work_dir/home"
mkdir -p "$work_dir/npm-tool"
printf 'dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b  %s\n' "$source_dir/vendor/build-tools/npm-11.21.1.tgz" | sha256sum --check --status
tar -xzf "$source_dir/vendor/build-tools/npm-11.21.1.tgz" --strip-components=1 -C "$work_dir/npm-tool"
cp -a "$source_dir/tests/fixtures/framework-sri/." "$work_dir/fixture/"
cp "$source_dir/vendor/framework/next-16.4.2-ornigami-sri.2.tgz" "$work_dir/packages/"
cp "$source_dir/scripts/framework-prototype/browser-tools/"package*.json "$work_dir/tools/"
export PATH="$node_dir/bin:/usr/bin:/bin"
export HOME="$work_dir/home" NPM_CONFIG_USERCONFIG="$work_dir/empty-npmrc" NPM_CONFIG_GLOBALCONFIG="$work_dir/empty-global-npmrc"
: > "$NPM_CONFIG_USERCONFIG"; : > "$NPM_CONFIG_GLOBALCONFIG"
export NPM_CONFIG_CACHE="$work_dir/npm-cache" CI=true NODE_ENV=production NODE_OPTIONS=--max-old-space-size=4096
export NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ORNIGAMI_TEST_BROWSER_EXECUTABLE="$chrome"
cd "$work_dir/fixture"
"$node_dir/bin/node" "$work_dir/npm-tool/bin/npm-cli.js" ci --ignore-scripts --no-audit --no-fund
"$node_dir/bin/node" "$source_dir/scripts/framework-prototype/check-package-portability.mjs" "$work_dir/fixture/node_modules/next" > "$evidence_dir/package-portability.json"
"$node_dir/bin/node" node_modules/next/dist/bin/next build --webpack
cd "$work_dir/tools"
"$node_dir/bin/node" "$work_dir/npm-tool/bin/npm-cli.js" ci --ignore-scripts --no-audit --no-fund
timeout --signal=TERM --kill-after=20s 300s "$node_dir/bin/node" "$source_dir/scripts/framework-prototype/browser-regressions.mjs" "$work_dir/fixture" "$work_dir/tools" "$evidence_dir/result"
