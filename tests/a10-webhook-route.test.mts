import assert from "node:assert/strict";
import test from "node:test";
import { deliveryPayload, loadResendWebhookRoute, loadResendWebhookService, nowSeconds, signedRequest, webhookSecret } from "./a10-webhook-test-support.mts";

const deliveryId = "2c6e5665-5f94-4e21-bbaa-f49fc04e2091";

function route(applyDeliveryEvent: (event: Record<string, unknown>) => Promise<Record<string, unknown>>, secret?: string) {
  const { createResendWebhookPost } = loadResendWebhookService();
  return createResendWebhookPost({ getSecret: () => secret ?? webhookSecret, applyDeliveryEvent, nowSeconds: () => nowSeconds });
}

test("verified bounce is normalized using signed event ID, provider ID, recipient, and immutable tag", async () => {
  let stored: Record<string, unknown> | undefined;
  const handler = route(async (event) => { stored = event; return { kind: "applied", deliveryId, deliveryState: "bounced" }; });
  const rawBody = JSON.stringify(deliveryPayload());
  const response = await handler(signedRequest(rawBody));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, duplicate: false });
  assert.deepEqual(stored, {
    eventId: "msg_test_123",
    type: "email.bounced",
    createdAt: "2026-10-03T12:00:00.000Z",
    providerMessageId: "resend-email-id-1",
    deliveryId,
    recipients: ["customer@example.com"],
    evidenceSource: "webhook",
  });
});

test("the actual Next route exports POST wired to the delivery adapter", async () => {
  let seen: Record<string, unknown> | undefined;
  const routeModule = loadResendWebhookRoute(async (event) => { seen = event; return { kind: "applied" }; });
  const response = await routeModule.POST(signedRequest(JSON.stringify(deliveryPayload({ type: "email.delivered" }))));
  assert.equal(response.status, 200);
  assert.equal(seen?.type, "email.delivered");
  assert.equal(seen?.evidenceSource, "webhook");
});

test("database event idempotency result is acknowledged as a duplicate", async () => {
  const handler = route(async () => ({ kind: "duplicate" }));
  const response = await handler(signedRequest(JSON.stringify(deliveryPayload())));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, duplicate: true });
});

test("invalid signature, stale replay, missing secret, and malformed payload are rejected before persistence", async () => {
  let calls = 0;
  const handler = route(async () => { calls++; return { kind: "applied" }; });
  const rawBody = JSON.stringify(deliveryPayload());
  const forged = signedRequest(rawBody, { headers: { "svix-signature": "v1,AAAA" } });
  assert.equal((await handler(forged)).status, 401);
  assert.equal((await handler(signedRequest(rawBody, { timestamp: nowSeconds - 301 }))).status, 401);
  assert.equal((await route(async () => ({ kind: "applied" }), "")(signedRequest(rawBody))).status, 503);
  const malformed = JSON.stringify({ ...deliveryPayload(), data: { email_id: "missing-recipient" } });
  assert.equal((await handler(signedRequest(malformed))).status, 400);
  assert.equal(calls, 0);
});

test("oversized requests are rejected before parsing or persistence", async () => {
  let calls = 0;
  const handler = route(async () => { calls++; return { kind: "applied" }; });
  const tooLarge = "x".repeat(loadResendWebhookService().RESEND_WEBHOOK_MAX_BODY_BYTES + 1);
  const response = await handler(new Request("https://app.example/api/webhooks/resend", {
    method: "POST", headers: { "content-length": String(tooLarge.length) }, body: tooLarge,
  }));
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
});

test("body stream errors and stalled reads receive bounded explicit responses", async () => {
  let calls = 0;
  const service = loadResendWebhookService();
  const failedBody = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("stream failed")); } });
  const failedRequest = new Request("https://app.example/api/webhooks/resend", {
    method: "POST", body: failedBody, duplex: "half",
  } as RequestInit & { duplex: "half" });
  const standardHandler = service.createResendWebhookPost({
    getSecret: () => webhookSecret,
    applyDeliveryEvent: async () => { calls++; return { kind: "applied" }; },
    nowSeconds: () => nowSeconds,
  });
  assert.equal((await standardHandler(failedRequest)).status, 400);

  const stalledBody = new ReadableStream<Uint8Array>({ pull() { return new Promise<void>(() => undefined); } });
  const stalledRequest = new Request("https://app.example/api/webhooks/resend", {
    method: "POST", body: stalledBody, duplex: "half",
  } as RequestInit & { duplex: "half" });
  const timeoutHandler = service.createResendWebhookPost({
    getSecret: () => webhookSecret,
    applyDeliveryEvent: async () => { calls++; return { kind: "applied" }; },
    nowSeconds: () => nowSeconds,
    requestBodyTimeoutMs: 5,
  });
  assert.equal((await timeoutHandler(stalledRequest)).status, 408);
  assert.equal(calls, 0);
});

test("database failures retry, tagged mismatches retry, and unmatched unrelated account email is acknowledged", async () => {
  const rawBody = JSON.stringify(deliveryPayload());
  const failed = route(async () => { throw new Error("database unavailable"); });
  assert.equal((await failed(signedRequest(rawBody))).status, 503);

  const taggedUnmatched = route(async () => ({ kind: "unmatched" }));
  assert.equal((await taggedUnmatched(signedRequest(rawBody))).status, 503);

  const unrelatedPayload = deliveryPayload();
  (unrelatedPayload.data as Record<string, unknown>).tags = { category: "password_reset" };
  const unrelated = route(async () => ({ kind: "unmatched" }));
  const response = await unrelated(signedRequest(JSON.stringify(unrelatedPayload)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ignored: "unmatched_provider_event" });
});

test("verified unknown events are acknowledged; delayed and suppressed events reach durable state handling", async () => {
  let calls = 0;
  const appliedTypes: unknown[] = [];
  const handler = route(async (event) => { calls++; appliedTypes.push(event.type); return { kind: "applied" }; });

  for (const type of ["email.delivery_delayed", "email.suppressed", "domain.updated"]) {
    const payload = type === "domain.updated"
      ? { type, created_at: "2026-10-03T12:00:00.000Z", data: {} }
      : deliveryPayload({ type });
    const response = await handler(signedRequest(JSON.stringify(payload)));
    assert.equal(response.status, 200);
  }
  assert.deepEqual(appliedTypes, ["email.delivery_delayed", "email.suppressed"]);

  const newer = deliveryPayload({ type: "email.bounced", created_at: "2026-10-03T12:10:00.000Z" });
  const older = deliveryPayload({ type: "email.delivered", created_at: "2026-10-03T12:00:00.000Z" });
  assert.equal((await handler(signedRequest(JSON.stringify(newer), { id: "evt-new" }))).status, 200);
  assert.equal((await handler(signedRequest(JSON.stringify(older), { id: "evt-old" }))).status, 200);
  assert.equal(calls, 4, "recognized events are passed to the database adapter, which owns event idempotency and ordering");
  assert.deepEqual(appliedTypes.slice(2), ["email.bounced", "email.delivered"]);
});
