import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fakeSql, loadTs } from "./a02-test-support.mts";

const { NextRequest } = createRequire(import.meta.url)("next/server") as typeof import("next/server");
type TestNextRequest = import("next/server").NextRequest;

type ReviewFetcher = {
  fetchAllGoogleReviews(userId: string, locationName: string, maxPages?: number): Promise<Array<{ reviewId: string }>>;
  GoogleReviewsSyncError: new(status: 429 | 502 | 503, retryAfter?: string | null) => Error & { status: 429 | 502 | 503 };
};
const locationName = "accounts/100/locations/200";
const googleResources = loadTs<typeof import("../src/lib/google-resources.js")>("src/lib/google-resources.ts", {});
const googleRating = loadTs<typeof import("../src/lib/google-review-rating.js")>("src/lib/google-review-rating.ts", {});

function loadSync(fetch: (userId: string, url: string) => Promise<Response>) {
  return loadTs<ReviewFetcher>("src/lib/google-review-sync.ts", {
    "@/lib/google": { googleFetch: fetch },
    "@/lib/google-resources": {
      ...googleResources,
    },
    "@/lib/review-sync-policy": { DEFAULT_GOOGLE_REVIEWS_MAX_PAGES: 20 },
  });
}

test("Google review pagination preserves canonical parent path and safely encodes the page token", async () => {
  const requests: string[] = [];
  const mod = loadSync(async (_userId, url) => {
    requests.push(url);
    return new Response(JSON.stringify(requests.length === 1
      ? { reviews: [{ reviewId: "r_1" }], nextPageToken: "next token/+" }
      : { reviews: [{ reviewId: "r_2" }] }), { status: 200 });
  });
  assert.deepEqual((await mod.fetchAllGoogleReviews("owner", locationName)).map((review) => review.reviewId), ["r_1", "r_2"]);
  assert.equal(requests[0], "https://mybusiness.googleapis.com/v4/accounts/100/locations/200/reviews?pageSize=50");
  assert.equal(requests[1], "https://mybusiness.googleapis.com/v4/accounts/100/locations/200/reviews?pageSize=50&pageToken=next+token%2F%2B");
});

test("Google review pagination rejects repeated tokens, duplicate IDs, malformed pages, and silent truncation", async () => {
  let call = 0;
  const repeated = loadSync(async () => {
    call += 1;
    return new Response(JSON.stringify({ reviews: [], nextPageToken: "same" }), { status: 200 });
  });
  await assert.rejects(repeated.fetchAllGoogleReviews("owner", locationName), /invalid reviews page token/i);
  assert.equal(call, 2);

  const duplicate = loadSync(async (_userId, url) => new Response(JSON.stringify({
    reviews: [{ reviewId: "same" }],
    ...(url.includes("pageToken") ? {} : { nextPageToken: "next" }),
  }), { status: 200 }));
  await assert.rejects(duplicate.fetchAllGoogleReviews("owner", locationName), /duplicate review/i);

  const malformed = loadSync(async () => new Response(JSON.stringify({ reviews: null }), { status: 200 }));
  await assert.rejects(malformed.fetchAllGoogleReviews("owner", locationName), /invalid reviews page/i);

  const truncated = loadSync(async () => new Response(JSON.stringify({ reviews: [], nextPageToken: "next" }), { status: 200 }));
  await assert.rejects(truncated.fetchAllGoogleReviews("owner", locationName, 1), /exceeded the page limit/i);
});

test("invalid Google resource names and review IDs fail before provider requests", async () => {
  let providerCalls = 0;
  const mod = loadSync(async () => { providerCalls += 1; return new Response("{}", { status: 200 }); });
  await assert.rejects(mod.fetchAllGoogleReviews("owner", "accounts/1/locations/2/reviews"), /invalid Google location/i);
  const invalidId = loadSync(async () => new Response(JSON.stringify({ reviews: [{ reviewId: "../other" }] }), { status: 200 }));
  await assert.rejects(invalidId.fetchAllGoogleReviews("owner", locationName), /invalid review resource/i);
  assert.equal(providerCalls, 0);
});

