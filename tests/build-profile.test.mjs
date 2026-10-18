import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { approvedOrigin, loadBuildProfile, parseBuildProfile } from '../scripts/framework-prototype/build-profile.mjs';

const helper = fileURLToPath(new URL('../scripts/framework-prototype/build-profile.mjs', import.meta.url));

test('source profile and CLI expose the single approved origin as one line', () => {
  assert.deepEqual(loadBuildProfile(), { schema: 1, origin: approvedOrigin });
  const result = spawnSync(process.execPath, [helper, 'origin'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${approvedOrigin}\n`);
  assert.equal(result.stdout.trim().split(/\r?\n/).length, 1);
});

test('profile parser rejects HTTP, alternate hosts, credentials, paths, unknown keys, and schema drift', () => {
  for (const origin of [
    'http://staging.ornigami.com',
    'https://attacker.invalid',
    'https://user:password@staging.ornigami.com',
    'https://staging.ornigami.com/path',
    'https://staging.ornigami.com:443'
  ]) assert.throws(() => parseBuildProfile({ schema: 1, origin }), /approved HTTPS origin/);
  assert.throws(() => parseBuildProfile({ schema: 1, origin: approvedOrigin, override: true }), /exactly schema and origin/);
  assert.throws(() => parseBuildProfile({ schema: 2, origin: approvedOrigin }), /approved HTTPS origin/);
  assert.throws(() => parseBuildProfile({ schema: true, origin: approvedOrigin }), /approved HTTPS origin/);
});
