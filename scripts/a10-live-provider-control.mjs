import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { checkPrivateArtifact } from "./a12-support-access-verify.mjs";
import { A10_RESEND_EVENTS } from "./a10-resend-endpoint.mjs";

const API_ROOT = "https://api.resend.com";
const MAX_RESPONSE_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const EMAIL_STATES = new Set(["sent", "delivered", "delivery_delayed", "bounced", "complained", "failed", "suppressed", "opened", "clicked"]);

/** @typedef {{ fetcher?: typeof fetch, timeoutMs?: number }} A10RequestOptions */
/** @typedef {{ webhookId: string, host: string, events: string[] }} A10LiveWebhookPin */
/** @typedef {{ count: number, hasMore: boolean, endpoints: A10LiveWebhookPin[] }} A10LiveWebhookMetadata */
/** @typedef {{ webhookId: string, endpointHost: string, events?: readonly string[] }} A10WebhookPinInput */
/** @typedef {{ expectedHost: string, events?: readonly string[], fetcher?: typeof fetch }} A10DeleteWebhookOptions */
/** @typedef {{ recipient: string, deliveryId: string, senderDomain: string, fetcher?: typeof fetch }} A10EmailEvidenceOptions */

function validKey(apiKey) {
  return typeof apiKey === "string" && /^re_[A-Za-z0-9_-]{12,256}$/.test(apiKey);
}

/** Reads only RESEND_API_KEY; unrelated dotenv values are never returned or logged. */
/** @param {string} envPath */
export function readA10LiveResendApiKey(envPath) {
  let source;
  try {
    source = readFileSync(envPath, "utf8");
    if (Buffer.byteLength(source, "utf8") > 64_000) throw new Error();
  } catch { throw new Error("A10 Resend credential source is missing or invalid"); }
  let apiKey;
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    const match = /^(?:export\s+)?RESEND_API_KEY\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    if (apiKey !== undefined) throw new Error("A10 Resend credential source has duplicate API key entries");
    let value = match[1].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0 || !/^(?:\s+#.*)?\s*$/.test(value.slice(end + 1))) throw new Error("A10 Resend credential source has an invalid API key assignment");
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, "").trim();
    apiKey = value;
  }
  if (!validKey(apiKey)) throw new Error("A10 Resend API key is missing or malformed");
  return apiKey;
}

async function boundedJson(response, deadlineAt) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Resend response exceeded the safe size limit");
  }
  if (!response.body) throw new Error("Resend response was empty");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) throw new Error("Resend response timed out");
      let timer;
      let result;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Resend response timed out")), remaining); }),
        ]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error;
      } finally { if (timer) clearTimeout(timer); }
      if (result.done) break;
      size += result.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Resend response exceeded the safe size limit");
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally { try { reader.releaseLock(); } catch { /* a timed-out read may still be settling */ } }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Resend response was not valid JSON"); }
}

/** Bounded provider request. Never follows redirects or includes provider error bodies in thrown errors. */
/** @param {string} apiKey
 * @param {{ method?: string, path: string, body?: unknown, fetcher?: typeof fetch, timeoutMs?: number }} options
 */
export async function requestA10Resend(apiKey, { method = "GET", path, body, fetcher = fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  if (!validKey(apiKey)) throw new Error("A10 Resend API key is missing or malformed");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REQUEST_TIMEOUT_MS) throw new Error("A10 provider request timeout is invalid");
  if (typeof path !== "string" || !/^\/(?:webhooks(?:\/[0-9a-f-]{36})?|emails\/[A-Za-z0-9_-]{1,128})$/.test(path)) {
    throw new Error("A10 Resend API path is invalid");
  }
  const validPair = (method === "GET" && (path === "/webhooks" || path.startsWith("/webhooks/") || path.startsWith("/emails/"))) ||
    (method === "DELETE" && /^\/webhooks\/[0-9a-f-]{36}$/.test(path));
  if (!validPair || body !== undefined) {
    throw new Error("A10 provider request method is not allowed");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  try {
    const response = await fetcher(`${API_ROOT}${path}`, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
    });
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Resend redirected the provider request; outcome requires review");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`Resend returned HTTP ${response.status}`);
    }
    return await boundedJson(response, deadline);
  } catch (error) {
    if (error instanceof Error && /^Resend (?:redirected|returned HTTP|response|request)/.test(error.message)) throw error;
    if (error?.name === "AbortError") throw new Error("Resend provider request timed out; outcome requires review");
    throw new Error("Resend provider request failed; outcome requires review");
  } finally { clearTimeout(timer); }
}

