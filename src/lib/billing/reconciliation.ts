import type Stripe from "stripe";

import { sql } from "@/lib/db/neon";
import { agentsForPlan, periodFromStripePrice, planIdFromStripePrice, type AgentId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";
import { toBusinessAgentStatus } from "@/lib/billing/webhook-state";
import { claimBillingReconciliationLease, applyStripeWebhookSnapshot, markStripeEventIgnored, releaseBillingReconciliationLease, renewBillingReconciliationLease } from "@/lib/billing/persistence";

export class BillingReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingReconciliationError";
  }
}

export type BillingMapping = { ownerUserId: string; businessId: string; customerId: string };

type BillingMetadata = Stripe.Metadata | null | undefined;
type RelevantEvent = { subscriptionId: string; customerId: string | null; metadata?: BillingMetadata };

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function eventSubscription(event: Stripe.Event): RelevantEvent | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return null;
      const subscriptionId = stripeId(session.subscription as string | { id: string } | null);
      if (!subscriptionId) throw new BillingReconciliationError("Checkout completed without a subscription");
      return { subscriptionId, customerId: stripeId(session.customer as string | { id: string } | null), metadata: session.metadata };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return { subscriptionId: subscription.id, customerId: stripeId(subscription.customer as string | { id: string }), metadata: subscription.metadata };
    }
    case "invoice.payment_failed":
    case "invoice.payment_succeeded":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = stripeId(subscription as string | { id: string } | null);
      if (!subscriptionId) return null;
      return { subscriptionId, customerId: stripeId(invoice.customer as string | { id: string } | null) };
    }
    default:
      return null;
  }
}

function metadataOwnerId(metadata: BillingMetadata): string | null {
  return metadata?.billing_owner_user_id ?? metadata?.owner_user_id ?? metadata?.user_id ?? null;
}

/**
 * Resolves webhook identity only through persisted billing/subscription mappings.
 * Stripe metadata can narrow an existing owner mapping, but can never establish one by itself.
 */
export async function resolveBillingMapping(input: {
  subscriptionId: string;
  customerId: string | null;
  metadata?: BillingMetadata;
}): Promise<BillingMapping> {
  const exactRows = await sql`
    SELECT DISTINCT b.owner_user_id, b.id AS business_id, b.stripe_customer_id
    FROM public.business_agents ba
    JOIN public.businesses b ON b.id = ba.business_id
    WHERE ba.stripe_subscription_id = ${input.subscriptionId}
  `;
  const candidates = exactRows.length ? exactRows : await sql`
    SELECT DISTINCT b.owner_user_id, b.id AS business_id, b.stripe_customer_id
    FROM public.user_billing ub
    JOIN public.businesses b ON b.owner_user_id = ub.user_id
    WHERE ub.stripe_customer_id = ${input.customerId}
      AND b.stripe_customer_id = ub.stripe_customer_id
      AND (
        NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = ${input.subscriptionId})
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.id = ${input.subscriptionId} AND s.user_id = b.owner_user_id
        )
      )
  `;

  const metadataOwner = metadataOwnerId(input.metadata);
  const metadataBusiness = input.metadata?.business_id ?? null;
  const rows = candidates.filter((row): row is { owner_user_id: string; business_id: string; stripe_customer_id: string | null } =>
    typeof (row as { owner_user_id?: unknown }).owner_user_id === "string" &&
    typeof (row as { business_id?: unknown }).business_id === "string"
  );
  const matching = rows.filter((row) =>
    (!input.customerId || row.stripe_customer_id === input.customerId) &&
    (!metadataOwner || row.owner_user_id === metadataOwner) &&
    (!metadataBusiness || row.business_id === metadataBusiness)
  );
  const unique = new Map(matching.map((row) => [`${row.owner_user_id}:${row.business_id}`, row]));
  if (unique.size !== 1) {
    throw new BillingReconciliationError(unique.size === 0 ? "No validated billing mapping for Stripe subscription" : "Ambiguous billing mapping for Stripe subscription");
  }
  const [row] = unique.values();
  if (!row.stripe_customer_id || (input.customerId && row.stripe_customer_id !== input.customerId)) {
    throw new BillingReconciliationError("Stripe customer does not match the persisted billing mapping");
  }
  return { ownerUserId: row.owner_user_id, businessId: row.business_id, customerId: row.stripe_customer_id };
}

