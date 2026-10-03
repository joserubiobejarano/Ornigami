import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, lstatSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const RESEND_ENV_KEYS = new Set([
  "RESEND_API_KEY", "EMAIL_FROM", "REPLY_TO_EMAIL", "NEXT_PUBLIC_APP_URL",
  "REVIEW_BOOSTER_UNSUBSCRIBE_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET",
]);
const SENTRY_ENV_KEYS = new Set(["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]);
export const RESEND_RECIPIENT_ALLOWLIST = new Set([
  "joserubiobejarano@gmail.com", "josebejaranotv@gmail.com",
  "joserubiovlogs@gmail.com", "josebejaranovlogs@gmail.com",
]);
const DEFAULT_RESEND_RECIPIENT = "joserubiobejarano@gmail.com";
const MAX_ENV_BYTES = 64_000;
const MAX_PROVIDER_RESPONSE_BYTES = 64_000;
const RESEND_WINDOW_MS = 23 * 60 * 60 * 1000;

function sanitizeSourceError() {
  return new Error("provider configuration source is missing, unreadable, or invalid");
}

/** Parse dotenv-style single-line assignments while retaining only named keys. */
export function loadAllowlistedEnv(path, allowed) {
  let source;
  try {
    source = readFileSync(path, "utf8");
    if (Buffer.byteLength(source, "utf8") > MAX_ENV_BYTES) throw sanitizeSourceError();
  } catch { throw sanitizeSourceError(); }
  const result = Object.create(null);
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (!allowed.has(key)) continue;
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "").trim();
    if (Object.hasOwn(result, key)) throw new Error(`duplicate allowlisted key: ${key}`);
    result[key] = value;
  }
  return result;
}

function loadProductionResend(env, fetcher) {
  const root = process.cwd();
  const require = createRequire(import.meta.url);
  const cache = new Map();
  const resolveModule = (id) => {
    if (id.startsWith("@/")) return loadFile(join(root, "src", `${id.slice(2)}.ts`));
    return require(id);
  };
  const loadFile = (path) => {
    const absolute = resolve(path);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const javascript = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const cjsModule = { exports: {} };
    cache.set(absolute, cjsModule);
    const localProcess = { env: { NODE_ENV: "production", ...env } };
    const run = vm.runInNewContext(`(function(exports, require, module) { ${javascript}\n})`, {
      URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder, Buffer, crypto: globalThis.crypto,
      AbortController, AbortSignal, ReadableStream, WritableStream, Blob, process: localProcess, fetch: fetcher,
      console: { warn() {}, error() {}, log() {} }, setTimeout, clearTimeout,
    });
    run(cjsModule.exports, resolveModule, cjsModule);
    return cjsModule.exports;
  };
  return loadFile(join(root, "src/modules/review-booster/services/resend.provider.ts"));
}

function validateResendEnv(env) {
  if (!env.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{12,}$/.test(env.RESEND_API_KEY)) throw new Error("Resend API key is missing or malformed");
  if (!env.EMAIL_FROM || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.EMAIL_FROM)) throw new Error("EMAIL_FROM is missing or malformed");
  if (env.NEXT_PUBLIC_APP_URL) {
    const app = new URL(env.NEXT_PUBLIC_APP_URL);
    if (app.protocol !== "https:" || app.username || app.password) throw new Error("configured unsubscribe origin must be public HTTPS");
  }
}

function runIdValid(runId) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId || ""); }

function writeState(path, state, exclusive = false) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: exclusive ? "wx" : "w" });
}

