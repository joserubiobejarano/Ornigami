import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const LOCATION = "accounts/123/locations/456";

class BusyError extends Error { retryAfterSeconds = 17; }

function boosterRoute(options: {
  authorized?: boolean;
  cursor?: unknown;
  businesses?: Array<{ business_id: string }>;
  busy?: boolean;
  checkpointError?: boolean;
  run?: (_deps: unknown, options: { shouldContinue(): boolean; shouldBeginSend(): boolean; onCandidateComplete(visit: unknown, outcome: unknown): Promise<void> }) => Promise<Record<string, unknown>>;
  finish?: (input: Record<string, unknown>) => Promise<void>;
}) {
  const checkpoints: Array<Record<string, unknown>> = [];
  const finishes: Array<Record<string, unknown>> = [];
  const cron = loadTs<{ GET(request: unknown): Promise<Response> }>("src/app/api/cron/review-booster/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/db/neon": { sql: async () => options.businesses ?? [] },
    "@/lib/safe-logger": { safeLogger: { warn() {}, error() {} } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => options.authorized ?? true },
    "@/lib/cron-budget": { providerWindow: () => 8_000 },
    "@/lib/cron-health": {
      CronLeaseBusyError: BusyError,
      acquireCronJobRun: async () => {
        if (options.busy) throw new BusyError();
        return { runId: RUN, fence: 3, cursor: options.cursor ?? null, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 20, budgetMs: 45_000 };
      },
      checkpointCronJobRun: async (input: Record<string, unknown>) => {
        if (options.checkpointError) throw new Error("database error details must not escape");
        checkpoints.push(input);
      },
      finishCronJobRun: async (input: Record<string, unknown>) => { finishes.push(input); await options.finish?.(input); },
    },
    "@/modules/review-booster/services/review-booster-db.service": { getReviewBoosterBillingPeriodUsage: async () => ({ sent: 0, used: 0, reserved: 0, allowance: 500 }) },
    "@/modules/review-booster/services/followup-runner.service": {
      createFollowupRunnerDependencies: async () => ({}),
      runEligibleFollowups: options.run ?? (async () => ({ ok: true, scanned: 0, sent: 0, failed: 0, skipped: 0, unknown: 0, deferred: 0 })),
    },
  });
  return { cron, checkpoints, finishes };
}

test("Booster cron rejects unauthorized callers and active leases before scanning", async () => {
  const unauthorized = boosterRoute({ authorized: false });
  assert.equal((await unauthorized.cron.GET({})).status, 401);
  assert.equal(unauthorized.finishes.length, 0);
  const busy = boosterRoute({ busy: true });
  const response = await busy.cron.GET({});
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(busy.finishes.length, 0);
});

test("Booster preserves a resumable business cursor when the budget interrupts candidates", async () => {
  const route = boosterRoute({
    businesses: [{ business_id: BUSINESS }],
    run: async (_deps, options) => {
      await options.onCandidateComplete({}, { failed: 0, unknown: 0, sent: 1, skipped: 0, deferred: 0 });
      return { ok: true, scanned: 1, sent: 1, failed: 0, skipped: 0, unknown: 0, deferred: 0, interrupted: true };
    },
  });
  const response = await route.cron.GET({});
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 202);
  assert.equal(body.ok, false);
  assert.deepEqual(route.checkpoints.at(-1)?.cursor, { businessId: BUSINESS, resumeBusiness: false, sweepFailures: 0, sweepSuccesses: 1, needsAnotherPass: true });
  assert.equal(route.finishes[0]?.status, "partial");
});

test("Booster checkpoint failure returns 503 without terminalizing from stale state", async () => {
  const route = boosterRoute({ businesses: [{ business_id: BUSINESS }], checkpointError: true });
  const response = await route.cron.GET({});
  assert.equal(response.status, 503);
  assert.equal(route.finishes.length, 0);
});

test("Booster reports a failed sweep tail instead of converting it to no_work success", async () => {
  const route = boosterRoute({ cursor: { businessId: BUSINESS, resumeBusiness: false, sweepFailures: 1, sweepSuccesses: 2, needsAnotherPass: false } });
  const response = await route.cron.GET({});
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 500);
  assert.equal(body.status, "partial");
  assert.equal(route.finishes[0]?.clearCursor, true);
});

