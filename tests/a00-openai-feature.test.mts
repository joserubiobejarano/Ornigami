import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const previousEnabled = process.env.OPENAI_ENABLED;
const previousKey = process.env.OPENAI_API_KEY;

function setEnabled(value: string | undefined) {
  if (value === undefined) delete process.env.OPENAI_ENABLED;
  else process.env.OPENAI_ENABLED = value;
}

test("OPENAI_ENABLED is a strict explicit opt-in", () => {
  const feature = loadTs<typeof import("../src/lib/openai-feature.ts")>("src/lib/openai-feature.ts", { "server-only": {} });
  for (const value of [undefined, "false", "TRUE", "1", "yes", " true "]) {
    setEnabled(value);
    assert.equal(feature.isOpenAIEnabled(), false, `expected ${String(value)} to stay disabled`);
  }
  setEnabled("true");
  assert.equal(feature.isOpenAIEnabled(), true);
});

test("cached OpenAI client checks the opt-in before each SDK call", async () => {
  let instances = 0;
  const calls: unknown[][] = [];
  class MockOpenAI {
    chat = { completions: { create: async (...args: unknown[]) => {
      calls.push(args);
      return { choices: [{ message: { content: "Draft reply" } }] };
    } } };
    constructor() { instances += 1; }
  }
  setEnabled(undefined);
  process.env.OPENAI_API_KEY = "test-openai-key";
  const openai = loadTs<typeof import("../src/lib/openai.ts")>("src/lib/openai.ts", {
    openai: { default: MockOpenAI },
    "@/lib/env": { getRequiredEnv: () => "test-openai-key" },
    "@/lib/openai-feature": { isOpenAIEnabled: () => process.env.OPENAI_ENABLED === "true" },
  });
  await assert.rejects(openai.generateReviewReply({ businessName: "Test", city: "Test", rating: 5, text: "Good", tone: "warm" }));
  await assert.rejects(openai.generateProfileAudit({ mode: "quick", urlOrName: "Test" }));
  assert.equal(instances, 0);
  assert.equal(calls.length, 0);

  setEnabled("true");
  await openai.generateReviewReply({ businessName: "Test", city: "Test", rating: 5, text: "Good", tone: "warm" });
  assert.equal(instances, 1);
  assert.equal(calls.length, 1);
  setEnabled("false");
  await assert.rejects(openai.generateProfileAudit({ mode: "quick", urlOrName: "Test" }));
  assert.equal(instances, 1);
  assert.equal(calls.length, 1);
});

test("Booster uses its static fallback unless explicitly opted in, even with an API key", async () => {
  process.env.OPENAI_API_KEY = "test-openai-key";
  const input = {
    business_name: "Test Business", business_type: "shop", city: "Madrid", customer_name: "Customer",
    google_review_url: "https://example.test/review", tone_setting: "warm", language: "en",
  };
  for (const value of [undefined, "false", "TRUE", "1", " true "]) {
    let instances = 0;
    let calls = 0;
    let keyReads = 0;
    setEnabled(value);
    class MockOpenAI {
      responses = { create: async () => { calls += 1; return { output_text: "Generated body" }; } };
      constructor() { instances += 1; }
    }
    const generator = loadTs<typeof import("../src/modules/review-booster/services/followup-email-generator.service.ts")>(
      "src/modules/review-booster/services/followup-email-generator.service.ts",
      {
        openai: { default: MockOpenAI },
        "@/lib/env": { getOptionalEnv: () => { keyReads += 1; return "test-openai-key"; } },
        "@/lib/openai-feature": { isOpenAIEnabled: () => process.env.OPENAI_ENABLED === "true" },
      },
    );
    const body = await generator.generateFollowupEmailBody(input);
    assert.match(body, /Thank you so much for visiting Test Business/);
    assert.equal(instances, 0);
    assert.equal(calls, 0);
    assert.equal(keyReads, 0);
  }

  let enabledInstances = 0;
  let enabledCalls = 0;
  let enabledKeyReads = 0;
  setEnabled("true");
  class EnabledMockOpenAI {
    responses = { create: async () => { enabledCalls += 1; return { output_text: "Generated body" }; } };
    constructor() { enabledInstances += 1; }
  }
  const enabledGenerator = loadTs<typeof import("../src/modules/review-booster/services/followup-email-generator.service.ts")>(
    "src/modules/review-booster/services/followup-email-generator.service.ts",
    {
      openai: { default: EnabledMockOpenAI },
      "@/lib/env": { getOptionalEnv: () => { enabledKeyReads += 1; return "test-openai-key"; } },
      "@/lib/openai-feature": { isOpenAIEnabled: () => process.env.OPENAI_ENABLED === "true" },
    },
  );
  assert.equal(await enabledGenerator.generateFollowupEmailBody(input), "Generated body");
  assert.equal(enabledInstances, 1);
  assert.equal(enabledCalls, 1);
  assert.equal(enabledKeyReads, 1);
});

