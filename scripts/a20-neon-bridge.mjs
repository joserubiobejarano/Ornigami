import { Socket } from "node:net";
import { readFile, realpath } from "node:fs/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markerPath = path.join(repoRoot, ".a20-fixture", "marker.json");
const virtualHost = "ep-a20-fixture.neon.tech";
const neonApiHost = "api.neon.tech";
const virtualPath = "/sql";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const DEFAULT_REQUEST_MS = 12_000;
const rawSocketConnect = Socket.prototype.connect;
function openSocket(host, port) { const socket = new Socket(); rawSocketConnect.call(socket, { host, port }); return socket; }

function fail(message) { throw new Error(`A20 Neon bridge refused request: ${message}`); }

function sameResolvedPath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function safePgUrl(raw) {
  if (!raw) fail("A20_DATABASE_URL is required");
  let url;
  try { url = new URL(raw); } catch { fail("A20_DATABASE_URL is invalid"); }
  const db = decodeURIComponent(url.pathname.slice(1));
  const ip = isIP(url.hostname);
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !ip || !["127.0.0.1", "::1"].includes(url.hostname) ||
      !/^a20_[a-z0-9_]+$/.test(db) || url.searchParams.has("host")) {
    fail("A20_DATABASE_URL must target a loopback a20_ database");
  }
  return { url, database: db, host: url.hostname, port: Number(url.port || 5432) };
}

function validateVirtualUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { fail("invalid Neon request URL"); }
  if (url.protocol !== "https:" || url.hostname !== neonApiHost || url.port || url.pathname !== virtualPath || url.search) {
    fail("unexpected Neon endpoint; remote fallback is disabled");
  }
  return url;
}

async function validateFixture() {
  const target = safePgUrl(process.env.A20_DATABASE_URL);
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("marked DATABASE_URL is required");
  let appUrl;
  try { appUrl = new URL(raw); } catch { fail("DATABASE_URL is invalid"); }
  if (!/^postgres(?:ql)?:$/.test(appUrl.protocol) || appUrl.hostname !== virtualHost ||
      decodeURIComponent(appUrl.pathname.slice(1)) !== "a20_fixture" || !appUrl.username || !appUrl.password) {
    fail("DATABASE_URL must identify the exact A20 virtual Neon fixture");
  }
  let marker;
  try { marker = JSON.parse(await readFile(markerPath, "utf8")); } catch { fail("fixture marker is missing or invalid"); }
  const fixtureRoot = path.resolve(repoRoot, ".a20-fixture");
  const clusterPath = path.join(fixtureRoot, "postgres", "data");
  if (marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready" || marker.database !== target.database ||
      marker.host !== target.host || marker.port !== target.port ||
      !sameResolvedPath(marker.fixtureRoot ?? "", fixtureRoot) ||
      !sameResolvedPath(marker.clusterPath ?? "", clusterPath)) {
    fail("fixture marker does not match the selected local database");
  }
  let actualFixtureRoot;
  let actualClusterPath;
  let markerFixtureRoot;
  let markerClusterPath;
  try {
    [actualFixtureRoot, actualClusterPath, markerFixtureRoot, markerClusterPath] = await Promise.all([
      realpath(fixtureRoot), realpath(clusterPath), realpath(marker.fixtureRoot), realpath(marker.clusterPath),
    ]);
  } catch { fail("fixture marker paths are missing"); }
  if (!sameResolvedPath(actualFixtureRoot, fixtureRoot) || !sameResolvedPath(actualClusterPath, clusterPath) ||
      !sameResolvedPath(markerFixtureRoot, fixtureRoot) || !sameResolvedPath(markerClusterPath, clusterPath)) {
    fail("fixture marker path identity is invalid");
  }
  return { target, appUrl };
}

function decodeBody(body) {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  fail("unsupported request body type");
}

