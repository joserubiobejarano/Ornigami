import assert from "node:assert/strict";
import test from "node:test";
import { loadTs, fakeSql } from "./a02-test-support.mts";

type Subscription = {
  id: string;
  status: string;
  customer: string;
  metadata: Record<string, string>;
  trial_start: number | null;
  items: { data: Array<{ price: { id: string }; current_period_start: number; current_period_end: number }> };
};
type ApplyInput = Record<string, unknown>;
type ReconcileResult = "processed" | "duplicate";
type Reconcile = (event: Record<string, unknown>, retrieve: (id: string) => Promise<Subscription>) => Promise<ReconcileResult>;

function event(id: string, type = "customer.subscription.updated", subscriptionId = "sub-event", metadata: Record<string, string> = {}) {
  if (type.startsWith("invoice.")) {
    return { id, type, data: { object: { customer: "cus-1", parent: { subscription_details: { subscription: subscriptionId } } } }, created: 1 };
  }
  const object = type === "checkout.session.completed"
    ? { mode: "subscription", subscription: subscriptionId, customer: "cus-1", metadata }
    : { id: subscriptionId, customer: "cus-1", metadata };
  return { id, type, data: { object }, created: Math.floor(Math.random() * 100000) };
}

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-current",
    status: "active",
    customer: "cus-1",
    metadata: { user_id: "owner-1", business_id: "business-1" },
    trial_start: null,
    items: { data: [{ price: { id: "price-complete-annual" }, current_period_start: 1_800_000_000, current_period_end: 1_831_536_000 }] },
    ...overrides,
  };
}

function setup(options: {
  mappingRows?: unknown[];
  currentRows?: unknown[];
  claimKinds?: Array<"claimed" | "duplicate" | "busy">;
  applyError?: Error;
} = {}) {
  const db = fakeSql((query) => {
    if (query.includes("SELECT DISTINCT b.owner_user_id")) return options.mappingRows ?? [{ owner_user_id: "owner-1", business_id: "business-1", stripe_customer_id: "cus-1" }];
    if (query.includes("SELECT DISTINCT stripe_subscription_id")) return options.currentRows ?? [];
    return [];
  });
  const applied: ApplyInput[] = [];
  const claims: Array<{ ownerUserId: string; eventId: string; eventType: string }> = [];
  let nextClaim = 0;
  const persistence = {
    claimBillingReconciliationLease: async (input: typeof claims[number]) => {
      claims.push(input);
      const kind = options.claimKinds?.[nextClaim++] ?? "claimed";
      return { kind, fence: kind === "claimed" ? `fence-${nextClaim}` : null, leaseUntil: null };
    },
    applyStripeWebhookSnapshot: async (input: ApplyInput) => {
      applied.push(input);
      if (options.applyError) throw options.applyError;
    },
    releaseBillingReconciliationLease: async () => undefined,
    renewBillingReconciliationLease: async () => true,
    markStripeEventIgnored: async () => undefined,
  };
  const loaded = loadTs<{ reconcileStripeEvent: Reconcile }>("src/lib/billing/reconciliation.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/billing/persistence": persistence,
    "@/lib/billing/plans": {
      agentsForPlan: (id: string) => id === "complete" ? ["review_replies", "review_booster"] : [id === "replies" ? "review_replies" : "review_booster"],
      planIdFromStripePrice: (id: string) => id === "price-replies-monthly" ? "replies" : id.startsWith("price-booster") ? "booster" : id.startsWith("price-complete") ? "complete" : null,
      periodFromStripePrice: (id: string) => id.endsWith("annual") ? "annual" : id.endsWith("monthly") ? "monthly" : null,
    },
    "@/lib/billing/webhook-state": { toBusinessAgentStatus: (status: string) => status },
  });
  return { reconcile: loaded.reconcileStripeEvent, applied, claims, queries: db.calls };
}

test("authoritative Stripe price wins over checkout metadata after a portal plan change", async () => {
  const harness = setup({ currentRows: [] });
  await harness.reconcile(event("evt-portal", "checkout.session.completed", "sub-event", { user_id: "owner-1", business_id: "business-1", plan_id: "booster", billing_period: "monthly" }), async (id) => subscription({ id }));
  assert.equal(harness.applied.length, 1);
  assert.equal(harness.applied[0].planId, "complete");
  assert.equal(harness.applied[0].billingPeriod, "annual");
  assert.equal((harness.applied[0].subscription as { id: string }).id, "sub-event");
});

