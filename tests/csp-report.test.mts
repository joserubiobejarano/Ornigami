import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import {
  CSP_REPORT_POLICY,
  extractCspReports,
  normalizeCspReport,
  readBoundedCspBody,
} from "../src/lib/csp-report-policy.ts";

test("CSP URL fields keep only safe web origins and never preserve opaque or malformed input", () => {
  assert.deepEqual(normalizeCspReport({
    documentURL: "https://alice:secret@example.test/private/token?access_token=query#fragment",
    blockedURL: "data:text/html,secret-token",
    sourceFile: "not a url?secret=raw",
    effectiveDirective: "script-src\nforged-log-line secret-token",
    statusCode: -1,
    lineNumber: 12,
  }), {
    documentScheme: "https",
    blockedScheme: "opaque",
    sourceScheme: "unparseable",
    effectiveDirective: "script-src",
    violatedDirective: undefined,
    disposition: undefined,
    statusCode: undefined,
    lineNumber: 12,
    columnNumber: undefined,
  });
  assert.equal(normalizeCspReport({ blockedURL: "trusted-types-sink" }).blockedScheme, "trusted-types-sink");
  assert.equal(normalizeCspReport({ blockedURL: "trusted-types-policy" }).blockedScheme, "trusted-types-policy");
  assert.equal(normalizeCspReport({ blockedURL: "inline" }).blockedScheme, "inline");
  assert.equal(normalizeCspReport({ blockedURL: "not-a-url-secret" }).blockedScheme, "unparseable");
});

test("CSP report extraction rejects non-record entries and caps modern report batches", () => {
  assert.deepEqual(extractCspReports([null, "text", [], { body: { violatedDirective: "img-src" } }]), [
    { violatedDirective: "img-src" },
  ]);
  assert.deepEqual(extractCspReports([
    { type: "deprecation", body: { violatedDirective: "img-src" } },
    { type: "csp-violation", body: { violatedDirective: "img-src" } },
  ]), [{ violatedDirective: "img-src" }]);
  assert.deepEqual(extractCspReports({ "csp-report": [] }), []);
  assert.deepEqual(extractCspReports({ "csp-report": { "document-uri": "https://example.test", "effective-directive": "img-src" } }), [
    { "document-uri": "https://example.test", "effective-directive": "img-src" },
  ]);
  const legacy = extractCspReports({ "csp-report": {
    "document-uri": "https://example.test/path?private=1",
    "blocked-uri": "trusted-types-sink",
    "source-file": "https://source.example/path",
    "effective-directive": "require-trusted-types-for 'script'",
    disposition: "enforce",
    "status-code": 200,
    "line-number": 12,
    "column-number": 7,
  } });
  assert.deepEqual(normalizeCspReport(legacy[0] ?? {}), {
    documentScheme: "https",
    blockedScheme: "trusted-types-sink",
    sourceScheme: "https",
    effectiveDirective: "require-trusted-types-for",
    violatedDirective: undefined,
    disposition: "enforce",
    statusCode: 200,
    lineNumber: 12,
    columnNumber: 7,
  });
  assert.deepEqual(extractCspReports({}), []);
});

test("CSP request body reader stops and cancels as soon as the byte limit is crossed", async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("56"));
      controller.enqueue(new TextEncoder().encode("never consumed"));
    },
    cancel() { canceled = true; },
  });
  const request = new Request("https://app.test/api/csp-report", { method: "POST", body, duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(request, 5), { kind: "too_large" });
  assert.equal(canceled, true);
});

test("CSP body limit counts UTF-8 bytes, accepts exact byte and chunk limits, and rejects invalid encoding", async () => {
  const exact = new Request("https://app.test/api/csp-report", { method: "POST", body: "éé", duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(exact, 4, 2, 100), { kind: "ok", body: "éé" });

  const tooSmall = new Request("https://app.test/api/csp-report", { method: "POST", body: "éé", duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(tooSmall, 3, 2, 100), { kind: "too_large" });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("a"));
      controller.enqueue(new TextEncoder().encode("b"));
      controller.close();
    },
  });
  const exactChunks = new Request("https://app.test/api/csp-report", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(exactChunks, 2, 2, 100), { kind: "ok", body: "ab" });

  const invalidUtf8 = new Request("https://app.test/api/csp-report", { method: "POST", body: new Uint8Array([0xff]), duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(invalidUtf8, 2, 2, 100), { kind: "invalid" });
});