async function mappedSubscription(mapping: BillingMapping): Promise<string | null> {
  const rows = await sql`
    SELECT DISTINCT stripe_subscription_id
    FROM public.business_agents
    WHERE business_id = ${mapping.businessId}
      AND agent_id IN ('review_replies', 'review_booster')
      AND stripe_subscription_id IS NOT NULL
  `;
  const subscriptionIds = [...new Set(rows.map((row) => (row as { stripe_subscription_id?: unknown }).stripe_subscription_id).filter((id): id is string => typeof id === "string"))];
  if (subscriptionIds.length > 1) throw new BillingReconciliationError("Business agents have conflicting Stripe subscriptions");
  return subscriptionIds[0] ?? null;
}

function subscriptionPrice(subscription: Stripe.Subscription): { priceId: string; planId: PlanId; period: BillingPeriod } {
  const items = subscription.items.data;
  if (items.length !== 1 || !items[0]?.price?.id) {
    throw new BillingReconciliationError("Stripe subscription must contain exactly one recognized plan price");
  }
  const priceId = items[0].price.id;
  const planId = planIdFromStripePrice(priceId);
  const period = periodFromStripePrice(priceId);
  if (!planId || !period) throw new BillingReconciliationError(`Unrecognized Stripe price ${priceId}`);
  return { priceId, planId, period };
}

