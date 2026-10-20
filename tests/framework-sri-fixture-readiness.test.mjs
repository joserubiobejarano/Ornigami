import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFixtureInputs } from '../scripts/framework-prototype/framework-fixture-input-readiness.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/framework-sri');
const sourceCommit = 'd2b61f61ce30a1fcafcb9dec198fed7496764466';

test('working-tree readiness requires all 16 exact fixture blobs while they await commit', () => {
  const result = checkFixtureInputs({ mode: 'working-tree', root: repositoryRoot });
  assert.deepEqual(result, {
    mode: 'working-tree', sourceCommit, fileCount: 16, result: 'passed-working-tree-fixture-inputs',
  });
});

test('fixture lint overlay preserves historical provenance and changes only the reviewed identifier blob', () => {
  const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/framework-sri-fixture-manifest.json'), 'utf8'));
  const overlay = JSON.parse(readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/framework-sri-fixture-overlay.json'), 'utf8'));
  const controls = readFileSync(path.join(fixtureRoot, 'app/controls.js'));
  const controlsBlob = spawnSync('git', ['hash-object', '--path=tests/fixtures/framework-sri/app/controls.js', path.join(fixtureRoot, 'app/controls.js')], { encoding: 'utf8' });
  assert.equal(controlsBlob.status, 0, controlsBlob.stderr);
  assert.equal(manifest.files['app/controls.js'], 'd10dedf2c8485b5548eee9c204dda1ba1002d352');
  assert.equal(overlay.originalBlob, manifest.files['app/controls.js']);
  assert.equal(overlay.reviewedBlob, controlsBlob.stdout.trim());
  assert.match(controls.toString('utf8'), /const loadedModule = await import\('\.\/late'\)/);
  assert.doesNotMatch(controls.toString('utf8'), /const module = await import/);
  assert.equal(Object.keys(manifest.files).length, 16);
});

test('candidate readiness proves the committed fixture tree and fails closed when omitted', () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'ornigami-fixture-candidate-'));
  const syntheticRoot = path.join(temporary, 'repository');
  const helper = 'scripts/framework-prototype/framework-fixture-input-readiness.mjs';
  const manifest = 'scripts/framework-prototype/framework-sri-fixture-manifest.json';
  const overlay = 'scripts/framework-prototype/framework-sri-fixture-overlay.json';
  const runGit = (args) => {
    const result = spawnSync('git', ['-C', syntheticRoot, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, 'git ' + args.join(' ') + ': ' + result.stderr);
    return result.stdout.trim();
  };
  const commit = (message) => {
    runGit(['add', '-A']);
    runGit(['-c', 'user.name=Fixture Readiness Test', '-c', 'user.email=fixture-readiness@example.invalid', 'commit', '-qm', message]);
    return runGit(['rev-parse', 'HEAD']);
  };

  try {
    mkdirSync(syntheticRoot, { recursive: true });
    runGit(['init', '-q']);
    cpSync(path.join(repositoryRoot, '.gitattributes'), path.join(syntheticRoot, '.gitattributes'));
    mkdirSync(path.dirname(path.join(syntheticRoot, helper)), { recursive: true });
    cpSync(path.join(repositoryRoot, helper), path.join(syntheticRoot, helper), { recursive: true });
    cpSync(path.join(repositoryRoot, manifest), path.join(syntheticRoot, manifest));
    cpSync(path.join(repositoryRoot, overlay), path.join(syntheticRoot, overlay));
    mkdirSync(path.dirname(path.join(syntheticRoot, 'tests/fixtures/framework-sri')), { recursive: true });
    cpSync(fixtureRoot, path.join(syntheticRoot, 'tests/fixtures/framework-sri'), { recursive: true });

    const completeCandidate = commit('complete fixture candidate');
    assert.notEqual(completeCandidate, sourceCommit, 'synthetic success does not use the historical provenance commit');
    assert.deepEqual(checkFixtureInputs({ mode: 'candidate', candidate: completeCandidate, root: syntheticRoot }), {
      mode: 'candidate', candidate: completeCandidate, sourceCommit, fileCount: 16,
      result: 'passed-committed-candidate-fixture-inputs',
    });
    const completeCli = spawnSync(process.execPath, [path.join(syntheticRoot, helper), '--candidate', completeCandidate, syntheticRoot], { encoding: 'utf8', windowsHide: true });
    assert.equal(completeCli.status, 0, completeCli.stderr);
    assert.equal(JSON.parse(completeCli.stdout).result, 'passed-committed-candidate-fixture-inputs');

    rmSync(path.join(syntheticRoot, 'tests/fixtures/framework-sri/app/controls.js'));
    const incompleteCandidate = commit('incomplete fixture candidate');
    assert.throws(
      () => checkFixtureInputs({ mode: 'candidate', candidate: incompleteCandidate, root: syntheticRoot }),
      /file-set mismatch; missing=app\/controls\.js/,
    );

    cpSync(fixtureRoot, path.join(syntheticRoot, 'tests/fixtures/framework-sri'), { recursive: true, force: true });
    const changedControls = path.join(syntheticRoot, 'tests/fixtures/framework-sri/app/controls.js');
    const source = readFileSync(changedControls, 'utf8').replace('loadedModule', 'unreviewedModule');
    writeFileSync(changedControls, source);
    const changedOverlayCandidate = commit('unreviewed fixture overlay');
    assert.throws(
      () => checkFixtureInputs({ mode: 'candidate', candidate: changedOverlayCandidate, root: syntheticRoot }),
      /fixture blob mismatch: app\/controls\.js/,
    );

    cpSync(fixtureRoot, path.join(syntheticRoot, 'tests/fixtures/framework-sri'), { recursive: true, force: true });
    const untouchedFixture = path.join(syntheticRoot, 'tests/fixtures/framework-sri/app/late.js');
    writeFileSync(untouchedFixture, readFileSync(untouchedFixture, 'utf8') + '\n// unreviewed fixture edit\n');
    const changedUntouchedCandidate = commit('unreviewed untouched fixture change');
    assert.throws(
      () => checkFixtureInputs({ mode: 'candidate', candidate: changedUntouchedCandidate, root: syntheticRoot }),
      /fixture blob mismatch: app\/late\.js/,
    );

    const pairedLateFile = path.join(syntheticRoot, 'tests/fixtures/framework-sri/app/late.js');
    writeFileSync(pairedLateFile, readFileSync(pairedLateFile, 'utf8') + '\n// paired manifest drift\n');
    const pairedLateBlob = runGit(['hash-object', '--path=tests/fixtures/framework-sri/app/late.js', pairedLateFile]);
    const pairedManifestPath = path.join(syntheticRoot, manifest);
    const pairedManifest = JSON.parse(readFileSync(pairedManifestPath, 'utf8'));
    pairedManifest.files['app/late.js'] = pairedLateBlob;
    writeFileSync(pairedManifestPath, JSON.stringify(pairedManifest, null, 2) + '\n');
    const pairedChangeCandidate = commit('paired fixture and manifest drift');
    assert.equal(runGit(['rev-parse', pairedChangeCandidate + ':tests/fixtures/framework-sri/app/late.js']), pairedLateBlob);
    // Run this candidate's helper so it reads the paired manifest from the same tree.
    const pairedChangeCli = spawnSync(process.execPath, [path.join(syntheticRoot, helper), '--candidate', pairedChangeCandidate, syntheticRoot], { encoding: 'utf8', windowsHide: true });
    assert.equal(pairedChangeCli.status, 1);
    assert.match(pairedChangeCli.stderr, /Framework SRI fixture original path\/blob map identity is invalid/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('restored fixture retains locked Next, React, browser-tool and strict SRI/CSP contracts', () => {
  const fixturePackage = JSON.parse(readFileSync(path.join(fixtureRoot, 'package.json'), 'utf8'));
  const fixtureLock = JSON.parse(readFileSync(path.join(fixtureRoot, 'package-lock.json'), 'utf8'));
  const applicationLock = JSON.parse(readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const browserLock = JSON.parse(readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/browser-tools/package-lock.json'), 'utf8'));
  const config = readFileSync(path.join(fixtureRoot, 'next.config.mjs'), 'utf8');
  const browserHarness = readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/browser-regressions.mjs'), 'utf8');
  const nextArchive = readFileSync(path.join(repositoryRoot, 'vendor/framework/next-16.4.2-ornigami-sri.2.tgz'));
  const nextIntegrity = fixtureLock.packages['node_modules/next'].integrity;

  assert.equal(fixturePackage.dependencies.next, 'file:../packages/next-16.4.2-ornigami-sri.2.tgz');
  assert.equal(fixtureLock.packages['node_modules/next'].version, '16.4.2');
  assert.equal(nextIntegrity, applicationLock.packages['node_modules/next'].integrity);
  assert.equal(createHash('sha256').update(nextArchive).digest('hex'), 'ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f');
  for (const packageName of ['react', 'react-dom']) {
    const fixture = fixtureLock.packages['node_modules/' + packageName];
    const application = applicationLock.packages['node_modules/' + packageName];
    assert.equal(fixture.version, '19.2.9');
    assert.equal(fixture.integrity, application.integrity);
  }
  assert.match(config, /sri:\s*\{\s*algorithm:\s*'sha256'/);
  assert.match(config, /crossOrigin:\s*'anonymous'/);
  assert.equal(browserLock.packages['node_modules/playwright'].version, '1.61.0');
  assert.equal(browserLock.packages['node_modules/playwright-core'].version, '1.61.0');
  for (const assertion of [
    'production-http-sri-and-csp', 'valid-hydration-late-loading-and-navigation',
    'corrupted-bootstrap-rejected', 'corrupted-asynchronous-chunk-rejected',
    'browser-${mode}-chunk-hash-fail-closed-before-request',
    'forbiddenRequests', 'route.abort()',
  ]) assert.ok(browserHarness.includes(assertion), 'existing browser contract remains present: ' + assertion);
});

test('workflow and Linux adapter check the committed candidate before browser fixture installation', () => {
  const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/ornigami-image-rehearsal.yml'), 'utf8');
  const adapter = readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/linux-fixture-trial.sh'), 'utf8');
  assert.match(workflow, /docker buildx version \| tee "\$ORNIGAMI_EVIDENCE_DIR\/runner\/buildx-version\.txt"/);
  const candidateGate = 'framework-fixture-input-readiness.mjs" --candidate "$SOURCE_SHA" "$RUNNER_TEMP/source"';
  assert.ok(workflow.includes(candidateGate));
  assert.ok(workflow.indexOf(candidateGate) < workflow.indexOf('docker buildx build', workflow.indexOf('id: image_build')));
  const adapterGate = adapter.indexOf('framework-fixture-input-readiness.mjs');
  const fixtureCopy = adapter.indexOf('cp -a "$source_dir/tests/fixtures/framework-sri/."');
  assert.ok(adapterGate >= 0 && fixtureCopy > adapterGate, 'candidate gate precedes fixture installation');
  assert.match(adapter, /framework-fixture-input-readiness\.mjs" \\\s+--candidate/);
});
