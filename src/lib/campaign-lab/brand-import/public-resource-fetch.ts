import { Resolver } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
import { isBlockedHostname, isPublicAddress } from "./private-address.ts";

export type ResourceFailureCode = "INVALID_OPTIONS" | "INVALID_URL" | "BLOCKED_DESTINATION"
  | "DNS_FAILED" | "NETWORK_FAILED" | "DEADLINE" | "CANCELLED" | "TOO_LARGE"
  | "UNSUPPORTED_ENCODING" | "INVALID_RESPONSE" | "REDIRECT_LIMIT";

export class ResourceReadError extends Error {
  readonly code: ResourceFailureCode;
  constructor(code: ResourceFailureCode) {
    super(`Public resource read failed: ${code}`);
    this.name = "ResourceReadError";
    this.code = code;
  }
}
const failure = (code: ResourceFailureCode) => new ResourceReadError(code);

export interface PublicResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: Uint8Array;
}
export interface ResourceReadOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  /** Trusted caller's absolute monotonic deadline, in the reader clock domain. */
  deadline?: number;
}
export interface Destination { address: string; family: number }
/** Trusted test/deployment seam; never populate from imported data. */
export interface ResourceTransport {
  resolve(hostname: string, signal: AbortSignal): Promise<readonly Destination[]>;
  connectTcp(options: net.NetConnectOpts): net.Socket;
  connectTls(options: tls.ConnectionOptions): net.Socket;
}

/** Trusted sequencing seam, never configured by imported input. */
export interface ResourceClock {
  now(): number;
  schedule(callback: () => void, ms: number): () => void;
}
export const resourceClock: ResourceClock = {
  now: () => performance.now(),
  schedule: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
};

