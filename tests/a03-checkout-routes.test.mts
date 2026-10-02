import assert from "node:assert/strict";
import test from "node:test";

import { fakeSql, loadTs } from "./a02-test-support.mts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const businessId = "22222222-2222-4222-8222-222222222222";
const customerId = "cus_owner";

type PersistedIntent = {
  requestHash: string; payload: Record<string, unknown>; planId: string; fence: string;
  key: string; sessionId: string | null; url: string | null; status: "pending" | "completed" | "expired"; createdAt: string;
};

function routeHarness(options: {
  role?: "owner" | "member"; eligibility?: string; providerSubscription?: Record<string, unknown>;
  mapping?: { business_customer_id: string | null; owner_customer_id: string | null };
  activeSubscription?: Record<string, unknown>;
  noBusiness?: boolean;
  existingIntentAgeMs?: number;
} = {}) {
  const db = fakeSql(query => {
    if (query.includes("SELECT email FROM public.users")) return [{ email: "owner@example.test" }];
    if (query.includes("AS business_customer_id")) return [options.mapping ?? { business_customer_id: customerId, owner_customer_id: customerId }];
    if (query.includes("FROM public.business_agents") && query.includes("lower(status) IN")) {
      return options.activeSubscription ? [{ stripe_subscription_id: "sub_1" }] : [];
    }
    if (query.includes("SELECT DISTINCT stripe_subscription_id")) return [];
    if (query.includes("FROM public.business_agents a")) return [];
    if (query.includes("SELECT owner_user_id FROM public.businesses")) return [];
    if (query.includes("RETURNING id")) return [{ id: businessId }];
    return [];
  });
  const state: {
    intent: PersistedIntent | null; created: Array<Record<string, unknown>>; trialEligibility: string;
    failFinalizeOnce: boolean; ownerContextCalls: number; businessRequests: Array<string | undefined>;
    customerRetrievals: number; portalCreations: number;
  } = {
    intent: null, created: [], trialEligibility: options.eligibility ?? "eligible", failFinalizeOnce: false,
    ownerContextCalls: 0, businessRequests: [], customerRetrievals: 0, portalCreations: 0,
  };
  let nextSessionId = 0;
  let nextIntentId = 0;
  const providerSessions = new Map<string, { id: string; url: string; status: string; customer: string; metadata: Record<string, string> }>();
  const emptyAsyncIterable = { async *[Symbol.asyncIterator]() {} };
  const subscriptionsIterable = {
    async *[Symbol.asyncIterator]() {
      if (options.providerSubscription) yield options.providerSubscription;
    },
  };
  const stripe = {
    customers: {
      retrieve: async (id: string) => { state.customerRetrievals += 1; return { id, deleted: false, metadata: { owner_user_id: ownerId } }; },
    },
    subscriptions: {
      retrieve: async (id: string) => ({ id, status: "canceled", ...(options.activeSubscription ?? {}) }),
      list: () => options.providerSubscription ? subscriptionsIterable : emptyAsyncIterable,
    },
    checkout: { sessions: {
      list: ({ status }: { status: string }) => {
        return {
          async *[Symbol.asyncIterator]() {
            for (const session of providerSessions.values()) if (session.status === status) yield session;
          },
        };
      },
      create: async (payload: Record<string, unknown>, options: { idempotencyKey: string }) => {
        const existing = providerSessions.get(options.idempotencyKey);
        if (existing) return existing;
        nextSessionId += 1;
        const session = {
          id: `cs_${nextSessionId}`, url: `https://checkout.test/${nextSessionId}`, status: "open", customer: customerId,
          metadata: (payload.metadata ?? {}) as Record<string, string>,
        };
        state.created.push(payload);
        providerSessions.set(options.idempotencyKey, session);
        return session;
      },
      retrieve: async (id: string) => [...providerSessions.values()].find(item => item.id === id),
    } },
    billingPortal: { sessions: { create: async () => { state.portalCreations += 1; return { url: "https://portal.test/session" }; } } },
  };
  class BusinessAccessError extends Error {
    readonly status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
  }
  const context = { actorUserId: ownerId, ownerUserId: ownerId, billingOwnerUserId: ownerId, businessId, business: { id: businessId, owner_user_id: ownerId }, role: options.role ?? "owner" };
  const mocks = {
    "@/auth": { auth: async () => ({ user: { id: ownerId, email: "session@example.test" } }) },
    "@/lib/business-context": {
      BusinessAccessError,
      requireBusinessOwner: async (actor: string, requestedBusinessId?: string) => {
        state.ownerContextCalls += 1;
        state.businessRequests.push(requestedBusinessId);
        if (actor !== ownerId || options.noBusiness || (requestedBusinessId && requestedBusinessId !== businessId)) {
          throw new BusinessAccessError(403, "Business access denied.");
        }
        if ((options.role ?? "owner") !== "owner") throw new BusinessAccessError(403, "Business owner access required.");
        return context;
      },
    },
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/env": { getServerAppUrl: () => "https://app.test" },
    "@/lib/stripe": { stripe },
    "@/lib/billing/plans": {
      stripePriceId: (plan: string, period: string) => `price_${plan}_${period}`,
      TRIAL_PERIOD_DAYS: 14,
      planForAgent: (agent: string) => agent === "review_replies" ? "replies" : "booster",
    },
    "@/lib/billing/checkout-policy": {
      TRIAL_CHECKOUT_POLICY: { paymentMethodCollection: "if_required", missingPaymentMethod: "cancel" },
      isCheckoutBillingPeriod: (v: unknown) => v === "monthly" || v === "annual",
      isCheckoutPlanId: (v: unknown) => v === "replies" || v === "booster" || v === "complete",
    },
    "@/lib/billing/persistence": {
      getTrialEligibility: async () => state.trialEligibility,
      claimOwnerCustomerProvisioning: async () => ({ kind: "mapped", customerId, email: "owner@example.test", idempotencyKey: null, fence: null, status: null }),
      finalizeOwnerCustomerProvisioning: async () => true,
      claimCheckoutIntent: async (input: { requestHash: string; stripePayload: Record<string, unknown>; planId: string }) => {
        if (!state.intent && options.existingIntentAgeMs !== undefined) {
          nextIntentId += 1;
          state.intent = {
            requestHash: input.requestHash, payload: input.stripePayload, planId: input.planId,
            fence: `fence-${nextIntentId}`, key: `stable-key-${nextIntentId}`, sessionId: null, url: null,
            status: "pending", createdAt: new Date(Date.now() - options.existingIntentAgeMs).toISOString(),
          };
          return { kind: "existing", intentId: `intent-${nextIntentId}`, idempotencyKey: state.intent.key,
            fence: state.intent.fence, stripePayload: state.intent.payload, status: state.intent.status,
            sessionId: null, url: null, createdAt: state.intent.createdAt };
        }
        if (state.intent && state.intent.status !== "expired" && state.intent.requestHash !== input.requestHash) return { kind: "conflict", intentId: `intent-${nextIntentId}`, idempotencyKey: state.intent.key, fence: state.intent.fence, stripePayload: state.intent.payload, status: state.intent.status, createdAt: state.intent.createdAt };
        if (state.intent && state.intent.status !== "expired") return { kind: "existing", intentId: `intent-${nextIntentId}`, idempotencyKey: state.intent.key, fence: state.intent.fence, stripePayload: state.intent.payload, status: state.intent.status, sessionId: state.intent.sessionId, url: state.intent.url, createdAt: state.intent.createdAt };
        nextIntentId += 1;
        state.intent = { requestHash: input.requestHash, payload: input.stripePayload, planId: input.planId, fence: `fence-${nextIntentId}`, key: `stable-key-${nextIntentId}`, sessionId: null, url: null, status: "pending", createdAt: new Date().toISOString() };
        return { kind: "claimed", intentId: `intent-${nextIntentId}`, idempotencyKey: state.intent.key, fence: state.intent.fence, stripePayload: state.intent.payload, status: state.intent.status, createdAt: state.intent.createdAt };
      },
      finalizeCheckoutIntent: async ({ sessionId, url }: { sessionId: string; url: string }) => {
        if (state.failFinalizeOnce) { state.failFinalizeOnce = false; return false; }
        if (state.intent) { state.intent.sessionId = sessionId; state.intent.url = url; }
        return true;
      },
      markCheckoutIntentUncertain: async () => true,
      markCheckoutIntentCompleted: async () => true,
      expireCheckoutIntent: async () => { if (state.intent) state.intent.status = "expired"; return true; },
    },
    "@/lib/safe-logger": { safeLogger: { warn() {}, error() {} } },
  };
  return {
    state,
    db,
    checkout: loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/stripe/checkout/route.ts", mocks),
    portal: loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/stripe/portal/route.ts", mocks),
    changePlan: loadTs<{ POST(request: Request): Promise<Response> }>("src/app/api/stripe/change-plan/route.ts", mocks),
    expireProviderSession: (id: string) => { const session = [...providerSessions.values()].find(item => item.id === id); if (session) session.status = "expired"; },
  };
}

