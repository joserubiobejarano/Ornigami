import { appendFileSync } from "node:fs";

const ROUTES = new Map([
  ["POST /api/review-booster/settings", "/api/review-booster/settings"],
  ["POST /api/review-booster/visits", "/api/review-booster/visits"],
  ["POST /api/reviews/draft", "/api/reviews/draft"],
  ["POST /api/team", "/api/team"],
]);
const MEMBER_DELETE = /^\/api\/team\/members\/[0-9a-f-]{36}$/i;
const VALID_FETCH_SITES = new Set(["same-origin", "same-site", "cross-site", "none"]);

function safeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.trim().toLowerCase() === "null") return "opaque";
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin === "null") return "invalid";
    return url.origin;
  } catch { return "invalid"; }
}

function safeHost(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const host = value.split(",", 1)[0].trim();
  if (!host || host.length > 255) return "invalid";
  try {
    const url = new URL(`http://${host}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return "invalid";
    return url.host.toLowerCase();
  } catch { return "invalid"; }
}

export function sanitizeIncomingRequest(request) {
  if (!request || typeof request.method !== "string" || !request.headers) return null;
  const method = request.method.toUpperCase();
  let pathname;
  try { pathname = new URL(request.url || "/", "http://127.0.0.1").pathname; }
  catch { return null; }
  const routeKey = `${method} ${pathname}`;
  const route = ROUTES.get(routeKey) ?? (method === "DELETE" && MEMBER_DELETE.test(pathname) ? "/api/team/members/:id" : null);
  if (!route) return null;

  const headers = request.headers;
  const fetchSite = typeof headers.get === "function" ? headers.get("sec-fetch-site") : headers["sec-fetch-site"];
  const origin = typeof headers.get === "function" ? headers.get("origin") : headers.origin;
  const host = typeof headers.get === "function" ? headers.get("host") : headers.host;
  const forwardedHost = typeof headers.get === "function" ? headers.get("x-forwarded-host") : headers["x-forwarded-host"];
  const forwardedProto = typeof headers.get === "function" ? headers.get("x-forwarded-proto") : headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",", 1)[0].trim().toLowerCase() : "";

  return {
    method,
    path: route,
    origin: safeOrigin(origin),
    secFetchSite: typeof fetchSite === "string" && VALID_FETCH_SITES.has(fetchSite.toLowerCase()) ? fetchSite.toLowerCase() : fetchSite ? "other" : null,
    host: safeHost(host),
    xForwardedHost: safeHost(forwardedHost),
    xForwardedProto: proto === "http" || proto === "https" ? proto : proto ? "other" : null,
  };
}

export function sanitizeInternalRequestOrigin(request) {
  const meta = request?.[Symbol.for("NextInternalRequestMeta")];
  return safeOrigin(meta?.initURL);
}

export function installA20RequestDiagnostics(serverPrototype, ledgerPath) {
  if (!serverPrototype || typeof serverPrototype.emit !== "function") throw new Error("A20 request diagnostics require an HTTP server prototype");
  const originalEmit = serverPrototype.emit;
  serverPrototype.emit = function a20RequestDiagnosticEmit(event, ...args) {
    if (event === "request") {
      const request = args[0];
      const response = args[1];
      const item = sanitizeIncomingRequest(request);
      if (item) {
        let written = false;
        const write = () => {
          if (written) return;
          written = true;
          try {
            appendFileSync(ledgerPath, `${JSON.stringify({ at: new Date().toISOString(), ...item, requestUrlOrigin: sanitizeInternalRequestOrigin(request) })}\n`, { encoding: "utf8", mode: 0o600 });
          } catch { /* Diagnostics must not alter request handling. */ }
        };
        if (response && typeof response.once === "function") {
          response.once("finish", write);
          response.once("close", write);
        } else write();
      }
    }
    return originalEmit.call(this, event, ...args);
  };
}

export function recordA20AuthUrlOrigins(ledgerPath, env = process.env) {
  try {
    appendFileSync(ledgerPath, `${JSON.stringify({
      at: new Date().toISOString(),
      event: "startup-auth-url-origins",
      authUrlOrigin: safeOrigin(env.AUTH_URL),
      nextAuthUrlOrigin: safeOrigin(env.NEXTAUTH_URL),
    })}\n`, { encoding: "utf8", mode: 0o600 });
  } catch { /* Diagnostics must not alter request handling. */ }
}