test("manual sync maps malformed, repeated, truncated, and failed provider fetches to sanitized 502s", async () => {
  const helper = loadTs<Record<string, unknown>>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/business-context": { BusinessAccessError: class extends Error { status = 403; }, requireBusinessContext: async () => null },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ plan: "complete", agents: ["review_replies"] }) },
  });
  let persistCalls = 0;
  const makeRoute = (syncModule: ReviewFetcher) => loadTs<{ POST(req: TestNextRequest): Promise<Response> }>("src/app/api/google/reviews/sync/route.ts", {
      "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
      "@/lib/demo-data": { demoReviews: [] },
      "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1", email: "member@example.test" }) },
      "@/lib/api-security": {
        requireActiveAgentBusinessContext: async () => ({
          businessId: "biz-1", integrationOwnerUserId: "owner-1", business: { name: "Shop" },
        }),
        safeApiErrorResponse: () => Response.json({ error: "generic" }, { status: 500 }),
      },
      "@/lib/google-business": {
        ...helper,
        getSelectedGoogleLocation: async () => ({ location_name: locationName }),
      },
      "@/lib/google-review-sync": syncModule,
      "@/lib/google-review-persistence": { persistGoogleReviews: async () => { persistCalls += 1; return { synced: 0, newReviews: [] }; } },
      "@/lib/review-alerts": { sendNewReviewAlert: async () => undefined },
    });
  const callRoute = async (route: ReturnType<typeof makeRoute>) => route.POST(new NextRequest("http://localhost/api/google/reviews/sync", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  }));
  const repeatedCalls = { count: 0 };
  const overflowCalls = { count: 0 };
  const cases: Array<{ sync: ReviewFetcher; expectedFetches?: number }> = [
    { sync: loadSync(async () => Response.json({ reviews: null })) },
    { sync: loadSync(async () => Response.json({ reviews: [], nextPageToken: "repeat" })) , expectedFetches: 2 },
    { sync: loadSync(async () => {
      overflowCalls.count += 1;
      return Response.json({ reviews: [], nextPageToken: `token${overflowCalls.count}` });
    }), expectedFetches: 20 },
    { sync: loadSync(async () => { repeatedCalls.count += 1; throw new Error("private transport details"); }) },
  ];
  for (const item of cases) {
    const route = makeRoute(item.sync);
    const response = await callRoute(route);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Google review sync is temporarily unavailable. Please retry." });
  }
  assert.equal(repeatedCalls.count, 1);
  assert.equal(overflowCalls.count, 20);
  assert.equal(persistCalls, 0);
});

test("review persistence batches recordsets and retains local replied status when provider has no reply", async () => {
  const statements: Array<{ query: string; values: unknown[] }> = [];
  let upsertCount = 0;
  const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), "");
    statements.push({ query, values });
    const rows = JSON.parse(String(values[0])) as Array<Record<string, unknown>>;
    upsertCount += 1;
    return rows.map((row, index) => ({
      google_review_id: row.google_review_id,
      reviewer_name: row.reviewer_name,
      star_rating: row.star_rating,
      comment: row.comment,
      was_inserted: upsertCount === 1 && index === 0,
    }));
  };
  const mod = loadTs<typeof import("../src/lib/google-review-persistence.js")>("src/lib/google-review-persistence.ts", {
    "@/lib/db/neon": { sql },
    "@/lib/google-review-rating": googleRating,
  });
  const reviews = Array.from({ length: 251 }, (_, i) => ({ reviewId: `review_${i}`, starRating: "FIVE" }));
  const result = await mod.persistGoogleReviews("owner-id", "business-id", locationName, reviews);
  assert.deepEqual(result, {
    synced: 251,
    newReviews: [{ reviewerName: null, starRating: 5, comment: null }],
  });
  assert.equal(statements.length, 2);
  assert.match(statements[0]!.query, /jsonb_to_recordset/);
  assert.match(statements[0]!.query, /lower\(COALESCE\(public\.reviews\.status, ''\)\) = 'replied'/);
  assert.match(statements[0]!.query, /WHERE public\.reviews\.location_name = EXCLUDED\.location_name/);
  assert.equal((JSON.parse(String(statements[0]!.values[0])) as unknown[]).length, 250);
  assert.equal((JSON.parse(String(statements[1]!.values[0])) as unknown[]).length, 1);
  assert.equal((JSON.parse(String(statements[0]!.values[0])) as Array<{ user_id: string }>)[0]!.user_id, "owner-id");
});

type Poster = {
  postReplyToGoogleAndPersist(actor: string, business: string, review: string, location: string, reply: string): Promise<{ ok: boolean; error?: string; status?: number }>;
};

