set -Eeuo pipefail
[[ $(( ORNIGAMI_WORK_DEADLINE_EPOCH - $(date +%s) )) -ge 150 ]]
image="ornigami:rehearsal-${SOURCE_SHA}"
runtime_rc=0
bash "$RUNNER_TEMP/source/deploy/coolify/linux-runtime-acceptance.sh" "$image" > "$RUNNER_TEMP/runtime-acceptance.log" 2>&1 || runtime_rc=$?
printf 'runtime_exit_code=%s\n' "$runtime_rc" >> "$GITHUB_OUTPUT"
tee -a "$ORNIGAMI_JOB_SUMMARY" < "$RUNNER_TEMP/runtime-acceptance.log"
report_path=$(sed -n 's/^report=//p' "$RUNNER_TEMP/runtime-acceptance.log" | tail -n1)
if [[ -n "$report_path" && -f "$report_path" ]]; then
  report_dir=$(dirname "$report_path")
  report_real=$(realpath -e "$report_dir")
  runner_real=$(realpath -e "$RUNNER_TEMP")
  [[ "$report_real" == "$runner_real"/ornigami-runtime-acceptance-* ]]
  mkdir -p "$ORNIGAMI_EVIDENCE_DIR/runtime"
  for evidence_path in "$report_dir"/native-image-formats.json "$report_dir"/native-image-formats-error.txt "$report_dir"/report.txt "$report_dir"/runtime-http.json "$report_dir"/failure.json "$report_dir"/failure-evidence.txt "$report_dir"/container-logs.txt "$report_dir"/runtime-*-cgroup.txt "$report_dir"/runtime-disk.txt "$report_dir"/host-disk-before.txt "$report_dir"/host-disk-after.txt; do
    [[ -f "$evidence_path" ]] || continue
    cp -- "$evidence_path" "$ORNIGAMI_EVIDENCE_DIR/runtime/"
  done
  {
    printf '\n### Runtime acceptance receipt\n\n'
    printf '%s\n' '```text'
    cat "$report_path"
    for metric_file in "$report_dir"/runtime-*-cgroup.txt "$report_dir"/runtime-disk.txt "$report_dir"/host-disk-before.txt "$report_dir"/host-disk-after.txt; do
      [[ -f "$metric_file" ]] || continue
      printf '\n==%s==\n' "$(basename "$metric_file")"
      cat "$metric_file"
    done
    printf '%s\n' '```'
  } >> "$ORNIGAMI_JOB_SUMMARY"
else
  printf '\nRuntime acceptance receipt path unavailable.\n' >> "$ORNIGAMI_JOB_SUMMARY"
fi
exit "$runtime_rc"

