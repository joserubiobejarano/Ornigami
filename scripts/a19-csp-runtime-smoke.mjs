import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

const root = process.cwd();
const dotenvFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
assert.ok(dotenvFiles.every((name) => !existsSync(join(root, name))), "A19 runtime smoke requires a clean worktree without dotenv files");
const keepServing = process.argv.includes("--serve");
const requestedPort = process.env.A19_SMOKE_PORT ? Number(process.env.A19_SMOKE_PORT) : 0;
assert.ok(Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535, "A19_SMOKE_PORT must be a valid TCP port");
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(requestedPort, "127.0.0.1", () => {
    const address = server.address();
    const value = typeof address === "object" && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(value));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;
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
child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-12_000); });
child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-12_000); });
child.on("error", (error) => { spawnError = error; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exited = () => child.exitCode !== null || child.signalCode !== null;
async function stop() {
  if (exited()) return;
  child.kill();
  await Promise.race([new Promise((resolve) => child.once("close", resolve)), sleep(5000)]);
  if (!exited()) child.kill("SIGKILL");
}

try {
  let ready = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Could not start next start: ${spawnError.message}`);
    if (exited()) throw new Error(`next start exited (${child.exitCode ?? child.signalCode}):\n${output}`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await sleep(250);
  }
  assert.ok(ready, `next start did not become ready within 60 seconds:\n${output}`);

  async function page(path, expectedStatus, checkHydration = true) {
    const response = await fetch(baseUrl + path, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, expectedStatus, `${path} returned unexpected HTTP status`);
    const csp = response.headers.get("content-security-policy") ?? "";
    const tt = response.headers.get("content-security-policy-report-only") ?? "";
    const reportTo = response.headers.get("reporting-endpoints") ?? "";
    const formPolicy = csp.match(/(?:^|;\s*)form-action\s+([^;]+)/)?.[1] ?? "";
    assert.ok(formPolicy.startsWith("'self'"), `${path} lacks same-origin form-action`);
    for (const host of ["https://checkout.stripe.com", "https://billing.stripe.com"]) {
      assert.ok(formPolicy.split(/\s+/).includes(host), `${path} form-action is missing ${host}`);
    }
    assert.ok(!formPolicy.split(/\s+/).includes("https://accounts.google.com"), `${path} unexpectedly allows Google form submissions`);
    assert.match(csp, /(?:^|;\s*)object-src 'none'(?:;|$)/, `${path} allows embedded objects`);
    assert.match(csp, /(?:^|;\s*)base-uri 'self'(?:;|$)/, `${path} lacks base-uri restriction`);
    assert.match(tt, /require-trusted-types-for 'script'/, `${path} lacks report-only Trusted Types policy`);
    assert.match(reportTo, /csp-endpoint="\/api\/csp-report"/, `${path} lacks CSP report endpoint declaration`);
    const scriptPolicy = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/)?.[1] ?? "";
    assert.ok(scriptPolicy, `${path} is missing script-src`);
    assert.doesNotMatch(scriptPolicy, /'unsafe-(?:inline|eval)'/, `${path} has an unsafe production script source`);
    const nonce = scriptPolicy.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, `${path} is missing a request script nonce`);
    const html = await response.text();
    if (!checkHydration) return { nonce, html, location: response.headers.get("location") };
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs, body]) => {
        const type = attrs.match(/\btype=(["'])([^"']+)\1/i)?.[2]?.trim().toLowerCase();
        const executable = !type || type === "module" || /^(?:text|application)\/(?:javascript|ecmascript)$/.test(type);
        return !/\bsrc\s*=/.test(attrs) && body.trim() && executable;
      });
    assert.ok(scripts.length > 0, `${path} contains no inline hydration scripts`);
    for (const [, attrs] of scripts) {
      assert.equal(attrs.match(/\bnonce=["']([^"']+)["']/i)?.[1], nonce, `${path} has inline script without matching nonce`);
    }
    return { nonce, html };
  }

  const renderedPages = [
    ["/", 200],
    ["/login", 200],
    ["/signup", 200],
    ["/forgot-password", 200],
    ["/reset-password", 200],
    ["/demo", 200],
    ["/demo/review-booster", 200],
    ["/demo/review-replies", 200],
  ];
  const rendered = [];
  for (const [path, status] of renderedPages) rendered.push([path, await page(path, status)]);
  const nonces = new Set(rendered.map(([, result]) => result.nonce));
  assert.equal(nonces.size, rendered.length, "CSP nonce must rotate between rendered route requests");
  await page("/__a19_missing_route_probe__", 404);
  const dashboard = await page("/dashboard", 307, false);
  assert.equal(new URL(dashboard.location, baseUrl).pathname, "/login", "anonymous dashboard should redirect to login");

  console.log(`A19 local CSP smoke passed on ${baseUrl}: ${renderedPages.length} rendered home/auth/demo routes and a 404 nonce/CSP check, per-route nonce rotation/hydration, anonymous dashboard CSP redirect, and report-only Trusted Types headers.`);
  if (keepServing) {
    console.log("Local fixture server is available for browser inspection. Press Ctrl+C to stop it.");
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await stop();
}
