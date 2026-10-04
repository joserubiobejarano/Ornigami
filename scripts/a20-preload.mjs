import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { syncBuiltinESMExports } from "node:module";
import { installA20NeonBridge } from "./a20-neon-bridge.mjs";
import { installA20RequestDiagnostics, recordA20AuthUrlOrigins } from "./a20-request-diagnostics.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeFetch = globalThis.fetch;
const fixtureRoot = path.join(repoRoot, ".a20-fixture");
const markerPath = path.join(repoRoot, ".a20-fixture", "marker.json");
const ledgerPath = path.resolve(process.env.A20_BLOCKED_NETWORK_LEDGER || path.join(fixtureRoot, "outbound-blocked.jsonl"));
const relativeLedgerPath = path.relative(fixtureRoot, ledgerPath);
if (relativeLedgerPath.startsWith("..") || path.isAbsolute(relativeLedgerPath)) throw new Error("A20 outbound ledger must stay inside the disposable fixture directory");
const allowedPort = Number(process.env.PORT || 3210);
const allowedHosts = new Set(["127.0.0.1", "::1", "localhost"]);

function logBlocked(kind, host, port, reason = "outside A20 loopback allowlist", protocol = "unknown:") {
  const item = { at: new Date().toISOString(), kind, protocol: String(protocol).slice(0, 16), host: String(host || "unknown").slice(0, 100), port: Number(port) || null, reason };
  try { appendFileSync(ledgerPath, `${JSON.stringify(item)}\n`, { encoding: "utf8", mode: 0o600 }); }
  catch { throw new Error("A20 outbound guard could not record a blocked network attempt"); }
  const error = new Error(`A20 outbound network blocked (${kind} ${item.host}:${item.port ?? "?"})`);
  error.code = "A20_OUTBOUND_BLOCKED";
  throw error;
}

function endpoint(input, options) {
  if (Array.isArray(input)) return endpoint(input[0], input[1] || options);
  if (typeof input === "string" || input instanceof URL) {
    try {
      const u = new URL(input);
      const opts = options && typeof options === "object" ? options : {};
      const protocol = opts.protocol || u.protocol;
      return { host: String(opts.hostname || opts.host || u.hostname).replace(/^\[|\]$/g, ""), port: Number(opts.port || u.port || (protocol === "https:" ? 443 : 80)), protocol };
    } catch {}
  }
  const opts = typeof input === "object" && input !== null ? input : (options || {});
  if (typeof input === "number") return { host: String(options || "localhost"), port: input, protocol: "tcp:" };
  return { host: String(opts.hostname || opts.host || "localhost").replace(/^\[|\]$/g, ""), port: Number(opts.port || 80), protocol: opts.protocol || "http:" };
}

function isAllowedAppEndpoint(target) {
  return allowedHosts.has(target.host) && target.port === allowedPort;
}

function guardTarget(kind, target, { isBridge = false } = {}) {
  if (isBridge) return;
  if (isAllowedAppEndpoint(target)) return;
  logBlocked(kind, target.host, target.port, "outside A20 loopback allowlist", target.protocol);
}

function installFetchGuard() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function a20GuardedFetch(input, init) {
    const raw = input instanceof Request ? input.url : String(input);
    // Data URLs contain their payload in the URL itself and make no network request.
    // Keep this exact scheme exception narrow; file:, blob:, and remote schemes stay guarded.
    try { if (new URL(raw).protocol === "data:") return nativeFetch.call(this, input, init); } catch {}
    let target;
    try { target = endpoint(raw); } catch { return originalFetch.call(this, input, init); }
    if (target.host === "api.neon.tech") {
      return Promise.resolve(originalFetch.call(this, input, init)).catch((error) => {
        if (String(error?.message || "").startsWith("A20 Neon bridge refused request:")) logBlocked("neon.invalid", target.host, target.port, "Neon bridge refused request", target.protocol);
        throw error;
      }); // prior wrapper performs exact bridge endpoint and connection identity validation
    }
    guardTarget("fetch", target);
    return originalFetch.call(this, input, init);
  };
}

