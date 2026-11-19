// Executable offline preparation. No live backend, reservation or dotenv path.
import { spawnSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--serve')) throw new Error('Only optional --serve is supported; no live mode exists');
mkdirSync('.local/guard-rehearsal', { recursive: true });
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'test', OPENAI_ENABLED: 'false', ORNIGAMI_BRAND_URL_LIVE: 'false' };
const test = spawnSync(process.execPath, ['--test', 'tests/guard-compat.test.cjs', 'tests/source-policy.test.cjs', 'tests/offline-guard.test.cjs'], { env, stdio: 'inherit', timeout: 30000 });
if (test.status !== 0) throw new Error('Offline contract/policy rehearsal failed');
const preload = ['tests/support/guard-seams.cjs','scripts/support/offline-guard.cjs'].map(p => '--require=' + JSON.stringify(resolve(p))).join(' ');
const trace = spawnSync(process.execPath, ['--experimental-strip-types', 'tests/support/source-policy.mts', '.local/guard-rehearsal/source-policy.json'], { env: { ...env, NODE_OPTIONS: preload }, stdio: ['ignore','pipe','inherit'], timeout: 15000 });
if (trace.status !== 0) throw new Error('Synthetic policy trace failed');
console.log('Offline rehearsal passed. Source authority closed; synthetic trace saved. No live backend or reservation exists.');
if (args[0] === '--serve') {
  const server = spawn(process.execPath, ['scripts/offline-qualify.mjs', 'dev'], { env, stdio: 'inherit' });
  server.on('exit', code => { process.exitCode = code ?? 1; });
}
