import { sql } from "@/lib/db/neon";
import type { ResendEmailPayload } from "@/modules/review-booster/services/resend.provider";

/** Complete provider request. This JSON is frozen before the first provider call. */
export type FrozenFollowupPayload = ResendEmailPayload;

export type AtomicFollowupCandidate = {
  visitId: string;
  businessId: string;
  customerName: string | null;
  customerEmail: string;
  visitedAt: string | Date;
  serviceName: string | null;
  businessName: string;
  businessType: string | null;
  city: string | null;
  googleReviewUrl: string;
  rebookingUrl: string | null;
  tone: string | null;
  language: string | null;
  emailFromName: string | null;
  deliveryId: string | null;
  deliveryState: string | null;
  payload: FrozenFollowupPayload | null;
  idempotencyKey: string | null;
  firstAttemptAt: string | null;
};

export type AtomicFollowupClaim = {
  kind: "claimed" | "recovery" | "busy" | "existing" | "ineligible" | "quota_exhausted" | "reconciliation_required" | "expired" | "non_sendable";
  deliveryId: string | null;
  fence: string | null;
  payload: FrozenFollowupPayload | null;
  idempotencyKey: string | null;
  firstAttemptAt: string | null;
  state?: string;
  usage?: number;
  allowance?: number;
};

export type AtomicBeginSend =
  | { kind: "send"; payload: FrozenFollowupPayload; idempotencyKey: string; firstAttemptAt: string }
  | { kind: "quota_exhausted" | "non_sendable" | "reconciliation_required" | "stale" | "payload_missing" | "actor_denied" };

type DbRow = Record<string, unknown>;
const str = (value: unknown): string | null => value == null ? null : String(value);
const objectRow = (value: unknown): DbRow => value && typeof value === "object" ? value as DbRow : {};
const jsonPayload = (value: unknown): FrozenFollowupPayload | null => {
  if (typeof value === "string") {
    try { return JSON.parse(value) as FrozenFollowupPayload; } catch { return null; }
  }
  return value && typeof value === "object" ? value as FrozenFollowupPayload : null;
};

export async function listAtomicFollowupCandidates(input: { businessId: string; limit?: number }): Promise<AtomicFollowupCandidate[]> {
  const rows = await sql`SELECT * FROM public.list_booster_delivery_candidates(
    ${input.businessId}::uuid, ${Math.min(50, Math.max(1, Math.floor(input.limit ?? 50)))})`;
  return rows.map((raw) => {
    const row = objectRow(raw);
    return {
      visitId: String(row.visit_id), businessId: String(row.business_id),
      customerName: str(row.customer_name), customerEmail: String(row.customer_email),
      visitedAt: row.visited_at as string | Date, serviceName: str(row.service_name),
      businessName: String(row.business_name), businessType: str(row.business_type), city: str(row.city),
      googleReviewUrl: String(row.google_review_url), rebookingUrl: str(row.rebooking_url),
      tone: str(row.tone), language: str(row.language), emailFromName: str(row.email_from_name),
      deliveryId: str(row.delivery_id), deliveryState: str(row.delivery_state),
      payload: jsonPayload(row.provider_payload), idempotencyKey: str(row.idempotency_key),
      firstAttemptAt: str(row.first_attempt_at),
    };
  });
}

/** Resolves the canonical owner identity for the lifecycle gate; callers never select owner PII. */
export async function getBoosterBusinessOwnerId(businessId: string): Promise<string | null> {
  const rows = await sql`SELECT owner_user_id FROM public.businesses WHERE id=${businessId}::uuid`;
  return str(objectRow(rows[0]).owner_user_id);
}

export async function claimAtomicFollowupDelivery(input: { businessId: string; visitId: string }): Promise<AtomicFollowupClaim> {
  const rows = await sql`SELECT public.claim_booster_delivery(${input.businessId}::uuid, ${input.visitId}::uuid) AS result`;
  const row = objectRow(rows[0]);
  const result = objectRow(row.result);
  return {
    kind: String(result.kind ?? "ineligible") as AtomicFollowupClaim["kind"],
    deliveryId: str(result.deliveryId), fence: str(result.fence),
    payload: jsonPayload(result.payload), idempotencyKey: str(result.idempotencyKey),
    firstAttemptAt: str(result.firstAttemptAt), state: str(result.state) ?? undefined,
    usage: result.usage == null ? undefined : Number(result.usage),
    allowance: result.allowance == null ? undefined : Number(result.allowance),
  };
}

