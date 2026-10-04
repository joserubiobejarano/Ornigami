import { mkdir, open, readFile, realpath, lstat, chmod, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isIP } from "node:net";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { checkPrivateArtifact } from "./a12-support-access-verify.mjs";

export const A10_RESEND_EVENTS = Object.freeze([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
]);

const API_URL = "https://api.resend.com/webhooks";
const MAX_RESPONSE_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_STATE_DIR = ".env.a10-resend-endpoint";
const PRODUCTION_ALIASES = new Set([
  "ornigami.vercel.app", "locallift-indol.vercel.app",
  "locallift-jose-rubios-projects-acf385c1.vercel.app",
  "locallift-git-main-jose-rubios-projects-acf385c1.vercel.app",
]);

export function validateEndpointUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("endpoint URL is invalid"); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const normalizedHostname = hostname.replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/api/webhooks/resend") {
    throw new Error("endpoint must be an isolated HTTPS /api/webhooks/resend URL without credentials, query, or fragment");
  }
  if (normalizedHostname === "ornigami.com" || normalizedHostname.endsWith(".ornigami.com") || PRODUCTION_ALIASES.has(normalizedHostname)) {
    throw new Error("production Ornigami hosts are not allowed");
  }
  if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost") || normalizedHostname.endsWith(".local") ||
      normalizedHostname.endsWith(".internal") || normalizedHostname === "metadata.google.internal") {
    throw new Error("loopback or private endpoint hosts are not allowed");
  }
  if (isIP(hostname)) throw new Error("IP literal endpoint hosts are not allowed; use the isolated target's DNS hostname");
  return url;
}

async function boundedJson(response, deadlineAt) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Resend response exceeded size limit");
  }
  if (!response.body) throw new Error("Resend response was empty");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        void reader.cancel().catch(() => undefined);
        throw new Error("response deadline exceeded");
      }
      let readTimer;
      let result;
      try {
        result = await Promise.race([
          reader.read(),
          new Promise((_, reject) => { readTimer = setTimeout(() => reject(new Error("response deadline exceeded")), remaining); }),
        ]);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error;
      } finally { if (readTimer) clearTimeout(readTimer); }
      const { done, value } = result;
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Resend response exceeded size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { try { reader.releaseLock(); } catch { /* a timed-out read may still be settling */ } }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Resend response was not valid JSON"); }
}

function validCreateResponse(body) {
  if (!body || typeof body !== "object" ||
      typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
      typeof body.signing_secret !== "string") return false;
  const encoded = body.signing_secret.startsWith("whsec_") ? body.signing_secret.slice(6) : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, "base64");
  return key.length >= 24 && key.toString("base64").replace(/=+$/, "") === encoded.replace(/=+$/, "");
}

