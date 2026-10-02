import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { getRequiredEnv } from "@/lib/env";
import { safeLogger } from "@/lib/safe-logger";
import { reconcileStripeEvent } from "@/lib/billing/reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let webhookSecret: string;
  try {
    webhookSecret = getRequiredEnv("STRIPE_WEBHOOK_SECRET");
  } catch {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await reconcileStripeEvent(event, (subscriptionId) => stripe.subscriptions.retrieve(subscriptionId));
    return NextResponse.json({ received: true, ...(outcome === "duplicate" ? { duplicate: true } : {}) });
  } catch (error: unknown) {
    safeLogger.error("stripe.webhook.failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });
    // Stripe must retry unresolved mappings, unknown prices, busy deliveries and stale fences.
    return NextResponse.json({ error: "Webhook reconciliation incomplete" }, { status: 500 });
  }
}
