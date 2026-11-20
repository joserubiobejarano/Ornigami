import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const operatorScript = path.join(root, "scripts", "builder-invite-operator.mjs");
const evidenceRoot = path.join(root, ".local", "builder-generation-limits");
rmSync(evidenceRoot, { recursive: true, force: true });
mkdirSync(evidenceRoot, { recursive: true });
const storeDir = mkdtempSync(path.join(evidenceRoot, "store-"));

for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  assert.equal(
    existsSync(path.join(root, name)),
    false,
    `Generation limits evidence requires no dotenv file (${name})`,
  );
}
assert.equal(
  existsSync(path.join(root, "builder-runtime", ".next", "BUILD_ID")),
  true,
  "Build the builder runtime before running generation limits evidence",
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const requestIds = {
  a1: randomUUID(),
  a2: randomUUID(),
  a3: randomUUID(),
  a4: randomUUID(),
  b1: randomUUID(),
  b2: randomUUID(),
  b3: randomUUID(),
  timeout: randomUUID(),
  invalid: randomUUID(),
  unknown: randomUUID(),
};

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
    BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS: "40000",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "200",
    BUILDER_RUNTIME_LIMIT_WINDOW_SECONDS: "3600",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "10",
    BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT: "100",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "1",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "1",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "100000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "200000",
    BUILDER_RUNTIME_REQUEST_RESERVE_MICROS: "50000",
    BUILDER_RUNTIME_RESERVATION_LEASE_SECONDS: "60",
    ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}),
    ...(process.env.ORNIGAMI_OFFLINE_LOG ? { ORNIGAMI_OFFLINE_LOG: process.env.ORNIGAMI_OFFLINE_LOG } : {}),
    ...extra,
  };
}

