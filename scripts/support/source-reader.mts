/** Qualification-only adapter. No normal application route imports this file. */
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { createPublicResourceReader } from '../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import type { BrandResourceReader } from '../../src/lib/campaign-lab/brand-import/import-brand.ts';
// CJS controller and installed preload share a single module instance.
import windows from './source-window.cjs';
export function createRehearsalReader(controller: ReturnType<typeof windows.createSourceController>): BrandResourceReader {
  const protectedRead = createPublicResourceReader({
    resolve: (host) => dns.lookup(host, { all: true, verbatim: true }),
    connectTls: options => tls.connect(options),
    connectTcp: () => { throw new Error('HTTPS only'); },
  });
  return (url, options) => controller.read(url, options, (bounded: Parameters<BrandResourceReader>[1]) => protectedRead(url, bounded));
}
