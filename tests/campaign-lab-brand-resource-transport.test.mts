import assert from "node:assert/strict";
import { test } from "node:test";
import { Duplex } from "node:stream";
import { getEventListeners } from "node:events";
import { setImmediate as turn } from "node:timers/promises";
import type { Socket, NetConnectOpts } from "node:net";
import type { ConnectionOptions, PeerCertificate } from "node:tls";
import { createPublicResourceReader, ResourceReadError, type ResourceTransport, type Destination, type ResourceClock } from "../src/lib/campaign-lab/brand-import/public-resource-fetch.ts";
import { isPublicAddress, isBlockedHostname } from "../src/lib/campaign-lab/brand-import/private-address.ts";

const public4 = { address: "93.184.216.34", family: 4 };
const public6 = { address: "2606:4700:4700::1111", family: 6 };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const ok = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nhello";
const redirect = (location: string) => `HTTP/1.1 302 Found\r\nLocation: ${location}\r\n\r\n`;

// A byte-level socket fixture: Node's real ClientRequest/Agent/parser run.
// No http.request, fetch, agent or lookup function is mocked.
class WireSocket extends Duplex {
  wire = "";
  connecting = false;
  encrypted = true;
  sent = false;
  readonly reply: string | null;
  readonly lag: number;
  beforeReply?: () => void;
  constructor(reply: string | null, lag = 0) { super(); this.reply = reply; this.lag = lag; }
  _read() {}
  _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
    this.wire += chunk.toString();
    callback();
    if (!this.sent && this.wire.includes("\r\n\r\n")) {
      this.sent = true;
      const deliver = () => {
        if (this.destroyed || this.reply === null) return;
        this.beforeReply?.();
        this.push(Buffer.from(this.reply));
        // No FIN for an explicitly unfinished chunked response.
        if (!this.reply.includes("X-Stall: yes")) this.push(null);
      };
      if (this.lag) setTimeout(deliver, this.lag); else queueMicrotask(deliver);
    }
  }
}

function fixture(replies: (string | null)[] = [ok], dns?: ResourceTransport["resolve"], clock?: ResourceClock, beforeReply?: () => void) {
  const sockets: WireSocket[] = [];
  type RecordedOptions = ConnectionOptions & { host?: string; port?: number; family?: number };
  const connections: { secure: boolean; options: RecordedOptions }[] = [];
  const lookups: string[] = [];
  const signals: AbortSignal[] = [];
  let lag = 0;
  const connect = (secure: boolean, options: ConnectionOptions | NetConnectOpts) => {
    connections.push({ secure, options: options as RecordedOptions });
    const socket = new WireSocket(replies[sockets.length] ?? null, lag);
    socket.beforeReply = beforeReply;
    sockets.push(socket);
    return socket as unknown as Socket;
  };
  const transport: ResourceTransport = {
    resolve: async (host, signal) => {
      lookups.push(host); signals.push(signal);
      return dns ? dns(host, signal) : [public4];
    },
    connectTcp: (options) => connect(false, options),
    connectTls: (options) => connect(true, options),
  };
  return { read: createPublicResourceReader(transport, clock), sockets, connections, lookups, signals,
    setLag(ms: number) { lag = ms; } };
}
const options = { maxBytes: 1024, timeoutMs: 500 };
async function rejects(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ResourceReadError
    && error.code === code && error.message === `Public resource read failed: ${code}`);
}
async function cleaned(f: ReturnType<typeof fixture>, external?: AbortSignal) {
  await delay(5);
  assert.ok(f.sockets.every((socket) => socket.destroyed));
  for (const signal of f.signals) assert.equal(getEventListeners(signal, "abort").length, 0);
  if (external) assert.equal(getEventListeners(external, "abort").length, 0);
}

test("conservative address policy rejects private/reserved/mapped/transition ranges", () => {
  const denied = ["", "garbage", "0177.0.0.1", "0x7f.0.0.1", "2130706433", "127.1", "999.1.1.1",
    "0.1.2.3", "10.255.255.255", "100.64.0.0", "100.127.255.255", "127.0.0.1",
    "169.254.169.254", "172.16.0.0", "172.31.255.255", "192.0.0.9", "192.0.2.1",
    "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.255", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "255.255.255.255", "168.63.129.16",
    "::", "::1", "fc00::1", "fd00::1", "fe80::1", "fe80::1%eth0", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:808:808", "::ffff:8.8.8.8",
    "::8.8.8.8", "64:ff9b::808:808", "100::1", "2001::1", "2001:20::1",
    "2001:db8::1", "2002:808:808::1", "3fff::1", "3fff:fff::1", "4000::1"];
  for (const ip of denied) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.0", "100.128.0.0", public4.address, public6.address]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
  for (const host of ["LOCALHOST.", "app.localhost", "local", "printer.local", "db.internal", "home.arpa", "x.home.arpa", "metadata.goog"]) {
    assert.ok(isBlockedHostname(host), host);
  }
});

