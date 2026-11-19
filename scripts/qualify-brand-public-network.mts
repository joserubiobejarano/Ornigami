import { open, writeFile } from 'node:fs/promises';
import { channel } from 'node:diagnostics_channel';
import { platform, release, version, hostname } from 'node:os';
import { TLSSocket } from 'node:tls';
import { setImmediate as turn } from 'node:timers/promises';
import { readPublicResource } from '../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import { collectBrandKitDraft } from '../src/lib/campaign-lab/brand-import/brand-evidence.ts';
import { claimExecution, preflight, runQualification } from './support/brand-public-network.mts';

// No user-selected destinations, evidence locations, limits or test dependencies.
const args = process.argv.slice(2);
if (args.length !== 1 || !['--dry-run', '--execute'].includes(args[0])) {
  console.error('Usage: node --experimental-strip-types scripts/qualify-brand-public-network.mts --dry-run|--execute');
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({ ...preflight(), mode: args[0] === '--execute' ? 'execute preflight' : preflight().mode }));
  if (args[0] === '--execute') await execute();
}

async function execute() {
  const directory = new URL('../.local/brand-public-network-20261119/', import.meta.url);
  try {
    // Persistent one-shot marker. Never delete automatically, including on failure.
    await claimExecution(directory);
  } catch {
    console.error('Execution refused: private evidence reservation exists or cannot be created. No request started.');
    process.exitCode = 2; return;
  }
  const connectionEvidence: Record<string, unknown>[] = [];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    await writeFile(new URL('machine.json', directory), JSON.stringify({
      node: process.version, openssl: process.versions.openssl, platform: platform(), release: release(),
      osVersion: version(), hostname: hostname(), executable: process.execPath,
    }, null, 2), { mode: 0o600 });
    const result = await runQualification({
      read: readPublicResource, now: () => performance.now(), signal: controller.signal,
      schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
      save: async (ledger, resource) => {
        const file = await open(new URL('ledger.json', directory), 'w', 0o600);
        try { await file.writeFile(JSON.stringify(ledger, null, 2)); await file.sync(); } finally { await file.close(); }
        if (resource) await writeFile(new URL(`body-${ledger.calls - 1}.bin`, directory), resource.body, { mode: 0o600 });
      },
      observe: (index) => {
        const events = channel('net.client.socket');
        const listener = (message: unknown) => {
          const socket = (message as { socket: TLSSocket }).socket;
          const evidence: Record<string, unknown> = { index, tlsSocket: socket instanceof TLSSocket, connected: false, secure: false, closed: false };
          connectionEvidence.push(evidence);
          socket.once('connect', () => Object.assign(evidence, { connected: true,
            remoteAddress: socket.remoteAddress, remotePort: socket.remotePort,
            remoteFamily: socket.remoteFamily, localAddress: socket.localAddress }));
          socket.once('secureConnect', () => {
            const cert = socket.getPeerCertificate();
            Object.assign(evidence, { secure: true, authorized: socket.authorized,
              servername: (socket as TLSSocket & { servername?: string }).servername ?? null,
              protocol: socket.getProtocol(), alpn: socket.alpnProtocol,
              cipher: socket.getCipher(), certificateSha256: cert.fingerprint256,
              certificateSubject: cert.subject, certificateIssuer: cert.issuer,
              certificateSAN: cert.subjectaltname, validFrom: cert.valid_from, validTo: cert.valid_to });
          });
          socket.once('close', (hadError) => Object.assign(evidence, { closed: true, hadError }));
        };
        events.subscribe(listener);
        return () => events.unsubscribe(listener);
      },
    });
    await turn();
    await writeFile(new URL('connections.json', directory), JSON.stringify(connectionEvidence, null, 2), { mode: 0o600 });
    if (result.resources.length) {
      const draft = await collectBrandKitDraft(result.resources);
      await writeFile(new URL('unreviewed-draft.json', directory), JSON.stringify(draft, null, 2), { mode: 0o600 });
    }
    const sanitized = {
      mode: 'executed', stop: result.ledger.stop, calls: result.ledger.calls,
      reservedBytes: result.ledger.reservedBytes, returnedBytes: result.ledger.returnedBytes,
      elapsedMs: Math.round(result.ledger.elapsedMs),
      qualification: result.resources.length ? 'observed protected text read; bounded qualification only' : 'BLOCKED_OR_FAILED; no supported text read',
      entries: result.ledger.entries.map(entry => ({ index: entry.index, kind: entry.kind,
        host: new URL(entry.requestedUrl).hostname, outcome: entry.outcome, status: entry.status,
        returnedBytes: entry.returnedBytes, sha256: entry.sha256, elapsedMs: Math.round(entry.elapsedMs),
        tls: connectionEvidence.filter(item => item.index === entry.index).map(item => ({
          connected: item.connected, secure: item.secure, authorized: item.authorized ?? null,
          protocol: item.protocol ?? null, closed: item.closed,
        })) })),
    };
    await writeFile(new URL('sanitized-summary.json', directory), JSON.stringify(sanitized, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(sanitized));
    if (!result.resources.length || result.ledger.stop !== 'COMPLETE') process.exitCode = 1;
  } catch {
    await writeFile(new URL('command-failure.json', directory), JSON.stringify({ outcome: 'COMMAND_FAILED', retryAuthorized: false }), { mode: 0o600 }).catch(() => {});
    console.error('Qualification command failed. Preserve private evidence; do not retry.');
    process.exitCode = 1;
  } finally {
    await turn();
    await writeFile(new URL('connections.json', directory), JSON.stringify(connectionEvidence, null, 2), { mode: 0o600 }).catch(() => {});
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}
