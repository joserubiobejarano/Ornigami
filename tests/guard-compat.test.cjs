/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
test('guard preserves child-process contracts and inherited enforcement', () => {
  const preload = ['tests/support/guard-seams.cjs','scripts/support/offline-guard.cjs'].map(p => '--require=' + JSON.stringify(resolve(p))).join(' ');
  const run = spawnSync(process.execPath, ['tests/support/guard-contract.cjs'], { timeout: 20000, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: preload } });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  assert.match(run.stdout, /^PASS/);
});