test("CSP request body reader bounds empty chunks and stalled streams", async () => {
  let churnCanceled = false;
  const churn = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array());
      controller.enqueue(new Uint8Array());
      controller.enqueue(new Uint8Array());
    },
    cancel() { churnCanceled = true; },
  });
  const churnRequest = new Request("https://app.test/api/csp-report", { method: "POST", body: churn, duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(churnRequest, 100, 2, 50), { kind: "invalid" });
  assert.equal(churnCanceled, true);

  let stalledCanceled = false;
  const stalled = new ReadableStream<Uint8Array>({ cancel() { stalledCanceled = true; } });
  const stalledRequest = new Request("https://app.test/api/csp-report", { method: "POST", body: stalled, duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(stalledRequest, 100, 2, 5), { kind: "invalid" });
  assert.equal(stalledCanceled, true);
});

test("CSP request body reader applies one deadline to a trickling stream", async () => {
  let canceled = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const trickle = new ReadableStream<Uint8Array>({
    start(controller) {
      interval = setInterval(() => controller.enqueue(new TextEncoder().encode("x")), 8);
      setTimeout(() => clearInterval(interval), 100);
    },
    cancel() { canceled = true; if (interval) clearInterval(interval); },
  });
  const request = new Request("https://app.test/api/csp-report", { method: "POST", body: trickle, duplex: "half" } as RequestInit);
  assert.deepEqual(await readBoundedCspBody(request, 100, 50, 20), { kind: "invalid" });
  assert.equal(canceled, true);
});

test("CSP report route enforces length/type/body limits and logs only normalized report fields", async () => {
  const logs: Array<{ event: string; fields: Record<string, unknown> }> = [];
  let rateLimitCalls = 0;
  const route = loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/csp-report/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async () => { rateLimitCalls += 1; return true; } },
    "@/lib/safe-logger": { safeLogger: { warn: (event: string, fields: Record<string, unknown>) => logs.push({ event, fields }) } },
    "@/lib/trusted-request-ip": { getTrustedRequestIp: () => "192.0.2.1" },
    "@/lib/csp-report-policy": { CSP_REPORT_POLICY, extractCspReports, normalizeCspReport, readBoundedCspBody },
  });

  const oversized = await route.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-length": "16385" }, body: "{}",
  }));
  assert.equal(oversized.status, 413);
  assert.equal(rateLimitCalls, 0);

  const unsupported = await route.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "text/plain" }, body: "{}",
  }));
  assert.equal(unsupported.status, 415);

  const secret = "https://example.test/session/token?access_token=do-not-log";
  const response = await route.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/reports+json" },
    body: JSON.stringify([{ type: "csp-violation", body: { documentURL: secret, blockedURL: "data:text/plain,secret" } }]),
  }));
  assert.equal(response.status, 204);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.event, "csp.report.violation");
  assert.equal(JSON.stringify(logs).includes("do-not-log"), false);
  assert.equal(JSON.stringify(logs).includes("session/token"), false);

  const unavailableRoute = loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/csp-report/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async () => { throw new Error("db url password must not leak"); } },
    "@/lib/safe-logger": { safeLogger: { warn: (event: string, fields?: Record<string, unknown>) => logs.push({ event, fields: fields ?? {} }) } },
    "@/lib/trusted-request-ip": { getTrustedRequestIp: () => "192.0.2.1" },
    "@/lib/csp-report-policy": { CSP_REPORT_POLICY, extractCspReports, normalizeCspReport, readBoundedCspBody },
  });
  const unavailable = await unavailableRoute.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }));
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.stringify(logs).includes("password"), false);
});

test("CSP report route rejects denied, streamed oversized, invalid JSON, and malformed reports", async () => {
  const loadRoute = (allow: boolean) => loadTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/csp-report/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async () => allow },
    "@/lib/safe-logger": { safeLogger: { warn() {} } },
    "@/lib/trusted-request-ip": { getTrustedRequestIp: () => "192.0.2.1" },
    "@/lib/csp-report-policy": { CSP_REPORT_POLICY, extractCspReports, normalizeCspReport, readBoundedCspBody },
  });

  const deniedRoute = loadRoute(false);
  const unreadBody = new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{\"violatedDirective\":\"script-src\"}",
  });
  const denied = await deniedRoute.POST(unreadBody);
  assert.equal(denied.status, 429);
  assert.equal(unreadBody.bodyUsed, false, "rate-limited requests must not read their report bodies");

  const allowedRoute = loadRoute(true);
  let canceled = false;
  const oversizedStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(16_000));
      controller.enqueue(new Uint8Array(1_000));
      controller.enqueue(new Uint8Array(1_000));
    },
    cancel() { canceled = true; },
  });
  const oversizedRequest = new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/json" }, body: oversizedStream, duplex: "half",
  } as RequestInit);
  const oversized = await allowedRoute.POST(oversizedRequest);
  assert.equal(oversized.status, 413);
  assert.equal(canceled, true);

  const invalidJson = await allowedRoute.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  }));
  assert.equal(invalidJson.status, 400);
  const malformedReport = await allowedRoute.POST(new Request("https://app.test/api/csp-report", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ unexpected: "field" }),
  }));
  assert.equal(malformedReport.status, 400);
});