function loadPoster(options: {
  businessAllowed?: boolean;
  selectedLocation?: string;
  reviewExists?: boolean;
  googleResponse?: Response;
  localPersistFails?: boolean;
}) {
  const providerCalls: Array<{ userId: string; url: string; init?: RequestInit }> = [];
  const db = fakeSql((query) => {
    if (options.localPersistFails && query.includes("DELETE FROM public.review_replies")) throw new Error("local DB unavailable");
    return query.includes("SELECT id") && query.includes("public.reviews") && options.reviewExists !== false ? [{ id: "review-row" }] : [];
  });
  const ownerContext = {
    businessId: "biz-1", integrationOwnerUserId: "owner-1", actorUserId: "member-1",
    business: { owner_user_id: "owner-1" }, role: "member",
  };
  const mod = loadTs<Poster>("src/lib/review-reply-server.ts", {
    "@/lib/google": { googleFetch: async (userId: string, url: string, init?: RequestInit) => {
      providerCalls.push({ userId, url, init });
      return options.googleResponse ?? new Response("{}", { status: 200 });
    } },
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/openai": { generateReviewReply: async () => "draft", sanitizeReviewReply: (value: string) => value },
    "@/lib/google-review-rating": googleRating,
    "@/lib/api-security": {
      requireActiveAgentBusinessContext: async (_actor: string, _email: unknown, _agent: string, businessId: string) => {
        if (businessId !== "biz-1" || options.businessAllowed === false) throw new Error("denied business");
        return ownerContext;
      },
    },
    "@/lib/google-business": {
      getSelectedGoogleLocation: async (_context: unknown, requested: string) => {
        if (options.selectedLocation !== undefined && options.selectedLocation !== requested) {
          const error = new Error("location denied") as Error & { status: number };
          error.status = 403;
          throw error;
        }
        return { location_name: options.selectedLocation ?? locationName };
      },
    },
    "@/lib/google-resources": {
      ...googleResources,
    },
  });
  return { mod, providerCalls, db };
}

test("reply posting uses owner token and the canonical PUT contract after exact ownership checks", async () => {
  const { mod, providerCalls, db } = loadPoster({});
  assert.deepEqual(await mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "Thanks"), { ok: true });
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0]!.userId, "owner-1");
  assert.equal(providerCalls[0]!.url, "https://mybusiness.googleapis.com/v4/accounts/100/locations/200/reviews/review_1/reply");
  assert.equal(providerCalls[0]!.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(providerCalls[0]!.init?.body)), { comment: "Thanks" });
  assert.equal(db.calls.length, 5);
});

test("reply posting denies foreign business, mismatched location, and missing stored review before provider calls", async () => {
  const wrongBusiness = loadPoster({ businessAllowed: false });
  await assert.rejects(wrongBusiness.mod.postReplyToGoogleAndPersist("member-1", "other-biz", "review_1", locationName, "Thanks"));
  assert.equal(wrongBusiness.providerCalls.length, 0);

  const wrongLocation = loadPoster({ selectedLocation: "accounts/100/locations/999" });
  await assert.rejects(wrongLocation.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "Thanks"));
  assert.equal(wrongLocation.providerCalls.length, 0);

  const wrongReview = loadPoster({ reviewExists: false });
  assert.equal((await wrongReview.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "Thanks")).status, 404);
  assert.equal(wrongReview.providerCalls.length, 0);
});

test("provider failure omits provider response body and oversized UTF-8 replies are rejected first", async () => {
  const failed = loadPoster({ googleResponse: new Response("private provider details", { status: 403 }) });
  const failure = await failed.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "Thanks");
  assert.deepEqual(failure, { ok: false, error: "Google reply update failed", status: 502 });
  assert.equal(failed.providerCalls.length, 1);

  const oversized = loadPoster({});
  const result = await oversized.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "é".repeat(2049));
  assert.equal(result.status, 400);
  assert.equal(oversized.providerCalls.length, 0);

  const invalidId = loadPoster({});
  const invalid = await invalidId.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "../review", locationName, "Thanks");
  assert.equal(invalid.status, 400);
  assert.equal(invalidId.providerCalls.length, 0);

  const localFailure = loadPoster({ localPersistFails: true });
  const recovery = await localFailure.mod.postReplyToGoogleAndPersist("member-1", "biz-1", "review_1", locationName, "Thanks");
  assert.deepEqual(recovery, {
    ok: false,
    error: "Google accepted the reply, but its local status could not be updated. Sync reviews before retrying.",
    status: 502,
  });
  assert.equal(localFailure.providerCalls.length, 1);
});

