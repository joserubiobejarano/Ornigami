import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const root = process.cwd();
const dotenvFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
assert.ok(dotenvFiles.every((name) => !existsSync(join(root, name))), "Production smoke requires a clean worktree without dotenv files");

const appOutput = join(root, ".next", "server", "app");
const hashFile = join(root, ".next", "static-csp-hashes.json");
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
        if (match[1]) expectedHashes.add(createHash("sha256").update(match[1], "utf8").digest("base64"));
      }
    }
  }
}
collectHtml(appOutput);
assert.ok(existsSync(hashFile), "production build did not generate static CSP hashes");
const staticHashes = JSON.parse(readFileSync(hashFile, "utf8"));
assert.ok(Array.isArray(staticHashes) && staticHashes.every((hash) => typeof hash === "string"), "invalid static CSP hash manifest");
assert.deepEqual([...expectedHashes].sort(), staticHashes, "static CSP hashes do not match built HTML");

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
const port = await reservePort();
const baseUrl = "http://127.0.0.1:" + port;
const childEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  DATABASE_URL: "https://ci.invalid/database",
  OPENAI_API_KEY: "ci-openai-key",
  STRIPE_SECRET_KEY: "sk_test_ci_no_provider_io",
  STRIPE_WEBHOOK_SECRET: "whsec_ci_no_provider_io",
  GOOGLE_CLIENT_ID: "ci-google-client-id",
  GOOGLE_CLIENT_SECRET: "ci-google-client-secret",
  AUTH_SECRET: "ci-only-auth-secret-with-no-production-value",
  NEXTAUTH_SECRET: "ci-only-nextauth-secret-with-no-production-value",
  AUTH_TRUST_HOST: "true",
  NEXTAUTH_URL: baseUrl,
  RESEND_API_KEY: "ci-resend-key",
  EMAIL_FROM: "ci@example.com",
  REPLY_TO_EMAIL: "ci@example.com",
  TOKEN_ENCRYPTION_KEY: "ci-token-encryption-key",
  REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: "ci-unsubscribe-secret",
  CRON_SECRET: "ci-cron-secret",
  NEXT_PUBLIC_APP_URL: baseUrl,
};
for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) {
  if (process.env[key]) childEnv[key] = process.env[key];
}
const child = spawn(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let spawnError;
child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
child.on("error", (error) => { spawnError = error; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exited = () => child.exitCode !== null || child.signalCode !== null;
async function request(path, init) {
  return fetch(baseUrl + path, { redirect: "manual", ...init, signal: AbortSignal.timeout(30_000) });
}
async function expectLoginRedirect(path, init) {
  const response = await request(path, init);
  assert.ok([302, 303, 307, 308].includes(response.status), path + " should redirect anonymously, got " + response.status);
  assert.equal(new URL(response.headers.get("location"), baseUrl).pathname, "/login", path + " should redirect to login");
}
async function waitForChildClose() {
  if (exited()) return;
  await Promise.race([new Promise((resolve) => child.once("close", resolve)), sleep(5000)]);
}
try {
  let ready = false;
  const startupDeadline = Date.now() + 60_000;
  while (Date.now() < startupDeadline) {
    if (spawnError) throw new Error("Could not start next start: " + spawnError.message);
    if (exited()) throw new Error("next start exited (" + (child.exitCode ?? child.signalCode) + "):\n" + output);
    try {
      const response = await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await sleep(250);
  }
  assert.ok(ready, "next start did not become ready within 60 seconds:\n" + output);

  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  function responseNonce(response) {
    const csp = response.headers.get("content-security-policy") ?? "";
    const scriptPolicy = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] ?? "";
    assert.ok(scriptPolicy, "production response CSP is missing script-src");
    assert.doesNotMatch(scriptPolicy, /'unsafe-(?:inline|eval)'/, "production script policy must not allow unsafe inline/eval");
    const nonce = scriptPolicy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, "production response CSP is missing its script nonce");
    return nonce;
  }
  const pageNonce = responseNonce(page);
  const html = await page.text();
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => {
      const type = attrs.match(/\btype=(["'])([^"']+)\1/i)?.[2]?.trim().toLowerCase();
      const executable = !type || type === "module" || /^(?:text|application)\/(?:javascript|ecmascript)$/.test(type);
      return !/\bsrc\s*=/.test(attrs) && body.trim() && executable;
    });
  assert.ok(inlineScripts.length > 0, "production page did not include inline hydration scripts");
  for (const [, attrs] of inlineScripts) {
    const scriptNonce = attrs.match(/\bnonce=["']([^"']+)["']/)?.[1];
    assert.equal(scriptNonce, pageNonce, "inline script nonce must match response CSP");
  }

  const protectedPage = await request("/dashboard");
  assert.ok([302, 303, 307, 308].includes(protectedPage.status), "anonymous dashboard should redirect to login, got " + protectedPage.status);
  assert.equal(new URL(protectedPage.headers.get("location"), baseUrl).pathname, "/login");
  const loginPage = await request("/login");
  assert.equal(loginPage.status, 200);
  const loginNonce = responseNonce(loginPage);
  assert.notEqual(loginNonce, pageNonce, "CSP nonce must rotate between requests");

  const image = await request("/opengraph-image");
  assert.equal(image.status, 200, "Open Graph image route failed");
  assert.match(image.headers.get("content-type") ?? "", /image\/png/);
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "Open Graph response is not a PNG");

  const session = await request("/api/auth/session");
  assert.equal(session.status, 200);
  assert.equal(await session.json(), null, "auth session should be empty for anonymous smoke");
  for (const path of ["/api/user/plan", "/api/google/connection"]) {
    const response = await request(path);
    assert.equal(response.status, 401, path + " must reject an anonymous request");
    responseNonce(response);
  }
  const changePlan = await request("/api/stripe/change-plan", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(changePlan.status, 401, "billing plan change must reject an anonymous request");
  await expectLoginRedirect("/api/google/oauth/start");
  for (const path of ["/api/stripe/checkout", "/api/stripe/portal"]) {
    await expectLoginRedirect(path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan_id: "replies", billing_period: "monthly" }),
    });
  }
  console.log("Production smoke passed: static CSP hash parity, nonce-bound hydration/rotation, protected dashboard, Open Graph image, anonymous auth/Google/billing boundaries.");
  console.log("Note: static-csp-hashes.json is generated and parity-checked; it is not currently consumed by runtime CSP policy.");
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