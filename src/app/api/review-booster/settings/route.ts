import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";
import { getBusinessFollowupSettings } from "@/modules/review-booster/services/review-booster-db.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolveBusinessIdForSessionUser(sessionUserId: string, email?: string | null): Promise<string> {
  try {
    const business = await getOrCreateBusinessForUser(sessionUserId);
    return business.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && email) {
      const business = await getOrCreateBusinessForUser(email);
      return business.id;
    }
    throw error;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const businessId = await resolveBusinessIdForSessionUser(session.user.id, session.user.email);
    const settings = await getBusinessFollowupSettings(businessId);
    if (!settings) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
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
  const googleReviewUrl = normalizeOptionalString(payload.google_review_url);

  if (!googleReviewUrl) {
    return NextResponse.json({ error: "google_review_url is required" }, { status: 400 });
  }

  try {
    const businessId = await resolveBusinessIdForSessionUser(session.user.id, session.user.email);

    await sql`
      UPDATE public.businesses
      SET
        google_review_url = ${googleReviewUrl},
        rebooking_url = ${normalizeOptionalString(payload.rebooking_url)},
        tone = ${normalizeOptionalString(payload.tone)},
        language = ${normalizeOptionalString(payload.language)},
        email_from_name = ${normalizeOptionalString(payload.email_from_name)},
        updated_at = now()
      WHERE id = ${businessId}
    `;

    const settings = await getBusinessFollowupSettings(businessId);
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
