import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  authenticateA10FixtureOwner,
  createA10SyntheticVisit,
  runA10AuthenticatedNow,
} from "../scripts/a10-live-app-auth.mjs";

const OWNER_ID = "a2000000-0000-4000-8000-000000000001";
const OUTSIDER_ID = "a2000000-0000-4000-8000-000000000004";
const PRIVATE_EMAIL = "synthetic-owner@a20.example.test";
const PRIVATE_PASSWORD = "A20-test-only-password-never-report";
const CONTROLLED_EMAIL = "controlled@example.test";

async function credentialsFile() {
  const root = await mkdtemp(join(tmpdir(), "a10-live-auth-"));
  const directory = join(root, ".a20-fixture");
  await mkdir(directory);
  const path = join(directory, "credentials.json");
  await writeFile(path, JSON.stringify({
    task: "A20",
    credentials: {
      owner: { email: PRIVATE_EMAIL, password: PRIVATE_PASSWORD },
      outsider: { email: "synthetic-outsider@a20.example.test", password: "A20-outsider-password-never-report" },
    },
    actors: { owner: { id: OWNER_ID }, outsider: { id: OUTSIDER_ID } },
  }));
  return { root, path };
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

test("authenticates fixture owner, creates a labeled synthetic visit, and triggers run-now without returning PII", async (t) => {
  const file = await credentialsFile();
  t.after(() => rm(file.root, { recursive: true, force: true }));
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/auth/csrf")) return response({ csrfToken: "csrf-private" }, 200, { "set-cookie": "authjs.csrf-token=csrf-cookie; Path=/; HttpOnly" });
    if (url.endsWith("/api/auth/callback/credentials")) return response({ url: "http://127.0.0.1:43001/dashboard" }, 200, { "set-cookie": "authjs.session-token=session-private; Path=/; HttpOnly" });
    if (url.endsWith("/api/auth/session")) return response({ user: { id: OWNER_ID } });
    if (url.endsWith("/api/review-booster/visits")) return response({ id: "a2000000-0000-4000-8000-000000000099", customer_email: CONTROLLED_EMAIL }, 201);
    if (url.endsWith("/api/review-booster/run-now")) return response({ ok: true, scanned: 1, sent: 1, failed: 0, skipped: 0, unknown: 0, deferred: 0 });
    throw new Error("unexpected URL in mocked fetcher");
  };
  const session = await authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, fetcher });
  assert.equal(session.actorId, OWNER_ID);
  const visit = await createA10SyntheticVisit(session, {
    recipient: CONTROLLED_EMAIL,
    label: "owned-test-inbox",
    visitedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const run = await runA10AuthenticatedNow(session);

  assert.deepEqual(visit, { status: 201, visitId: "a2000000-0000-4000-8000-000000000099", recipientLabel: "owned-test-inbox" });
  assert.deepEqual(run, { ok: true, scanned: 1, sent: 1, failed: 0, skipped: 0, unknown: 0, deferred: 0 });
  assert.equal(calls.length, 5);
  const loginBody = calls[1].init.body as URLSearchParams;
  assert.equal(loginBody.get("email"), PRIVATE_EMAIL);
  assert.equal(loginBody.get("password"), PRIVATE_PASSWORD);
  assert.match(String(calls[1].init.headers && new Headers(calls[1].init.headers).get("cookie")), /authjs\.csrf-token=csrf-cookie/);
  const visitBody = JSON.parse(String(calls[3].init.body));
  assert.equal(visitBody.customer_email, CONTROLLED_EMAIL);
  assert.equal(visitBody.visited_at, new Date(visitBody.visited_at).toISOString());
  assert.equal(new Headers(calls[3].init.headers).get("origin"), "http://127.0.0.1:43001");
  assert.equal(new Headers(calls[4].init.headers).get("sec-fetch-site"), "same-origin");
  assert.equal(JSON.stringify({ session: { actorId: session.actorId }, visit, run }).includes(PRIVATE_PASSWORD), false);
  assert.equal(JSON.stringify({ session: { actorId: session.actorId }, visit, run }).includes(CONTROLLED_EMAIL), false);
});

