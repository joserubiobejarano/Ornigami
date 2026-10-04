import http from "node:http";
import { isIP } from "node:net";

const WEBHOOK_PATH = "/api/webhooks/resend";
const MAX_BODY_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_HEADER_BYTES = 8 * 1024;
const MAX_HEADER_COUNT = 32;
const FORWARD_TIMEOUT_MS = 10_000;

function validateLoopbackAppUrl(value) {
  let target;
  try { target = new URL(value); }
  catch { throw new Error("appBaseUrl must be an HTTP loopback URL"); }

  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const addressType = isIP(host);
  const loopbackV4 = addressType === 4 && Number(host.split(".")[0]) === 127;
  const loopbackV6 = addressType === 6 && host === "::1";
  if (target.protocol !== "http:" || !addressType || (!loopbackV4 && !loopbackV6) || !target.port ||
      target.username || target.password || (target.pathname !== "" && target.pathname !== "/") || target.search || target.hash) {
    throw new Error("appBaseUrl must contain only an HTTP loopback IP and explicit port");
  }
  return { host, port: Number(target.port) };
}

function singleHeader(request, name, { required = false, maxBytes = 4096 } = {}) {
  const found = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) found.push(request.rawHeaders[index + 1]);
  }
  if (found.length > 1) throw new Error("duplicate header");
  const value = found[0];
  if (required && (typeof value !== "string" || value.length === 0)) throw new Error("required header missing");
  if (value !== undefined && Buffer.byteLength(value, "utf8") > maxBytes) throw new Error("header too large");
  return value;
}

function validateIncomingHeaders(request) {
  const raw = request.rawHeaders;
  if (raw.length / 2 > MAX_HEADER_COUNT) throw new Error("too many headers");
  let totalBytes = 0;
  for (let index = 0; index < raw.length; index += 2) {
    totalBytes += Buffer.byteLength(raw[index], "utf8") + Buffer.byteLength(raw[index + 1], "utf8") + 4;
  }
  if (totalBytes > MAX_HEADER_BYTES) throw new Error("headers too large");

  const svixId = singleHeader(request, "svix-id", { required: true, maxBytes: 256 });
  const svixTimestamp = singleHeader(request, "svix-timestamp", { required: true, maxBytes: 256 });
  const svixSignature = singleHeader(request, "svix-signature", { required: true, maxBytes: 4096 });
  const contentType = singleHeader(request, "content-type", { required: true, maxBytes: 256 });
  const contentLength = singleHeader(request, "content-length", { maxBytes: 20 });
  const transferEncoding = singleHeader(request, "transfer-encoding", { maxBytes: 32 });

  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) throw new Error("unsupported content type");
  if (contentLength !== undefined && !/^\d+$/.test(contentLength)) throw new Error("invalid content length");
  if (contentLength !== undefined && transferEncoding !== undefined) throw new Error("ambiguous body framing");
  if (transferEncoding !== undefined && transferEncoding.toLowerCase() !== "chunked") throw new Error("unsupported transfer encoding");

  return { svixId, svixTimestamp, svixSignature, contentType, contentLength };
}

async function readBoundedBody(request, declaredLength, timeoutMs) {
  if (declaredLength !== undefined && Number(declaredLength) > MAX_BODY_BYTES) {
    const error = new Error("request body too large");
    error.statusCode = 413;
    throw error;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      request.pause();
      const error = new Error("request body timed out");
      error.statusCode = 408;
      finish(error);
    }, timeoutMs);
    const finish = (error, body) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      if (error) reject(error);
      else resolve(body);
    };
    const onData = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        request.pause();
        const error = new Error("request body too large");
        error.statusCode = 413;
        finish(error);
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (declaredLength !== undefined && bytes !== Number(declaredLength)) {
        const error = new Error("body length did not match content length");
        error.statusCode = 400;
        finish(error);
        return;
      }
      finish(undefined, Buffer.concat(chunks, bytes));
    };
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", (error) => finish(error));
    request.once("aborted", () => finish(Object.assign(new Error("request body aborted"), { statusCode: 400 })));
  });
}

function sendJsonError(response, status, message) {
  if (response.headersSent || response.destroyed) return;
  const body = Buffer.from(JSON.stringify({ error: message }), "utf8");
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": body.length, connection: "close" });
  response.end(body);
}

