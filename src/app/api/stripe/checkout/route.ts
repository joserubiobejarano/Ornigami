import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { getServerAppUrl } from "@/lib/env";
import { sql } from "@/lib/db/neon";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { isPlanId, planForAgent, stripePriceId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";
import { safeLogger } from "@/lib/safe-logger";

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "annual";
}

async function getRequestValues(request: Request): Promise<{
  plan_id?: string;
  billing_period?: string;
  agent_id?: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return ((await request.json().catch(() => null)) ?? {}) as {
      plan_id?: string;
      billing_period?: string;
      agent_id?: string;
    };
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      plan_id: typeof form.get("plan_id") === "string" ? String(form.get("plan_id")) : undefined,
      billing_period: typeof form.get("billing_period") === "string" ? String(form.get("billing_period")) : undefined,
      agent_id: typeof form.get("agent_id") === "string" ? String(form.get("agent_id")) : undefined,
    };
  }
  return {};
}

export async function POST(request: Request) {
  try {
    const appUrl = getServerAppUrl();
    const session = await auth();
    if (!session?.user?.email || !session.user.id) {
      return NextResponse.redirect(new URL("/login", appUrl));
    }

    const values = await getRequestValues(request);
    if (values.agent_id === "speed_to_lead") {
      return NextResponse.json({ error: "speed_to_lead is coming soon" }, { status: 400 });
    }

    const planId: PlanId | null = isPlanId(values.plan_id)
      ? values.plan_id
      : values.agent_id === "review_replies" || values.agent_id === "review_booster"
        ? planForAgent(values.agent_id)
        : null;
    if (!planId) return NextResponse.json({ error: "A valid plan_id is required" }, { status: 400 });

    const billingPeriod: BillingPeriod = values.billing_period === undefined
      ? "monthly"
      : isBillingPeriod(values.billing_period) ? values.billing_period : "invalid" as BillingPeriod;
    if (!isBillingPeriod(billingPeriod)) {
      return NextResponse.json({ error: "Invalid billing_period" }, { status: 400 });
    }

    const resolvedUserRows = await sql`
      SELECT id FROM public.users WHERE lower(email) = lower(${session.user.email}) LIMIT 1
    `;
    const resolvedUser = resolvedUserRows[0] as { id: string } | undefined;
    const canonicalUserId = resolvedUser?.id ?? session.user.id;

    let business;
    try {
      business = await getOrCreateBusinessForUser(canonicalUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Could not resolve user in public.users") && session.user.email) {
        business = await getOrCreateBusinessForUser(session.user.email);
      } else {
        throw error;
      }
    }

    const existingSubscription = await sql`
      SELECT stripe_subscription_id, plan_id
      FROM public.business_agents
      WHERE business_id = ${business.id}
        AND lower(status) IN ('active', 'trialing', 'past_due')
        AND stripe_subscription_id IS NOT NULL
      LIMIT 1
    `;
    if (existingSubscription.length) {
      return NextResponse.json(
        { error: "existing_subscription", plan_id: (existingSubscription[0] as { plan_id?: string }).plan_id ?? null },
        { status: 409 }
      );
    }

    const priceId = stripePriceId(planId, billingPeriod);
    const customers = await stripe.customers.list({ email: session.user.email, limit: 1 });
    const customer = customers.data[0] ?? (await stripe.customers.create({ email: session.user.email }));

    await sql`
      INSERT INTO public.user_billing (user_id, stripe_customer_id)
      VALUES (${canonicalUserId}, ${customer.id})
      ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id
    `;
    await sql`UPDATE public.businesses SET stripe_customer_id = ${customer.id} WHERE id = ${business.id}`;

    const metadata = {
      user_id: canonicalUserId,
      business_id: business.id,
      plan_id: planId,
      billing_period: billingPeriod,
    };
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: canonicalUserId,
      line_items: [{ price: priceId, quantity: 1 }],
      currency: "eur",
      subscription_data: { metadata, trial_period_days: 14 },
      metadata,
      success_url: `${appUrl}/dashboard/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      allow_promotion_codes: true,
    });

    if (!checkout.url) return NextResponse.json({ error: "Stripe checkout URL missing" }, { status: 500 });
    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch (error: unknown) {
    safeLogger.error("stripe.checkout.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Unable to create checkout session" }, { status: 500 });
  }
}