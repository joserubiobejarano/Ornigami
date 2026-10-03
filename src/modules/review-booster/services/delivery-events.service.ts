import type { NormalizedBoosterDeliveryEvent } from "@/modules/review-booster/services/delivery-events-db.service";

export const RESEND_DELIVERY_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.delivery_delayed",
] as const;

export type ResendDeliveryEventType = typeof RESEND_DELIVERY_EVENT_TYPES[number];
export type NormalizedResendWebhookDeliveryEvent = Omit<NormalizedBoosterDeliveryEvent, "evidenceSource"> & { evidenceSource: "webhook" };

export type ParsedResendDeliveryEvent = {
  kind: "apply";
  event: NormalizedResendWebhookDeliveryEvent;
  hasBoosterDeliveryTag: boolean;
} | {
  kind: "ignore";
  reason: "unsupported_event";
};

const MAX_ID_LENGTH = 256;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_TYPES = new Set<string>(RESEND_DELIVERY_EVENT_TYPES);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedString(value: unknown, maxLength = MAX_ID_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function parseDeliveryTag(tagsValue: unknown): { valid: boolean; value: string | null } {
  if (tagsValue == null) return { valid: true, value: null };
  let candidate: unknown;
  const tags = record(tagsValue);
  if (tags) {
    candidate = tags.ornigami_delivery_id;
  } else if (Array.isArray(tagsValue)) {
    const matching = tagsValue.filter((tag) => record(tag)?.name === "ornigami_delivery_id");
    if (matching.length > 1) return { valid: false, value: null };
    candidate = matching.length === 1 ? record(matching[0])?.value : undefined;
  } else {
    return { valid: false, value: null };
  }
  if (candidate === undefined || candidate === null) return { valid: true, value: null };
  const value = boundedString(candidate, 64);
  return value && UUID_PATTERN.test(value)
    ? { valid: true, value: value.toLowerCase() }
    : { valid: false, value: null };
}

function parseRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null;
  const recipients: string[] = [];
  for (const item of value) {
    const email = boundedString(item, 320);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    recipients.push(email);
  }
  return [...new Set(recipients.map((email) => email.toLowerCase()))];
}

function parseCreatedAt(value: unknown): string | null {
  const timestamp = boundedString(value, 64);
  if (!timestamp || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)) return null;
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

/** Parse the verified Resend envelope; caller supplies its signed Svix/Standard Webhooks event ID. */
export function parseResendDeliveryEvent(payload: unknown, eventIdValue: string): ParsedResendDeliveryEvent | null {
  const event = record(payload);
  const type = boundedString(event?.type, 80);
  if (!event || !type) return null;
  if (!SUPPORTED_TYPES.has(type)) return { kind: "ignore", reason: "unsupported_event" };

  const data = record(event.data);
  const eventId = boundedString(eventIdValue);
  const providerMessageId = boundedString(data?.email_id);
  const createdAt = parseCreatedAt(event.created_at);
  const recipients = parseRecipients(data?.to);
  const deliveryTag = parseDeliveryTag(data?.tags);
  if (!data || !eventId || !providerMessageId || !createdAt || !recipients || !deliveryTag.valid) return null;

  return {
    kind: "apply",
    hasBoosterDeliveryTag: deliveryTag.value !== null,
    event: {
      eventId,
      type: type as ResendDeliveryEventType,
      createdAt,
      providerMessageId,
      deliveryId: deliveryTag.value,
      recipients,
      evidenceSource: "webhook",
    },
  };
}
