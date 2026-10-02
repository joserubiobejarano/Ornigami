import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getServerAppUrl } from "@/lib/env";
import { BusinessAccessError, requireBusinessOwner } from "@/lib/business-context";
import { sql } from "@/lib/db/neon";
import { stripe } from "@/lib/stripe";
import { safeLogger } from "@/lib/safe-logger";

export async function POST(request: Request) {
  try {
    const appUrl = getServerAppUrl();
    const session = await auth();
    if (!session?.user?.id) return NextResponse.redirect(new URL("/login", appUrl));
    const businessId = new URL(request.url).searchParams.get("business_id");
    const context = await requireBusinessOwner(session.user.id, businessId);

    const rows = await sql`
      SELECT b.stripe_customer_id AS business_customer_id,
             c.stripe_customer_id AS owner_customer_id
      FROM public.businesses b
      LEFT JOIN public.billing_owner_customers c ON c.owner_user_id = b.owner_user_id
      WHERE b.id = ${context.businessId} AND b.owner_user_id = ${context.ownerUserId}
      LIMIT 1
    `;
    const mapping = rows[0] as { business_customer_id: string | null; owner_customer_id: string | null } | undefined;
    if (!mapping) return NextResponse.json({ error: "Business access denied" }, { status: 403 });
    if (!mapping.owner_customer_id) {
      return NextResponse.json({ error: "Billing customer mapping requires reconciliation" }, { status: 409 });
    }
    if (mapping.business_customer_id && mapping.business_customer_id !== mapping.owner_customer_id) {
      return NextResponse.json({ error: "Billing customer mapping is inconsistent" }, { status: 409 });
    }

    const customer = await stripe.customers.retrieve(mapping.owner_customer_id);
    if (customer.deleted) return NextResponse.json({ error: "Billing customer is unavailable" }, { status: 409 });
    if (customer.metadata.owner_user_id && customer.metadata.owner_user_id !== context.ownerUserId) {
      return NextResponse.json({ error: "Billing customer ownership requires reconciliation" }, { status: 409 });
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/dashboard/billing`,
    });
    if (!portal.url) return NextResponse.json({ error: "Stripe portal URL missing" }, { status: 502 });
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (error: unknown) {
    if (error instanceof BusinessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    safeLogger.error("stripe.portal.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Unable to open billing portal" }, { status: 500 });
  }
}

export const runtime = "nodejs";
