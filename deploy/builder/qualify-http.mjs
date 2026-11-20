#!/usr/bin/env node
/**
 * Builder packaged-runtime HTTP journey for qualify-linux.sh.
 *
 * This file is mounted read-only into the builder container and executed by the
 * image's own Node. It has no package dependencies. Every command prints one
 * JSON evidence line to stderr and exits non-zero when the expectation fails.
 */
import { randomUUID } from "node:crypto";

const baseUrl = process.env.QUALIFY_BASE_URL ?? "http://127.0.0.1:3000";
const origin = process.env.QUALIFY_ORIGIN ?? baseUrl;

function evidence(entry) {
  process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function fail(message, detail) {
  evidence({ ok: false, error: message, ...detail });
  process.stderr.write(`QUALIFY HTTP FAIL: ${message}\n`);
  process.exit(1);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    fail(`${label} expected status ${expected}, got ${response.status}`, {
      label,
      status: response.status,
    });
  }
}

async function cancel(response) {
  await response.body?.cancel();
}

async function smoke() {
  const home = await fetch(`${baseUrl}/`, { redirect: "manual" });
  await cancel(home);
  expectStatus(home, 200, "home");
  const builder = await fetch(`${baseUrl}/builder`, { redirect: "manual" });
  await cancel(builder);
  expectStatus(builder, 404, "anonymous /builder");
  const session = await fetch(`${baseUrl}/api/builder/session`, {
    redirect: "manual",
    cache: "no-store",
  });
  await cancel(session);
  expectStatus(session, 401, "anonymous session");
  evidence({ ok: true, check: "smoke", home: 200, builder: 404, session: 401 });
}

async function redeem(token) {
  const response = await fetch(`${baseUrl}/api/builder/session/redeem`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }).toString(),
  });
  const text = await response.text();
  expectStatus(response, 200, "redeem");
  const payload = JSON.parse(text);
  const raw =
    response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  if (!raw) fail("redeem did not set a session cookie");
  const cookie = raw.split(";")[0];
  if (!cookie.includes("=")) fail("redeem returned an unusable cookie");
  evidence({
    ok: true,
    check: "redeem",
    subjectId: payload.subjectId,
    cookieBytes: cookie.length,
  });
  if (hasFlag("--print-cookie")) {
    process.stdout.write(cookie);
  } else {
    process.stdout.write(
      JSON.stringify({ subjectId: payload.subjectId, cookie }),
    );
  }
}

async function session(cookie) {
  const response = await fetch(`${baseUrl}/api/builder/session`, {
    redirect: "manual",
    cache: "no-store",
    headers: { cookie },
  });
  const text = await response.text();
  const expected = Number.parseInt(option("--expect-status") ?? "200", 10);
  expectStatus(response, expected, "session");
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // A denied session may not carry JSON; the status is authoritative.
  }
  const expectedSubject = option("--subject");
  if (expected === 200 && expectedSubject && payload?.subjectId !== expectedSubject) {
    fail("session subject mismatch", { payload, expectedSubject });
  }
  evidence({
    ok: true,
    check: "session",
    status: response.status,
    subjectId: payload?.subjectId ?? null,
  });
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
      rights: "Synthetic local fixture for packaging qualification",
      contentHash: "a".repeat(64),
    },
    operatorConfirmations: {
      offer: "20% off, was $12, now $9",
      destination: "https://example.invalid/lumen",
      rights: "Synthetic local fixture for packaging qualification",
    },
    reviewedOn: "2026-11-20",
  };
}

async function generate(cookie, subjectId, requestId) {
  const response = await fetch(`${baseUrl}/api/builder/generate`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin,
      cookie,
      "content-type": "application/json",
      "x-builder-subject": subjectId,
    },
    body: JSON.stringify({ browserBrief: browserBrief(), requestId }),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // The status and message remain evidence.
  }
  const expectedStatus = Number.parseInt(option("--expect-status") ?? "200", 10);
  if (response.status !== expectedStatus) {
    fail(
      `generate expected status ${expectedStatus}, got ${response.status}`,
      { status: response.status, payload },
    );
  }
  const expectedCode = option("--expect-code");
  if (expectedCode && payload?.code !== expectedCode) {
    fail(`generate expected code ${expectedCode}, got ${payload?.code}`, {
      status: response.status,
      payload,
    });
  }
  evidence({
    ok: true,
    check: "generate",
    status: response.status,
    code: payload?.code ?? null,
    error: payload?.error ?? null,
  });
}

async function logout(cookie) {
  const response = await fetch(`${baseUrl}/api/builder/session/logout`, {
    method: "POST",
    redirect: "manual",
    headers: { origin, cookie },
  });
  const text = await response.text();
  expectStatus(response, 200, "logout");
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // The status is authoritative.
  }
  evidence({
    ok: true,
    check: "logout",
    status: response.status,
    state: payload?.state ?? null,
  });
}

const [command, ...args] = process.argv.slice(2);
if (command === "smoke") {
  await smoke();
} else if (command === "redeem" && args[0]) {
  await redeem(args[0]);
} else if (command === "session" && args[0]) {
  await session(args[0]);
} else if (command === "generate" && args.length >= 3) {
  await generate(args[0], args[1], args[2] || randomUUID());
} else if (command === "logout" && args[0]) {
  await logout(args[0]);
} else {
  fail("unknown or incomplete command", { command, args });
}