function cstring(value) { return Buffer.from(`${value}\0`, "utf8"); }
function i16(value) { const b = Buffer.alloc(2); b.writeInt16BE(value); return b; }
function i32(value) { const b = Buffer.alloc(4); b.writeInt32BE(value); return b; }
function frame(tag, body = Buffer.alloc(0)) { return Buffer.concat([Buffer.from(tag), i32(body.length + 4), body]); }
function startupMessage(user, database) {
  const body = Buffer.concat([i32(196608), cstring("user"), cstring(user), cstring("database"), cstring(database), cstring("client_encoding"), cstring("UTF8"), cstring("application_name"), cstring("a20-authenticated-browser-fixture"), Buffer.from([0])]);
  return Buffer.concat([i32(body.length + 4), body]);
}
function parseFields(body) {
  const count = body.readInt16BE(0); let offset = 2; const fields = [];
  for (let n = 0; n < count; n++) {
    const end = body.indexOf(0, offset); const name = body.toString("utf8", offset, end); offset = end + 1;
    const tableID = body.readUInt32BE(offset); offset += 4;
    const columnID = body.readInt16BE(offset); offset += 2;
    const dataTypeID = body.readUInt32BE(offset); offset += 4;
    const dataTypeSize = body.readInt16BE(offset); offset += 2;
    const dataTypeModifier = body.readInt32BE(offset); offset += 4;
    const format = body.readInt16BE(offset); offset += 2;
    fields.push({ name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format });
  }
  return fields;
}
function parseDataRow(body) {
  const count = body.readInt16BE(0); let offset = 2; const row = [];
  for (let n = 0; n < count; n++) {
    const length = body.readInt32BE(offset); offset += 4;
    if (length === -1) row.push(null);
    else { row.push(body.toString("utf8", offset, offset + length)); offset += length; }
  }
  return row;
}
function parsePgError(body) {
  const fields = {};
  for (let i = 0; i < body.length && body[i] !== 0;) { const code = String.fromCharCode(body[i++]); const end = body.indexOf(0, i); fields[code] = body.toString("utf8", i, end); i = end + 1; }
  const error = new Error(fields.M || "Local PostgreSQL query failed");
  error.code = fields.C || "XX000";
  return error;
}

