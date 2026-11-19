import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, X509Certificate } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import { setImmediate as turn } from 'node:timers/promises';
import { ResourceReadError } from '../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import { cleaned, fixture, gate, manualClock, pem } from './support/brand-tls.mts';
import type { Attempt } from './support/brand-tls.mts';

const options = { maxBytes: 1024, timeoutMs: 4000 };
const ok = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello';
const redirect = (url: string) => `HTTP/1.1 302 Found\r\nLocation: ${url}\r\nContent-Length: 0\r\n\r\n`;
async function rejected(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ResourceReadError
    && error.code === code && error.message === `Public resource read failed: ${code}`
    && error.cause === undefined);
}
function identity(a: Attempt, host: string) {
  assert.equal(a.options.host, '93.184.216.34');
  assert.equal(a.options.rejectUnauthorized, true);
  assert.equal(typeof a.options.checkServerIdentity, 'function');
  assert.equal(a.options.servername, host);
  assert.deepEqual(a.sni, [host], 'server observed ClientHello SNI');
  assert.equal(a.requests.length, 1);
  assert.match(a.requests[0], new RegExp(`\\r\\nHost: ${host.replaceAll('.', '\\.')}\\r\\n`, 'i'));
  assert.equal(a.secure, true);
  assert.ok(['TLSv1.2', 'TLSv1.3'].includes(a.protocol ?? ''));
  assert.equal((a.client as TLSSocket).authorized, true);
  assert.equal((a.client as TLSSocket).alpnProtocol, 'http/1.1');
}

test('synthetic certificate windows and SAN inventory match qualification assumptions', () => {
  const now = Date.now();
  for (const name of ['trusted-ca', 'unknown-ca', 'origin', 'cdn', 'wrong', 'expired', 'unknown']) {
    const cert = new X509Certificate(pem(`${name}.cert`));
    assert.match(cert.subject, /PUBLIC SYNTHETIC/);
    assert.equal(Date.parse(cert.validFrom), Date.UTC(2020, 0, 1));
    assert.equal(Date.parse(cert.validTo), Date.UTC(name === 'expired' ? 2021 : 2040, 0, 1));
    assert.ok(now > Date.parse(cert.validFrom));
    assert.equal(now < Date.parse(cert.validTo), name !== 'expired', 'run between 2021 and 2040 UTC');
    if (!name.endsWith('-ca')) assert.equal(cert.subjectAltName, `DNS:${name === 'cdn' ? 'cdn' : name === 'wrong' ? 'wrong' : 'brand'}.example`);
  }
});

