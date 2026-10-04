import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  deleteA10LiveWebhook, getA10LiveEmailEvidence, listA10LiveWebhooks,
  projectA10LiveWebhookMetadata, readA10LiveResendApiKey, requestA10Resend,
  verifyA10LiveWebhookPin,
} from "../scripts/a10-live-provider-control.mjs";
import { A10_RESEND_EVENTS } from "../scripts/a10-resend-endpoint.mjs";
import { secureA10PrivateDirectory } from "../scripts/a10-live-resend-guards.mjs";

const API_KEY = "re_0123456789abcdef";
const WEBHOOK_ID = "11111111-1111-4111-8111-111111111111";
const DELIVERY_ID = "22222222-2222-4222-8222-222222222222";
const EMAIL_ID = "em_abcdefgh12345678";
const HOST = "tunnel.example.test";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function metadata(extra = {}) {
  return {
    data: [{ id: WEBHOOK_ID, endpoint: `https://${HOST}/api/webhooks/resend`, events: [...A10_RESEND_EVENTS], signing_secret: "DO_NOT_RETURN_THIS" }],
    has_more: false,
    ...extra,
  };
}

test("credential parser retains only one valid Resend key without exposing other assignments", () => {
  const path = join(tmpdir(), `a10-env-${Date.now()}-${Math.random()}`);
  try {
    writeFileSync(path, "DATABASE_URL=postgres://must-not-return\nRESEND_API_KEY='re_0123456789abcdef' # key\nAUTH_SECRET=also-hidden\n");
    assert.equal(readA10LiveResendApiKey(path), API_KEY);
    writeFileSync(path, "RESEND_API_KEY=re_0123456789abcdef\nRESEND_API_KEY=re_abcdef0123456789\n");
    assert.throws(() => readA10LiveResendApiKey(path), /duplicate API key/);
  } finally { rmSync(path, { force: true }); }
});

test("provider request uses exact API host, bounded timeout and manual redirects", async () => {
  let observed: { url?: string; init?: RequestInit } = {};
  const result = await requestA10Resend(API_KEY, {
    path: "/webhooks",
    fetcher: async (input, init) => { observed = { url: String(input), init }; return jsonResponse(metadata()); },
  });
  assert.equal(observed.url, "https://api.resend.com/webhooks");
  assert.equal(observed.init?.redirect, "manual");
  assert.equal(observed.init?.method, "GET");
  assert.equal((observed.init?.headers as Record<string, string>).authorization, `Bearer ${API_KEY}`);
  assert.deepEqual(result, metadata());
  await assert.rejects(requestA10Resend(API_KEY, { path: "https://evil.example" }), /path is invalid/);
  await assert.rejects(requestA10Resend(API_KEY, { path: "/webhooks", method: "POST", body: { endpoint: "https://evil.test" } }), /method is not allowed/);
  await assert.rejects(requestA10Resend(API_KEY, { path: "/emails", method: "GET" }), /path is invalid/);
  await assert.rejects(requestA10Resend(API_KEY, { path: "/emails/abc", method: "DELETE" }), /method is not allowed/);
  await assert.rejects(requestA10Resend(API_KEY, { path: "/webhooks", timeoutMs: 10_001 }), /timeout is invalid/);
});

test("redirect, oversized response and HTTP errors are sanitized", async () => {
  await assert.rejects(requestA10Resend(API_KEY, {
    path: "/webhooks",
    fetcher: async () => new Response("secret body", { status: 302, headers: { location: "https://evil.example" } }),
  }), /redirected/);
  await assert.rejects(requestA10Resend(API_KEY, {
    path: "/webhooks",
    fetcher: async () => new Response("private provider error", { status: 403 }),
  }), (error) => error instanceof Error && error.message === "Resend returned HTTP 403" && !error.message.includes("private"));
  await assert.rejects(requestA10Resend(API_KEY, {
    path: "/webhooks",
    fetcher: async () => new Response("x".repeat(16 * 1024 + 1), { headers: { "content-length": String(16 * 1024 + 1) } }),
  }), /safe size limit/);
});

