set -Eeuo pipefail
[[ "$(uname -m)" == x86_64 && "$(uname -s)" == Linux ]]
[[ $(getconf _NPROCESSORS_ONLN) -ge 2 ]]
[[ $(awk '/MemAvailable:/ {print $2}' /proc/meminfo) -ge 3145728 ]]
[[ $(df -PB1 "$DB_ONLY_ROOT" | awk 'NR==2 {print $4}') -ge 21474836480 ]]
[[ $(date +%s) -lt "$DB_ONLY_DEADLINE" ]]
{ date -u +%FT%TZ; uname -a; git --version; curl --version; python3 --version; systemd-run --version; df -PB1 "$DB_ONLY_ROOT"; } > "$DB_ONLY_ROOT/evidence/host-tools.stdout"
set +e
sudo -n systemd-run --scope --quiet --expand-environment=no --unit="ornigami-db-tools-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" -p MemoryMax=2147483648 -p MemorySwapMax=0 -p CPUQuota=100% \
  /usr/sbin/runuser -u "$(id -un)" -- timeout --kill-after=5s 180s /bin/bash "$DB_ONLY_ROOT/source/scripts/framework-prototype/admission-only-bootstrap.sh" "$DB_ONLY_ROOT" \
  > "$DB_ONLY_ROOT/evidence/bootstrap.stdout" 2> "$DB_ONLY_ROOT/evidence/bootstrap.stderr"
code=$?
set -e
jq -n --argjson exit "$code" '{exit:$exit,result:(if $exit==0 then "passed" else "failed" end)}' > "$DB_ONLY_ROOT/evidence/bootstrap.json"
exit "$code"

