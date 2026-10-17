set -Eeuo pipefail
critical='${{ steps.base_scan.outputs.critical_count }}'
high='${{ steps.base_scan.outputs.high_count }}'
[[ "$critical" =~ ^[0-9]+$ && "$high" =~ ^[0-9]+$ ]]
printf 'Base scan gate: CRITICAL=%s HIGH=%s (threshold: zero for both)\n' "$critical" "$high" | tee "$ORNIGAMI_EVIDENCE_DIR/base-advisory-gate.txt" >> "$ORNIGAMI_JOB_SUMMARY"
[[ "$critical" == 0 && "$high" == 0 ]]