test("actual agent connector receives pinned IP once; Host/SNI and standard identity policy remain original", async () => {
  let answers = [public4];
  const f = fixture([ok], async () => { const first = answers; answers = [{ address: "127.0.0.1", family: 4 }]; return first; });
  const result = await f.read("https://BRAND.example.:443/a?x=1#fragment", options);
  assert.deepEqual(result, { requestedUrl: "https://brand.example/a?x=1", finalUrl: "https://brand.example/a?x=1",
    status: 200, contentType: "text/plain", body: Buffer.from("hello") });
  assert.deepEqual(f.lookups, ["brand.example"]);
  assert.equal(answers[0].address, "127.0.0.1");
  const c = f.connections[0];
  assert.equal(c.options.host, public4.address);
  assert.equal(c.options.family, 4);
  assert.equal(c.options.port, 443);
  assert.equal(c.options.servername, "brand.example");
  assert.equal(c.options.rejectUnauthorized, true);
  assert.equal(c.options.lookup, undefined);
  assert.deepEqual(c.options.ALPNProtocols, ["http/1.1"]);
  const identity = c.options.checkServerIdentity!;
  assert.equal(identity("ignored", { subjectaltname: "DNS:brand.example" } as PeerCertificate), undefined);
  assert.ok(identity("ignored", { subjectaltname: "DNS:attacker.example" } as PeerCertificate));
  assert.match(f.sockets[0].wire, /^GET \/a\?x=1 HTTP\/1.1\r\nHost: brand.example\r\n/);
  assert.match(f.sockets[0].wire, /Accept-Encoding: identity/i);
  assert.doesNotMatch(f.sockets[0].wire, /Authorization|Cookie|Proxy-Authorization/i);
  await cleaned(f);
});

test("HTTP, IPv6 and IP-literal TLS preserve the correct identity without DNS", async () => {
  for (const [url, ip, secure] of [["http://8.8.8.8:80/x", "8.8.8.8", false],
    ["https://[2606:4700:4700::1111]/", public6.address, true]] as const) {
    const f = fixture();
    await f.read(url, options);
    assert.equal(f.lookups.length, 0);
    assert.equal(f.connections[0].options.host, ip);
    assert.equal(f.connections[0].secure, secure);
    assert.equal(f.connections[0].options.servername, undefined);
    if (secure) {
      const identity = f.connections[0].options.checkServerIdentity!;
      assert.equal(identity("ignored", { subjectaltname: `IP Address:${ip}` } as PeerCertificate), undefined);
      assert.equal(identity("ignored", { subjectaltname: "IP Address:2606:4700:4700:0:0:0:0:1111" } as PeerCertificate), undefined);
      assert.ok(identity("ignored", { subjectaltname: "IP Address:2606:4700:4700::8888" } as PeerCertificate));
      assert.ok(identity("ignored", { subjectaltname: "DNS:brand.example" } as PeerCertificate));
      assert.match(f.sockets[0].wire, /Host: \[2606:4700:4700::1111\]/);
    }
    await cleaned(f);
  }
});

test("invalid URLs and alternate private literal spellings never resolve or connect", async () => {
  for (const url of ["/relative", "file:///etc/passwd", "ftp://brand.example", "https://user:secret@brand.example/",
    "https://brand.example:80", "http://brand.example:443", "https://brand.example:8443", "http://localhost/",
    "http://127.1", "http://0x7f000001", "http://2130706433", "http://0177.0.0.1", "http://169.254.169.254",
    "http://[::ffff:7f00:1]", "http://[::ffff:8.8.8.8]", "http://[fe80::1%25eth0]"]) {
    const f = fixture();
    await assert.rejects(f.read(url, options), ResourceReadError);
    assert.equal(f.connections.length, 0, url);
    assert.equal(f.lookups.length, 0, url);
  }
});