test("manual sync and reply routes reject conflicting query/body business IDs before business or provider work", async () => {
  class BusinessAccessError extends Error { status = 403; }
  const helper = loadTs<Record<string, unknown>>("src/lib/google-business.ts", {
    "@/lib/db/neon": { sql: async () => [] },
    "@/lib/business-context": { BusinessAccessError, requireBusinessContext: async () => { throw new Error("unexpected context lookup"); } },
    "@/lib/google-discovery": { discoverGoogleLocations: async () => [] },
    "@/lib/plan-server": { getBusinessPlanInfo: async () => ({ plan: "complete", agents: ["review_replies"] }) },
  });
  let businessLookups = 0;
  let providerCalls = 0;
  const common = {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/user-from-req": { resolveUser: async () => ({ id: "member-1", email: "member@example.test" }) },
    "@/lib/api-security": {
      requireActiveAgentBusinessContext: async () => { businessLookups += 1; throw new Error("must not be reached"); },
      safeApiErrorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: 500 }),
    },
    "@/lib/google-business": {
      ...helper,
      BusinessGoogleError: class extends Error { status = 403; },
    },
  };
  const sync = loadTs<{ POST(req: TestNextRequest): Promise<Response> }>("src/app/api/google/reviews/sync/route.ts", {
    ...common,
    "@/lib/demo-data": { demoReviews: [] },
    "@/lib/google-review-sync": { fetchAllGoogleReviews: async () => { providerCalls += 1; return []; } },
    "@/lib/google-review-persistence": { persistGoogleReviews: async () => ({ synced: 0, newReviews: [] }) },
    "@/lib/review-alerts": { sendNewReviewAlert: async () => undefined },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
  });
  const replies = loadTs<{ POST(req: TestNextRequest): Promise<Response> }>("src/app/api/google/replies/route.ts", {
    ...common,
    "@/lib/review-reply-server": { postReplyToGoogleAndPersist: async () => { providerCalls += 1; return { ok: true }; } },
  });

  const syncResponse = await sync.POST(new NextRequest("http://localhost/api/google/reviews/sync?businessId=biz-query", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId: "biz-body" }),
  }));
  const replyResponse = await replies.POST(new NextRequest("http://localhost/api/google/replies?businessId=biz-query", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ businessId: "biz-body", reviewId: "review_1", locationName, reply: "Thanks" }),
  }));
  assert.equal(syncResponse.status, 400);
  assert.equal(replyResponse.status, 400);
  assert.equal(businessLookups, 0);
  assert.equal(providerCalls, 0);
});

test("review reply cron reads selected connected locations only", async () => {
  const statements: string[] = [];
  const cron = loadTs<{ GET(request: TestNextRequest): Promise<Response> }>("src/app/api/cron/review-replies/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/google-review-sync": { fetchAllGoogleReviews: async () => [] },
    "@/lib/google-review-persistence": { persistGoogleReviews: async () => ({ synced: 0, newReviews: [] }) },
    "@/lib/db/neon": { sql: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), ""));
      return [];
    } },
    "@/lib/reply-profile-defaults": { getProfileReplyDefaults: async () => null },
    "@/lib/review-reply-server": { generateReplyForReviewRow: async () => "", saveReplyDraft: async () => ({ ok: false, error: "" }) },
    "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
    "@/lib/cron-auth": { isAuthorizedCronRequest: () => true },
    "@/lib/review-alerts": { sendNewReviewAlert: async () => undefined },
    "@/lib/cron-health": { startCronRun: async () => "run", finishCronRun: async () => undefined },
    "@/lib/usage": { checkReviewReplyUsage: async () => ({ allowed: false }), incrementReviewReplyUsage: async () => undefined },
  });
  const response = await cron.GET(new NextRequest("http://localhost/api/cron/review-replies"));
  assert.equal(response.status, 200);
  assert.equal(statements.length, 1);
  assert.match(statements[0]!, /public\.business_google_locations selected/);
  assert.match(statements[0]!, /l\.connected IS TRUE/);
  assert.match(statements[0]!, /l\.connection_version = gc\.connection_version/);
  assert.match(statements[0]!, /b\.owner_user_id/);
  assert.doesNotMatch(statements[0]!, /FROM public\.gbp_locations l\s+INNER JOIN public\.businesses/);
});
