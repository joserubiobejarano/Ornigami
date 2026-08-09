import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/db/neon";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { isPlanId, stripePriceId, type BillingPeriod } from "@/lib/billing/plans";
import { safeLogger } from "@/lib/safe-logger";

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "annual";
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { plan_id?: unknown; billing_period?: unknown } | null;
    if (!isPlanId(body?.plan_id) || !isBillingPeriod(body?.billing_period ?? "monthly")) {
      return NextResponse.json({ error: "Valid plan_id and billing_period are required" }, { status: 400 });
    }
    const planId = body.plan_id;
    const billingPeriod = (body.billing_period ?? "monthly") as BillingPeriod;

    const userRows = await sql`SELECT id FROM public.users WHERE lower(email) = lower(${session.user.email}) LIMIT 1`;
    const canonicalUserId = (userRows[0] as { id: string } | undefined)?.id ?? session.user.id;
    const business = await getOrCreateBusinessForUser(canonicalUserId);
    const agentRows = await sql`
      SELECT stripe_subscription_id
      FROM public.business_agents
      WHERE business_id = ${business.id}
        AND lower(status) IN ('active', 'trialing', 'past_due')
        AND stripe_subscription_id IS NOT NULL
      LIMIT 1
    `;
    const subscriptionId = (agentRows[0] as { stripe_subscription_id?: string } | undefined)?.stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({ error: "No active subscription found; use checkout" }, { status: 409 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    if (!item) return NextResponse.json({ error: "Subscription has no billable item" }, { status: 409 });

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: stripePriceId(planId, billingPeriod) }],
      proration_behavior: "always_invoice",
      metadata: {
        user_id: canonicalUserId,
        business_id: business.id,
        plan_id: planId,
        billing_period: billingPeriod,
      },
    });

    return NextResponse.json({ ok: true, plan_id: planId, billing_period: billingPeriod });
  } catch (error: unknown) {
    safeLogger.error("stripe.change_plan.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Unable to change plan" }, { status: 500 });
  }
}