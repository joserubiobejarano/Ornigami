import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import { createRequire } from "node:module";

const policy = loadTs<typeof import("../src/lib/sentry-server-events.ts")>("src/lib/sentry-server-events.ts", {});

test("server telemetry admits only fixed operational events and strips inherited data", () => {
  const polluted = { type: undefined, request: { url: 'https://private.test/reset?token=secret' }, user: { email: 'private@example.test' },
    breadcrumbs: [{ message: 'secret' }], contexts: { private: { token: 'secret' } }, extra: { secret: 'secret' } };
  const cron = policy.sanitizeServerEvent({ ...polluted, event_id: 'a'.repeat(32),
    message: 'Scheduled job review_booster needs attention (missed_schedule).',
    tags: { subsystem: 'cron', job: 'review_booster', reason: 'missed_schedule', extra: 'secret' } });
  assert.deepEqual(cron?.tags, { subsystem: 'cron', job: 'review_booster', reason: 'missed_schedule' });
  assert.doesNotMatch(JSON.stringify(cron), /private|secret|request|breadcrumbs|contexts|extra/);
  const server = policy.sanitizeServerEvent({ ...polluted,
    exception: { values: [{ value: 'Ornigami server request failed', stacktrace: { frames: [{ filename: 'secret' }] } }] },
    tags: { error_boundary: 'server', error_digest: '12345', extra: 'secret' } });
  assert.deepEqual(server?.tags, { error_boundary: 'server', error_digest: '12345' });
  assert.doesNotMatch(JSON.stringify(server), /private|secret|stacktrace|breadcrumbs|contexts|extra/);
  assert.equal(policy.sanitizeServerEvent({ ...polluted, message: 'secret error' }), null);
  assert.equal(policy.sanitizeServerEvent({ type: undefined, message: 'Scheduled job private needs attention (failed).',
    tags: { subsystem: 'cron', job: 'private', reason: 'failed' } }), null);
});

test("installed server SDK filters source data and acknowledges explicit request/cron capture", async () => {
  const Sentry = createRequire(import.meta.url)('@sentry/nextjs') as typeof import('@sentry/nextjs');
  const previousDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://public@sentry.invalid/42';
  let options: Parameters<typeof Sentry.init>[0] | undefined;
  const envelopes: unknown[] = []; const updates: string[] = [];
  try {
    loadTs('sentry.server.config.ts', {
      '@sentry/nextjs': { init: (value: Parameters<typeof Sentry.init>[0]) => { options = value; } },
      './src/lib/sentry-options': { SENTRY_OPTIONS: { sendDefaultPii: false } },
      './src/lib/sentry-server-events': policy,
    });
    assert.ok(options);
    Sentry.init({ ...options, sendClientReports: false,
      transport: () => ({ send: async (envelope:unknown) => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
    });
    assert.ok(Sentry.getClient());
    Sentry.setUser({ email: 'private@example.test' });
    Sentry.setContext('private', { secret: 'private-secret' });
    Sentry.captureException(new Error('private automatic exception'));
    await Sentry.flush(2_000);
    assert.equal(envelopes.length, 0);
    const hook = loadTs<typeof import('../src/instrumentation.ts')>('src/instrumentation.ts', { '@sentry/nextjs': Sentry });
    await hook.onRequestError(Object.assign(new Error('private request exception'), { digest:'67890' }));
    const alerts = loadTs<typeof import('../src/lib/cron-alerts.ts')>('src/lib/cron-alerts.ts', {
      '@sentry/nextjs': Sentry, '@/lib/safe-logger': { safeLogger: { error: () => undefined } },
      '@/lib/db/neon': { sql: async (parts:TemplateStringsArray) => {
        const query=parts.join('?');
        if(query.includes('claim_cron_alerts')) return [{ alert_key:'review_booster:missed_schedule', job_name:'review_booster', reason:'missed_schedule' }];
        if(query.includes('UPDATE')) { updates.push(query); return []; }
        return [{ active_count:1, transport_failures:0 }];
      } },
    });
    assert.equal((await alerts.evaluateCronAlerts()).ok, true);
    assert.equal(envelopes.length, 2);
    assert.equal(updates.length, 1);
    assert.match(updates[0]!, /transport_failures = 0/);
    const serialized=JSON.stringify(envelopes);
    assert.match(serialized, /Ornigami server request failed/);
    assert.match(serialized, /Scheduled job review_booster needs attention/);
    assert.match(serialized, /67890/);
    assert.doesNotMatch(serialized, /private|stacktrace|breadcrumbs|contexts/);
  } finally {
    await Sentry.close(2_000);
    if(previousDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN; else process.env.NEXT_PUBLIC_SENTRY_DSN=previousDsn;
  }
});

test("Next server registration initializes the appropriate runtime and request hook never passes source data", async () => {
  const previous = process.env.NEXT_RUNTIME;
  let nodeLoads = 0; let edgeLoads = 0;
  const captures: unknown[] = []; const tags: Record<string,string> = {}; let cleared = false;
  const hook = loadTs<typeof import("../src/instrumentation.ts")>("src/instrumentation.ts", {
    get ['../sentry.server.config']() { nodeLoads += 1; return {}; },
    get ['../sentry.edge.config']() { edgeLoads += 1; return {}; },
    '@sentry/nextjs': {
      withScope: (cb: (scope: unknown) => void) => cb({ clear: () => { cleared = true; },
        setTag: (key:string,value:string) => { tags[key] = value; } }),
      captureException: (error:unknown) => captures.push(error), flush: async () => true,
    },
  });
  try {
    process.env.NEXT_RUNTIME = 'nodejs'; await hook.register();
    process.env.NEXT_RUNTIME = 'edge'; await hook.register();
    assert.ok(nodeLoads > 0); assert.ok(edgeLoads > 0);
    await hook.onRequestError(Object.assign(new Error('private token and query'), { digest: '12345' }));
    assert.equal(cleared, true);
    assert.deepEqual(tags, { error_boundary: 'server', error_digest: '12345' });
    assert.equal((captures[0] as Error).message, 'Ornigami server request failed');
  } finally {
    if(previous === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME=previous;
  }
});
