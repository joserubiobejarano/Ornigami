import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { getEventListeners } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ResourceReadError } from '../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import { allowed, claimExecution, POLICY, preflight, runQualification } from '../scripts/support/brand-public-network.mts';
import type { Dependencies, Ledger } from '../scripts/support/brand-public-network.mts';
import { gate } from './support/brand-tls.mts';

function harness(read?: Dependencies['read']) {
  let now = 0; let timer: (() => void) | undefined; let timerActive = false;
  const calls: { url: string; options: Parameters<Dependencies['read']>[1] }[] = [];
  const saved: Ledger[] = [];
  const bodies: Uint8Array[] = [];
  const deps: Dependencies = {
    now: () => now,
    schedule: (callback, ms) => { assert.equal(ms, 30_000); timer = callback; timerActive = true; return () => { timerActive = false; }; },
    save: async (ledger, resource) => { saved.push(structuredClone(ledger)); if (resource) bodies.push(resource.body); },
    read: async (url, options) => {
      assert.equal(saved.at(-1)?.entries.at(-1)?.outcome, 'RESERVED', 'reservation persisted before request');
      calls.push({ url, options });
      return read ? read(url, options) : { requestedUrl: url, finalUrl: url, status: 200, contentType: 'text/html', body: Buffer.from('<title>PUBLIC SYNTHETIC</title>') };
    },
  };
  return { deps, calls, saved, bodies, advance(ms: number) { now += ms; },
    expire() { now = 30_000; timer!(); }, get active() { return timerActive; } };
}

test('exact HTTPS/443 allowlist and narrow CSS subset', () => {
  for (const value of ['https://example.com/', 'https://www.iana.org/', 'https://example.com:443/']) assert.ok(allowed(value));
  for (const value of ['http://example.com/', 'https://example.com:444/', 'https://example.com./',
    'https://u:p@example.com/', 'https://example.com.evil.test/', 'https://iana.org/',
    'https://93.184.216.34/', 'https://localhost/', 'https://www.example.com/', 'file:///x', 'garbage']) assert.equal(allowed(value), null, value);
  for (const suffix of ['.png', '.jpg', '.svg', '.woff', '.woff2', '.ttf', '.css.png']) assert.equal(allowed(`https://example.com/x${suffix}`, true), null);
  assert.equal(allowed('https://example.com/a.css#x', true), 'https://example.com/a.css');
});

test('dry-run and invalid CLI never create execution evidence or contact a network', () => {
  assert.equal(preflight().mode, 'dry-run; no network');
  for (const arg of ['--dry-run', '--unknown']) {
    // Offline child traps fail any reader DNS query or TCP connection.
    const source = `import { channel } from 'node:diagnostics_channel'; import { Resolver } from 'node:dns/promises'; const forbidden = () => { throw new Error('NETWORK FORBIDDEN'); }; Resolver.prototype.resolve4 = forbidden; Resolver.prototype.resolve6 = forbidden; channel('net.client.socket').subscribe(forbidden); process.argv = ['node', 'scripts/qualify-brand-public-network.mts', ${JSON.stringify(arg)}]; await import('./scripts/qualify-brand-public-network.mts');`;
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', source], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, arg === '--dry-run' ? 0 : 2, child.stderr);
    assert.doesNotMatch(child.stderr, /NETWORK FORBIDDEN/);
    if (arg === '--dry-run') assert.deepEqual(JSON.parse(child.stdout).targets, POLICY.seeds);
  }
});

