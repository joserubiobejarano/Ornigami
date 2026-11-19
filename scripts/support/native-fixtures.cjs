/* eslint-disable @typescript-eslint/no-require-imports */
// Physical-call instrumentation. Must be preloaded BEFORE offline-guard.
// Loopback remains real; every external physical path is intercepted/refused.
const dns = require('node:dns');
const tls = require('node:tls');
const net = require('node:net');
const { Duplex } = require('node:stream');
const { readFileSync, appendFileSync } = require('node:fs');
const bytes = JSON.parse(readFileSync(require('node:path').resolve('tests/fixtures/native-source.json'), 'utf8'));
const realLookup = dns.lookup, realPromiseLookup = dns.promises.lookup;
const realTls = tls.connect, realConnect = net.Socket.prototype.connect;
const stats = { dns: [], tls: [], tcp: [], wire: [], dnsCancelled: 0, forbidden: 0, externalOSCalls: 0 };
let scenario = {};
let tlsEngine;
const waiting = new WeakMap();
const local = host => ['localhost','127.0.0.1','::1',undefined].includes(host);
const record = (kind, entry) => {
  stats[kind].push(entry);
  if (process.env.ORNIGAMI_NATIVE_TRACE) appendFileSync(process.env.ORNIGAMI_NATIVE_TRACE, JSON.stringify({ pid: process.pid, kind, ...entry }) + '\n');
};
for (const family of [4,6]) dns.promises.Resolver.prototype['resolve' + family] = function(host) {
  if (host !== 'www.iana.org') { stats.forbidden++; throw new Error('Physical DNS refused'); }
  record('dns', { host, family, physical: 'instrumented' });
  if (scenario.dnsError) return Promise.reject(Object.assign(new Error('Fixture DNS error'), { code: 'ESERVFAIL' }));
  if (scenario.dnsHold) return new Promise((_resolve, reject) => {
    const list = waiting.get(this) ?? []; list.push(reject); waiting.set(this, list);
  });
  return Promise.resolve(family === 4 ? scenario.addresses ?? ['93.184.216.34'] : scenario.ipv6 ?? []);
};
const realCancel = dns.promises.Resolver.prototype.cancel;
dns.promises.Resolver.prototype.cancel = function() {
  if (waiting.get(this)?.length) stats.dnsCancelled++;
  for (const reject of waiting.get(this) ?? []) reject(Object.assign(new Error('Fixture DNS cancelled'), { code: 'ECANCELLED' }));
  waiting.delete(this); return realCancel.call(this);
};
dns.lookup = function(host, ...args) { if (!local(host)) { stats.forbidden++; throw new Error('Physical lookup refused'); } return realLookup.call(this, host, ...args); };
dns.promises.lookup = function(host, ...args) { if (!local(host)) { stats.forbidden++; throw new Error('Physical lookup refused'); } return realPromiseLookup.call(this, host, ...args); };
class SourceStream extends Duplex {
  connecting = false; encrypted = true; request = ''; sent = false;
  _read() {}
  _write(chunk, _encoding, done) {
    this.request += chunk.toString(); done();
    if (this.sent || !this.request.includes('\r\n\r\n')) return;
    this.sent = true;
    const path = /^GET (\S+) HTTP/.exec(this.request)?.[1];
    record('wire', { path, host: /\r\nHost: ([^\r]+)/i.exec(this.request)?.[1], simulated: true });
    if (scenario.hold) return;
    const body = scenario.body ?? (path === '/' ? bytes.html : bytes.css);
    const headers = scenario.redirect ? `HTTP/1.1 302 Fixture\r\nLocation: ${scenario.redirect}\r\nContent-Length: 0\r\n\r\n` :
      `HTTP/1.1 200 Fixture\r\nContent-Type: ${scenario.mime ?? (path === '/' ? 'text/html' : 'text/css')}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;
    queueMicrotask(() => { if (!this.destroyed) { this.push(Buffer.from(headers)); this.push(null); } });
  }
}
net.Socket.prototype.connect = function(...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = normalized[0];
  if (options.path || local(options.host)) return realConnect.apply(this, args);
  record('tcp', { host: options.host, family: options.family, port: options.port, physical: 'instrumented-no-OS' });
  if (!(this instanceof SourceStream)) { stats.forbidden++; throw new Error('External physical socket refused'); }
  return this;
};
tls.connect = function(options, ...args) {
  if (local(options?.host)) return realTls.call(this, options, ...args);
  record('tls', { host: options.host, family: options.family, port: options.port, servername: options.servername,
    rejectUnauthorized: options.rejectUnauthorized, identityCheck: typeof options.checkServerIdentity === 'function', alpn: options.ALPNProtocols, physical: tlsEngine ? 'in-memory TLS engine' : 'instrumented-no-OS' });
  if (scenario.tlsError) throw new Error('Fixture native TLS failure');
  if (tlsEngine) return tlsEngine(options);
  return net.Socket.prototype.connect.call(new SourceStream(), { host: options.host, family: options.family, port: options.port });
};
Object.defineProperty(globalThis, Symbol.for('ornigami.native-physical-fixtures/1'), { value: Object.freeze({
  resolve4: dns.promises.Resolver.prototype.resolve4, resolve6: dns.promises.Resolver.prototype.resolve6, connectTls: tls.connect,
}) });
module.exports = { stats, configure: value => { scenario = value; }, setTlsEngine: value => { tlsEngine = value; },
  inMemoryConnect(options) { if (!(options.socket instanceof Duplex)) throw new Error('In-memory wire required'); return realTls(options); } };
