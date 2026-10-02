import { getSql } from "@/lib/db/neon";

type DbRow = Record<string, unknown>;
type CheckoutStatus = "pending" | "uncertain" | "completed" | "expired" | "retired";

const one = async <T extends DbRow>(rowsPromise: Promise<unknown>): Promise<T | null> => {
  const rows = await rowsPromise as T[];
  return rows[0] ?? null;
};

export type ClaimCheckoutIntentInput = {
  businessId: string;
  ownerUserId: string;
  planId: string;
  billingPeriod: "monthly" | "annual";
  customerId: string;
  requestHash: string;
  stripePayload: Record<string, unknown>;
  trialRequested: boolean;
};
export type ClaimCheckoutIntentResult = {
  kind: "claimed" | "existing" | "busy" | "conflict" | "blocked";
  intentId: string | null;
  idempotencyKey: string | null;
  fence: string | null;
  stripePayload: Record<string, unknown> | null;
  status: CheckoutStatus | null;
  sessionId: string | null;
  url: string | null;
  createdAt: string | null;
};

export async function claimCheckoutIntent(input: ClaimCheckoutIntentInput): Promise<ClaimCheckoutIntentResult> {
  const row = await one<DbRow>(getSql()`SELECT * FROM public.claim_billing_checkout_intent(${input.businessId}::uuid, ${input.ownerUserId}::uuid,
      ${input.planId}, ${input.billingPeriod}, ${input.customerId}, ${input.requestHash},
      ${JSON.stringify(input.stripePayload)}::jsonb, ${input.trialRequested})`);
  const rawKind = String(row?.kind ?? "blocked");
  const kind: ClaimCheckoutIntentResult["kind"] = rawKind === "claimed" || rawKind === "existing" || rawKind === "conflict"
    ? rawKind : rawKind === "trial_reserved" ? "busy" : "blocked";
  return {
    kind,
    intentId: row?.intent_id == null ? null : String(row.intent_id),
    idempotencyKey: row?.idempotency_key == null ? null : String(row.idempotency_key),
    fence: row?.fence == null ? null : String(row.fence),
    stripePayload: row?.stripe_payload == null ? null : row.stripe_payload as Record<string, unknown>,
    status: row?.status == null ? null : String(row.status) as CheckoutStatus,
    sessionId: row?.session_id == null ? null : String(row.session_id),
    url: row?.checkout_url == null ? null : String(row.checkout_url),
    createdAt: row?.created_at == null ? null : String(row.created_at),
  };
}

async function finishCheckoutIntent(
  input: { intentId: string; fence: string; sessionId?: string | null; url?: string | null }, status: CheckoutStatus,
): Promise<boolean> {
  const row = await one<DbRow>(getSql()`SELECT public.finish_billing_checkout_intent(${input.intentId}::uuid, ${input.fence}::uuid,
      ${input.sessionId ?? null}, ${input.url ?? null}, ${status}) AS changed`);
  return row?.changed === true;
}

export function finalizeCheckoutIntent(input: { intentId: string; fence: string; sessionId: string; url: string }) {
  return finishCheckoutIntent(input, "pending");
}
export function markCheckoutIntentUncertain(input: { intentId: string; fence: string }) {
  return finishCheckoutIntent(input, "uncertain");
}
export function markCheckoutIntentCompleted(input: { intentId: string; fence: string; sessionId: string }) {
  return finishCheckoutIntent(input, "completed");
}
export function expireCheckoutIntent(input: { intentId: string; fence: string; sessionId?: string | null }) {
  return finishCheckoutIntent(input, "expired");
}

export type OwnerCustomerProvisioning = {
  kind: "mapped" | "claimed" | "busy" | "uncertain" | "missing_owner" | "mapping_conflict";
  customerId: string | null;
  email: string | null;
  idempotencyKey: string | null;
  fence: string | null;
  status: "pending" | "uncertain" | null;
  createdAt: string | null;
};

export async function claimOwnerCustomerProvisioning(input: { ownerUserId: string }): Promise<OwnerCustomerProvisioning> {
  const row = await one<DbRow>(getSql()`SELECT * FROM public.claim_billing_customer_provisioning(${input.ownerUserId}::uuid)`);
  const dbKind = String(row?.kind ?? "missing_owner");
  const kind: OwnerCustomerProvisioning["kind"] = dbKind === "mapped" || dbKind === "claimed" || dbKind === "missing_owner" || dbKind === "mapping_conflict"
    ? dbKind : dbKind === "existing" && row?.status === "pending" ? "uncertain" : "busy";
  return {
    kind,
    customerId: row?.customer_id == null ? null : String(row.customer_id),
    email: row?.email == null ? null : String(row.email),
    idempotencyKey: row?.idempotency_key == null ? null : String(row.idempotency_key),
    fence: row?.fence == null ? null : String(row.fence),
    status: row?.status == null ? null : String(row.status) as "pending" | "uncertain",
    createdAt: row?.created_at == null ? null : String(row.created_at),
  };
}