test("an old canceled event re-fetches and applies the currently mapped replacement subscription", async () => {
  const harness = setup({ currentRows: [{ stripe_subscription_id: "sub-replacement" }] });
  const retrieved: string[] = [];
  await harness.reconcile(event("evt-old-delete", "customer.subscription.deleted", "sub-old"), async (id) => {
    retrieved.push(id);
    return subscription({ id, status: id === "sub-old" ? "canceled" : "active" });
  });
  assert.deepEqual(retrieved, ["sub-replacement", "sub-old"]);
  assert.equal((harness.applied[0].subscription as { id: string }).id, "sub-replacement");
  assert.equal(harness.applied[0].expectedPreviousSubscriptionId, "sub-replacement");
});

test("a delayed old subscription.created event cannot overwrite a newer active replacement", async () => {
  const harness = setup({ currentRows: [{ stripe_subscription_id: "sub-replacement" }] });
  await harness.reconcile(event("evt-old-created-late", "customer.subscription.created", "sub-old"), async (id) =>
    subscription({ id, status: id === "sub-old" ? "canceled" : "active" }));
  assert.equal((harness.applied[0].subscription as { id: string }).id, "sub-replacement");
});

test("a new checkout replaces only a terminal current subscription", async () => {
  const replaceable = setup({ currentRows: [{ stripe_subscription_id: "sub-old" }] });
  const retrieved: string[] = [];
  await replaceable.reconcile(event("evt-new-checkout", "checkout.session.completed", "sub-new"), async (id) => {
    retrieved.push(id);
    return id === "sub-old" ? subscription({ id, status: "canceled" }) : subscription({ id, status: "trialing", trial_start: 1_800_000_000 });
  });
  assert.deepEqual(retrieved, ["sub-old", "sub-new"]);
  assert.equal((replaceable.applied[0].subscription as { id: string }).id, "sub-new");
  assert.equal(replaceable.applied[0].expectedPreviousSubscriptionId, "sub-old");
  assert.equal(replaceable.applied[0].previousSubscriptionStatus, "canceled");

  const eventOrder = setup({ currentRows: [{ stripe_subscription_id: "sub-old" }] });
  await eventOrder.reconcile(event("evt-updated-first", "customer.subscription.updated", "sub-new"), async (id) =>
    subscription({ id, status: id === "sub-old" ? "canceled" : "active" }));
  assert.equal((eventOrder.applied[0].subscription as { id: string }).id, "sub-new");

  const oldTerminal = setup({ currentRows: [{ stripe_subscription_id: "sub-new" }] });
  await oldTerminal.reconcile(event("evt-old-terminal", "customer.subscription.deleted", "sub-old"), async (id) =>
    subscription({ id, status: "canceled" }));
  assert.equal((oldTerminal.applied[0].subscription as { id: string }).id, "sub-new",
    "a terminal mapped subscription remains reconcilable after a delayed old terminal event");

  const live = setup({ currentRows: [{ stripe_subscription_id: "sub-old" }] });
  await assert.rejects(live.reconcile(event("evt-live-checkout", "checkout.session.completed", "sub-new"), async (id) => subscription({ id, status: "active" })), /Conflicting live/);
  assert.equal(live.applied.length, 0);

  const unpaid = setup({ currentRows: [{ stripe_subscription_id: "sub-old" }] });
  await assert.rejects(unpaid.reconcile(event("evt-unpaid-checkout", "checkout.session.completed", "sub-new"), async (id) => subscription({ id, status: id === "sub-old" ? "unpaid" : "trialing" })), /Conflicting live/);
});

test("shuffled lifecycle deliveries converge from the same current Stripe subscription", async () => {
  const harness = setup({ currentRows: [{ stripe_subscription_id: "sub-current" }] });
  const current = subscription({ status: "past_due", items: { data: [{ price: { id: "price-booster-monthly" }, current_period_start: 1_800_000_000, current_period_end: 1_831_536_000 }] } });
  for (const id of ["evt-newer", "evt-older"]) {
    await harness.reconcile(event(id, "customer.subscription.updated", id === "evt-newer" ? "sub-newer-snapshot" : "sub-old-snapshot"), async (requested) =>
      requested === "sub-current" ? current : subscription({ id: requested, status: "canceled" }));
  }
  assert.deepEqual(harness.applied.map((item) => (item.subscription as { status: string }).status), ["past_due", "past_due"]);
  assert.deepEqual(harness.applied.map((item) => item.planId), ["booster", "booster"]);
});

test("invoice payment failure reconciles current provider state rather than invoice or event ordering", async () => {
  const harness = setup({ currentRows: [{ stripe_subscription_id: "sub-current" }] });
  await harness.reconcile(event("evt-invoice-failed", "invoice.payment_failed", "sub-current"), async (id) =>
    subscription({ id, status: "active" }));
  assert.equal((harness.applied[0].subscription as { status: string }).status, "active");
});