test("all DNS answers are checked: mixed families, malformed and empty results fail closed", async () => {
  for (const addresses of [[public4, { address: "10.0.0.1", family: 4 }], [public4, { address: "::ffff:808:808", family: 6 }],
    [public6, { address: "fe80::1", family: 6 }], [{ address: public4.address, family: 6 }], [], Array(65).fill(public4)]) {
    const f = fixture([ok], async () => addresses);
    await rejects(f.read("https://brand.example", options), "BLOCKED_DESTINATION");
    assert.equal(f.connections.length, 0);
    await cleaned(f);
  }
  const f = fixture([ok], async () => { throw new Error("sensitive resolver details"); });
  await rejects(f.read("http://brand.example", options), "DNS_FAILED");
});

test("redirects validate each target and pin fresh answers, including same hostname", async () => {
  let count = 0;
  const f = fixture([redirect("/next"), redirect("https://cdn.example/final"), ok], async () => [count++ ? public6 : public4]);
  const result = await f.read("https://brand.example", options);
  assert.equal(result.finalUrl, "https://cdn.example/final");
  assert.deepEqual(f.lookups, ["brand.example", "brand.example", "cdn.example"]);
  assert.deepEqual(f.connections.map((c) => c.options.host), [public4.address, public6.address, public6.address]);
  assert.deepEqual(f.connections.map((c) => c.options.servername), ["brand.example", "brand.example", "cdn.example"]);
  await cleaned(f);
  for (const target of ["http://169.254.169.254/latest", "https://u:p@brand.example", "http://brand.example:8080", "file:///etc/passwd"]) {
    const bad = fixture([redirect(target)]);
    await assert.rejects(bad.read("https://brand.example", options), ResourceReadError);
    assert.equal(bad.connections.length, 1);
    await cleaned(bad);
  }
  let lookups = 0;
  const rebound = fixture([redirect("/next")], async () => [lookups++ ? { address: "127.0.0.1", family: 4 } : public4]);
  await rejects(rebound.read("https://brand.example", options), "BLOCKED_DESTINATION");
  assert.equal(rebound.connections.length, 1);
  await cleaned(rebound);
});

test("redirect limit, missing location, encoding and response framing failures clean sockets", async () => {
  for (const [reply, code] of [[redirect("/again"), "REDIRECT_LIMIT"], ["HTTP/1.1 302 Found\r\n\r\n", "INVALID_RESPONSE"],
    ["HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\nx", "UNSUPPORTED_ENCODING"],
    ["HTTP/1.1 200 OK\r\nContent-Encoding: br\r\n\r\nx", "UNSUPPORTED_ENCODING"],
    ["HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\nx", "INVALID_RESPONSE"],
    ["HTTP/1.1 200 OK\r\nContent-Length: nope\r\n\r\nx", "NETWORK_FAILED"],
    ["HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: example\r\n\r\n", "INVALID_RESPONSE"]]) {
    const f = fixture([reply]);
    await rejects(f.read("https://brand.example", { ...options, maxRedirects: 0 }), code);
    await cleaned(f);
  }
});

test("actual parser-stream bytes capped without Content-Length and with chunked encoding", async () => {
  for (const reply of [ok, "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n",
    "HTTP/1.1 200 OK\r\nContent-Length: 999999\r\n\r\nx"]) {
    const f = fixture([reply]);
    await rejects(f.read("http://brand.example", { ...options, maxBytes: 4 }), "TOO_LARGE");
    await cleaned(f);
  }
  const exact = fixture([ok]);
  assert.equal((await exact.read("http://brand.example", { ...options, maxBytes: 5 })).body.length, 5);
  await cleaned(exact);
  // The real Node parser rejects excess bytes as invalid subsequent framing.
  // No reuse/pipelining means they can never become another resource.
  const short = fixture(["HTTP/1.1 200 OK\r\nContent-Length: 1\r\n\r\nxyyyyyyyyy"]);
  await rejects(short.read("http://brand.example", { ...options, maxBytes: 1 }), "NETWORK_FAILED");
  await cleaned(short);
});

test("deadline includes DNS and late resolution never opens a connection", async () => {
  let complete!: (answers: Destination[]) => void;
  const f = fixture([ok], () => new Promise((resolve) => { complete = resolve; }));
  await rejects(f.read("https://brand.example", { ...options, timeoutMs: 15 }), "DEADLINE");
  assert.ok(f.signals[0].aborted);
  complete([public4]);
  await cleaned(f);
  assert.equal(f.connections.length, 0);
});

