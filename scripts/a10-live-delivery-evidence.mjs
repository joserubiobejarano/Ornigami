const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,500}$/;
const HASH = /^[0-9a-f]{64}$/i;
const EVENT_TYPES = new Set([
  "email.sent", "email.delivered", "email.delivery_delayed", "email.bounced",
  "email.complained", "email.failed", "email.suppressed",
]);
const TERMINAL_STATUSES = new Set(["delivered", "bounced", "failed", "suppressed", "complained"]);
const MAX_EVIDENCE_EVENTS = 32;

/** @typedef {(sqlText: string) => Promise<unknown>} A10LocalSqlQuery */
/** @typedef {{ businessId: string, visitId: string, deliveryId: string, expectedProviderMessageId?: string, expectedTerminalStatus?: string }} A10DeliveryEvidencePins */
/** @typedef {{ providerEventId: string, eventType: string, eventStatus: string, providerMessageId: string, evidenceSource: "webhook" | "provider_lookup", eventCreatedAt: string, receivedAt: string }} A10DeliveryEventEvidence */

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function uuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function parseResult(value) {
  if (typeof value === "string") {
    try { value = JSON.parse(value); }
    catch { throw new Error("A10 SQL evidence callback returned invalid JSON"); }
  }
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error("A10 SQL evidence callback returned an unexpected row count");
    value = value[0];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A10 SQL evidence callback returned no evidence object");
  return value;
}

function safeEvent(row) {
  if (!row || typeof row !== "object" || !EVENT_TYPES.has(row.eventType) ||
      typeof row.providerEventId !== "string" || !/^[A-Za-z0-9._:-]{1,255}$/.test(row.providerEventId) ||
      typeof row.providerMessageId !== "string" || !PROVIDER_ID.test(row.providerMessageId) ||
      !["webhook", "provider_lookup"].includes(row.evidenceSource) ||
      typeof row.eventCreatedAt !== "string" || typeof row.receivedAt !== "string") {
    throw new Error("A10 SQL evidence contained an invalid provider event projection");
  }
  const eventStatus = row.eventType === "email.delivery_delayed" ? "delayed" : row.eventType.slice("email.".length);
  return Object.freeze({
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    eventStatus,
    providerMessageId: row.providerMessageId,
    evidenceSource: row.evidenceSource,
    eventCreatedAt: row.eventCreatedAt,
    receivedAt: row.receivedAt,
  });
}

function boundedCount(value, label) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000_000) throw new Error(`A10 SQL evidence ${label} count is invalid`);
  return count;
}

function nullableString(value, pattern, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || (pattern && !pattern.test(value))) throw new Error(`A10 SQL evidence ${label} is invalid`);
  return value;
}

function buildEvidenceSql({ businessId, visitId, deliveryId, expectedProviderMessageId }) {
  const providerMessageMatch = expectedProviderMessageId === undefined
    ? "TRUE"
    : `d.provider_message_id=${sqlLiteral(expectedProviderMessageId)}`;
  return `SELECT json_build_object(
    'visitId',v.id::text,
    'visitStatus',v.followup_status,
    'deliveryId',d.id::text,
    'deliveryState',d.state,
    'providerMessageId',d.provider_message_id,
    'deliveryStatus',d.delivery_status,
    'deliveryStatusAt',d.delivery_status_at,
    'deliveryStatusEventId',d.delivery_status_event_id,
    'firstAttemptAt',d.first_attempt_at,
    'reservationMonth',d.reservation_month,
    'sendAttemptCount',d.send_attempt_count,
    'providerPayloadPresent',d.provider_payload IS NOT NULL,
    'providerPayloadSha256',CASE WHEN d.provider_payload IS NULL THEN NULL ELSE encode(sha256(convert_to(d.provider_payload::text,'UTF8')),'hex') END,
    'reviewUrlSnapshotPresent',d.review_url_snapshot IS NOT NULL,
    'reviewUrlSnapshotSha256',CASE WHEN d.review_url_snapshot IS NULL THEN NULL ELSE encode(sha256(convert_to(d.review_url_snapshot,'UTF8')),'hex') END,
    'events',(SELECT COALESCE(json_agg(event_row ORDER BY event_created_at,event_id),'[]'::json)
      FROM (SELECT e.event_id AS event_id,e.event_created_at AS event_created_at,
          json_build_object('providerEventId',e.event_id,'eventType',e.event_type,
            'providerMessageId',e.provider_message_id,'evidenceSource',e.evidence_source,
            'eventCreatedAt',e.event_created_at,'receivedAt',e.received_at) AS event_row
        FROM public.booster_delivery_events e
        WHERE e.delivery_id=d.id AND e.provider_message_id=d.provider_message_id
        ORDER BY e.event_created_at,e.event_id LIMIT ${MAX_EVIDENCE_EVENTS}) bounded_events),
    'eventCount',(SELECT count(*) FROM public.booster_delivery_events e WHERE e.delivery_id=d.id AND e.provider_message_id=d.provider_message_id),
    'suppressionCount',(SELECT count(*) FROM public.booster_delivery_suppressions s WHERE s.provider_message_id=d.provider_message_id),
    'quotaUsage',q.usage,
    'quotaAllowance',q.allowance
  )
  FROM public.followup_visits v
  JOIN public.booster_followup_deliveries d ON d.visit_id=v.id AND d.business_id=v.business_id
  LEFT JOIN LATERAL public.booster_monthly_quota(d.business_id,
    COALESCE(d.reservation_month,date_trunc('month',COALESCE(d.first_attempt_at,now()) AT TIME ZONE 'UTC')::date)) q ON true
  WHERE v.business_id=${sqlLiteral(businessId)}::uuid
    AND v.id=${sqlLiteral(visitId)}::uuid
    AND d.id=${sqlLiteral(deliveryId)}::uuid
    AND d.visit_id=v.id AND d.business_id=v.business_id
    AND ${providerMessageMatch}
  LIMIT 1;`;
}

