import type { ConnectionOptions } from 'node:tls';
import type { Socket } from 'node:net';
import type { BrandResourceReader } from './brand-import/import-brand.ts';
import { createPublicResourceReader, type Destination, type ResourceReadOptions } from './brand-import/public-resource-fetch.ts';

// Installed only by the trusted qualification server over private parent IPC.
// The route bundle deliberately does not import the preload's controller: its
// functions retain the same module/AsyncLocalStorage instance as the guard.
export const SOURCE_BRIDGE_KEY = Symbol.for('ornigami.qualified-source-bridge/1');
export interface SourceControl {
  resolve(host: string, signal: AbortSignal): Promise<readonly Destination[]>;
  connectTls(options: ConnectionOptions): Socket;
  read(url: string, options: ResourceReadOptions, operation: (bounded: ResourceReadOptions) => ReturnType<BrandResourceReader>): ReturnType<BrandResourceReader>;
}
export interface SourceBridge {
  readonly simulated: boolean;
  run<T>(url: string, signal: AbortSignal, operation: (control: SourceControl) => Promise<T>): Promise<T>;
}
export function registeredSourceBridge(): SourceBridge | undefined {
  return (globalThis as typeof globalThis & { [SOURCE_BRIDGE_KEY]?: SourceBridge })[SOURCE_BRIDGE_KEY];
}
export function bridgeReader(control: SourceControl): BrandResourceReader {
  const protectedRead = createPublicResourceReader({
    resolve: (host, signal) => control.resolve(host, signal),
    connectTls: options => control.connectTls(options),
    connectTcp: () => { throw new Error('Source bridge requires HTTPS'); },
  });
  return (url, options) => control.read(url, options, bounded => protectedRead(url, bounded));
}
