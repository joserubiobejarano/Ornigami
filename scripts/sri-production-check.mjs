import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RESPONSE_LIMIT = 8 * 1024 * 1024;
const PROCESS_OUTPUT_LIMIT = 16 * 1024;
const DOTENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];
const SECURITY_HEADERS = [
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
  "content-security-policy-report-only",
  "reporting-endpoints",
];

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!["--repo", "--node", "--source-sha", "--output"].includes(key) || !argv[i + 1]) {
      throw new Error("Usage: sri-production-check.mjs --repo PATH --node PATH --source-sha SHA --output PATH");
    }
    result[key.slice(2)] = argv[++i];
  }
  if (Object.keys(result).length !== 4) throw new Error("All four CLI arguments are required.");
  return result;
}

function parseAttributes(raw) {
  const attributes = new Map();
  const matcher = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of raw.matchAll(matcher)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function scriptTags(html) {
  const tags = [];
  const matcher = /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(matcher)) {
    tags.push({ attributes: parseAttributes(match[1]), body: match[2] });
  }
  return tags;
}

function isExecutableScript(attributes) {
  const type = (attributes.get("type") ?? "").trim().toLowerCase();
  return !type || type === "module" || /^(?:text|application)\/(?:javascript|ecmascript)$/.test(type);
}

function parseCspNonce(csp) {
  const policy = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/i)?.[1] ?? "";
  if (!policy) return { nonce: null, error: "missing-script-src" };
  if (/'unsafe-(?:inline|eval)'/i.test(policy)) return { nonce: null, error: "unsafe-script-policy" };
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1] ?? null;
  return nonce ? { nonce, error: null } : { nonce: null, error: "missing-script-nonce" };
}

async function analyzeScriptTags(html, pageUrl, requestAsset) {
  const origin = new URL(pageUrl).origin;
  const tags = scriptTags(html);
  const issues = [];
  let sameOriginCount = 0;
  let externalCount = 0;
  for (let index = 0; index < tags.length; index += 1) {
    const { attributes } = tags[index];
    if (!attributes.has("src")) continue;
    let assetUrl;
    try {
      assetUrl = new URL((attributes.get("src") ?? "").replace(/&amp;/g, "&"), pageUrl);
    } catch {
      issues.push({ tagIndex: index, src: "[invalid-url]", issue: "invalid-src-url" });
      continue;
    }
    if (assetUrl.origin !== origin) {
      externalCount += 1;
      issues.push({ tagIndex: index, src: "[external-origin]", issue: "external-script-source" });
      continue;
    }
    sameOriginCount += 1;
    const src = assetUrl.pathname;
    const integrity = (attributes.get("integrity") ?? "").trim();
    if (!integrity) issues.push({ tagIndex: index, src, issue: "missing-integrity" });
    else {
      const tokens = integrity.split(/\s+/);
      const validTokens = tokens.map((token) => token.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})(?:\?.*)?$/));
      const supported = validTokens.filter(Boolean);
      if (supported.length !== tokens.length) issues.push({ tagIndex: index, src, issue: "invalid-integrity-format" });
      else if (supported.some((match) => match[1] !== "sha256")) issues.push({ tagIndex: index, src, issue: "unexpected-integrity-algorithm" });
      else {
        let bytes;
        try {
          bytes = await requestAsset(assetUrl);
        } catch (error) {
          issues.push({ tagIndex: index, src, issue: "asset-fetch-failed", detail: safeError(error) });
          continue;
        }
        const matched = supported.some((match) => createHash("sha256").update(bytes).digest("base64") === match[2]);
        if (!matched) issues.push({ tagIndex: index, src, issue: "integrity-digest-mismatch" });
      }
    }
  }
  return { totalScriptTags: tags.length, sameOriginCount, externalCount, issues };
}

function safeError(error) {
  const message = error instanceof Error ? error.message : "request failed";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 160);
}

