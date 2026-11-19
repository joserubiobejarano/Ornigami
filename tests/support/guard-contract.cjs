/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { promisify } = require('node:util');
const { resolve } = require('node:path');
const fixture = resolve('tests/support/guard-child.cjs');
const minimal = { SystemRoot: process.env.SystemRoot };
const stdinCode = `require(${JSON.stringify(fixture)})`;
const callback = (shape) => new Promise((resolveResult, reject) => {
  let count = 0;
  const done = (error, out, err) => { count++; if (error) reject(error); else { assert.equal(out, 'out'); assert.equal(err, 'err'); } };
  const child = shape(done);
  assert.ok(child instanceof cp.ChildProcess);
  child.stdin.end(stdinCode);
  child.once('close', () => setImmediate(() => { try { assert.equal(count, 1); resolveResult(); } catch (e) { reject(e); } }));
});
(async () => {
  await callback(done => cp.execFile(process.execPath, done));
  await callback(done => cp.execFile(process.execPath, { env: minimal, timeout: 2000 }, done));
  await callback(done => cp.execFile(process.execPath, [fixture], done));
  await callback(done => cp.execFile(process.execPath, [fixture], { env: minimal, timeout: 2000 }, done));
  assert.throws(() => cp.execFile(process.execPath, {}, 42), { code: 'ERR_INVALID_ARG_TYPE' });
  assert.throws(() => cp.execFile(process.execPath, [], 'invalid'), { code: 'ERR_INVALID_ARG_TYPE' });
  assert.throws(() => promisify(cp.execFile)(42), { code: 'ERR_INVALID_ARG_TYPE' });
  await new Promise((done, reject) => {
    let count = 0, failure;
    const p = cp.execFile('nonexistent-guard-contract-binary', { env: minimal }, error => { count++; failure = error; });
    p.once('close', () => setImmediate(() => { try { assert.equal(count, 1); assert.equal(failure.code, 'ENOENT'); done(); } catch (e) { reject(e); } }));
  });
  await new Promise((done, reject) => {
    let count = 0, failure;
    const p = cp.execFile(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { timeout: 100, env: minimal }, error => { count++; failure = error; });
    p.stdin.end();
    p.once('close', () => setImmediate(() => { try { assert.equal(count, 1); assert.equal(failure.killed, true); done(); } catch (e) { reject(e); } }));
  });
  const promise = promisify(cp.execFile)(process.execPath, [fixture], { env: minimal, encoding: 'buffer', timeout: 2000 });
  assert.ok(promise.child instanceof cp.ChildProcess);
  promise.child.stdin.end();
  const output = await promise; assert.ok(Buffer.isBuffer(output.stdout)); assert.equal(output.stdout.toString(), 'out'); assert.equal(output.stderr.toString(), 'err');
  const failed = promisify(cp.execFile)(process.execPath, ['-e', "process.stdout.write('out');process.stderr.write('err');process.exitCode=7"], { env: minimal });
  assert.ok(failed.child instanceof cp.ChildProcess);
  failed.child.stdin.end();
  await assert.rejects(failed, e => e.code === 7 && e.stdout === 'out' && e.stderr === 'err');
  await assert.rejects(promisify(cp.execFile)('nonexistent-guard-contract-binary'), { code: 'ENOENT' });
  const abort = new AbortController();
  const cancelled = promisify(cp.execFile)(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { signal: abort.signal, env: minimal });
  cancelled.child.stdin.end(); abort.abort(); await assert.rejects(cancelled, { code: 'ABORT_ERR' });
  assert.equal(cp.execFileSync(process.execPath, [fixture], { env: minimal, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }), 'out');
  assert.equal(cp.execFileSync(process.execPath, { env: minimal, input: stdinCode, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }), 'out');
  assert.equal(cp.spawnSync(process.execPath, { env: minimal, input: stdinCode, encoding: 'utf8' }).stdout, 'out');
  assert.equal(cp.spawnSync(process.execPath, [fixture], { env: minimal, encoding: 'utf8' }).stdout, 'out');
  for (const args of [[{ env: minimal }], [[fixture], { env: minimal }]]) {
    const p = cp.spawn(process.execPath, ...args); let out = ''; p.stdout.on('data', b => out += b); p.stderr.resume(); p.stdin.end(stdinCode);
    await new Promise(done => p.once('close', done)); assert.equal(out, 'out');
  }
  for (const args of [[{ env: minimal, silent: true }], [[], { env: minimal, silent: true }]]) {
    const p = cp.fork(fixture, ...args); p.stdout.resume(); p.stderr.resume();
    p.stdin?.end();
    const message = await new Promise(done => p.once('message', done)); assert.equal(message.guarded, true);
    await new Promise(done => p.once('close', done));
  }
  console.log('PASS callback overloads, handles, buffers, promise child/error, cancellation, spawn/fork/sync forms and child enforcement');
})().catch(error => { console.error(error); process.exitCode = 1; });
