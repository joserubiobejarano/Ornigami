/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
test('source permit is executable with protected reader and mandatory synthetic seams', () => {
  const preload = ['tests/support/guard-seams.cjs','scripts/support/offline-guard.cjs'].map(p => '--require=' + JSON.stringify(resolve(p))).join(' ');
  const run = spawnSync(process.execPath, ['--experimental-strip-types','tests/support/source-policy.mts'], { timeout: 15000, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: preload } });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  assert.equal(JSON.parse(run.stdout).realUnderlyingCalls, 0);
});
