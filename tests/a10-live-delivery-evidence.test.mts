import assert from "node:assert/strict";
import test from "node:test";
import { readA10LiveDeliveryEvidence } from "../scripts/a10-live-delivery-evidence.mjs";

const BUSINESS_ID = "a2000000-0000-4000-8000-000000000003";
const VISIT_ID = "a2000000-0000-4000-8000-000000000009";
const DELIVERY_ID = "a2000000-0000-4000-8000-000000000019";
const MESSAGE_ID = "em_A10synthetic123456";
const EVENT_ID = "msg_01A10SyntheticEvent123";
const SHA256 = "a".repeat(64);

function evidenceRow(overrides: Record<string, unknown> = {}) {
  return {
    visitId: VISIT_ID,
    visitStatus: "sent",
    deliveryId: DELIVERY_ID,
    deliveryState: "accepted",
    providerMessageId: MESSAGE_ID,
    deliveryStatus: "delivered",
    deliveryStatusAt: "2026-10-04T10:00:00.000Z",
    deliveryStatusEventId: EVENT_ID,
    firstAttemptAt: "2026-10-04T09:59:00.000Z",
    reservationMonth: "2026-10-01",
    sendAttemptCount: 1,
    providerPayloadPresent: true,
    providerPayloadSha256: SHA256,
    reviewUrlSnapshotPresent: true,
    reviewUrlSnapshotSha256: "b".repeat(64),
    events: [{
      providerEventId: EVENT_ID,
      eventType: "email.delivered",
      providerMessageId: MESSAGE_ID,
      evidenceSource: "webhook",
      eventCreatedAt: "2026-10-04T10:00:00.000Z",
      receivedAt: "2026-10-04T10:00:01.000Z",
    }],
    eventCount: 1,
    suppressionCount: 0,
    quotaUsage: 1,
    quotaAllowance: 1500,
    // Deliberately supplied to prove the public projection drops excess data.
    customerEmail: "private-recipient@example.test",
    providerPayload: { to: ["private-recipient@example.test"], html: "private body" },
    ...overrides,
  };
}

test("delivery evidence returns sanitized IDs, statuses, webhook proof, quota and snapshot hashes", async () => {
  let sql = "";
  const result = await readA10LiveDeliveryEvidence(async (text) => { sql = text; return JSON.stringify(evidenceRow()); }, {
    businessId: BUSINESS_ID,
    visitId: VISIT_ID,
    deliveryId: DELIVERY_ID,
    expectedProviderMessageId: MESSAGE_ID,
    expectedTerminalStatus: "delivered",
  });
  assert.equal(result.visit.id, VISIT_ID);
  assert.equal(result.delivery.id, DELIVERY_ID);
  assert.equal(result.delivery.providerMessageId, MESSAGE_ID);
  assert.equal(result.events[0]?.providerEventId, EVENT_ID);
  assert.equal(result.events[0]?.eventType, "email.delivered");
  assert.equal(result.events[0]?.eventStatus, "delivered");
  assert.equal(result.events[0]?.evidenceSource, "webhook");
  assert.equal(result.proof.expectedProviderMessageIdMatches, true);
  assert.equal(result.proof.webhookEventPresent, true);
  assert.equal(result.proof.terminalEventMatched, true);
  assert.deepEqual(result.suppression, { count: 0, present: false });
  assert.deepEqual(result.quota, { usage: 1, allowance: 1500 });
  assert.equal(result.snapshots.providerPayloadSha256, SHA256);
  assert.equal(JSON.stringify(result).includes("private-recipient@example.test"), false);
  assert.equal(JSON.stringify(result).includes("private body"), false);
  assert.match(sql, /v\.business_id='a2000000-0000-4000-8000-000000000003'::uuid/);
  assert.match(sql, /d\.id='a2000000-0000-4000-8000-000000000019'::uuid/);
  assert.doesNotMatch(sql, /customer_email|email_normalized|event_data|SELECT \*/i);
});

test("suppression evidence is a count/boolean only and bounded event arrays report truncation", async () => {
  const result = await readA10LiveDeliveryEvidence(async () => evidenceRow({
    events: [], eventCount: 40, suppressionCount: 1,
  }), {
    businessId: BUSINESS_ID, visitId: VISIT_ID, deliveryId: DELIVERY_ID,
    expectedTerminalStatus: "bounced",
  });
  assert.deepEqual(result.suppression, { count: 1, present: true });
  assert.equal(result.eventsTruncated, true);
  assert.equal(result.proof.terminalEventMatched, false);
  assert.deepEqual(Object.keys(result.suppression).sort(), ["count", "present"]);
});

test("evidence callback cannot receive unvalidated IDs and results must match the pinned row", async () => {
  let calls = 0;
  const query = async () => { calls += 1; return evidenceRow(); };
  await assert.rejects(readA10LiveDeliveryEvidence(query, {
    businessId: `${BUSINESS_ID}' OR true --`, visitId: VISIT_ID, deliveryId: DELIVERY_ID,
  }), /pinned business, visit and delivery UUIDs/);
  await assert.rejects(readA10LiveDeliveryEvidence(query, {
    businessId: BUSINESS_ID, visitId: VISIT_ID, deliveryId: DELIVERY_ID,
    expectedProviderMessageId: "x' OR true --",
  }), /provider message ID is invalid/);
  await assert.rejects(readA10LiveDeliveryEvidence(async () => evidenceRow({ visitId: BUSINESS_ID }), {
    businessId: BUSINESS_ID, visitId: VISIT_ID, deliveryId: DELIVERY_ID,
  }), /did not match the pinned visit/);
  assert.equal(calls, 0);
});
