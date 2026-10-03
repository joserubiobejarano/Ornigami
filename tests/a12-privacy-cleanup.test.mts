import assert from "node:assert/strict";
import test from "node:test";

import { loadTs } from "./auth-test-harness.mts";

test("cleanup walks tables sequentially, rotates its durable cursor, and reports full batches as backlog", async () => {
  const queries: string[] = [];
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => { queries.push(strings.join(" ")); return [{ deleted: 2 }]; } },
    "@/lib/safe-logger": { safeLogger: { error() {}, info() {} } },
  } });
  const checkpoints: Array<[number, number]> = [];
  const first = await service.runPrivacyRetentionCleanup({ batchSize: 2, maxOperations: 3, cursor: 9,
    checkpoint: async (cursor, count) => { checkpoints.push([cursor, count]); } });
  assert.deepEqual(JSON.parse(JSON.stringify(first.operations.map((operation) => operation.table))), [
    "cron_runs", "password_reset_tokens", "leads",
  ]);
  assert.equal(first.status, "partial");
  assert.equal(first.backlog, true);
  assert.equal(first.nextCursor, 1);
  assert.deepEqual(checkpoints, [[10, 2], [0, 4], [1, 6]]);
  await service.runPrivacyRetentionCleanup({ batchSize: 1, maxOperations: 1, cursor: 7 });
  assert.ok(queries.some((query) => query.includes("public.review_link_clicks") && query.includes("clicked_at")));
  assert.ok(queries.some((query) => query.includes("status <> 'running'") && query.includes("finished_at IS NOT NULL")));
  assert.ok(queries.every((query) => /LIMIT/i.test(query)));
  assert.ok(!queries.some((query) => /cron_job_state|cron_alert|privacy_account_deletion_operations|unsubscribe_suppressions|review_reply_usage_reservations|booster_quota_legacy_usage/.test(query)));
});

test("cleanup respects an elapsed deadline before beginning another table and leaves a resumable cursor", async () => {
  let calls = 0;
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async () => { calls += 1; return [{ deleted: 1 }]; } },
    "@/lib/safe-logger": { safeLogger: { error() {}, info() {} } },
  } });
  const result = await service.runPrivacyRetentionCleanup({ cursor: 4, deadlineAt: new Date(0) });
  assert.equal(calls, 0);
  assert.equal(result.attempted, 0);
  assert.equal(result.status, "partial");
  assert.equal(result.backlog, true);
  assert.equal(result.nextCursor, 4);
});

test("one table failure is isolated and a later pass resumes from the following table", async () => {
  const seen: string[] = [];
  const service = loadTs<typeof import("../src/lib/privacy-retention-cleanup.js")>("src/lib/privacy-retention-cleanup.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" "); seen.push(query);
      if (query.includes("public.feedback")) throw new Error("secret row payload must not be logged");
      return [{ deleted: 0 }];
    } },
    "@/lib/safe-logger": { safeLogger: { error: (_event: string, context: Record<string, unknown>) => assert.deepEqual(JSON.parse(JSON.stringify(context)), { table: "feedback", error: "operation_failed" }), info() {} } },
  } });
  const first = await service.runPrivacyRetentionCleanup({ cursor: 0, maxOperations: 2 });
  assert.equal(first.status, "partial");
  assert.equal(first.failed, 1);
  assert.equal(first.nextCursor, 2);
  const second = await service.runPrivacyRetentionCleanup({ cursor: first.nextCursor, maxOperations: 1 });
  assert.equal(second.operations[0]?.table, "public_demo_events");
  assert.equal(seen.length, 3);
});

test("privacy cron authorization fails before health acquisition or database cleanup", async () => {
  let acquisitions = 0;
  const route = loadTs<typeof import("../src/app/api/cron/privacy/route.js")>("src/app/api/cron/privacy/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => false },
    "@/lib/cron-health": { acquireCronJobRun: async () => { acquisitions += 1; throw new Error("must not run"); } },
    "@/lib/privacy-retention-cleanup": { runPrivacyRetentionCleanup: async () => { throw new Error("must not run"); } },
  } });
  const response = await route.GET(new Request("https://local.test/api/cron/privacy"));
  assert.equal(response.status, 401);
  assert.equal(acquisitions, 0);
});