test("Booster rotates past a large interrupted first business so the later tenant runs", async () => {
  const secondBusiness = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const first = boosterRoute({
    businesses: [{ business_id: BUSINESS }, { business_id: secondBusiness }],
    run: async (_deps, options) => {
      await options.onCandidateComplete({}, { failed: 0, unknown: 0, sent: 1, skipped: 0, deferred: 0 });
      return { ok: true, scanned: 1, sent: 1, failed: 0, skipped: 0, unknown: 0, deferred: 0, interrupted: true };
    },
  });
  assert.equal((await first.cron.GET({})).status, 202);
  const saved = first.checkpoints.at(-1)?.cursor;
  const second = boosterRoute({ cursor: saved, businesses: [{ business_id: secondBusiness }] });
  const response = await second.cron.GET({});
  assert.equal(response.status, 202, "the completed later tenant leaves a scheduled wrap pass for remaining work");
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.businesses_scanned, 1);
  assert.equal(second.finishes[0]?.status, "partial");
  const tail = boosterRoute({ cursor: second.checkpoints.at(-1)?.cursor, businesses: [] });
  const wrapped = await tail.cron.GET({});
  assert.equal(wrapped.status, 202);
  assert.deepEqual(tail.checkpoints.at(-1)?.cursor, { businessId: null, resumeBusiness: false, sweepFailures: 0, sweepSuccesses: 1, needsAnotherPass: false });
  const resumedFirst = boosterRoute({ cursor: tail.checkpoints.at(-1)?.cursor, businesses: [{ business_id: BUSINESS }] });
  assert.equal((await resumedFirst.cron.GET({})).status, 200);
  assert.equal(resumedFirst.checkpoints[0]?.cursor && (resumedFirst.checkpoints[0].cursor as { businessId: string }).businessId, BUSINESS);
});

function repliesRoute(options: { rows?: unknown[] | ((businessId: string, afterReviewId: unknown) => unknown[]); draft?: unknown; cursor?: unknown; checkpointError?: boolean; locations?: unknown[]; pending?: boolean; sync?: () => Promise<unknown[]> }) {
  const checkpoints: Array<Record<string, unknown>> = [];
  const finishes: Array<Record<string, unknown>> = [];
  const queries: string[] = [];
  const cron = loadTs<{ GET(request: unknown): Promise<Response> }>("src/app/api/cron/review-replies/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/google-review-sync": { fetchAllGoogleReviews: async () => options.sync ? options.sync() : [] },
    "@/lib/google-review-persistence": { persistGoogleReviews: async () => ({ synced: 0, newReviews: [] }) },
    "@/lib/db/neon": { sql: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join(" "); queries.push(query);
      if (query.includes("FROM public.business_google_locations selected")) return options.locations ?? [{ business_id: BUSINESS, user_id: "33333333-3333-4333-8333-333333333333", business_name: "Shop", location_name: LOCATION, connection_version: "v1" }];
      if (query.includes("SELECT r.id, r.google_review_id")) return typeof options.rows === "function" ? options.rows(String(values[0]), values[2]) : options.rows ?? [];
      if (query.includes("FROM public.cron_unit_state units")) return options.pending ? [{ "?column?": 1 }] : [];
      return [];
    } },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => null },
    "@/lib/review-draft-processing": { processReviewDraft: options.draft ?? (async () => ({ outcome: "saved", draft: {}, posted: false })) },
    "@/lib/safe-logger": { safeLogger: { error() {}, warn() {} } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/review-alerts": { sendNewReviewAlert: async () => undefined },
    "@/lib/cron-budget": { providerWindow: () => 8_000 },
    "@/lib/cron-health": {
      CronLeaseBusyError: BusyError,
      acquireCronJobRun: async () => ({ runId: RUN, fence: 4, cursor: options.cursor ?? null, deadlineAt: new Date(Date.now() + 60_000), batchLimit: 20, budgetMs: 45_000 }),
      checkpointCronJobRun: async (input: Record<string, unknown>) => { if (options.checkpointError) throw new Error("db"); checkpoints.push(input); },
      finishCronJobRun: async (input: Record<string, unknown>) => { finishes.push(input); },
    },
  });
  return { cron, checkpoints, finishes, queries };
}

test("Replies cron checkpoints each settled draft and reports successful work", async () => {
  const route = repliesRoute({ rows: [{ id: 7, google_review_id: "review_7", comment: "Nice", star_rating: 5 }] });
  const response = await route.cron.GET({});
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.drafts_created, 1);
  assert.ok(route.checkpoints.some((item) => ((item.unitCursor as { cursor?: { lastReviewId?: string } }).cursor?.lastReviewId) === "7"));
  assert.match(route.queries.find((query) => query.includes("SELECT r.id")) ?? "", /ORDER BY r\.id ASC/);
  assert.equal(route.finishes[0]?.status, "succeeded");
});

