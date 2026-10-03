import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { neon, neonConfig } from "@neondatabase/serverless";
import {
  describeDatabaseTarget,
  encodeFeedbackCursor,
  fetchFeedbackPage,
  parseFeedbackCursor,
  parseInboxArgs,
  writePrivateInboxArtifact,
} from "../scripts/support-inbox.mjs";
import { fakeSql, loadTs } from "./a02-test-support.mts";

const firstId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const thirdId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("support inbox pages with an exact microsecond cursor inside a read-only bounded transaction", async () => {
  const seen = { options: undefined as unknown, statements: [] as string[], params: [] as unknown[][] };
  const rows = [
    { id: secondId, created_at: "2026-10-03T12:00:00.123455Z", category: "Feedback", message: "second message", url: null, message_truncated: false, category_truncated: false, url_truncated: false },
    { id: thirdId, created_at: "2026-10-03T12:00:00.123454Z", category: "General", message: "third message", url: null, message_truncated: false, category_truncated: false, url_truncated: false },
  ];
  const database = {
    async transaction(makeQueries: (tx: (strings: TemplateStringsArray, ...params: unknown[]) => unknown) => unknown[], options: unknown) {
      seen.options = options;
      const tx = (strings: TemplateStringsArray, ...params: unknown[]) => {
        seen.statements.push(strings.join(" $ "));
        seen.params.push(params);
        return { statement: seen.statements.length };
      };
      const queries = makeQueries(tx);
      assert.equal(queries.length, 2);
      return [[], rows];
    },
  };
  const cursor = { createdAt: "2026-10-03T12:00:00.123456Z", id: firstId };
  const page = await fetchFeedbackPage(database, { limit: 1, cursor });

  assert.deepEqual(seen.options && (seen.options as { readOnly: boolean }).readOnly, true);
  assert.deepEqual(seen.options && (seen.options as { fetchOptions: { signal: AbortSignal } }).fetchOptions.signal instanceof AbortSignal, true);
  assert.match(seen.statements[0], /statement_timeout/);
  assert.match(seen.statements[1], /FROM public\.feedback/);
  assert.match(seen.statements[1], /WHERE \(COALESCE\(created_at, to_timestamp\(0\)\), id\) </);
  assert.match(seen.statements[1], /ORDER BY COALESCE\(created_at, to_timestamp\(0\)\) DESC, id DESC/);
  assert.deepEqual(seen.params[1].slice(-3), [cursor.createdAt, firstId, 2]);
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0].createdAt, "2026-10-03T12:00:00.123455Z");
  assert.equal(page.hasMore, true);
  assert.deepEqual(parseFeedbackCursor(page.nextCursor), { createdAt: page.records[0].createdAt, id: secondId });
});

test("support inbox SQL compiles through Neon HTTP with bound cursor parameters and no network", async () => {
  const originalFetch = neonConfig.fetchFunction;
  let requestBody: { queries: { query: string; params: unknown[] }[] } | undefined;
  let readOnlyHeader: string | null = null;
  neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
    requestBody = JSON.parse(String(init.body));
    readOnlyHeader = new Headers(init.headers).get("Neon-Batch-Read-Only");
    return Response.json({
      results: [
        { command: "SET", fields: [], rows: [] },
        {
          command: "SELECT",
          fields: [
            { name: "id", dataTypeID: 2950 }, { name: "created_at", dataTypeID: 25 },
            { name: "message", dataTypeID: 25 }, { name: "message_truncated", dataTypeID: 16 },
            { name: "category", dataTypeID: 25 }, { name: "category_truncated", dataTypeID: 16 },
            { name: "url", dataTypeID: 25 }, { name: "url_truncated", dataTypeID: 16 },
          ],
          rows: [[firstId, "2026-10-03T12:00:00.123456Z", "synthetic", "f", "Feedback", "f", null, "f"]],
        },
      ],
    });
  };
  try {
    const database = neon("postgresql://readonly:synthetic@db.example.test/ornigami", { disableWarningInBrowsers: true });
    const page = await fetchFeedbackPage(database, {
      limit: 10,
      cursor: { createdAt: "2026-10-03T12:00:00.123457Z", id: secondId },
    });
    assert.equal(readOnlyHeader, "true");
    assert.equal(requestBody?.queries.length, 2);
    assert.match(requestBody?.queries[1].query ?? "", /FROM public\.feedback/u);
    assert.match(requestBody?.queries[1].query ?? "", /WHERE \(COALESCE\(created_at, to_timestamp\(0\)\), id\) </u);
    assert.equal(requestBody?.queries[1].params.at(-3), "2026-10-03T12:00:00.123457Z");
    assert.equal(requestBody?.queries[1].params.at(-2), secondId);
    assert.equal(page.records[0].createdAt, "2026-10-03T12:00:00.123456Z");
  } finally {
    neonConfig.fetchFunction = originalFetch;
  }
});