/** Permanently claim a run before provider I/O; an orphan or corrupt claim still blocks replay. */
function claimResendAttempt(path, runId, payloadSha256) {
  const claimPath = `${path}.attempt-claim`;
  let descriptor;
  try {
    descriptor = openSync(claimPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("an attempt claim already exists; inspect provider evidence, no request repeated");
    throw new Error("could not create exclusive attempt claim; no provider request made");
  }
  try {
    writeSync(descriptor, `${JSON.stringify({ schema: "ornigami.a17.resend-attempt-claim.v1", runId, payloadSha256 })}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function validateFrozenPayload(payload, recipient, sender, runId) {
  if (!payload || payload.to !== recipient || Object.hasOwn(payload, "cc") || Object.hasOwn(payload, "bcc") ||
      typeof payload.from !== "string" || !payload.from.toLowerCase().endsWith(`<${sender.toLowerCase()}>`) ||
      payload.subject !== "Ornigami controlled Resend test" || !Array.isArray(payload.tags) ||
      payload.tags.length !== 1 || payload.tags[0]?.name !== "ornigami_delivery_id" || payload.tags[0]?.value !== runId.toLowerCase()) {
    throw new Error("prepared request recipient or sender scope is invalid; no provider request made");
  }
}

function ensureLocalEvidenceDirectory() {
  const nextPath = resolve(process.cwd(), ".next");
  const evidencePath = resolve(nextPath, "a17-provider-evidence");
  for (const [path, label] of [[nextPath, ".next"], [evidencePath, "provider evidence directory"]]) {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a real workspace directory`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(path);
    }
  }
  return evidencePath;
}

export async function runControlledResend({ env, runId, recipient = DEFAULT_RESEND_RECIPIENT, stateRoot = join(process.cwd(), ".next", "a17-provider-evidence"), fetcher = fetch, now = Date.now, beforeAttemptClaim = async () => {} }) {
  if (!runIdValid(runId)) throw new Error("a caller-supplied UUID run id is required");
  if (!RESEND_RECIPIENT_ALLOWLIST.has(recipient)) throw new Error("recipient is outside the controlled test mailbox allowlist");
  validateResendEnv(env);
  const expectedRoot = resolve(process.cwd(), ".next", "a17-provider-evidence");
  if (resolve(stateRoot) !== expectedRoot) throw new Error("evidence state must use workspace .next/a17-provider-evidence");
  const safeRoot = ensureLocalEvidenceDirectory();
  const statePath = join(safeRoot, `resend-${runId.toLowerCase()}.json`);
  let state;
  try {
    const stateStat = lstatSync(statePath);
    if (stateStat.isSymbolicLink() || !stateStat.isFile()) throw new Error("evidence state path is not a regular file");
    state = JSON.parse(readFileSync(statePath, "utf8"));
  }
  catch (error) { if (error?.code !== "ENOENT") throw new Error("existing evidence state is unreadable; no provider request made"); }

  const provider = loadProductionResend(env, fetcher);
  if (!state) {
    const payload = await provider.prepareResendPayload({
      business_id: null,
      business_name: "Ornigami controlled provider test",
      customer_email: recipient,
      subject: "Ornigami controlled Resend test",
      body: "This is an authorized provider acceptance test. No action is needed.",
      google_review_url: "https://search.google.com/local/writereview?placeid=a17-controlled-test",
      reply_to_email: env.REPLY_TO_EMAIL || env.EMAIL_FROM,
      language: "en",
      delivery_id: runId.toLowerCase(),
    });
    validateFrozenPayload(payload, recipient, env.EMAIL_FROM, runId);
    const serializedPayload = JSON.stringify(payload);
    state = {
      schema: "ornigami.a17.resend-evidence.v1",
      runId: runId.toLowerCase(),
      recipient,
      createdAt: new Date(now()).toISOString(),
      payload: JSON.parse(serializedPayload),
      payloadSha256: createHash("sha256").update(serializedPayload).digest("hex"),
      idempotencyKey: `a17-controlled-${runId.toLowerCase()}`,
      status: "prepared",
      attemptCount: 0,
    };
    writeState(statePath, state, true);
  } else {
    const created = Date.parse(state.createdAt);
    const age = now() - created;
    const allowedStates = new Set(["prepared"]);
    if (state.schema !== "ornigami.a17.resend-evidence.v1" || state.runId !== runId.toLowerCase() || state.recipient !== recipient ||
        !allowedStates.has(state.status) || !Number.isFinite(created) || age < 0 || age >= RESEND_WINDOW_MS ||
        !Number.isInteger(state.attemptCount) || state.attemptCount < 0 || state.attemptCount > 1) {
      throw new Error("existing run is terminal or does not match this controlled request; no provider request made");
    }
    validateFrozenPayload(state.payload, recipient, env.EMAIL_FROM, runId);
    const actualHash = createHash("sha256").update(JSON.stringify(state.payload)).digest("hex");
    if (actualHash !== state.payloadSha256 || state.idempotencyKey !== `a17-controlled-${runId.toLowerCase()}`) {
      throw new Error("frozen payload integrity check failed; no provider request made");
    }
  }

  if (state.attemptCount >= 1) throw new Error("an earlier attempt may have reached Resend; inspect provider evidence, no request repeated");
  // This exclusive, permanent claim serializes separate processes. If the process
  // crashes after claiming, the run remains terminal even if state still says prepared.
  await beforeAttemptClaim();
  claimResendAttempt(statePath, state.runId, state.payloadSha256);
  state.status = "pending";
  state.attemptCount += 1;
  writeState(statePath, state);
  try {
    const providerMessageId = await provider.sendPreparedWithResend(Object.freeze(state.payload), state.idempotencyKey);
    state.status = "accepted";
    state.acceptedAt = new Date(now()).toISOString();
    state.providerMessageId = providerMessageId;
    writeState(statePath, state);
    return { status: "provider-accepted", delivery: "unconfirmed", runId: state.runId, recipient, providerMessageId, payloadSha256: state.payloadSha256, evidenceFile: statePath };
  } catch (error) {
    state.status = error?.kind === "definite_rejection" ? "definite_rejection" : "unknown";
    state.failureClass = state.status;
    state.httpStatus = Number.isInteger(error?.status) ? error.status : null;
    writeState(statePath, state);
    return { status: state.status, failureClass: error?.name || "provider-error", delivery: "unconfirmed", runId: state.runId, recipient, payloadSha256: state.payloadSha256, evidenceFile: statePath };
  }
}

function safeSentryOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || !["sentry.io", "us.sentry.io", "de.sentry.io", "eu.sentry.io"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Sentry origin must be an approved Sentry HTTPS origin");
  }
  return url.origin;
}