function dateFromUnix(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

function currentPeriod(subscription: Stripe.Subscription): { start: string | null; end: string | null } {
  const item = subscription.items.data[0];
  return { start: dateFromUnix(item?.current_period_start), end: dateFromUnix(item?.current_period_end) };
}

export async function reconcileStripeEvent(
  event: Stripe.Event,
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>
): Promise<"processed" | "duplicate"> {
  const relevant = eventSubscription(event);
  if (!relevant) {
    await markStripeEventIgnored({ eventId: event.id, eventType: event.type });
    return "processed";
  }
  if (!relevant.customerId) throw new BillingReconciliationError("Stripe event has no customer id");

  const mapping = await resolveBillingMapping({ ...relevant, customerId: relevant.customerId });
  const lease = await claimBillingReconciliationLease({ ownerUserId: mapping.ownerUserId, eventId: event.id, eventType: event.type });
  if (lease.kind === "duplicate") return "duplicate";
  if (lease.kind === "busy" || !lease.fence) throw new BillingReconciliationError("Billing reconciliation is already in progress; retry delivery");

  try {
    const lockedMapping = await resolveBillingMapping({ ...relevant, customerId: relevant.customerId });
    if (lockedMapping.ownerUserId !== mapping.ownerUserId || lockedMapping.businessId !== mapping.businessId || lockedMapping.customerId !== mapping.customerId) {
      throw new BillingReconciliationError("Billing mapping changed while acquiring reconciliation lease");
    }
    const expectedPreviousSubscriptionId = await mappedSubscription(mapping);
    let subscriptionId = relevant.subscriptionId;
    let previousSubscriptionStatus: string | null = null;
    let subscription: Stripe.Subscription;
    if (expectedPreviousSubscriptionId && expectedPreviousSubscriptionId !== relevant.subscriptionId) {
      const [mappedCurrent, incoming] = await Promise.all([
        retrieveSubscription(expectedPreviousSubscriptionId),
        retrieveSubscription(relevant.subscriptionId),
      ]);
      if (mappedCurrent.id !== expectedPreviousSubscriptionId || incoming.id !== relevant.subscriptionId) {
        throw new BillingReconciliationError("Stripe returned a different subscription than requested");
      }
      const currentIsTerminal = mappedCurrent.status === "canceled" || mappedCurrent.status === "incomplete_expired";
      const incomingIsTerminal = incoming.status === "canceled" || incoming.status === "incomplete_expired";
      if (currentIsTerminal && !incomingIsTerminal) {
        subscription = incoming;
        previousSubscriptionStatus = mappedCurrent.status;
      } else if (!currentIsTerminal && incomingIsTerminal) {
        subscription = mappedCurrent;
        subscriptionId = mappedCurrent.id;
      } else if (currentIsTerminal && incomingIsTerminal) {
        // Keep the locally mapped authoritative subscription as the representative
        // state; a delayed terminal event for a replaced ID cannot block future retries.
        subscription = mappedCurrent;
        subscriptionId = mappedCurrent.id;
      } else {
        throw new BillingReconciliationError("Conflicting live Stripe subscriptions for one business");
      }
    } else {
      subscription = await retrieveSubscription(subscriptionId);
      if (subscription.id !== subscriptionId) throw new BillingReconciliationError("Stripe returned a different subscription than requested");
    }

    const customerId = stripeId(subscription.customer as string | { id: string });
    if (customerId !== mapping.customerId) throw new BillingReconciliationError("Authoritative subscription customer conflicts with local mapping");
    const subscriptionMetadata = subscription.metadata;
    const authoritativeOwner = metadataOwnerId(subscriptionMetadata);
    if (authoritativeOwner && authoritativeOwner !== mapping.ownerUserId) throw new BillingReconciliationError("Authoritative subscription owner metadata conflicts with local mapping");
    if (subscriptionMetadata?.business_id && subscriptionMetadata.business_id !== mapping.businessId) {
      throw new BillingReconciliationError("Authoritative subscription business metadata conflicts with local mapping");
    }

    const { priceId, planId, period } = subscriptionPrice(subscription);
    const periodInfo = currentPeriod(subscription);
    const agentStatus = toBusinessAgentStatus(subscription.status);
    const includedAgents = new Set(agentsForPlan(planId));
    const activatedAt = dateFromUnix(subscription.start_date);
    const deactivatedAt = ["canceled", "inactive", "past_due", "unpaid"].includes(agentStatus) ? new Date().toISOString() : null;
    await applyStripeWebhookSnapshot({
      eventId: event.id,
      eventType: event.type,
      ownerUserId: mapping.ownerUserId,
      businessId: mapping.businessId,
      customerId: mapping.customerId,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        priceId,
        currentPeriodStart: periodInfo.start,
        currentPeriodEnd: periodInfo.end,
        billingIntentToken: subscription.metadata?.billing_intent_token ?? null,
      },
      planId,
      billingPeriod: period,
      trialStart: dateFromUnix(subscription.trial_start),
      fence: lease.fence,
      expectedPreviousSubscriptionId,
      previousSubscriptionStatus,
      agents: (["review_replies", "review_booster"] as AgentId[]).map((agentId) => ({
        agentId,
        status: includedAgents.has(agentId) ? agentStatus : "inactive",
        activatedAt: includedAgents.has(agentId) && (agentStatus === "active" || agentStatus === "trialing") ? activatedAt : null,
        deactivatedAt: includedAgents.has(agentId) ? deactivatedAt : new Date().toISOString(),
      })),
    });
    return "processed";
  } finally {
    await releaseBillingReconciliationLease({ ownerUserId: mapping.ownerUserId, eventId: event.id, fence: lease.fence }).catch(() => {});
  }
}

/**
 * Provider step for A11 privacy deletion: cancel subscriptions still locally mapped to
 * businesses owned by this user while holding the same owner reconciliation fence.
 * This does not discover Stripe-side orphans / unresolved checkout sessions; A11 must
 * freeze deletion durably and reconcile those separately before removing local mappings.
 * Retry with the same operationId. No Stripe call is made by this module at import time.
 */