test("support inbox validates bounds/cursors and shows only the sanitized database target", () => {
  assert.equal(parseInboxArgs(["--limit", "100"]).limit, 100);
  assert.throws(() => parseInboxArgs(["--limit", "101"]), /Limit/);
  assert.throws(() => parseFeedbackCursor("not-a-cursor"), /Invalid cursor/);
  assert.throws(() => parseFeedbackCursor(encodeFeedbackCursor({ createdAt: "2026-10-03T12:00:00.123Z", id: firstId })), /Invalid cursor/);
  assert.deepEqual(describeDatabaseTarget("postgresql://secret:password@db.example.test/support"), { host: "db.example.test", database: "support" });
});

test("private artifact includes review data on disk and no content is emitted by the inbox writer", async () => {
  const fixtureRoot = join(resolve(process.cwd()), ".next", "a12-support-visibility-test");
  assert.equal(isAbsolute(fixtureRoot), true);
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });
  try {
    const path = await writePrivateInboxArtifact({
      page: { records: [{ id: firstId, message: "SYNTHETIC-CONTACT-BODY" }], hasMore: false, nextCursor: null },
      target: { host: "db.test", database: "synthetic" },
      now: new Date("2026-10-03T12:00:00.000Z"),
      env: { ...process.env, NODE_ENV: "test", LOCALAPPDATA: fixtureRoot, XDG_STATE_HOME: fixtureRoot },
      platform: process.platform,
    });
    assert.equal(isAbsolute(path), true);
    const withinFixture = relative(fixtureRoot, path);
    assert.equal(withinFixture.startsWith(`..${sep}`) || withinFixture === "..", false);
    assert.match(withinFixture, /^Ornigami[\\/]support-inbox[\\/]/i);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    assert.equal(parsed.records[0].message, "SYNTHETIC-CONTACT-BODY");
    if (process.platform === "win32") {
      const identityOutput = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true }).trim();
      const account = identityOutput.match(/^\s*"([^"]+)"/u)?.[1];
      assert.ok(account);
      const acl = execFileSync("icacls.exe", [dirname(path)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }).replace(dirname(path), "").trim();
      const aclEntries = acl.split(/\r?\n/u).filter((line) => line.includes(":(") && /\([FMRXW]\)/u.test(line));
      assert.equal(aclEntries.length, 1);
      assert.equal(aclEntries[0].toLocaleLowerCase("en-US").includes(`${account}:`.toLocaleLowerCase("en-US")), true);
      assert.equal(aclEntries[0].includes("(F)"), true);
    } else {
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("feedback POST preserves the public rate limit and logs only a fixed error code", async () => {
  let allowed = true;
  let failInsert = false;
  const logCalls: unknown[][] = [];
  const { sql, calls } = fakeSql(() => {
    if (failInsert) throw new Error("private request body: alice@example.test");
    return [];
  });
  const route = loadTs<{
    POST: (request: Request) => Promise<Response>;
  }>("src/app/api/feedback/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: async () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }) },
    "@/lib/db/neon": { sql },
    "@/lib/safe-logger": { safeLogger: { error: (...args: unknown[]) => logCalls.push(args) } },
    "@/lib/trusted-request-ip": { getTrustedRequestIp: () => "192.0.2.1" },
    "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async (key: string, limit: number) => { assert.equal(key, "feedback:ip:192.0.2.1"); assert.equal(limit, 10); return allowed; } },
  });
  const request = () => new Request("https://example.test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "A private contact message", category: "General" }),
  });

  allowed = false;
  const limited = await route.POST(request());
  assert.equal(limited.status, 429);
  assert.equal(calls.length, 0);

  allowed = true;
  const accepted = await route.POST(request());
  assert.equal(accepted.status, 200);
  assert.equal(calls.length, 1);

  failInsert = true;
  const failed = await route.POST(request());
  assert.equal(failed.status, 500);
  assert.deepEqual(logCalls, [["feedback.post.failed", { error: "internal_error" }]]);
  assert.equal(JSON.stringify(logCalls).includes("alice@example.test"), false);
});
