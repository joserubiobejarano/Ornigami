/* eslint-disable @typescript-eslint/no-require-imports */
// Physical fail-safe for the existing in-memory transport/TLS test harness.
// Unlike the application guard, permits CPU-only tls.connect({socket: Wire}).
// No DNS/socket primitive may fall through to the OS, including loopback.
const fs = require('node:fs');
let refused = 0;
const deny = () => { refused++; throw new Error('Test harness forbids physical DNS/socket I/O'); };
const dns = require('node:dns');
for (const key of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns[key] === 'function') dns[key] = deny;
for (const key of Object.keys(dns.promises)) if (/^(lookup|resolve|reverse)/.test(key) && typeof dns.promises[key] === 'function') dns.promises[key] = deny;
for (const key of Object.getOwnPropertyNames(dns.Resolver.prototype)) if (/^(resolve|reverse)/.test(key)) dns.Resolver.prototype[key] = deny;
for (const key of Object.getOwnPropertyNames(dns.promises.Resolver.prototype)) if (/^(resolve|reverse)/.test(key)) dns.promises.Resolver.prototype[key] = deny;
require('node:net').Socket.prototype.connect = deny;
const udp = require('node:dgram').Socket.prototype;
udp.send = deny; udp.connect = deny;
process.on('exit', () => {
  if (process.env.PALETTE_TEST_EGRESS_LOG) fs.appendFileSync(process.env.PALETTE_TEST_EGRESS_LOG, JSON.stringify({pid:process.pid,physicalFallthrough:0,refused})+'\n');
});
