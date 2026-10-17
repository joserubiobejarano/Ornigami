"""Stdlib capture/cleanup. Never downloads, scans or executes dependencies."""
import hashlib
import json
import os
import pathlib
import shutil
import sys
from datetime import datetime, timezone


def unsafe_link(file):
    # Windows junctions are reparse points but are not Path.is_symlink().
    return file.is_symlink() or bool(getattr(file.lstat(), 'st_file_attributes', 0) & 0x400)


def save(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open('w', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())


def capture(evidence):
    evidence = pathlib.Path(evidence)
    evidence.mkdir(parents=True, exist_ok=True)
    errors = []
    try:
        outcomes = json.loads((evidence / 'step-outcomes.json').read_text())
    except Exception as error:
        outcomes = {}
        errors.append('workflow outcomes unavailable: ' + str(error))
    phases = {'download': {'result': 'skipped', 'reason': 'bootstrap/admission not reached'},
              'admission': {'result': 'skipped', 'reason': 'bootstrap/admission not reached'},
              'fixtures': {'result': 'skipped', 'reason': 'shared prerequisite not passed'}}
    if (evidence / 'phases.json').exists():
        try:
            phases = json.loads((evidence / 'phases.json').read_text())['phases']
            if set(phases) != {'download', 'admission', 'fixtures'}:
                raise ValueError('unexpected phase inventory')
        except Exception as error:
            errors.append('phase inventory: ' + str(error))
    else:
        if outcomes.get('diagnostic') in ['success', 'failure', 'cancelled']:
            errors.append('attempted diagnostic has no phase inventory')
        save(evidence / 'phases.json', {'phases': phases, 'imageWork': 'out-of-scope', 'custody': 'not-assessed'})
    required = ['run-identity.json', 'protocol.json', 'bootstrap.json', 'step-outcomes.json',
                'bootstrap.stdout', 'bootstrap.stderr', 'host-tools.stdout']
    if outcomes.get('diagnostic') in ['success', 'failure', 'cancelled']:
        required += ['resources.json']
    if phases['download']['result'] != 'skipped':
        required += ['download.stdout', 'download.stderr', 'resources.json', 'controller.stdout', 'controller.stderr']
        required += ['db-publication.json']
        try:
            publication = json.loads((evidence / 'db-publication.json').read_text())
            if publication['sourceSha'] != json.loads((evidence / 'protocol.json').read_text())['sourceSha']:
                errors.append('publication source mismatch')
            if publication['repository'] != 'ghcr.io/aquasecurity/trivy-db@' + publication['manifestDigest']:
                errors.append('publication repository mismatch')
            download_args = phases['download'].get('arguments', [])
            if download_args.count('--db-repository') != 1 or download_args[download_args.index('--db-repository') + 1] != publication['repository']:
                errors.append('download publication mismatch')
        except Exception as error:
            errors.append('publication capture: ' + str(error))
    if phases['fixtures']['result'] != 'skipped':
        required += ['fixtures.stdout', 'fixtures.stderr']
        if phases['fixtures'].get('data') != 'fictional fixtures only; independent of real DB':
            errors.append('fixtures are not explicitly distinguished from real data')
    if phases['admission']['result'] != 'skipped':
        prefix = 'database-admission/'
        required += [prefix + f for f in ['index.json', 'clock.json', 'validation-clock.json',
                    'metadata-identity.json', 'databaseIdentity.json', 'scannerIdentity.json']]
        try:
            receipt = json.loads((evidence / prefix / 'index.json').read_text())
            identity = json.loads((evidence / prefix / 'metadata-identity.json').read_text())
            if receipt['phase'] != 'complete' or receipt['result'] != phases['admission']['result']:
                errors.append('admission incomplete or phase verdict mismatch')
            if receipt['sourceSha'] != json.loads((evidence / 'protocol.json').read_text())['sourceSha']:
                errors.append('admission source mismatch')
            for file, key in [('clock.json', 'captureClock'), ('validation-clock.json', 'clock'),
                              ('databaseIdentity.json', 'databaseIdentity'), ('scannerIdentity.json', 'scannerIdentity')]:
                actual = json.loads((evidence / prefix / file).read_text())
                if receipt.get(key) is not None and receipt[key] != actual:
                    errors.append('admission receipt mismatch: ' + file)
            if receipt.get('metadataIdentity') is not None and receipt['metadataIdentity'] != identity:
                errors.append('admission metadata identity receipt mismatch')
            raw = evidence / prefix / 'metadata.original.bin'
            if identity.get('retainedSha256'):
                required += [prefix + 'metadata.original.bin']
                if raw.stat().st_size > 65536 or hashlib.sha256(raw.read_bytes()).hexdigest() != identity['retainedSha256']:
                    errors.append('original metadata identity mismatch')
            if receipt['result'] == 'failed' and not receipt.get('errors'):
                errors.append('rejection reasons missing')
        except Exception as error:
            errors.append('admission capture: ' + str(error))
    for file in required:
        if not (evidence / file).is_file():
            errors.append('missing required file: ' + file)
    for name, phase in phases.items():
        if phase.get('result') not in ['passed', 'failed', 'skipped']:
            errors.append('invalid phase verdict: ' + name)
        if phase.get('result') == 'skipped' and not phase.get('reason'):
            errors.append('missing skipped reason: ' + name)
        if name != 'admission' and phase.get('result') != 'skipped' and 'exit' not in phase:
            errors.append('missing command exit: ' + name)
    if phases['admission']['result'] != 'passed' and phases['fixtures']['result'] != 'skipped':
        errors.append('dependent fixtures ran after failed shared prerequisite')
    summary = '\n'.join(['# Ornigami DB admission-only evidence', '',
        *[f"- {key}: {value['result']}" for key, value in phases.items()],
        '- Capture: ' + ('failed' if errors else 'passed'),
        '- Custody: independently assessed after immutable upload.',
        '- No image/security/runtime/release acceptance is established.',
        *['- Capture error: ' + error for error in errors], ''])
    (evidence / 'SUMMARY.md').write_text(summary, encoding='utf-8')
    save(evidence / 'capture.json', {'result': 'failed' if errors else 'passed', 'errors': errors,
         'at': datetime.now(timezone.utc).isoformat(), 'custody': 'not-assessed'})
    files = []
    total = 0
    for file in sorted(evidence.rglob('*')):
        if unsafe_link(file):
            raise ValueError('Evidence symlink refused')
        if not file.is_file() or file == evidence / 'manifest.json':
            continue
        if file.stat().st_size + total > 64 * 1024 * 1024:
            raise ValueError('64 MiB evidence bound exceeded')
        content = file.read_bytes()
        total += len(content)
        if total > 64 * 1024 * 1024:
            raise ValueError('64 MiB evidence bound exceeded')
        files.append({'path': file.relative_to(evidence).as_posix(), 'bytes': len(content),
                      'sha256': hashlib.sha256(content).hexdigest()})
    save(evidence / 'manifest.json', {'files': files, 'bytes': total, 'capture': 'failed' if errors else 'passed'})
    return 1 if errors else 0


def cleanup(root, runner_temp, identity):
    root, runner_temp = pathlib.Path(root), pathlib.Path(runner_temp).resolve()
    if unsafe_link(root) or root.resolve().parent != runner_temp or not root.name.startswith('ornigami-db-only-'):
        raise ValueError('Cleanup target is not a directly owned runner-temp directory')
    # Verify every path before any recursive operation; refuse symlinks, even if
    # Python rmtree would not normally follow them. No global cleanup or pruning.
    if not root.is_dir():
        raise ValueError('Owned directory missing')
    if any(unsafe_link(file) for file in root.rglob('*')):
        raise ValueError('Cleanup symlink refused')
    if json.loads((root / 'owner.json').read_text()) != identity:
        raise ValueError('Cleanup owner drift')
    before = shutil.disk_usage(runner_temp).free
    shutil.rmtree(root)
    return {'result': 'passed', 'removed': str(root), 'freeBefore': before,
            'freeAfter': shutil.disk_usage(runner_temp).free, 'existsAfter': root.exists(),
            'at': datetime.now(timezone.utc).isoformat()}


if __name__ == '__main__':
    if sys.argv[1] == 'capture':
        sys.exit(capture(sys.argv[2]))
    elif sys.argv[1] == 'cleanup':
        print(json.dumps(cleanup(sys.argv[2], sys.argv[3], json.loads(sys.argv[4]))))
    else:
        raise ValueError('Unsupported capture operation')
