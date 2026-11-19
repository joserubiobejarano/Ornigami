// Qualification/build-only guard. No production import uses this preload.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node --require preloads are intentionally CommonJS.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0] : args;
  const options = first[0];
  const host = typeof options === 'object' ? options.host : typeof first[1] === 'string' ? first[1] : 'localhost';
  const pipe = typeof options === 'object' ? options.path : typeof options === 'string' && !/^\d+$/.test(options);
  if (!pipe && host && !['localhost','127.0.0.1','::1'].includes(host)) {
    const error = new Error('External network disabled for typography qualification');
    error.code = 'QUALIFICATION_OFFLINE';
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return original.apply(this, args);
};
