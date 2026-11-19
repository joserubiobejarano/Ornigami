/* eslint-disable @typescript-eslint/no-require-imports */
// First preload in policy/contract tests: an accidental boundary bypass cannot
// reach an OS resolver/connector. This is never used by app qualification.
const state = { calls: 0 };
const refuse = () => { state.calls++; throw new Error('SYNTHETIC_UNDERLYING_REFUSED'); };
require('node:dns').lookup = refuse;
require('node:dns').promises.lookup = refuse;
require('node:tls').connect = refuse;
require('node:net').Socket.prototype.connect = refuse;
module.exports = state;
