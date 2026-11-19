import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Duplex } from 'node:stream';
import { connect, createSecureContext, TLSSocket } from 'node:tls';
import type { ConnectionOptions } from 'node:tls';
import type { Socket } from 'node:net';
import { getEventListeners } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import { createPublicResourceReader } from '../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';
import type { ResourceClock, ResourceTransport } from '../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts';

export const pem = (name: string) => readFileSync(new URL(`../fixtures/brand-tls/${name}.pem`, import.meta.url));
export function gate<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// No net.Socket, DNS, listen, port or network is used by the wire itself.
class Wire extends Duplex {
  peer!: Wire;
  first = gate();
  held = false;
  pending: Buffer[] = [];
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    this.first.resolve();
    if (this.held) this.pending.push(Buffer.from(chunk));
    else if (!this.peer.destroyed) this.peer.push(Buffer.from(chunk));
    done();
  }
  release() {
    this.held = false;
    for (const chunk of this.pending.splice(0)) if (!this.peer.destroyed) this.peer.push(chunk);
  }
  _final(done: () => void) { if (!this.peer.destroyed) this.peer.push(null); done(); }
  _destroy(_error: Error | null, done: (error?: Error | null) => void) {
    this.pending.length = 0;
    // Real TCP would propagate closure; the isolated pair owns equivalent teardown.
    if (!this.peer.destroyed) this.peer.destroy();
    done();
  }
}

export type Peer = {
  cert?: string;
  hold?: boolean;
  reply?: string;
  respond?: (socket: TLSSocket | Wire) => void;
};
export type Attempt = {
  options: ConnectionOptions;
  clientWire: Wire;
  serverWire: Wire;
  client: TLSSocket | Wire;
  server: TLSSocket | Wire;
  sni: string[];
  requests: string[];
  clientErrors: string[];
  serverErrors: string[];
  secure: boolean;
  protocol: string | null;
  requested: ReturnType<typeof gate<void>>;
  handshaken: ReturnType<typeof gate<void>>;
};
export function fixture(peers: Peer[], clock?: ResourceClock, privateDns = false) {
  const attempts: Attempt[] = [];
  const signals: AbortSignal[] = [];
  const lookups: string[] = [];
  const connected = gate<Attempt>();
  function attach(options: ConnectionOptions, secure: boolean): Socket {
    const peer = peers[attempts.length];
    assert.ok(peer, 'unexpected extra connection');
    const a = new Wire(); const b = new Wire(); a.peer = b; b.peer = a;
    a.held = peer.hold ?? false;
    const sni: string[] = [];
    const cert = peer.cert ?? 'origin';
    const context = secure ? createSecureContext({ key: pem(`${cert}.key`), cert: pem(`${cert}.cert`) }) : undefined;
    const server = secure ? new TLSSocket(b, {
      isServer: true, secureContext: context, ALPNProtocols: ['http/1.1'],
      SNICallback: (hostname, done) => { sni.push(hostname); done(null, context); },
    }) : b;
    // Preserve all reader options, including its identity callback and verification.
    // socket replaces only the physical connection; CA is local to this client.
    const client = secure ? connect({ ...options, socket: a, ca: pem('trusted-ca.cert') }) : a;
    const attempt: Attempt = { options, clientWire: a, serverWire: b, client, server,
      sni, requests: [], clientErrors: [], serverErrors: [], secure: false, protocol: null,
      requested: gate(), handshaken: gate() };
    attempts.push(attempt);
    client.on('error', (error: NodeJS.ErrnoException) => attempt.clientErrors.push(error.code ?? error.name));
    server.on('error', (error: NodeJS.ErrnoException) => attempt.serverErrors.push(error.code ?? error.name));
    if (secure) (client as TLSSocket).once('secureConnect', () => {
      attempt.secure = true;
      attempt.protocol = (client as TLSSocket).getProtocol();
      attempt.handshaken.resolve();
    });
    let request = '';
    server.on('data', (chunk: Buffer) => {
      request += chunk.toString('latin1');
      if (!request.includes('\r\n\r\n') || attempt.requests.length) return;
      attempt.requests.push(request);
      attempt.requested.resolve();
      if (peer.respond) peer.respond(server);
      else if (peer.reply) server.end(peer.reply);
    });
    // Pair closure tears down the server engine as well, without a fixture timeout.
    b.once('close', () => server.destroy());
    connected.resolve(attempt);
    return client as unknown as Socket;
  }
  const transport: ResourceTransport = {
    resolve: async (host, signal) => {
      lookups.push(host); signals.push(signal);
      return [{ address: privateDns ? '10.0.0.1' : '93.184.216.34', family: 4 }];
    },
    connectTls: (options) => attach(options, true),
    connectTcp: (options) => attach(options as ConnectionOptions, false),
  };
  return { attempts, signals, lookups, connected, read: createPublicResourceReader(transport, clock) };
}

export async function cleaned(f: ReturnType<typeof fixture>, external?: AbortSignal) {
  // Drain deferred destroy/close/error events, never wait a guessed duration.
  await turn(); await turn();
  for (const a of f.attempts) {
    assert.ok(a.client.destroyed, 'reader client closed');
    assert.ok(a.clientWire.destroyed, 'underlying client wire closed');
    assert.ok(a.serverWire.destroyed, 'paired wire closed');
    assert.ok(a.server.destroyed, 'server engine closed');
    assert.equal(a.clientWire.pending.length, 0);
  }
  for (const signal of [...f.signals, ...(external ? [external] : [])]) {
    assert.equal(getEventListeners(signal, 'abort').length, 0, 'abort listeners released');
  }
}

export function manualClock() {
  let callback: (() => void) | undefined;
  let active = false;
  let now = 0;
  let scheduled = -1;
  return {
    now: () => now,
    schedule(fn: () => void, ms: number) { callback = fn; active = true; scheduled = ms; return () => { active = false; }; },
    expire() { assert.ok(active); now = scheduled; callback!(); },
    get active() { return active; },
    get scheduled() { return scheduled; },
  };
}
