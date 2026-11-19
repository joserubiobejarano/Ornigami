import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { discoverHtmlResources } from '../../src/lib/campaign-lab/brand-import/html-discovery.ts';
import { ResourceReadError } from '../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import type { PublicResource, ResourceReadOptions } from '../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import type { SuppliedBrandResource } from '../../src/lib/campaign-lab/brand-import/evidence-types.ts';

export const POLICY = Object.freeze({
  seeds: ['https://example.com/', 'https://www.iana.org/'] as readonly string[],
  maxCalls: 4, maxBytes: 256 * 1024, totalBytes: 1024 * 1024, timeoutMs: 30_000,
  maxRedirects: 0,
});

export async function claimExecution(directory: URL) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const marker = await open(new URL('EXECUTION_RESERVED', directory), 'wx', 0o600);
  try {
    await marker.writeFile('One bounded execution reserved. Do not retry under this task authorization.\n');
    await marker.sync();
  } finally { await marker.close(); }
}

export function allowed(raw: string, css = false): string | null {
  if (raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password
      || !['example.com', 'www.iana.org'].includes(url.hostname)) return null;
    // A deliberately narrower directly linked CSS subset. No media/font URLs.
    if (css && !url.pathname.toLowerCase().endsWith('.css')) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

type Read = (url: string, options: ResourceReadOptions) => Promise<PublicResource>;
export type Entry = {
  index: number; kind: 'html' | 'css'; requestedUrl: string;
  finalUrl: string | null; reservedBytes: number; returnedBytes: number | null;
  sha256: string | null; status: number | null; mediaType: string | null;
  outcome: string; elapsedMs: number;
};
export type Ledger = {
  phase: 'running' | 'finished'; startedAt: string; elapsedMs: number;
  calls: number; reservedBytes: number; returnedBytes: number;
  stop: string; genuineReadCount: number; supportedResources: number;
  entries: Entry[];
};
export type Dependencies = {
  read: Read;
  now: () => number;
  schedule: (callback: () => void, ms: number) => () => void;
  save: (ledger: Ledger, resource?: SuppliedBrandResource) => Promise<void>;
  observe?: (index: number) => () => void;
  signal?: AbortSignal;
};

/** Trusted command plumbing only. Test dependencies never come from CLI/input. */
export async function runQualification(deps: Dependencies) {
  const start = deps.now(); const deadline = start + POLICY.timeoutMs;
  const controller = new AbortController();
  const abort = () => controller.abort('CANCELLED');
  if (deps.signal?.aborted) abort(); else deps.signal?.addEventListener('abort', abort, { once: true });
  const clear = deps.schedule(() => controller.abort('DEADLINE'), POLICY.timeoutMs);
  const resources: SuppliedBrandResource[] = [];
  const ledger: Ledger = { phase: 'running', startedAt: new Date().toISOString(), elapsedMs: 0,
    calls: 0, reservedBytes: 0, returnedBytes: 0, stop: 'COMPLETE', genuineReadCount: 0,
    supportedResources: 0, entries: [] };
  const queue = POLICY.seeds.map(url => ({ url, kind: 'html' as 'html' | 'css' }));
  const seen = new Set(POLICY.seeds);
  const stopped = () => {
    if (!controller.signal.aborted && deps.now() >= deadline) controller.abort('DEADLINE');
    if (controller.signal.aborted) { ledger.stop = controller.signal.reason === 'DEADLINE' ? 'DEADLINE' : 'CANCELLED'; return true; }
    return false;
  };
  try {
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (stopped()) break;
      if (ledger.calls >= POLICY.maxCalls || ledger.reservedBytes + POLICY.maxBytes > POLICY.totalBytes) {
        ledger.stop = 'ALLOWANCE_EXHAUSTED'; break;
      }
      const target = queue[cursor];
      const url = allowed(target.url, target.kind === 'css');
      if (!url) throw new Error('Internal allowlist invariant');
      const entry: Entry = { index: ledger.calls, kind: target.kind, requestedUrl: url,
        finalUrl: null, reservedBytes: POLICY.maxBytes, returnedBytes: null, sha256: null,
        status: null, mediaType: null, outcome: 'RESERVED', elapsedMs: 0 };
      ledger.calls++; ledger.reservedBytes += POLICY.maxBytes; ledger.entries.push(entry);
      // Durably reserve before invoking the reader. Never refund failure reservations.
      await deps.save(ledger);
      if (stopped()) { entry.outcome = ledger.stop; break; }
      const readStart = deps.now();
      const unobserve = deps.observe?.(entry.index);
      let response: PublicResource | undefined;
      try {
        response = await deps.read(url, { maxBytes: POLICY.maxBytes, maxRedirects: 0,
          timeoutMs: Math.max(1, Math.min(POLICY.timeoutMs, Math.ceil(deadline - deps.now()))),
          deadline, signal: controller.signal });
        if (response.body.byteLength > POLICY.maxBytes || response.requestedUrl !== url || response.finalUrl !== url) {
          throw new Error('Reader violated byte/no-follow contract');
        }
        entry.finalUrl = response.finalUrl; entry.status = response.status;
        entry.mediaType = response.contentType;
        entry.returnedBytes = response.body.byteLength;
        entry.sha256 = createHash('sha256').update(response.body).digest('hex');
        ledger.returnedBytes += response.body.byteLength;
        ledger.genuineReadCount++;
        const mime = response.contentType?.split(';')[0].trim().toLowerCase();
        const supported = response.status >= 200 && response.status < 300
          && (target.kind === 'html' ? ['text/html', 'application/xhtml+xml'].includes(mime ?? '') : mime === 'text/css');
        entry.outcome = supported ? 'SUPPORTED' : 'UNSUPPORTED_RESPONSE';
        const resource: SuppliedBrandResource = { ...response, kind: target.kind };
        // Save even unsupported bytes privately. Only supported text reaches collection.
        await deps.save(ledger, resource);
        if (stopped()) { entry.outcome = ledger.stop; break; }
        if ([401, 403, 407, 429, 451].includes(response.status)) { ledger.stop = 'ACCESS_RESTRICTED'; break; }
        if (supported) {
          resources.push(resource); ledger.supportedResources++;
          if (target.kind === 'html') {
            const discovered = discoverHtmlResources(Buffer.from(response.body).toString('utf8'), url, 256);
            for (const item of discovered.resources) {
              if (queue.length >= POLICY.maxCalls) break;
              if (item.kind !== 'css') continue;
              const css = allowed(item.url, true);
              if (!css || seen.has(css)) continue;
              seen.add(css); queue.push({ url: css, kind: 'css' });
            }
          }
        }
      } catch (error) {
        entry.outcome = stopped() ? ledger.stop : error instanceof ResourceReadError ? error.code : 'COMMAND_FAILED';
        if (['DNS_FAILED', 'NETWORK_FAILED', 'BLOCKED_DESTINATION', 'DEADLINE', 'CANCELLED', 'COMMAND_FAILED'].includes(entry.outcome)) {
          ledger.stop = entry.outcome; break;
        }
      } finally {
        unobserve?.(); entry.elapsedMs = Math.max(0, deps.now() - readStart);
        ledger.elapsedMs = Math.max(0, deps.now() - start);
        await deps.save(ledger);
      }
    }
  } finally {
    clear(); deps.signal?.removeEventListener('abort', abort);
    ledger.phase = 'finished'; ledger.elapsedMs = Math.max(0, deps.now() - start);
    await deps.save(ledger);
  }
  return { ledger, resources };
}

export function preflight() {
  return { mode: 'dry-run; no network', targets: POLICY.seeds, method: 'GET', port: 443,
    maxCalls: POLICY.maxCalls, maxBytes: POLICY.maxBytes, totalBytes: POLICY.totalBytes,
    timeoutMs: POLICY.timeoutMs, maxRedirects: 0, retries: 0,
    optionalReads: 'at most two directly linked .css URLs on the same exact allowlist',
    runtime: { node: process.version, openssl: process.versions.openssl, platform: process.platform, arch: process.arch } };
}
