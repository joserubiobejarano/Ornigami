import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { createA10WebhookProxy } from "../scripts/a10-live-webhook-proxy.mjs";

const SIGNED_HEADERS = {
  "content-type": "application/json",
  "svix-id": "msg_test_0123456789",
  "svix-timestamp": "1791111111",
  "svix-signature": "v1,synthetic-signature",
};

async function withHttpServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function exchange(baseUrl: string, options: {
  method?: string;
  path?: string;
  headers?: http.OutgoingHttpHeaders;
  body?: Buffer;
}) {
  const target = new URL(baseUrl);
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = http.request({
      host: target.hostname,
      port: Number(target.port),
      method: options.method || "POST",
      path: options.path || "/api/webhooks/resend",
      agent: false,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

async function rawExchange(baseUrl: string, requestText: string) {
  const target = new URL(baseUrl);
  return new Promise<{ status: number; raw: Buffer }>((resolve, reject) => {
    const socket = net.connect(Number(target.port), "127.0.0.1");
    const chunks: Buffer[] = [];
    socket.on("connect", () => socket.end(requestText));
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("end", () => {
      const raw = Buffer.concat(chunks);
      const match = raw.toString("latin1").match(/^HTTP\/1\.1 (\d{3})/);
      if (!match) reject(new Error("proxy returned no HTTP status line"));
      else resolve({ status: Number(match[1]), raw });
    });
  });
}

async function slowBodyExchange(baseUrl: string, pauseMs: number) {
  const target = new URL(baseUrl);
  return new Promise<{ status: number; raw: Buffer }>((resolve, reject) => {
    const socket = net.connect(Number(target.port), "127.0.0.1");
    const chunks: Buffer[] = [];
    let delayedWrite: NodeJS.Timeout | undefined;
    socket.on("connect", () => {
      socket.write([
        "POST /api/webhooks/resend HTTP/1.1",
        `Host: ${target.host}`,
        "Content-Type: application/json",
        "Svix-ID: msg_test_0123456789",
        "Svix-Timestamp: 1791111111",
        "Svix-Signature: v1,synthetic-signature",
        "Content-Length: 2",
        "Connection: close",
        "",
        "{",
      ].join("\r\n"));
      delayedWrite = setTimeout(() => {
        if (!socket.destroyed) socket.end("}");
      }, pauseMs);
    });
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => { if (delayedWrite) clearTimeout(delayedWrite); });
    socket.on("end", () => {
      const raw = Buffer.concat(chunks);
      const match = raw.toString("latin1").match(/^HTTP\/1\.1 (\d{3})/);
      if (!match) reject(new Error("proxy returned no HTTP status line"));
      else resolve({ status: Number(match[1]), raw });
    });
  });
}

function readRequest(request: http.IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

test("proxy validates a loopback app target and itself binds only to loopback", async () => {
  const app = await withHttpServer((_request, response) => response.end("ok"));
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    assert.equal(new URL(proxy.url).hostname, "127.0.0.1");
    for (const appBaseUrl of [
      "http://localhost:3000",
      "http://192.168.1.10:3000",
      "https://127.0.0.1:3000",
      "http://127.0.0.1",
      "http://127.0.0.1:3000/api/webhooks/resend",
      "http://127.0.0.1:3000/?secret=value",
      "http://user:pass@127.0.0.1:3000",
    ]) {
      await assert.rejects(createA10WebhookProxy({ appBaseUrl }));
    }
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("only exact POST webhook path reaches the app", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const cases = [
      { method: "GET", path: "/api/webhooks/resend", expected: 405 },
      { method: "POST", path: "/api/webhooks/resend?x=1", expected: 404 },
      { method: "POST", path: "/api/webhooks/resend/extra", expected: 404 },
      { method: "POST", path: "/health", expected: 404 },
    ];
    for (const item of cases) {
      const response = await exchange(proxy.url, { ...item, body: item.method === "GET" ? undefined : Buffer.from("ignored") });
      assert.equal(response.status, item.expected);
    }
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("chunked raw body and Svix headers pass through unchanged; other headers are not forwarded", async () => {
  const received: { body?: Buffer; headers?: http.IncomingHttpHeaders } = {};
  const app = await withHttpServer(async (request, response) => {
    received.body = await readRequest(request);
    received.headers = request.headers;
    response.writeHead(202, { "content-type": "application/json" });
    response.end('{"accepted":true}');
  });
  const receipts: Array<Record<string, unknown>> = [];
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url, onReceipt: (receipt) => receipts.push(receipt) });
  const rawBody = Buffer.from('{"text":"café 🪁","line":"a\\nb"}', "utf8");
  try {
    const result = await exchange(proxy.url, {
      headers: {
        ...SIGNED_HEADERS,
        "transfer-encoding": "chunked",
        authorization: "Bearer do-not-forward",
        cookie: "session=do-not-forward",
        "x-untrusted-forward": "do-not-forward",
      },
      body: rawBody,
    });
    assert.equal(result.status, 202);
    assert.deepEqual(result.body, Buffer.from('{"accepted":true}'));
    assert.deepEqual(received.body, rawBody);
    assert.equal(received.headers?.["svix-id"], SIGNED_HEADERS["svix-id"]);
    assert.equal(received.headers?.["svix-timestamp"], SIGNED_HEADERS["svix-timestamp"]);
    assert.equal(received.headers?.["svix-signature"], SIGNED_HEADERS["svix-signature"]);
    assert.equal(received.headers?.["content-type"], SIGNED_HEADERS["content-type"]);
    assert.equal(received.headers?.["content-length"], String(rawBody.length));
    assert.equal(received.headers?.["transfer-encoding"], undefined);
    assert.equal(received.headers?.authorization, undefined);
    assert.equal(received.headers?.cookie, undefined);
    assert.equal(received.headers?.["x-untrusted-forward"], undefined);
    assert.equal(receipts.length, 1);
    assert.deepEqual(Object.keys(receipts[0]).sort(), ["receivedAt", "status", "svixId"]);
    assert.equal(receipts[0].svixId, SIGNED_HEADERS["svix-id"]);
    assert.equal(receipts[0].status, 202);
    assert.equal(typeof receipts[0].receivedAt, "string");
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("duplicate signature and content-type headers fail closed before forwarding", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  const prefix = `POST /api/webhooks/resend HTTP/1.1\r\nHost: ${new URL(proxy.url).host}\r\n`;
  const common = "Svix-Timestamp: 1791111111\r\nSvix-Signature: v1,synthetic-signature\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}";
  try {
    const duplicateSvix = await rawExchange(proxy.url, `${prefix}Content-Type: application/json\r\nSvix-ID: first\r\nSvix-ID: second\r\n${common}`);
    const duplicateContentType = await rawExchange(proxy.url, `${prefix}Content-Type: application/json\r\nContent-Type: text/plain\r\nSvix-ID: unique\r\n${common}`);
    assert.equal(duplicateSvix.status, 400);
    assert.equal(duplicateContentType.status, 400);
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("ambiguous Content-Length and Transfer-Encoding framing is rejected by HTTP parser", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const host = new URL(proxy.url).host;
    const requestText = [
      "POST /api/webhooks/resend HTTP/1.1",
      `Host: ${host}`,
      "Content-Type: application/json",
      "Svix-ID: msg_test_0123456789",
      "Svix-Timestamp: 1791111111",
      "Svix-Signature: v1,synthetic-signature",
      "Content-Length: 2",
      "Transfer-Encoding: chunked",
      "Connection: close",
      "",
      "2",
      "{}",
      "0",
      "",
      "",
    ].join("\r\n");
    const result = await rawExchange(proxy.url, requestText);
    assert.equal(result.status, 400);
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("application rejection status and body are returned unchanged", async () => {
  let forwarded = 0;
  const app = await withHttpServer(async (request, response) => {
    forwarded += 1;
    await readRequest(request);
    response.writeHead(401, { "content-type": "application/json" });
    response.end('{"error":"invalid signature"}');
  });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const body = Buffer.from('{"tampered":1}');
    const result = await exchange(proxy.url, {
      headers: { ...SIGNED_HEADERS, "content-length": String(body.length) },
      body,
    });
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, Buffer.from('{"error":"invalid signature"}'));
    assert.equal(forwarded, 1);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("application redirects are returned without following the Location", async () => {
  let requests = 0;
  const app = await withHttpServer((_request, response) => {
    requests += 1;
    response.writeHead(302, { location: "/login" });
    response.end("redirect");
  });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const result = await exchange(proxy.url, {
      headers: { ...SIGNED_HEADERS, "content-length": "2" },
      body: Buffer.from("{}"),
    });
    assert.equal(result.status, 302);
    assert.equal(result.headers.location, undefined);
    assert.deepEqual(result.body, Buffer.from("redirect"));
    assert.equal(requests, 1);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("oversized body is rejected before any app request", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const response = await exchange(proxy.url, {
      headers: { ...SIGNED_HEADERS, "content-length": String(128 * 1024 + 1) },
    });
    assert.equal(response.status, 413);
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("oversized chunked body receives 413 and never reaches the app", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url });
  try {
    const response = await exchange(proxy.url, {
      headers: { ...SIGNED_HEADERS, "transfer-encoding": "chunked" },
      body: Buffer.alloc(128 * 1024 + 1, 0x61),
    });
    assert.equal(response.status, 413);
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("slow body receives a bounded 408 and never reaches the app", async () => {
  let forwarded = 0;
  const app = await withHttpServer((_request, response) => { forwarded += 1; response.end("unexpected"); });
  const proxy = await createA10WebhookProxy({ appBaseUrl: app.url, forwardingTimeoutMs: 30 });
  try {
    const response = await slowBodyExchange(proxy.url, 150);
    assert.equal(response.status, 408);
    assert.equal(forwarded, 0);
  } finally {
    await proxy.close();
    await app.close();
  }
});

test("backend errors and timeouts return bounded gateway failures", async () => {
  const closedApp = await withHttpServer((_request, response) => response.destroy());
  const errorProxy = await createA10WebhookProxy({ appBaseUrl: closedApp.url });
  try {
    const result = await exchange(errorProxy.url, {
      headers: { ...SIGNED_HEADERS, "content-length": "2" },
      body: Buffer.from("{}"),
    });
    assert.equal(result.status, 502);
  } finally {
    await errorProxy.close();
    await closedApp.close();
  }

  const slowApp = await withHttpServer((request, response) => {
    void request;
    void response;
  });
  const timeoutProxy = await createA10WebhookProxy({ appBaseUrl: slowApp.url, forwardingTimeoutMs: 50 });
  try {
    const result = await exchange(timeoutProxy.url, {
      headers: { ...SIGNED_HEADERS, "content-length": "2" },
      body: Buffer.from("{}"),
    });
    assert.equal(result.status, 504);
  } finally {
    await timeoutProxy.close();
    await slowApp.close();
  }
});
