import { fileURLToPath } from 'node:url';
export default {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  experimental: { sri: { algorithm: 'sha256' }, cpus: 1 },
  crossOrigin: 'anonymous',
  productionBrowserSourceMaps: true,
};
