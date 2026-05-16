import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { getServerAppUrl } from "@/lib/env";
import { sql } from "@/lib/db/neon";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";

type CheckoutAgentId = "review_replies" | "review_booster";
const CHECKOUT_AGENT_IDS = new Set<CheckoutAgentId>(["review_replies", "review_booster"]);

function resolvePriceId(agentId: CheckoutAgentId | null): string | null {
  if (agentId === "review_replies") {
    return process.env.STRIPE_REVIEW_REPLIES_PRICE_ID ?? null;
  }
  if (agentId === "review_booster") {
    return process.env.STRIPE_REVIEW_BOOSTER_PRICE_ID ?? null;
  }
  return process.env.STRIPE_PRICE_STARTER ?? null;
}

async function getRequestAgentId(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { agent_id?: string } | null;
    return body?.agent_id ?? null;
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const value = form.get("agent_id");
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const appUrl = getServerAppUrl();

    const session = await auth();
    if (!session?.user?.email || !session.user.id) {
      return NextResponse.redirect(new URL("/login", appUrl));
    }
    const rawAgentId = await getRequestAgentId(request);
    if (rawAgentId === "speed_to_lead") {
      return NextResponse.json({ error: "speed_to_lead is coming soon" }, { status: 400 });
    }
    const isAgentCheckout = rawAgentId !== null;
    const agentId = CHECKOUT_AGENT_IDS.has(rawAgentId as CheckoutAgentId)
      ? (rawAgentId as CheckoutAgentId)
      : null;
    if (isAgentCheckout && !agentId) {
      return NextResponse.json({ error: "Invalid agent_id" }, { status: 400 });
    }

    const priceId = resolvePriceId(agentId);
    if (!priceId) {
      return NextResponse.json({ error: "Stripe price ID not configured" }, { status: 500 });
    }

    const resolvedUserRows = await sql`
      SELECT id
      FROM public.users
      WHERE lower(email) = lower(${session.user.email})
      LIMIT 1
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

    const customers = await stripe.customers.list({ email: session.user.email, limit: 1 });
    const customer = customers.data[0] ?? (await stripe.customers.create({ email: session.user.email }));

    await sql`
      INSERT INTO public.user_billing (user_id, stripe_customer_id)
      VALUES (${canonicalUserId}, ${customer.id})
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id
    `;
    await sql`
      UPDATE public.businesses
      SET stripe_customer_id = ${customer.id}
      WHERE id = ${business.id}
    `;

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      client_reference_id: canonicalUserId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          user_id: canonicalUserId,
          business_id: business.id,
          agent_id: agentId ?? "starter_plan",
        },
        trial_period_days: 7,
      },
      metadata: {
        user_id: canonicalUserId,
        business_id: business.id,
        agent_id: agentId ?? "starter_plan",
      },
      success_url: `${appUrl}/dashboard/billing?success=1`,
      cancel_url: `${appUrl}/dashboard/billing?canceled=1`,
      allow_promotion_codes: true,
    });

    if (!checkout.url) return NextResponse.json({ error: "Stripe checkout URL missing" }, { status: 500 });

    return NextResponse.redirect(checkout.url, { status: 303 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