function checkoutRequest(plan = "complete", selectedBusinessId?: string) {
  const body: Record<string, string> = { plan_id: plan };
  if (selectedBusinessId) body.business_id = selectedBusinessId;
  return new Request("https://app.test/api/stripe/checkout", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

test("owner checkout is idempotent across concurrent route requests", async () => {
  const h = routeHarness();
  const responses = await Promise.all([h.checkout.POST(checkoutRequest()), h.checkout.POST(checkoutRequest())]);
  assert.deepEqual(responses.map(response => response.status), [303, 303]);
  assert.equal(h.state.created.length, 1, "provider receives one session create for the stable intent key");
  assert.equal(h.state.intent?.sessionId, "cs_1");
});

test("database failure after Stripe creates a session recovers that same session", async () => {
  const h = routeHarness();
  h.state.failFinalizeOnce = true;
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 503);
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 303);
  assert.equal(h.state.created.length, 1);
  assert.equal(h.state.intent?.sessionId, "cs_1");
});

test("confirmed expired abandoned checkout can claim a fresh trial session", async () => {
  const h = routeHarness();
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 303);
  h.expireProviderSession("cs_1");
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 303);
  assert.equal(h.state.created.length, 2);
  assert.equal(h.state.intent?.key, "stable-key-2");
  const payload = h.state.created[1] as { subscription_data?: Record<string, unknown> };
  assert.equal(payload.subscription_data?.trial_period_days, 14);
  const firstMetadata = (h.state.created[0].metadata ?? {}) as Record<string, string>;
  const secondMetadata = (h.state.created[1].metadata ?? {}) as Record<string, string>;
  assert.notEqual(secondMetadata.billing_intent_token, firstMetadata.billing_intent_token);
  assert.equal(h.state.trialEligibility, "eligible", "abandoned checkout did not consume trial history");
});

