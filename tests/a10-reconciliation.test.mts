import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const deliveryId = "00000000-0000-4000-8000-000000000021";
const messageId = "00000000-0000-4000-8000-000000000031";
const businessId = "00000000-0000-4000-8000-000000000041";
const observedAt = new Date("2026-10-03T10:00:00.000Z");
const payload = {
  from: '"Studio" <verified@example.com>', to: "customer@example.com", subject: "Your visit",
  text: "Thanks for visiting", html: "<p>Thanks for visiting</p>",
  tags: [{ name: "ornigami_delivery_id", value: deliveryId }],
};

function email(overrides: Record<string, unknown> = {}) {
  return {
    id: messageId, to: ["customer@example.com"], from: payload.from, subject: payload.subject,
    html: payload.html, text: null,
    tags: [{ name: "ornigami_delivery_id", value: deliveryId }], last_event: "delivered", ...overrides,
  };
}

function loadService(config: {
  context?: Record<string, unknown> | null;
  lookup?: () => Promise<unknown>;
  apply?: (event: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  const events: Record<string, unknown>[] = [];
  const service = loadTs<{
    reconcileBoosterDelivery(input: { businessId: string; deliveryId: string; providerMessageId?: string | null }, deps: Record<string, unknown>): Promise<Record<string, unknown>>;
    lookupResendEmail(providerMessageId: string, timeoutMs?: number): Promise<unknown>;
  }>("src/modules/review-booster/services/resend-reconciliation.service.ts", {
    "@/lib/env": { getRequiredEnv: () => "test-key" },
    "@/modules/review-booster/services/delivery-events-db.service": {
      getBoosterDeliveryReconciliationContext: async () => config.context ?? {
        deliveryId, businessId, state: "reconciliation_required", deliveryStatus: "unknown",
        providerMessageId: null, payload, currentRecipient: "customer@example.com", currentStatus: "failed",
        leaseUntil: "2026-10-03T09:00:00.000Z",
      },
      applyBoosterDeliveryEvent: async () => ({ kind: "invalid" }),
    },
  });
  const deps = {
    loadContext: async () => config.context === null ? null : config.context ?? {
      deliveryId, businessId, state: "reconciliation_required", deliveryStatus: "unknown",
      providerMessageId: null, payload, currentRecipient: "customer@example.com", currentStatus: "failed",
      leaseUntil: "2026-10-03T09:00:00.000Z",
    },
    applyEvent: async (event: Record<string, unknown>) => {
      events.push(event);
      return config.apply ? config.apply(event) : { kind: "applied", state: "accepted", deliveryStatus: "delivered" };
    },
    lookup: config.lookup ?? (async () => email()),
    now: () => observedAt,
  };
  return {
    run: (id?: string | null) => service.reconcileBoosterDelivery({ businessId, deliveryId, providerMessageId: id }, deps),
    lookup: service.lookupResendEmail,
    events,
  };
}

test("A10 reconciliation applies a positive lookup only after ID, frozen tag, envelope, and body match", async () => {
  const harness = loadService();
  assert.deepEqual(await harness.run(messageId), {
    kind: "resolved", deliveryId, deliveryState: "accepted", deliveryStatus: "delivered",
  });
  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0]?.eventId, `lookup:${messageId}:email.delivered:${observedAt.toISOString()}`);
  assert.equal(harness.events[0]?.createdAt, observedAt.toISOString(), "lookup records observation time, not provider email creation time");
  assert.equal(harness.events[0]?.evidenceSource, "provider_lookup");
});