function sanitizedEnv(home, extra = {}) {
  const env = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.HOME = home;
  env.USERPROFILE = home;
  env.TMPDIR = home;
  Object.assign(env, {
    CI: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: "https://rehearsal.invalid",
    AUTH_URL: "https://rehearsal.invalid",
    NEXTAUTH_URL: "https://rehearsal.invalid",
    AUTH_SECRET: "sri-production-check-only-not-a-real-secret-7db2f6d1",
    AUTH_TRUST_HOST: "true",
    GOOGLE_CLIENT_ID: "sri-check.apps.invalid",
    GOOGLE_CLIENT_SECRET: "sri-production-check-only-placeholder",
    TOKEN_ENCRYPTION_KEY: "sri-production-check-only-placeholder-key",
    OPENAI_ENABLED: "false",
    PRIVACY_RETENTION_ENABLED: "false",
    PRIVACY_RETENTION_APPLY: "false",
    PRIVACY_ACCOUNT_DELETION_ENABLED: "false",
    RESEND_RECONCILIATION_ENABLED: "false",
    STRIPE_ENABLED: "false",
    GOOGLE_SYNC_ENABLED: "false",
    ORNIGAMI_CONTAINER_BUILD: "true",
    ORNIGAMI_BUILD_MEMORY_OPTIMIZATIONS: "true",
    ORNIGAMI_BUILD_DISABLE_SOURCEMAPS: "false",
    ORNIGAMI_BUILD_WEBPACK_WORKER: "false",
    ORNIGAMI_BUILD_HEAP_MIB: "4096",
    NODE_OPTIONS: "--max-old-space-size=4096",
  }, extra);
  return env;
}

class CommandFailure extends Error {
  constructor(message, diagnostic) { super(message); this.diagnostic = diagnostic; }
}

function redactLog(output, env) {
  let text = output;
  for (const key of ["AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    if (env[key]) text = text.split(env[key]).join("[redacted]");
  }
  return text
    .replace(/((?:AUTH_SECRET|GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY|DATABASE_URL|CRON_SECRET)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(-PROCESS_OUTPUT_LIMIT);
}

function runCommand(nodeExec, script, args, cwd, env, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(nodeExec, [script, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    let forceKill;
    const append = (chunk) => { output = (output + chunk.toString()).slice(-PROCESS_OUTPUT_LIMIT); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      reject(new CommandFailure(`Could not start ${basename(script)}: ${safeError(error)}`, {
        command: basename(script), exitStatus: null, signal: null, timedOut: false, outputTail: redactLog(output, env),
      }));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      const diagnostic = { command: basename(script), exitStatus: code, signal, timedOut, outputTail: redactLog(output, env) };
      if (timedOut) reject(new CommandFailure(`${basename(script)} timed out after ${timeoutMs}ms.`, diagnostic));
      else if (code !== 0) reject(new CommandFailure(`${basename(script)} exited ${code ?? signal}.`, diagnostic));
      else resolvePromise(diagnostic);
    });
  });
}

async function getHttp(path, origin, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, origin), { redirect: "manual", signal: controller.signal });
    return { response, finish: () => clearTimeout(timeout) };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function boundedResponse(response) {
  const headers = {};
  for (const name of SECURITY_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value.slice(0, 2048);
  }
  const bytes = await readBoundedBody(response);
  return { headers, bytes, html: new TextDecoder().decode(bytes) };
}

async function readBoundedBody(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > RESPONSE_LIMIT) {
    await response.body?.cancel();
    throw new Error("HTTP body exceeded the configured size limit.");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error("HTTP body exceeded the configured size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function requestAsset(url, origin) {
  if (url.origin !== origin) throw new Error("refused request outside loopback origin");
  const request = await getHttp(url.pathname + url.search, origin, 10_000);
  try {
    const response = request.response;
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`asset returned HTTP ${response.status}`);
    }
    return await readBoundedBody(response);
  } finally {
    request.finish();
  }
}