test("Booster initializes lazily if an already-loaded process later opts in", async () => {
  let instances = 0;
  let calls = 0;
  let keyReads = 0;
  setEnabled(undefined);
  class MockOpenAI {
    responses = { create: async () => { calls += 1; return { output_text: "Generated after opt-in" }; } };
    constructor() { instances += 1; }
  }
  const generator = loadTs<typeof import("../src/modules/review-booster/services/followup-email-generator.service.ts")>(
    "src/modules/review-booster/services/followup-email-generator.service.ts",
    {
      openai: { default: MockOpenAI },
      "@/lib/env": { getOptionalEnv: () => { keyReads += 1; return "test-openai-key"; } },
      "@/lib/openai-feature": { isOpenAIEnabled: () => process.env.OPENAI_ENABLED === "true" },
    },
  );
  const input = { business_name: "Test Business", google_review_url: "https://example.test/review" };
  assert.match(await generator.generateFollowupEmailBody(input), /Thank you so much for visiting Test Business/);
  assert.deepEqual({ instances, calls, keyReads }, { instances: 0, calls: 0, keyReads: 0 });
  setEnabled("true");
  assert.equal(await generator.generateFollowupEmailBody(input), "Generated after opt-in");
  assert.deepEqual({ instances, calls, keyReads }, { instances: 1, calls: 1, keyReads: 1 });
});

test("disabled review draft processing creates no lifecycle, usage claim, reservation, or SDK work", async () => {
  let lifecycle = 0;
  let claims = 0;
  let reservations = 0;
  let generated = 0;
  setEnabled(undefined);
  const processor = loadTs<typeof import("../src/lib/review-draft-processing.ts")>("src/lib/review-draft-processing.ts", {
    "@/lib/openai-feature": { isOpenAIEnabled: () => process.env.OPENAI_ENABLED === "true" },
    "@/lib/review-reply-server": { generateReplyForReviewRow: async () => { generated += 1; return "reply"; }, postReplyToGoogleAndPersist: async () => ({ ok: true }) },
    "@/lib/review-draft-policy": {
      claimReplyGeneration: async () => { claims += 1; return { ok: true, claim: "claim" }; },
      reserveReplyGenerationUsage: async () => { reservations += 1; return { ok: true, reservationId: "reservation" }; },
      saveGeneratedReplyDraftAndCharge: async () => ({ ok: true, draft: {} }),
      releaseReplyGenerationUsage: async () => undefined, releaseReplyGenerationClaim: async () => undefined,
    },
    "@/lib/google-review-rating": { parseGoogleStarRating: () => 5 },
    "@/lib/account-lifecycle": { beginAccountLifecycleOperation: async () => { lifecycle += 1; return { result: "claimed", token: "token" }; }, finishAccountLifecycleOperation: async () => true },
  });
  const result = await processor.processReviewDraft({
    ownerUserId: "owner", actorUserId: "actor", businessId: "business", locationName: "location",
    row: { google_review_id: "review", comment: "Good", star_rating: 5 } as never,
    profile: null, source: "scheduled",
  });
  assert.deepEqual(result, { outcome: "skipped", reason: "ai-unavailable" });
  assert.deepEqual({ lifecycle, claims, reservations, generated }, { lifecycle: 0, claims: 0, reservations: 0, generated: 0 });
});

