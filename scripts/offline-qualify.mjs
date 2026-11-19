// No dotenv, remote font hooks, credentials or live launch/reservation path.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const [mode, ...args] = process.argv.slice(2);
if (!['dev', 'build', 'node'].includes(mode)) throw new Error('Usage: node scripts/offline-qualify.mjs dev|build|node [arguments]');
if (existsSync('.env.local') || existsSync('.env')) throw new Error('Qualification requires no dotenv files');
mkdirSync('.local/offline', { recursive: true });
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  NEXT_TELEMETRY_DISABLED: '1', ORNIGAMI_BRAND_URL_MODE: 'synthetic', ORNIGAMI_BRAND_URL_LIVE: 'false',
  CAMPAIGN_LAB_GENERATION_PROVIDER: 'local-test', OPENAI_ENABLED: 'false', AUTH_SECRET: 'offline-synthetic-auth-secret',
  GOOGLE_CLIENT_ID: 'offline-synthetic', GOOGLE_CLIENT_SECRET: 'offline-synthetic', AUTH_TRUST_HOST: 'true',
  NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3041',
  NODE_OPTIONS: `--require="${resolve('scripts/support/offline-guard.cjs').replaceAll('\\', '/')}"`,
  ORNIGAMI_OFFLINE_LOG: resolve(`.local/offline/${mode}-events.jsonl`) };
const command = mode === 'node' ? args : [resolve('node_modules/next/dist/bin/next'), mode, ...(mode === 'build' ? ['--webpack'] : ['--webpack', '--hostname', '127.0.0.1', '--port', '3041']), ...args];
const run = argv => new Promise(done => { const p = spawn(process.execPath, argv, { env, stdio: 'inherit' }); p.on('exit', code => done(code ?? 1)); });
let code = await run(command);
if (!code && mode === 'build') {
  code = await run(['scripts/finalize-sri-manifest.mjs']);
  if (!code) code = await run(['scripts/generate-static-csp-hashes.mjs']);
}
process.exitCode = code;