export async function finalizeOwnerCustomerProvisioning(input: { ownerUserId: string; fence: string; customerId: string }): Promise<boolean> {
  const row = await one<DbRow>(getSql()`SELECT public.finalize_billing_customer_provisioning(${input.ownerUserId}::uuid, ${input.fence}::uuid, ${input.customerId}) AS changed`);
  return row?.changed === true;
}

export type TrialEligibility = "eligible" | "used" | "legacy_unknown" | "reserved";
export async function getTrialEligibility(input: { businessId: string; ownerUserId: string }): Promise<TrialEligibility> {
  const row = await one<DbRow>(getSql()`SELECT public.get_billing_trial_eligibility(${input.businessId}::uuid, ${input.ownerUserId}::uuid) AS state`);
  const state = String(row?.state ?? "legacy_unknown");
  return state === "eligible" || state === "used" || state === "reserved" ? state : "legacy_unknown";
}

export class StaleBillingFenceError extends Error {
  constructor() { super("Billing reconciliation lease is stale"); this.name = "StaleBillingFenceError"; }
}
export class BillingMappingConflictError extends Error {
  constructor(message = "Billing ownership mapping changed during reconciliation") { super(message); this.name = "BillingMappingConflictError"; }
}
export class LegacyTrialHistoryError extends Error {
  constructor() { super("Existing Stripe trial history requires reconciliation"); this.name = "LegacyTrialHistoryError"; }
}

export type ClaimBillingReconciliationLeaseResult = {
  kind: "claimed" | "duplicate" | "busy";
  fence: string | null;
  leaseUntil: string | null;
};
export async function claimBillingReconciliationLease(input: {
  ownerUserId: string; eventId: string; eventType: string; leaseMs?: number;
}): Promise<ClaimBillingReconciliationLeaseResult> {
  const row = await one<DbRow>(getSql()`SELECT * FROM public.claim_billing_reconciliation_lease(${input.ownerUserId}::uuid, ${input.eventId}, ${input.eventType}, ${input.leaseMs ?? 60000})`);
  const kind = row?.kind === "claimed" || row?.kind === "duplicate" ? row.kind : "busy";
  return { kind, fence: row?.fence == null ? null : String(row.fence), leaseUntil: row?.lease_until == null ? null : String(row.lease_until) };
}

export async function releaseBillingReconciliationLease(input: { ownerUserId: string; eventId: string; fence: string }): Promise<boolean> {
  const row = await one<DbRow>(getSql()`SELECT public.release_billing_reconciliation_lease(${input.ownerUserId}::uuid, ${input.eventId}, ${input.fence}::uuid) AS released`);
  return row?.released === true;
}

export async function renewBillingReconciliationLease(input: { ownerUserId: string; eventId: string; fence: string; leaseMs: number }): Promise<boolean> {
  const row = await one<DbRow>(getSql()`SELECT public.renew_billing_reconciliation_lease(
    ${input.ownerUserId}::uuid, ${input.eventId}, ${input.fence}::uuid, ${input.leaseMs}) AS renewed`);
  return row?.renewed === true;
}

export type StripeWebhookAgentSnapshot = {
  agentId: "review_replies" | "review_booster";
  status: "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "inactive";
  activatedAt: string | null;
  deactivatedAt: string | null;
};
export async function applyStripeWebhookSnapshot(input: {
  eventId: string;
  eventType: string;
  ownerUserId: string;
  businessId: string;
  customerId: string;
  subscription: {
    id: string;
    status: string;
    priceId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    billingIntentToken?: string | null;
  };
  planId: "replies" | "booster" | "complete";
  billingPeriod: "monthly" | "annual";
  trialStart: string | null;
  fence: string;
  agents: StripeWebhookAgentSnapshot[];
  expectedPreviousSubscriptionId: string | null;
  previousSubscriptionStatus?: string | null;
}): Promise<void> {
  try {
    await getSql()`SELECT public.apply_stripe_webhook_snapshot(
      ${input.eventId}, ${input.eventType}, ${input.ownerUserId}::uuid, ${input.businessId}::uuid, ${input.customerId},
      ${JSON.stringify(input.subscription)}::jsonb, ${input.planId}, ${input.billingPeriod},
      ${input.trialStart}::timestamptz, ${input.fence}::uuid, ${JSON.stringify(input.agents)}::jsonb,
      ${input.expectedPreviousSubscriptionId}, ${input.previousSubscriptionStatus ?? null})`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/stale billing reconciliation fence/i.test(message)) throw new StaleBillingFenceError();
    if (/billing .*mapping|already mapped to another owner/i.test(message)) throw new BillingMappingConflictError(message);
    if (/trial history|trial already used/i.test(message)) throw new LegacyTrialHistoryError();
    throw error;
  }
}

export async function markStripeEventIgnored(input: { eventId: string; eventType: string }): Promise<void> {
  await getSql()`SELECT public.mark_stripe_event_ignored(${input.eventId}, ${input.eventType})`;
}
