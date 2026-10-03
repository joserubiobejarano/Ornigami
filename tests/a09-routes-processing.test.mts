import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";
import { createRequire } from "node:module";
const { NextRequest } = createRequire(import.meta.url)("next/server") as typeof import("next/server");
const sameOrigin = loadTs<{ isSameOriginMutation(request: Request): boolean }>("src/lib/team-lifecycle.ts", {
  "@/lib/db/neon": { sql: async () => [] },
  "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
  "@/lib/safe-logger": { safeLogger: { warn: () => undefined, error: () => undefined } },
});

type Processing = {
  processReviewDraft(input: {
    ownerUserId: string; actorUserId: string; businessId: string; locationName: string;
    row: { id: number; google_review_id: string; comment: string; star_rating: unknown };
    profile: { auto_reply_all_reviews: boolean } | null;
    source: "scheduled" | "individual" | "interactive_batch";
  }): Promise<{ outcome: string; posted?: boolean; draft?: { version: number } }>;
  isSafeAutoReplyRating(value: unknown): boolean;
};

function loadProcessing(overrides: {
  claim?: (...args: unknown[]) => Promise<unknown>;
  generate?: (...args: unknown[]) => Promise<string>;
  save?: (...args: unknown[]) => Promise<unknown>;
  post?: (...args: unknown[]) => Promise<unknown>;
} = {}) {
  const calls: { posts: unknown[][]; generated: number; saves: number; lifecycle: unknown[][] } = { posts: [], generated: 0, saves: 0, lifecycle: [] };
  const mod = loadTs<Processing>("src/lib/review-draft-processing.ts", {
    "@/lib/review-reply-server": {
      generateReplyForReviewRow: async (...args: unknown[]) => { calls.generated += 1; return overrides.generate ? overrides.generate(...args) : "Thanks for your feedback."; },
      postReplyToGoogleAndPersist: async (...args: unknown[]) => { calls.posts.push(args); return overrides.post ? overrides.post(...args) : { ok: true }; },
    },
    "@/lib/review-draft-policy": {
      claimReplyGeneration: overrides.claim ?? (async () => ({ ok: true, claim: { token: "claim", fence: 1, version: 0 } })),
      reserveReplyGenerationUsage: async () => ({ ok: true, reservationId: "reservation" }),
      saveGeneratedReplyDraftAndCharge: async (...args: unknown[]) => { calls.saves += 1; return overrides.save ? overrides.save(...args) : { ok: true, draft: { replyId: 2, reviewId: "review-1", reply: "Thanks for your feedback.", state: "ai_drafted", version: 1, updatedAt: null } }; },
      releaseReplyGenerationUsage: async () => undefined,
      releaseReplyGenerationClaim: async () => undefined,
    },
    "@/lib/google-review-rating": { parseGoogleStarRating: (value: unknown) => ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as Record<string, number>)[String(value)] ?? null },
    "@/lib/account-lifecycle": {
      beginAccountLifecycleOperation: async (...args: unknown[]) => { calls.lifecycle.push(args); return { result: "claimed", token: "lifecycle-token" }; },
      finishAccountLifecycleOperation: async () => true,
    },
  });
  return { mod, calls };
}

const input = (rating: unknown, source: "scheduled" | "individual" | "interactive_batch" = "interactive_batch") => ({
  ownerUserId: "owner-1", actorUserId: "member-1", businessId: "business-1", locationName: "accounts/10/locations/20",
  row: { id: 1, google_review_id: "review-1", comment: "Helpful review", star_rating: rating },
  profile: { auto_reply_all_reviews: true }, source,
});

test("interactive batch can auto-post only known high ratings under owner opt-in", async () => {
  for (const rating of [4, 5, "FOUR", "FIVE"]) {
    const { mod, calls } = loadProcessing();
    const result = await mod.processReviewDraft(input(rating));
    assert.deepEqual(result, { outcome: "saved", draft: { replyId: 2, reviewId: "review-1", reply: "Thanks for your feedback.", state: "ai_drafted", version: 1, updatedAt: null }, posted: true });
    assert.equal(calls.posts.length, 1);
    assert.equal((calls.lifecycle[0]?.[0] as { userId: string; actorUserId: string }).userId, "owner-1");
    assert.equal((calls.lifecycle[0]?.[0] as { userId: string; actorUserId: string }).actorUserId, "member-1");
    assert.deepEqual(calls.posts[0]?.[5], { intent: "automatic", expectedVersion: 1, expectedText: "Thanks for your feedback." });
  }
});

