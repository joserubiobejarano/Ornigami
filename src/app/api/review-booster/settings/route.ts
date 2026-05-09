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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

type GbpLocationSummary = {
  id: string;
  title: string | null;
  location_name: string | null;
  place_id: string | null;
  raw: unknown;
};

function extractPrimaryCategory(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const primaryCategory = record.primaryCategory as { displayName?: string } | undefined;
  if (typeof primaryCategory?.displayName === "string" && primaryCategory.displayName.trim()) {
    return primaryCategory.displayName.trim();
  }
  const primaryCategoryId = record.primaryCategoryId;
  if (typeof primaryCategoryId === "string" && primaryCategoryId.trim()) {
    return primaryCategoryId.trim();
  }
  return null;
}

function deriveGoogleReviewUrl(location: GbpLocationSummary): string | null {
  const raw = (location.raw && typeof location.raw === "object"
    ? (location.raw as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const metadata =
    raw.metadata && typeof raw.metadata === "object"
      ? (raw.metadata as Record<string, unknown>)
      : null;

  const candidates = [
    metadata?.newReviewUri,
    metadata?.new_review_uri,
    raw.newReviewUri,
    raw.new_review_uri,
    raw.reviewUrl,
    raw.review_url,
    raw.mapsUri,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (typeof location.place_id === "string" && location.place_id.trim()) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(location.place_id.trim())}`;
  }

  return null;
}

async function getGoogleProfileDataForUser(userId: string) {
  if (!isUuid(userId)) {
    return { connected: false as const, locations: [] as Array<Record<string, string | null>> };
  }

  const connectionRows = await sql`
    SELECT 1
    FROM public.gbp_connections
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  if (connectionRows.length === 0) {
    return { connected: false as const, locations: [] as Array<Record<string, string | null>> };
  }

  const locations = await sql`
    SELECT id, title, location_name, place_id, raw
    FROM public.gbp_locations
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;

  const transformed = (locations as GbpLocationSummary[]).map((location) => ({
    id: location.id,
    title: location.title ?? location.location_name ?? "Untitled location",
    review_url: deriveGoogleReviewUrl(location),
    primary_category: extractPrimaryCategory(location.raw),
  }));

  return { connected: true as const, locations: transformed };
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

    const googleProfile = await getGoogleProfileDataForUser(session.user.id);
    const autoGoogleReviewUrl =
      googleProfile.locations.find((location) => typeof location.review_url === "string" && location.review_url)?.review_url ??
      null;

    return NextResponse.json({
      ...settings,
      google_profile_connected: googleProfile.connected,
      google_profile_locations: googleProfile.locations,
      auto_google_review_url: autoGoogleReviewUrl,
      effective_google_review_url: settings.google_review_url ?? autoGoogleReviewUrl,
    });
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
  const businessName = normalizeOptionalString(payload.business_name);
  if (!businessName) {
    return NextResponse.json({ error: "business_name is required" }, { status: 400 });
  }

  try {
    const businessId = await resolveBusinessIdForSessionUser(session.user.id, session.user.email);
    const googleProfile = await getGoogleProfileDataForUser(session.user.id);
    const selectedLocationId = normalizeOptionalString(payload.selected_location_id);
    const selectedLocation =
      selectedLocationId
        ? googleProfile.locations.find((location) => location.id === selectedLocationId)
        : null;

    const autoGoogleReviewUrl =
      selectedLocation?.review_url ??
      googleProfile.locations.find((location) => typeof location.review_url === "string" && location.review_url)?.review_url ??
      null;

    const manualGoogleReviewUrl = normalizeOptionalString(payload.google_review_url);
    const googleReviewUrl = manualGoogleReviewUrl ?? autoGoogleReviewUrl;

    if (!googleReviewUrl) {
      return NextResponse.json(
        { error: "google_review_url is required. Connect Google Business Profile or add a manual URL." },
        { status: 400 }
      );
    }

    await sql`
      UPDATE public.businesses
      SET
        name = ${businessName},
        business_type = ${normalizeOptionalString(payload.business_type)},
        google_review_url = ${googleReviewUrl},
        tone = ${normalizeOptionalString(payload.tone)},
        language = ${normalizeOptionalString(payload.language)},
        rebooking_url = null,
        email_from_name = null,
        updated_at = now()
      WHERE id = ${businessId}
    `;

    const settings = await getBusinessFollowupSettings(businessId);
    const refreshedGoogleProfile = await getGoogleProfileDataForUser(session.user.id);

    return NextResponse.json({
      ...settings,
      google_profile_connected: refreshedGoogleProfile.connected,
      google_profile_locations: refreshedGoogleProfile.locations,
      auto_google_review_url: autoGoogleReviewUrl,
      effective_google_review_url: googleReviewUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
