import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const appRoot = join(root, "builder-runtime");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const dotenvFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
assert.ok(
  dotenvFiles.every((name) => !existsSync(join(root, name))),
  "Builder runtime smoke requires no dotenv files",
);

const dist = join(appRoot, ".next");
const appPaths = JSON.parse(
  readFileSync(join(dist, "server", "app-paths-manifest.json"), "utf8"),
);
assert.deepEqual(
  Object.keys(appPaths).sort(),
  [
    "/_global-error/page",
    "/_not-found/page",
    "/api/builder/generate/route",
    "/builder/page",
    "/page",
  ],
  "The builder build contains a route outside the builder surface",
);

const instrumentationPath = join(dist, "server", "instrumentation.js");
assert.ok(existsSync(instrumentationPath), "Builder instrumentation was not built");
const instrumentation = readFileSync(instrumentationPath, "utf8");
assert.doesNotMatch(instrumentation, /@sentry|next-auth|@neondatabase|stripe|resend/i);

const expectedHashes = new Set();
const staticScriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
function collectHtml(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(path);
    else if (entry.isFile() && entry.name.endsWith(".html")) {
      const html = readFileSync(path, "utf8");
      for (const match of html.matchAll(staticScriptPattern)) {
        if (match[1]) {
          expectedHashes.add(
            createHash("sha256").update(match[1], "utf8").digest("base64"),
          );
        }
      }
    }
  }
}
collectHtml(join(dist, "server", "app"));
const staticHashes = JSON.parse(
  readFileSync(join(dist, "static-csp-hashes.json"), "utf8"),
);
assert.ok(Array.isArray(staticHashes));
assert.deepEqual(
  [...expectedHashes].sort(),
  staticHashes,
  "Builder static CSP hashes do not match built HTML",
);

const sriManifest = JSON.parse(
  readFileSync(
    join(dist, "server", "subresource-integrity-manifest.json"),
    "utf8",
  ),
);
assert.ok(
  Object.keys(sriManifest).some((path) => path.endsWith("/_ssgManifest.js")),
  "Builder SRI manifest does not contain the current SSG manifest",
);

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_APP_URL: baseUrl,
  ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
  ...(process.env.ORNIGAMI_OFFLINE_LOG
    ? { ORNIGAMI_OFFLINE_LOG: process.env.ORNIGAMI_OFFLINE_LOG }
    : {}),
};
for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
  if (process.env[key]) childEnv[key] = process.env[key];
}

const child = spawn(
  process.execPath,
  [nextBin, "start", "builder-runtime", "--hostname", "127.0.0.1", "--port", String(port)],
  { cwd: root, env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
let spawnError;
child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
child.on("error", (error) => { spawnError = error; });
const exited = () => child.exitCode !== null || child.signalCode !== null;
async function request(path, init) {
  return fetch(baseUrl + path, {
    redirect: "manual",
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
}
async function waitForChildClose(processHandle = child) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => processHandle.once("close", resolve)),
    sleep(5000),
  ]);
}
function responseNonce(response) {
  const csp = response.headers.get("content-security-policy") ?? "";
  const scriptPolicy = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] ?? "";
  assert.ok(scriptPolicy, "Builder response CSP is missing script-src");
  assert.doesNotMatch(scriptPolicy, /'unsafe-(?:inline|eval)'/);
  const nonce = scriptPolicy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "Builder response CSP is missing its script nonce");
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /stripe|googleapis|openai|neon|resend|sentry/i);
  return nonce;
}
function assertBuilderResponse(response, label) {
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /connect-src 'self'/, `${label} CSP must stay same-origin`);
  assert.doesNotMatch(csp, /stripe|googleapis|openai|neon|resend|sentry/i);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i, `${label} must not be cached`);
  assert.equal(response.headers.get("set-cookie"), null, `${label} must not set a cookie`);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/i, `${label} must be noindex`);
}
async function expectNotFound(path, init, label = path) {
  const response = await request(path, init);
  assert.equal(response.status, 404, `${label} must be absent from the builder runtime`);
  assertBuilderResponse(response, label);
  return response;
}

