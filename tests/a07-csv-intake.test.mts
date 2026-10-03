import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";
import test from "node:test";

import { loadTs as loadSameRealmTs } from "./a02-test-support.mts";
import { parseCsv, CsvParseError } from "../src/modules/review-booster/services/csv-parsing.service.ts";
import { isValidCustomerPhone, normalizeVisitedAt } from "../src/modules/review-booster/services/intake-input.service.ts";
import { loadTs } from "./auth-test-harness.mts";

test("CSV parsing rejects malformed records and maps quoted multiline fields", () => {
  assert.deepEqual(parseCsv('customer_name,customer_email,visited_at\n"Jane, Doe",jane@example.test,2026-05-25')[0], {
    customer_name: "Jane, Doe", customer_email: "jane@example.test", visited_at: "2026-05-25",
  });
  assert.equal(parseCsv('customer_name,customer_email,visited_at\n"Jane\nDoe",jane@example.test,2026-05-25')[0]?.customer_name, "Jane\nDoe");
  assert.throws(() => parseCsv("customer_name,customer_email,visited_at\nJane,jane@example.test"), CsvParseError);
  assert.throws(() => parseCsv('customer_email,customer_email,visited_at\na,b,2026-05-25'), /duplicate column/);
  assert.throws(() => parseCsv('customer_email,visited_at\n"open,jane@example.test'), /unterminated/);
});

test("visit timestamps normalize equivalent instants and reject timezone ambiguity", () => {
  assert.equal(normalizeVisitedAt("2026-05-25"), "2026-05-25T00:00:00.000Z");
  assert.equal(normalizeVisitedAt("2026-05-25T02:00:00+02:00"), "2026-05-25T00:00:00.000Z");
  assert.equal(normalizeVisitedAt("2026-05-25T00:00:00"), null);
  assert.equal(normalizeVisitedAt("2026-02-30"), null);
  assert.equal(isValidCustomerPhone("+34 600 000 000"), true);
  assert.equal(isValidCustomerPhone("phone me"), false);
});

test("upload route returns row failures independently and permits retry", async () => {
  let first = true;
  let saved = 0;
  const route = uploadRoute({
    createVisit: async () => {
      if (first) { first = false; throw new Error("transient database failure"); }
      saved += 1;
      return { id: `visit-${saved}` };
    },
  });
  const firstResponse = await route.POST(uploadRequest([
    "customer_name,customer_email,service_received,visited_at",
    "Alex,alex@example.test,Consultation,2026-05-25",
    "Rae,rae@example.test,Consultation,2026-05-25",
  ].join("\n")));
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), {
    rows_processed: 2,
    visits_inserted: 1,
    rows_skipped: 1,
    duplicates_skipped: 0,
    errors: [{ row: 2, message: "Could not save this row. Retry the import; previously imported rows will count as duplicates." }],
  });

  const retryResponse = await route.POST(uploadRequest([
    "customer_name,customer_email,service_received,visited_at",
    "Alex,alex@example.test,Consultation,2026-05-25",
  ].join("\n")));
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json() as { visits_inserted: number }).visits_inserted, 1);
});

test("upload route rejects malformed CSV, cross-origin, unauthenticated, and inactive requests before writes", async () => {
  let writes = 0;
  const route = uploadRoute({ createVisit: async () => { writes += 1; return { id: "visit" }; } });
  const malformed = await route.POST(uploadRequest("customer_email,visited_at\n\"broken,alex@example.test"));
  assert.equal(malformed.status, 400);
  const crossOrigin = await route.POST(uploadRequest("customer_email,visited_at\na@example.test,2026-05-25", "https://attacker.test"));
  assert.equal(crossOrigin.status, 403);
  const unauthenticated = uploadRoute({ auth: async () => null, createVisit: async () => { writes += 1; return {}; } });
  assert.equal((await unauthenticated.POST(uploadRequest("customer_email,visited_at\na@example.test,2026-05-25"))).status, 401);
  const inactive = uploadRoute({
    requireAccess: async () => { throw Object.assign(new Error("Agent access is inactive"), { status: 403 }); },
    createVisit: async () => { writes += 1; return {}; },
  });
  assert.equal((await inactive.POST(uploadRequest("customer_email,visited_at\na@example.test,2026-05-25"))).status, 403);
  assert.equal(writes, 0);
});

