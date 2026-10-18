#!/usr/bin/env bash
set -Eeuo pipefail
root=$1
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]]
group=$(awk -F: '$1 == "0" {print $3}' /proc/self/cgroup)
[[ -n "$group" ]]
metrics="/sys/fs/cgroup$group"
[[ "$(cat "$metrics/memory.max")" == 2147483648 ]]
[[ "$(cat "$metrics/memory.swap.max")" == 0 ]]
[[ "$(cat "$metrics/cpu.max")" == '100000 100000' ]]
[[ $(df -PB1 "$root" | awk 'NR==2 {print $4}') -ge 21474836480 ]]
mkdir "$root/tools"
cd "$root/tools"
trap 'date -u +%FT%TZ; cat "$metrics/memory.peak" "$metrics/memory.events" "$metrics/cpu.stat"; df -PB1 "$root"' EXIT
date -u +%FT%TZ
cat "$metrics/memory.max" "$metrics/memory.swap.max" "$metrics/cpu.max"
# Two tool archives only; no DB is fetched here. No curl retries or fallbacks.
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --connect-timeout 10 --max-time 60 --max-filesize 104857600 \
  --output node.tar.xz https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz
echo 'df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de  node.tar.xz' | sha256sum --check --status
tar -xJf node.tar.xz node-v22.23.3-linux-x64/bin/node --strip-components=2
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --connect-timeout 10 --max-time 60 --max-filesize 104857600 \
  --output trivy.tar.gz https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_Linux-64bit.tar.gz
echo 'e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7  trivy.tar.gz' | sha256sum --check --status
tar -xzf trivy.tar.gz trivy
echo '1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19  trivy' | sha256sum --check --status
./node --max-old-space-size=512 -e 'if(process.version!=="v22.23.3"||process.versions.openssl!=="3.5.8")process.exit(1);console.log(JSON.stringify(process.versions))'
./trivy --version
[[ "$(./trivy --version | head -1)" == 'Version: 0.76.0' ]]
sha256sum node.tar.xz node trivy.tar.gz trivy
[[ $(df -PB1 "$root" | awk 'NR==2 {print $4}') -ge 21474836480 ]]
awk '$1=="max" || $1=="oom" || $1=="oom_kill" || $1=="oom_group_kill" {if($2!=0)exit 1}' "$metrics/memory.events"
