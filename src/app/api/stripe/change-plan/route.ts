import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { BusinessAccessError, requireBusinessOwner } from "@/lib/business-context";
import { sql } from "@/lib/db/neon";
import { isCheckoutBillingPeriod, isCheckoutPlanId } from "@/lib/billing/checkout-policy";
import { stripePriceId } from "@/lib/billing/plans";
import { stripe } from "@/lib/stripe";
import { safeLogger } from "@/lib/safe-logger";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as {
      plan_id?: unknown; billing_period?: unknown; business_id?: unknown;
    } | null;
    if (!isCheckoutPlanId(body?.plan_id) || !isCheckoutBillingPeriod(body?.billing_period ?? "monthly")) {
      return NextResponse.json({ error: "Valid plan_id and billing_period are required" }, { status: 400 });
    }
    if (body?.business_id !== undefined && typeof body.business_id !== "string") {
      return NextResponse.json({ error: "Invalid business_id" }, { status: 400 });
    }

    const context = await requireBusinessOwner(session.user.id, body?.business_id as string | undefined);
    const billingPeriod = (body.billing_period ?? "monthly") as "monthly" | "annual";
    const targetPriceId = stripePriceId(body.plan_id, billingPeriod);

    const [agents, businessRows] = await Promise.all([
      sql`
        SELECT DISTINCT stripe_subscription_id
        FROM public.business_agents
        WHERE business_id = ${context.businessId}
          AND lower(status) IN ('active', 'trialing', 'past_due')
          AND stripe_subscription_id IS NOT NULL
        ORDER BY stripe_subscription_id
        LIMIT 2
      `,
      sql`
        SELECT b.stripe_customer_id AS business_customer_id,
               c.stripe_customer_id AS owner_customer_id
        FROM public.businesses b
        LEFT JOIN public.billing_owner_customers c ON c.owner_user_id = b.owner_user_id
        WHERE b.id = ${context.businessId} AND b.owner_user_id = ${context.ownerUserId}
        LIMIT 1
      `,
    ]);
    if (agents.length > 1) return NextResponse.json({ error: "Multiple active subscriptions require reconciliation" }, { status: 409 });
    const row = agents[0] as { stripe_subscription_id?: string } | undefined;
    if (!row?.stripe_subscription_id) return NextResponse.json({ error: "No active subscription found; use checkout" }, { status: 409 });
    const mapping = businessRows[0] as { business_customer_id: string | null; owner_customer_id: string | null } | undefined;
    if (!mapping?.owner_customer_id || (mapping.business_customer_id && mapping.business_customer_id !== mapping.owner_customer_id)) {
      return NextResponse.json({ error: "Billing customer mapping requires reconciliation" }, { status: 409 });
    }

    const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (customerId !== mapping.owner_customer_id ||
        (mapping.business_customer_id && customerId !== mapping.business_customer_id)) {
      return NextResponse.json({ error: "Subscription ownership mismatch" }, { status: 403 });
    }
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || (customer.metadata.owner_user_id && customer.metadata.owner_user_id !== context.ownerUserId)) {
      return NextResponse.json({ error: "Billing customer ownership requires reconciliation" }, { status: 403 });
    }
    const metadataBusiness = subscription.metadata.business_id;
    const metadataOwner = subscription.metadata.owner_user_id ?? subscription.metadata.billing_owner_user_id ?? subscription.metadata.user_id;
    if ((metadataBusiness && metadataBusiness !== context.businessId) ||
        (metadataOwner && metadataOwner !== context.ownerUserId)) {
      return NextResponse.json({ error: "Subscription ownership requires reconciliation" }, { status: 403 });
    }
    if (!["active", "trialing", "past_due"].includes(subscription.status)) {
      return NextResponse.json({ error: "Subscription is not changeable" }, { status: 409 });
    }
    const item = subscription.items.data[0];
    if (!item) return NextResponse.json({ error: "Subscription has no billable item" }, { status: 409 });
    if (subscription.items.data.length !== 1) return NextResponse.json({ error: "Multiple subscription items require reconciliation" }, { status: 409 });

    await stripe.subscriptions.update(subscription.id, {
      items: [{ id: item.id, price: targetPriceId }],
      proration_behavior: "always_invoice",
      metadata: {
        ...subscription.metadata,
        user_id: context.ownerUserId,
        owner_user_id: context.ownerUserId,
        business_id: context.businessId,
        plan_id: body.plan_id,
        billing_period: billingPeriod,
      },
    });

    return NextResponse.json({ ok: true, plan_id: body.plan_id, billing_period: billingPeriod });
  } catch (error: unknown) {
    if (error instanceof BusinessAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    safeLogger.error("stripe.change_plan.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Unable to change plan" }, { status: 500 });
  }
}