test("disabled audit API returns AI_UNAVAILABLE before rate limits, model calls, or lead inserts", async () => {
  let limiterCalls = 0;
  let modelCalls = 0;
  let sqlCalls = 0;
  const route = loadTs<typeof import("../src/app/api/audit/free-profile/route.ts")>("src/app/api/audit/free-profile/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/openai-feature": { isOpenAIEnabled: () => false, OPENAI_UNAVAILABLE_CODE: "AI_UNAVAILABLE", OPENAI_UNAVAILABLE_MESSAGE: "AI features are currently unavailable." },
    "@/lib/db/neon": { sql: async () => { sqlCalls += 1; return []; } },
    "@/lib/openai": { generateProfileAudit: async () => { modelCalls += 1; return "audit"; } },
    "@/lib/safe-logger": { safeLogger: { warn: () => undefined, error: () => undefined } },
    "@/lib/public-demo-limiter": {
      checkAndIncrementPublicDemoLimit: async () => { limiterCalls += 1; return true; },
      checkAndIncrementPublicDemoLimitDurable: async () => { limiterCalls += 1; return true; },
      getRequestIp: () => "127.0.0.1", hashValue: () => "hash",
    },
    "@/lib/audit-policy": { FREE_AUDIT_GLOBAL_KEY: "global", PUBLIC_AUDIT_GLOBAL_LIMIT: 1, PUBLIC_AUDIT_PER_EMAIL_LIMIT: 1, PUBLIC_AUDIT_PER_IP_LIMIT: 1 },
  });
  const response = await route.POST(new Request("https://app.test/api/audit/free-profile", { method: "POST" }) as never);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "AI_UNAVAILABLE", message: "AI features are currently unavailable.", error: "AI features are currently unavailable." });
  assert.deepEqual({ limiterCalls, modelCalls, sqlCalls }, { limiterCalls: 0, modelCalls: 0, sqlCalls: 0 });
});

test("disabled review reply API returns AI_UNAVAILABLE before usage reservation or SDK call", async () => {
  let reservations = 0;
  let modelCalls = 0;
  let defaultsReads = 0;
  const route = loadTs<typeof import("../src/app/api/openai/review-reply/route.ts")>("src/app/api/openai/review-reply/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/openai-feature": { isOpenAIEnabled: () => false, OPENAI_UNAVAILABLE_CODE: "AI_UNAVAILABLE", OPENAI_UNAVAILABLE_MESSAGE: "AI features are currently unavailable." },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({ businessId: "business", integrationOwnerUserId: "owner" }), safeApiErrorResponse: () => Response.json({ error: "internal" }, { status: 500 }) },
    "@/lib/openai": { sanitizeReviewReply: (value: string) => value, streamReviewReply: async () => { modelCalls += 1; throw new Error("unexpected"); } },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async () => { defaultsReads += 1; return null; } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "actor", email: "owner@example.test" }) },
    "@/lib/review-draft-policy": {
      reserveReviewReplyUsage: async () => { reservations += 1; return { ok: true, reservationId: "reservation" }; },
      commitReviewReplyUsage: async () => true, releaseReviewReplyUsage: async () => undefined, getReplyDraft: async () => null,
    },
    "@/lib/google-business": { BusinessGoogleError: class BusinessGoogleError extends Error {}, resolveRequestedBusinessId: () => ({ valid: true, businessId: null }), getSelectedGoogleLocation: async () => null },
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/review-draft-processing": { processReviewDraft: async () => ({ outcome: "failed", stage: "generate" }) },
    "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
  });
  const response = await route.POST(new Request("https://app.test/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "A review" }),
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "AI_UNAVAILABLE", message: "AI features are currently unavailable.", error: "AI features are currently unavailable." });
  assert.deepEqual({ reservations, modelCalls, defaultsReads }, { reservations: 0, modelCalls: 0, defaultsReads: 0 });
});