function forwardToApp(target, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };

    const outgoing = http.request({
      host: target.host,
      port: target.port,
      method: "POST",
      path: WEBHOOK_PATH,
      agent: false,
      headers: {
        "content-type": headers.contentType,
        "content-length": body.length,
        "svix-id": headers.svixId,
        "svix-timestamp": headers.svixTimestamp,
        "svix-signature": headers.svixSignature,
        connection: "close",
      },
    }, (incoming) => {
      const chunks = [];
      let bytes = 0;
      incoming.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          incoming.destroy(new Error("application response too large"));
          finish(Object.assign(new Error("application response too large"), { statusCode: 502 }));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        const result = { status: incoming.statusCode || 502, body: Buffer.concat(chunks, bytes) };
        const contentType = incoming.headers["content-type"];
        if (typeof contentType === "string" && Buffer.byteLength(contentType, "utf8") <= 256 && !/[\r\n]/.test(contentType)) {
          result.contentType = contentType;
        }
        finish(undefined, result);
      });
      incoming.on("error", (error) => finish(Object.assign(error, { statusCode: timedOut ? 504 : 502 })));
    });

    const timer = setTimeout(() => {
      timedOut = true;
      outgoing.destroy(new Error("application forwarding timed out"));
      finish(Object.assign(new Error("application forwarding timed out"), { statusCode: 504 }));
    }, timeoutMs);
    outgoing.on("error", (error) => finish(Object.assign(error, { statusCode: timedOut ? 504 : 502 })));
    outgoing.end(body);
  });
}

function reportReceipt(onReceipt, receipt) {
  if (typeof onReceipt !== "function") return;
  try { onReceipt(receipt); }
  catch { /* Receipt instrumentation must not change the webhook response. */ }
}

/** @typedef {{ svixId: string, status: number, receivedAt: string }} A10WebhookReceipt */
/** @typedef {(receipt: A10WebhookReceipt) => void} A10WebhookReceiptHandler */

/**
 * Starts a loopback-only HTTP proxy for the one signed Resend webhook route.
 * No other request path or incoming header is forwarded to the app.
 * @param {{ appBaseUrl: string, onReceipt?: A10WebhookReceiptHandler, forwardingTimeoutMs?: number }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function createA10WebhookProxy({ appBaseUrl, onReceipt, forwardingTimeoutMs = FORWARD_TIMEOUT_MS } = {}) {
  const target = validateLoopbackAppUrl(appBaseUrl);
  if (onReceipt !== undefined && typeof onReceipt !== "function") throw new Error("onReceipt must be a function");
  if (!Number.isInteger(forwardingTimeoutMs) || forwardingTimeoutMs < 1 || forwardingTimeoutMs > FORWARD_TIMEOUT_MS) {
    throw new Error(`forwardingTimeoutMs must be an integer from 1 to ${FORWARD_TIMEOUT_MS}`);
  }

  const server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES, requestTimeout: forwardingTimeoutMs, headersTimeout: forwardingTimeoutMs }, async (request, response) => {
    if (request.method !== "POST") {
      sendJsonError(response, 405, "method not allowed");
      return;
    }
    if (request.url !== WEBHOOK_PATH) {
      sendJsonError(response, 404, "not found");
      return;
    }

    let headers;
    let body;
    try {
      headers = validateIncomingHeaders(request);
      body = await readBoundedBody(request, headers.contentLength, forwardingTimeoutMs);
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      sendJsonError(response, status, status === 413 ? "request too large" : "invalid request");
      if (status === 413 || status === 408) {
        response.once("finish", () => request.socket.destroy());
      }
      return;
    }

    let result;
    try { result = await forwardToApp(target, headers, body, forwardingTimeoutMs); }
    catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
      const message = status === 504 ? "application request timed out" : "application unavailable";
      reportReceipt(onReceipt, { svixId: headers.svixId, status, receivedAt: new Date().toISOString() });
      sendJsonError(response, status, message);
      return;
    }

    reportReceipt(onReceipt, { svixId: headers.svixId, status: result.status, receivedAt: new Date().toISOString() });
    response.writeHead(result.status, {
      ...(result.contentType ? { "content-type": result.contentType } : {}),
      "content-length": result.body.length,
      connection: "close",
    });
    response.end(result.body);
  });
  server.maxHeadersCount = MAX_HEADER_COUNT;

  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => { server.off("listening", onListening); reject(error); };
    const onListening = () => { server.off("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new Error("webhook proxy failed to bind a TCP port");
  }

  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => {
        server.close((error) => error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve());
      });
    },
  };
}