function endpointList(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  throw new Error("Resend webhook list response was not recognized");
}

/** Deliberately projects webhook metadata; signing_secret is never returned. */
/** @param {unknown} body @returns {A10LiveWebhookMetadata} */
export function projectA10LiveWebhookMetadata(body) {
  const rows = endpointList(body);
  return Object.freeze({
    count: rows.length,
    hasMore: body?.has_more === true,
    endpoints: rows.map((row) => {
      let host = "invalid";
      try { host = new URL(row?.endpoint).hostname.toLowerCase(); } catch { /* sanitized sentinel */ }
      return Object.freeze({
        id: typeof row?.id === "string" && UUID.test(row.id) ? row.id : "invalid",
        host,
        events: (() => {
          if (!Array.isArray(row?.events) || row.events.length > 64 || row.events.some((event) => typeof event !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(event))) {
            throw new Error("Resend webhook event metadata is invalid");
          }
          return [...row.events];
        })(),
      });
    }),
  });
}

/** @param {string} apiKey
 * @param {A10RequestOptions} [options]
 * @returns {Promise<A10LiveWebhookMetadata>}
 */
export async function listA10LiveWebhooks(apiKey, options = {}) {
  const { fetcher = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  return projectA10LiveWebhookMetadata(await requestA10Resend(apiKey, { path: "/webhooks", fetcher, timeoutMs }));
}

/** @param {A10LiveWebhookMetadata} metadata
 * @param {A10WebhookPinInput} pin
 * @returns {A10LiveWebhookPin}
 */
export function verifyA10LiveWebhookPin(metadata, { webhookId, endpointHost, events = A10_RESEND_EVENTS }) {
  if (!UUID.test(webhookId || "") || typeof endpointHost !== "string" || !endpointHost ||
      !hasExactEvents(events, A10_RESEND_EVENTS)) {
    throw new Error("A10 webhook pin is incomplete or does not request the exact acceptance event set");
  }
  const matches = metadata?.endpoints?.filter((endpoint) => endpoint.id === webhookId) || [];
  if (matches.length !== 1 || matches[0].host.toLowerCase() !== endpointHost.toLowerCase() ||
      !hasExactEvents(matches[0].events, events)) {
    throw new Error("Pinned Resend webhook does not match the approved host and event set");
  }
  return Object.freeze({ webhookId, host: matches[0].host, events: [...matches[0].events] });
}

async function assertPrivateReceipt(path) {
  const absolute = resolve(path);
  const stateRoot = resolve(process.cwd(), ".env.a10-live-resend");
  const childPath = relative(stateRoot, absolute);
  if (!childPath || isAbsolute(childPath) || childPath === ".." || childPath.startsWith(`..${sep}`) || resolve(stateRoot, childPath) !== absolute) {
    throw new Error("A10 cleanup receipt must be inside the task-private state directory");
  }
  try {
    if (realpathSync(stateRoot) !== stateRoot || realpathSync(absolute) !== absolute || lstatSync(absolute).isSymbolicLink()) throw new Error();
  } catch { throw new Error("A10 cleanup receipt path must not traverse links or reparse points"); }
  try { await checkPrivateArtifact(absolute); }
  catch { throw new Error("A10 cleanup receipt is not private to the current user"); }
  return absolute;
}

/** Delete requires a private task receipt pinning the exact ID, host and event set. */
/** @param {string} apiKey
 * @param {string} receiptPath
 * @param {A10DeleteWebhookOptions} options
 */
export async function deleteA10LiveWebhook(apiKey, receiptPath, { expectedHost, events = A10_RESEND_EVENTS, fetcher = fetch }) {
  if (typeof expectedHost !== "string" || !expectedHost) throw new Error("A10 cleanup requires the exact isolated endpoint host");
  const absolute = await assertPrivateReceipt(receiptPath);
  let receipt;
  try { receipt = JSON.parse(readFileSync(absolute, "utf8")); }
  catch { throw new Error("A10 cleanup receipt is missing or invalid"); }
  const pin = verifyReceiptPin(receipt, expectedHost, events);
  const listed = await listA10LiveWebhooks(apiKey, { fetcher });
  verifyA10LiveWebhookPin(listed, pin);
  const body = await requestA10Resend(apiKey, { method: "DELETE", path: `/webhooks/${pin.webhookId}`, fetcher });
  if (body?.deleted !== true) throw new Error("Resend did not confirm webhook deletion");
  return Object.freeze({ deleted: true, webhookId: pin.webhookId, host: pin.endpointHost });
}

function verifyReceiptPin(receipt, expectedHost, events) {
  if (!receipt || !["created", "active", "acceptance_complete", "cleanup_pending"].includes(receipt.status) ||
      !receipt.webhookId || !receipt.endpointHost || !Array.isArray(receipt.events)) {
    throw new Error("A10 cleanup receipt does not contain an approved webhook pin");
  }
  if (receipt.endpointHost.toLowerCase() !== expectedHost.toLowerCase()) throw new Error("A10 cleanup target does not match the expected isolated host");
  if (!hasExactEvents(events, A10_RESEND_EVENTS)) throw new Error("A10 cleanup expected event set is invalid");
  return verifyPinShape({ webhookId: receipt.webhookId, endpointHost: receipt.endpointHost, events: receipt.events }, events);
}

function verifyPinShape(pin, events) {
  if (!hasExactEvents(pin.events, events)) {
    throw new Error("A10 cleanup receipt event set is not exact");
  }
  return pin;
}

function hasExactEvents(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length ||
      new Set(actual).size !== actual.length || new Set(expected).size !== expected.length) return false;
  return actual.every((event) => typeof event === "string" && expected.includes(event));
}