export async function persistAtomicFollowupPayload(input: {
  deliveryId: string; fence: string; payload: FrozenFollowupPayload; reviewUrl: string; actorUserId?: string;
}): Promise<boolean> {
  const rows = await sql`SELECT public.prepare_booster_delivery(
    ${input.deliveryId}::uuid,${input.fence}::uuid,${JSON.stringify(input.payload)}::jsonb,${input.reviewUrl},${input.actorUserId ?? null}::uuid) AS changed`;
  return objectRow(rows[0]).changed === true;
}

export async function beginAtomicFollowupSend(input: { deliveryId: string; fence: string; actorUserId?: string }): Promise<AtomicBeginSend> {
  const rows = await sql`SELECT public.begin_booster_delivery_send(${input.deliveryId}::uuid,${input.fence}::uuid,${input.actorUserId ?? null}::uuid) AS result`;
  const result = objectRow(objectRow(rows[0]).result);
  const kind = String(result.kind ?? "stale");
  if (kind !== "send") return { kind: kind as Exclude<AtomicBeginSend, { kind: "send" }> ["kind"] };
  const payload = jsonPayload(result.payload);
  const key = str(result.idempotencyKey);
  const attempted = str(result.firstAttemptAt);
  if (!payload || !key || !attempted) return { kind: "stale" };
  return { kind: "send", payload, idempotencyKey: key, firstAttemptAt: attempted };
}

export async function finalizeAtomicFollowupAccepted(input: {
  deliveryId: string; fence: string; providerMessageId: string; subject: string; body: string; provider?: string;
}): Promise<boolean> {
  const rows = await sql`SELECT public.finish_booster_delivery_accepted(
    ${input.deliveryId}::uuid,${input.fence}::uuid,${input.providerMessageId},
    ${input.subject},${input.body},${input.provider ?? "resend"}) AS changed`;
  if (objectRow(rows[0]).changed === true) return true;
  // A verified webhook may have settled this delivery while the provider call
  // was returning. Treat that same acceptance as success for runner accounting,
  // while a different provider ID remains a stale finalizer.
  const settled = await sql`SELECT d.state,d.provider_message_id,
      EXISTS (SELECT 1 FROM public.booster_delivery_events e
        WHERE e.delivery_id=d.id AND e.provider_message_id=${input.providerMessageId}) AS confirmed_by_event
    FROM public.booster_followup_deliveries d WHERE d.id=${input.deliveryId}::uuid`;
  const settledRow = objectRow(settled[0]);
  return settledRow.state === "accepted" && settledRow.provider_message_id === input.providerMessageId
    && settledRow.confirmed_by_event === true;
}

/** Only definite rejection before any prior provider attempt may release quota. */
export async function releaseAtomicFollowupDelivery(input: {
  deliveryId: string; fence: string; outcome: "rejected" | "generation_failed" | "non_sendable"; error?: string | null;
}): Promise<boolean> {
  const reason = input.outcome === "non_sendable" ? "non_sendable" : input.outcome;
  const rows = await sql`SELECT public.release_booster_delivery(
    ${input.deliveryId}::uuid,${input.fence}::uuid,${reason},${input.error ?? null}) AS changed`;
  return objectRow(rows[0]).changed === true;
}

export async function markAtomicFollowupUnknown(input: { deliveryId: string; fence: string; error?: string | null }): Promise<boolean> {
  const rows = await sql`SELECT public.mark_booster_delivery_unknown(
    ${input.deliveryId}::uuid,${input.fence}::uuid,${input.error ?? null}) AS changed`;
  return objectRow(rows[0]).changed === true;
}

export async function getAtomicBoosterQuota(input: { businessId: string; monthStart?: string }): Promise<{ usage: number; allowance: number }> {
  const rows = input.monthStart
    ? await sql`SELECT * FROM public.booster_monthly_quota(${input.businessId}::uuid,${input.monthStart}::date)`
    : await sql`SELECT * FROM public.booster_monthly_quota(${input.businessId}::uuid)`;
  const row = objectRow(rows[0]);
  return { usage: Number(row.usage ?? 0), allowance: Number(row.allowance ?? 0) };
}
