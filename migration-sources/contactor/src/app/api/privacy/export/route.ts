import { NextResponse } from "next/server";

import { getOwnerDashboardSession } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { businesses, conversations, formSubmissions, leads, messages } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getOwnerDashboardSession();
  if (!session || session.role !== "owner" || !session.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = session.businessId;
  const [business, leadRows, conversationRows, messageRows, submissionRows] = await Promise.all([
    db.select().from(businesses).where(eq(businesses.id, businessId)),
    db.select().from(leads).where(eq(leads.businessId, businessId)),
    db.select().from(conversations).where(eq(conversations.businessId, businessId)),
    db.select().from(messages).where(eq(messages.businessId, businessId)),
    db.select().from(formSubmissions).where(eq(formSubmissions.businessId, businessId)),
  ]);
  return NextResponse.json({ business, leads: leadRows, conversations: conversationRows, messages: messageRows, formSubmissions: submissionRows }, { headers: { "Cache-Control": "no-store" } });
}