export async function checkSentryProject({ env, origin = "https://sentry.io", fetcher = fetch }) {
  const token = env.SENTRY_AUTH_TOKEN;
  const org = env.SENTRY_ORG;
  const project = env.SENTRY_PROJECT;
  if (!token || !org || !project || !/^[a-z0-9_-]+$/i.test(org) || !/^[a-z0-9_-]+$/i.test(project)) return { status: "blocked-missing-configuration" };
  const base = safeSentryOrigin(origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const path = `/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`;
    const response = await fetcher(new URL(path, base), { method: "GET", redirect: "manual", signal: controller.signal, headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (response.status >= 300 && response.status < 400) return { status: "blocked-redirect-refused" };
    if (response.status === 401 || response.status === 403) return { status: "blocked-permission-or-authentication", httpStatus: response.status };
    if (response.status === 404) return { status: "blocked-project-not-found", httpStatus: 404 };
    if (!response.ok) return { status: "blocked-sentry-response", httpStatus: response.status };
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_PROVIDER_RESPONSE_BYTES || !response.body) return { status: "blocked-response-too-large" };
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_PROVIDER_RESPONSE_BYTES) { await reader.cancel(); return { status: "blocked-response-too-large" }; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")); }
    catch { return { status: "blocked-invalid-json" }; }
    if (!body || body.slug !== project || body.organization?.slug !== org) return { status: "blocked-project-identity-mismatch" };
    return { status: "verified-project-read-access", project: body.slug, organization: body.organization.slug, httpStatus: response.status };
  } catch {
    return { status: "blocked-network-or-response-error" };
  } finally { clearTimeout(timer); }
}

export async function checkResendSenderDomain({ env, fetcher = fetch }) {
  if (!env.RESEND_API_KEY || !/^re_[A-Za-z0-9_-]{12,}$/.test(env.RESEND_API_KEY) || !env.EMAIL_FROM) return { status: "blocked-missing-configuration" };
  let senderDomain;
  try { senderDomain = env.EMAIL_FROM.slice(env.EMAIL_FROM.lastIndexOf("@") + 1).toLowerCase(); }
  catch { return { status: "blocked-invalid-sender" }; }
  if (!senderDomain || !senderDomain.includes(".")) return { status: "blocked-invalid-sender" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    let after;
    let domainCount = 0;
    for (let page = 1; page <= 5; page += 1) {
      const url = new URL("https://api.resend.com/domains");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const response = await fetcher(url, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, accept: "application/json" },
      });
      if (response.status >= 300 && response.status < 400) return { status: "blocked-redirect-refused" };
      if (response.status === 401 || response.status === 403) return { status: "blocked-permission-or-authentication", httpStatus: response.status };
      if (!response.ok) return { status: "blocked-provider-response", httpStatus: response.status };
      const body = await readBoundedJson(response, MAX_PROVIDER_RESPONSE_BYTES);
      const domains = Array.isArray(body?.data) ? body.data : null;
      if (!domains || typeof body.has_more !== "boolean") return { status: "blocked-invalid-provider-response" };
      domainCount += domains.length;
      const domain = domains.find((item) => item?.name?.toLowerCase() === senderDomain);
      if (domain) return {
        status: domain.status === "verified" && domain.capabilities?.sending === "enabled" ? "verified-sending-enabled" : "sender-domain-not-ready",
        senderDomain, providerStatus: typeof domain.status === "string" ? domain.status : "unknown",
        sendingCapability: typeof domain.capabilities?.sending === "string" ? domain.capabilities.sending : "unknown",
        domainCount, pagesRead: page, inventoryComplete: !body.has_more,
      };
      if (!body.has_more) return { status: "sender-domain-not-listed", senderDomain, domainCount, pagesRead: page, inventoryComplete: true };
      const cursor = domains.at(-1)?.id;
      if (typeof cursor !== "string" || !/^[0-9a-f-]{36}$/i.test(cursor)) return { status: "blocked-invalid-pagination-cursor", domainCount, pagesRead: page };
      after = cursor;
    }
    return { status: "blocked-incomplete-domain-inventory", domainCount, pagesRead: 5, inventoryComplete: false };
  } catch { return { status: "blocked-network-or-response-error" }; }
  finally { clearTimeout(timer); }
}

