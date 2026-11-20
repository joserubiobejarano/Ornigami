import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const operatorScript = path.join(root, "scripts", "builder-invite-operator.mjs");
const evidenceRoot = path.join(root, ".local", "builder-hardening");
rmSync(evidenceRoot, { recursive: true, force: true });
mkdirSync(evidenceRoot, { recursive: true });
const storeDir = mkdtempSync(path.join(evidenceRoot, "store-"));
const lockPath = path.join(storeDir, "identity-store.lock");

for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  assert.equal(
    existsSync(path.join(root, name)),
    false,
    `Builder hardening evidence requires no dotenv file (${name})`,
  );
}
assert.equal(
  existsSync(path.join(root, "builder-runtime", ".next", "BUILD_ID")),
  true,
  "Build the builder runtime before running hardening evidence",
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(name, detail) {
  results.push({ name, ...detail });
}

function runOperator(args) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", operatorScript, ...args, "--store", storeDir, "--json"],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function issueInvite(label) {
  return runOperator(["issue", "--label", label, "--ttl-seconds", "3600"]);
}

function listStore() {
  return runOperator(["list"]);
}

function readStoreFile() {
  return JSON.parse(
    readFileSync(path.join(storeDir, "identity-store.json"), "utf8"),
  );
}

function usageForSubject(subjectId) {
  return readStoreFile().usage.filter((item) => item.subjectId === subjectId);
}

