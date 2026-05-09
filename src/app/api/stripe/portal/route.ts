import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { getServerAppUrl } from "@/lib/env";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";

export async function POST() {
  try {
    const appUrl = getServerAppUrl();

    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.redirect(new URL("/login", appUrl));
    }
    const userEmail = session.user.email;

    let business;
    try {
      business = await getOrCreateBusinessForUser(session.user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Could not resolve user in public.users") && session.user.email) {
        business = await getOrCreateBusinessForUser(session.user.email);
      } else {
        throw error;
      }
    }

    const businessRows = await sql`
      SELECT stripe_customer_id
      FROM public.businesses
      WHERE id = ${business.id}
      LIMIT 1
    `;
    const existingBusinessCustomerId = (businessRows[0] as { stripe_customer_id: string | null } | undefined)
      ?.stripe_customer_id;

    const customer =
      existingBusinessCustomerId
        ? await stripe.customers.retrieve(existingBusinessCustomerId).catch(async () => {
            const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
            return customers.data[0] ?? (await stripe.customers.create({ email: userEmail }));
          })
        : (await stripe.customers.list({ email: userEmail, limit: 1 })).data[0] ??
          (await stripe.customers.create({ email: userEmail }));

    if (!("id" in customer)) {
      return NextResponse.json({ error: "Stripe customer resolution failed" }, { status: 500 });
    }

    await sql`
      UPDATE public.businesses
      SET stripe_customer_id = ${customer.id}
      WHERE id = ${business.id}
    `;

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/dashboard/billing`,
    });

    if (!portal.url) return NextResponse.json({ error: "Stripe portal URL missing" }, { status: 500 });

    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