function installHttpGuard(module, kind) {
  const originalRequest = module.request;
  const originalGet = module.get;
  module.request = function a20GuardedRequest(...args) {
    guardTarget(kind, endpoint(args[0], args[1]));
    return originalRequest.apply(this, args);
  };
  module.get = function a20GuardedGet(...args) {
    guardTarget(kind, endpoint(args[0], args[1]));
    return originalGet.apply(this, args);
  };
}

function installSocketGuard() {
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function a20GuardedSocketConnect(...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const second = Array.isArray(args[0]) ? args[0][1] : args[1];
    const target = typeof first === "number"
      ? { host: String(second || "localhost"), port: first }
      : { host: String(first?.host || first?.hostname || "localhost"), port: Number(first?.port || 0) };
    const normalized = { ...target, host: target.host.replace(/^\[|\]$/g, "") };
    guardTarget("net.connect", { ...normalized, protocol: "tcp:" });
    return originalConnect.apply(this, args);
  };
  const originalNetConnect = net.connect;
  net.connect = function a20GuardedNetConnect(...args) {
    const target = endpoint(args[0], args[1]);
    guardTarget("net.connect", target);
    return originalNetConnect.apply(this, args);
  };
  net.createConnection = net.connect;
  const originalTlsConnect = tls.connect;
  tls.connect = function a20GuardedTlsConnect(...args) {
    const target = endpoint(args[0], args[1]);
    guardTarget("tls.connect", target);
    return originalTlsConnect.apply(this, args);
  };
  syncBuiltinESMExports();
}

function installDnsGuard() {
  for (const name of ["lookup", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolveSoa", "resolveSrv", "resolveTxt"]) {
    const original = dns[name];
    if (typeof original !== "function") continue;
    dns[name] = function a20GuardedDns(hostname, ...args) {
      const host = String(hostname).toLowerCase().replace(/\.$/, "");
      if (!allowedHosts.has(host)) logBlocked(`dns.${name}`, host, null);
      return original.call(this, hostname, ...args);
    };
  }
  syncBuiltinESMExports();
}

export async function installA20Preload() {
  if (!existsSync(markerPath)) throw new Error("A20 fixture marker is required before preload");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (marker.task !== "A20" || marker.version !== 1 || marker.fixtureRoot !== path.resolve(repoRoot, ".a20-fixture")) throw new Error("A20 fixture marker identity is invalid");
  if (!process.env.DATABASE_URL || !process.env.A20_DATABASE_URL) throw new Error("A20 isolated database environment is required");
  await installA20NeonBridge();
  installFetchGuard();
  installHttpGuard(http, "http");
  installHttpGuard(https, "https");
  installSocketGuard();
  installDnsGuard();
  if (process.env.A20_REQUEST_DIAGNOSTICS === "1") {
    const diagnosticsPath = path.join(fixtureRoot, "incoming-request-diagnostics.jsonl");
    recordA20AuthUrlOrigins(diagnosticsPath);
    installA20RequestDiagnostics(http.Server.prototype, diagnosticsPath);
  }
}

export function assertA20NoBlockedOutbound() {
  if (!existsSync(markerPath)) throw new Error("A20 fixture marker is missing during outbound audit");
  if (existsSync(ledgerPath) && readFileSync(ledgerPath, "utf8").trim()) throw new Error("A20 acceptance observed blocked outbound network attempts; inspect sanitized outbound-blocked.jsonl");
}

export const A20_PRELOAD_INTERNALS = Object.freeze({ endpoint, isAllowedAppEndpoint, logBlocked });

// Safe for --import in Next's build, worker, and runtime processes: it only reads its task marker
// and installs guards; it never loads shared .env files or opens a network connection.
await installA20Preload();
