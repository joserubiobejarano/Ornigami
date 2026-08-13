import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/db/neon";
import { agentsForPlan, isPlanId, periodFromStripePrice, planForAgent, planIdFromStripePrice, type AgentId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBusinessAgentStatus(stripeStatus: string): string {
  if (stripeStatus === "active" || stripeStatus === "trialing") return stripeStatus;
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "unpaid") return "unpaid";
  if (stripeStatus === "canceled") return "canceled";
  return "inactive";
}

function periodEndFromSubscription(subscription: Stripe.Subscription): string | null {
  const timestamp = subscription.items.data[0]?.current_period_end;
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function periodStartFromSubscription(subscription: Stripe.Subscription): string | null {
  const timestamp = subscription.items.data[0]?.current_period_start;
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

function billingPeriodFromSubscription(priceId: string | null, metadata: Stripe.Metadata | null | undefined): BillingPeriod {
  return periodFromStripePrice(priceId) ?? (metadata?.billing_period === "annual" ? "annual" : "monthly");
}

function planFromMetadata(metadata: Stripe.Metadata | null | undefined, priceId: string | null): PlanId | null {
  if (isPlanId(metadata?.plan_id)) return metadata.plan_id;
  if (metadata?.agent_id === "review_replies" || metadata?.agent_id === "review_booster") {
    return planForAgent(metadata.agent_id);
  }
  return planIdFromStripePrice(priceId);
}

async function resolveBusinessId(
  metadata: Stripe.Metadata | null | undefined,
  stripeCustomerId: string | null,
  userId: string | null
): Promise<string | null> {
  if (metadata?.business_id) return metadata.business_id;
  if (stripeCustomerId) {
    const rows = await sql`SELECT id FROM public.businesses WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1`;
    const business = rows[0] as { id: string } | undefined;
    if (business?.id) return business.id;
  }
  if (userId) {
    const rows = await sql`SELECT id FROM public.businesses WHERE owner_user_id = ${userId} ORDER BY created_at ASC LIMIT 1`;
    const business = rows[0] as { id: string } | undefined;
    if (business?.id) return business.id;
  }
  return null;
}

async function businessBelongsToUser(businessId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM public.business_members
    WHERE business_id = ${businessId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function updateBusinessAgentFromSubscription(params: {
  businessId: string;
  agentId: AgentId;
  planId: PlanId;
  billingPeriod: BillingPeriod;
  status: string;
  subscriptionId: string | null;
  priceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}) {
  const mappedStatus = toBusinessAgentStatus(params.status);
  await sql`
    INSERT INTO public.business_agents (
      business_id, agent_id, status, plan_id, billing_period,
      stripe_subscription_id, stripe_price_id, current_period_start, current_period_end,
      activated_at, updated_at
    ) VALUES (
      ${params.businessId}, ${params.agentId}, ${mappedStatus}, ${params.planId}, ${params.billingPeriod},
      ${params.subscriptionId}, ${params.priceId}, ${params.currentPeriodStart}, ${params.currentPeriodEnd},
      CASE WHEN ${mappedStatus} IN ('active', 'trialing') THEN now() ELSE NULL END, now()
    )
    ON CONFLICT (business_id, agent_id) DO UPDATE SET
      status = EXCLUDED.status,
      plan_id = EXCLUDED.plan_id,
      billing_period = EXCLUDED.billing_period,
      stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, public.business_agents.stripe_subscription_id),
      stripe_price_id = COALESCE(EXCLUDED.stripe_price_id, public.business_agents.stripe_price_id),
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      activated_at = CASE
        WHEN EXCLUDED.status IN ('active', 'trialing') THEN COALESCE(public.business_agents.activated_at, now())
        ELSE public.business_agents.activated_at
      END,
      deactivated_at = CASE
        WHEN EXCLUDED.status IN ('canceled', 'inactive', 'past_due', 'unpaid') THEN now()
        ELSE public.business_agents.deactivated_at
      END,
      updated_at = now()
  `;
}

async function syncPlanAgents(params: {
  businessId: string;
  planId: PlanId;
  billingPeriod: BillingPeriod;
  status: string;
  subscriptionId: string | null;
  priceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}) {
  const includedAgents = agentsForPlan(params.planId);
  for (const agentId of ["review_replies", "review_booster"] as AgentId[]) {
    await updateBusinessAgentFromSubscription({
      ...params,
      agentId,
      status: includedAgents.includes(agentId) ? params.status : "inactive",
    });
  }
}

async function persistSubscription(params: {
  subscription: Stripe.Subscription;
  userId: string;
}) {
  const priceId = params.subscription.items.data[0]?.price?.id ?? null;
  const currentPeriodEnd = periodEndFromSubscription(params.subscription);
  await sql`
    INSERT INTO public.subscriptions (id, user_id, status, price_id, current_period_end, updated_at)
    VALUES (${params.subscription.id}, ${params.userId}, ${params.subscription.status}, ${priceId}, ${currentPeriodEnd}, now())
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id, status = EXCLUDED.status, price_id = EXCLUDED.price_id,
      current_period_end = EXCLUDED.current_period_end, updated_at = now()
  `;
  return { priceId, currentPeriodEnd };
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    const inserted = await sql`
      INSERT INTO public.stripe_events (id, type)
      VALUES (${event.id}, ${event.type})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if (!inserted.length) return NextResponse.json({ received: true, duplicate: true }, { status: 200 });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
        if (!customerId || !subscriptionId) break;
        const mappingRows = await sql`SELECT user_id FROM public.user_billing WHERE stripe_customer_id = ${customerId} LIMIT 1`;
        const mapping = mappingRows[0] as { user_id: string } | undefined;
        if (!mapping) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const currentPeriodStart = periodStartFromSubscription(subscription);
        const planId = planFromMetadata(session.metadata, priceId);
        if (!planId) {
          safeLogger.warn("stripe.webhook.plan_missing", { eventId: event.id, priceId });
          break;
        }
        const currentPeriodEnd = periodEndFromSubscription(subscription);
        await persistSubscription({ subscription, userId: mapping.user_id });
        await sql`
          UPDATE public.profiles
          SET plan_type = ${planId}, plan_status = ${subscription.status},
              plan_current_period_end = ${currentPeriodEnd}, updated_at = now()
          WHERE id = ${mapping.user_id}
        `;
        const businessId = await resolveBusinessId(session.metadata, customerId, mapping.user_id);
        if (businessId && await businessBelongsToUser(businessId, mapping.user_id)) {
          await syncPlanAgents({ businessId, planId, billingPeriod: billingPeriodFromSubscription(priceId, session.metadata), status: subscription.status, subscriptionId, priceId, currentPeriodStart, currentPeriodEnd });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
        if (!customerId) break;
        const mappingRows = await sql`SELECT user_id FROM public.user_billing WHERE stripe_customer_id = ${customerId} LIMIT 1`;
        const mapping = mappingRows[0] as { user_id: string } | undefined;
        if (!mapping) break;
        const { priceId, currentPeriodEnd } = await persistSubscription({ subscription, userId: mapping.user_id });
        const currentPeriodStart = periodStartFromSubscription(subscription);
        const planId = planFromMetadata(subscription.metadata, priceId);
        if (!planId) break;
        const profilePlan = subscription.status === "canceled" || subscription.status === "unpaid" ? "free" : planId;
        await sql`
          UPDATE public.profiles
          SET plan_type = ${profilePlan}, plan_status = ${subscription.status},
              plan_current_period_end = ${currentPeriodEnd}, updated_at = now()
          WHERE id = ${mapping.user_id}
        `;
        const businessId = await resolveBusinessId(subscription.metadata, customerId, mapping.user_id);
        if (businessId && await businessBelongsToUser(businessId, mapping.user_id)) {
          await syncPlanAgents({ businessId, planId, billingPeriod: billingPeriodFromSubscription(priceId, subscription.metadata), status: subscription.status, subscriptionId: subscription.id, priceId, currentPeriodStart, currentPeriodEnd });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const subscriptionId = invoice.parent?.subscription_details?.subscription;
        const resolvedSubscriptionId = typeof subscriptionId === "string" ? subscriptionId : null;
        if (!customerId || !resolvedSubscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(resolvedSubscriptionId);
        const mappingRows = await sql`SELECT user_id FROM public.user_billing WHERE stripe_customer_id = ${customerId} LIMIT 1`;
        const mapping = mappingRows[0] as { user_id: string } | undefined;
        if (!mapping) break;
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const currentPeriodStart = periodStartFromSubscription(subscription);
        const currentPeriodEnd = periodEndFromSubscription(subscription);
        const planId = planFromMetadata(subscription.metadata, priceId);
        if (!planId) break;
        await persistSubscription({ subscription, userId: mapping.user_id });
        const paymentFailureStatus = subscription.status === "unpaid" || subscription.status === "canceled"
          ? subscription.status
          : "past_due";
        const profileStatus = paymentFailureStatus === "canceled" ? "canceled" : paymentFailureStatus === "past_due" ? "past_due" : "free";
        await sql`
          UPDATE public.profiles
          SET plan_status = ${profileStatus}, plan_current_period_end = ${currentPeriodEnd}, updated_at = now()
          WHERE id = ${mapping.user_id}
        `;
        const businessId = await resolveBusinessId(subscription.metadata, customerId, mapping.user_id);
        if (businessId && await businessBelongsToUser(businessId, mapping.user_id)) {
          await syncPlanAgents({ businessId, planId, billingPeriod: billingPeriodFromSubscription(priceId, subscription.metadata), status: paymentFailureStatus, subscriptionId: resolvedSubscriptionId, priceId, currentPeriodStart, currentPeriodEnd });
        }
        break;
      }
      default:
        break;
    }
  } catch (error: unknown) {
    // Roll back the idempotency marker so Stripe's automatic retry re-processes this event.
    await sql`DELETE FROM public.stripe_events WHERE id = ${event.id}`.catch(() => {});
    safeLogger.error("stripe.webhook.failed", { eventType: event.type, error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
