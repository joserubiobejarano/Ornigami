/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('node:child_process');
const { promisify } = require('node:util');
const { resolve } = require('node:path');
if (process.argv[2] === 'worker') {
  (async () => {
    let callbacks = 0;
    const handle = cp.execFile(process.execPath, { timeout: 1500 }, () => callbacks++);
    handle.stdin.end();
    await new Promise(done => handle.once('close', () => setImmediate(done)));
    const promise = promisify(cp.execFile)(process.execPath, ['-e', "process.stdout.write('out');process.stderr.write('err')"], { timeout: 1500 });
    const childPresent = !!promise.child;
    const value = await promise;
    process.stdout.write(JSON.stringify({ callbacks, callbackHandle: handle instanceof cp.ChildProcess, value, childPresent }));
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const result = {};
  for (const guarded of [false, true]) {
    const run = cp.spawnSync(process.execPath, [__filename, 'worker'], { timeout: 5000, encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: guarded ? '--require=' + JSON.stringify(resolve('scripts/support/offline-guard.cjs')) : '' } });
    if (run.status !== 0) throw new Error(run.stderr || String(run.error));
    result[guarded ? 'guarded' : 'baseline'] = JSON.parse(run.stdout);
  }
  console.log(JSON.stringify(result, null, 2));
}
