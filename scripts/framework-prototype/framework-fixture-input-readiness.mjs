import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helperDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(helperDirectory, 'framework-sri-fixture-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const overlayPath = path.join(helperDirectory, 'framework-sri-fixture-overlay.json');
const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
const expected = new Map(Object.entries(manifest.files));
// SHA-256 of the original sorted UTF-8 path<TAB>blob<LF> rows.
const expectedOriginalMapSha256 = 'f7baf5918e6e0314231a43cef7a31f667ad9b20048d368633a7957cf5f29c559';
const reviewedOverlay = {
  path: 'app/controls.js',
  originalBlob: 'd10dedf2c8485b5548eee9c204dda1ba1002d352',
  reviewedBlob: '7f819e2731a5ec48f3a63d46f228da9008937d8b',
};

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ' failed: ' + (result.stderr || '').trim());
  return result.stdout.trim();
}

function validateManifest() {
  if (manifest.schema !== 1 || manifest.sourceCommit !== 'd2b61f61ce30a1fcafcb9dec198fed7496764466' || manifest.fixtureRoot !== 'tests/fixtures/framework-sri') {
    throw new Error('Framework SRI fixture provenance manifest identity is invalid');
  }
  if (expected.size !== 16 || [...expected.values()].some((oid) => !/^[0-9a-f]{40}$/.test(oid))) {
    throw new Error('Framework SRI fixture manifest must bind exactly 16 Git blobs');
  }
  const canonicalOriginalMap = [...expected]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([fixturePath, oid]) => fixturePath + '\t' + oid + '\n')
    .join('');
  const originalMapSha256 = createHash('sha256').update(canonicalOriginalMap, 'utf8').digest('hex');
  if (originalMapSha256 !== expectedOriginalMapSha256) {
    throw new Error('Framework SRI fixture original path/blob map identity is invalid');
  }
  if (overlay.schema !== 1 || overlay.sourceCommit !== manifest.sourceCommit || overlay.fixtureRoot !== manifest.fixtureRoot ||
    overlay.path !== reviewedOverlay.path || overlay.originalBlob !== reviewedOverlay.originalBlob ||
    overlay.reviewedBlob !== reviewedOverlay.reviewedBlob || expected.get(overlay.path) !== overlay.originalBlob ||
    overlay.reason !== 'Rename the dynamic import result from module to loadedModule for the locked Next lint rule; the loaded module and late-chunk SRI rejection behavior are unchanged.') {
    throw new Error('Framework SRI fixture lint overlay identity is invalid');
  }
}

function compareFiles(actual, label) {
  const actualPaths = [...actual.keys()].sort();
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    const missing = expectedPaths.filter((name) => !actual.has(name));
    const extra = actualPaths.filter((name) => !expected.has(name));
    throw new Error(label + ' fixture file-set mismatch; missing=' + missing.join(',') + '; extra=' + extra.join(','));
  }
  for (const [name, oid] of expected) {
    const acceptedOid = name === overlay.path ? overlay.reviewedBlob : oid;
    if (actual.get(name) !== acceptedOid) throw new Error(label + ' fixture blob mismatch: ' + name);
  }
}

function listWorkingTree(root) {
  const fixture = path.join(root, ...manifest.fixtureRoot.split('/'));
  const actual = new Map();
  function visit(directory, relative) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = relative ? relative + '/' + entry.name : entry.name;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink is not accepted in framework fixture input: ' + name);
      if (entry.isDirectory()) visit(fullPath, name);
      else if (entry.isFile()) {
        const stat = lstatSync(fullPath);
        if (!stat.isFile()) throw new Error('Non-regular fixture input: ' + name);
        const repositoryPath = manifest.fixtureRoot + '/' + name;
        const oid = git(root, ['hash-object', '--path=' + repositoryPath, fullPath]);
        actual.set(name, oid);
      } else throw new Error('Unsupported fixture input type: ' + name);
    }
  }
  if (!lstatSync(fixture).isDirectory()) throw new Error('Framework SRI fixture directory is missing');
  visit(fixture, '');
  return actual;
}

function listCandidateTree(root, candidate) {
  if (!/^[0-9a-f]{40}$/.test(candidate)) throw new Error('Candidate commit SHA is required');
  git(root, ['cat-file', '-e', candidate + '^{commit}']);
  const lines = git(root, ['ls-tree', '-r', '--format=%(objectmode)%x09%(objecttype)%x09%(objectname)%x09%(path)', candidate, '--', manifest.fixtureRoot]).split(/\r?\n/).filter(Boolean);
  const actual = new Map();
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields.length !== 4) throw new Error('Candidate fixture tree entry is malformed');
    const [mode, type, oid, fullPath] = fields;
    if (mode !== '100644' || type !== 'blob') throw new Error('Candidate fixture input is not a regular file: ' + fullPath);
    if (!fullPath.startsWith(manifest.fixtureRoot + '/')) throw new Error('Candidate fixture path escaped its root');
    actual.set(fullPath.slice(manifest.fixtureRoot.length + 1), oid);
  }
  return actual;
}

function requireCommittedReadinessFiles(root, candidate) {
  const repositoryRoot = path.resolve(helperDirectory, '../..');
  const required = [
    [path.relative(repositoryRoot, fileURLToPath(import.meta.url)).split(path.sep).join('/'), 'readiness helper'],
    [path.relative(repositoryRoot, manifestPath).split(path.sep).join('/'), 'fixture provenance manifest'],
    [path.relative(repositoryRoot, overlayPath).split(path.sep).join('/'), 'fixture lint overlay'],
  ];
  for (const [relative, label] of required) {
    const entry = git(root, ['ls-tree', candidate, '--', relative]);
    if (!entry.startsWith('100644 blob ')) throw new Error('Candidate does not track the ' + label);
    const committed = git(root, ['rev-parse', candidate + ':' + relative]);
    const working = git(root, ['hash-object', '--path=' + relative, path.join(root, ...relative.split('/'))]);
    if (committed !== working) throw new Error('Candidate ' + label + ' differs from the checked source file');
  }
}

export function checkFixtureInputs({ mode, root, candidate }) {
  validateManifest();
  const repository = path.resolve(root);
  if (mode === 'working-tree') {
    const actual = listWorkingTree(repository);
    compareFiles(actual, 'Working-tree');
    return { mode, sourceCommit: manifest.sourceCommit, fileCount: actual.size, result: 'passed-working-tree-fixture-inputs' };
  }
  if (mode === 'candidate') {
    const actual = listCandidateTree(repository, candidate);
    compareFiles(actual, 'Candidate ' + candidate);
    if (candidate !== manifest.sourceCommit) requireCommittedReadinessFiles(repository, candidate);
    return { mode, candidate, sourceCommit: manifest.sourceCommit, fileCount: actual.size, result: 'passed-committed-candidate-fixture-inputs' };
  }
  throw new Error('Expected --working-tree ROOT or --candidate COMMIT ROOT');
}

function main(argv) {
  let result;
  if (argv[0] === '--working-tree' && argv.length === 2) result = checkFixtureInputs({ mode: 'working-tree', root: argv[1] });
  else if (argv[0] === '--candidate' && argv.length === 3) result = checkFixtureInputs({ mode: 'candidate', candidate: argv[1], root: argv[2] });
  else throw new Error('Usage: framework-fixture-input-readiness.mjs --working-tree ROOT | --candidate COMMIT ROOT');
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
