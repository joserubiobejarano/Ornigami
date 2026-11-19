import { readFileSync, openSync, writeFileSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, fork } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import windows from './source-window.cjs';
const fail = () => { throw new Error('Missing, unapproved, malformed or wrong-source execution plan'); };
export function validateSourcePlan(plan, expectedSha, recordPath) {
  if (!plan || plan.sourceSha !== expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha) || plan.seed !== windows.POLICY.seed ||
      Object.keys(plan).sort().join('|') !== 'kind|seed|sourceSha') fail();
  if (plan.kind === 'offline-native-simulation') return { simulated: true };
  if (plan.kind !== 'owner-approved-native' || !recordPath) fail();
  // No approved record is supplied/created by this task. A future owner must
  // provide this immutable instruction for the reviewed clean SHA and policy.
  const bytes = readFileSync(recordPath); const record = JSON.parse(bytes.toString('utf8'));
  if (record.status !== 'APPROVED_FRESH_SOURCE_EXECUTION' || record.sourceSha !== expectedSha ||
      record.authorization !== 'Owner explicitly authorizes one new bounded source transaction' ||
      JSON.stringify(record.policy) !== JSON.stringify(windows.POLICY) || !/^[a-z0-9-]{24,80}$/.test(record.freshRunId ?? '')) fail();
  return { simulated: false, recordDigest: createHash('sha256').update(bytes).digest('hex'), freshRunId: record.freshRunId };
}
export function startSourceApplication({ plan, recordPath = undefined }) {
  const sha = execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim();
  const verdict = validateSourcePlan(plan, sha, recordPath); // before reserve/fork/startup
  if (['.env','.env.local','.env.development','.env.development.local'].some(existsSync)) throw new Error('Trusted source runner requires no dotenv files');
  if (!verdict.simulated) {
    if (execFileSync('git', ['status','--porcelain'], { encoding: 'utf8' }).trim()) fail();
    // A copied record/worktree cannot silently obtain a new claim path.
    const claims = resolve(homedir(), '.local/ornigami-source-execution-claims');
    mkdirSync(claims, { recursive: true, mode: 0o700 });
    const descriptor = openSync(resolve(claims, verdict.freshRunId + '.execution'), 'wx', 0o600);
    try { writeFileSync(descriptor, JSON.stringify({ sourceSha: sha, recordDigest: verdict.recordDigest, policy: windows.POLICY }) + '\n'); }
    finally { closeSync(descriptor); }
  }
  mkdirSync('.local/native-adapter', { recursive: true });
  const preloads = [...(verdict.simulated ? ['scripts/support/native-fixtures.cjs'] : []), 'scripts/support/offline-guard.cjs'];
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', OPENAI_ENABLED: 'false', CAMPAIGN_LAB_GENERATION_PROVIDER: 'local-test',
    ORNIGAMI_BRAND_URL_MODE: verdict.simulated ? 'synthetic' : 'live', ORNIGAMI_BRAND_URL_LIVE: verdict.simulated ? 'false' : 'true',
    AUTH_SECRET: 'native-source-offline-auth-secret', GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic', AUTH_TRUST_HOST: 'true',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3043',
    NODE_OPTIONS: preloads.map(p => '--require=' + JSON.stringify(resolve(p).replaceAll('\\','/'))).join(' '),
    ORNIGAMI_OFFLINE_LOG: resolve('.local/native-adapter/server-guard.jsonl'), ORNIGAMI_NATIVE_TRACE: resolve('.local/native-adapter/native-seams.jsonl') };
  const child = fork('scripts/support/native-app-server.mjs', [sha, verdict.simulated ? 'simulation' : 'approved-native'], { env, stdio: ['ignore','inherit','inherit','ipc'] });
  child.on('message', message => {
    if (message?.type === 'prepared-closed') {
      const checked = validateSourcePlan(plan, sha, recordPath);
      if (checked.recordDigest !== verdict.recordDigest) { child.kill(); return; }
      child.send({ type: 'trusted-source-plan', plan, recordPath, recordDigest: verdict.recordDigest, freshRunId: verdict.freshRunId });
    }
  });
  return child;
}