test("webhook projection never returns signing secrets and exposes only metadata", () => {
  const projected = projectA10LiveWebhookMetadata(metadata());
  assert.deepEqual(projected, { count: 1, hasMore: false, endpoints: [{ id: WEBHOOK_ID, host: HOST, events: [...A10_RESEND_EVENTS] }] });
  assert.equal(JSON.stringify(projected).includes("DO_NOT_RETURN_THIS"), false);
  assert.deepEqual(Object.keys(projected.endpoints[0]).sort(), ["events", "host", "id"]);
  const extraKnownWebhook = projectA10LiveWebhookMetadata({ data: [
    metadata().data[0],
    { id: "33333333-3333-4333-8333-333333333333", endpoint: "https://other.example.test/hook", events: ["email.opened"] },
  ] });
  assert.deepEqual(extraKnownWebhook.endpoints[1].events, ["email.opened"]);
  assert.doesNotThrow(() => verifyA10LiveWebhookPin(extraKnownWebhook, { webhookId: WEBHOOK_ID, endpointHost: HOST }));
});

test("webhook pin requires exact endpoint host and ordered seven-event set", () => {
  const projected = projectA10LiveWebhookMetadata(metadata());
  assert.deepEqual(verifyA10LiveWebhookPin(projected, { webhookId: WEBHOOK_ID, endpointHost: HOST }), {
    webhookId: WEBHOOK_ID, host: HOST, events: [...A10_RESEND_EVENTS],
  });
  assert.throws(() => verifyA10LiveWebhookPin(projected, { webhookId: WEBHOOK_ID, endpointHost: "other.example.test" }), /does not match/);
  assert.throws(() => verifyA10LiveWebhookPin(projected, { webhookId: WEBHOOK_ID, endpointHost: HOST, events: A10_RESEND_EVENTS.slice(1) }), /exact acceptance event set/);
  const targetWithExtra = projectA10LiveWebhookMetadata({ data: [{ ...metadata().data[0], events: [...A10_RESEND_EVENTS, "email.opened"] }] });
  assert.throws(() => verifyA10LiveWebhookPin(targetWithExtra, { webhookId: WEBHOOK_ID, endpointHost: HOST }), /does not match/);
  assert.deepEqual(verifyA10LiveWebhookPin(projectA10LiveWebhookMetadata({ data: [{ ...metadata().data[0], events: [...A10_RESEND_EVENTS].reverse() }] }), {
    webhookId: WEBHOOK_ID, endpointHost: HOST,
  }).events, [...A10_RESEND_EVENTS].reverse());
});

test("webhook list projects the response before returning it", async () => {
  const result = await listA10LiveWebhooks(API_KEY, { fetcher: async () => jsonResponse(metadata()) });
  assert.equal(result.endpoints[0].host, HOST);
  assert.equal(JSON.stringify(result).includes("signing_secret"), false);
});

