/* eslint-disable @typescript-eslint/no-require-imports */
// Loaded by the preload BEFORE patching DNS/TLS. Tests replace physical calls
// before this capture; ordinary execution captures the genuine Node functions.
const { Resolver } = require('node:dns/promises');
const tls = require('node:tls');
const resolve4 = Resolver.prototype.resolve4;
const resolve6 = Resolver.prototype.resolve6;
const connectTls = tls.connect;
const registered = new WeakSet();
function createNativeBackend() {
  const calls = { resolve4: 0, resolve6: 0, tls: 0 };
  const authorize = (boundary, details) => {
    const controller = require('./source-window.cjs').current();
    if (!controller) throw new Error('Native source backend has no authority');
    controller.authorizeNative(backend, boundary, details);
  };
  const backend = Object.freeze({
    kind: 'native', snapshot: () => ({ ...calls }),
    async resolve(host, signal) {
      authorize('dns', { host });
      const resolver = new Resolver();
      const cancel = () => resolver.cancel();
      signal.throwIfAborted(); signal.addEventListener('abort', cancel, { once: true });
      const query = async (family, method) => {
        calls[family === 4 ? 'resolve4' : 'resolve6']++;
        try { return (await method.call(resolver, host)).map(address => ({ address, family })); }
        catch (error) { if (['ENODATA','ENOTFOUND'].includes(error.code)) return []; throw error; }
      };
      try { return (await Promise.all([query(4, resolve4), query(6, resolve6)])).flat(); }
      finally { cancel(); signal.removeEventListener('abort', cancel); }
    },
    connectTls(options) {
      authorize('tls', options); calls.tls++;
      // No hostname lookup may replace the validated numeric binding.
      return connectTls({ ...options, lookup: (_host, _options, callback) => callback(null, options.host, options.family) });
    },
  });
  registered.add(backend); return backend;
}
module.exports = { createNativeBackend, isNativeBackend: value => registered.has(value) };
