import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

test("cron alert transport sends only fixed operational context and reports durable health", async () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.test/1";
  const queries: string[] = [];
  const logs: Array<{ event: string; meta: unknown }> = [];
  let outgoing: Record<string, unknown> | undefined;
  const service = loadTs<typeof import("../src/lib/cron-alerts.js")>("src/lib/cron-alerts.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      queries.push(query);
      if (query.includes("claim_cron_alerts")) return [{ alert_key: "review_replies:failed", job_name: "review_replies", reason: "failed" }];
      if (query.includes("count(*) FILTER")) return [{ active_count: 1, transport_failures: 0 }];
      return [];
    } },
    "@/lib/safe-logger": { safeLogger: { error: (event: string, meta: unknown) => logs.push({ event, meta }) } },
    "@sentry/nextjs": {
      withScope(callback: (scope: Record<string, unknown>) => void) {
        let processor: ((event: Record<string, unknown>) => Record<string, unknown>) | undefined;
        const scope = {
          clearBreadcrumbs() {}, clearAttachments() {}, setUser() {}, setLevel() {}, setTag() {},
          addEventProcessor(value: typeof processor) { processor = value; },
        };
        callback(scope);
        const event = { event_id: "safe-id", timestamp: 1, sdk: { name: "sentry.test" }, user: { email: "private@example.test" },
          breadcrumbs: [{ message: "provider response secret" }], extra: { comment: "private review" } };
        outgoing = processor?.(event);
      },
      captureMessage() {},
      flush: async () => true,
    },
  } });

  try {
    const result = await service.evaluateCronAlerts();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, activeCount: 1, transportFailures: 0 });
    assert.ok(queries[0]?.includes("claim_cron_alerts"));
    assert.ok(outgoing);
    assert.deepEqual(Object.keys(outgoing!).sort(), ["event_id", "level", "message", "platform", "sdk", "tags", "timestamp"].sort());
    const text = JSON.stringify(outgoing);
    assert.match(text, /review_replies/);
    assert.match(text, /failed/);
    assert.doesNotMatch(text, /private@example|provider response|private review/);
    assert.equal(logs.length, 0);
  } finally {
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  }
});

test("missing alert transport is observable without exposing exception or customer data", async () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  const updates: string[] = [];
  const logs: Array<{ event: string; meta: unknown }> = [];
  const service = loadTs<typeof import("../src/lib/cron-alerts.js")>("src/lib/cron-alerts.ts", { overrides: {
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      updates.push(query);
      if (query.includes("claim_cron_alerts")) return [{ alert_key: "privacy_retention:failed", job_name: "privacy_retention", reason: "failed" }];
      if (query.includes("count(*) FILTER")) return [{ active_count: 1, transport_failures: 1 }];
      return [];
    } },
    "@/lib/safe-logger": { safeLogger: { error: (event: string, meta: unknown) => logs.push({ event, meta }) } },
    "@sentry/nextjs": { withScope() { throw new Error("must not send"); }, captureMessage() { throw new Error("must not send"); }, flush: async () => false },
  } });
  try {
    const result = await service.evaluateCronAlerts();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, activeCount: 1, transportFailures: 1 });
    assert.ok(updates.some((query) => query.includes("sentry_dsn_missing")));
    assert.ok(logs.some(({ event }) => event === "cron.alerts.transport_not_configured"));
    assert.doesNotMatch(JSON.stringify(logs), /must not send|private|secret/i);
  } finally {
    if (originalDsn !== undefined) process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  }
});

test("cron health stays authenticated, hides raw exception text, and fails closed on storage errors", async () => {
  let authorized = false;
  let queryCount = 0;
  const endpoint = loadTs<typeof import("../src/app/api/cron/health/route.js")>("src/app/api/cron/health/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => authorized },
    "@/lib/cron-alerts": { evaluateCronAlerts: async () => ({ ok: true, activeCount: 0, transportFailures: 0 }) },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray) => {
      queryCount += 1;
      const query = strings.join(" ");
      assert.doesNotMatch(query, /error_message/i);
      if (query.includes("DISTINCT ON")) return [{ job_name: "review_booster", status: "failed", outcomes: {} }];
      return [];
    } },
    "@/lib/safe-logger": { safeLogger: { error() {} } },
  } });
  assert.equal((await endpoint.GET({} as never)).status, 401);
  assert.equal(queryCount, 0);
  authorized = true;
  const response = await endpoint.GET({} as never);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { healthy: boolean }).healthy, true);

  const unavailable = loadTs<typeof import("../src/app/api/cron/health/route.js")>("src/app/api/cron/health/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/cron-alerts": { evaluateCronAlerts: async () => ({ ok: false, activeCount: 0, transportFailures: 0 }) },
    "@/lib/db/neon": { sql: async () => { throw new Error("sensitive database diagnostic"); } },
    "@/lib/safe-logger": { safeLogger: { error() {} } },
  } });
  const failed = await unavailable.GET({} as never);
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /sensitive database diagnostic/);
});
