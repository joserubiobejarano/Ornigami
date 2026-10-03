import assert from "node:assert/strict";
import test from "node:test";

import { loadTs as loadRouteTs } from "./auth-test-harness.mts";
import { loadTs } from "./a02-test-support.mts";

const googleUrl = "https://mybusiness.googleapis.com/v4/accounts/100/locations/200/reviews";

function validTokens() {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    scope: null,
    connection_version: "connection-1",
    stored_access_token: "encrypted-access-token",
    stored_refresh_token: "encrypted-refresh-token",
  };
}

function googleClient(fetcher: typeof fetch, requestTimeoutMs = 25) {
  const mod = loadTs<{ createGoogleClient(dependencies: Record<string, unknown>): {
    googleFetch(userId: string, url: string, options?: RequestInit, expectedConnectionVersion?: string): Promise<Response>;
  } }>("src/lib/google.ts", {
    "./encrypted-token.ts": { decryptToken: (value: string) => ({ value, legacy: false }) },
    "./env.ts": { getRequiredEnv: () => "test-value", getServerAppUrl: () => "https://local.test" },
  });
  return mod.createGoogleClient({
    getTokens: async () => validTokens(),
    saveTokens: async () => true,
    refresh: async () => { throw new Error("unexpected refresh"); },
    fetcher,
    now: () => Date.now(),
    sleep: async () => undefined,
    requestTimeoutMs,
  });
}

test("Google request timeout aborts a stalled fetch and never retries the read", async () => {
  let calls = 0;
  let observedAbort = false;
  const client = googleClient(async (_input, init) => {
    calls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        observedAbort = true;
        reject(new Error("fetch aborted"));
      }, { once: true });
    });
  });

  await assert.rejects(client.googleFetch("user-1", googleUrl), /Google API request timed out/);
  assert.equal(observedAbort, true);
  assert.equal(calls, 1, "a timed-out scheduled provider read is not replayed");
});

test("Google response body retains its timeout until a stalled body is cancelled", async () => {
  let calls = 0;
  let observedAbort = false;
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const client = googleClient(async (_input, init) => {
    calls += 1;
    init?.signal?.addEventListener("abort", () => {
      observedAbort = true;
      try { bodyController?.error(new Error("transport aborted")); } catch { /* stream already settled */ }
    }, { once: true });
    const body = new ReadableStream<Uint8Array>({ start(controller) { bodyController = controller; } });
    return new Response(body, { status: 200 });
  }, 35);

  const response = await client.googleFetch("user-1", googleUrl);
  await assert.rejects(response.text(), /Google API response body failed/);
  assert.equal(observedAbort, true);
  assert.equal(calls, 1);
});

test("an already expired scheduled Google provider window starts no fetch", async () => {
  let calls = 0;
  const client = googleClient(async () => { calls += 1; return Response.json({ reviews: [] }); });
  const expired = AbortSignal.abort(new Error("deadline elapsed"));

  await assert.rejects(client.googleFetch("user-1", googleUrl, { signal: expired }), /Google API request was cancelled/);
  assert.equal(calls, 0);
});

test("scheduled and manual review drafting use one bounded SDK attempt", async () => {
  const constructors: Array<Record<string, unknown>> = [];
  const calls: Array<unknown[] | undefined> = [];
  class MockOpenAI {
    chat = { completions: { create: async (...args: unknown[]) => { calls.push(args); throw new Error("mock timeout"); } } };
    constructor(config: Record<string, unknown>) { constructors.push(config); }
  }
  const openai = loadRouteTs<{ generateReviewReply(input: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<string> }>("src/lib/openai.ts", { overrides: {
    openai: MockOpenAI,
    "@/lib/env": { getRequiredEnv: () => "test-key" },
  } });
  const input = { businessName: "Test", city: "Madrid", rating: 5, text: "Great", tone: "warm" };

  await assert.rejects(openai.generateReviewReply(input, { timeoutMs: 17 }), /mock timeout/);
  await assert.rejects(openai.generateReviewReply(input), /mock timeout/);
  assert.equal(constructors[0]?.timeout, 20_000);
  assert.equal(constructors[0]?.maxRetries, 2, "manual generation keeps its default retry policy");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.[1])), { timeout: 17, maxRetries: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1]?.[1])), { timeout: 20_000, maxRetries: 0 }, "manual generation remains bounded for lifecycle draining");
  assert.equal(calls.length, 2, "each invocation makes one SDK call");
});

