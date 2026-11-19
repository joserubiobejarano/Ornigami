/* Trusted qualification control only. No environment/body field can arm it.
 * This implementation routes admitted DNS/TLS to mandatory synthetic seams;
 * it has no live backend. HTTP still uses Node's real parser over that stream. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
const POLICY = Object.freeze({ seed: 'https://www.iana.org/', host: 'www.iana.org', port: 443,
  method: 'GET', gets: 4, bytes: 1048576, deadlineMs: 10000, transactions: 1, media: ['text/html', 'text/css'] });
function denied(message) { const error = new Error('Source window denied: ' + message); error.code = 'SOURCE_WINDOW_DENIED'; return error; }
function sourceUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname !== POLICY.host || url.port || url.username || url.password || url.hash) throw denied('URL');
  return url;
}
function createSourceController({ synthetic, isPublicAddress, clock = { now: () => performance.now(), schedule: (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); } } }) {
  if (!synthetic || typeof synthetic.resolve !== 'function' || typeof synthetic.connectTls !== 'function' || typeof isPublicAddress !== 'function') throw denied('synthetic transport and validator required');
  let used = false, open = false, activeRead = false, gets = 0, charged = 0, expires = 0, reason = 'startup';
  const abort = new AbortController(), trace = [];
  const close = why => { if (open) { open = false; reason = why; trace.push({ event: 'closed', reason }); abort.abort(denied(why)); } };
  const check = () => { if (open && clock.now() >= expires) close('deadline'); if (!open) throw denied(reason); };
  const snapshot = () => ({ open, used, gets, charged, reason, trace: [...trace] });
  const controller = {
    snapshot, cancel: () => close('cancelled'),
    async transaction(operation, signal) {
      if (used) throw denied('transaction consumed');
      used = true; open = true; reason = 'source'; expires = clock.now() + POLICY.deadlineMs;
      trace.push({ event: 'opened', synthetic: true });
      const cancel = () => close('cancelled');
      const clear = clock.schedule(() => close('deadline'), POLICY.deadlineMs);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      try { check(); return await scope.run({ controller, read: null }, () => operation(abort.signal)); }
      finally { close('completed'); clear(); signal?.removeEventListener('abort', cancel); }
    },
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
        return Promise.resolve(synthetic.resolve(details.host, abort.signal)).then(addresses => {
          check();
          if (!addresses.length || addresses.length > 64 || addresses.some(a => !isPublicAddress(a.address))) return reject('address');
          read.addresses = addresses; read.phase = 'bound';
          trace.push({ event: 'resolved', host: details.host, addresses, synthetic: true });
          return addresses;
        });
      }
      if (boundary === 'https.request') {
        const url = sourceUrl(details.url);
        if (read.phase !== 'bound' || url.href !== read.url || details.method !== 'GET' || !details.injectedAgent || gets >= POLICY.gets) return reject('GET scope');
        gets++; read.phase = 'connect'; trace.push({ event: 'GET', url: url.href, admission: gets, synthetic: true });
        return true;
      }
      if (boundary === 'tls.connect') {
        if (read.phase !== 'connect' || !read.addresses.some(a => a.address === details.host && a.family === details.family) ||
            details.port !== 443 || details.servername !== POLICY.host || details.rejectUnauthorized !== true || typeof details.checkServerIdentity !== 'function' ||
            JSON.stringify(details.ALPNProtocols) !== '["http/1.1"]') return reject('bound TLS');
        read.phase = 'response'; trace.push({ event: 'TLS', address: details.host, synthetic: true });
        return synthetic.connectTls(details);
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