test("a trial is consumed from authoritative trial_start even when the retrieved subscription is canceled", async () => {
  const harness = setup({ currentRows: [] });
  await harness.reconcile(event("evt-canceled-trial", "customer.subscription.deleted"), async (id) => subscription({ id, status: "canceled", trial_start: 1_700_000_000 }));
  assert.notEqual(harness.applied[0].trialStart, null);
  assert.equal(harness.applied[0].trialStart, new Date(1_700_000_000 * 1000).toISOString());
});

test("duplicate and in-flight event claims avoid fetching or acknowledging unfinished work", async () => {
  const duplicate = setup({ claimKinds: ["duplicate"] });
  assert.equal(await duplicate.reconcile(event("evt-repeat"), async () => { throw new Error("must not fetch"); }), "duplicate");
  const busy = setup({ claimKinds: ["busy"] });
  await assert.rejects(busy.reconcile(event("evt-busy"), async () => { throw new Error("must not fetch"); }), /in progress/);
  assert.equal(busy.applied.length, 0);
});

test("missing and ambiguous mappings stay retryable without claiming an event", async () => {
  for (const mappingRows of [[], [
    { owner_user_id: "owner-1", business_id: "business-1", stripe_customer_id: "cus-1" },
    { owner_user_id: "owner-1", business_id: "business-2", stripe_customer_id: "cus-1" },
  ]]) {
    const harness = setup({ mappingRows });
    await assert.rejects(harness.reconcile(event("evt-unmapped"), async () => subscription()), /mapping/);
    assert.equal(harness.claims.length, 0);
    assert.equal(harness.applied.length, 0);
  }
});

test("unknown price and atomic persistence failures propagate for Stripe retry", async () => {
  const unknown = setup();
  const badPrice = subscription({ id: "sub-event", items: { data: [{ price: { id: "price-unknown" }, current_period_start: 1, current_period_end: 2 }] } });
  await assert.rejects(unknown.reconcile(event("evt-price"), async () => badPrice), /Unrecognized Stripe price/);
  assert.equal(unknown.applied.length, 0);
  const failure = setup({ applyError: new Error("atomic update failed") });
  await assert.rejects(failure.reconcile(event("evt-db-failure"), async (id) => subscription({ id })), /atomic update failed/);
});

test("a stale or expired persistence fence cannot be acknowledged", async () => {
  const harness = setup({ applyError: new Error("billing reconciliation lease is stale") });
  await assert.rejects(harness.reconcile(event("evt-stale-worker"), async (id) => subscription({ id })), /lease is stale/);
});

test("A11 deletion helper cancels only owner-mapped subscriptions under the billing fence", async () => {
  const db = fakeSql(() => [
    { business_id: "business-1", owner_user_id: "owner-1", business_customer_id: "cus-1", owner_customer_id: "cus-1", stripe_subscription_id: "sub-1" },
    { business_id: "business-1", owner_user_id: "owner-1", business_customer_id: "cus-1", owner_customer_id: "cus-1", stripe_subscription_id: "sub-1" },
  ]);
  const canceled: string[] = [];
  const released: string[] = [];
  const loaded = loadTs<{ cancelMappedOwnedBillingSubscriptions(input: Record<string, unknown>): Promise<string[]> }>("src/lib/billing/reconciliation.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/billing/persistence": {
      claimBillingReconciliationLease: async () => ({ kind: "claimed", fence: "fence-1", leaseUntil: null }),
      releaseBillingReconciliationLease: async (input: { eventId: string }) => { released.push(input.eventId); return true; },
      renewBillingReconciliationLease: async () => true,
      applyStripeWebhookSnapshot: async () => undefined,
      markStripeEventIgnored: async () => undefined,
    },
    "@/lib/billing/plans": {
      agentsForPlan: () => [], planIdFromStripePrice: () => null, periodFromStripePrice: () => null,
    },
    "@/lib/billing/webhook-state": { toBusinessAgentStatus: (status: string) => status },
  });
  const result = await loaded.cancelMappedOwnedBillingSubscriptions({
    ownerUserId: "owner-1", operationId: "delete-job-1",
    retrieveSubscription: async (id: string) => subscription({ id }),
    cancelSubscription: async (id: string) => { canceled.push(id); return subscription({ id, status: "canceled" }); },
  });
  assert.deepEqual(result, ["sub-1"]);
  assert.deepEqual(canceled, ["sub-1"]);
  assert.deepEqual(released, ["privacy-billing-cancel:delete-job-1"]);
});

