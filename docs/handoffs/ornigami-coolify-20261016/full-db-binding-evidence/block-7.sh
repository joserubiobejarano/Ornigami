set -Eeuo pipefail
node "$RUNNER_TEMP/source/scripts/framework-prototype/serial-scan-driver.mjs" parents
python3 - "$RUNNER_TEMP/base-trivy.json" "$GITHUB_OUTPUT" "$ORNIGAMI_JOB_SUMMARY" <<'PY'
import collections,json,pathlib,sys
report=json.loads(pathlib.Path(sys.argv[1]).read_text())
counts=collections.Counter(v['Severity'] for r in report.get('Results',[]) for v in r.get('Vulnerabilities',[]))
with open(sys.argv[2],'a') as out: out.write(f"critical_count={counts['CRITICAL']}\nhigh_count={counts['HIGH']}\n")
with open(sys.argv[3],'a') as out: out.write(f"\nOriginal minimal runtime base: CRITICAL={counts['CRITICAL']} HIGH={counts['HIGH']}; both parents and tooling scans retained; strict aggregate gate remains independent.\n")
PY