test("unresolved checkout older than Stripe idempotency retention remains blocked", async () => {
  const h = routeHarness({ existingIntentAgeMs: 25 * 60 * 60 * 1000 });
  const response = await h.checkout.POST(checkoutRequest());
  assert.equal(response.status, 409);
  assert.equal(h.state.created.length, 0, "an old unknown key is never posted again");
});

test("existing open session with a failed persistence finalize returns retriable error", async () => {
  const h = routeHarness();
  h.state.failFinalizeOnce = true;
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 503);
  h.state.failFinalizeOnce = true;
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 503);
  assert.equal(h.state.created.length, 1);
});

test("member cannot create checkout or reach billing provider", async () => {
  const h = routeHarness({ role: "member" });
  const response = await h.checkout.POST(checkoutRequest());
  assert.equal(response.status, 403);
  assert.equal(h.state.created.length, 0);
});

test("concurrent implicit checkout requests without a persisted business fail before Stripe", async () => {
  const h = routeHarness({ noBusiness: true });
  const responses = await Promise.all([h.checkout.POST(checkoutRequest()), h.checkout.POST(checkoutRequest())]);
  assert.deepEqual(responses.map(response => response.status), [403, 403]);
  assert.equal(h.state.ownerContextCalls, 2);
  assert.deepEqual(h.state.businessRequests, [undefined, undefined]);
  assert.equal(h.state.customerRetrievals, 0);
  assert.equal(h.state.created.length, 0);
  assert.equal(h.db.calls.length, 0, "routes do not invoke a business bootstrap path");
});