test("scheduled Booster generation sets one bounded SDK attempt and timeout fallback remains local", async () => {
  const constructors: Array<Record<string, unknown>> = [];
  const calls: Array<unknown[] | undefined> = [];
  class MockOpenAI {
    responses = { create: async (...args: unknown[]) => { calls.push(args); throw new Error("mock timeout"); } };
    constructor(config: Record<string, unknown>) { constructors.push(config); }
  }
  const generator = loadRouteTs<{ generateFollowupEmailBody(input: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<string> }>(
    "src/modules/review-booster/services/followup-email-generator.service.ts",
    { overrides: { openai: MockOpenAI, "@/lib/env": { getOptionalEnv: () => "test-key" } } },
  );
  const input = { business_name: "Test Shop", city: "Madrid", google_review_url: "https://example.test/reviews" };

  const scheduled = await generator.generateFollowupEmailBody(input, { timeoutMs: 19 });
  const manual = await generator.generateFollowupEmailBody(input);
  assert.ok(scheduled.includes("Test Shop"), "a provider timeout falls back to locally generated email text");
  assert.ok(manual.includes("Test Shop"));
  assert.ok(!scheduled.includes("https://example.test/reviews"), "fallback content does not add a provider effect or raw review URL");
  assert.equal(constructors[0]?.timeout, 20_000);
  assert.equal(constructors[0]?.maxRetries, 0, "manual Booster generation is also a single bounded attempt");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.[1])), { timeout: 19, maxRetries: 0 });
  assert.equal(calls[1]?.[1], undefined, "manual generation receives no scheduled timeout override");
  assert.equal(calls.length, 2, "a timed-out scheduled generation is not retried");
});

test("Replies cron does not start provider or customer notification work after deadline", async () => {
  let googleCalls = 0;
  let emailCalls = 0;
  let draftCalls = 0;
  let finished: Record<string, unknown> | undefined;
  const route = loadRouteTs<{ GET(request: Request): Promise<Response> }>("src/app/api/cron/review-replies/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/google-review-sync": { fetchAllGoogleReviews: async () => { googleCalls += 1; return []; } },
    "@/lib/google-review-persistence": { persistGoogleReviews: async () => ({ synced: 0, newReviews: [] }) },
    "@/lib/db/neon": { sql: async () => [{
      business_id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-4000-8000-000000000002",
      business_name: "Test", location_name: "accounts/100/locations/200", connection_version: "version-1",
    }] },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => null },
    "@/lib/review-draft-processing": { processReviewDraft: async () => { draftCalls += 1; return { outcome: "saved" }; } },
    "@/lib/safe-logger": { safeLogger: { warn() {}, error() {} } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/review-alerts": { sendNewReviewAlert: async () => { emailCalls += 1; } },
    "@/lib/account-lifecycle": {
      beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "lifecycle-token" }),
      finishAccountLifecycleOperation: async () => true,
    },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => ({ runId: "run", fence: 1, cursor: null, deadlineAt: new Date(0), batchLimit: 20, budgetMs: 45_000 }),
      checkpointCronJobRun: async () => undefined,
      finishCronJobRun: async (input: Record<string, unknown>) => { finished = input; },
      CronLeaseBusyError: class extends Error {},
    },
  } });

  const response = await route.GET(new Request("https://local.test/api/cron/review-replies"));
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 202);
  assert.equal(body.status, "partial");
  assert.equal(body.continuation, true);
  assert.equal(googleCalls, 0);
  assert.equal(emailCalls, 0);
  assert.equal(draftCalls, 0);
  assert.equal(finished?.status, "partial");
});