test("low, missing, fractional, and out-of-range ratings only save a draft", async () => {
  for (const rating of [1, 2, 3, 3.5, 6, null, undefined, "5", "SIX"]) {
    const { mod, calls } = loadProcessing();
    const result = await mod.processReviewDraft(input(rating));
    assert.equal(result.outcome, "saved");
    assert.equal(result.posted, false);
    assert.equal(calls.posts.length, 0);
    assert.equal(calls.saves, 1);
  }
});

test("scheduled and individual generation never auto-post even with owner opt-in", async () => {
  for (const source of ["scheduled", "individual"] as const) {
    const { mod, calls } = loadProcessing();
    const result = await mod.processReviewDraft(input(5, source));
    assert.equal(result.outcome, "saved");
    assert.equal(result.posted, false);
    assert.equal(calls.posts.length, 0);
  }
});

test("existing drafts and empty generations are not overwritten or charged", async () => {
  const existing = loadProcessing({ claim: async () => ({ ok: false, reason: "existing-draft" }) });
  assert.deepEqual(await existing.mod.processReviewDraft(input(5)), { outcome: "skipped", reason: "existing-draft" });
  assert.equal(existing.calls.generated, 0);

  const empty = loadProcessing({ generate: async () => "  \n" });
  assert.deepEqual(await empty.mod.processReviewDraft(input(5)), { outcome: "skipped", reason: "empty" });
  assert.equal(empty.calls.saves, 0);
});

test("safe auto-post rating accepts only exact known high numbers or Google enums", () => {
  const { mod } = loadProcessing();
  for (const value of [4, 5, "FOUR", "FIVE"]) assert.equal(mod.isSafeAutoReplyRating(value), true);
  for (const value of [null, undefined, 0, 3, 3.5, 6, "4", "FIVE ", "SIX"]) assert.equal(mod.isSafeAutoReplyRating(value), false);
});

test("interactive batch removes saved drafts and blank comments before the batch limit", async () => {
  const sqlStatements: string[] = [];
  const route = loadTs<{ POST(req: import("next/server").NextRequest): Promise<Response> }>("src/app/api/google/reviews/process-pending/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "owner-1", email: "owner@example.test" }) },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({ businessId: "business-1", role: "owner" }), safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async () => null },
    "@/lib/google-business": {
      resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }),
      getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }),
    },
    "@/lib/db/neon": { sql: async (parts: TemplateStringsArray) => { sqlStatements.push(parts.join(" ")); return []; } },
    "@/lib/review-reply-policy": { MAX_REVIEW_REPLY_BATCH: 40, safeProcessingError: () => "error" },
    "@/lib/review-reply-server": {},
    "@/lib/review-draft-processing": { processReviewDraft: async () => ({ outcome: "skipped", reason: "existing-draft" }) },
    "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
  });
  const request = new NextRequest("http://localhost/api/google/reviews/process-pending", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", locationName: "accounts/10/locations/20" }),
  });
  const response = await route.POST(request);
  assert.equal(response.status, 200);
  assert.equal(sqlStatements.length, 1);
  assert.match(sqlStatements[0]!, /NULLIF\(BTRIM\(r\.comment\), ''\) IS NOT NULL/);
  assert.match(sqlStatements[0]!, /NOT EXISTS \([\s\S]*?review_replies rr[\s\S]*?rr\.posted IS FALSE[\s\S]*?\)/);
  assert.match(sqlStatements[0]!, /LIMIT/);
});

test("shared settings reject a member's attempt to enable auto-replies", async () => {
  let updates = 0;
  const route = loadTs<{ PUT(req: Request): Promise<Response> }>("src/app/api/settings/reply/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({ businessId: "business-1", role: "member", replyPolicyOwnerUserId: "owner-1" }), safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => ({ auto_reply_all_reviews: false }) },
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }) },
    "@/lib/db/neon": { sql: async () => { updates += 1; return [{ id: "owner-1" }]; } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1", email: "member@example.test" }) },
  });
  const request = new Request("http://localhost/api/settings/reply", {
    method: "PUT", headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", autoReplyAllReviews: true }),
  });
  const response = await route.PUT(request);
  assert.equal(response.status, 403);
  assert.equal(updates, 0);
});

