import { NextResponse, NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/db/neon";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_AGENT_IDS = new Set(["review_replies", "review_booster"]);

function toBusinessAgentStatus(stripeStatus: string): string {
  if (stripeStatus === "active" || stripeStatus === "trialing") return stripeStatus;
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled") return "canceled";
  return "inactive";
}

async function resolveBusinessId(
  metadata: Record<string, string> | null | undefined,
  stripeCustomerId: string | null,
  userId: string | null
): Promise<string | null> {
  if (metadata?.business_id) {
    return metadata.business_id;
  }

  if (stripeCustomerId) {
    const businessRows = await sql`
      SELECT id
      FROM public.businesses
      WHERE stripe_customer_id = ${stripeCustomerId}
      LIMIT 1
    `;
    const business = businessRows[0] as { id: string } | undefined;
    if (business?.id) return business.id;
  }

  if (userId) {
    const businessRows = await sql`
      SELECT id
      FROM public.businesses
      WHERE owner_user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const business = businessRows[0] as { id: string } | undefined;
    if (business?.id) return business.id;
  }

  return null;
}

async function updateBusinessAgentFromSubscription(params: {
  businessId: string;
  agentId: string;
  status: string;
  subscriptionId: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
}) {
  const mappedStatus = toBusinessAgentStatus(params.status);
  await sql`
    UPDATE public.business_agents
    SET
      status = ${mappedStatus},
      activated_at = CASE
        WHEN ${mappedStatus} IN ('active', 'trialing') THEN COALESCE(activated_at, now())
        ELSE activated_at
      END,
      deactivated_at = CASE
        WHEN ${mappedStatus} IN ('canceled', 'inactive', 'past_due') THEN now()
        ELSE deactivated_at
      END,
      stripe_subscription_id = COALESCE(${params.subscriptionId}, stripe_subscription_id),
      stripe_price_id = COALESCE(${params.priceId}, stripe_price_id),
      current_period_end = ${params.currentPeriodEnd},
      updated_at = now()
    WHERE business_id = ${params.businessId}
      AND agent_id = ${params.agentId}
  `;
}

async function businessBelongsToUser(businessId: string, userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM public.business_members
    WHERE business_id = ${businessId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sess = event.data.object as {
          customer: string;
          subscription: string;
          metadata?: Record<string, string>;
        };
        const stripeCustomerId = sess.customer;
        const subscriptionId = sess.subscription;

        const mapRows = await sql`
          SELECT user_id FROM public.user_billing
          WHERE stripe_customer_id = ${stripeCustomerId}
          LIMIT 1
        `;
        const mapping = mapRows[0] as { user_id: string } | undefined;
        if (!mapping) break;

        const user_id = mapping.user_id;

        const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as {
          items?: { data?: { price?: { id?: string } }[] };
          current_period_end?: number;
          status?: string;
        };
        const price_id = subscription.items?.data?.[0]?.price?.id ?? null;
        const current_period_end = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;
        const status = subscription.status as string;
        const agentId = sess.metadata?.agent_id ?? "starter_plan";
        const businessId = await resolveBusinessId(sess.metadata, stripeCustomerId, user_id);

        await sql`
          INSERT INTO public.subscriptions (id, user_id, status, price_id, current_period_end, updated_at)
          VALUES (${subscriptionId}, ${user_id}, ${status}, ${price_id}, ${current_period_end}, now())
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            status = EXCLUDED.status,
            price_id = EXCLUDED.price_id,
            current_period_end = EXCLUDED.current_period_end,
            updated_at = now()
        `;

        await sql`
          UPDATE public.profiles
          SET
            plan_type = 'starter',
            plan_status = ${status},
            plan_current_period_end = ${current_period_end},
            updated_at = now()
          WHERE id = ${user_id}
        `;
        if (businessId && SUPPORTED_AGENT_IDS.has(agentId) && (await businessBelongsToUser(businessId, user_id))) {
          await updateBusinessAgentFromSubscription({
            businessId,
            agentId,
            status,
            subscriptionId,
            priceId: price_id,
            currentPeriodEnd: current_period_end,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as {
          id: string;
          customer: string;
          metadata?: Record<string, string>;
          items?: { data?: { price?: { id?: string } }[] };
          current_period_end?: number;
          status?: string;
        };
        const stripeCustomerId = sub.customer;

        const mapRows = await sql`
          SELECT user_id FROM public.user_billing
          WHERE stripe_customer_id = ${stripeCustomerId}
          LIMIT 1
        `;
        const mapping = mapRows[0] as { user_id: string } | undefined;
        if (!mapping) break;

        const user_id = mapping.user_id;

        const price_id = sub.items?.data?.[0]?.price?.id ?? null;
        const current_period_end = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const status = sub.status as string;
        const agentId = sub.metadata?.agent_id ?? "starter_plan";
        const businessId = await resolveBusinessId(sub.metadata, stripeCustomerId, user_id);

        await sql`
          INSERT INTO public.subscriptions (id, user_id, status, price_id, current_period_end, updated_at)
          VALUES (${sub.id}, ${user_id}, ${status}, ${price_id}, ${current_period_end}, now())
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            status = EXCLUDED.status,
            price_id = EXCLUDED.price_id,
            current_period_end = EXCLUDED.current_period_end,
            updated_at = now()
        `;

        const planType =
          status === "canceled" || status === "unpaid" ? "free" : "starter";

        await sql`
          UPDATE public.profiles
          SET
            plan_type = ${planType},
            plan_status = ${status},
            plan_current_period_end = ${current_period_end},
            updated_at = now()
          WHERE id = ${user_id}
        `;
        if (businessId && SUPPORTED_AGENT_IDS.has(agentId) && (await businessBelongsToUser(businessId, user_id))) {
          await updateBusinessAgentFromSubscription({
            businessId,
            agentId,
            status,
            subscriptionId: sub.id,
            priceId: price_id,
            currentPeriodEnd: current_period_end,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as {
          customer?: string;
          subscription?: string | null;
        };
        const stripeCustomerId = invoice.customer ?? null;
        const subscriptionId = invoice.subscription ?? null;
        if (!stripeCustomerId || !subscriptionId) break;

        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as {
          metadata?: Record<string, string>;
          items?: { data?: { price?: { id?: string } }[] };
          current_period_end?: number;
        };

        const mapRows = await sql`
          SELECT user_id FROM public.user_billing
          WHERE stripe_customer_id = ${stripeCustomerId}
          LIMIT 1
        `;
        const mapping = mapRows[0] as { user_id: string } | undefined;
        const user_id = mapping?.user_id ?? null;
        const businessId = await resolveBusinessId(sub.metadata, stripeCustomerId, user_id);
        const agentId = sub.metadata?.agent_id ?? "starter_plan";
        if (businessId && SUPPORTED_AGENT_IDS.has(agentId) && user_id && (await businessBelongsToUser(businessId, user_id))) {
          await updateBusinessAgentFromSubscription({
            businessId,
            agentId,
            status: "past_due",
            subscriptionId,
            priceId: sub.items?.data?.[0]?.price?.id ?? null,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err: unknown) {
    safeLogger.error("stripe.webhook.failed", {
      eventType: event.type,
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