function requiredHeaders(headers) {
  const expected = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
  const issues = [];
  for (const name of SECURITY_HEADERS) {
    if (!headers[name]) issues.push(`missing-security-header:${name}`);
    else if (expected[name] && headers[name].toLowerCase() !== expected[name].toLowerCase()) issues.push(`unexpected-security-header:${name}`);
  }
  if (headers["strict-transport-security"] && !/^max-age=31536000; includeSubDomains; preload$/i.test(headers["strict-transport-security"])) {
    issues.push("unexpected-security-header:strict-transport-security");
  }
  return issues;
}

function countFilesWithExtension(directory, extension) {
  if (!existsSync(directory)) return 0;
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += countFilesWithExtension(path, extension);
    else if (entry.isFile() && entry.name.endsWith(extension)) count += 1;
  }
  return count;
}

function collectBuiltHtmlHashes(directory) {
  const hashes = new Set();
  const scriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  function visit(path) {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".html")) {
        const html = readFileSync(child, "utf8");
        for (const match of html.matchAll(scriptPattern)) {
          if (match[1]) hashes.add(createHash("sha256").update(match[1], "utf8").digest("base64"));
        }
      }
    }
  }
  visit(directory);
  return [...hashes].sort();
}

async function inspectPage(path, origin) {
  const request = await getHttp(path, origin, 10_000);
  const response = request.response;
  let parsed;
  try { parsed = await boundedResponse(response); }
  finally { request.finish(); }
  const { headers, bytes, html } = parsed;
  const errors = [];
  if (response.status !== 200) errors.push(`http-status:${response.status}`);
  if (!/text\/html/i.test(response.headers.get("content-type") ?? "")) errors.push("content-type-not-html");
  errors.push(...requiredHeaders(headers));
  const csp = response.headers.get("content-security-policy") ?? "";
  const nonceInfo = parseCspNonce(csp);
  if (nonceInfo.error) errors.push(`csp:${nonceInfo.error}`);
  const tags = scriptTags(html);
  let inlineExecutableCount = 0;
  for (let index = 0; index < tags.length; index += 1) {
    const { attributes, body } = tags[index];
    if (!attributes.has("src") && body.trim() && isExecutableScript(attributes)) {
      inlineExecutableCount += 1;
      const nonce = attributes.get("nonce");
      if (!nonceInfo.nonce || nonce !== nonceInfo.nonce) errors.push(`inline-script-nonce-mismatch:${index}`);
    }
  }
  if (inlineExecutableCount === 0) errors.push("no-inline-hydration-script");
  const sri = await analyzeScriptTags(html, new URL(path, origin).href, (url) => requestAsset(url, origin));
  errors.push(...sri.issues.map((issue) => `sri:${path}:${issue.tagIndex}:${issue.issue}:${issue.src}`));
  return {
    path,
    status: response.status,
    contentType: (response.headers.get("content-type") ?? "").slice(0, 128),
    headers,
    nonceForComparison: nonceInfo.nonce,
    inlineExecutableCount,
    sri,
    errors,
    htmlBytes: bytes.byteLength,
  };
}

