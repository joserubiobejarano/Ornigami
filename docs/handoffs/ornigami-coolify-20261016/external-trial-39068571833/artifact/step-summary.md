# Ornigami diagnostic evidence

Run 39068571833 / attempt 1; request 4cfb4b392f092e7706c4d5552e47b262167bb376.
### Build request admission
- Request commit: `4cfb4b392f092e7706c4d5552e47b262167bb376`
- Commit: `d20ea56ac3ead80439d3e5f66cdc4dc34963d40e`
- Committed package-lock.json SHA-256: `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815`
- Detached checkout package-lock.json SHA-256: `4591e2dd1a858104f9a388dcbe5ccf5d50383b847553e13117061c646238e815`
- Request marker: exact source and lock fields; only marker changed in single-parent request commit
- Workflow blob: identical at candidate and request commits
- Candidate is an ancestor of the request commit
- Checkout: detached exact candidate; clean before build
### Runner preflight
- Online CPUs: 4 (minimum 4)
- Total memory: 15989 MiB (minimum 14336 MiB)
- Available memory before build: 14885 MiB (minimum 12288 MiB)
- Free runner disk before build: 91859574784 bytes (minimum 21474836480)
### Scanner verification
- Trivy 0.76.0 Linux amd64 archive checksum verified against the official release checksum file:
  https://github.com/aquasecurity/trivy/releases/download/v0.76.0/trivy_0.76.0_checksums.txt

Original minimal runtime base: CRITICAL=0 HIGH=0; both parents and tooling scans retained; strict aggregate gate remains independent.
### BuildKit cgroup limits
- memory.max: 8589934592 bytes; memory.swap.max: 0 bytes (Docker memory and memory-swap both capped at 8 GiB total)
- cpu.max: 300000 100000; BuildKit OCI worker max-parallelism: 1
- Initial memory event and CPU counters captured before build; no retry is configured

### Build result and cgroup counters

- Build interval: 2026-10-17T20:53:58Z to 2026-10-17T20:54:04Z UTC (6 seconds)
- Build command exit code: 1
- Observed builder counters immediately after build:
```text
==memory.max==
8589934592
==memory.swap.max==
0
==memory.peak==
587522048
==memory.events==
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0
==cpu.max==
300000 100000
==cpu.stat==
usage_usec 3378513
user_usec 1929977
system_usec 1448536
nice_usec 0
core_sched.force_idle_usec 0
nr_periods 55
nr_throttled 4
throttled_usec 34532
nr_bursts 0
burst_usec 0
```

### Build resource acceptance

- Builder memory.peak: 587522048 bytes
- Build-time memory.events deltas: `{'high': 0, 'low': 0, 'max': 0, 'oom': 0, 'oom_group_kill': 0, 'oom_kill': 0}`
- Build-time cpu.stat deltas: `{'burst_usec': 0, 'core_sched.force_idle_usec': 0, 'nice_usec': 0, 'nr_bursts': 0, 'nr_periods': 51, 'nr_throttled': 4, 'system_usec': 1400137, 'throttled_usec': 34532, 'usage_usec': 3268808, 'user_usec': 1868672}`
Base scan gate: CRITICAL=0 HIGH=0 (threshold: zero for both)
