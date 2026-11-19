import { mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { startSourceApplication } from './support/native-run-control.mjs';
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--serve-simulated')) throw new Error('Only optional --serve-simulated exists. No live execution option.');
mkdirSync('.local/native-adapter', { recursive: true });
const tests = spawnSync(process.execPath, ['--test','tests/native-source.test.cjs','tests/source-policy.test.cjs','tests/guard-compat.test.cjs','tests/offline-guard.test.cjs'], { stdio: 'inherit', timeout: 40000 });
if (tests.status !== 0) throw new Error('Offline readiness failed');
console.log('Offline native-delegation checks passed; no owner-approved live plan or record exists.');
if (args[0] === '--serve-simulated') {
  const sourceSha = execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim();
  const child = startSourceApplication({ plan: { kind: 'offline-native-simulation', sourceSha, seed: 'https://www.iana.org/' } });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
