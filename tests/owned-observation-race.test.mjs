import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { observationKeys, observationScript } from '../scripts/framework-prototype/observe-buildkit.mjs';

const windows = process.platform === 'win32';
const bash = windows ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';

function bashPath(value) {
  if (!windows) return value;
  const result = spawnSync(bash, ['-lc', `cygpath -u '${value.replaceAll("'", "'\\''")}'`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-observation-'));
  const cgroup = path.join(root, 'cgroup');
  const proc = path.join(root, 'proc');
  fs.mkdirSync(cgroup, { recursive: true });
  fs.mkdirSync(path.join(proc, '123'), { recursive: true });
  for (const key of observationKeys.split(' ')) fs.writeFileSync(path.join(cgroup, key), 'fixture-metric\n');
  return { root, cgroup, proc };
}

function removeFixture(fx) {
  const root = path.resolve(fx.root);
  const tempRoot = path.resolve(os.tmpdir());
  assert.ok(root.startsWith(`${tempRoot}${path.sep}`), 'fixture cleanup must remain under the OS temp directory');
  assert.match(path.basename(root), /^owned-observation-/);
  fs.rmSync(root, { recursive: true, force: true });
}

function runFixture(fx, prefix = '') {
  const script = observationScript({ cgroupRoot: bashPath(fx.cgroup), procRoot: bashPath(fx.proc) });
  return spawnSync(bash, ['-lc', `${prefix}${script}`], { encoding: 'utf8' });
}

test('a disappearing /proc sample is marked while complete cgroup inventory succeeds', t => {
  const fx = fixture();
  t.after(() => removeFixture(fx));
  const result = runFixture(fx);
  assert.equal(result.status, 0, result.stderr);
  for (const key of observationKeys.split(' ')) assert.match(result.stdout, new RegExp(`==${key}==\\nfixture-metric`));
  assert.match(result.stdout, /==proc-sample-skipped== .*\/123\/status unreadable-or-disappeared/);
  assert.match(result.stdout, /==owned-process-memory==/);
});

test('a failed mandatory cgroup cat remains fatal', t => {
  const fx = fixture();
  t.after(() => removeFixture(fx));
  fs.rmSync(path.join(fx.cgroup, 'memory.max'));
  const result = runFixture(fx);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /memory\.max|No such file/i);
  assert.doesNotMatch(result.stdout, /==owned-process-memory==/);
});

test('a smaps read race retains its stderr diagnostic and does not fail complete cgroup metrics', t => {
  const fx = fixture();
  t.after(() => removeFixture(fx));
  fs.writeFileSync(path.join(fx.proc, '123', 'status'), 'Name: fixture\nPid: 123\n');
  fs.writeFileSync(path.join(fx.proc, '123', 'smaps_rollup'), 'Rss: 12 kB\n');
  const override = `grep() { case "$*" in *smaps_rollup*) printf 'fixture smaps read error\\n' >&2; return 2;; *) command grep "$@";; esac; }\n`;
  const result = runFixture(fx, override);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /==memory\.max==\nfixture-metric/);
  assert.match(result.stdout, /==proc-sample-skipped== .*\/123\/smaps_rollup read-error status=2/);
  assert.match(result.stderr, /fixture smaps read error/);
});