test("delete refuses an unpinned, unprivate, host-mismatched or event-mismatched receipt", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return jsonResponse(metadata()); };
  await assert.rejects(deleteA10LiveWebhook(API_KEY, join(tmpdir(), "not-a-task-receipt.json"), { expectedHost: HOST, fetcher }), /inside the task-private/);
  const tempRoot = resolve(process.cwd(), ".env.a10-live-resend", `test-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await secureA10PrivateDirectory(tempRoot);
  const receiptPath = join(tempRoot, "receipt.json");
  try {
    const goodReceipt = { status: "created", webhookId: WEBHOOK_ID, endpointHost: HOST, events: [...A10_RESEND_EVENTS] };
    writeFileSync(receiptPath, JSON.stringify({ ...goodReceipt, endpointHost: "wrong.example.test" }), { mode: 0o600 });
    await assert.rejects(deleteA10LiveWebhook(API_KEY, receiptPath, { expectedHost: HOST, fetcher }), /expected isolated host/);
    writeFileSync(receiptPath, JSON.stringify({ ...goodReceipt, events: A10_RESEND_EVENTS.slice(1) }), { mode: 0o600 });
    await assert.rejects(deleteA10LiveWebhook(API_KEY, receiptPath, { expectedHost: HOST, fetcher }), /event set is not exact/);
    assert.equal(calls, 0);
  } finally { rmSync(tempRoot, { recursive: true, force: true }); }
});

test("delete checks live provider metadata against the private receipt before deleting only its pinned ID", async () => {
  const root = resolve(process.cwd(), ".env.a10-live-resend", `test-delete-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await secureA10PrivateDirectory(root);
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify({ status: "created", webhookId: WEBHOOK_ID, endpointHost: HOST, events: [...A10_RESEND_EVENTS] }), { mode: 0o600 });
  const calls: Array<{ url: string; method: string }> = [];
  try {
    const result = await deleteA10LiveWebhook(API_KEY, receiptPath, {
      expectedHost: HOST,
      fetcher: async (input, init) => {
        calls.push({ url: String(input), method: String(init?.method) });
        return String(init?.method) === "DELETE" ? jsonResponse({ deleted: true }) : jsonResponse(metadata());
      },
    });
    assert.deepEqual(result, { deleted: true, webhookId: WEBHOOK_ID, host: HOST });
    assert.deepEqual(calls, [
      { url: "https://api.resend.com/webhooks", method: "GET" },
      { url: `https://api.resend.com/webhooks/${WEBHOOK_ID}`, method: "DELETE" },
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("email evidence contains status and correlation booleans, never full address or raw provider body", async () => {
  const recipient = "controlled@example.test";
  const result = await getA10LiveEmailEvidence(API_KEY, EMAIL_ID, {
    recipient, deliveryId: DELIVERY_ID, senderDomain: "reviews.ornigami.com",
    fetcher: async () => jsonResponse({
      id: EMAIL_ID,
      from: "Private Sender <sender@reviews.ornigami.com>",
      to: [recipient],
      last_event: "delivered",
      tags: [{ name: "ornigami_delivery_id", value: DELIVERY_ID }],
      html: "private body must not escape",
    }),
  });
  assert.deepEqual(result, {
    emailId: EMAIL_ID, lastEvent: "delivered", recipientMatch: true,
    deliveryTagMatch: true, senderDomain: "reviews.ornigami.com", expectedSenderDomainMatch: true,
  });
  assert.equal(JSON.stringify(result).includes(recipient), false);
  assert.equal(JSON.stringify(result).includes("private body"), false);
});

test("email lookup rejects values that could widen the provider query", async () => {
  await assert.rejects(getA10LiveEmailEvidence(API_KEY, "../webhooks", { recipient: "a@example.test", deliveryId: DELIVERY_ID, senderDomain: "example.test" }), /pin is incomplete/);
});

test("email evidence rejects duplicate or extra delivery tags", async () => {
  const recipient = "controlled@example.test";
  const evidence = (tags: unknown[]) => getA10LiveEmailEvidence(API_KEY, EMAIL_ID, {
    recipient, deliveryId: DELIVERY_ID, senderDomain: "reviews.ornigami.com",
    fetcher: async () => jsonResponse({
      id: EMAIL_ID, from: "Sender <sender@reviews.ornigami.com>", to: [recipient],
      last_event: "delivered", tags,
    }),
  });
  assert.equal((await evidence([
    { name: "ornigami_delivery_id", value: DELIVERY_ID },
    { name: "other", value: "ignored" },
  ])).deliveryTagMatch, false);
  assert.equal((await evidence([
    { name: "ornigami_delivery_id", value: DELIVERY_ID },
    { name: "ornigami_delivery_id", value: DELIVERY_ID },
  ])).deliveryTagMatch, false);
});