test("A10 rejects wrong recipient, sender, subject, body, provider ID, and tag without touching the ledger", async () => {
  const variants = [
    { to: ["someone-else@example.com"] },
    { from: '"Other" <other@example.com>' },
    { subject: "Similar message" },
    { html: "<p>Different frozen content</p>" },
    { id: "00000000-0000-4000-8000-000000000099" },
    { tags: [{ name: "ornigami_delivery_id", value: "00000000-0000-4000-8000-000000000099" }] },
    { tags: [
      { name: "ornigami_delivery_id", value: deliveryId },
      { name: "ornigami_delivery_id", value: "00000000-0000-4000-8000-000000000099" },
    ] },
  ];
  for (const variant of variants) {
    const harness = loadService({ lookup: async () => email(variant) });
    assert.deepEqual(await harness.run(messageId), { kind: "identity_mismatch" });
    assert.equal(harness.events.length, 0);
  }
});

test("A10 keeps missing IDs, 404s, timeouts, malformed responses, and non-positive snapshots unresolved", async () => {
  const missing = loadService();
  assert.deepEqual(await missing.run(), { kind: "missing_provider_id" });
  assert.equal(missing.events.length, 0);

  const notFound = loadService({ lookup: async () => null });
  assert.deepEqual(await notFound.run(messageId), { kind: "provider_not_found" });
  assert.equal(notFound.events.length, 0);

  const timeout = loadService({ lookup: async () => { throw new Error("timeout"); } });
  assert.deepEqual(await timeout.run(messageId), { kind: "provider_unavailable" });
  assert.equal(timeout.events.length, 0);

  const malformed = loadService({ lookup: async () => ({ id: messageId }) });
  assert.deepEqual(await malformed.run(messageId), { kind: "provider_response_invalid" });
  assert.equal(malformed.events.length, 0);

  const stale = loadService({ lookup: async () => email({ last_event: "received" }) });
  assert.deepEqual(await stale.run(messageId), { kind: "provider_status_unconfirmed" });
  assert.equal(stale.events.length, 0);
});

test("A10 accepts provider lifecycle snapshots while keeping quota accepted and latest status intact", async () => {
  for (const [lastEvent, expectedType] of [
    ["sent", "email.sent"], ["bounced", "email.bounced"], ["complained", "email.complained"],
    ["failed", "email.failed"], ["suppressed", "email.suppressed"], ["delivery_delayed", "email.delivery_delayed"],
    ["opened", "email.sent"], ["clicked", "email.sent"], ["queued", "email.sent"],
    ["scheduled", "email.sent"], ["canceled", "email.sent"],
  ]) {
    const harness = loadService({
      lookup: async () => email({ last_event: lastEvent }),
      apply: async () => ({ kind: "applied", state: "accepted", deliveryStatus: lastEvent }),
    });
    const result = await harness.run(messageId);
    assert.equal(result.kind, "resolved", lastEvent);
    assert.equal(harness.events[0]?.type, expectedType);
  }
});

test("A10 can validate an already-stored provider ID after payload erasure, but never substitutes an operator guess", async () => {
  const stored = loadService({
    context: {
      deliveryId, businessId, state: "reconciliation_required", deliveryStatus: "unknown",
      providerMessageId: messageId, payload: null, currentRecipient: "customer@example.com", currentStatus: "failed",
      leaseUntil: "2026-10-03T09:00:00.000Z",
    },
  });
  assert.equal((await stored.run()).kind, "resolved");
  assert.equal(stored.events.length, 1);

  const guessed = loadService({
    context: {
      deliveryId, businessId, state: "reconciliation_required", deliveryStatus: "unknown",
      providerMessageId: null, payload: null, currentRecipient: "customer@example.com", currentStatus: "failed",
      leaseUntil: "2026-10-03T09:00:00.000Z",
    },
  });
  assert.equal((await guessed.run(messageId)).kind, "identity_mismatch");
  assert.equal(guessed.events.length, 0);

  const changedRecipient = loadService({
    context: {
      deliveryId, businessId, state: "reconciliation_required", deliveryStatus: "unknown",
      providerMessageId: messageId, payload: null, currentRecipient: "changed@example.com", currentStatus: "failed",
      leaseUntil: "2026-10-03T09:00:00.000Z",
    },
  });
  assert.equal((await changedRecipient.run()).kind, "identity_mismatch");
  assert.equal(changedRecipient.events.length, 0);
});