test("A11 deletion helper fails closed when the provider customer disagrees with the local owner mapping", async () => {
  const db = fakeSql(() => [{ business_id: "business-1", owner_user_id: "owner-1", business_customer_id: "cus-1", owner_customer_id: "cus-1", stripe_subscription_id: "sub-1" }]);
  const loaded = loadTs<{ cancelMappedOwnedBillingSubscriptions(input: Record<string, unknown>): Promise<string[]> }>("src/lib/billing/reconciliation.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/billing/persistence": {
      claimBillingReconciliationLease: async () => ({ kind: "claimed", fence: "fence-1", leaseUntil: null }),
      releaseBillingReconciliationLease: async () => true,
      renewBillingReconciliationLease: async () => true,
      applyStripeWebhookSnapshot: async () => undefined,
      markStripeEventIgnored: async () => undefined,
    },
    "@/lib/billing/plans": { agentsForPlan: () => [], planIdFromStripePrice: () => null, periodFromStripePrice: () => null },
    "@/lib/billing/webhook-state": { toBusinessAgentStatus: (status: string) => status },
  });
  let cancelCalls = 0;
  await assert.rejects(loaded.cancelMappedOwnedBillingSubscriptions({
    ownerUserId: "owner-1", operationId: "delete-job-2",
    retrieveSubscription: async (id: string) => subscription({ id, customer: "cus-other" }),
    cancelSubscription: async (id: string) => { cancelCalls++; return subscription({ id, status: "canceled" }); },
  }), /customer conflicts/);
  assert.equal(cancelCalls, 0);
});

test("A11 deletion helper refuses provider cancellation after its renewal fence is lost", async () => {
  const db = fakeSql(() => [{ business_id: "business-1", owner_user_id: "owner-1", business_customer_id: "cus-1", owner_customer_id: "cus-1", stripe_subscription_id: "sub-1" }]);
  const loaded = loadTs<{ cancelMappedOwnedBillingSubscriptions(input: Record<string, unknown>): Promise<string[]> }>("src/lib/billing/reconciliation.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/billing/persistence": {
      claimBillingReconciliationLease: async () => ({ kind: "claimed", fence: "fence-1", leaseUntil: null }),
      releaseBillingReconciliationLease: async () => true,
      renewBillingReconciliationLease: async () => false,
      applyStripeWebhookSnapshot: async () => undefined,
      markStripeEventIgnored: async () => undefined,
    },
    "@/lib/billing/plans": { agentsForPlan: () => [], planIdFromStripePrice: () => null, periodFromStripePrice: () => null },
    "@/lib/billing/webhook-state": { toBusinessAgentStatus: (status: string) => status },
  });
  let providerCalls = 0;
  await assert.rejects(loaded.cancelMappedOwnedBillingSubscriptions({
    ownerUserId: "owner-1", operationId: "delete-job-expired",
    retrieveSubscription: async (id: string) => { providerCalls++; return subscription({ id }); },
    cancelSubscription: async (id: string) => { providerCalls++; return subscription({ id, status: "canceled" }); },
  }), /lease expired/);
  assert.equal(providerCalls, 0);
});

test("webhook route only acknowledges duplicates or completed reconciliation", async () => {
  const loadRoute = (options: { configured?: boolean; signatureValid?: boolean; outcome?: "processed" | "duplicate" | Error }) => {
    const eventValue = event("evt-route");
    const route = loadTs<{ POST(request: { text(): Promise<string>; headers: Headers }): Promise<{ status: number; body: unknown }> }>("src/app/api/stripe/webhook/route.ts", {
      "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } },
      "@/lib/stripe": { stripe: { webhooks: { constructEvent: () => { if (!options.signatureValid) throw new Error("bad signature"); return eventValue; } }, subscriptions: { retrieve: async () => subscription() } } },
      "@/lib/env": { getRequiredEnv: () => { if (options.configured === false) throw new Error("missing secret"); return "whsec_test"; } },
      "@/lib/safe-logger": { safeLogger: { error() {} } },
      "@/lib/billing/reconciliation": { reconcileStripeEvent: async () => { if (options.outcome instanceof Error) throw options.outcome; return options.outcome ?? "processed"; } },
    });
    return (signature?: string) => route.POST({ text: async () => "{}", headers: new Headers(signature ? { "stripe-signature": signature } : {}) });
  };
  assert.equal((await loadRoute({ configured: false })()).status, 503);
  assert.equal((await loadRoute({ signatureValid: true })()).status, 400);
  assert.equal((await loadRoute({ signatureValid: false })("sig")).status, 400);
  const duplicate = await loadRoute({ signatureValid: true, outcome: "duplicate" })("sig");
  assert.equal(duplicate.status, 200);
  assert.deepEqual(duplicate.body, { received: true, duplicate: true });
  assert.equal((await loadRoute({ signatureValid: true, outcome: new Error("busy") })("sig")).status, 500);
});
