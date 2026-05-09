import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { createFollowupVisit } from "@/modules/review-booster/services/review-booster-db.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidDateInput(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

async function resolveBusinessForSessionUser(userId: string, email?: string | null) {
  try {
    return await getOrCreateBusinessForUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && email) {
      return getOrCreateBusinessForUser(email);
    }
    throw error;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const customerEmail = normalizeOptionalString(payload.customer_email);
  const customerPhone = normalizeOptionalString(payload.customer_phone);
  const visitedAt = payload.visited_at;

  if (!isValidDateInput(visitedAt)) {
    return NextResponse.json({ error: "visited_at is required and must be a valid date" }, { status: 400 });
  }

  if (!customerEmail && !customerPhone) {
    return NextResponse.json({ error: "Either customer_email or customer_phone is required" }, { status: 400 });
  }

  try {
    const business = await resolveBusinessForSessionUser(session.user.id, session.user.email);
    const visit = await createFollowupVisit({
      businessId: business.id,
      customerName: normalizeOptionalString(payload.customer_name),
      customerEmail,
      customerPhone,
      serviceName: normalizeOptionalString(payload.service_name),
      visitedAt,
      source: "manual"
    });

    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