test("refuses non-loopback app origins and credentials outside the private fixture path", async (t) => {
  const file = await credentialsFile();
  t.after(() => rm(file.root, { recursive: true, force: true }));
  const fetcher: typeof fetch = async () => { throw new Error("network must not be called"); };
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "https://example.test", credentialsPath: file.path, fetcher }), /exact HTTP loopback origin/);
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001/path", credentialsPath: file.path, fetcher }), /exact HTTP loopback origin/);
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: join(file.root, "credentials.json"), fetcher }), /private A20 fixture file/);
});

test("fails closed when Auth.js redirects off-origin or returns another user", async (t) => {
  const file = await credentialsFile();
  t.after(() => rm(file.root, { recursive: true, force: true }));
  const redirectFetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) return response({ csrfToken: "csrf" });
    return response({ url: "https://outside.example/" });
  };
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, fetcher: redirectFetcher }), /redirect escaped/);

  const actorFetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) return response({ csrfToken: "csrf" });
    if (url.endsWith("/api/auth/callback/credentials")) return response({ url: "http://127.0.0.1:43001/dashboard" });
    if (url.endsWith("/api/auth/session")) return response({ user: { id: "a2000000-0000-4000-8000-000000000002" } });
    throw new Error("unexpected URL");
  };
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, fetcher: actorFetcher }), /did not match the synthetic owner/);
});

test("accepts Auth.js localhost normalization only on the same loopback port", async (t) => {
  const file = await credentialsFile();
  t.after(() => rm(file.root, { recursive: true, force: true }));
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) return response({ csrfToken: "csrf" });
    if (url.endsWith("/api/auth/callback/credentials")) return response({ url: "http://localhost:43001/dashboard" });
    if (url.endsWith("/api/auth/session")) return response({ user: { id: OWNER_ID } });
    throw new Error("unexpected URL");
  };
  const session = await authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, fetcher });
  assert.equal(session.appOrigin, "http://127.0.0.1:43001");
  await assert.rejects(authenticateA10FixtureOwner({
    appUrl: "http://127.0.0.1:43001",
    credentialsPath: file.path,
    fetcher: async (input) => String(input).endsWith("/api/auth/csrf")
      ? response({ csrfToken: "csrf" })
      : response({ url: "http://localhost:43002/dashboard" }),
  }), /exact loopback app port/);
});

test("can authenticate only the explicitly selected private outsider fixture actor", async (t) => {
  const file = await credentialsFile();
  t.after(() => rm(file.root, { recursive: true, force: true }));
  const requestedEmails: string[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/api/auth/csrf")) return response({ csrfToken: "csrf" });
    if (url.endsWith("/api/auth/callback/credentials")) {
      requestedEmails.push(new URLSearchParams(String(init.body)).get("email") || "");
      return response({ url: "http://127.0.0.1:43001/dashboard" });
    }
    if (url.endsWith("/api/auth/session")) return response({ user: { id: OUTSIDER_ID } });
    throw new Error("unexpected URL");
  };
  const session = await authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, actorRole: "outsider", fetcher });
  assert.equal(session.actorId, OUTSIDER_ID);
  assert.deepEqual(requestedEmails, ["synthetic-outsider@a20.example.test"]);
  await assert.rejects(authenticateA10FixtureOwner({ appUrl: "http://127.0.0.1:43001", credentialsPath: file.path, actorRole: "member" as never, fetcher }), /role is not allowed/);
});

test("visit helper enforces its recipient label and 7-day eligibility window", async () => {
  const session = { actorId: OWNER_ID, request: async () => { throw new Error("request must not be called"); } };
  await assert.rejects(createA10SyntheticVisit(session, { recipient: CONTROLLED_EMAIL, label: "resend-bounce-test", visitedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }), /recipient is invalid/);
  await assert.rejects(createA10SyntheticVisit(session, { recipient: "bounced@resend.dev", label: "owned-test-inbox", visitedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }), /recipient is invalid/);
  await assert.rejects(createA10SyntheticVisit(session, { recipient: CONTROLLED_EMAIL, label: "owned-test-inbox", visitedAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }), /last six days/);
});