async function writeExclusive(path, content) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(content, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

async function secureStateDirectory(stateDir) {
  const directory = resolve(stateDir);
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) {
    throw new Error("endpoint state directory must be a real task-owned directory");
  }
  if (process.platform === "win32") {
    try {
      const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      }).trim().match(/^\s*"[^"]+"\s*,\s*"(S-1-[0-9-]+)"\s*$/);
      if (!identity) throw new Error();
      execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${identity[1]}:(OI)(CI)F`], {
        stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
      });
    } catch { throw new Error("endpoint state directory could not be secured"); }
  } else await chmod(directory, 0o700);
  const probe = join(directory, `.a10-access-${randomBytes(8).toString("hex")}`);
  try {
    await writeExclusive(probe, "");
    await checkPrivateArtifact(probe);
  } catch { throw new Error("endpoint state directory is not private to the current user"); }
  finally { await unlink(probe).catch(() => undefined); }
}

/**
 * Creates one Resend webhook and stores its secret locally. The attempt file is
 * durable before the API call, so an uncertain result can never be retried by
 * this tool as an accidental duplicate create.
 */
export async function createA10Endpoint({ endpoint, apiKey, isolatedTarget, stateDir, fetcher = fetch, now = () => new Date(), requestTimeoutMs = REQUEST_TIMEOUT_MS }) {
  const target = validateEndpointUrl(endpoint);
  if (isolatedTarget !== true) throw new Error("explicit isolated-target acknowledgement is required");
  if (typeof apiKey !== "string" || !/^re_[A-Za-z0-9_-]{12,256}$/.test(apiKey)) {
    throw new Error("A10_RESEND_API_KEY is missing or malformed");
  }
  const attemptPath = join(stateDir, "attempt.json");
  const secretPath = join(stateDir, "webhook-secret.env");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  try { await readFile(attemptPath); throw new Error("an endpoint create attempt already exists; inspect it before taking manual action"); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try { await readFile(secretPath); throw new Error("an endpoint secret file already exists; refusing to overwrite it"); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  // Windows ignores POSIX mode bits. Secure and verify the containing directory
  // before any API request or generated signing secret can reach disk.
  await secureStateDirectory(stateDir);
  const attempt = {
    status: "attempt_started",
    endpointHost: target.hostname,
    events: [...A10_RESEND_EVENTS],
    createdAt: now().toISOString(),
  };
  await writeExclusive(attemptPath, `${JSON.stringify(attempt, null, 2)}\n`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  const deadlineAt = Date.now() + requestTimeoutMs;
  let response;
  try {
    response = await fetcher(API_URL, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ endpoint: target.toString(), events: A10_RESEND_EVENTS }),
    });
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error("Resend redirect refused; create outcome must be reviewed manually");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(`Resend returned HTTP ${response.status}; create outcome must be reviewed manually`);
    }
    let body;
    try { body = await boundedJson(response, deadlineAt); }
    catch { throw new Error("Resend response could not be safely validated; create outcome is unknown"); }
    if (!validCreateResponse(body)) throw new Error("Resend response lacked a valid webhook ID or signing secret; create outcome is unknown");

    await writeExclusive(secretPath, `RESEND_WEBHOOK_SECRET=${body.signing_secret}\n`);
    const completed = {
      status: "created",
      endpointHost: target.hostname,
      webhookId: body.id,
      events: [...A10_RESEND_EVENTS],
      secretStoredLocally: true,
      targetSecretInstalled: false,
      completedAt: now().toISOString(),
    };
    const handle = await open(attemptPath, "w", 0o600);
    try { await handle.writeFile(`${JSON.stringify(completed, null, 2)}\n`, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    return { webhookId: body.id, events: [...A10_RESEND_EVENTS], secretStoredLocally: true, targetSecretInstalled: false, secretPath };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Resend create timed out; outcome is unknown and the durable attempt record prevents another create");
    if (error instanceof Error && /^(?:Resend returned HTTP|Resend redirect refused|Resend response|Resend create outcome|Resend timed)/.test(error.message)) throw error;
    throw new Error("Resend create outcome is unknown; the durable attempt record prevents another create");
  } finally { clearTimeout(timer); }
}

export function getDryRunReport(endpoint) {
  let target = null;
  if (endpoint) {
    try { target = validateEndpointUrl(endpoint).toString(); }
    catch (error) { return { mode: "dry-run", validTarget: false, error: error.message, events: [...A10_RESEND_EVENTS] }; }
  }
  return {
    mode: "dry-run",
    createsEndpoint: false,
    ...(endpoint ? { validTarget: true } : {}),
    endpoint: target,
    events: [...A10_RESEND_EVENTS],
    createRequirements: ["--create", "explicit isolated HTTPS endpoint", "--isolated-target acknowledgement", "A10_RESEND_API_KEY process environment variable", "generated signing secret is stored locally only and still must be installed in the isolated app environment"],
  };
}

export function parseArgs(args) {
  let create = false;
  let isolatedTarget = false;
  let endpoint;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--create" && !seen.has("--create")) { create = true; seen.add("--create"); }
    else if (args[i] === "--isolated-target" && !seen.has("--isolated-target")) { isolatedTarget = true; seen.add("--isolated-target"); }
    else if (args[i] === "--endpoint" && !seen.has("--endpoint") && args[i + 1] && !args[i + 1].startsWith("--")) {
      endpoint = args[++i];
      seen.add("--endpoint");
    }
    else throw new Error("usage: node scripts/a10-resend-endpoint.mjs [--endpoint URL] [--create --isolated-target]");
  }
  return { create, endpoint, isolatedTarget };
}

async function main(args = process.argv.slice(2)) {
  const { create, endpoint, isolatedTarget } = parseArgs(args);
  if (!create) {
    console.log(JSON.stringify(getDryRunReport(endpoint), null, 2));
    return;
  }
  if (!endpoint) throw new Error("--create requires an explicit --endpoint URL");
  const root = dirname(fileURLToPath(import.meta.url));
  const result = await createA10Endpoint({ endpoint, apiKey: process.env.A10_RESEND_API_KEY, isolatedTarget, stateDir: join(root, "..", DEFAULT_STATE_DIR) });
  console.log(JSON.stringify({ webhookId: result.webhookId, events: result.events, secretStoredLocally: result.secretStoredLocally, targetSecretInstalled: result.targetSecretInstalled, secretPath: result.secretPath }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "blocked_or_unknown", message: error.message }));
    process.exitCode = 1;
  });
}