function loadOpenAiRoute(stream: AsyncIterable<{ choices: Array<{ delta: { content: string } }> }>, counts: { commits: number; releases: number; defaults: unknown[][]; reservations: unknown[][] }) {
  return loadTs<{ POST(req: Request): Promise<Response> }>("src/app/api/openai/review-reply/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/api-security": {
      requireActiveAgentBusinessContext: async (actor: string, _email: string, _agent: string, businessId: string) => ({
        actorUserId: actor, businessId, role: "member", replyPolicyOwnerUserId: "owner-1", usageOwnerUserId: "owner-1",
      }),
      safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }),
    },
    "@/lib/openai": { sanitizeReviewReply: (text: string) => text.trim(), streamReviewReply: async () => stream },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async (...args: unknown[]) => { counts.defaults.push(args); return { business_name: "Owner Business", reply_tone: "Owner Tone", owner_name: "Owner", contact_preference: "Email", auto_reply_all_reviews: false }; } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1", email: "member@example.test" }) },
    "@/lib/review-draft-policy": {
      reserveReviewReplyUsage: async (...args: unknown[]) => { counts.reservations.push(args); return { ok: true, reservationId: "reservation-1" }; },
      commitReviewReplyUsage: async () => { counts.commits += 1; return true; },
      releaseReviewReplyUsage: async () => { counts.releases += 1; },
      getReplyDraft: async () => null,
    },
    "@/lib/google-business": { BusinessGoogleError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }, resolveRequestedBusinessId: (_query: string | null, body?: unknown) => ({ valid: true, businessId: body ?? "business-1" }), getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }) },
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/review-draft-processing": { processReviewDraft: async () => ({ outcome: "skipped", reason: "existing-draft" }) },
  });
}

test("sample streaming generation uses owner context and commits one completed nonempty response", async () => {
  const counts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  const stream = { async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: "A helpful reply." } }] }; } };
  const route = loadOpenAiRoute(stream, counts);
  const response = await route.POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", "x-sample-review": "true", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", rating: 5, text: "Nice service" }),
  }));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /A helpful reply/);
  assert.deepEqual(counts.defaults, [["member-1", "business-1"]]);
  assert.equal(counts.reservations[0]?.[1], "business-1");
  assert.equal(counts.commits, 1);
  assert.equal(counts.releases, 0);
});

test("sample streaming failures, empty output, and cancellation release without charging", async () => {
  const errorCounts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  const failing = { async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: "partial" } }] }; throw new Error("private provider details"); } };
  const failResponse = await loadOpenAiRoute(failing, errorCounts).POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", "x-sample-review": "true", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", rating: 2, text: "A complaint" }),
  }));
  const failureText = await failResponse.text();
  assert.match(failureText, /Reply generation failed/);
  assert.doesNotMatch(failureText, /private provider details/);
  assert.equal(errorCounts.commits, 0);
  assert.equal(errorCounts.releases, 1);

  const emptyCounts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  const empty = { async *[Symbol.asyncIterator]() { } };
  const emptyResponse = await loadOpenAiRoute(empty, emptyCounts).POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", "x-sample-review": "true", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", rating: 2, text: "A complaint" }),
  }));
  await emptyResponse.text();
  assert.equal(emptyCounts.commits, 0);
  assert.equal(emptyCounts.releases, 1);

  const cancelCounts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  const slow = { async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content: "partial" } }] }; await new Promise((resolve) => setTimeout(resolve, 25)); yield { choices: [{ delta: { content: "tail" } }] }; } };
  const cancelResponse = await loadOpenAiRoute(slow, cancelCounts).POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", "x-sample-review": "true", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", rating: 2, text: "A complaint" }),
  }));
  const reader = cancelResponse.body!.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(cancelCounts.commits, 0);
  assert.equal(cancelCounts.releases, 1);

  const teardownCounts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  let nextCalls = 0;
  const brokenTeardown: AsyncIterable<{ choices: Array<{ delta: { content: string } }> }> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          nextCalls += 1;
          if (nextCalls === 1) return { done: false as const, value: { choices: [{ delta: { content: "partial" } }] } };
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { done: false as const, value: { choices: [{ delta: { content: "tail" } }] } };
        },
        async return() {
          throw new Error("provider cleanup failed");
        },
      };
    },
  };
  const teardownResponse = await loadOpenAiRoute(brokenTeardown, teardownCounts).POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", "x-sample-review": "true", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", rating: 2, text: "A complaint" }),
  }));
  const teardownReader = teardownResponse.body!.getReader();
  await teardownReader.read();
  await teardownReader.cancel();
  assert.equal(teardownCounts.commits, 0);
  assert.equal(teardownCounts.releases, 1);
});