test('real TLS trusted original hostname, ClientHello SNI, Host, ALPN, bytes and hash', { timeout: 5000 }, async (t) => {
  const clock = manualClock();
  const f = fixture([{ reply: ok }], clock);
  const result = await f.read('https://brand.example./asset#ignored', options);
  assert.equal(result.finalUrl, 'https://brand.example/asset');
  assert.equal(result.requestedUrl, result.finalUrl);
  assert.equal(result.status, 200);
  assert.equal(result.contentType, 'text/plain');
  assert.equal(Buffer.from(result.body).toString(), 'hello');
  assert.equal(createHash('sha256').update(result.body).digest('hex'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  identity(f.attempts[0], 'brand.example');
  t.diagnostic(`authorized=${(f.attempts[0].client as TLSSocket).authorized}; protocol=${f.attempts[0].protocol}; SNI=${f.attempts[0].sni}; Host=brand.example; SHA256 verified`);
  assert.equal(clock.active, false);
  await cleaned(f);
});

for (const [cert, code] of [['wrong', 'ERR_TLS_CERT_ALTNAME_INVALID'], ['unknown', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'], ['expired', 'CERT_HAS_EXPIRED']]) {
  test(`real TLS rejects ${cert} certificate before any HTTP request`, { timeout: 5000 }, async (t) => {
    const f = fixture([{ cert, reply: redirect('https://cdn.example/') }]);
    await rejected(f.read('https://brand.example/', options), 'NETWORK_FAILED');
    assert.equal(f.attempts.length, 1);
    const a = f.attempts[0];
    assert.deepEqual(a.sni, ['brand.example']);
    assert.deepEqual(a.clientErrors, [code]);
    assert.equal(a.secure, false);
    assert.deepEqual(a.requests, []);
    t.diagnostic(`TLS client error=${code}; observed SNI=brand.example; secureConnect=0; HTTP requests=0`);
    await cleaned(f);
  });
}

test('redirect to distinct TLS peer receives fresh DNS, certificate, SNI and Host', { timeout: 5000 }, async () => {
  const f = fixture([{ reply: redirect('https://cdn.example/final') }, { cert: 'cdn', reply: ok }]);
  const result = await f.read('https://brand.example/', options);
  assert.equal(result.finalUrl, 'https://cdn.example/final');
  assert.deepEqual(f.lookups, ['brand.example', 'cdn.example']);
  assert.equal(f.attempts.length, 2);
  identity(f.attempts[0], 'brand.example'); identity(f.attempts[1], 'cdn.example');
  await cleaned(f);
});

test('redirect cannot reuse origin certificate for a differently named TLS peer', { timeout: 5000 }, async () => {
  const f = fixture([{ reply: redirect('https://cdn.example/final') }, { cert: 'origin', reply: ok }]);
  await rejected(f.read('https://brand.example/', options), 'NETWORK_FAILED');
  assert.equal(f.attempts.length, 2);
  identity(f.attempts[0], 'brand.example');
  assert.deepEqual(f.attempts[1].sni, ['cdn.example']);
  assert.deepEqual(f.attempts[1].clientErrors, ['ERR_TLS_CERT_ALTNAME_INVALID']);
  assert.equal(f.attempts[1].requests.length, 0);
  await cleaned(f);
});

for (const mode of ['cancel', 'deadline'] as const) {
  test(`${mode} destroys a held real ClientHello and prevents late completion`, { timeout: 5000 }, async () => {
    const controller = new AbortController(); const clock = manualClock();
    const f = fixture([{ hold: true, reply: ok }], clock);
    const work = f.read('https://brand.example/', { ...options, deadline: 123, signal: controller.signal });
    const rejection = rejected(work, mode === 'cancel' ? 'CANCELLED' : 'DEADLINE');
    const a = await f.connected.promise;
    await a.clientWire.first.promise;
    assert.ok(a.clientWire.pending.reduce((sum, chunk) => sum + chunk.length, 0) > 0);
    assert.equal(a.clientWire.pending[0][0], 22, 'actual TLS handshake record held');
    assert.equal(a.secure, false);
    assert.equal(clock.scheduled, 123, 'absolute deadline caps timeout');
    if (mode === 'cancel') controller.abort(new Error('secret abort reason')); else clock.expire();
    await rejection;
    await cleaned(f, controller.signal);
    a.clientWire.release(); await turn();
    assert.equal(a.secure, false);
    assert.equal(a.requests.length, 0);
    assert.equal(f.attempts.length, 1);
    assert.equal(clock.active, false);
  });
}

test('held handshake socket error and malformed TLS peer reject safely and close', { timeout: 5000 }, async () => {
  for (const malformed of [false, true]) {
    const f = fixture([{ hold: true }]);
    const rejection = rejected(f.read('https://brand.example/', options), 'NETWORK_FAILED');
    const a = await f.connected.promise; await a.clientWire.first.promise;
    if (malformed) a.clientWire.push(Buffer.from('HTTP/1.1 200 Not TLS\r\n\r\n'));
    else a.clientWire.destroy(new Error('sensitive socket failure'));
    await rejection;
    assert.equal(a.secure, false);
    assert.equal(a.requests.length, 0);
    if (malformed) assert.ok(a.clientErrors.some((code) => code.startsWith('ERR_SSL_')));
    await cleaned(f);
  }
});

for (const secure of [false, true]) {
  const scheme = secure ? 'https' : 'http';
  test(`${scheme} streams separate chunked records to success or truncated-body rejection`, { timeout: 5000 }, async () => {
    for (const truncated of [false, true]) {
      const first = gate();
      const f = fixture([{ respond(socket) {
        socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n', () => first.resolve());
      } }]);
      const work = f.read(`${scheme}://brand.example/`, options);
      const rejection = truncated ? rejected(work, 'INVALID_RESPONSE') : undefined;
      await first.promise; await turn();
      const a = f.attempts[0];
      if (truncated) { a.server.end(); await rejection; }
      else {
        a.server.end('3\r\ndef\r\n0\r\n\r\n');
        const result = await work;
        assert.equal(Buffer.from(result.body).toString(), 'abcdef');
      }
      if (secure) identity(a, 'brand.example');
      await cleaned(f);
    }
  });
  test(`${scheme} streamed chunked limit and cancellation destroy active response`, { timeout: 5000 }, async () => {
    for (const cancel of [false, true]) {
      const controller = new AbortController(); const first = gate();
      const f = fixture([{ respond(socket) {
        socket.write('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n', () => first.resolve());
      } }]);
      const rejection = rejected(f.read(`${scheme}://brand.example/`, { ...options, maxBytes: 5, signal: controller.signal }), cancel ? 'CANCELLED' : 'TOO_LARGE');
      await first.promise; await turn();
      const a = f.attempts[0];
      assert.equal(a.requests.length, 1);
      assert.equal(a.client.destroyed, false, 'response still streaming');
      if (cancel) controller.abort(); else a.server.write('3\r\ndef\r\n');
      await rejection;
      await cleaned(f, controller.signal);
      assert.equal(f.attempts.length, 1);
    }
  });
  test(`${scheme} declared body limit rejects before waiting for entity`, { timeout: 5000 }, async () => {
    const f = fixture([{ respond(socket) { socket.write('HTTP/1.1 200 OK\r\nContent-Length: 1025\r\n\r\n'); } }]);
    await rejected(f.read(`${scheme}://brand.example/`, options), 'TOO_LARGE');
    await cleaned(f);
  });
}

test('private direct, DNS and TLS redirect destinations never reach connector', { timeout: 5000 }, async () => {
  const direct = fixture([]);
  await rejected(direct.read('https://127.0.0.1/', options), 'BLOCKED_DESTINATION');
  assert.equal(direct.attempts.length, 0); assert.equal(direct.lookups.length, 0);
  const dns = fixture([], undefined, true);
  await rejected(dns.read('https://brand.example/', options), 'BLOCKED_DESTINATION');
  assert.equal(dns.attempts.length, 0);
  const redirected = fixture([{ reply: redirect('https://169.254.169.254/latest') }]);
  await rejected(redirected.read('https://brand.example/', options), 'BLOCKED_DESTINATION');
  identity(redirected.attempts[0], 'brand.example');
  assert.equal(redirected.attempts.length, 1);
  assert.deepEqual(redirected.lookups, ['brand.example']);
  await cleaned(direct); await cleaned(dns); await cleaned(redirected);
});
