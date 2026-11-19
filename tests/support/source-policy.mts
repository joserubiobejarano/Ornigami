import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import type { Socket } from 'node:net';
import * as net from 'node:net';
import * as https from 'node:https';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import windows from '../../scripts/support/source-window.cjs';
import seams from './guard-seams.cjs';
import { createRehearsalReader } from '../../scripts/support/source-reader.mts';
import { isPublicAddress } from '../../src/lib/campaign-lab/brand-import/private-address.ts';
import { createBrandUrlHandler } from '../../src/lib/campaign-lab/brand-url-api.ts';
const checks: { name: string; result: string }[] = [];
const observations: unknown[] = [];
function fixture(options: { media?: string; redirect?: string; delay?: boolean; address?: string } = {}) {
  const seen = { dns: 0, tls: 0, wire: [] as string[], closed: 0 };
  class Stream extends Duplex {
    connecting = false; encrypted = true; wire = ''; sent = false;
    constructor() { super(); this.once('close', () => seen.closed++); }
    _read() {}
    _write(chunk: Buffer, _encoding: string, done: () => void) {
      this.wire += chunk.toString(); done();
      if (this.sent || !this.wire.includes('\r\n\r\n')) return;
      this.sent = true;
      const path = /^GET (\S+) HTTP/.exec(this.wire)?.[1] ?? '';
      seen.wire.push(path);
      if (options.delay) return;
      const html = '<title>SYNTHETIC permit fixture, never IANA evidence</title><style>body{color:#123456}</style>' + ['one','two','three'].map(n => `<link rel="stylesheet" href="/${n}.css">`).join('') + '<img src="/never.png"><script src="/never.js"></script>';
      const body = path === '/' ? html : 'button{background:#6b2340}';
      const response = options.redirect ? `HTTP/1.1 302 Synthetic\r\nLocation: ${options.redirect}\r\nContent-Length: 0\r\n\r\n` : `HTTP/1.1 200 Synthetic\r\nContent-Type: ${options.media ?? (path === '/' ? 'text/html' : 'text/css')}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;
      queueMicrotask(() => { if (!this.destroyed) { this.push(Buffer.from(response)); this.push(null); } });
    }
  }
  const controller = windows.createSourceController({ isPublicAddress, synthetic: {
    resolve: async () => { seen.dns++; return [{ address: options.address ?? '93.184.216.34', family: 4 }]; },
    connectTls: () => { seen.tls++; return new Stream() as unknown as Socket; },
  } });
  return { controller, read: createRehearsalReader(controller), seen };
}
async function check(name: string, operation: () => Promise<void>) { await operation(); checks.push({ name, result: 'PASS' }); }
const request = () => new Request('http://localhost/api/campaign-lab/brand-evidence', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ url: windows.POLICY.seed }) });
await check('closed startup / no worker permission / background denial', async () => {
  const f = fixture(); assert.equal(f.controller.snapshot().open, false);
  assert.throws(() => https.request(windows.POLICY.seed), { code: 'ORNIGAMI_OFFLINE' });
  await f.controller.transaction(async () => {
    assert.throws(() => https.request('https://fonts.googleapis.com/'), { code: 'ORNIGAMI_OFFLINE' });
    assert.throws(() => net.connect(443, '93.184.216.34'), { code: 'ORNIGAMI_OFFLINE' });
    const child = spawnSync(process.execPath, ['-e', "try{require('node:https').request('https://www.iana.org/');process.exit(2)}catch(e){process.exit(e.code==='ORNIGAMI_OFFLINE'?0:3)}"], { env: { SystemRoot: process.env.SystemRoot, NODE_ENV: 'test' }, timeout: 3000 });
    assert.equal(child.status, 0);
  });
  assert.equal(f.seen.dns + f.seen.tls, 0);
});
await check('API input cannot arm authority; production rejects before reader creation', async () => {
  const f = fixture(); let factories = 0;
  const reader = () => { factories++; return f.read; };
  const handler = createBrandUrlHandler({ env: { NODE_ENV: 'development', ORNIGAMI_BRAND_URL_MODE: 'synthetic' }, reader });
  const input = new Request('http://localhost/api/campaign-lab/brand-evidence', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify({ url: windows.POLICY.seed, permit: true }) });
  assert.equal((await handler(input)).status, 400); assert.equal(factories, 0);
  assert.equal((await handler(request())).status, 422); assert.equal(f.controller.snapshot().used, false);
  const unavailable = createBrandUrlHandler({ env: { NODE_ENV: 'production', ORNIGAMI_BRAND_URL_MODE: 'live', ORNIGAMI_BRAND_URL_LIVE: 'true' }, reader });
  factories = 0; assert.equal((await unavailable(request())).status, 404); assert.equal(factories, 0); assert.equal(f.seen.dns + f.seen.tls, 0);
});
await check('existing API + protected reader + four actual synthetic GETs; closed completion / second transaction', async () => {
  const f = fixture();
  const handler = createBrandUrlHandler({ env: { NODE_ENV: 'development', ORNIGAMI_BRAND_URL_MODE: 'synthetic' }, reader: () => f.read });
  const response = await f.controller.transaction(() => handler(request()));
  assert.equal(response.status, 200, JSON.stringify({ body: await response.clone().json(), policy: f.controller.snapshot(), fixture: f.seen }));
  assert.equal((await response.json()).mode, 'synthetic');
  assert.deepEqual(f.seen.wire, ['/', '/one.css', '/two.css', '/three.css']);
  assert.equal(f.controller.snapshot().gets, 4); assert.equal(f.controller.snapshot().open, false);
  assert.equal(f.controller.snapshot().reason, 'budget');
  await assert.rejects(f.controller.transaction(() => handler(request())), /consumed/);
  const before = f.seen.dns; await assert.rejects(f.read(windows.POLICY.seed, { maxBytes: 512 }), /denied/); assert.equal(f.seen.dns, before);
  observations.push({ scenario: 'synthetic API only', ...f.controller.snapshot(), fixture: f.seen });
  const completed = fixture();
  await completed.controller.transaction(() => completed.read(windows.POLICY.seed, { maxBytes: 1024 }));
  assert.equal(completed.controller.snapshot().reason, 'completed'); assert.equal(completed.controller.snapshot().open, false);
  observations.push({ scenario: 'single completed protected read', ...completed.controller.snapshot(), fixture: completed.seen });
});
await check('wrong host / protocol / port / credentials / numeric URL rejected before synthetic DNS', async () => {
  for (const url of ['https://outside.invalid/', 'http://www.iana.org/', 'https://www.iana.org:8443/', 'https://u:p@www.iana.org/', 'https://93.184.216.34/']) {
    const f = fixture(); await assert.rejects(f.controller.transaction(() => f.read(url, { maxBytes: 512 }))); assert.equal(f.seen.dns + f.seen.tls, 0);
  }
});
await check('wrong method and unbound numeric TLS never reach fixture connector', async () => {
  const f = fixture();
  await f.controller.transaction(async () => {
    await assert.rejects(f.controller.read(windows.POLICY.seed, { maxBytes: 512 }, async () => {
      await f.controller.route('dns', { host: 'www.iana.org' });
      assert.throws(() => https.request(new URL(windows.POLICY.seed), { method: 'GET', agent: new https.Agent(), headers: { Host: 'www.iana.org', authorization: 'forbidden' } }), { code: 'ORNIGAMI_OFFLINE' });
      assert.throws(() => f.controller.route('https.request', { url: windows.POLICY.seed, method: 'POST', injectedAgent: true }), /GET scope/);
      f.controller.route('https.request', { url: windows.POLICY.seed, method: 'GET', injectedAgent: true });
      assert.throws(() => f.controller.route('tls.connect', { host: '8.8.8.8', family: 4, port: 443, servername: 'www.iana.org', rejectUnauthorized: true, checkServerIdentity() {}, ALPNProtocols: ['http/1.1'] }), /bound TLS/);
      const bound = { host: '93.184.216.34', family: 4, port: 443, servername: 'www.iana.org', rejectUnauthorized: true, checkServerIdentity() {}, ALPNProtocols: ['http/1.1'] };
      for (const change of [{ port: 80 }, { family: 6 }, { servername: 'outside.invalid' }, { rejectUnauthorized: false }, { checkServerIdentity: null }]) assert.throws(() => f.controller.route('tls.connect', { ...bound, ...change }), /bound TLS/);
      throw new Error('fixture stop');
    }));
  });
  assert.equal(f.seen.tls, 0); observations.push({ scenario: 'rejections', ...f.controller.snapshot() });
});
await check('private DNS / cross-host redirect / wrong media cannot open connector or consume entities', async () => {
  const privateResult = fixture({ address: '127.0.0.1' });
  await assert.rejects(privateResult.controller.transaction(() => privateResult.read(windows.POLICY.seed, { maxBytes: 512 }))); assert.equal(privateResult.seen.tls, 0);
  for (const option of [{ redirect: 'https://outside.invalid/' }, { media: 'image/png' }]) {
    const f = fixture(option); await assert.rejects(f.controller.transaction(() => f.read(windows.POLICY.seed, { maxBytes: 1024 }))); assert.equal(f.seen.tls, 1); assert.equal(f.seen.dns, 1);
  }
});
await check('conservative failed reservation closes byte budget', async () => {
  const f = fixture(); await assert.rejects(f.controller.transaction(() => f.controller.read(windows.POLICY.seed, { maxBytes: 1048576 }, () => { throw new Error('partial failed entity'); })));
  assert.equal(f.controller.snapshot().charged, 1048576); assert.equal(f.controller.snapshot().open, false); assert.equal(f.seen.tls, 0);
});
await check('cancellation destroys pending synthetic stream and closes authority', async () => {
  const f = fixture({ delay: true }); const abort = new AbortController();
  const work = f.controller.transaction(() => f.read(windows.POLICY.seed, { maxBytes: 1024 }), abort.signal);
  setImmediate(() => abort.abort()); await assert.rejects(work);
  await new Promise<void>(done => setImmediate(done)); assert.equal(f.seen.closed, 1);
  assert.equal(f.controller.snapshot().open, false); assert.equal(f.controller.snapshot().reason, 'cancelled');
});
await check('deadline closes permission autonomously, including inherited async continuation', async () => {
  let expire = () => {}; let now = 0;
  const f = windows.createSourceController({ isPublicAddress, synthetic: { resolve: async () => [], connectTls: () => { throw new Error(); } }, clock: { now: () => now, schedule: (fn: () => void) => { expire = fn; return () => {}; } } });
  await f.transaction(async () => { now = 10000; expire(); assert.throws(() => f.route('dns', { host: 'www.iana.org' }), /deadline/); });
  assert.equal(f.snapshot().open, false);
});
assert.equal(seams.calls, 0);
console.log(JSON.stringify({ policy: windows.POLICY, checks, observations, realUnderlyingCalls: seams.calls }, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ policy: windows.POLICY, checks, observations, realUnderlyingCalls: seams.calls }, null, 2));

