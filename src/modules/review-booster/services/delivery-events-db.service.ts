import { sql } from "@/lib/db/neon";

export type BoosterProviderDeliveryEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.failed"
  | "email.suppressed";

export type NormalizedBoosterDeliveryEvent = {
  eventId: string;
  type: BoosterProviderDeliveryEventType;
  createdAt: string;
  providerMessageId: string;
  deliveryId: string | null;
  recipients: string[];
  evidenceSource: "webhook" | "provider_lookup";
};

export type BoosterDeliveryEventResult = {
  kind: "applied" | "duplicate" | "conflict" | "unmatched" | "invalid";
  deliveryId?: string;
  state?: string;
  deliveryStatus?: string;
  providerMessageId?: string;
  deliveryStatusAt?: string;
};

export type BoosterDeliveryReconciliationContext = {
  deliveryId: string;
  businessId: string;
  visitId: string;
  state: string;
  deliveryStatus: string;
  providerMessageId: string | null;
  payload: Record<string, unknown> | null;
  firstAttemptAt: string | null;
  reservationMonth: string | null;
  leaseUntil: string;
  currentRecipient: string | null;
  currentStatus: string;
  nextAttemptAt: string | null;
};

type DbRow = Record<string, unknown>;
const row = (value: unknown): DbRow => value && typeof value === "object" ? value as DbRow : {};
const stringOrNull = (value: unknown): string | null => value == null ? null : String(value);
const jsonObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch { return null; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
};

/** Applies one already-verified provider event, with durable idempotency in PostgreSQL. */
export async function applyBoosterDeliveryEvent(event: NormalizedBoosterDeliveryEvent): Promise<BoosterDeliveryEventResult> {
  const rows = await sql`SELECT public.apply_booster_delivery_event(${JSON.stringify(event)}::jsonb) AS result`;
  const result = row(row(rows[0]).result);
  return {
    kind: String(result.kind ?? "invalid") as BoosterDeliveryEventResult["kind"],
    deliveryId: stringOrNull(result.deliveryId) ?? undefined,
    state: stringOrNull(result.state) ?? undefined,
    deliveryStatus: stringOrNull(result.deliveryStatus) ?? undefined,
    providerMessageId: stringOrNull(result.providerMessageId) ?? undefined,
    deliveryStatusAt: stringOrNull(result.deliveryStatusAt) ?? undefined,
  };
}

/** Loads only fields needed for an owner-authorized uncertain-send reconciliation. */
export async function getBoosterDeliveryReconciliationContext(input: {
  businessId: string;
  deliveryId: string;
}): Promise<BoosterDeliveryReconciliationContext | null> {
  const rows = await sql`SELECT d.id AS delivery_id,d.business_id,d.visit_id,d.state,d.delivery_status,
      d.provider_message_id,d.provider_payload,d.first_attempt_at,d.reservation_month,d.lease_until,
      v.customer_email AS current_recipient,v.followup_status AS current_status,v.next_attempt_at
    FROM public.booster_followup_deliveries d
    JOIN public.followup_visits v ON v.id=d.visit_id AND v.business_id=d.business_id
    WHERE d.business_id=${input.businessId}::uuid AND d.id=${input.deliveryId}::uuid`;
  if (!rows.length) return null;
  const item = row(rows[0]);
  return {
    deliveryId: String(item.delivery_id), businessId: String(item.business_id), visitId: String(item.visit_id),
    state: String(item.state), deliveryStatus: String(item.delivery_status),
    providerMessageId: stringOrNull(item.provider_message_id), payload: jsonObject(item.provider_payload),
    firstAttemptAt: stringOrNull(item.first_attempt_at), reservationMonth: stringOrNull(item.reservation_month),
    leaseUntil: String(item.lease_until), currentRecipient: stringOrNull(item.current_recipient),
    currentStatus: String(item.current_status ?? ""), nextAttemptAt: stringOrNull(item.next_attempt_at),
  };
}
