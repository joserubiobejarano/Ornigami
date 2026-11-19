import { Duplex } from "node:stream";
import type { Socket } from "node:net";
import { createPublicResourceReader, type ResourceTransport, type ResourceClock } from "../../../src/lib/campaign-lab/brand-import/public-resource-fetch.ts";

export function response(body: string | Uint8Array, type = "text/html", status = 200, headers = "") {
  const bytes = Buffer.from(body);
  return Buffer.concat([Buffer.from(`HTTP/1.1 ${status} Fixture\r\nContent-Type: ${type}\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n${headers}\r\n`), bytes]);
}
export const redirect = (location: string) => response("", "text/plain", 302, `Location: ${location}\r\n`);
export class OfflineSocket extends Duplex {
  connecting = false;
  encrypted = true;
  wire = "";
  sent = false;
  readonly reply: Buffer | null;
  readonly onWrite?: (socket: OfflineSocket) => void;
  constructor(reply: Buffer | null, onWrite?: (socket: OfflineSocket) => void) {
    super(); this.reply = reply; this.onWrite = onWrite;
  }
  _read() {}
  _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.wire += chunk.toString(); callback();
    if (this.sent || !this.wire.includes("\r\n\r\n")) return;
    this.sent = true;
    queueMicrotask(() => {
      this.onWrite?.(this);
      if (this.destroyed || !this.reply) return;
      this.push(this.reply); this.push(null);
    });
  }
}
/** Injects only DNS and sockets. Real Node HTTP/Agent/parser and collector run. */
export function offlineFixture(replies: (Buffer | null)[], options: {
  resolve?: ResourceTransport["resolve"]; clock?: ResourceClock;
  onWrite?: (socket: OfflineSocket, index: number) => void;
} = {}) {
  const sockets: OfflineSocket[] = [];
  const hosts: string[] = [];
  const signals: AbortSignal[] = [];
  const addresses: string[] = [];
  const connect = (host: string) => {
    addresses.push(host);
    const index = sockets.length;
    const socket = new OfflineSocket(replies[index] ?? null, s => options.onWrite?.(s, index));
    sockets.push(socket);
    return socket as unknown as Socket;
  };
  const read = createPublicResourceReader({
    resolve: async (host, signal) => {
      hosts.push(host); signals.push(signal);
      return options.resolve ? options.resolve(host, signal) : [{ address: "93.184.216.34", family: 4 }];
    },
    connectTls: o => connect(o.host!),
    connectTcp: o => connect("host" in o ? o.host! : "unexpected"),
  }, options.clock);
  return { read, sockets, hosts, signals, addresses };
}

export function sequencedClock() {
  let now = 0;
  const timers = new Set<{ due: number; callback: () => void }>();
  const clock: ResourceClock = { now: () => now, schedule: (callback, ms) => {
    const timer = { due: now + ms, callback }; timers.add(timer); return () => { timers.delete(timer); };
  } };
  return { clock, timers, advance(ms: number) {
    now += ms;
    for (const timer of [...timers]) if (timer.due <= now) { timers.delete(timer); timer.callback(); }
  } };
}

export const integrationHtml = `<title>Paper &amp; Ink</title><meta name="theme-color" content="#123456">
<link rel="stylesheet" href="theme.png"><link rel="stylesheet" href="theme.png#same">
<link rel="notstylesheet" href="ignored.css"><link rel="iconic" href="ignored.png">
<img src="photo.css" type="image/svg+xml"><img src="photo.css#duplicate">
<link rel="stylesheet" href="https://cdn.synthetic.example/blocked.css">
<script><img src="script.png"></script><p>Fictional paper, unapproved claims.</p>`;

export function exampleFixture(photo: Uint8Array) {
  return offlineFixture([redirect("/brand/home"), response(integrationHtml),
    response("body { color: #111; background: #fff; }", "text/css"), response(photo, "image/png")], {
    resolve: async host => [{ address: host === "cdn.synthetic.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }],
  });
}
