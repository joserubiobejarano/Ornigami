/* Trusted Node qualification boundary, loaded before Next and in its children.
 * This is not a firewall or a native-addon/process sandbox. */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const http2 = require('node:http2');
const dgram = require('node:dgram');
const child = require('node:child_process');
const { promisify } = require('node:util');
const sourceWindow = require('./source-window.cjs');
const { syncBuiltinESMExports } = require('node:module');
const log = (event) => {
  if (process.env.ORNIGAMI_OFFLINE_LOG) fs.appendFileSync(process.env.ORNIGAMI_OFFLINE_LOG,
    JSON.stringify({ time: new Date().toISOString(), pid: process.pid, ppid: process.ppid, ...event }) + '\n');
};
const allowed = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase());
const check = (boundary, host) => {
  if (allowed(host)) return;
  log({ event: 'denied', boundary, host: String(host) });
  const error = new Error(`Offline qualification denied ${boundary}: ${host}`);
  error.code = 'ORNIGAMI_OFFLINE';
  throw error;
};
for (const api of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const key of Object.getOwnPropertyNames(api)) {
    if (!/^(lookup|resolve|reverse)/.test(key) || typeof api[key] !== 'function') continue;
    const original = api[key];
    api[key] = function(host, ...args) {
      if (!allowed(host) && api === dns.promises && key === 'lookup' && args[0]?.all === true && sourceWindow.current()) {
        return sourceWindow.current().route('dns', { host });
      }
      check('dns.' + key, host); return original.call(this, host, ...args);
    };
  }
}
const h2connect = http2.connect;
http2.connect = function(authority, ...args) { check('http2.connect', new URL(authority).hostname); return h2connect.call(this, authority, ...args); };
const udpConnect = dgram.Socket.prototype.connect;
dgram.Socket.prototype.connect = function(port, address, ...args) { check('udp.connect', address ?? 'localhost'); return udpConnect.call(this, port, address, ...args); };
// Datagram overloads are deliberately refused: qualification needs no UDP.
dgram.Socket.prototype.send = function() { check('udp.send', 'UDP disabled'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = normalized[0];
  if (options.path && process.platform === 'win32' && !String(options.path).toLowerCase().startsWith('\\\\.\\pipe\\')) {
    check('ipc.connect', 'Nonlocal Windows pipe');
  }
  if (!options.path && !allowed(options.host ?? 'localhost') && sourceWindow.current()?.canDelegateTcp()) sourceWindow.current().route('tcp.connect', options);
  else if (!options.path) check('tcp.connect', options.host ?? 'localhost');
  log({ event: 'connect', host: options.path ? 'IPC' : options.host ?? 'localhost' });
  return connect.apply(this, args);
};
const secure = tls.connect;
tls.connect = function(...args) {
  const options = typeof args[0] === 'object' ? args[0] : typeof args[1] === 'object' ? args[1] : { host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (!allowed(options.host) && sourceWindow.current()) return sourceWindow.current().route('tls.connect', options);
  if (!options.path) check('tls.connect', options.host ?? options.servername ?? 'localhost');
  return secure.apply(this, args);
};
for (const api of [http, https]) {
  for (const key of ['request', 'get']) {
    const original = api[key];
    api[key] = function(input, ...args) {
      const options = typeof input === 'string' || input instanceof URL ? new URL(input) : input;
      const host = options?.hostname ?? options?.host ?? 'localhost';
      const agent = args[0]?.agent ?? options?.agent;
      // App-owned fixture HTTP is parsed through Node using an injected Duplex,
      // not an OS connection. DNS/TCP/TLS guards still apply to its connector.
      const synthetic = process.env.ORNIGAMI_BRAND_URL_MODE === 'synthetic' &&
        host === 'brand-url.example' && agent && Object.hasOwn(agent, 'createConnection');
      const permit = !allowed(host) && !synthetic && api === https && key === 'request' ? sourceWindow.current() : null;
      if (permit) {
        const settings = args[0] ?? {};
        // The protected reader's URL remains authoritative; no request-option
        // override may move a permitted GET to another destination.
        const protectedOptions = Object.keys(settings).sort().join('|') === 'agent|headers|joinDuplicateHeaders|maxHeaderSize|method';
        const protectedHeaders = Object.keys(settings.headers ?? {}).sort().join('|') === 'Accept-Encoding|Connection|Host';
        if (!(input instanceof URL) || !protectedOptions || !protectedHeaders || settings.headers.Host !== input.host ||
            settings.headers['Accept-Encoding'] !== 'identity' || settings.headers.Connection !== 'close' ||
            settings.maxHeaderSize !== 16384 || settings.joinDuplicateHeaders !== false) check('source-options', host);
        permit.route('https.request', { url: input.href, method: settings.method, injectedAgent: agent && Object.hasOwn(agent, 'createConnection') });
      } else if (synthetic) log({ event: 'synthetic-stream', host });
      else check(api === http ? 'http.' + key : 'https.' + key, host);
      const request = original.call(this, input, ...args);
      if (permit) request.prependOnceListener('response', response => {
        try { permit.response(response); } catch (error) { response.destroy(error); request.destroy(error); }
      });
      return request;
    };
  }
}
const fetch = globalThis.fetch;
globalThis.fetch = function(input, ...args) {
  try {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    // Node's local data/blob fetch implementation does not resolve or connect.
    if (!['data:', 'blob:'].includes(url.protocol)) check('fetch:' + url.protocol, url.hostname);
  }
  catch (error) { return Promise.reject(error); }
  return fetch.call(this, input, ...args);
};
// Preserve the preload even when a trusted build script constructs a small env.
const inherit = options => ({ ...options, env: { ...(options?.env ?? process.env),
  NODE_OPTIONS: process.env.NODE_OPTIONS, ORNIGAMI_OFFLINE_LOG: process.env.ORNIGAMI_OFFLINE_LOG } });
for (const key of ['spawn', 'spawnSync', 'execFileSync', 'fork']) {
  const original = child[key];
  child[key] = function(file, args, options, ...rest) {
    if (!Array.isArray(args)) {
      if (args != null && typeof args !== 'object') return original.call(this, file, args, options, ...rest);
      options = args ?? options; args = [];
    }
    if (options != null && (typeof options !== 'object' || Array.isArray(options))) return original.call(this, file, args, options, ...rest);
    log({ event: 'child', method: key, file });
    return original.call(this, file, args, inherit(options), ...rest);
  };
}
const execFile = child.execFile;
child.execFile = function(file, args, options, callback) {
  if (args != null && !Array.isArray(args) && typeof args === 'object' && options != null && typeof options !== 'function') return execFile.apply(this, arguments);
  if (Array.isArray(args)) {
    if (typeof options === 'function') { callback = options; options = undefined; }
  } else if (typeof args === 'function') {
    callback = args; args = []; options = undefined;
  } else if (args == null || typeof args === 'object') {
    if (typeof options === 'function') callback = options;
    options = args ?? (typeof options === 'function' ? undefined : options); args = [];
  } else return execFile.apply(this, arguments); // Node retains invalid-argument errors.
  if (options != null && (typeof options !== 'object' || Array.isArray(options))) return execFile.apply(this, arguments);
  log({ event: 'child', method: 'execFile', file });
  return execFile.call(this, file, args, inherit(options), callback);
};
Object.defineProperty(child.execFile, promisify.custom, { value: function(...args) {
  const { promise, resolve, reject } = Promise.withResolvers();
  promise.child = child.execFile(...args, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
      else resolve({ stdout, stderr });
  });
  return promise;
} });
syncBuiltinESMExports();
log({ event: 'initialized', preload: __filename, sourceWindow: 'closed', nativeBackendAvailable: true });
