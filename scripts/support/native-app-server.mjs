// Qualification server only: uses the normal Next router, not another API.
import next from 'next';
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { isPublicAddress } from '../../src/lib/campaign-lab/brand-import/private-address.ts';
import control from './native-bridge.cjs';
import { validateSourcePlan } from './native-run-control.mjs';
const [sha, kind] = process.argv.slice(2);
if (!process.send || !/^[a-f0-9]{40}$/.test(sha ?? '') || !['simulation','approved-native'].includes(kind)) throw new Error('Trusted runner IPC required');
const audit = event => appendFileSync('.local/native-adapter/bridge-events.jsonl', JSON.stringify({ pid: process.pid, physical: kind, ...event }) + '\n');
const bridge = control.installNativeBridge({ isPublicAddress, simulated: kind === 'simulation', audit });
audit({ event: 'startup', ...bridge.snapshot() });
const app = next({ dev: true, hostname: '127.0.0.1', port: 3043, webpack: true });
await app.prepare();
const handler = app.getRequestHandler();
const server = createServer((req, res) => handler(req, res));
await new Promise(done => server.listen(3043, '127.0.0.1', done));
// Compilation happens with authority closed, even before the parent arms it.
for (const path of ['/', '/login', '/campaign-lab/offer']) await fetch('http://127.0.0.1:3043' + path);
await fetch('http://127.0.0.1:3043/api/campaign-lab/brand-evidence', { method: 'POST', headers: { origin: 'http://127.0.0.1:3043', 'content-type': 'application/json' }, body: '{}' });
audit({ event: 'prepared', ...bridge.snapshot() });
process.on('message', message => {
  if (message?.type !== 'trusted-source-plan') return;
  const result = validateSourcePlan(message.plan, sha, message.recordPath);
  if (result.simulated !== (kind === 'simulation') || result.recordDigest !== message.recordDigest || result.freshRunId !== message.freshRunId) throw new Error('Backend/plan/record mismatch');
  bridge.arm(); console.log('Source app ready at http://127.0.0.1:3043 — ' + kind + '; authority closed until the one matching API action.');
});
process.send({ type: 'prepared-closed' });
