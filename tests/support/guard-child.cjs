/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
assert.ok(require.cache[require.resolve('../../scripts/support/offline-guard.cjs')]);
assert.throws(() => require('node:dns').lookup('outside.invalid', () => {}), { code: 'ORNIGAMI_OFFLINE' });
assert.equal(require('./guard-seams.cjs').calls, 0);
process.stdout.write('out'); process.stderr.write('err');
if (process.send) { process.send({ guarded: true }); process.disconnect(); }