test("deadline covers entered connector, response headers and body stages", { timeout: 5000 }, async () => {
  for (const stage of ["connector", "headers", "body"]) {
    let expire!: () => void;
    let active = false;
    let now = 0;
    const clock: ResourceClock = {
      now: () => now,
      schedule: (callback, _ms) => {
        active = true;
        expire = callback;
        return () => { active = false; };
      },
    };
    let entered!: () => void;
    const entry = new Promise<void>(resolve => { entered = resolve; });
    const sockets: WireSocket[] = [];
    const signals: AbortSignal[] = [];
    const read = createPublicResourceReader({
      resolve: async (_host, signal) => { signals.push(signal); return [public4]; },
      connectTls: () => {
        const socket = new WireSocket(stage === "body"
          ? "HTTP/1.1 200 OK\r\nX-Stall: yes\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n"
          : null);
        sockets.push(socket);
        if (stage === "connector") {
          socket.connecting = true;
          // A real connecting socket queues writes until connection establishment.
          // Duplex alone would write immediately, so hold them at this stage.
          socket._write = () => {};
          entered();
        } else {
          if (stage === "body") socket.once("data", () => entered());
          const write = socket._write.bind(socket);
          socket._write = (...args) => {
            write(...args);
            if (stage === "headers" && socket.sent) entered();
          };
        }
        return socket as unknown as Socket;
      },
      connectTcp: () => { throw new Error("unexpected TCP"); },
    }, clock);
    const work = rejects(read("https://brand.example", { ...options, timeoutMs: 20 }), "DEADLINE");
    await entry;
    await turn(); // Let ClientRequest/parser enter the stage before delivering the deadline.
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].destroyed, false, stage);
    assert.equal(sockets[0].sent, stage !== "connector");
    assert.equal(active, true);
    now = 20;
    expire();
    await work;
    await turn();
    assert.ok(sockets[0].destroyed);
    assert.equal(active, false);
    assert.equal(getEventListeners(signals[0], "abort").length, 0);
    sockets[0].emit("connect");
    sockets[0].push(null);
    await turn();
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].sent, stage !== "connector");
  }
});

test("real-time deadline smoke cleans any work entered before expiry", async () => {
  const f = fixture([null]);
  await rejects(f.read("https://brand.example", { ...options, timeoutMs: 20 }), "DEADLINE");
  const connectionsAtExpiry = f.connections.length;
  assert.ok(f.signals[0].aborted);
  await cleaned(f);
  assert.equal(f.connections.length, connectionsAtExpiry);
});

test("redirect time does not reset deadline; late response produces no next hop", async () => {
  let now = 0;
  let activeTimers = 0;
  const clock: ResourceClock = { now: () => now, schedule: () => {
    activeTimers++; return () => { activeTimers--; };
  } };
  // Real Node parser events drive the hops. Virtual elapsed time is 40 then 80;
  // deliberate event-loop contention cannot consume the first-hop allowance.
  const advance = () => {
    const until = performance.now() + 15;
    while (performance.now() < until) { /* Controlled contention. */ }
    now += 40;
  };
  const f = fixture([redirect("/next"), redirect("/forbidden-late-hop")], undefined, clock, advance);
  await rejects(f.read("https://brand.example", { ...options, timeoutMs: 65 }), "DEADLINE");
  assert.equal(f.connections.length, 2);
  assert.equal(now, 80);
  await cleaned(f);
  assert.equal(f.connections.length, 2);
  assert.equal(activeTimers, 0);
  now = 0;
  const late = fixture([redirect("/next")], undefined, clock, () => { now = 80; });
  await rejects(late.read("https://brand.example", { ...options, timeoutMs: 65 }), "DEADLINE");
  assert.equal(late.connections.length, 1);
  await cleaned(late);
  assert.equal(activeTimers, 0);
});