test("review generation pins the selected location and refuses a nonselected request before generation", async () => {
  let generationCalls = 0;
  let contextBusiness: string | undefined;
  const route = loadTs<{ POST(req: Request): Promise<Response> }>("src/app/api/openai/review-reply/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/api-security": { requireActiveAgentBusinessContext: async (_actor: string, _email: string, _agent: string, business: string) => { contextBusiness = business; return { businessId: business, role: "member" }; }, safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/openai": { sanitizeReviewReply: (text: string) => text, streamReviewReply: async () => ({ async *[Symbol.asyncIterator]() { } }) },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async (actor: string, business: string) => { assert.equal(actor, "member-1"); assert.equal(business, "business-1"); return null; } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1", email: "member@example.test" }) },
    "@/lib/review-draft-policy": { reserveReviewReplyUsage: async () => ({ ok: true }), commitReviewReplyUsage: async () => true, releaseReviewReplyUsage: async () => undefined, getReplyDraft: async () => null },
    "@/lib/google-business": { BusinessGoogleError: class extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }, resolveRequestedBusinessId: (_query: string | null, body?: unknown) => ({ valid: true, businessId: body }), getSelectedGoogleLocation: async (_context: unknown, location: string) => { if (location !== "accounts/10/locations/20") throw new Error("nonselected location"); return { location_name: location }; } },
    "@/lib/db/neon": { sql: async () => [{ id: 1, google_review_id: "review-1", comment: "Review", star_rating: 5, location_name: "accounts/10/locations/20" }] },
    "@/lib/review-draft-processing": { processReviewDraft: async () => { generationCalls += 1; return { outcome: "saved", posted: false, draft: { version: 1 } }; } },
  });
  const response = await route.POST(new Request("http://localhost/api/openai/review-reply", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", reviewId: "review-1", locationName: "accounts/10/locations/999" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(contextBusiness, "business-1");
  assert.equal(generationCalls, 0);
});

test("manual Post requires an explicit intent, version, and exact reply text", async () => {
  let providerCalls = 0;
  const route = loadTs<{ POST(req: import("next/server").NextRequest): Promise<Response> }>("src/app/api/google/replies/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1" }) },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({ businessId: "business-1" }), safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/review-reply-server": { postReplyToGoogleAndPersist: async () => { providerCalls += 1; return { ok: true }; } },
    "@/lib/review-draft-policy": { getReplyDraft: async () => null },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }), BusinessGoogleError: class extends Error { status = 403; }, getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }) },
    "@/lib/db/neon": { sql: async () => [{ location_name: "accounts/10/locations/20" }] },
  });
  const response = await route.POST(new NextRequest("http://localhost/api/google/replies", {
    method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify({ businessId: "business-1", reviewId: "review-1", locationName: "accounts/10/locations/20", reply: "Thanks" }),
  }));
  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
});

test("manual Post rejects cross-origin requests before invoking Google posting", async () => {
  let providerCalls = 0;
  const route = loadTs<{ POST(req: import("next/server").NextRequest): Promise<Response> }>("src/app/api/google/replies/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1" }) },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => ({ businessId: "business-1" }), safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/review-reply-server": { postReplyToGoogleAndPersist: async () => { providerCalls += 1; return { ok: true }; } },
    "@/lib/review-draft-policy": { getReplyDraft: async () => null },
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }), BusinessGoogleError: class extends Error { status = 403; }, getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }) },
    "@/lib/db/neon": { sql: async () => [{ location_name: "accounts/10/locations/20" }] },
  });
  const response = await route.POST(new NextRequest("http://localhost/api/google/replies", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ businessId: "business-1", reviewId: "review-1", locationName: "accounts/10/locations/20", reply: "Thanks", intent: "manual", expectedVersion: 1 }),
  }));
  assert.equal(response.status, 403);
  assert.equal(providerCalls, 0);
});