test("Replies cron carries failures across a later no_work tail", async () => {
  const route = repliesRoute({ cursor: { businessId: BUSINESS, locationName: LOCATION, sweepFailures: 1, sweepSuccesses: 1, needsAnotherPass: true }, locations: [] });
  const response = await route.cron.GET({});
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 500);
  assert.equal(body.status, "partial");
  assert.equal(route.finishes[0]?.clearCursor, true);
});

test("Replies rotates after a full draft batch and still serves the next business", async () => {
  const secondBusiness = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const route = repliesRoute({
    locations: [
      { business_id: BUSINESS, user_id: "33333333-3333-4333-8333-333333333333", business_name: "A", location_name: LOCATION, connection_version: "v1" },
      { business_id: secondBusiness, user_id: "44444444-4444-4444-8444-444444444444", business_name: "B", location_name: "accounts/124/locations/457", connection_version: "v1" },
    ],
    rows: (businessId, afterReviewId) => businessId === BUSINESS && afterReviewId == null
      ? Array.from({ length: 10 }, (_, index) => ({ id: index + 1, google_review_id: `review_${index + 1}`, comment: "Nice", star_rating: 5 }))
      : [{ id: 100, google_review_id: "review_100", comment: "Nice", star_rating: 5 }],
  });
  const response = await route.cron.GET({});
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 202);
  assert.equal(body.locations_scanned, 2);
  assert.equal(body.drafts_created, 11);
  const savedLargeTenantUnit = route.checkpoints.find((item) => (item.unitCursor as { businessId?: string } | undefined)?.businessId === BUSINESS
    && (((item.unitCursor as { cursor?: { lastReviewId?: string } }).cursor?.lastReviewId) === "10"));
  assert.ok(savedLargeTenantUnit, "the first tenant's next review key remains durable while the later tenant is processed");
  const finalCursor = route.checkpoints.at(-1)?.cursor as { needsAnotherPass?: boolean };
  assert.equal(finalCursor.needsAnotherPass, true, "the completed tail retains the need to wrap and resume the first unit");
  assert.equal(route.finishes[0]?.status, "partial");

  const wrap = repliesRoute({ cursor: route.checkpoints.at(-1)?.cursor, locations: [], pending: true });
  assert.equal((await wrap.cron.GET({})).status, 202);
  assert.deepEqual(wrap.checkpoints.at(-1)?.cursor, { businessId: null, locationName: null, sweepFailures: 0, sweepSuccesses: 13, needsAnotherPass: false });
  let resumedAfterReviewId: unknown;
  let resumedSyncCalls = 0;
  const resumed = repliesRoute({
    locations: [{ business_id: BUSINESS, user_id: "33333333-3333-4333-8333-333333333333", business_name: "A", location_name: LOCATION, connection_version: "v1", unit_cursor: { locationName: LOCATION, stage: "drafts", lastReviewId: "10", connectionVersion: "v1", sweepFailures: 0, sweepSuccesses: 11 } }],
    sync: async () => { resumedSyncCalls += 1; return []; },
    rows: (businessId, afterReviewId) => {
      resumedAfterReviewId = afterReviewId;
      return businessId === BUSINESS && afterReviewId === "10" ? [{ id: 11, google_review_id: "review_11", comment: "Next", star_rating: 5 }] : [];
    },
  });
  assert.equal((await resumed.cron.GET({})).status, 202);
  assert.equal(resumedAfterReviewId, "10", "the resumed tenant continues after its saved review ID");
  assert.equal(resumedSyncCalls, 0, "a saved draft-stage cursor does not repeat provider sync");
  assert.ok(resumed.checkpoints.some((item) => (item.unitCursor as { cursor?: unknown } | undefined)?.cursor === null), "the resumed unit is cleared only after its saved draft batch completes");
});

test("Replies ignores orphaned unit cursors when their owner is frozen", async () => {
  const route = repliesRoute({
    cursor: { businessId: null, locationName: null, sweepFailures: 0, sweepSuccesses: 3, needsAnotherPass: true },
    locations: [],
    pending: false,
  });
  const response = await route.cron.GET({});
  assert.equal(response.status, 200);
  assert.equal(route.finishes[0]?.status, "succeeded");
  assert.match(route.queries.find((query) => query.includes("FROM public.cron_unit_state units")) ?? "", /privacy_deletion_requested_at/);
});