test("upload route bounds actual streamed multipart bytes and rejects oversized declared lengths before writes", async () => {
  let writes = 0;
  const route = uploadRoute({ createVisit: async () => { writes += 1; return {}; } });
  const tooLarge = 1024 * 1024 + 64 * 1024 + 1;
  const streamed = new Request("http://app.test/api/review-booster/upload", {
    method: "POST",
    headers: { origin: "http://app.test", "content-type": "multipart/form-data; boundary=a07-boundary" },
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(tooLarge)); controller.close(); },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.equal(streamed.headers.get("content-length"), null);
  assert.equal((await route.POST(streamed)).status, 413);

  const forgedLength = new Request("http://app.test/api/review-booster/upload", {
    method: "POST",
    headers: { origin: "http://app.test", "content-length": String(tooLarge) },
    body: new FormData(),
  });
  assert.equal((await route.POST(forgedLength)).status, 413);
  assert.equal(writes, 0);
});

test("manual visit route rejects wrong-type contact fields even when a phone is valid", async () => {
  let writes = 0;
  const route = loadSameRealmTs<{ POST: (request: Request) => Promise<Response> }>("src/app/api/review-booster/visits/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: async () => ({ user: { id: id(700), email: "a07-owner@example.test" } }) },
    "@/lib/api-security": {
      requireActiveAgentAccess: async () => ({ id: id(702) }),
      safeApiErrorResponse: () => Response.json({ error: "failed" }, { status: 500 }),
    },
    "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
    "@/modules/review-booster/services/intake-input.service": loadSameRealmTs("src/modules/review-booster/services/intake-input.service.ts", {}),
    "@/modules/review-booster/services/review-booster-db.service": { createFollowupVisit: async () => { writes += 1; return {}; } },
  });
  const response = await route.POST(new Request("http://app.test/api/review-booster/visits", {
    method: "POST",
    headers: { origin: "http://app.test", "content-type": "application/json" },
    body: JSON.stringify({ customer_email: 7, customer_phone: "+34 600 000 000", visited_at: "2026-05-25" }),
  }));
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

let port = 0;
const binDir = process.env.A07_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A06_PG_BIN ?? process.env.PG_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const pgExe = (name: string) => process.platform === "win32" ? join(binDir, `${name}.exe`) : join(binDir, name);
const quote = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], {
    encoding: "utf8", input: statement,
  }).trim();
}

function psqlAsync(statement: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.stdin.end(statement);
    child.once("close", (code) => code === 0 ? resolvePromise(stdout.trim()) : reject(new Error(`psql exited ${code}: ${stderr}`)));
  });
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port available");
  const selected = address.port;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return selected;
}

function startPsql(statement: string) {
  const child = spawn(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const done = new Promise<void>((resolvePromise, reject) => child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`PostgreSQL transaction exited ${code}: ${stderr}`))));
  child.stdin.end(statement);
  return { child, output: () => stdout, errors: () => stderr, done };
}

async function waitForOutput(readOutput: () => string, needle: string, timeoutMs = 5000) {
  const started = Date.now();
  while (!readOutput().includes(needle)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for PostgreSQL output: ${needle}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

function sqlExecutor() {
  return async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((output, part, index) => output + part + (index < values.length ? quote(values[index]) : ""), "");
    const output = await psqlAsync(`WITH a07_query AS (${query}) SELECT row_to_json(a07_query)::text FROM a07_query;`);
    return output ? output.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>) : [];
  };
}

function id(n: number) { return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }

type UploadRoute = { POST: (request: Request) => Promise<Response> };
type CsvInserter = (input: Record<string, unknown>, actorId: string) => Promise<unknown>;
function uploadRoute(input: {
  auth?: () => Promise<unknown>;
  requireAccess?: (userId: string) => Promise<unknown>;
  createVisit: CsvInserter;
}): UploadRoute {
  return loadSameRealmTs<UploadRoute>("src/app/api/review-booster/upload/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: input.auth ?? (async () => ({ user: { id: id(700), email: "a07-owner@example.test" } })) },
    "@/lib/api-security": {
      requireActiveAgentAccess: input.requireAccess ?? (async () => ({ id: id(702) })),
      safeApiErrorResponse: (error: unknown) => {
        const status = typeof error === "object" && error && "status" in error ? Number((error as { status: unknown }).status) : 500;
        return Response.json({ error: error instanceof Error ? error.message : "failed" }, { status });
      },
    },
    "@/lib/team-lifecycle": {
      isSameOriginMutation: (request: Request) => request.headers.get("origin") === new URL(request.url).origin,
    },
    "@/modules/review-booster/services/csv-parsing.service": loadSameRealmTs("src/modules/review-booster/services/csv-parsing.service.ts", {}),
    "@/modules/review-booster/services/intake-input.service": loadSameRealmTs("src/modules/review-booster/services/intake-input.service.ts", {}),
    "@/modules/review-booster/services/review-booster-db.service": { createCsvFollowupVisit: input.createVisit },
  });
}