/** @param {string} apiKey
 * @param {string} emailId
 * @param {A10EmailEvidenceOptions} options
 */
export async function getA10LiveEmailEvidence(apiKey, emailId, { recipient, deliveryId, senderDomain, fetcher = fetch }) {
  if (typeof emailId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(emailId) || !SAFE_EMAIL.test(recipient || "") || !UUID.test(deliveryId || "") || typeof senderDomain !== "string" || !senderDomain.includes(".")) {
    throw new Error("A10 email evidence pin is incomplete or invalid");
  }
  const body = await requestA10Resend(apiKey, { path: `/emails/${encodeURIComponent(emailId)}`, fetcher });
  const recipients = Array.isArray(body?.to) ? body.to : typeof body?.to === "string" ? [body.to] : [];
  const tags = Array.isArray(body?.tags) ? body.tags : [];
  const from = typeof body?.from === "string" ? body.from : "";
  let actualSenderDomain = null;
  const match = /<([^<>]+)>$/.exec(from);
  const address = match?.[1] || from;
  if (SAFE_EMAIL.test(address)) actualSenderDomain = address.split("@").at(-1).toLowerCase();
  const lastEvent = typeof body?.last_event === "string" && EMAIL_STATES.has(body.last_event) ? body.last_event : "unknown";
  return Object.freeze({
    emailId,
    lastEvent,
    recipientMatch: recipients.length === 1 && recipients[0].toLowerCase() === recipient.toLowerCase(),
    deliveryTagMatch: tags.length === 1 && tags[0]?.name === "ornigami_delivery_id" && tags[0]?.value?.toLowerCase() === deliveryId.toLowerCase(),
    senderDomain: actualSenderDomain,
    expectedSenderDomainMatch: actualSenderDomain === senderDomain.toLowerCase(),
  });
}