test("A10 refuses active or missing unknown leases and rows owned by another business", async () => {
  for (const invalidContext of [
    { deliveryId, businessId, state: "sending", deliveryStatus: "unknown", providerMessageId: messageId, payload, currentRecipient: "customer@example.com" },
    { deliveryId, businessId, state: "unknown", deliveryStatus: "unknown", providerMessageId: messageId, payload, currentRecipient: "customer@example.com", leaseUntil: null },
    { deliveryId, businessId: "00000000-0000-4000-8000-000000000099", state: "reconciliation_required", deliveryStatus: "unknown", providerMessageId: messageId, payload, currentRecipient: "customer@example.com" },
  ]) {
    const harness = loadService({ context: invalidContext, lookup: async () => email() });
    assert.deepEqual(await harness.run(messageId), { kind: invalidContext.businessId === businessId ? "not_reconcilable" : "not_found" });
    assert.equal(harness.events.length, 0);
  }
});

const actor = "00000000-0000-4000-8000-000000000011";
const routeDelivery = "00000000-0000-4000-8000-000000000021";
const routeBusiness = "00000000-0000-4000-8000-000000000041";
const boundedBody = loadTs<{
  readBoundedReconciliationRequestBody(request: Request, maxBytes?: number, timeoutMs?: number): Promise<string>;
}>("src/modules/review-booster/services/reconciliation-request-body.service.ts", {});
function loadRoute(config: { owner?: boolean; originAllowed?: boolean; enabled?: boolean; result?: Record<string, unknown> } = {}) {
  const state = { ownerChecks: 0, reconcileCalls: 0 };
  const route = loadTs<{
    POST(request: Request, context: { params: Promise<{ deliveryId: string }> }): Promise<Response>;
  }>("src/app/api/review-booster/deliveries/[deliveryId]/reconcile/route.ts", {
    "@/auth": { auth: async () => ({ user: { id: actor, email: "owner@example.com" } }) },
    "@/lib/env": { getOptionalEnv: () => config.enabled === false ? undefined : "true" },
    "@/lib/api-security": { safeApiErrorResponse: (error: unknown) => Response.json({ error: String(error) }, { status: Number((error as { status?: unknown }).status ?? 500) }) },
    "@/lib/business-context": { requireBusinessOwner: async (_actor: string, businessId: string) => {
      state.ownerChecks += 1;
      assert.equal(_actor, actor);
      if (!config.owner || businessId !== routeBusiness) throw Object.assign(new Error("Business owner access required."), { status: 403 });
      return { businessId };
    } },
    "@/lib/team-lifecycle": { isSameOriginMutation: () => config.originAllowed !== false },
    "@/modules/review-booster/services/reconciliation-request-body.service": boundedBody,
    "@/modules/review-booster/services/resend-reconciliation.service": {
      reconcileBoosterDelivery: async (input: Record<string, unknown>) => {
        state.reconcileCalls += 1;
        assert.equal(input.businessId, routeBusiness);
        assert.equal(input.deliveryId, routeDelivery);
        return config.result ?? { kind: "resolved", deliveryId: routeDelivery, deliveryState: "accepted", deliveryStatus: "delivered" };
      },
    },
  });
  return { route, state };
}

function routeRequest(body: unknown) {
  return new Request("https://ornigami.example/api/review-booster/deliveries/x/reconcile", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://ornigami.example" }, body: JSON.stringify(body),
  });
}