class LocalPostgres {
  constructor(target, signal) {
    this.target = target; this.signal = signal; this.socket = undefined; this.pending = Buffer.alloc(0); this.waiter = undefined; this.backendKey = undefined;
    this.queue = []; this.terminalError = undefined; this.abortHandler = undefined;
  }
  async connect() {
    const url = this.target.url;
    this.socket = openSocket(this.target.host, this.target.port);
    this.socket.on("data", (chunk) => { this.pending = Buffer.concat([this.pending, chunk]); this.drain(); });
    this.socket.on("error", (error) => { this.terminalError = error; this.waiter?.reject(error); });
    this.socket.on("close", () => { this.terminalError ||= new Error("Local PostgreSQL connection closed"); this.waiter?.reject(this.terminalError); });
    this.abortHandler = () => this.socket?.destroy(new DOMException("Database request aborted", "AbortError"));
    this.signal?.addEventListener("abort", this.abortHandler, { once: true });
    await new Promise((resolve, reject) => { this.socket.once("connect", resolve); this.socket.once("error", reject); });
    this.socket.write(startupMessage(decodeURIComponent(url.username || "postgres"), decodeURIComponent(url.pathname.slice(1))));
    try { await this.readUntilReady(); } catch (error) { error.a20Phase ||= "PostgreSQL startup"; throw error; }
    try { await this.simple("SET TIME ZONE 'UTC'; SET DateStyle TO ISO, MDY"); } catch (error) { error.a20Phase ||= "session configuration"; throw error; }
    let identity;
    try { identity = await this.extended("SELECT current_database(), host(inet_server_addr()), inet_server_port()::text, current_setting('data_directory')", []); }
    catch (error) { error.a20Phase ||= "fixture identity query"; throw error; }
    const [database, host, port, clusterPath] = identity.rows[0] || [];
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    const mappedIpv4 = marker.host.includes(".") && host === `::ffff:${marker.host}`;
    const mismatch = database !== marker.database ? "database" : (host !== marker.host && !mappedIpv4) ? "host" : Number(port) !== marker.port ? "port" : path.resolve(clusterPath || "") !== path.resolve(marker.clusterPath) ? "cluster path" : undefined;
    if (mismatch) {
      const error = new Error("Connected PostgreSQL identity does not match the A20 fixture marker"); error.a20Phase = `fixture identity ${mismatch} mismatch`; throw error;
    }
  }
  drain() {
    while (this.pending.length >= 5) {
      const len = this.pending.readInt32BE(1); if (this.pending.length < len + 1) return;
      const tag = String.fromCharCode(this.pending[0]); const body = this.pending.subarray(5, len + 1); this.pending = this.pending.subarray(len + 1);
      if (tag === "K") this.backendKey = { pid: body.readInt32BE(0), secret: body.readInt32BE(4) };
      if (tag === "E") { const error = parsePgError(body); if (this.waiter) this.waiter.reject(error); else this.queue.push({ tag, body, error }); continue; }
      if (this.waiter) this.waiter.resolve({ tag, body }); else this.queue.push({ tag, body });
    }
  }
  readMessage() {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.terminalError) return Promise.reject(this.terminalError);
    return new Promise((resolve, reject) => { this.waiter = { resolve: (v) => { this.waiter = undefined; resolve(v); }, reject: (e) => { this.waiter = undefined; reject(e); } }; });
  }
  async readUntilReady() {
    for (;;) {
      const message = await this.readMessage();
      if (message.tag === "R" && message.body.readInt32BE(0) !== 0) throw new Error("Fixture PostgreSQL must use trust authentication on loopback");
      if (message.tag === "Z") return;
      if (message.tag === "E") throw message.error;
    }
  }
  async simple(query) {
    this.socket.write(frame("Q", cstring(query)));
    let error;
    for (;;) { const m = await this.readMessage(); if (m.tag === "E") error = m.error; if (m.tag === "Z") { if (error) throw error; return; } }
  }
  async extended(query, params) {
    const parse = Buffer.concat([cstring(""), cstring(query), i16(0)]);
    const bindItems = [cstring(""), cstring(""), i16(0), i16(params.length)];
    for (const value of params) { if (value === null || value === undefined) bindItems.push(i32(-1)); else { const b = Buffer.from(String(value), "utf8"); bindItems.push(i32(b.length), b); } }
    bindItems.push(i16(0));
    this.socket.write(Buffer.concat([frame("P", parse), frame("B", Buffer.concat(bindItems)), frame("D", Buffer.concat([Buffer.from("P"), cstring("")])), frame("E", Buffer.concat([cstring(""), i32(0)])), frame("S")]));
    let fields = [], rows = [], command = "", error;
    for (;;) {
      const m = await this.readMessage();
      if (m.tag === "T") fields = parseFields(m.body);
      if (m.tag === "D") rows.push(parseDataRow(m.body));
      if (m.tag === "C") command = m.body.toString("utf8").replace(/\0$/, "");
      if (m.tag === "E") error = m.error;
      if (m.tag === "Z") { if (error) throw error; break; }
    }
    const rowCounts = [...(command || "").matchAll(/(?:^| )([0-9]+)(?= |$)/g)].map((match) => Number(match[1]));
    return { fields, rows, rowCount: rowCounts.length ? rowCounts.at(-1) : rows.length, command: command.split(" ")[0] || "" };
  }
  cancel() {
    if (!this.backendKey) return;
    const body = Buffer.concat([i32(80877102), i32(this.backendKey.pid), i32(this.backendKey.secret)]);
    const cancel = openSocket(this.target.host, this.target.port);
    const timer = setTimeout(() => cancel.destroy(), 250).unref();
    cancel.once("connect", () => { cancel.write(Buffer.concat([i32(16), body])); cancel.end(); clearTimeout(timer); });
    cancel.on("error", () => {});
  }
  close() { this.signal?.removeEventListener("abort", this.abortHandler); this.socket?.end(); }
}

async function runPostgresBatch(requests, { signal, timeoutMs, batchOptions }) {
  if (signal?.aborted) throw new DOMException("Database request aborted", "AbortError");
  const target = safePgUrl(process.env.A20_DATABASE_URL);
  const pg = new LocalPostgres(target, signal);
  let phase = "connect";
  const timer = setTimeout(() => {
    pg.cancel();
    const error = new Error("Database request deadline exceeded"); error.code = "57014";
    pg.socket?.destroy(error);
  }, timeoutMs);
  try {
    await pg.connect();
    phase = "begin transaction";
    const begin = ["BEGIN", batchOptions.isolation ? `ISOLATION LEVEL ${batchOptions.isolation}` : "", batchOptions.readOnly === undefined ? "" : batchOptions.readOnly ? "READ ONLY" : "READ WRITE", batchOptions.deferrable === undefined ? "" : batchOptions.deferrable ? "DEFERRABLE" : "NOT DEFERRABLE"].filter(Boolean).join(" ");
    await pg.simple(begin);
    phase = "set statement deadline";
    await pg.extended("SELECT set_config('statement_timeout', $1, true)", [`${Math.max(1, Math.min(10_000, timeoutMs - 500))}ms`]);
    const results = [];
    for (const query of requests) { phase = "execute query"; results.push(await pg.extended(query.query, query.params)); }
    phase = "commit transaction";
    await pg.simple("COMMIT");
    return results;
  } catch (error) {
    // Closing the only session with an open transaction forces PostgreSQL to roll it back.
    pg.socket?.destroy();
    error.a20Phase ||= phase;
    throw error;
  } finally { clearTimeout(timer); pg.close(); }
}