export async function cancelMappedOwnedBillingSubscriptions(input: {
  ownerUserId: string;
  operationId: string;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  cancelSubscription: (id: string) => Promise<Stripe.Subscription>;
}): Promise<string[]> {
  if (!input.operationId || input.operationId.length > 150) throw new BillingReconciliationError("Invalid billing cancellation operation id");
  const eventId = `privacy-billing-cancel:${input.operationId}`;
  const lease = await claimBillingReconciliationLease({ ownerUserId: input.ownerUserId, eventId, eventType: "privacy.billing_cancel", leaseMs: 300000 });
  if (lease.kind !== "claimed" || !lease.fence) throw new BillingReconciliationError("Owner billing is already being reconciled; retry deletion");
  try {
    const rows = await sql`
      SELECT DISTINCT b.id AS business_id, b.owner_user_id,
        b.stripe_customer_id AS business_customer_id, ub.stripe_customer_id AS owner_customer_id,
        ba.stripe_subscription_id
      FROM public.businesses b
      LEFT JOIN public.user_billing ub ON ub.user_id = b.owner_user_id
      LEFT JOIN public.business_agents ba ON ba.business_id = b.id
      WHERE b.owner_user_id = ${input.ownerUserId}
        AND ba.stripe_subscription_id IS NOT NULL
    `;
    const bySubscription = new Map<string, { businessId: string; customerId: string }>();
    for (const raw of rows) {
      const row = raw as { business_id?: unknown; owner_user_id?: unknown; business_customer_id?: unknown; owner_customer_id?: unknown; stripe_subscription_id?: unknown };
      if (row.owner_user_id !== input.ownerUserId || typeof row.business_id !== "string" ||
        typeof row.business_customer_id !== "string" || typeof row.owner_customer_id !== "string" ||
        row.business_customer_id !== row.owner_customer_id || typeof row.stripe_subscription_id !== "string") {
        throw new BillingReconciliationError("Incomplete or conflicting owner billing mapping during deletion");
      }
      const existing = bySubscription.get(row.stripe_subscription_id);
      if (existing && (existing.businessId !== row.business_id || existing.customerId !== row.owner_customer_id)) {
        throw new BillingReconciliationError("Subscription maps to multiple businesses during deletion");
      }
      bySubscription.set(row.stripe_subscription_id, { businessId: row.business_id, customerId: row.owner_customer_id });
    }
    const canceled: string[] = [];
    for (const [subscriptionId, mapping] of bySubscription) {
      const renewed = await renewBillingReconciliationLease({ ownerUserId: input.ownerUserId, eventId, fence: lease.fence, leaseMs: 300000 });
      if (!renewed) throw new BillingReconciliationError("Owner billing cancellation lease expired; retry deletion");
      const current = await input.retrieveSubscription(subscriptionId);
      const currentCustomerId = stripeId(current.customer as string | { id: string });
      if (currentCustomerId !== mapping.customerId) throw new BillingReconciliationError("Stripe subscription customer conflicts with deletion mapping");
      const owner = metadataOwnerId(current.metadata);
      if (owner && owner !== input.ownerUserId) throw new BillingReconciliationError("Stripe subscription owner conflicts with deletion mapping");
      if (current.metadata?.business_id && current.metadata.business_id !== mapping.businessId) {
        throw new BillingReconciliationError("Stripe subscription business conflicts with deletion mapping");
      }
      if (current.status !== "canceled" && current.status !== "incomplete_expired") {
        const renewedBeforeMutation = await renewBillingReconciliationLease({ ownerUserId: input.ownerUserId, eventId, fence: lease.fence, leaseMs: 300000 });
        if (!renewedBeforeMutation) throw new BillingReconciliationError("Owner billing cancellation lease expired; retry deletion");
        const result = await input.cancelSubscription(subscriptionId);
        if (result.status !== "canceled") throw new BillingReconciliationError("Stripe did not confirm subscription cancellation");
      }
      canceled.push(subscriptionId);
    }
    return canceled;
  } finally {
    await releaseBillingReconciliationLease({ ownerUserId: input.ownerUserId, eventId, fence: lease.fence }).catch(() => {});
  }
}