test("A10 route permits owner reconciliation independent of active entitlement and never sends", async () => {
  const { route, state } = loadRoute({ owner: true });
  const response = await route.POST(routeRequest({ businessId: routeBusiness, providerMessageId: messageId }), { params: Promise.resolve({ deliveryId: routeDelivery }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { status: string }).status, "resolved");
  assert.equal(state.ownerChecks, 1);
  assert.equal(state.reconcileCalls, 1);
});

test("owner reconciliation remains closed before controlled provider verification", async () => {
  const { route, state } = loadRoute({ owner: true, enabled: false });
  const response = await route.POST(routeRequest({ businessId: routeBusiness }), { params: Promise.resolve({ deliveryId: routeDelivery }) });
  assert.equal(response.status, 503);
  assert.equal(state.ownerChecks, 1);
  assert.equal(state.reconcileCalls, 0, "the disabled route makes no provider lookup or evidence mutation");
});

test("A10 route denies members, cross-tenant owners, bad origins, malformed input, and oversized chunked requests", async () => {
  const member = loadRoute({ owner: false });
  assert.equal((await member.route.POST(routeRequest({ businessId: routeBusiness }), { params: Promise.resolve({ deliveryId: routeDelivery }) })).status, 403);
  assert.equal(member.state.reconcileCalls, 0);

  const crossTenant = loadRoute({ owner: true });
  assert.equal((await crossTenant.route.POST(routeRequest({ businessId: "00000000-0000-4000-8000-000000000099" }), { params: Promise.resolve({ deliveryId: routeDelivery }) })).status, 403);
  assert.equal(crossTenant.state.reconcileCalls, 0);

  const badOrigin = loadRoute({ owner: true, originAllowed: false });
  assert.equal((await badOrigin.route.POST(routeRequest({ businessId: routeBusiness }), { params: Promise.resolve({ deliveryId: routeDelivery }) })).status, 403);
  assert.equal(badOrigin.state.reconcileCalls, 0);

  const malformed = loadRoute({ owner: true });
  assert.equal((await malformed.route.POST(routeRequest({ businessId: "bad" }), { params: Promise.resolve({ deliveryId: routeDelivery }) })).status, 400);
  assert.equal(malformed.state.reconcileCalls, 0);

  const tooLarge = loadRoute({ owner: true });
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4096)); controller.close(); } });
  const request = new Request("https://ornigami.example/api/review-booster/deliveries/x/reconcile", {
    method: "POST", headers: { origin: "https://ornigami.example" }, body: stream, duplex: "half",
  } as RequestInit);
  assert.equal((await tooLarge.route.POST(request, { params: Promise.resolve({ deliveryId: routeDelivery }) })).status, 413);
  assert.equal(tooLarge.state.reconcileCalls, 0);
});

test("A10 bounds stalled and failing request streams without hanging on cancellation", async () => {
  const stalled = new ReadableStream<Uint8Array>({ cancel() { return Promise.reject(new Error("cancel failed")); } });
  const stalledRequest = new Request("https://ornigami.example", { method: "POST", body: stalled, duplex: "half" } as RequestInit);
  await assert.rejects(boundedBody.readBoundedReconciliationRequestBody(stalledRequest, 2048, 5), /body_timeout/);

  const failed = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("stream failed")); } });
  const failedRequest = new Request("https://ornigami.example", { method: "POST", body: failed, duplex: "half" } as RequestInit);
  await assert.rejects(boundedBody.readBoundedReconciliationRequestBody(failedRequest, 2048, 100), /body_read_error/);
});

test("A10 bounds Resend response body reads and fails closed on 404, malformed JSON, and stalled streams", async () => {
  const harness = loadService();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.equal(await harness.lookup(messageId, 25), null);

    globalThis.fetch = async () => new Response("not-json", { status: 200 });
    await assert.rejects(harness.lookup(messageId, 25));

    const stalled = new ReadableStream<Uint8Array>({ cancel() { return Promise.reject(new Error("cancel failed")); } });
    globalThis.fetch = async () => new Response(stalled, { status: 200 });
    await assert.rejects(harness.lookup(messageId, 10), /provider_response_timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
