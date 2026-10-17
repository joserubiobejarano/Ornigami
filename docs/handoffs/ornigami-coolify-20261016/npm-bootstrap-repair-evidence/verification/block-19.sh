{
  printf '\n### Downloadable evidence bundle\n\n'
  printf '%s\n' "- Upload status: ${UPLOAD_OUTCOME:-unavailable}"
  if [[ -n "${EVIDENCE_URL:-}" ]]; then printf '%s\n' "- Artifact: ${EVIDENCE_URL}"; fi
  printf '%s\n' '- Retention requested: 30 days (subject to repository policy)'
  printf '%s\n' '- The local image archive is excluded; scan JSON and sanitized runtime/resource receipts are retained when produced.'
} >> "$GITHUB_STEP_SUMMARY"