async function startServer(extra) {
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

async function redeem(server, token) {
  const response = await fetch(`${server.baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: server.baseUrl,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }).toString(),
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  const payload = JSON.parse(body);
  return { subjectId: payload.subjectId, cookie: sessionCookie(response) };
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
      rights: "Synthetic local fixture for limits evidence",
      contentHash: "a".repeat(64),
    },
    operatorConfirmations: {
      offer: "20% off, was $12, now $9",
      destination: "https://example.invalid/lumen",
      rights: "Synthetic local fixture for limits evidence",
    },
    reviewedOn: "2026-11-20",
  };
}

async function generate(server, identity, requestId, options = {}) {
  const response = await fetch(`${server.baseUrl}/api/builder/generate`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: server.baseUrl,
      cookie: identity.cookie,
      "content-type": "application/json",
      "x-builder-subject": identity.subjectId,
    },
    body: JSON.stringify({ browserBrief: browserBrief(), requestId }),
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, payload };
}

function usageFor(store, subjectId) {
  return store.usage.filter((item) => item.subjectId === subjectId);
}

function spendFor(store, subjectId) {
  return usageFor(store, subjectId).reduce((total, item) => {
    if (item.state === "failed") return total;
    return total + (item.costMicros ?? item.reservedCostMicros ?? 0);
  }, 0);
}

const inviteA = issueInvite("Limits identity A");
const inviteB = issueInvite("Limits identity B");
const inviteC = issueInvite("Limits identity C");

let server = null;
try {
  server = await startServer({ BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS: "250" });
  const identityA = await redeem(server, inviteA.token);
  const invalidRequestId = await generate(server, identityA, "1");
  assert.equal(invalidRequestId.status, 400);
  assert.equal(usageFor(listStore(), identityA.subjectId).length, 0);
  record("invalid request id is denied before reservation", {
    status: invalidRequestId.status,
  });

  const first = await generate(server, identityA, requestIds.a1);
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  record("authenticated success", { status: first.status, revision: first.payload?.preview?.revision ?? null });

  const duplicate = await generate(server, identityA, requestIds.a1);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.payload?.error, "request_already_submitted");
  record("same request id is idempotent", { status: duplicate.status });

  const concurrent = await Promise.all([
    generate(server, identityA, requestIds.a2),
    generate(server, identityA, requestIds.a3),
  ]);
  const statuses = concurrent.map((item) => item.status).sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 429]);
  const concurrencyDenied = concurrent.find((item) => item.status === 429);
  assert.equal(concurrencyDenied?.payload?.code, "subject_concurrency");
  record("concurrency cap denies one actual route request", { statuses });

  const afterConcurrency = listStore();
  assert.equal(usageFor(afterConcurrency, identityA.subjectId).length, 2);
  assert.equal(spendFor(afterConcurrency, identityA.subjectId), 80_000);
  record("accounting after success/duplicate/concurrency", {
    records: usageFor(afterConcurrency, identityA.subjectId).length,
    spendMicros: spendFor(afterConcurrency, identityA.subjectId),
  });

  const spendDenied = await generate(server, identityA, requestIds.a4);
  assert.equal(spendDenied.status, 429);
  assert.equal(spendDenied.payload?.code, "subject_spend");
  record("spend cap denies before dispatch", { status: spendDenied.status, code: spendDenied.payload.code });

  const afterDenial = listStore();
  assert.equal(usageFor(afterDenial, identityA.subjectId).length, 2, "denied requests must not create usage records");
  record("denied request does not consume quota", {
    records: usageFor(afterDenial, identityA.subjectId).length,
  });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS: "0",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "2",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "1000000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "1000000",
  });
  const identityB = await redeem(server, inviteB.token);
  for (const id of [requestIds.b1, requestIds.b2]) {
    const response = await generate(server, identityB, id);
    assert.equal(response.status, 200, JSON.stringify(response.payload));
  }
  const requestDenied = await generate(server, identityB, requestIds.b3);
  assert.equal(requestDenied.status, 429);
  assert.equal(requestDenied.payload?.code, "subject_requests");
  record("restart preserves accounting and request window", {
    status: requestDenied.status,
    retryAfter: requestDenied.headers.get("retry-after"),
    subjectARecords: usageFor(listStore(), identityA.subjectId).length,
  });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_PROVIDER: "timeout",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "150",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "10",
    BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT: "100",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "1000000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "1000000",
  });
  const identityC = await redeem(server, inviteC.token);
  const timeout = await generate(server, identityC, requestIds.timeout);
  assert.equal(timeout.status, 200);
  assert.equal(timeout.payload?.generation?.code, "timeout");
  const afterTimeout = listStore();
  const timeoutUsage = usageFor(afterTimeout, identityC.subjectId).find((item) => item.requestKey === requestIds.timeout);
  assert.equal(timeoutUsage?.state, "unknown");
  record("timeout is reserved as unknown", { state: timeoutUsage?.state, costMicros: timeoutUsage?.costMicros });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_PROVIDER: "invalid",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "200",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "10",
    BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT: "100",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "1000000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "1000000",
  });
  const invalid = await generate(server, identityC, requestIds.invalid);
  assert.equal(invalid.status, 200);
  assert.equal(invalid.payload?.generation?.code, "invalid");
  const invalidUsage = usageFor(listStore(), identityC.subjectId).find((item) => item.requestKey === requestIds.invalid);
  assert.equal(invalidUsage?.state, "unknown");
  record("invalid output is reserved as unknown", { state: invalidUsage?.state });
  await server.stop();
  server = null;

  server = await startServer({
    BUILDER_RUNTIME_TEST_PROVIDER: "unknown",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "200",
    BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "10",
    BUILDER_RUNTIME_GLOBAL_REQUEST_LIMIT: "100",
    BUILDER_RUNTIME_SUBJECT_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_GLOBAL_CONCURRENCY_LIMIT: "2",
    BUILDER_RUNTIME_SUBJECT_SPEND_LIMIT_MICROS: "1000000",
    BUILDER_RUNTIME_GLOBAL_SPEND_LIMIT_MICROS: "1000000",
  });
  const unknown = await generate(server, identityC, requestIds.unknown);
  assert.equal(unknown.status, 200);
  assert.equal(unknown.payload?.generation?.code, "provider-error");
  const unknownUsage = usageFor(listStore(), identityC.subjectId).find((item) => item.requestKey === requestIds.unknown);
  assert.equal(unknownUsage?.state, "unknown");
  record("unknown provider outcome is reserved", { state: unknownUsage?.state });
  await server.stop();
  server = null;

  const beforeReconcile = listStore();
  const unknownIds = usageFor(beforeReconcile, identityC.subjectId)
    .filter((item) => item.state === "unknown")
    .map((item) => item.id);
  assert.equal(unknownIds.length, 3);
  const reconciled = runOperator([
    "reconcile-usage",
    "--id",
    unknownIds[0],
    "--outcome",
    "succeeded",
    "--cost-micros",
    "25000",
    "--reason",
    "synthetic invoice review",
  ]);
  assert.equal(reconciled.changed, true);
  const reconciledFailed = runOperator([
    "reconcile-usage",
    "--id",
    unknownIds[1],
    "--outcome",
    "failed",
    "--reason",
    "synthetic provider did not run",
  ]);
  assert.equal(reconciledFailed.changed, true);
  const afterReconcile = listStore();
  const reconciledUsage = afterReconcile.usage.filter((item) => unknownIds.includes(item.id));
  assert.equal(reconciledUsage.filter((item) => item.state === "unknown").length, 1);
  assert.equal(reconciledUsage.find((item) => item.id === unknownIds[0])?.costMicros, 25_000);
  assert.equal(reconciledUsage.find((item) => item.id === unknownIds[1])?.costMicros, 0);
  record("operator reconciliation closes ambiguous reservations", {
    reconciledSucceeded: reconciledUsage.find((item) => item.id === unknownIds[0])?.state,
    reconciledFailed: reconciledUsage.find((item) => item.id === unknownIds[1])?.state,
    remainingUnknown: reconciledUsage.filter((item) => item.state === "unknown").length,
  });

  const finalStore = listStore();
  writeFileSync(
    path.join(evidenceRoot, "results.json"),
    `${JSON.stringify({ storeDir, results, usage: finalStore.usage, subjects: finalStore.subjects }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ok: true, checks: results.length, results }, null, 2));
} finally {
  if (server) await server.stop();
}