async function reservePort() {
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

function childEnv(baseUrl, extra) {
  return {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: baseUrl,
    BUILDER_RUNTIME_MODE: "invite",
    BUILDER_RUNTIME_STORE_DIR: storeDir,
    BUILDER_RUNTIME_SESSION_TTL_SECONDS: "3600",
    BUILDER_RUNTIME_ALLOW_TEST_HOOKS: "1",
    BUILDER_RUNTIME_TEST_PROVIDER: "success",
    BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS: "10000",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "2000",
    BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS: "3600",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "100",
    BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT: "1000",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "5",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "10",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "10000000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "20000000",
    BUILDER_RUNTIME_REQUEST_RESERVE_MICROS: "50000",
    BUILDER_RUNTIME_RESERVATION_LEASE_SECONDS: "120",
    ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
    ...(process.env.ORNIGAMI_OFFLINE_LOG ? { ORNIGAMI_OFFLINE_LOG: process.env.ORNIGAMI_OFFLINE_LOG } : {}),
    ...extra,
  };
}

async function startServer(extra = {}) {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [nextBin, "start", "builder-runtime", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: childEnv(baseUrl, extra),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-16000); });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited while starting:\n${output}`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(1000) });
      if (response.status === 200) {
        return {
          baseUrl,
          output: () => output,
          stop: async () => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill();
              await Promise.race([
                new Promise((resolve) => child.once("close", resolve)),
                sleep(5000),
              ]);
              if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
            }
          },
        };
      }
    } catch {
      // Still starting.
    }
    await sleep(200);
  }
  child.kill("SIGKILL");
  throw new Error(`Server did not become ready:\n${output}`);
}

function sessionCookie(response) {
  const raw = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  assert.ok(raw, "redeem response did not set a session cookie");
  return raw.split(";")[0];
}

async function redeem(server, token, origin = server.baseUrl) {
  const response = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }).toString(),
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  const payload = JSON.parse(body);
  return { subjectId: payload.subjectId, cookie: sessionCookie(response) };
}

async function session(server, identity) {
  const response = await fetch(`${server.baseUrl}/api/builder/session`, {
    cache: "no-store",
    headers: { cookie: identity.cookie },
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

async function logout(server, identity, origin = server.baseUrl) {
  const response = await fetch(`${server.baseUrl}/api/builder/session/logout`, {
    method: "POST",
    redirect: "manual",
    headers: { origin, cookie: identity.cookie },
  });
  return {
    status: response.status,
    setCookie: response.headers.getSetCookie?.() ?? [],
    retryAfter: response.headers.get("retry-after"),
    payload: await response.json().catch(() => null),
  };
}

function browserBrief() {
  return {
    schemaVersion: 1,
    brandName: "Lumen",
    productName: "Lumen square care kit",
    audience: "",
    objective: "",
    offer: "20% off, was $12, now $9",
    destinationUrl: "https://example.invalid/lumen",
    facts: [
      { label: "Contents", value: "Three pieces" },
      { label: "Packaging", value: "Paper box" },
    ],
    asset: {
      fileName: "square.png",
      width: 1000,
      height: 1000,
      alt: "Synthetic square product package on white",
      rights: "Synthetic local fixture for hardening evidence",
      contentHash: "a".repeat(64),
    },
    operatorConfirmations: {
      offer: "20% off, was $12, now $9",
      destination: "https://example.invalid/lumen",
      rights: "Synthetic local fixture for hardening evidence",
    },
    reviewedOn: "2026-11-20",
  };
}

async function generate(server, identity, requestId, options = {}) {
  const response = await fetch(`${server.baseUrl}/api/builder/generate`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: options.origin ?? server.baseUrl,
      cookie: identity.cookie,
      "content-type": "application/json",
      "x-builder-subject": identity.subjectId,
      ...(options.headers ?? {}),
    },
    body: JSON.stringify({
      browserBrief: browserBrief(),
      ...(requestId === undefined ? {} : { requestId }),
    }),
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, payload };
}

function installBlockingLock() {
  writeFileSync(
    lockPath,
    `${JSON.stringify({
      version: 1,
      token: "evidence-blocker",
      pid: process.pid,
      hostname: hostname(),
      acquiredAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
    })}\n`,
  );
  const old = new Date("2020-01-01T00:00:00.000Z");
  utimesSync(lockPath, old, old);
}

function removeBlockingLock() {
  rmSync(lockPath, { force: true });
}

const inviteA = issueInvite("Hardening A");
const inviteB = issueInvite("Hardening B");
const inviteC = issueInvite("Hardening C");
const inviteD = issueInvite("Hardening D");
const inviteE = issueInvite("Hardening E");

let server = null;
try {
  server = await startServer();
  const identityA = await redeem(server, inviteA.token);

  const missingId = await generate(server, identityA, undefined);
  assert.equal(missingId.status, 400);
  assert.equal(usageForSubject(identityA.subjectId).length, 0);
  record("missing request id denied before reservation", {
    status: missingId.status,
  });

  const crossOrigin = await generate(server, identityA, randomUUID(), {
    origin: "https://evil.example.test",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(usageForSubject(identityA.subjectId).length, 0);
  record("full configured origin rejects a mismatched origin", {
    status: crossOrigin.status,
  });

  const generated = await generate(server, identityA, randomUUID());
  assert.equal(generated.status, 200, JSON.stringify(generated.payload));
  record("valid UUID request succeeds", {
    status: generated.status,
    revision: generated.payload?.preview?.revision ?? null,
  });

  const identityB = await redeem(server, inviteB.token);
  assert.equal((await session(server, identityB)).status, 200);

  const crossOriginLogout = await logout(server, identityB, "https://evil.example.test");
  assert.equal(crossOriginLogout.status, 403);
  assert.equal((await session(server, identityB)).status, 200);
  record("cross-origin logout is rejected without ending the session", {
    status: crossOriginLogout.status,
  });

  installBlockingLock();
  const blockedLogout = await logout(server, identityB);
  removeBlockingLock();
  assert.equal(blockedLogout.status, 503);
  assert.equal(blockedLogout.payload?.error, "logout_unconfirmed");
  assert.equal(blockedLogout.payload?.retryable, true);
  assert.equal(blockedLogout.setCookie.length, 0, "a failed logout must not clear the cookie");
  assert.equal((await session(server, identityB)).status, 200);
  record("unconfirmed revocation returns retryable 503 and keeps the session", {
    status: blockedLogout.status,
    retryAfter: blockedLogout.retryAfter,
    cookieCleared: blockedLogout.setCookie.length > 0,
  });

  const confirmedLogout = await logout(server, identityB);
  assert.equal(confirmedLogout.status, 200);
  assert.equal(confirmedLogout.payload?.state, "revoked");
  assert.ok(confirmedLogout.setCookie.length > 0);
  assert.equal((await session(server, identityB)).status, 401);
  const repeatedLogout = await logout(server, identityB);
  assert.equal(repeatedLogout.status, 200);
  assert.equal(repeatedLogout.payload?.state, "already_inactive");
  record("successful logout confirms revocation, then reports already inactive", {
    state: confirmedLogout.payload?.state,
    repeatedState: repeatedLogout.payload?.state,
    postLogoutSessionStatus: 401,
  });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT: "2",
    BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT: "10",
    BUILDER_RUNTIME_TRUST_PROXY_HEADERS: "1",
  });
  const limitedClient = { "x-forwarded-for": "198.51.100.9" };
  const oversized = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    headers: {
      origin: server.baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      ...limitedClient,
    },
    body: `token=${"x".repeat(5000)}`,
  });
  assert.equal(oversized.status, 413);
  const invalid = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    headers: {
      origin: server.baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      ...limitedClient,
    },
    body: "token=unknown",
  });
  assert.equal(invalid.status, 400);
  const limited = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    headers: {
      origin: server.baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      ...limitedClient,
    },
    body: "token=unknown",
  });
  assert.equal(limited.status, 429);
  assert.ok(Number.parseInt(limited.headers.get("retry-after") ?? "", 10) >= 1);
  const otherClient = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    headers: {
      origin: server.baseUrl,
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "198.51.100.10",
    },
    body: new URLSearchParams({ token: inviteE.token }).toString(),
  });
  assert.equal(otherClient.status, 200, await otherClient.text());
  record("redemption body and attempts are bounded per client", {
    oversizedStatus: oversized.status,
    invalidStatus: invalid.status,
    rateLimitedStatus: limited.status,
    otherClientStatus: otherClient.status,
  });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS: "2000",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "3000",
  });
  const identityC = await redeem(server, inviteC.token);
  const revocationRequestId = randomUUID();
  const inFlight = generate(server, identityC, revocationRequestId, {
    signal: AbortSignal.timeout(30_000),
  });
  await sleep(250);
  runOperator(["revoke-subject", "--subject", identityC.subjectId]);
  const revokedBeforeDispatch = await inFlight;
  assert.equal(revokedBeforeDispatch.status, 401);
  assert.equal(revokedBeforeDispatch.payload?.error, "session_inactive");
  const beforeDispatchUsage = usageForSubject(identityC.subjectId).find(
    (item) => item.requestKey === revocationRequestId,
  );
  assert.equal(beforeDispatchUsage?.state, "failed");
  assert.equal(beforeDispatchUsage?.costMicros, 0);
  assert.equal(
    beforeDispatchUsage?.settlementReason,
    "session_revoked_before_dispatch",
  );
  record("revocation during admitted delay stops before provider dispatch", {
    status: revokedBeforeDispatch.status,
    ledgerState: beforeDispatchUsage?.state,
    costMicros: beforeDispatchUsage?.costMicros,
  });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_PROVIDER: "timeout",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "1200",
  });
  const identityD = await redeem(server, inviteD.token);
  const postDispatchRequestId = randomUUID();
  const dispatched = generate(server, identityD, postDispatchRequestId, {
    signal: AbortSignal.timeout(30_000),
  });
  await sleep(250);
  runOperator(["revoke-subject", "--subject", identityD.subjectId]);
  const revokedAfterDispatch = await dispatched;
  assert.equal(revokedAfterDispatch.status, 401);
  assert.equal(revokedAfterDispatch.payload?.error, "session_inactive");
  const afterDispatchUsage = usageForSubject(identityD.subjectId).find(
    (item) => item.requestKey === postDispatchRequestId,
  );
  assert.equal(afterDispatchUsage?.state, "unknown");
  assert.equal(afterDispatchUsage?.costMicros, 50_000);
  record("revocation after dispatch suppresses the preview and preserves exposure", {
    status: revokedAfterDispatch.status,
    ledgerState: afterDispatchUsage?.state,
    costMicros: afterDispatchUsage?.costMicros,
  });

  const finalStore = listStore();
  writeFileSync(
    path.join(evidenceRoot, "results.json"),
    `${JSON.stringify({ storeDir, results, usage: finalStore.usage, subjects: finalStore.subjects }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, checks: results.length, results }, null, 2));
} finally {
  removeBlockingLock();
  if (server) await server.stop();
}
