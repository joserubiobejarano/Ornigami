import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync, writeSync, fsyncSync, closeSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const A10_LIVE_RECIPIENTS = Object.freeze({
  bounced: "bounced@resend.dev",
});
export const A10_LIVE_MAX_SENDS = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function secureA10PrivateDirectory(rootPath) {
  const root = resolve(rootPath);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) throw new Error("A10 private state directory must be a real task directory");
  if (process.platform === "win32") {
    try {
      const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim().match(/^\s*"[^"]+"\s*,\s*"(S-1-[0-9-]+)"\s*$/);
      if (!identity) throw new Error();
      execFileSync("icacls.exe", [root, "/inheritance:r", "/grant:r", `*${identity[1]}:(OI)(CI)F`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    } catch { throw new Error("A10 private state directory ACL could not be restricted to the current user"); }
  } else {
    const { chmodSync } = await import("node:fs");
    chmodSync(root, 0o700);
  }
  const probe = join(root, `.private-check-${randomUUID()}`);
  const fd = openSync(probe, "wx", 0o600);
  closeSync(fd);
  try {
    const { checkPrivateArtifact } = await import("./a12-support-access-verify.mjs");
    await checkPrivateArtifact(probe);
  } catch {
    unlinkSync(probe);
    throw new Error("A10 private state directory is not private to the current user");
  }
  unlinkSync(probe);
  return root;
}

export async function secureA10PrivateFile(filePath) {
  const file = resolve(filePath);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(file) !== file) throw new Error("A10 private state file identity is invalid");
  if (process.platform === "win32") {
    try {
      const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim().match(/^\s*"[^"]+"\s*,\s*"(S-1-[0-9-]+)"\s*$/);
      if (!identity) throw new Error();
      execFileSync("icacls.exe", [file, "/inheritance:r", "/grant:r", `*${identity[1]}:F`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    } catch { throw new Error("A10 private state file ACL could not be restricted to the current user"); }
  } else {
    const { chmodSync } = await import("node:fs");
    chmodSync(file, 0o600);
  }
  try {
    const { checkPrivateArtifact } = await import("./a12-support-access-verify.mjs");
    await checkPrivateArtifact(file);
  } catch { throw new Error("A10 private state file is not private to the current user"); }
  return file;
}

export async function secureA10TaskFixtureRoot(workspaceRoot = process.cwd()) {
  return secureA10PrivateDirectory(resolve(workspaceRoot, ".a20-fixture"));
}

export async function createA10LiveRunIntent(workspaceRoot = process.cwd()) {
  const root = await secureA10PrivateDirectory(resolve(workspaceRoot, ".env.a10-live-resend"));
  const path = join(root, "run-intent.json");
  const fd = openSync(path, "wx", 0o600);
  try {
    writeSync(fd, `${JSON.stringify({ schema: "ornigami.a10.live-run-intent.v1", status: "started", createdAt: new Date().toISOString() }, null, 2)}\n`, null, "utf8");
    fsyncSync(fd);
  } finally { closeSync(fd); }
  await secureA10PrivateFile(path);
  return path;
}

function safeEmail(value) {
  return typeof value === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

/**
 * @param {string|URL|Request} input
 * @param {RequestInit} [init]
 * @param {{sender?: string, apiKey?: string, ownedRecipient?: string, maxSends?: number}} [options]
 */
export function inspectA10ResendRequest(input, init, { sender, apiKey, ownedRecipient, maxSends = A10_LIVE_MAX_SENDS } = {}) {
  let url;
  try { url = new URL(input instanceof Request ? input.url : String(input)); }
  catch { throw new Error("A10 live Resend request URL is invalid"); }
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (url.protocol !== "https:" || url.hostname !== "api.resend.com" || url.port || url.username || url.password ||
      url.pathname !== "/emails" || url.search || url.hash || method !== "POST") {
    throw new Error("A10 live network guard permits only Resend POST /emails");
  }
  if (!apiKey || headers.get("authorization") !== `Bearer ${apiKey}` || !/^re_[A-Za-z0-9_-]{12,256}$/.test(apiKey) ||
      headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new Error("A10 live Resend request credentials or content type are invalid");
  }
  if (!safeEmail(sender)) throw new Error("A10 live verified sender is missing or malformed");
  if (!safeEmail(ownedRecipient)) throw new Error("A10 live owned recipient is missing or malformed");
  if (!Number.isInteger(maxSends) || maxSends < 1 || maxSends > A10_LIVE_MAX_SENDS) throw new Error("A10 live send cap is invalid");
  const idempotencyKey = headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length > 256 || !/^ornigami-booster-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw new Error("A10 live Resend idempotency key is missing or not in the application format");
  }
  const rawBody = init?.body ?? (input instanceof Request ? input.body : undefined);
  if (typeof rawBody !== "string" && !(rawBody instanceof Uint8Array)) throw new Error("A10 live Resend payload body is unavailable");
  const bytes = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  if (!bytes.length || bytes.byteLength > 128 * 1024) throw new Error("A10 live Resend payload size is invalid");
  let payload;
  try { payload = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("A10 live Resend payload is invalid"); }
  const recipients = Array.isArray(payload?.to) ? payload.to : [payload?.to];
  if (recipients.length !== 1 || ![ownedRecipient, A10_LIVE_RECIPIENTS.bounced].includes(recipients[0]) ||
      Object.hasOwn(payload || {}, "cc") || Object.hasOwn(payload || {}, "bcc")) {
    throw new Error("A10 live Resend recipient is outside the two controlled test addresses");
  }
  if (typeof payload?.from !== "string" || !payload.from.toLowerCase().endsWith(`<${sender.toLowerCase()}>`)) {
    throw new Error("A10 live Resend sender does not match the verified test sender");
  }
  const tags = payload?.tags;
  if (!Array.isArray(tags) || tags.length !== 1 || tags[0]?.name !== "ornigami_delivery_id" || !UUID.test(tags[0]?.value || "")) {
    throw new Error("A10 live Resend payload must have exactly one unique delivery tag");
  }
  return {
    url: url.toString(), method, deliveryId: tags[0].value.toLowerCase(),
    recipientLabel: recipients[0] === A10_LIVE_RECIPIENTS.bounced ? "resend-bounce-test" : "owned-test-inbox",
    idempotencyKey, payloadSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function claimAttempt(stateDir, request, maxSends, workspaceRoot) {
  const expectedRoot = resolve(workspaceRoot, ".env.a10-live-resend", "provider-attempts");
  const root = resolve(stateDir);
  if (root !== expectedRoot) throw new Error("A10 live provider attempt directory is outside the task fixture");
  await secureA10PrivateDirectory(root);
  const lock = join(root, "attempt.lock");
  let lockFd;
  try { lockFd = openSync(lock, "wx", 0o600); }
  catch { throw new Error("A10 live provider attempt lock exists; reconcile before any new send"); }
  let record;
  try {
    const names = readdirSync(root).filter((name) => /^attempt-[0-9]+\.json$/.test(name));
    if (names.length >= maxSends) throw new Error("A10 live provider send cap has been reached");
    for (const name of names) {
      let prior;
      try { prior = JSON.parse(readFileSync(join(root, name), "utf8")); }
      catch { throw new Error("A10 live provider attempt ledger is corrupt; reconcile before sending"); }
      if (prior.idempotencyKeySha256 === createHash("sha256").update(request.idempotencyKey).digest("hex")) {
        throw new Error("A10 live idempotency key already has a durable provider attempt");
      }
      if (prior.deliveryId === request.deliveryId) throw new Error("A10 live delivery already has a durable provider attempt");
    }
    record = {
      schema: "ornigami.a10.live-resend-attempt.v1",
      attempt: names.length + 1,
      deliveryId: request.deliveryId,
      recipientLabel: request.recipientLabel,
      idempotencyKeySha256: createHash("sha256").update(request.idempotencyKey).digest("hex"),
      payloadSha256: request.payloadSha256,
      status: "attempt_claimed",
      claimedAt: new Date().toISOString(),
    };
    const path = join(root, `attempt-${record.attempt}.json`);
    const fd = openSync(path, "wx", 0o600);
    try { writeSync(fd, `${JSON.stringify(record, null, 2)}\n`, null, "utf8"); fsyncSync(fd); }
    finally { closeSync(fd); }
    await secureA10PrivateFile(path);
  } finally {
    closeSync(lockFd);
    unlinkSync(lock);
  }
  return Object.freeze({ ...record, root, path: join(root, `attempt-${record.attempt}.json`) });
}

async function finishAttempt(attempt, outcome) {
  const absolute = resolve(attempt.path);
  const root = resolve(attempt.root);
  if (dirname(absolute) !== root || basename(root) !== "provider-attempts" || realpathSync(root) !== root) {
    throw new Error("A10 provider attempt receipt path is invalid");
  }
  const record = JSON.parse(readFileSync(absolute, "utf8"));
  if (record.schema !== "ornigami.a10.live-resend-attempt.v1" || record.attempt !== attempt.attempt || record.deliveryId !== attempt.deliveryId) {
    throw new Error("A10 provider attempt receipt changed while the request was in flight");
  }
  Object.assign(record, outcome, { completedAt: new Date().toISOString() });
  writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`, { flag: "w", mode: 0o600 });
  await secureA10PrivateFile(absolute);
}

async function safeProviderMessageId(response) {
  if (!response.ok) return null;
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 16 * 1024) return null;
  const body = response.clone().body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch { return null; }
  finally { try { reader.releaseLock(); } catch { /* cancelled stream */ } }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
    return typeof parsed?.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(parsed.id) ? parsed.id : null;
  } catch { return null; }
}

/**
 * @param {{sender?: string, apiKey?: string, ownedRecipient?: string, stateDir?: string, workspaceRoot?: string, maxSends?: number}} [options]
 * @returns {{permitsNetwork(target: {host: string, port: number|string}): boolean, permitsDns(host: string): boolean, fetch(input: string|URL|Request, init: RequestInit|undefined, nativeFetch: typeof fetch): Promise<Response>}}
 */
export function createA10ResendFetchGuard({ sender, apiKey, ownedRecipient, stateDir, workspaceRoot = process.cwd(), maxSends = A10_LIVE_MAX_SENDS } = {}) {
  const networkScope = new AsyncLocalStorage();
  return Object.freeze({
    permitsNetwork(target) {
      return networkScope.getStore() === true && target.host === "api.resend.com" && Number(target.port) === 443;
    },
    permitsDns(host) {
      return networkScope.getStore() === true && String(host).toLowerCase().replace(/\.$/, "") === "api.resend.com";
    },
    async fetch(input, init, nativeFetch) {
      const request = inspectA10ResendRequest(input, init, { sender, apiKey, ownedRecipient, maxSends });
      if (!stateDir) throw new Error("A10 live provider attempt directory is unavailable");
      const attempt = await claimAttempt(stateDir, request, maxSends, workspaceRoot);
      const guardedInit = { ...init, redirect: "manual" };
      let response;
      try {
        response = await networkScope.run(true, () => nativeFetch.call(globalThis, input, guardedInit));
      } catch (error) {
        await finishAttempt(attempt, { status: "unknown", outcome: "network_error" });
        throw error;
      }
      const providerMessageId = await safeProviderMessageId(response);
      await finishAttempt(attempt, {
        status: response.ok && providerMessageId ? "accepted" : response.ok ? "unknown" : "rejected",
        httpStatus: response.status,
        ...(providerMessageId ? { providerMessageId } : {}),
      });
      return response;
    },
  });
}

/** @param {string} source @param {{workspaceRoot: string, moduleUrl: string}} options */
export function adaptA20LivePreload(source, { workspaceRoot, moduleUrl }) {
  source = source.replaceAll("\r\n", "\n");
  const rootLine = 'const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");';
  const neonImport = 'import { installA20NeonBridge } from "./a20-neon-bridge.mjs";';
  const diagnosticsImport = 'import { installA20RequestDiagnostics, recordA20AuthUrlOrigins } from "./a20-request-diagnostics.mjs";';
  const fetchLine = '    guardTarget("fetch", target);';
  const guardLine = '  if (isAllowedAppEndpoint(target)) return;';
  const dnsLine = '      if (!allowedHosts.has(host)) logBlocked(`dns.${name}`, host, null);';
  const ledgerLine = 'const relativeLedgerPath = path.relative(fixtureRoot, ledgerPath);';
  const checks = [["workspace root", rootLine], ["Neon bridge import", neonImport], ["request diagnostics import", diagnosticsImport], ["fetch guard", fetchLine], ["network guard", guardLine], ["DNS guard", dnsLine], ["fixture ledger", ledgerLine]];
  for (const [label, fragment] of checks) {
    if (source.split(fragment).length - 1 !== 1) throw new Error(`A10 live preload adaptation refused: expected one ${label} fragment`);
  }
  const url = new URL(moduleUrl);
  const guardUrl = pathToFileURL(resolve(workspaceRoot, "scripts", "a10-live-resend-guards.mjs")).href;
  if (url.protocol !== "file:") throw new Error("A10 live preload adaptation requires file module URLs");
  const rootReplacement = `const repoRoot = ${JSON.stringify(resolve(workspaceRoot))};`;
  const neonReplacement = `import { installA20NeonBridge } from ${JSON.stringify(pathToFileURL(resolve(workspaceRoot, "scripts", "a20-neon-bridge.mjs")).href)};`;
  const diagnosticsReplacement = `import { installA20RequestDiagnostics, recordA20AuthUrlOrigins } from ${JSON.stringify(pathToFileURL(resolve(workspaceRoot, "scripts", "a20-request-diagnostics.mjs")).href)};\nimport { createA10ResendFetchGuard } from ${JSON.stringify(guardUrl)};`;
  const fetchReplacement = `    if (target.host === "api.resend.com") return a10ResendGuard.fetch(input, init, nativeFetch);\n${fetchLine}`;
  const guardReplacement = `  if (isAllowedAppEndpoint(target) || a10ResendGuard.permitsNetwork(target)) return;`;
  const dnsReplacement = '      if (!allowedHosts.has(host) && !a10ResendGuard.permitsDns(host)) logBlocked(`dns.${name}`, host, null);';
  const adapted = source.replace(rootLine, rootReplacement).replace(neonImport, neonReplacement)
    .replace(diagnosticsImport, diagnosticsReplacement).replace(fetchLine, fetchReplacement)
    .replace(guardLine, guardReplacement).replace(dnsLine, dnsReplacement)
    .replace(ledgerLine, `const a10ResendGuard = createA10ResendFetchGuard({\n  sender: process.env.EMAIL_FROM,\n  apiKey: process.env.RESEND_API_KEY,\n  ownedRecipient: process.env.A10_LIVE_OWNED_RECIPIENT,\n  stateDir: path.join(fixtureRoot, "a10-live", "provider-attempts"),\n  workspaceRoot: repoRoot,\n  maxSends: 2,\n});\n${ledgerLine}`);
  return adapted.replace('stateDir: path.join(fixtureRoot, "a10-live", "provider-attempts")', 'stateDir: path.join(repoRoot, ".env.a10-live-resend", "provider-attempts")');
}

/** @param {string} source @param {{workspaceRoot: string}} options */
export function adaptA20LiveAppFixture(source, { workspaceRoot } = {}) {
  source = source.replaceAll("\r\n", "\n");
  const rootLine = 'const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");';
  const coreImport = 'from "./a20-app-fixture-core.mjs"';
  const preloadLine = '  const preload = join(ROOT, "scripts", "a20-preload.mjs");';
  const appPortLine = '  const appPort = await availablePort();';
  const secretLines = [
    ['    AUTH_SECRET: "a20-local-only-auth-secret-32-characters-minimum",', '    AUTH_SECRET: process.env.A10_TASK_AUTH_SECRET,'],
    ['    NEXTAUTH_SECRET: "a20-local-only-auth-secret-32-characters-minimum",', '    NEXTAUTH_SECRET: process.env.A10_TASK_AUTH_SECRET,'],
    ['TOKEN_ENCRYPTION_KEY: "a20-local-only-token-encryption-key-never-valid",', 'TOKEN_ENCRYPTION_KEY: process.env.A10_TASK_TOKEN_KEY,'],
    ['REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: "a20-local-only-unsubscribe-secret-never-valid",', 'REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: process.env.A10_TASK_UNSUBSCRIBE_SECRET,'],
    ['RESEND_API_KEY: "re_a20_local_only_never_valid",', 'RESEND_API_KEY: process.env.A10_LIVE_RESEND_API_KEY,'],
    ['RESEND_WEBHOOK_SECRET: "a20_local_only_resend_secret_never_valid",', 'RESEND_WEBHOOK_SECRET: process.env.A10_LIVE_RESEND_WEBHOOK_SECRET,'],
    ['EMAIL_FROM: "fixture@example.test",', 'EMAIL_FROM: process.env.A10_LIVE_EMAIL_FROM,'],
    ['REPLY_TO_EMAIL: "fixture@example.test",', 'REPLY_TO_EMAIL: process.env.A10_LIVE_EMAIL_FROM,'],
    ['OPENAI_API_KEY: "sk-a20-local-only-never-valid",', ""],
  ];
  const buildEnvLine = '  const buildEnv = {\n    ...env,';
  const buildCommands = `    run(process.execPath, [nextBin, "build", "--webpack"], { env: buildEnv, stdio: ["ignore", logFd, logFd], timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });\n    run(process.execPath, [join(ROOT, "scripts", "generate-static-csp-hashes.mjs")], { env: buildEnv, stdio: ["ignore", logFd, logFd] });`;
  const serverEnvLine = '  const serverEnv = { ...env };';
  const fragments = [["workspace root", rootLine], ["fixture core import", coreImport], ["fixture preload", preloadLine], ["app port", appPortLine], ["build environment", buildEnvLine], ["build commands", buildCommands], ["runtime environment", serverEnvLine], ...secretLines.map(([from], i) => [`runtime input ${i + 1}`, from])];
  for (const [label, fragment] of fragments) {
    const expected = label === "fixture preload" ? 2 : 1;
    if (source.split(fragment).length - 1 !== expected) throw new Error(`A10 live app adaptation refused: expected ${expected} ${label} fragment(s)`);
  }
  let output = source.replace(rootLine, `const ROOT = ${JSON.stringify(resolve(workspaceRoot))};`)
    .replace(coreImport, `from ${JSON.stringify(pathToFileURL(resolve(workspaceRoot, "scripts", "a20-app-fixture-core.mjs")).href)}`)
    .replaceAll(preloadLine, '  const preload = join(FIXTURE, "a10-live", "a10-preload.mjs");')
    .replace(appPortLine, '  const appPort = Number(process.env.A10_LIVE_APP_PORT);\n  if (!Number.isInteger(appPort) || appPort < 1024 || appPort > 65535) throw new Error("A10 live loopback app port is invalid");')
    .replace(buildEnvLine, `  const buildEnv = {\n    ...Object.fromEntries(Object.entries(env).filter(([key]) => !["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "REPLY_TO_EMAIL"].includes(key) && !key.startsWith("A10_"))),`)
    .replace(buildCommands, `    if (process.env.A10_LIVE_REUSE_BUILD !== "1") {\n${buildCommands}\n    }`)
    .replace(serverEnvLine, '  const serverEnv = { ...env, A10_LIVE_OWNED_RECIPIENT: process.env.A10_LIVE_OWNED_RECIPIENT };');
  for (const [from, to] of secretLines) output = output.replace(from, to);
  return output;
}

/** @param {{workspaceRoot?: string, sourceRoot?: string}} [options] */
export async function stageA10LiveAdapters({ workspaceRoot = process.cwd(), sourceRoot = workspaceRoot } = {}) {
  const fixtureRoot = await secureA10TaskFixtureRoot(workspaceRoot);
  const liveRoot = resolve(fixtureRoot, "a10-live");
  await secureA10PrivateDirectory(liveRoot);
  const directory = lstatSync(liveRoot);
  if (!directory.isDirectory() || directory.isSymbolicLink() || realpathSync(liveRoot) !== liveRoot) throw new Error("A10 live adapter directory identity is invalid");
  const appSource = readFileSync(resolve(sourceRoot, "scripts", "a20-app-fixture.mjs"), "utf8");
  const preloadSource = readFileSync(resolve(sourceRoot, "scripts", "a20-preload.mjs"), "utf8");
  const appPath = resolve(liveRoot, "a20-app-fixture.mjs");
  const preloadPath = resolve(liveRoot, "a10-preload.mjs");
  const adaptedApp = adaptA20LiveAppFixture(appSource, { workspaceRoot });
  const adaptedPreload = adaptA20LivePreload(preloadSource, { workspaceRoot, moduleUrl: pathToFileURL(preloadPath).href });
  writeFileSync(appPath, adaptedApp, { mode: 0o600 });
  writeFileSync(preloadPath, adaptedPreload, { mode: 0o600 });
  await Promise.all([secureA10PrivateFile(appPath), secureA10PrivateFile(preloadPath)]);
  return Object.freeze({ fixtureRoot, liveRoot, appPath, preloadPath });
}
