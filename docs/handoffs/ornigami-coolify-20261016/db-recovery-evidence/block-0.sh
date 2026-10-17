set -Eeuo pipefail
root=$(mktemp -d "$RUNNER_TEMP/ornigami-db-only-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-XXXXXX")
chmod 700 "$root"
mkdir -m 700 "$root/evidence"
echo "DB_ONLY_ROOT=$root" >> "$GITHUB_ENV"
echo "DB_ONLY_DEADLINE=$(( $(date +%s) + 600 ))" >> "$GITHUB_ENV"
python3 - "$root" <<'PY'
import json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
identity = {key: os.environ[key] for key in ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_REF']}
for file in [root / 'owner.json', root / 'evidence/run-identity.json']:
    file.write_text(json.dumps(identity, indent=2) + '\n')
PY