function gitValue(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Git source verification failed (${args[0]}).`);
  return result.stdout.trim();
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolvePromise) => child.once("close", resolvePromise)), new Promise((resolvePromise) => setTimeout(resolvePromise, 5000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([new Promise((resolvePromise) => child.once("close", resolvePromise)), new Promise((resolvePromise) => setTimeout(resolvePromise, 2000))]);
  }
}

export { analyzeScriptTags, parseCspNonce, requiredHeaders, scriptTags };

export async function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); } catch (error) { console.error(safeError(error)); return 2; }
  const repo = resolve(args.repo);
  const nodeExec = resolve(args.node);
  const outputPath = resolve(args.output);
  const receipt = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    sourceIdentity: { providedSha: args["source-sha"], verified: false },
    status: "failed",
    errors: [],
    pages: [],
    diagnostics: [],
    sriTotals: { sameOriginScripts: 0, externalScriptsSkipped: 0, missingOrInvalid: 0 },
  };
  let server;
  let tempHome;
  try {
    if (!isAbsolute(args.repo) || !isAbsolute(args.node) || !isAbsolute(args.output)) throw new Error("All paths must be absolute.");
    if (!/^[a-f0-9]{40}$/i.test(args["source-sha"])) throw new Error("source-sha must be a full 40-character Git SHA.");
    if (!existsSync(repo) || !existsSync(nodeExec)) throw new Error("Repository or supplied Node executable does not exist.");
    const resolvedSha = gitValue(repo, ["rev-parse", "HEAD"]);
    const dirty = gitValue(repo, ["status", "--porcelain"]);
    if (resolvedSha.toLowerCase() !== args["source-sha"].toLowerCase() || dirty) throw new Error("Repository source must be clean and match the supplied source SHA.");
    receipt.sourceIdentity = { providedSha: args["source-sha"], verifiedSha: resolvedSha, verified: true, clean: true };
    const lockPath = join(repo, "package-lock.json");
    const lockBytes = readFileSync(lockPath);
    const committedLockBlob = gitValue(repo, ["rev-parse", "HEAD:package-lock.json"]);
    const workingLockBlob = gitValue(repo, ["hash-object", "--no-filters", "package-lock.json"]);
    if (workingLockBlob !== committedLockBlob) throw new Error("package-lock.json working bytes do not match the committed Git blob.");
    receipt.sourceIdentity.packageLock = {
      committedBlobSha: committedLockBlob,
      rawSha256: createHash("sha256").update(lockBytes).digest("hex"),
      rawMatchesCommittedBlob: true,
    };
    const dotenv = DOTENV_FILES.filter((name) => existsSync(join(repo, name)));
    if (dotenv.length) throw new Error("Refusing project dotenv files: " + dotenv.join(", "));
    const buildDir = join(repo, ".next");
    if (existsSync(buildDir)) throw new Error("Refusing to overwrite existing .next; provide a fresh source checkout.");
    if (lstatSync(repo).isSymbolicLink()) throw new Error("Repository path must not be a symlink.");
    const versionRun = spawnSync(nodeExec, ["-p", "JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})"], { encoding: "utf8", windowsHide: true, env: sanitizedEnv(tmpdir()) });
    if (versionRun.status !== 0) throw new Error("Supplied Node executable failed its version check.");
    const nodeDetails = JSON.parse(versionRun.stdout);
    receipt.nodeVersion = nodeDetails.version;
    receipt.nodePlatform = nodeDetails.platform;
    receipt.nodeArchitecture = nodeDetails.arch;
    receipt.nextVersion = JSON.parse(readFileSync(join(repo, "node_modules", "next", "package.json"), "utf8")).version;
    const nextBin = join(repo, "node_modules", "next", "dist", "bin", "next");
    const cspGenerator = join(repo, "scripts", "generate-static-csp-hashes.mjs");
    if (!existsSync(nextBin) || !existsSync(cspGenerator)) throw new Error("Installed Next executable or CSP hash generator is missing.");
    tempHome = join(tmpdir(), `ornigami-sri-check-${process.pid}-${Date.now()}`);
    mkdirSync(tempHome, { recursive: false, mode: 0o700 });
    const buildEnv = sanitizedEnv(tempHome);
    const buildStarted = Date.now();
    receipt.diagnostics.push(await runCommand(nodeExec, nextBin, ["build", "--webpack"], repo, buildEnv, 30 * 60_000));
    receipt.diagnostics.push(await runCommand(nodeExec, cspGenerator, [], repo, buildEnv, 60_000));
    receipt.buildDurationMs = Date.now() - buildStarted;
    receipt.buildId = readFileSync(join(buildDir, "BUILD_ID"), "utf8").trim().slice(0, 128);
    receipt.sourceMapCount = countFilesWithExtension(buildDir, ".map");
    if (receipt.sourceMapCount < 1) throw new Error("Production build did not retain any source maps.");
    const hashManifest = JSON.parse(readFileSync(join(buildDir, "static-csp-hashes.json"), "utf8"));
    if (!Array.isArray(hashManifest) || !hashManifest.every((value) => typeof value === "string")) throw new Error("Static CSP hash manifest has invalid shape.");
    if (hashManifest.length === 0) throw new Error("Static CSP hash manifest is empty.");
    const expectedStaticHashes = collectBuiltHtmlHashes(join(buildDir, "server", "app"));
    const sortedManifest = [...hashManifest].sort();
    if (JSON.stringify(sortedManifest) !== JSON.stringify(expectedStaticHashes)) throw new Error("Static CSP hash manifest does not match the generated HTML scripts.");
    receipt.staticCspHashCount = hashManifest.length;
    const portServer = createServer();
    const port = await new Promise((resolvePromise, reject) => {
      portServer.once("error", reject);
      portServer.listen(0, "127.0.0.1", () => {
        const address = portServer.address();
        const selectedPort = typeof address === "object" && address ? address.port : null;
        portServer.close((error) => error ? reject(error) : resolvePromise(selectedPort));
      });
    });
    const origin = `http://127.0.0.1:${port}`;
    const serverEnv = sanitizedEnv(tempHome, { NODE_OPTIONS: "--max-old-space-size=512" });
    server = spawn(nodeExec, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: repo,
      env: serverEnv,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    });
    let serverSpawnError;
    server.once("error", (error) => { serverSpawnError = error; });
    const startupAt = Date.now();
    let ready = false;
    while (Date.now() - startupAt < 60_000) {
      if (serverSpawnError) throw new Error("Could not start Next production server: " + safeError(serverSpawnError));
      if (server.exitCode !== null || server.signalCode !== null) throw new Error("Next production server exited before readiness.");
      try {
        const request = await getHttp("/", origin, 1500);
        let status;
        try {
          status = request.response.status;
          await request.response.body?.cancel();
        } finally { request.finish(); }
        if (status === 200) { ready = true; break; }
      } catch {}
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    if (!ready) throw new Error("Next production server did not become ready within 60 seconds.");
    const pageNonces = new Map();
    for (const path of ["/", "/login"]) {
      try {
        const page = await inspectPage(path, origin);
        pageNonces.set(path, page.nonceForComparison);
        const safePage = { ...page };
        delete safePage.nonceForComparison;
        receipt.pages.push(safePage);
        receipt.sriTotals.sameOriginScripts += page.sri.sameOriginCount;
        receipt.sriTotals.externalScriptsSkipped += page.sri.externalCount;
        receipt.sriTotals.missingOrInvalid += page.sri.issues.length;
        receipt.errors.push(...page.errors);
      } catch (error) {
        receipt.errors.push(`page:${path}:${safeError(error)}`);
      }
    }
    const homeNonce = pageNonces.get("/");
    const loginNonce = pageNonces.get("/login");
    receipt.nonceRotation = { checked: Boolean(homeNonce && loginNonce), distinct: Boolean(homeNonce && loginNonce && homeNonce !== loginNonce) };
    if (!receipt.nonceRotation.checked) receipt.errors.push("nonce-rotation:could-not-compare-page-nonces");
    else if (!receipt.nonceRotation.distinct) receipt.errors.push("nonce-rotation:nonce-reused");
    receipt.status = receipt.errors.length === 0 ? "passed" : "failed";
  } catch (error) {
    receipt.errors.push(safeError(error));
    if (error?.diagnostic) receipt.diagnostics.push(error.diagnostic);
  } finally {
    await stopChild(server);
    if (tempHome) {
      // No dotenv or application output is stored here; only remove this exact private temp directory.
      try { await (await import("node:fs/promises")).rm(tempHome, { recursive: true, force: true }); } catch {}
    }
    receipt.finishedAt = new Date().toISOString();
    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    } catch (error) {
      console.error("Could not write JSON receipt: " + safeError(error));
      return 2;
    }
  }
  if (receipt.status !== "passed") {
    console.error(`SRI production check failed; receipt: ${outputPath}; errors: ${receipt.errors.length}`);
    return 1;
  }
  console.log(`SRI production check passed; receipt: ${outputPath}; checked ${receipt.sriTotals.sameOriginScripts} same-origin scripts across ${receipt.pages.length} pages.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
