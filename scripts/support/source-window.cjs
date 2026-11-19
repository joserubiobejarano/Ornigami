/* Trusted qualification control only. No environment/body field can arm it.
 * Backend identity is explicit. Captured native functions still require an
 * owned, validated phase; no environment or HTTP field opens this scope. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { AsyncLocalStorage } = require('node:async_hooks');
const net = require('node:net');
const native = require('./native-backend.cjs');
const scope = new AsyncLocalStorage();
const POLICY = Object.freeze({ seed: 'https://www.iana.org/', host: 'www.iana.org', port: 443,
  method: 'GET', gets: 4, bytes: 1048576, deadlineMs: 10000, transactions: 1, media: ['text/html', 'text/css'] });
function denied(message) { const error = new Error('Source window denied: ' + message); error.code = 'SOURCE_WINDOW_DENIED'; return error; }
function sourceUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== POLICY.host || url.port || url.username || url.password || url.hash) throw denied('URL');
  return url;
}
/** @param {{synthetic?: object, backend?: object, isPublicAddress: (address:string)=>boolean, clock?: {now():number, schedule(fn:()=>void, ms:number):()=>void}}} configuration */
function createSourceController({ synthetic, backend = synthetic && { ...synthetic, kind: 'synthetic' }, isPublicAddress, clock = { now: () => performance.now(), schedule: (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); } } }) {
  if (!backend || !['synthetic','native'].includes(backend.kind) || typeof backend.resolve !== 'function' || typeof backend.connectTls !== 'function' || typeof isPublicAddress !== 'function' || (backend.kind === 'native' && !native.isNativeBackend(backend))) throw denied('identified backend and validator required');
  const simulated = backend.kind === 'synthetic';
  let used = false, open = false, activeRead = false, gets = 0, charged = 0, expires = 0, reason = 'startup';
  const abort = new AbortController(), trace = [];
  const close = why => { if (open) { open = false; reason = why; trace.push({ event: 'closed', reason }); abort.abort(denied(why)); } };
  const check = () => { if (open && clock.now() >= expires) close('deadline'); if (!open) throw denied(reason); };
  const snapshot = () => ({ open, used, gets, charged, reason, backend: backend.kind, nativeCalls: backend.snapshot?.(), trace: [...trace] });
  const controller = {
    snapshot, cancel: () => close('cancelled'),
    async transaction(operation, signal) {
      if (used) throw denied('transaction consumed');
      used = true; open = true; reason = 'source'; expires = clock.now() + POLICY.deadlineMs;
      trace.push({ event: 'opened', backend: backend.kind });
      const cancel = () => close('cancelled');
      const clear = clock.schedule(() => close('deadline'), POLICY.deadlineMs);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      try { check(); return await scope.run({ controller, read: null }, () => operation(abort.signal)); }
      finally { close('completed'); clear(); signal?.removeEventListener('abort', cancel); }
    },
    authorizeNative(candidate, boundary, details) {
      check(); const read = scope.getStore()?.read;
      if (candidate !== backend || !native.isNativeBackend(candidate) || !read ||
          (boundary === 'dns' ? read.phase !== 'resolving' || details.host !== POLICY.host :
            read.phase !== 'native-tcp' || details.host !== read.binding?.host || details.port !== 443)) throw denied('native delegation');
    },
    canDelegateTcp() { return backend.kind === 'native' && scope.getStore()?.read?.phase === 'native-tcp'; },
    async read(raw, options, operation) {
      check();
      if (scope.getStore()?.controller !== controller || scope.getStore()?.read || activeRead) throw denied('unowned/nested/concurrent read');
      const url = sourceUrl(raw);
      if (gets === 0 && url.href !== POLICY.seed) throw denied('seed');
      if (gets >= POLICY.gets || charged >= POLICY.bytes) { close('budget'); throw denied('budget'); }
      const reserve = options.maxBytes;
      if (!Number.isSafeInteger(reserve) || reserve < 1 || reserve > POLICY.bytes - charged) { close('byte-budget'); throw denied('reservation'); }
      charged += reserve;
      activeRead = true;
      const cancelRead = () => close('cancelled');
      options.signal?.addEventListener('abort', cancelRead, { once: true });
      if (options.signal?.aborted) cancelRead();
      const read = { url: url.href, phase: 'resolve', addresses: [], kind: gets === 0 ? 'text/html' : 'text/css' };
      try {
        const result = await scope.run({ controller, read }, () => operation({ ...options,
          signal: options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal,
          timeoutMs: Math.min(options.timeoutMs ?? POLICY.deadlineMs, Math.max(1, Math.floor(expires - clock.now()))),
          deadline: Math.min(options.deadline ?? Infinity, expires) }));
        check();
        if (result.body.byteLength > reserve || result.contentType?.split(';')[0].trim().toLowerCase() !== read.kind) throw denied('entity/media');
        charged -= reserve - result.body.byteLength;
        return result;
      } finally {
        read.phase = 'closed';
        activeRead = false;
        options.signal?.removeEventListener('abort', cancelRead);
        if (gets >= POLICY.gets || charged >= POLICY.bytes) close('budget');
      }
    },
    // Called exclusively by the installed guard, never an application route.
    route(boundary, details) {
      check(); const read = scope.getStore()?.read;
      if (!read || read.phase === 'closed') throw denied('no reader');
      const reject = why => { trace.push({ event: 'rejected', boundary, why }); throw denied(why); };
      if (boundary === 'dns') {
        if (details.host !== POLICY.host || read.phase !== 'resolve' || gets >= POLICY.gets) return reject('DNS scope');
        read.phase = 'resolving';
        return Promise.resolve(backend.resolve(details.host, abort.signal)).then(addresses => {
          check();
          if (!addresses.length || addresses.length > 64 || addresses.some(a => !isPublicAddress(a.address) || net.isIP(a.address) !== a.family)) return reject('address');
          read.addresses = addresses.map(a => Object.freeze({ ...a })); read.phase = 'bound';
          trace.push({ event: 'resolved', host: details.host, addresses: read.addresses, synthetic: simulated });
          return read.addresses;
        });
      }
      if (boundary === 'https.request') {
        const url = sourceUrl(details.url);
        if (read.phase !== 'bound' || url.href !== read.url || details.method !== 'GET' || !details.injectedAgent || gets >= POLICY.gets) return reject('GET scope');
        gets++; read.phase = 'connect'; trace.push({ event: 'GET-admitted', url: url.href, admission: gets, synthetic: simulated });
        return true;
      }
      if (boundary === 'tls.connect') {
        if (read.phase !== 'connect' || !read.addresses.some(a => a.address === details.host && a.family === details.family) ||
            details.port !== 443 || details.servername !== POLICY.host || details.rejectUnauthorized !== true || typeof details.checkServerIdentity !== 'function' ||
            JSON.stringify(details.ALPNProtocols) !== '["http/1.1"]') return reject('bound TLS');
        read.binding = { host: details.host, family: details.family, used: false };
        read.phase = simulated ? 'response' : 'native-tcp';
        trace.push({ event: 'TLS-admitted', address: details.host, synthetic: simulated });
        try { return backend.connectTls(details); }
        finally { read.phase = 'response'; read.binding = null; }
      }
      if (boundary === 'tcp.connect') {
        if (backend.kind !== 'native' || read.phase !== 'native-tcp' || read.binding?.used || details.host !== read.binding?.host || details.family !== read.binding?.family || Number(details.port) !== 443 || details.path) return reject('native TCP binding');
        read.binding.used = true; trace.push({ event: 'TCP-delegated', address: details.host }); return true;
      }
      return reject('unsupported boundary');
    },
    response(response) {
      check(); const read = scope.getStore()?.read;
      if (!read || read.phase !== 'response') throw denied('response scope');
      if ([301,302,303,307,308].includes(response.statusCode)) {
        read.url = sourceUrl(new URL(response.headers.location, read.url).href).href;
        read.phase = 'resolve';
      } else if (response.headers['content-type']?.split(';')[0].trim().toLowerCase() !== read.kind) {
        close('media'); throw denied('HTML/CSS only');
      }
    },
  };
  return controller;
}
const current = () => scope.getStore()?.controller;
module.exports = { POLICY, createSourceController, current };