test('persistent exclusive reservation permits one execution, including concurrent attempts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ornigami-public-network-offline-'));
  try {
    const directory = pathToFileURL(temp + '/');
    const results = await Promise.allSettled([claimExecution(directory), claimExecution(directory)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    await assert.rejects(claimExecution(directory), { code: 'EEXIST' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('only two seeds and two directly linked allowlisted CSS reads; no recursion/media or hidden calls', async () => {
  const html = '<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css"><link rel="stylesheet" href="/c.css"><link rel="stylesheet" href="https://third.example/a.css"><link rel="stylesheet" href="/font.woff2"><img src="/image.png"><link rel="icon" href="/favicon.ico">';
  const h = harness(async (url) => ({ requestedUrl: url, finalUrl: url, status: 200,
    contentType: url.endsWith('.css') ? 'text/css' : 'text/html',
    body: Buffer.from(url.endsWith('.css') ? '@import "/hidden.css"; body{color:#123456}' : html) }));
  const { ledger, resources } = await runQualification(h.deps);
  assert.deepEqual(h.calls.map(call => call.url), [...POLICY.seeds, 'https://example.com/a.css', 'https://example.com/b.css']);
  assert.equal(ledger.calls, 4); assert.equal(ledger.reservedBytes, 1024 * 1024);
  assert.ok(ledger.returnedBytes < ledger.reservedBytes); assert.equal(resources.length, 4);
  assert.ok(resources.every(resource => resource.kind !== 'raster'));
  for (const call of h.calls) {
    assert.equal(call.options.maxBytes, 256 * 1024); assert.equal(call.options.maxRedirects, 0);
    assert.equal(call.options.deadline, 30_000);
    assert.equal(call.options.signal, h.calls[0].options.signal);
  }
  assert.equal(h.active, false);
});

test('failed reads consume reservation; redirects are recorded without follow or retry', async () => {
  const h = harness(async () => { throw new ResourceReadError('REDIRECT_LIMIT'); });
  const { ledger, resources } = await runQualification(h.deps);
  assert.deepEqual(h.calls.map(call => call.url), POLICY.seeds);
  assert.equal(ledger.reservedBytes, 512 * 1024); assert.equal(ledger.returnedBytes, 0);
  assert.ok(ledger.entries.every(entry => entry.outcome === 'REDIRECT_LIMIT' && entry.finalUrl === null && entry.sha256 === null));
  assert.equal(resources.length, 0);
});

test('network/DNS/policy failure stops without trying the second host', async () => {
  for (const code of ['NETWORK_FAILED', 'DNS_FAILED', 'BLOCKED_DESTINATION'] as const) {
    const h = harness(async () => { throw new ResourceReadError(code); });
    const { ledger } = await runQualification(h.deps);
    assert.equal(ledger.stop, code); assert.equal(h.calls.length, 1);
    assert.equal(ledger.reservedBytes, 256 * 1024); assert.equal(ledger.returnedBytes, 0);
    assert.equal(h.active, false);
  }
});

test('access restriction and unsupported media are accurate and never decoded/discovered', async () => {
  for (const status of [401, 403, 407, 429, 451]) {
    const h = harness(async url => ({ requestedUrl: url, finalUrl: url, status, contentType: 'text/html', body: Buffer.from('restriction') }));
    const { ledger, resources } = await runQualification(h.deps);
    assert.equal(h.calls.length, 1); assert.equal(ledger.stop, 'ACCESS_RESTRICTED'); assert.equal(resources.length, 0);
  }
  const h = harness(async url => ({ requestedUrl: url, finalUrl: url, status: 200, contentType: 'image/png', body: Buffer.from('not decoded') }));
  const { ledger, resources } = await runQualification(h.deps);
  assert.equal(h.calls.length, 2); assert.equal(resources.length, 0);
  assert.ok(ledger.entries.every(entry => entry.outcome === 'UNSUPPORTED_RESPONSE'));
});

test('shared absolute deadline reduces later timeout; elapsed reservation save cannot start a late read', async () => {
  const h = harness();
  const original = h.deps.save;
  h.deps.save = async (...args) => { await original(...args); h.advance(10_000); };
  const { ledger } = await runQualification(h.deps);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.timeoutMs, 20_000);
  assert.equal(ledger.stop, 'DEADLINE'); assert.equal(h.active, false);
});

test('one deadline/abort destroys held read via its signal and schedules no more work', async () => {
  for (const deadline of [true, false]) {
    const entered = gate(); const external = new AbortController();
    const h = harness(async (_url, options) => {
      entered.resolve();
      return new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new ResourceReadError('CANCELLED')), { once: true }));
    });
    h.deps.signal = external.signal;
    const work = runQualification(h.deps); await entered.promise;
    if (deadline) h.expire(); else external.abort();
    const { ledger, resources } = await work;
    assert.equal(ledger.stop, deadline ? 'DEADLINE' : 'CANCELLED');
    assert.equal(h.calls.length, 1); assert.equal(resources.length, 0);
    assert.equal(getEventListeners(external.signal, 'abort').length, 0);
    assert.equal(h.active, false);
  }
});

test('oversized or unexpectedly followed response violates contract and stops', async () => {
  for (const follow of [true, false]) {
    const h = harness(async url => ({ requestedUrl: url, finalUrl: follow ? 'https://www.iana.org/other' : url,
      status: 200, contentType: 'text/html', body: new Uint8Array(follow ? 1 : POLICY.maxBytes + 1) }));
    const { ledger } = await runQualification(h.deps);
    assert.equal(ledger.stop, 'COMMAND_FAILED'); assert.equal(h.calls.length, 1);
  }
});
