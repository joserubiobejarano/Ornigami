/* eslint-disable @typescript-eslint/no-require-imports */
const { createSourceController, POLICY } = require('./source-window.cjs');
const { createNativeBackend } = require('./native-backend.cjs');
const KEY = Symbol.for('ornigami.qualified-source-bridge/1');
function nativeSourceControl(controller) {
  return {
    resolve: (host, signal) => controller.route('dns', { host, signal }),
    connectTls: options => require('node:tls').connect(options),
    read: (raw, options, perform) => controller.read(raw, options, perform),
  };
}
function installNativeBridge({ isPublicAddress, simulated, audit = event => { void event; } }) {
  if (globalThis[KEY]) throw new Error('Source bridge already installed');
  let controller;
  const bridge = Object.freeze({
    simulated,
    async run(url, signal, operation) {
      if (!controller || url !== POLICY.seed) throw new Error('Trusted source authority closed or wrong seed');
      try {
        return await controller.transaction(() => operation(nativeSourceControl(controller)), signal);
      } finally { audit({ event: 'transaction-finished', ...controller.snapshot() }); }
    },
  });
  Object.defineProperty(globalThis, KEY, { value: bridge, configurable: false });
  return Object.freeze({
    arm() {
      if (controller) throw new Error('One source allowance only');
      controller = createSourceController({ backend: createNativeBackend(), isPublicAddress });
      audit({ event: 'armed-closed-until-API', ...controller.snapshot() });
    },
    snapshot: () => controller?.snapshot() ?? { open: false, used: false, reason: 'unarmed' },
  });
}
module.exports = { installNativeBridge, nativeSourceControl };