function safeError(error) {
  const code = /^[0-9A-Z]{5}$/.test(String(error?.code)) ? String(error.code) : "XX000";
  const messages = { "23505": "A database constraint was violated.", "23503": "A database reference was invalid.", "23502": "A required database value was missing.", "40001": "The database transaction conflicted and was rolled back.", "57014": "The database statement deadline expired.", "42501": "The database operation is not permitted.", "42P01": "The requested database object does not exist.", "42703": "The requested database field does not exist." };
  return { message: messages[code] || `The local database request failed during ${String(error?.a20Phase || "bridge processing")}.`, code };
}

async function handleNeonRequest(url, init = {}) {
  await validateFixture();
  validateVirtualUrl(String(url));
  if (String(init.method || "GET").toUpperCase() !== "POST") fail("only POST is accepted");
  const headers = new Headers(init.headers);
  if (headers.get("Neon-Connection-String") !== process.env.DATABASE_URL) fail("connection identity header does not match fixture");
  if (headers.get("Neon-Raw-Text-Output") !== "true" || headers.get("Neon-Array-Mode") !== "true") fail("Neon response mode headers do not match the installed driver contract");
  if (headers.has("Authorization")) fail("authorization header is not valid for this fixture");
  const body = decodeBody(init.body);
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) fail("request body exceeds limit");
  let payload;
  try { payload = JSON.parse(body); } catch { fail("malformed Neon request JSON"); }
  const batch = Array.isArray(payload?.queries);
  const isolationHeader = headers.get("Neon-Batch-Isolation-Level");
  const isolationMap = { ReadUncommitted: "READ UNCOMMITTED", ReadCommitted: "READ COMMITTED", RepeatableRead: "REPEATABLE READ", Serializable: "SERIALIZABLE" };
  if (isolationHeader && !isolationMap[isolationHeader]) fail("invalid transaction isolation option");
  const readOnlyHeader = headers.get("Neon-Batch-Read-Only");
  const deferrableHeader = headers.get("Neon-Batch-Deferrable");
  if ((readOnlyHeader && !["true", "false"].includes(readOnlyHeader)) || (deferrableHeader && !["true", "false"].includes(deferrableHeader))) fail("invalid transaction mode option");
  const requests = batch ? payload.queries : [payload];
  if (!requests.length || requests.some((item) => !item || typeof item.query !== "string" || !Array.isArray(item.params))) fail("unsupported Neon query payload");
  try {
    const timeout = DEFAULT_REQUEST_MS;
    const results = await runPostgresBatch(requests, { signal: init.signal, timeoutMs: timeout, batchOptions: {
      isolation: isolationMap[isolationHeader],
      readOnly: readOnlyHeader === null ? undefined : readOnlyHeader === "true",
      deferrable: deferrableHeader === null ? undefined : deferrableHeader === "true",
    } });
    return Response.json(batch ? { results } : results[0]);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    const pg = safeError(error);
    return Response.json(pg, { status: 400 });
  }
}

export async function installA20NeonBridge() {
  await validateFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function a20Fetch(input, init) {
    const rawUrl = input instanceof Request ? input.url : String(input);
    let url;
    try { url = new URL(rawUrl); } catch { return originalFetch.call(this, input, init); }
    if (url.hostname === neonApiHost) return handleNeonRequest(rawUrl, init || (input instanceof Request ? input : {}));
    if (["127.0.0.1", "::1", "localhost"].includes(url.hostname)) return originalFetch.call(this, input, init);
    fail("unexpected fetch endpoint; remote fallback is disabled");
  };
}

export const A20_BRIDGE_INTERNALS = Object.freeze({ safePgUrl, validateVirtualUrl, safeError, validateFixture, handleNeonRequest });
