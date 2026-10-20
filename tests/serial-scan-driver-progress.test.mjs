import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { intermediateBuildArguments } from '../scripts/framework-prototype/intermediate-build-args.mjs';
import { RawJsonProgressTracker, cachedTargetRun, rejectReexecution } from '../scripts/framework-prototype/serial-scan-progress.mjs';
import { loadBuildProfile } from '../scripts/framework-prototype/build-profile.mjs';
import { aggregate, skipDependentStages } from '../scripts/framework-prototype/stage-index.mjs';
import { requiredStages } from '../scripts/framework-prototype/scan-image-stages.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function event(vertex) { return JSON.stringify({ vertexes: [vertex] }) + '\n'; }

function rawNumericStatusEvent(field, token) {
  const current = field === 'current' ? token : '0';
  const total = field === 'total' ? `,"total":${token}` : '';
  return `{"statuses":[{"id":"raw numeric fixture","current":${current}${total},"timestamp":"2026-10-20T10:00:00Z"}]}\n`;
}

test('intermediate exports exactly match initial build args, origin, source and frontend identity', () => {
  const origin = loadBuildProfile().origin;
  assert.equal(origin, 'https://staging.ornigami.com');
  const source = 'a'.repeat(40);
  const expected = [
    'NEXT_PUBLIC_APP_URL=' + origin,
    'ORNIGAMI_PRIVATE_STAGING_MODE=true',
    'ORNIGAMI_PRIVATE_STAGING_PLATFORM=coolify',
    'ORNIGAMI_SOURCE_SHA=' + source,
    'ORNIGAMI_BUILD_HEAP_MIB=4096',
    'ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS=true',
    'ORNIGAMI_BUILD_DISABLE_SOURCEMAPS=false',
    'ORNIGAMI_BUILD_WEBPACK_WORKER=false',
  ];
  const generated = intermediateBuildArguments({ origin, sourceSha: source });
  const intermediate = [];
  for (let i = 0; i < generated.length; i += 2) {
    assert.equal(generated[i], '--build-arg');
    intermediate.push(generated[i + 1]);
  }
  const workflow = readFileSync(path.join(repositoryRoot, '.github/workflows/ornigami-image-rehearsal.yml'), 'utf8');
  const driver = readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/serial-scan-driver.mjs'), 'utf8');
  const imageStep = workflow.indexOf('id: image_build');
  const initialRun = workflow.indexOf('        run: |', imageStep);
  const nextStep = workflow.indexOf('\n      - name:', initialRun);
  const initialBlock = workflow.slice(initialRun, nextStep);
  const initial = [...initialBlock.matchAll(/--build-arg\s+(?:"([^"]+)"|([^\s\\]+))/g)]
    .map((match) => (match[1] ?? match[2]).replace('${approved_origin}', origin).replace('${SOURCE_SHA}', source));
  assert.deepEqual(initial, expected);
  assert.deepEqual(intermediate, expected);
  assert.match(initialBlock, /mapfile -d '' -t frontend_args/);
  assert.match(initialBlock, /\[\[ "\$\{#frontend_args\[@\]\}" -eq 2 \]\]/);
  assert.match(initialBlock, /toolchain-runtime\.mjs" verify/);
  assert.match(initialBlock, /build-profile\.mjs" origin/);
  assert.match(driver, /\.\.\.toolchain\.frontendBuildArguments/);
  assert.match(driver, /loadBuildProfile\(\)\.origin/);
  assert.match(driver, /'--platform','linux\/amd64'/);
  assert.match(driver, /'--label','org\.opencontainers\.image\.revision='\+source/);
});

test('split interleaved stdout/stderr JSON lines retain independent buffers', () => {
  const tracker = new RawJsonProgressTracker('builder');
  const stdoutEvent = event({ name: '[deps 4/4] RUN npm ci', started: '2026-10-20T09:59:00Z', completed: '2026-10-20T09:59:01Z', cached: true });
  const stderrTarget = '{"vertexes":[{"name":"[builder 8/8] RUN npm run build","started":"2026-10-20T10:00:00Z","completed":"2026-10-20T10:00:01Z","cached":true}]}';
  tracker.push('stderr', Buffer.from(stderrTarget.slice(0, 48)));
  tracker.push('stdout', Buffer.from(stdoutEvent));
  tracker.push('stderr', Buffer.from(stderrTarget.slice(48, 93)));
  tracker.push('stderr', Buffer.from(stderrTarget.slice(93) + '\n'));
  tracker.finish('stdout');
  tracker.finish('stderr');
  assert.equal(tracker.malformed, false);
  assert.equal(tracker.cacheMiss, false);
  assert.equal(tracker.targetCacheProof, true);
  assert.deepEqual(tracker.lines, { stdout: 1, stderr: 1 });
});

test('proof-relevant BuildKit fields follow the pinned schema and completion requires a timestamp', () => {
  const invalidVertices = [
    { name: 17, started: '2026-10-20T10:00:00Z', cached: true },
    { name: null, started: '2026-10-20T10:00:00Z', cached: true },
    { started: '2026-10-20T10:00:00Z', cached: false },
    { name: '[builder 8/8] RUN npm run build', started: '2026-10-20T10:00:00Z', cached: 'true' },
    { name: '[builder 8/8] RUN npm run build', started: '2026-10-20T10:00:00Z', cached: null },
    { name: '[builder 8/8] RUN npm run build', started: 1760954400, cached: true },
    { name: '[builder 8/8] RUN npm run build', started: 'not-a-timestamp', cached: true },
    { name: '[builder 8/8] RUN npm run build', started: '2026-02-30T10:00:00Z', cached: true },
    { name: '[builder 8/8] RUN npm run build', completed: {}, cached: true },
    { name: '[builder 8/8] RUN npm run build', completed: 1, cached: true },
    { name: '[builder 8/8] RUN npm run build', completed: '2026-02-30T10:00:01Z', cached: true },
    { name: '[builder 8/8] RUN npm run build', completed: '2026-10-20T10:00:01Z', cached: true, error: 7 },
  ];
  for (const vertex of invalidVertices) {
    const tracker = new RawJsonProgressTracker('builder');
    tracker.push('stdout', Buffer.from(event(vertex)));
    assert.equal(tracker.malformed, true, JSON.stringify(vertex));
    assert.equal(tracker.targetCacheProof, false, JSON.stringify(vertex));
  }

  const optional = new RawJsonProgressTracker('builder');
  optional.push('stdout', Buffer.from(event({ name: '[builder 8/8] RUN npm run build', cached: true })));
  assert.equal(optional.malformed, false, 'missing start and completion timestamps are valid optional omissions');
  assert.equal(optional.targetCacheProof, false, 'an omitted completion timestamp is not proof');
  const uncachedOptional = new RawJsonProgressTracker('builder');
  uncachedOptional.push('stdout', Buffer.from(event({ name: '[builder 1/1] COPY package.json .' })));
  assert.equal(uncachedOptional.malformed, false, 'omitted cached=false and timestamps remain valid');

  const completed = new RawJsonProgressTracker('builder');
  completed.push('stdout', Buffer.from(event({
    name: '[builder 8/8] RUN npm run build',
    completed: '2026-10-20T10:00:01.123456789+02:00',
    cached: true,
  })));
  assert.equal(completed.malformed, false);
  assert.equal(completed.targetCacheProof, true, 'a completed cached RUN with a valid timestamp proves the target');
});

test('BuildKit transfer statuses use their own schema and cannot prove cached RUNs', () => {
  const capturedNamelessStatus = {
    id: 'resolve docker.io/library/ornigami-frontend',
    vertex: 'sha256:' + 'c'.repeat(64),
    current: 1,
    timestamp: '2026-10-20T10:00:00.000000001Z',
    started: '2026-10-20T10:00:00Z',
  };
  assert.equal(Object.hasOwn(capturedNamelessStatus, 'name'), false);
  const sequence = new RawJsonProgressTracker('builder');
  const statusLine = JSON.stringify({ statuses: [capturedNamelessStatus] }) + '\n';
  sequence.push('stderr', Buffer.from(statusLine.slice(0, 32)));
  sequence.push('stdout', Buffer.from(event({
    name: '[builder 8/8] RUN npm run build',
    completed: '2026-10-20T10:00:01Z',
    cached: true,
  })));
  sequence.push('stderr', Buffer.from(statusLine.slice(32)));
  sequence.finish('stdout');
  sequence.finish('stderr');
  assert.equal(sequence.malformed, false, 'the captured nameless transfer status is valid');
  assert.equal(sequence.cacheMiss, false, 'status records do not trigger vertex reexecution rules');
  assert.equal(sequence.targetCacheProof, true, 'only the completed cached target vertex proves the target');
  assert.deepEqual(sequence.lines, { stdout: 1, stderr: 1 }, 'interleaved streams retain independent line buffers');

  const statusOnly = new RawJsonProgressTracker('builder');
  statusOnly.push('stderr', Buffer.from(JSON.stringify({ statuses: [{
    ...capturedNamelessStatus,
    name: '[builder 8/8] RUN npm run build',
  }] }) + '\n'));
  assert.equal(statusOnly.malformed, false);
  assert.equal(statusOnly.cacheMiss, false, 'a RUN-like status never means the vertex reexecuted');
  assert.equal(statusOnly.targetCacheProof, false, 'a status never establishes cached target proof');

  const minimalStatus = new RawJsonProgressTracker('builder');
  minimalStatus.push('stderr', Buffer.from(JSON.stringify({ statuses: [{
    id: 'exporting frontend',
    current: 0,
    timestamp: '2026-10-20T10:00:00Z',
  }] }) + '\n'));
  assert.equal(minimalStatus.malformed, false, 'omitempty status fields may be absent');
  assert.equal(minimalStatus.cacheMiss, false);
  assert.equal(minimalStatus.targetCacheProof, false);

  const requiredStatus = {
    id: 'exporting frontend',
    current: 0,
    timestamp: '2026-10-20T10:00:00Z',
  };
  const invalidStatuses = [
    ...['id', 'current', 'timestamp'].map((field) => {
      const missing = { ...requiredStatus };
      delete missing[field];
      return missing;
    }),
    { ...requiredStatus, timestamp: null },
    { ...requiredStatus, id: null },
    { ...requiredStatus, id: 7 },
    { ...requiredStatus, current: null },
    { ...requiredStatus, current: '1' },
    { ...requiredStatus, current: 1.5 },
    { ...requiredStatus, timestamp: 1760954400 },
    { ...requiredStatus, timestamp: 'not-a-timestamp' },
    { ...requiredStatus, timestamp: '2026-02-30T10:00:00Z' },
    { ...requiredStatus, vertex: null },
    { ...requiredStatus, name: null },
    { ...requiredStatus, total: null },
    { ...requiredStatus, started: null },
    { ...requiredStatus, completed: null },
    { ...requiredStatus, started: 'not-a-timestamp' },
    { ...requiredStatus, completed: '2026-02-30T10:00:01Z' },
    { ...requiredStatus, cached: true },
    { ...capturedNamelessStatus, id: 7 },
    { ...capturedNamelessStatus, vertex: null },
    { ...capturedNamelessStatus, name: 7 },
    { ...capturedNamelessStatus, total: '100' },
    { ...capturedNamelessStatus, current: 1.5 },
    { ...capturedNamelessStatus, timestamp: 1760954400 },
    { ...capturedNamelessStatus, started: 'not-a-timestamp' },
    { ...capturedNamelessStatus, completed: '2026-02-30T10:00:01Z' },
    { ...capturedNamelessStatus, cached: true },
  ];
  for (const status of invalidStatuses) {
    const tracker = new RawJsonProgressTracker('builder');
    tracker.push('stdout', Buffer.from(JSON.stringify({ statuses: [status] }) + '\n'));
    assert.equal(tracker.malformed, true, JSON.stringify(status));
    assert.equal(tracker.cacheMiss, false, 'invalid statuses still cannot trigger vertex cache policy');
    assert.equal(tracker.targetCacheProof, false, 'invalid statuses cannot establish target cache proof');
  }
});

test('raw status current and total preserve signed int64 values and reject non-serialized forms', () => {
  // Keep these as JSON token strings: JS numeric literals round the int64 boundaries.
  const validInt64Tokens = [
    '-9223372036854775808',
    '-9007199254740993',
    '-1',
    '0',
    '42',
    '9007199254740993',
    '9223372036854775807',
  ];
  const invalidInt64Tokens = [
    '-9223372036854775809',
    '9223372036854775808',
    '1.0',
    '1.25',
    '1e3',
    '-1E+3',
    '-0',
    'null',
    'true',
    'false',
    '"42"',
    '{}',
    '[]',
  ];

  for (const field of ['current', 'total']) {
    for (const token of validInt64Tokens) {
      const tracker = new RawJsonProgressTracker('builder');
      tracker.push('stdout', Buffer.from(rawNumericStatusEvent(field, token)));
      assert.equal(tracker.malformed, false, `${field}=${token} is within signed int64`);
    }
    for (const token of invalidInt64Tokens) {
      const tracker = new RawJsonProgressTracker('builder');
      tracker.push('stdout', Buffer.from(rawNumericStatusEvent(field, token)));
      assert.equal(tracker.malformed, true, `${field}=${token} must fail the producer int64 contract`);
      assert.equal(tracker.cacheMiss, false);
      assert.equal(tracker.targetCacheProof, false);
    }
  }
});

test('invalid numeric statuses block acceptance before and after cached target proof on both streams', () => {
  const driver = readFileSync(path.join(repositoryRoot, 'scripts/framework-prototype/serial-scan-driver.mjs'), 'utf8');
  assert.match(driver, /code!==0\|\|tracker\.cacheMiss\|\|tracker\.malformed\|\|!tracker\.targetCacheProof/,
    'the stage acceptance gate must retain malformed-progress rejection');

  const cachedTarget = event({
    name: '[builder 8/8] RUN npm run build',
    completed: '2026-10-20T10:00:01Z',
    cached: true,
  });
  for (const field of ['current', 'total']) {
    const malformedStatus = rawNumericStatusEvent(field, '9223372036854775808');
    for (const stream of ['stdout', 'stderr']) {
      for (const malformedFirst of [true, false]) {
        const tracker = new RawJsonProgressTracker('builder');
        const lines = malformedFirst ? [malformedStatus, cachedTarget] : [cachedTarget, malformedStatus];
        for (const line of lines) tracker.push(stream, Buffer.from(line));
        tracker.finish(stream);
        assert.equal(tracker.targetCacheProof, true, `${field}/${stream}, malformedFirst=${malformedFirst}: valid vertex proof is retained`);
        assert.equal(tracker.malformed, true, `${field}/${stream}, malformedFirst=${malformedFirst}: out-of-range numeric status remains fatal`);
        assert.equal(tracker.cacheMiss, false);
        assert.equal(tracker.malformed || tracker.cacheMiss || !tracker.targetCacheProof, true,
          'malformed progress blocks final acceptance despite valid cached-target proof');
      }
    }
  }
});

test('opaque output after valid target proof fails closed', () => {
  const tracker = new RawJsonProgressTracker('builder');
  tracker.push('stderr', Buffer.from(event({
    name: '[builder 8/8] RUN npm run build',
    completed: '2026-10-20T10:00:01Z',
    cached: true,
  })));
  assert.equal(tracker.targetCacheProof, true);
  tracker.push('stderr', Buffer.from('opaque diagnostic after proof\n'));
  assert.equal(tracker.targetCacheProof, true);
  assert.equal(tracker.malformed, true);
  assert.equal(tracker.unclassifiedOutputCount, 1);

  const structuredError = new RawJsonProgressTracker('builder');
  structuredError.push('stdout', Buffer.from(event({
    name: '[builder 8/8] RUN npm run build',
    completed: '2026-10-20T10:00:01Z',
    cached: true,
    error: 'unexpected build error',
  })));
  assert.equal(structuredError.malformed, true);
  assert.equal(structuredError.targetCacheProof, false, 'a vertex error cannot establish successful cache proof');
});

test('uncached RUN start abort condition and completed cached proof remain distinct', () => {
  const startedCached = { name: '[builder 8/8] RUN npm run build', started: '2026-10-20T10:00:00Z', cached: true };
  assert.equal(cachedTargetRun({ vertexes: [startedCached] }, 'builder'), false);
  assert.equal(rejectReexecution({ vertexes: [{ ...startedCached, cached: false }] }), true);
  assert.equal(rejectReexecution({ vertexes: [{ ...startedCached, cached: true }] }), false);
  const unproved = new RawJsonProgressTracker('builder');
  unproved.push('stderr', Buffer.from(event({ ...startedCached, cached: false })));
  assert.equal(unproved.cacheMiss, true, 'uncached RUN start remains an immediate abort condition');
  assert.equal(unproved.targetCacheProof, false);
  const tracker = new RawJsonProgressTracker('builder');
  tracker.push('stderr', Buffer.from(event(startedCached)));
  tracker.push('stdout', Buffer.from(event({ ...startedCached, completed: '2026-10-20T10:00:01Z' })));
  assert.equal(tracker.targetCacheProof, true);
  assert.equal(tracker.cacheMiss, false);
});

test('known cancellation diagnostics stay separate while malformed required progress remains fatal', () => {
  const tracker = new RawJsonProgressTracker('builder');
  tracker.markAbort();
  tracker.push('stderr', Buffer.from('ERROR: context canceled\n'));
  assert.equal(tracker.cancellationDiagnostics.length, 1);
  assert.equal(tracker.malformed, false);

  const beforeAbort = new RawJsonProgressTracker('builder');
  beforeAbort.push('stderr', Buffer.from('ERROR: context canceled\n'));
  assert.equal(beforeAbort.cancellationDiagnostics.length, 0);
  assert.equal(beforeAbort.malformed, true, 'the same diagnostic is unclassified before an abort');

  const wrongStream = new RawJsonProgressTracker('builder');
  wrongStream.markAbort();
  wrongStream.push('stdout', Buffer.from('ERROR: context canceled\n'));
  assert.equal(wrongStream.cancellationDiagnostics.length, 0);
  assert.equal(wrongStream.malformed, true, 'plain cancellation text is only evidenced on stderr');

  const malformed = new RawJsonProgressTracker('builder');
  malformed.markAbort();
  malformed.push('stderr', Buffer.from('{"vertexes":[}\n'));
  malformed.push('stderr', Buffer.from('ERROR: context canceled\n'));
  assert.equal(malformed.cancellationDiagnostics.length, 1);
  assert.equal(malformed.malformed, true);
  const malformedShape = new RawJsonProgressTracker('builder');
  malformedShape.push('stderr', Buffer.from('{"vertexes":[null]}\n'));
  assert.equal(malformedShape.malformed, true, 'valid JSON with an invalid progress shape remains fatal');

  const structured = new RawJsonProgressTracker('builder');
  structured.markAbort();
  structured.push('stderr', Buffer.from(event({
    name: '[builder 8/8] RUN npm run build',
    started: '2026-10-20T10:00:00Z',
    cached: false,
    error: 'context canceled',
  })));
  assert.equal(structured.cancellationDiagnostics.length, 1);
  assert.equal(structured.cacheMiss, true, 'cancellation diagnostic does not suppress an uncached RUN failure');

  const postAbortOutput = new RawJsonProgressTracker('builder');
  postAbortOutput.markAbort();
  postAbortOutput.push('stderr', Buffer.from('ERROR: context canceled\nopaque trailing output\n'));
  assert.equal(postAbortOutput.cancellationDiagnostics.length, 1);
  assert.equal(postAbortOutput.malformed, true, 'recognized cancellation does not hide opaque trailing output');
  assert.equal(postAbortOutput.unclassifiedOutputCount, 1);
});

test('failed stage propagates and prevents aggregate acceptance', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ornigami-stage-propagation-'));
  try {
    const first = requiredStages[0];
    const firstDirectory = path.join(root, first);
    mkdirSync(firstDirectory, { recursive: true });
    writeFileSync(path.join(firstDirectory, 'driver.json'), JSON.stringify({ stage: first, result: 'failed', collectionComplete: false }));
    const records = skipDependentStages(root, 'b'.repeat(40), 'Prior role/shared prerequisite failed; no later role attempted');
    assert.equal(records.length, requiredStages.length);
    assert.equal(records[0].result, 'failed');
    assert.ok(records.slice(1).every((record) => record.result === 'skipped' && record.collectionComplete === false));
    assert.equal(aggregate(records, 'b'.repeat(40)).result, 'failed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