try {
  let ready = false;
  const startupDeadline = Date.now() + 60_000;
  while (Date.now() < startupDeadline) {
    if (spawnError) throw new Error("Could not start builder runtime: " + spawnError.message);
    if (exited()) {
      throw new Error(`Builder runtime exited (${child.exitCode ?? child.signalCode}):\n${output}`);
    }
    try {
      const response = await fetch(baseUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      // The server is still starting.
    }
    await sleep(250);
  }
  assert.ok(ready, `Builder runtime did not become ready:\n${output}`);

  const home = await request("/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /text\/html/);
  assertBuilderResponse(home, "builder home");
  const homeHtml = await home.text();
  assert.match(homeHtml, /<title>Ornigami Builder<\/title>/);
  assert.match(homeHtml, /name="robots" content="noindex, nofollow"/);
  assert.match(homeHtml, /This builder is not open/);
  for (const legacyText of [
    "every review, answered",
    "Review Booster",
    "Review Replies",
    "Sign in",
    "See pricing",
  ]) {
    assert.doesNotMatch(homeHtml, new RegExp(legacyText, "i"), `Builder home contains legacy text: ${legacyText}`);
  }
  for (const legacyPath of ["/login", "/pricing", "/dashboard", "/api/auth"]) {
    assert.doesNotMatch(homeHtml, new RegExp(legacyPath.replace("/", "\\/")), `Builder home links to legacy path ${legacyPath}`);
  }

  const stylesheet = homeHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? homeHtml.match(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/i)?.[1];
  assert.ok(stylesheet, "Builder home has no stylesheet");
  const css = await request(stylesheet);
  assert.equal(css.status, 200, "Builder stylesheet did not load");
  const cssText = await css.text();
  assert.match(cssText, /#f5f1e8/i);
  assert.match(cssText, /font-display/);

  const homeNonce = responseNonce(home);
  const inlineScripts = [...homeHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => !/\bsrc\s*=/.test(attrs) && body.trim());
  assert.ok(inlineScripts.length > 0, "Builder home has no inline hydration scripts");
  for (const [, attrs] of inlineScripts) {
    assert.equal(attrs.match(/\bnonce=["']([^"']+)["']/)?.[1], homeNonce);
  }
  const secondHome = await request("/");
  assert.notEqual(responseNonce(secondHome), homeNonce, "Builder nonce must rotate between requests");

  const scripts = [...homeHtml.matchAll(/<script\b([^>]*)>/gi)]
    .map(([, attrs]) => ({
      src: attrs.match(/\bsrc=["']([^"']+)["']/)?.[1] ?? null,
      integrity: attrs.match(/\bintegrity=["']([^"']+)["']/)?.[1] ?? null,
    }))
    .filter((script) => script.src);
  const integrityScripts = scripts.filter((script) => script.integrity);
  assert.ok(integrityScripts.length > 0, "Builder HTML has no SRI-protected scripts");
  for (const script of integrityScripts) {
    const response = await request(script.src);
    assert.equal(response.status, 200, `Static script ${script.src} did not load`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("base64");
    assert.equal(script.integrity, `sha256-${digest}`, `SRI mismatch for ${script.src}`);
  }

  const favicon = await request("/ornigami-favicon.svg");
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get("content-type") ?? "", /image\/svg\+xml/);
  const fontManifestResponse = await request("/fonts/manifest.json");
  assert.equal(fontManifestResponse.status, 200);
  const fontManifest = await fontManifestResponse.json();
  const firstFont = fontManifest.fonts?.[0]?.file;
  assert.ok(firstFont, "Builder font manifest is empty");
  const fontResponse = await request(`/fonts/${firstFont}`);
  assert.equal(fontResponse.status, 200, "Builder local font did not load");
  assert.match(fontResponse.headers.get("content-type") ?? "", /font\/woff2/);

  const builder = await expectNotFound("/builder");
  assert.match(await builder.text(), /This builder is not open/);

  const api = await expectNotFound("/api/builder/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ browserBrief: { schemaVersion: 1 } }),
  });
  assert.deepEqual(await api.json(), { ok: false, error: "Not found." });

  const legacyRoutes = [
    "/login",
    "/signup",
    "/pricing",
    "/dashboard",
    "/account/deletion",
    "/campaign-lab",
    "/campaign-lab/offer",
    "/api/auth/providers",
    "/api/auth/session",
    "/api/stripe/checkout",
    "/api/cron/health",
    "/api/cron/review-booster",
    "/api/webhooks/resend",
    "/api/webhooks/booking",
    "/api/google/connection",
    "/api/openai/review-reply",
    "/api/projects",
    "/opengraph-image",
    "/robots.txt",
  ];
  for (const path of legacyRoutes) await expectNotFound(path, undefined, path);
  await expectNotFound("/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, "POST /api/stripe/checkout");
  await expectNotFound("/api/webhooks/resend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, "POST /api/webhooks/resend");

  for (const [envPatch, label] of [
    [{ BUILDER_BETA_ACCESS_MODE: "invite" }, "invite access"],
    [{ BUILDER_GENERATION_PROVIDER: "openai" }, "provider"],
  ]) {
    const invalidPort = await reservePort();
    const invalid = spawn(
      process.execPath,
      [nextBin, "start", "builder-runtime", "--hostname", "127.0.0.1", "--port", String(invalidPort)],
      {
        cwd: root,
        env: { ...childEnv, NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${invalidPort}`, ...envPatch },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let invalidOutput = "";
    invalid.stdout.on("data", (chunk) => { invalidOutput += chunk; });
    invalid.stderr.on("data", (chunk) => { invalidOutput += chunk; });
    const closed = await Promise.race([
      new Promise((resolve) => invalid.once("close", () => resolve(true))),
      sleep(30_000).then(() => false),
    ]);
    if (!closed) {
      invalid.kill();
      await waitForChildClose(invalid);
    }
    assert.ok(closed, `Invalid ${label} startup did not stop`);
    assert.equal(invalid.exitCode, 1, `Invalid ${label} startup must exit 1`);
    assert.match(invalidOutput, /Builder configuration is invalid/);
  }

  console.log(
    "Builder runtime smoke passed: builder-only route inventory, dynamic nonce/SRI, no-store/no-cookie headers, local fonts/assets, closed builder page/API, absent legacy routes, and fail-closed startup.",
  );
  console.log("Note: runtime CSP is enforced by the builder proxy; static CSP hashes are generated and parity-checked filesystem evidence.");
} finally {
  if (!exited()) {
    child.kill();
    await waitForChildClose();
    if (!exited()) {
      child.kill("SIGKILL");
      await waitForChildClose();
    }
  }
}
