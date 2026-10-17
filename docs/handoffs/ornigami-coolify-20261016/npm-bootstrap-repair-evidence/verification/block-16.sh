set -Eeuo pipefail
mkdir -p "$ORNIGAMI_EVIDENCE_DIR/runner"
before="$RUNNER_TEMP/builder-before-build.txt"
after="$RUNNER_TEMP/builder-after-build.txt"
if [[ ! -s "$before" || ! -s "$after" ]]; then
  printf 'status=missing-before-or-after-counters\n' > "$ORNIGAMI_EVIDENCE_DIR/runner/resource-assessment.txt"
  printf 'assessment_exit_code=1\nlog_exit_code=0\n' > "$ORNIGAMI_EVIDENCE_DIR/runner/resource-exit-code.txt"
  exit 1
fi
set +e
python3 - "$before" "$after" "$ORNIGAMI_JOB_SUMMARY" <<'PY' 2>&1 | tee "$ORNIGAMI_EVIDENCE_DIR/runner/resource-assessment.txt"
import pathlib, re, sys
def values(path):
    text = pathlib.Path(path).read_text()
    found = {}
    current = None
    for line in text.splitlines():
        match = re.fullmatch(r"==([a-z.]+)==", line)
        if match:
            current = match.group(1)
            found[current] = []
        elif current:
            if not line.strip():
                raise SystemExit(f"Empty cgroup counter line in {path}")
            found[current].append(line.strip())
    required = {"memory.max", "memory.swap.max", "memory.peak", "memory.events", "cpu.max", "cpu.stat"}
    if set(found) != required:
        raise SystemExit(f"Incomplete builder cgroup counters in {path}")
    if any(not lines for lines in found.values()):
        raise SystemExit(f"Empty builder cgroup counter section in {path}")
    found = {key: "\n".join(lines) for key, lines in found.items()}
    return found
before, after = values(sys.argv[1]), values(sys.argv[2])
if before["memory.max"] != "8589934592" or after["memory.max"] != "8589934592":
    raise SystemExit("Builder memory.max did not remain at 8 GiB")
if before["memory.swap.max"] != "0" or after["memory.swap.max"] != "0":
    raise SystemExit("Builder memory.swap.max did not remain at zero")
if before["cpu.max"] != "300000 100000" or after["cpu.max"] != "300000 100000":
    raise SystemExit("Builder CPU quota did not remain at 3 CPUs")
def key_values(text):
    result = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 2 or parts[0] in result or not parts[1].isdecimal():
            raise SystemExit("Malformed cgroup counter values")
        result[parts[0]] = int(parts[1])
    return result
old_events, new_events = key_values(before["memory.events"]), key_values(after["memory.events"])
required_events = {"low", "high", "max", "oom", "oom_kill", "oom_group_kill"}
if not required_events.issubset(old_events) or not required_events.issubset(new_events):
    raise SystemExit("Incomplete memory.events counters")
deltas = {key: new_events[key] - old_events[key] for key in sorted(new_events)}
if any(delta < 0 for delta in deltas.values()):
    raise SystemExit("Builder memory.events counters decreased or reset")
old_cpu, new_cpu = key_values(before["cpu.stat"]), key_values(after["cpu.stat"])
if set(old_cpu) != set(new_cpu) or not {"usage_usec", "user_usec", "system_usec"}.issubset(old_cpu):
    raise SystemExit("Incomplete or mismatched builder cpu.stat counters")
cpu_deltas = {key: new_cpu[key] - old_cpu[key] for key in sorted(old_cpu)}
if any(delta < 0 for delta in cpu_deltas.values()):
    raise SystemExit("Builder cpu.stat counters decreased or reset")
peak = after["memory.peak"]
if not peak.isdecimal() or int(peak) > 8589934592:
    raise SystemExit("Builder memory.peak is invalid or exceeded its 8 GiB cap")
with open(sys.argv[3], "a", encoding="utf-8") as out:
    out.write("\n### Build resource acceptance\n\n")
    out.write(f"- Builder memory.peak: {peak} bytes\n")
    out.write(f"- Build-time memory.events deltas: `{deltas}`\n")
    out.write(f"- Build-time cpu.stat deltas: `{cpu_deltas}`\n")
if deltas["oom"] or deltas["oom_kill"] or deltas["oom_group_kill"]:
    raise SystemExit("Builder recorded a build-time OOM event; resource acceptance failed")
print(f"status=passed; peak_bytes={peak}; memory_events_delta={deltas}; cpu_stat_delta={cpu_deltas}")
PY
pipeline_status=("${PIPESTATUS[@]}")
set -e
printf 'assessment_exit_code=%s\nlog_exit_code=%s\n' "${pipeline_status[0]}" "${pipeline_status[1]}" > "$ORNIGAMI_EVIDENCE_DIR/runner/resource-exit-code.txt"
observation_status=0
node "$RUNNER_TEMP/source/scripts/framework-prototype/validate-build-observation.mjs" "$ORNIGAMI_EVIDENCE_DIR/runner/full-build-observations.jsonl" "$EXPECTED_OBSERVED_BUILDER_ID" > "$ORNIGAMI_EVIDENCE_DIR/runner/full-observation-gate.txt" 2>&1 || observation_status=$?
printf 'observation_exit_code=%s\n' "$observation_status" >> "$ORNIGAMI_EVIDENCE_DIR/runner/resource-exit-code.txt"
[[ "${pipeline_status[0]}" -eq 0 && "${pipeline_status[1]}" -eq 0 && "$observation_status" -eq 0 ]]