test("same-site sibling origins cannot save drafts, change opt-in, batch-process, or generate replies", async () => {
  const headers = { "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "same-site" };

  let draftCalls = 0;
  const draftRoute = loadTs<{ POST(req: import("next/server").NextRequest): Promise<Response> }>("src/app/api/reviews/draft/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/user-from-req": { resolveUser: async () => { draftCalls++; return { id: "member-1" }; } },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => { draftCalls++; return { businessId: "business-1" }; }, safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }), BusinessGoogleError: class extends Error { status = 403; }, getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }) },
    "@/lib/db/neon": { sql: async () => { draftCalls++; return []; } },
    "@/lib/review-draft-policy": { getReplyDraft: async () => null, saveHumanReplyDraft: async () => { draftCalls++; return { ok: true }; } },
  });
  const draftResponse = await draftRoute.POST(new NextRequest("https://app.example/api/reviews/draft", { method: "POST", headers, body: JSON.stringify({ reviewId: "review-1", reply: "Forged text", expectedVersion: 1 }) }));
  assert.equal(draftResponse.status, 403);
  assert.equal(draftCalls, 0);

  let settingCalls = 0;
  const settingsRoute = loadTs<{ PUT(req: Request): Promise<Response> }>("src/app/api/settings/reply/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/user-from-req": { resolveUser: async () => { settingCalls++; return { id: "owner-1" }; } },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => { settingCalls++; return { businessId: "business-1", role: "owner" }; }, safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => null },
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }) },
    "@/lib/db/neon": { sql: async () => { settingCalls++; return [{ id: "owner-1" }]; } },
  });
  const settingsResponse = await settingsRoute.PUT(new Request("https://app.example/api/settings/reply", { method: "PUT", headers, body: JSON.stringify({ autoReplyAllReviews: true }) }));
  assert.equal(settingsResponse.status, 403);
  assert.equal(settingCalls, 0);

  let processingCalls = 0;
  const processRoute = loadTs<{ POST(req: import("next/server").NextRequest): Promise<Response> }>("src/app/api/google/reviews/process-pending/route.ts", {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/team-lifecycle": sameOrigin,
    "@/lib/user-from-req": { resolveUser: async () => { processingCalls++; return { id: "owner-1" }; } },
    "@/lib/api-security": { requireActiveAgentBusinessContext: async () => { processingCalls++; return { businessId: "business-1" }; }, safeApiErrorResponse: () => Response.json({ error: "error" }, { status: 500 }) },
    "@/lib/google-business": { resolveRequestedBusinessId: () => ({ valid: true, businessId: "business-1" }), getSelectedGoogleLocation: async () => ({ location_name: "accounts/10/locations/20" }) },
    "@/lib/reply-profile-defaults": { getBusinessReplyDefaults: async () => null },
    "@/lib/db/neon": { sql: async () => { processingCalls++; return []; } },
    "@/lib/review-reply-policy": { MAX_REVIEW_REPLY_BATCH: 40, safeProcessingError: () => "error" },
    "@/lib/review-reply-server": {},
    "@/lib/review-draft-processing": { processReviewDraft: async () => { processingCalls++; return { outcome: "saved" }; } },
    "@/lib/safe-logger": { safeLogger: { warn: () => undefined } },
  });
  const processResponse = await processRoute.POST(new NextRequest("https://app.example/api/google/reviews/process-pending", { method: "POST", headers, body: JSON.stringify({ locationName: "accounts/10/locations/20" }) }));
  assert.equal(processResponse.status, 403);
  assert.equal(processingCalls, 0);

  const generationCounts = { commits: 0, releases: 0, defaults: [] as unknown[][], reservations: [] as unknown[][] };
  let streamStarts = 0;
  const generationRoute = loadOpenAiRoute({ async *[Symbol.asyncIterator]() { streamStarts++; } }, generationCounts);
  const generationResponse = await generationRoute.POST(new Request("https://app.example/api/openai/review-reply", {
    method: "POST", headers, body: JSON.stringify({ businessId: "business-1", rating: 5, text: "Review" }),
  }));
  assert.equal(generationResponse.status, 403);
  assert.deepEqual(generationCounts.defaults, []);
  assert.deepEqual(generationCounts.reservations, []);
  assert.equal(streamStarts, 0);
});