async function resolve(host: string, signal: AbortSignal): Promise<Destination[]> {
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.throwIfAborted();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const query = async (family: 4 | 6) => {
      try {
        const values = await (family === 4 ? resolver.resolve4(host) : resolver.resolve6(host));
        return values.map((address) => ({ address, family }));
      } catch (error) {
        if (["ENODATA", "ENOTFOUND"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
        throw error;
      }
    };
    return (await Promise.all([query(4), query(6)])).flat();
  } finally {
    resolver.cancel();
    signal.removeEventListener("abort", cancel);
  }
}

const nodeTransport: ResourceTransport = {
  resolve,
  connectTcp: (options) => net.connect(options),
  connectTls: (options) => tls.connect(options),
};

function normalize(raw: string, base?: URL): URL {
  let url: URL;
  try { url = new URL(raw, base); } catch { throw failure("INVALID_URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw failure("INVALID_URL");
  }
  url.hash = "";
  // Strip a DNS absolute-name dot consistently for Host, SNI and verification.
  if (url.hostname.endsWith(".")) url.hostname = url.hostname.slice(0, -1);
  const host = hostname(url);
  if (isBlockedHostname(host) || (net.isIP(host) && !isPublicAddress(host))) {
    throw failure("BLOCKED_DESTINATION");
  }
  return url;
}
const hostname = (url: URL) => url.hostname.replace(/^\[|\]$/g, "");

function canonicalIp(address: string): string | null {
  const family = net.isIP(address);
  if (family === 4) return new URL(`http://${address}/`).hostname;
  if (family === 6) return new URL(`http://[${address}]/`).hostname.slice(1, -1);
  return null;
}

/**
 * Node 22.23.3 applies domainToASCII() to the hostname before IP detection in
 * tls.checkServerIdentity(), so a valid IPv6 literal is treated as a DNS name
 * and rejected as "Cert does not contain a DNS name". Keep Node's verification
 * for every case it accepts, and for IPv6 only recover an exact IP SAN match.
 * A missing or different IP SAN still returns Node's original error.
 */
function checkTlsServerIdentity(host: string, cert: tls.PeerCertificate): Error | undefined {
  const nodeResult = tls.checkServerIdentity(host, cert);
  if (!nodeResult || net.isIP(host) !== 6) return nodeResult;
  const expected = canonicalIp(host);
  const altNames = cert.subjectaltname ?? "";
  const ips = altNames
    .split(/\s*,\s*/)
    .filter((name) => name.startsWith("IP Address:"))
    .map((name) => canonicalIp(name.slice(11).trim()))
    .filter((value): value is string => value !== null);
  return expected && ips.includes(expected) ? undefined : nodeResult;
}

/** Creates a Node-only reader. Production callers should use the default transport. */
export function createPublicResourceReader(transport: ResourceTransport = nodeTransport, clock: ResourceClock = resourceClock) {
  return async function readPublicResource(raw: string, options: ResourceReadOptions): Promise<PublicResource> {
    const { maxBytes, timeoutMs = 10_000, maxRedirects = 3, signal: external } = options;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 8 * 1024 * 1024
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000
      || !Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5
      || (options.deadline !== undefined && !Number.isFinite(options.deadline))) {
      throw failure("INVALID_OPTIONS");
    }
    const controller = new AbortController();
    const { signal } = controller;
    const expires = Math.min(clock.now() + timeoutMs, options.deadline ?? Infinity);
    const cancel = () => controller.abort(failure("CANCELLED"));
    if (external?.aborted) cancel();
    else external?.addEventListener("abort", cancel, { once: true });
    const clearTimer = clock.schedule(() => controller.abort(failure("DEADLINE")), Math.max(0, expires - clock.now()));
    const check = () => {
      if (!signal.aborted && clock.now() >= expires) controller.abort(failure("DEADLINE"));
      signal.throwIfAborted();
    };
    // Race DNS as well as I/O: a late resolver result cannot create a socket.
    const bounded = <T>(work: Promise<T>): Promise<T> => new Promise((accept, reject) => {
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener("abort", abort);
      signal.addEventListener("abort", abort, { once: true });
      work.then((value) => { cleanup(); accept(value); }, (error) => { cleanup(); reject(error); });
      if (signal.aborted) abort();
    });
    try {
      check();
      let current = normalize(raw);
      const requestedUrl = current.href;
      for (let hop = 0; ; hop++) {
        check();
        const host = hostname(current);
        let addresses: readonly Destination[];
        try {
          addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }]
            : await bounded(transport.resolve(host, signal));
        } catch (error) {
          check();
          throw error instanceof ResourceReadError ? error : failure("DNS_FAILED");
        }
        check();
        if (!addresses.length || addresses.length > 64 || addresses.some(({ address, family }) =>
          !isPublicAddress(address) || net.isIP(address) !== family)) throw failure("BLOCKED_DESTINATION");
        const pinned = addresses[0];
        const secure = current.protocol === "https:";
        const agent = secure ? new https.Agent({ keepAlive: false, maxSockets: 1 })
          : new http.Agent({ keepAlive: false, maxSockets: 1 });
        // Ignore Node's hostname-based connector options entirely. Only this
        // already-validated numeric host reaches net/tls; no second DNS lookup.
        agent.createConnection = () => {
          check();
          const destination = { host: pinned.address, family: pinned.family, port: secure ? 443 : 80 };
          return secure ? transport.connectTls({
            ...destination,
            servername: net.isIP(host) ? undefined : host,
            rejectUnauthorized: true,
            checkServerIdentity: (_name, cert) => checkTlsServerIdentity(host, cert),
            ALPNProtocols: ["http/1.1"],
          }) : transport.connectTcp(destination);
        };
        try {
          const result = await new Promise<{ location?: string; resource?: PublicResource }>((accept, reject) => {
            let response: http.IncomingMessage | undefined;
            let settled = false;
            const finish = (error?: unknown, value?: { location?: string; resource?: PublicResource }) => {
              if (settled) return;
              settled = true;
              signal.removeEventListener("abort", abort);
              response?.removeListener("data", data);
              response?.removeListener("end", end);
              response?.removeListener("aborted", interrupted);
              response?.removeListener("close", closed);
              // Keep the one-shot error handlers until close: destroy can emit
              // a deferred error. They are removed by the close handlers below.
              response?.destroy();
              request.destroy();
              agent.destroy();
              if (error) reject(error); else accept(value!);
            };
            const fail = () => finish(failure("NETWORK_FAILED"));
            const abort = () => finish(signal.reason);
            const interrupted = () => finish(failure("INVALID_RESPONSE"));
            const closed = () => { if (!response?.complete) interrupted(); };
            let total = 0;
            const chunks: Buffer[] = [];
            const data = (chunk: Buffer) => {
              try {
                check();
                total += chunk.length;
                if (total > maxBytes) throw failure("TOO_LARGE");
                chunks.push(chunk);
              } catch (error) { finish(error); }
            };
            const end = () => {
              try {
                check();
                if (!response?.complete) throw failure("INVALID_RESPONSE");
                finish(undefined, { resource: {
                  requestedUrl, finalUrl: current.href, status: response.statusCode!,
                  contentType: response.headers["content-type"] ?? null,
                  body: Buffer.concat(chunks, total),
                } });
              } catch (error) { finish(error); }
            };
            const request = (secure ? https : http).request(current, {
              agent, method: "GET", maxHeaderSize: 16 * 1024,
              headers: { Host: current.host, "Accept-Encoding": "identity", Connection: "close" },
              joinDuplicateHeaders: false,
            });
            request.once("error", fail);
            request.once("close", () => {
              request.removeListener("error", fail);
              request.removeListener("response", onResponse);
              request.removeListener("upgrade", onUpgrade);
            });
            const onResponse = (incoming: http.IncomingMessage) => {
              if (settled) { incoming.destroy(); return; }
              response = incoming;
              response.once("error", fail);
              response.once("close", () => response?.removeListener("error", fail));
              try {
                check();
                const status = response.statusCode ?? 0;
                if ([301, 302, 303, 307, 308].includes(status)) {
                  const location = response.headers.location;
                  if (!location) throw failure("INVALID_RESPONSE");
                  if (hop >= maxRedirects) throw failure("REDIRECT_LIMIT");
                  finish(undefined, { location });
                  return;
                }
                if (status < 200 || status > 599) throw failure("INVALID_RESPONSE");
                const encoding = response.headers["content-encoding"];
                if (encoding && encoding.trim().toLowerCase() !== "identity") throw failure("UNSUPPORTED_ENCODING");
                const length = response.headers["content-length"];
                if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw failure("TOO_LARGE");
                response.on("data", data);
                response.once("end", end);
                response.once("aborted", interrupted);
                response.once("close", closed);
              } catch (error) { finish(error); }
            };
            // Reject protocol switching instead of handing off a socket.
            const onUpgrade = (_res: http.IncomingMessage, socket: net.Socket) => { socket.destroy(); interrupted(); };
            request.once("response", onResponse);
            request.once("upgrade", onUpgrade);
            signal.addEventListener("abort", abort, { once: true });
            if (signal.aborted) abort(); else request.end();
          });
          check();
          if (result.resource) return result.resource;
          current = normalize(result.location!, current);
        } finally { agent.destroy(); }
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      throw error instanceof ResourceReadError ? error : failure("NETWORK_FAILED");
    } finally {
      clearTimer();
      external?.removeEventListener("abort", cancel);
    }
  };
}

export const readPublicResource = createPublicResourceReader();