/**
 * Read-only evidence projection for a caller that already pins the database to
 * the task-owned synthetic PostgreSQL fixture. The callback receives fixed SQL
 * containing only validated IDs; raw recipients, provider payloads and event JSON
 * are never selected for output.
 * @param {A10LocalSqlQuery} query
 * @param {A10DeliveryEvidencePins} pins
 */
export async function readA10LiveDeliveryEvidence(query, pins) {
  if (typeof query !== "function" || !pins || !uuid(pins.businessId) || !uuid(pins.visitId) || !uuid(pins.deliveryId)) {
    throw new Error("A10 local evidence requires pinned business, visit and delivery UUIDs");
  }
  if (pins.expectedProviderMessageId !== undefined && !PROVIDER_ID.test(pins.expectedProviderMessageId)) {
    throw new Error("A10 local evidence provider message ID is invalid");
  }
  if (pins.expectedTerminalStatus !== undefined && !TERMINAL_STATUSES.has(pins.expectedTerminalStatus)) {
    throw new Error("A10 expected delivery terminal status is invalid");
  }
  const raw = await query(buildEvidenceSql(pins));
  const row = parseResult(raw);
  if (row.visitId !== pins.visitId || row.deliveryId !== pins.deliveryId) throw new Error("A10 local evidence row did not match the pinned visit and delivery");
  if (row.deliveryState !== "accepted" && row.deliveryState !== "unknown" && row.deliveryState !== "sending") {
    throw new Error("A10 local delivery evidence is not in an attempted state");
  }
  const providerMessageId = nullableString(row.providerMessageId, PROVIDER_ID, "provider message ID");
  const deliveryStatus = nullableString(row.deliveryStatus, /^[a-z_]{1,32}$/, "delivery status");
  const rawEvents = Array.isArray(row.events) ? row.events : null;
  if (!rawEvents || rawEvents.length > MAX_EVIDENCE_EVENTS) throw new Error("A10 SQL evidence event list is invalid");
  const events = rawEvents.map(safeEvent);
  const eventCount = boundedCount(row.eventCount, "event");
  const suppressionCount = boundedCount(row.suppressionCount, "suppression");
  if (eventCount < events.length || row.quotaUsage === null || row.quotaAllowance === null) throw new Error("A10 SQL evidence aggregate is incomplete");
  const payloadHash = nullableString(row.providerPayloadSha256, HASH, "provider payload hash");
  const reviewHash = nullableString(row.reviewUrlSnapshotSha256, HASH, "review snapshot hash");
  const quotaUsage = boundedCount(row.quotaUsage, "quota usage");
  const quotaAllowance = boundedCount(row.quotaAllowance, "quota allowance");
  const expectedProviderMessageIdMatches = pins.expectedProviderMessageId === undefined
    ? null : providerMessageId === pins.expectedProviderMessageId;
  const webhookEventPresent = providerMessageId !== null && events.some((event) => event.providerMessageId === providerMessageId && event.evidenceSource === "webhook");
  const terminalEventMatched = pins.expectedTerminalStatus === undefined ? null :
    providerMessageId !== null && events.some((event) => event.providerMessageId === providerMessageId &&
      event.evidenceSource === "webhook" && event.eventStatus === pins.expectedTerminalStatus);
  return Object.freeze({
    visit: Object.freeze({ id: row.visitId, status: nullableString(row.visitStatus, /^[a-z_]{1,32}$/, "visit status") }),
    delivery: Object.freeze({
      id: row.deliveryId,
      state: row.deliveryState,
      providerMessageId,
      deliveryStatus,
      deliveryStatusAt: nullableString(row.deliveryStatusAt, null, "delivery status timestamp"),
      deliveryStatusEventId: nullableString(row.deliveryStatusEventId, /^[A-Za-z0-9._:-]{1,255}$/, "delivery status event ID"),
      firstAttemptAt: nullableString(row.firstAttemptAt, null, "first attempt timestamp"),
      reservationMonth: nullableString(row.reservationMonth, /^\d{4}-\d{2}-\d{2}$/, "reservation month"),
      sendAttemptCount: boundedCount(row.sendAttemptCount, "send attempt"),
    }),
    events: Object.freeze(events),
    eventCount,
    eventsTruncated: eventCount > events.length,
    suppression: Object.freeze({ count: suppressionCount, present: suppressionCount > 0 }),
    quota: Object.freeze({ usage: quotaUsage, allowance: quotaAllowance }),
    snapshots: Object.freeze({
      providerPayloadPresent: row.providerPayloadPresent === true,
      providerPayloadSha256: payloadHash,
      reviewUrlPresent: row.reviewUrlSnapshotPresent === true,
      reviewUrlSha256: reviewHash,
    }),
    proof: Object.freeze({ expectedProviderMessageIdMatches, webhookEventPresent, terminalEventMatched }),
  });
}
