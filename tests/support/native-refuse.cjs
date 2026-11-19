/* eslint-disable @typescript-eslint/no-require-imports */
// Safe outer seam for the intentionally wrong-order test; no fixture marker.
const stats = { calls: 0 };
const refuse = () => { stats.calls++; throw new Error('Native physical call refused'); };
const dns = require('node:dns');
dns.promises.Resolver.prototype.resolve4 = refuse;
dns.promises.Resolver.prototype.resolve6 = refuse;
require('node:tls').connect = refuse;
require('node:net').Socket.prototype.connect = refuse;
module.exports = stats;