test("privacy cron persists sanitized per-table health and returns partial when one table fails", async () => {
  let finish: Record<string, unknown> | undefined;
  const route = loadTs<typeof import("../src/app/api/cron/privacy/route.js")>("src/app/api/cron/privacy/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => ({ runId: "run", fence: 3, cursor: 0, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 2 }),
      checkpointCronJobRun: async () => undefined,
      finishCronJobRun: async (input: Record<string, unknown>) => { finish = input; },
      CronLeaseBusyError: class extends Error {},
    },
    "@/lib/privacy-retention-cleanup": { runPrivacyRetentionCleanup: async (input: { checkpoint: (cursor: number, count: number) => Promise<void> }) => {
      await input.checkpoint(1, 4);
      return { attempted: 2, deleted: 4, failed: 1, batchSize: 2, status: "partial", nextCursor: 1, backlog: true,
        operations: [
          { table: "leads", deleted: 4, failed: false, fullBatch: true },
          { table: "feedback", deleted: 0, failed: true, fullBatch: false },
        ] };
    } },
  } });
  const response = await route.GET(new Request("https://local.test/api/cron/privacy"));
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 500);
  assert.equal(body.ok, false);
  assert.equal(body.status, "partial");
  assert.equal(finish?.status, "partial");
  assert.equal(finish?.processedCount, 4);
  assert.equal(finish?.failedCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(finish?.outcomes)), {
    leads: { deleted: 4, failed: false, complete: false },
    feedback: { deleted: 0, failed: true, complete: false },
  });
});

test("checkpoint outage stops cleanup and returns the committed delete count", async () => {
  let cleanupContinued = false;
  let finish: Record<string, unknown> | undefined;
  const route = loadTs<typeof import("../src/app/api/cron/privacy/route.js")>("src/app/api/cron/privacy/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => ({ runId: "run", fence: 3, cursor: 0, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 2 }),
      checkpointCronJobRun: async () => { throw new Error("database detail must not escape"); },
      finishCronJobRun: async (input: Record<string, unknown>) => { finish = input; },
      CronLeaseBusyError: class extends Error {},
    },
    "@/lib/privacy-retention-cleanup": { runPrivacyRetentionCleanup: async (input: { checkpoint: (cursor: number, count: number) => Promise<void> }) => {
      await input.checkpoint(1, 4);
      cleanupContinued = true;
      throw new Error("must stop after checkpoint failure");
    } },
  } });
  const response = await route.GET(new Request("https://local.test/api/cron/privacy"));
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 503);
  assert.equal(body.processedCount, 4);
  assert.equal(cleanupContinued, false);
  assert.equal(finish?.processedCount, 4);
  assert.equal(finish?.errorCode, "health_store_unavailable");
});

test("finish-store outage returns 503 without retrying a possibly committed terminal write", async () => {
  let finishCalls = 0;
  const route = loadTs<typeof import("../src/app/api/cron/privacy/route.js")>("src/app/api/cron/privacy/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => ({ runId: "run", fence: 3, cursor: 0, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 1 }),
      checkpointCronJobRun: async () => undefined,
      finishCronJobRun: async () => { finishCalls += 1; throw new Error("temporary health store failure"); },
      CronLeaseBusyError: class extends Error {},
    },
    "@/lib/privacy-retention-cleanup": { runPrivacyRetentionCleanup: async (input: { checkpoint: (cursor: number, count: number) => Promise<void> }) => {
      await input.checkpoint(1, 4);
      return { attempted: 1, deleted: 4, failed: 0, batchSize: 250, status: "succeeded", nextCursor: 1, backlog: false,
        operations: [{ table: "leads", deleted: 4, failed: false, fullBatch: false }] };
    } },
  } });
  const response = await route.GET(new Request("https://local.test/api/cron/privacy"));
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 503);
  assert.equal(body.processedCount, 4);
  assert.equal(finishCalls, 1);
});
