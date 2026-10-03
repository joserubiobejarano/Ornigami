import assert from "node:assert/strict";
import test from "node:test";
import { bookingSignature, loadBookingModule, routeRequest } from "./a07-booking-test-support.mts";

test("booking HMAC binds the exact raw body and rejects stale timestamps", () => {
  const secret = "synthetic booking secret";
  const timestamp = "1791000000";
  const rawBody = '{"source":"calendar","event_type":"booking.completed"}';
  const signature = bookingSignature(secret, timestamp, rawBody);
  const bookingService = loadBookingModule();
  assert.equal(bookingService.verifyBookingSignature({ secret, timestamp, rawBody, signature, nowSeconds: Number(timestamp) }), true);
  assert.equal(bookingService.verifyBookingSignature({ secret, timestamp, rawBody: `${rawBody} `, signature, nowSeconds: Number(timestamp) }), false);
  assert.equal(bookingService.verifyBookingSignature({ secret, timestamp, rawBody, signature, nowSeconds: Number(timestamp) + 301 }), false);
  assert.equal(bookingService.verifyBookingSignature({ secret, timestamp: "1791000000000", rawBody, signature, nowSeconds: Number(timestamp) }), false);
});

test("booking payload rejects caller-selected tenancy, unsupported events, and invalid completed visits", () => {
  const bookingService = loadBookingModule();
  assert.equal(bookingService.validateBookingEvent({ business_id: "attacker-controlled", source: "calendar", event_type: "booking.completed", external_id: "evt-1", visited_at: "2026-02-28", customer_email: "a@example.com" }), null);
  assert.equal(bookingService.validateBookingEvent({ source: "calendar", event_type: "booking.cancelled", external_id: "evt-1", visited_at: "2026-02-28", customer_email: "a@example.com" }), null);
  assert.equal(bookingService.validateBookingEvent({ source: "calendar", event_type: "booking.completed", external_id: "evt-1", visited_at: "2026-02-30T12:00:00Z", customer_email: "a@example.com" }), null);
  assert.equal(bookingService.validateBookingEvent({ source: "calendar", event_type: "booking.completed", external_id: "evt-1", visited_at: "2026-02-28T12:00:00Z" }), null);
  const valid = bookingService.validateBookingEvent({
    source: "Calendar", event_type: "BOOKING.COMPLETED", external_id: " evt-1 ",
    customer_phone: "+34 600 12 34 56", visited_at: "2026-02-28T13:00:00+01:00",
  });
  assert.deepEqual(valid, {
    source: "calendar", event_type: "booking.completed", external_id: "evt-1",
    customer_name: undefined, customer_email: undefined, customer_phone: "+34 600 12 34 56",
    service_name: undefined, visited_at: "2026-02-28T12:00:00.000Z",
  });
});

test("booking webhook authenticates before parsing and returns idempotent response", async () => {
  const secret = "credential-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = JSON.stringify({ source: "square", event_type: "booking.completed", external_id: "ext-42", customer_email: "jane@example.com", visited_at: "2026-09-20T10:00:00Z" });
  let admitted = 0;
  let duplicate = false;
  const route = routeRequest({
    getBookingCredential: async (id: string) => id === "10000000-0000-4000-8000-000000000001" ? { id, business_id: "20000000-0000-4000-8000-000000000001", secret } : null,
    verifyBookingSignature: loadBookingModule().verifyBookingSignature,
    validateBookingEvent: loadBookingModule().validateBookingEvent,
    admitBookingEvent: async (_id: string, event: { external_id: string }) => { admitted++; assert.equal(event.external_id, "ext-42"); return duplicate ? "duplicate" : "created"; },
  });
  const headers = {
    "x-booking-key-id": "10000000-0000-4000-8000-000000000001",
    "x-booking-timestamp": timestamp,
    "x-booking-signature": bookingSignature(secret, timestamp, rawBody),
    "content-type": "application/json",
  };
  const forged = await route.POST(new Request("https://app.example/api/webhooks/booking", { method: "POST", headers: { ...headers, "x-booking-signature": "0".repeat(64) }, body: rawBody }));
  assert.equal(forged.status, 401);
  assert.equal(admitted, 0);
  const bomChanged = await route.POST(new Request("https://app.example/api/webhooks/booking", { method: "POST", headers, body: `\uFEFF${rawBody}` }));
  assert.equal(bomChanged.status, 401, "UTF-8 BOM bytes remain part of the signed raw body");
  assert.equal(admitted, 0);
  const accepted = await route.POST(new Request("https://app.example/api/webhooks/booking", { method: "POST", headers, body: rawBody }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, duplicate: false, visitCreated: true });
  duplicate = true;
  const replay = await route.POST(new Request("https://app.example/api/webhooks/booking", { method: "POST", headers, body: rawBody }));
  assert.deepEqual(await replay.json(), { ok: true, duplicate: true, visitCreated: false });
  assert.equal(admitted, 2);
});

test("booking webhook enforces request byte cap before admission", async () => {
  let admitted = false;
  const route = routeRequest({
    BOOKING_MAX_BODY_BYTES: 64 * 1024,
    getBookingCredential: async (id: string) => ({ id, business_id: "20000000-0000-4000-8000-000000000001", secret: "s" }),
    verifyBookingSignature: () => true,
    validateBookingEvent: () => ({ source: "x", event_type: "booking.completed", external_id: "1" }),
    admitBookingEvent: async () => { admitted = true; return "created"; },
  });
  const response = await route.POST(new Request("https://app.example/api/webhooks/booking", {
    method: "POST",
    headers: { "x-booking-key-id": "10000000-0000-4000-8000-000000000001" },
    body: "x".repeat(70 * 1024),
  }));
  assert.equal(response.status, 413);
  assert.equal(admitted, false);
});
