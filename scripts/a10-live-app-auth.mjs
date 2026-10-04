import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const BOUNCE_RECIPIENT = "bounced@resend.dev";
const MAX_BODY_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function loopbackOrigin(input) {
  let url;
  try { url = new URL(input); }
  catch { throw new Error("A10 app URL is invalid"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("A10 app URL must be an exact HTTP loopback origin");
  }
  return url;
}

function readFixtureCredentials(credentialsPath, actorRole) {
  const absolute = resolve(credentialsPath);
  const parent = dirname(absolute);
  if (basename(absolute) !== "credentials.json" || basename(parent) !== ".a20-fixture") {
    throw new Error("A10 owner credentials must come from the private A20 fixture file");
  }
  let stat;
  try { stat = lstatSync(absolute); }
  catch { throw new Error("A10 private A20 owner credentials are unavailable"); }
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) throw new Error("A10 owner credentials must come from the private A20 fixture file");
  let value;
  try { value = JSON.parse(readFileSync(absolute, "utf8")); }
  catch { throw new Error("A10 private A20 owner credentials are unreadable"); }
  const account = value?.credentials?.[actorRole];
  const actor = value?.actors?.[actorRole];
  if (value?.task !== "A20" || !account || typeof account.email !== "string" || typeof account.password !== "string" ||
      typeof actor?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(actor.id)) {
    throw new Error("A10 private A20 owner credentials are invalid");
  }
  return { account, actor };
}

function cookieStore() {
  const values = new Map();
  return {
    absorb(response) {
      const lines = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie")].filter(Boolean);
      for (const line of lines) {
        const pair = line.split(";", 1)[0];
        const separator = pair.indexOf("=");
        if (separator < 1) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (/;\s*max-age=0/i.test(line) || value === "") values.delete(name);
        else values.set(name, value);
      }
    },
    header: () => [...values].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

function safeJsonObject(text, message) {
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error(message);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error(message); }
}

/**
 * Authenticate the A20 synthetic owner with Auth.js and retain cookies only in a private closure.
 * @param {{appUrl: string, credentialsPath: string, actorRole?: "owner"|"outsider", fetcher?: typeof fetch}} options
 * @returns {Promise<{actorId: string, appOrigin: string, request: (path: string, init?: RequestInit) => Promise<Response>}>}
 */
export async function authenticateA10FixtureOwner({ appUrl, credentialsPath, actorRole = "owner", fetcher = fetch }) {
  const base = loopbackOrigin(appUrl);
  if (actorRole !== "owner" && actorRole !== "outsider") throw new Error("A10 fixture actor role is not allowed");
  const { account, actor } = readFixtureCredentials(credentialsPath, actorRole);
  const jar = cookieStore();
  const boundedFetch = (url, init = {}) => fetcher(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const csrfResponse = await boundedFetch(new URL("/api/auth/csrf", base));
  jar.absorb(csrfResponse);
  if (!csrfResponse.ok) throw new Error(`A10 Auth.js CSRF request failed with HTTP ${csrfResponse.status}`);
  const csrf = safeJsonObject(await csrfResponse.text(), "A10 Auth.js CSRF response was invalid");
  if (typeof csrf.csrfToken !== "string" || !csrf.csrfToken) throw new Error("A10 Auth.js CSRF token is missing");

  const form = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email: account.email,
    password: account.password,
    callbackUrl: new URL("/dashboard", base).href,
    json: "true",
  });
  const signInResponse = await boundedFetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
      origin: base.origin,
      referer: new URL("/login", base).href,
      "x-auth-return-redirect": "true",
    },
    body: form,
  });
  jar.absorb(signInResponse);
  if (!signInResponse.ok) throw new Error(`A10 Auth.js credentials callback failed with HTTP ${signInResponse.status}`);
  const signInText = await signInResponse.text();
  if (Buffer.byteLength(signInText, "utf8") > MAX_BODY_BYTES) throw new Error("A10 Auth.js credentials callback response was too large");
  let signInBody;
  try { signInBody = JSON.parse(signInText); } catch { signInBody = null; }
  const redirectValue = typeof signInBody === "string" ? signInBody
    : typeof signInBody?.url === "string" ? signInBody.url
    : signInResponse.headers.get("location");
  let redirect;
  try { redirect = new URL(redirectValue, base); }
  catch { throw new Error("A10 Auth.js callback did not return a local redirect"); }
  if (redirect.protocol !== "http:" || ![base.hostname, "localhost"].includes(redirect.hostname) ||
      redirect.port !== base.port || redirect.username || redirect.password) {
    throw new Error("A10 Auth.js callback redirect escaped the exact loopback app port");
  }

  const sessionResponse = await boundedFetch(new URL("/api/auth/session", base), { headers: { cookie: jar.header() } });
  jar.absorb(sessionResponse);
  if (!sessionResponse.ok) throw new Error(`A10 Auth.js session request failed with HTTP ${sessionResponse.status}`);
  const session = safeJsonObject(await sessionResponse.text(), "A10 Auth.js session response was invalid");
  if (session?.user?.id !== actor.id) throw new Error("A10 Auth.js session subject did not match the synthetic owner");

  async function request(path, init = {}) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) throw new Error("A10 app request path must be same-origin");
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error("A10 app request escaped the loopback app origin");
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("cookie", jar.header());
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      headers.set("origin", base.origin);
      headers.set("referer", new URL("/dashboard", base).href);
      headers.set("sec-fetch-site", "same-origin");
    }
    return boundedFetch(url, { ...init, method, headers });
  }

  return Object.freeze({ actorId: actor.id, appOrigin: base.origin, request });
}

