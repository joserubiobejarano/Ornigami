import { existsSync, readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const [specPath, gatePath, output] = process.argv.slice(2);
const deadline = Date.now() + 15000;
while (!existsSync(gatePath)) {
  if (Date.now() > deadline) throw new Error('No job assignment; refusing to start work');
  await new Promise(resolve => setTimeout(resolve, 50));
}
const spec = JSON.parse(readFileSync(specPath, 'utf8').replace(/^\uFEFF/, ''));
const stdout = openSync(join(output, 'stdout.log'), 'wx');
const stderr = openSync(join(output, 'stderr.log'), 'wx');
// No inherited application secrets: use an explicit allowlist plus fictional test config.
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
Object.assign(env, { CI: 'true', NEXT_SKIP_NATIVE_POSTINSTALL: '1', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=4096', RAYON_NUM_THREADS: '3', UV_THREADPOOL_SIZE: '3', TURBO_TELEMETRY_DISABLED: '1', ...spec.env });
const child = spawn(spec.executable, spec.args, { cwd: spec.cwd, env, stdio: ['ignore', stdout, stderr], windowsHide: true });
child.on('error', error => { writeFileSync(join(output, 'launch-error.txt'), error.message); process.exitCode = 1; });
child.on('close', (code, signal) => {
  closeSync(stdout); closeSync(stderr);
  writeFileSync(join(output, 'exit.json'), JSON.stringify({ code, signal }) + '\n');
  process.exitCode = code ?? 1;
});