test("external cancellation before work, during DNS/connect/body; listener cleanup", async () => {
  const pre = new AbortController(); pre.abort(new Error("secret reason"));
  const before = fixture();
  await rejects(before.read("https://brand.example", { ...options, signal: pre.signal }), "CANCELLED");
  assert.equal(before.lookups.length, 0);
  await cleaned(before, pre.signal);
  const during = new AbortController();
  let complete!: (answers: Destination[]) => void;
  const dns = fixture([ok], () => new Promise((resolve) => { complete = resolve; }));
  const pending = dns.read("https://brand.example", { ...options, signal: during.signal });
  during.abort();
  await rejects(pending, "CANCELLED"); complete([public4]);
  await cleaned(dns, during.signal);
  assert.equal(dns.connections.length, 0);
  for (const reply of [null, "HTTP/1.1 200 OK\r\nX-Stall: yes\r\n\r\nx"]) {
    const controller = new AbortController(); const f = fixture([reply]);
    const pending = f.read("https://brand.example", { ...options, signal: controller.signal });
    await delay(5); controller.abort();
    await rejects(pending, "CANCELLED"); await cleaned(f, controller.signal);
  }
  const controller = new AbortController(); const success = fixture();
  await success.read("https://brand.example", { ...options, signal: controller.signal });
  await cleaned(success, controller.signal);
});

test("connection and parser errors are safe and bounded; invalid options do no work", async () => {
  const f = fixture(["not an HTTP response\r\n\r\n"]);
  await rejects(f.read("https://brand.example", options), "NETWORK_FAILED");
  await cleaned(f);
  const read = createPublicResourceReader({ resolve: async () => [public4],
    connectTcp: () => { throw new Error("secret connection details"); },
    connectTls: () => { throw new Error("secret TLS details"); } });
  await rejects(read("https://brand.example", options), "NETWORK_FAILED");
  for (const change of [{ maxBytes: 0 }, { maxBytes: 9 * 1024 * 1024 }, { timeoutMs: 30001 },
    { timeoutMs: NaN }, { maxRedirects: 6 }, { maxRedirects: -1 }]) {
    const f = fixture();
    await rejects(f.read("https://brand.example", { ...options, ...change }), "INVALID_OPTIONS");
    assert.equal(f.lookups.length, 0);
  }
});

test("incremental chunked overflow destroys the stream before retaining excess bytes", async () => {
  const f = fixture(["HTTP/1.1 200 OK\r\nX-Stall: yes\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n"]);
  const pending = f.read("https://brand.example", { ...options, maxBytes: 5 });
  await delay(5);
  f.sockets[0].push(Buffer.from("3\r\ndef\r\n"));
  await rejects(pending, "TOO_LARGE");
  await cleaned(f);
});

test("oversized headers and duplicate framing fail in Node's bounded parser", async () => {
  for (const wire of ["HTTP/1.1 200 OK\r\nX-Large: " + "x".repeat(17000) + "\r\n\r\n",
    "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\nxx",
    "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"]) {
    const f = fixture([wire]);
    await rejects(f.read("http://brand.example", options), "NETWORK_FAILED");
    await cleaned(f);
  }
});

test("standard redirect statuses and non-success final responses retain structural result", async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const f = fixture([`HTTP/1.1 ${status} Redirect\r\nLocation: /next\r\n\r\n`,
      "HTTP/1.1 404 Missing\r\nContent-Encoding: identity\r\nContent-Length: 0\r\n\r\n"]);
    const result = await f.read("https://brand.example", options);
    assert.equal(result.status, 404);
    assert.equal(result.contentType, null);
    assert.equal(result.body.length, 0);
    assert.match(f.sockets[1].wire, /^GET \/next HTTP\/1.1/);
    await cleaned(f);
  }
});

test("socket errors and late DNS rejection after abort do not escape or connect", async () => {
  const f = fixture([null]);
  const pending = f.read("https://brand.example", options);
  await delay(5);
  f.sockets[0].destroy(new Error("sensitive TLS/socket failure"));
  await rejects(pending, "NETWORK_FAILED");
  await cleaned(f);
  let rejectDns!: (error: Error) => void;
  const late = fixture([ok], () => new Promise((_resolve, reject) => { rejectDns = reject; }));
  await rejects(late.read("https://brand.example", { ...options, timeoutMs: 10 }), "DEADLINE");
  rejectDns(new Error("late DNS failure"));
  await cleaned(late);
  assert.equal(late.connections.length, 0);
});

test("monotonic expiry prevents connect even before the timer gets an event-loop turn", async () => {
  const f = fixture([ok], async () => {
    const until = performance.now() + 10;
    while (performance.now() < until) { /* Deliberately stall the timer queue. */ }
    return [public4];
  });
  await rejects(f.read("https://brand.example", { ...options, timeoutMs: 1 }), "DEADLINE");
  assert.equal(f.connections.length, 0);
  await cleaned(f);
});