async function readBoundedJson(response, maximumBytes) {
  if (Number(response.headers.get("content-length") || 0) > maximumBytes || !response.body) throw new Error("bounded response required");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); throw new Error("response exceeded cap"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (mode === "--sentry-check") {
    const source = args[1];
    if (!source) throw new Error("usage: --sentry-check <explicit-env-source> [sentry-origin]");
    const env = loadAllowlistedEnv(source, SENTRY_ENV_KEYS);
    const result = await checkSentryProject({ env, origin: args[2] || "https://sentry.io" });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "verified-project-read-access" ? 0 : 2;
    return;
  }
  if (mode === "--resend-domain-check") {
    const source = args[1];
    if (!source) throw new Error("usage: --resend-domain-check <explicit-env-source>");
    const env = loadAllowlistedEnv(source, RESEND_ENV_KEYS);
    const result = await checkResendSenderDomain({ env });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "verified-sending-enabled" ? 0 : 2;
    return;
  }
  if (mode === "--send-resend-test") {
    const source = args[1];
    const runId = args[2];
    const recipient = args[3] || DEFAULT_RESEND_RECIPIENT;
    if (!source || !runId || args[4] !== "--confirm-authorized-test-send") throw new Error("usage: --send-resend-test <explicit-env-source> <run-uuid> [allowed-recipient] --confirm-authorized-test-send");
    const env = loadAllowlistedEnv(source, RESEND_ENV_KEYS);
    const result = await runControlledResend({ env, runId, recipient });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "provider-accepted" ? 0 : 2;
    return;
  }
  throw new Error("choose --sentry-check or --send-resend-test with an explicit source file");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`A17 provider probe stopped safely: ${String(error).slice(0, 200)}\n`); process.exitCode = 1; });
}