/**
 * Create one synthetic manual visit through the authenticated application API.
 * @param {{actorId: string, request: (path: string, init?: RequestInit) => Promise<Response>}} session
 * @param {{recipient: string, label: "owned-test-inbox"|"resend-bounce-test", visitedAt: string}} input
 */
export async function createA10SyntheticVisit(session, { recipient, label, visitedAt }) {
  if (!session || typeof session.request !== "function") throw new Error("A10 authenticated fixture session is required");
  if (label !== "owned-test-inbox" && label !== "resend-bounce-test") throw new Error("A10 visit recipient label is invalid");
  if (typeof recipient !== "string" || recipient.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) ||
      (label === "resend-bounce-test" && recipient !== BOUNCE_RECIPIENT) ||
      (label === "owned-test-inbox" && recipient.toLowerCase() === BOUNCE_RECIPIENT)) {
    throw new Error("A10 synthetic visit recipient is invalid for its controlled label");
  }
  const date = new Date(visitedAt);
  if (typeof visitedAt !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(visitedAt) || !Number.isFinite(date.getTime()) ||
      date.getTime() > Date.now() || date.getTime() < Date.now() - 6 * 24 * 60 * 60 * 1000) {
    throw new Error("A10 synthetic visit timestamp must be within the last six days with an explicit timezone");
  }
  const response = await session.request("/api/review-booster/visits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customer_name: "A10 Synthetic Recipient", customer_email: recipient, service_name: "A10 live acceptance", visited_at: visitedAt }),
  });
  if (response.status !== 201) throw new Error(`A10 synthetic visit creation failed with HTTP ${response.status}`);
  const result = safeJsonObject(await response.text(), "A10 synthetic visit response was invalid");
  if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id)) throw new Error("A10 synthetic visit response did not include a valid ID");
  return Object.freeze({ status: response.status, visitId: result.id, recipientLabel: label });
}

/** Trigger the real bounded Review Booster runner and expose counters only. */
export async function runA10AuthenticatedNow(session) {
  if (!session || typeof session.request !== "function") throw new Error("A10 authenticated fixture session is required");
  const response = await session.request("/api/review-booster/run-now", { method: "POST" });
  if (!response.ok) throw new Error(`A10 authenticated run-now failed with HTTP ${response.status}`);
  const result = safeJsonObject(await response.text(), "A10 run-now response was invalid");
  const counters = ["scanned", "sent", "failed", "skipped", "unknown", "deferred"];
  if (result.ok !== true || counters.some((key) => !Number.isSafeInteger(result[key]) || result[key] < 0)) {
    throw new Error("A10 run-now response did not include valid sanitized counters");
  }
  return Object.freeze(Object.fromEntries(["ok", ...counters].map((key) => [key, result[key]])));
}
