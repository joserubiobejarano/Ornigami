set -Eeuo pipefail
jq -n --arg protocol "$PROTOCOL_RESULT" --arg bootstrap "$BOOTSTRAP_RESULT" --arg diagnostic "$DIAGNOSTIC_RESULT" '{protocol:$protocol,bootstrap:$bootstrap,diagnostic:$diagnostic}' > "$DB_ONLY_ROOT/evidence/step-outcomes.json"
if [[ "$PROTOCOL_RESULT" == success ]]; then
  python3 "$DB_ONLY_ROOT/source/scripts/framework-prototype/admission-only-capture.py" capture "$DB_ONLY_ROOT/evidence"
else
  # Never execute candidate-owned code after failed source admission.
  python3 - "$DB_ONLY_ROOT/evidence" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
phases = {key: {'result': 'skipped', 'reason': 'source admission failed'} for key in ['download','admission','fixtures']}
(root/'phases.json').write_text(json.dumps({'phases':phases}))
(root/'capture.json').write_text(json.dumps({'result':'failed','errors':['source admission failed'],'custody':'not-assessed'}))
(root/'SUMMARY.md').write_text('# DB admission-only\n\nSource admission failed. All dependent phases skipped. Custody is independent.\n')
files = [{'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(root.iterdir()) if p.is_file()]
(root/'manifest.json').write_text(json.dumps({'files':files,'capture':'failed'}))
PY
  exit 1
fi