function uploadRequest(csv: string, origin = "http://app.test") {
  const body = new FormData();
  body.append("file", new File([csv], "visits.csv", { type: "text/csv" }));
  return new Request("http://app.test/api/review-booster/upload", { method: "POST", headers: { origin }, body });
}

test("CSV insertion uses the partial unique index outcome and enforces persisted member and entitlement", async () => {
  port = await availablePort();
  const nextDir = resolve(process.cwd(), ".next");
  mkdirSync(nextDir, { recursive: true });
  const dir = mkdtempSync(join(nextDir, "a07-booking-pg-"));
  assert.ok(resolve(dir).startsWith(`${nextDir}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    const logFile = join(dir, "postgres.log");
    try {
      execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", logFile, "-o", `-h 127.0.0.1 -p ${port} -F`, "-w", "start"], { stdio: "ignore" });
    } catch (error) {
      throw new Error(`Disposable PostgreSQL startup failed:\n${existsSync(logFile) ? readFileSync(logFile, "utf8") : "No PostgreSQL log"}`, { cause: error });
    }
    started = true;
    const migrationsDir = join(process.cwd(), "neon/migrations");
    const migrations = readdirSync(migrationsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort((a, b) => Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
    for (const migration of migrations) psql(readFileSync(join(migrationsDir, migration), "utf8"));

    const owner = id(700); const member = id(701); const biz = id(702);
    psql(`INSERT INTO public.users(id,email) VALUES('${owner}','a07-owner@example.test'),('${member}','a07-member@example.test');
      INSERT INTO public.businesses(id,owner_user_id,name) VALUES('${biz}','${owner}','A07 fixture');
      INSERT INTO public.business_agents(business_id,agent_id,plan_id,status) VALUES('${biz}','review_booster','booster','active');`);
    const reviewDb = loadTs<typeof import("../src/modules/review-booster/services/review-booster-db.service.js")>(
      "src/modules/review-booster/services/review-booster-db.service.ts", {
        overrides: {
          "@/lib/db/neon": { sql: sqlExecutor() },
          "@/lib/billing/plans": { PLANS: { booster: { monthlyRequestAllowance: 500 }, complete: { monthlyRequestAllowance: 1500 } }, isPlanId: (value: unknown) => value === "booster" || value === "complete" },
          "@/lib/api-security": { HttpError: class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } } },
          "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
        },
      });

    const input = { businessId: biz, customerEmail: "Jane@Example.test", serviceName: "Haircut", visitedAt: "2026-05-25T00:00:00.000Z" };
    const results = await Promise.all([
      reviewDb.createCsvFollowupVisit(input, owner),
      reviewDb.createCsvFollowupVisit({ ...input, customerEmail: "jane@example.test", visitedAt: "2026-05-24T19:00:00-05:00" }, owner),
    ]);
    assert.deepEqual(results.map((result) => result === null).sort(), [false, true]);
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${biz}'`), "1");

    const routed = uploadRoute({
      requireAccess: async () => ({ id: biz }),
      createVisit: reviewDb.createCsvFollowupVisit as CsvInserter,
    });
    const parallelCsv = "customer_name,customer_email,service_received,visited_at\nParallel,parallel@example.test,Color,2026-05-26";
    const parallelResponses = await Promise.all([
      routed.POST(uploadRequest(parallelCsv)),
      routed.POST(uploadRequest(parallelCsv)),
    ]);
    const parallelBodies = await Promise.all(parallelResponses.map((response) => response.json() as Promise<{
      visits_inserted: number; rows_skipped: number; duplicates_skipped: number;
    }>));
    assert.deepEqual(parallelResponses.map((response) => response.status), [200, 200]);
    assert.deepEqual(parallelBodies.map((body) => body.visits_inserted).sort(), [0, 1]);
    assert.deepEqual(parallelBodies.map((body) => body.duplicates_skipped).sort(), [0, 1]);
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${biz}'`), "2");

    psql(`INSERT INTO public.business_members(business_id,user_id) VALUES('${biz}','${member}');`);
    assert.ok(await reviewDb.createCsvFollowupVisit({ ...input, customerEmail: "member@example.test" }, member));
    const memberRoute = uploadRoute({
      auth: async () => ({ user: { id: member, email: "a07-member@example.test" } }),
      requireAccess: async (userId) => {
        assert.equal(userId, member);
        return { id: biz };
      },
      createVisit: reviewDb.createCsvFollowupVisit as CsvInserter,
    });
    const memberCsv = "customer_name,customer_email,service_received,visited_at\nMember,member-route@example.test,Color,2026-05-27";
    const memberResponse = await memberRoute.POST(uploadRequest(memberCsv));
    assert.equal(memberResponse.status, 200);
    assert.equal((await memberResponse.json() as { visits_inserted: number }).visits_inserted, 1);
    psql(`DELETE FROM public.business_members WHERE business_id='${biz}' AND user_id='${member}';`);
    await assert.rejects(reviewDb.createCsvFollowupVisit({ ...input, customerEmail: "member@example.test" }, member));
    const removedMemberResponse = await memberRoute.POST(uploadRequest(memberCsv.replace("member-route@", "removed-member@")));
    assert.equal(removedMemberResponse.status, 200);
    assert.equal((await removedMemberResponse.json() as { visits_inserted: number }).visits_inserted, 0);
    const phoneOnly = await reviewDb.createFollowupVisit({ ...input, customerEmail: null, customerPhone: "+34 600 000 000", source: "manual" }, owner);
    assert.equal(phoneOnly.followup_status, "non_sendable");
    assert.equal(phoneOnly.customer_email, null);
    psql(`UPDATE public.business_agents SET status='inactive' WHERE business_id='${biz}' AND agent_id='review_booster';`);
    await assert.rejects(reviewDb.createFollowupVisit({ ...input, customerEmail: null, customerPhone: "+34 600 000 000", source: "manual" }, owner));
    psql(`UPDATE public.business_agents SET status='active' WHERE business_id='${biz}' AND agent_id='review_booster';
      UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${owner}';`);
    await assert.rejects(reviewDb.createCsvFollowupVisit({ ...input, customerEmail: "frozen-owner@example.test" }, owner), (error: unknown) => (error as { status?: number }).status === 403);
    await assert.rejects(reviewDb.createFollowupVisit({ ...input, customerEmail: null, customerPhone: "+34 600 000 001", source: "manual" }, owner), (error: unknown) => (error as { status?: number }).status === 403);
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${biz}'`), "5");
    psql(`UPDATE public.users SET privacy_deletion_requested_at=NULL WHERE id='${owner}';`);

    const freeze = startPsql(`BEGIN;
      SELECT id FROM public.businesses WHERE id='${biz}' FOR UPDATE;
      UPDATE public.users SET privacy_deletion_requested_at=now() WHERE id='${owner}';
      \\echo A07_FREEZE_LOCKED
      SELECT pg_sleep(0.5);
      COMMIT;`);
    try {
      await waitForOutput(freeze.output, "A07_FREEZE_LOCKED");
      await assert.rejects(
        reviewDb.createCsvFollowupVisit({ ...input, customerEmail: "freeze-race@example.test" }, owner),
        (error: unknown) => (error as { status?: number }).status === 403,
      );
      await freeze.done;
      assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${biz}' AND customer_email='freeze-race@example.test'`), "0");
    } finally {
      if (freeze.child.exitCode === null) freeze.child.kill();
      psql(`UPDATE public.users SET privacy_deletion_requested_at=NULL WHERE id='${owner}';`);
    }
    assert.equal(psql(`SELECT count(*) FROM public.followup_visits WHERE business_id='${biz}'`), "5");
  } finally {
    if (started) {
      try { execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" }); } catch { /* preserve test failure */ }
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
