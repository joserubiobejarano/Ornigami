import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentAccess, safeApiErrorResponse } from "@/lib/api-security";
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  const customerEmail = normalizeOptionalString(payload.customer_email)?.toLowerCase();
  const customerPhone = normalizeOptionalString(payload.customer_phone);
  const visitedAt = payload.visited_at;
  const customerName = normalizeOptionalString(payload.customer_name);
  const serviceName = normalizeOptionalString(payload.service_name);

  if (!isValidDateInput(visitedAt)) {
    return NextResponse.json({ error: "visited_at is required and must be a valid date" }, { status: 400 });
  }

  if (!customerEmail && !customerPhone) {
    return NextResponse.json({ error: "Either customer_email or customer_phone is required" }, { status: 400 });
  }
  if (customerEmail && customerEmail.length > 254) {
    return NextResponse.json({ error: "customer_email is too long" }, { status: 400 });
  }
  if (customerEmail && !isValidEmail(customerEmail)) {
    return NextResponse.json({ error: "customer_email must be valid" }, { status: 400 });
  }
  if (customerName && customerName.length > 120) {
    return NextResponse.json({ error: "customer_name is too long" }, { status: 400 });
  }
  if (serviceName && serviceName.length > 120) {
    return NextResponse.json({ error: "service_name is too long" }, { status: 400 });
  }

  try {
    const business = await requireActiveAgentAccess(session.user.id, session.user.email, "review_booster");
    const visit = await createFollowupVisit({
      businessId: business.id,
      customerName,
      customerEmail,
      customerPhone,
      serviceName,
      visitedAt,
      source: "manual"
    });

    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.visits.post");
  }
}