test("disabled batch reply API returns AI_UNAVAILABLE before reading reviews or drafting", async () => {
  let contextChecks = 0;
  let locationChecks = 0;
  let defaultsReads = 0;
  let sqlCalls = 0;
  let drafts = 0;
  const route = loadTs<typeof import("../src/app/api/google/reviews/process-pending/route.ts")>("src/app/api/google/reviews/process-pending/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/openai-feature": { isOpenAIEnabled: () => false, OPENAI_UNAVAILABLE_CODE: "AI_UNAVAILABLE", OPENAI_UNAVAILABLE_MESSAGE: "AI features are currently unavailable." },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => { contextChecks += 1; return { businessId: "business" }; }, safeApiErrorResponse: () => Response.json({ error: "internal" }, { status: 500 }) },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "actor", email: "owner@example.test" }) },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async () => { defaultsReads += 1; return null; } },
    "@/lib/google-business": { BusinessGoogleError: class BusinessGoogleError extends Error {}, getSelectedGoogleLocation: async () => { locationChecks += 1; return { location_name: "location" }; }, resolveRequestedBusinessId: () => ({ valid: true, businessId: null }) },
    "@/lib/db/neon": { sql: async () => { sqlCalls += 1; return []; } },
    "@/lib/review-reply-policy": { MAX_REVIEW_REPLY_BATCH: 5, safeProcessingError: () => "failed" },
    "@/lib/review-draft-processing": { processReviewDraft: async () => { drafts += 1; return { outcome: "skipped", reason: "ai-unavailable" }; } },
    "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
    "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
  });
  const request = {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ locationName: "accounts/test/locations/test" }),
    nextUrl: new URL("https://app.test/api/google/reviews/process-pending"),
  };
  const response = await route.POST(request as never);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AI_UNAVAILABLE");
  assert.deepEqual({ contextChecks, locationChecks, defaultsReads, sqlCalls, drafts }, { contextChecks: 1, locationChecks: 0, defaultsReads: 0, sqlCalls: 0, drafts: 0 });
});

test("disabled scheduled replies return unavailable before lease, DB work, or provider calls", async () => {
  let leases = 0;
  let sqlCalls = 0;
  let providerCalls = 0;
  const route = loadTs<typeof import("../src/app/api/cron/review-replies/route.ts")>("src/app/api/cron/review-replies/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/openai-feature": { isOpenAIEnabled: () => false, OPENAI_UNAVAILABLE_CODE: "AI_UNAVAILABLE", OPENAI_UNAVAILABLE_MESSAGE: "AI features are currently unavailable." },
    "@/lib/db/deadline": { withDatabaseDeadline: (_deadline: Date | number, callback: () => unknown) => callback() },
    "@/lib/google-review-sync": { fetchAllGoogleReviews: async () => { providerCalls += 1; throw new Error("unexpected"); } },
    "@/lib/google-review-persistence": { persistGoogleReviews: async () => { providerCalls += 1; return { synced: 0, newReviews: [] }; } },
    "@/lib/db/neon": { sql: async () => { sqlCalls += 1; return []; } },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => null },
    "@/lib/review-draft-processing": { processReviewDraft: async () => { providerCalls += 1; return { outcome: "skipped", reason: "ai-unavailable" }; } },
    "@/lib/safe-logger": { safeLogger: { warn: () => undefined, error: () => undefined } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/review-alerts": { sendNewReviewAlert: async () => { providerCalls += 1; } },
    "@/lib/cron-health": {
      acquireCronJobRun: async () => { leases += 1; throw new Error("unexpected"); }, checkpointCronJobRun: async () => undefined,
      CronLeaseBusyError: class CronLeaseBusyError extends Error {}, finishCronJobRun: async () => undefined,
    },
    "@/lib/cron-budget": { providerWindow: () => null },
    "@/lib/account-lifecycle": { beginAccountLifecycleOperation: async () => ({ result: "claimed", token: "token" }), finishAccountLifecycleOperation: async () => true },
  });
  const response = await route.GET(new Request("https://app.test/api/cron/review-replies") as never);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AI_UNAVAILABLE");
  assert.deepEqual({ leases, sqlCalls, providerCalls }, { leases: 0, sqlCalls: 0, providerCalls: 0 });
});

test.after(() => {
  if (previousEnabled === undefined) delete process.env.OPENAI_ENABLED;
  else process.env.OPENAI_ENABLED = previousEnabled;
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});