test("invalid explicit business IDs are rejected without fallback on all billing mutations", async () => {
  const h = routeHarness();
  const checkout = await h.checkout.POST(checkoutRequest("complete", "33333333-3333-4333-8333-333333333333"));
  const change = await h.changePlan.POST(new Request("https://app.test/api/stripe/change-plan", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan_id: "complete", business_id: "33333333-3333-4333-8333-333333333333" }),
  }));
  const portal = await h.portal.POST(new Request("https://app.test/api/stripe/portal?business_id=33333333-3333-4333-8333-333333333333", { method: "POST" }));
  assert.deepEqual([checkout.status, change.status, portal.status], [403, 403, 403]);
  assert.equal(h.state.ownerContextCalls, 3);
  assert.equal(h.state.businessRequests.every(id => id === "33333333-3333-4333-8333-333333333333"), true);
  assert.equal(h.state.customerRetrievals, 0);
  assert.equal(h.state.created.length, 0);
  assert.equal(h.db.calls.length, 0);
});

test("a conflicting plan cannot replace the immutable pending checkout", async () => {
  const h = routeHarness();
  assert.equal((await h.checkout.POST(checkoutRequest("replies"))).status, 303);
  assert.equal((await h.checkout.POST(checkoutRequest("complete"))).status, 409);
  assert.equal(h.state.created.length, 1);
});

test("previously consumed or unknown legacy trial history starts a paid checkout without resetting trial", async () => {
  const h = routeHarness({ eligibility: "used" });
  const response = await h.checkout.POST(checkoutRequest());
  assert.equal(response.status, 303);
  const payload = h.state.created[0] as { subscription_data?: Record<string, unknown> };
  assert.equal(payload.subscription_data?.trial_period_days, undefined);
});

test("orphaned live Stripe subscription blocks a new checkout for reconciliation", async () => {
  const h = routeHarness({ providerSubscription: { id: "sub_orphan", status: "unpaid", metadata: {} } });
  assert.equal((await h.checkout.POST(checkoutRequest())).status, 409);
  assert.equal(h.state.created.length, 0);
});

test("portal and plan changes reject members before touching Stripe", async () => {
  const h = routeHarness({ role: "member" });
  assert.equal((await h.portal.POST(new Request("https://app.test/api/stripe/portal", { method: "POST" }))).status, 403);
  assert.equal((await h.changePlan.POST(new Request("https://app.test/api/stripe/change-plan", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_id: "complete" }),
  }))).status, 403);
  assert.equal(h.state.created.length, 0);
});

test("portal rejects conflicting business and canonical owner customer mappings", async () => {
  const h = routeHarness({ mapping: { business_customer_id: "cus_other", owner_customer_id: customerId } });
  const response = await h.portal.POST(new Request("https://app.test/api/stripe/portal", { method: "POST" }));
  assert.equal(response.status, 409);
});

test("plan changes reject subscriptions attached to another Stripe customer", async () => {
  const h = routeHarness({ activeSubscription: {
    customer: "cus_wrong", status: "active", metadata: { business_id: businessId, owner_user_id: ownerId },
    items: { data: [{ id: "si_1", price: { id: "price_old" } }] },
  } });
  const response = await h.changePlan.POST(new Request("https://app.test/api/stripe/change-plan", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan_id: "complete", billing_period: "monthly" }),
  }));
  assert.equal(response.status, 403);
});
