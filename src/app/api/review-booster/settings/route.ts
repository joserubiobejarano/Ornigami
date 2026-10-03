import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { assertBusinessOwner } from "@/lib/business-context";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import { sql } from "@/lib/db/neon";
import {
  getSelectedGoogleLocation,
  listBusinessGoogleLocations,
} from "@/lib/google-business";
import { getBusinessFollowupSettings } from "@/modules/review-booster/services/review-booster-db.service";
import {
  extractSafeGoogleReviewUrl,
  isSafeBookingUrl,
  isSafeGoogleReviewUrl,
  isSafeSenderName,
  normalizeOptionalSetting,
} from "@/modules/review-booster/services/settings-link-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function objectBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

function statusOf(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

async function readGoogleSettings(context: Awaited<ReturnType<typeof requireActiveAgentBusinessContext>>) {
  try {
    const visible = await listBusinessGoogleLocations(context);
    let selected = null;
    try {
      selected = await getSelectedGoogleLocation(context);
    } catch (error) {
      if (statusOf(error) !== 409) throw error;
    }
    const selectedReviewUrl = selected
      ? extractSafeGoogleReviewUrl(selected.raw, selected.place_id)
      : null;
    return {
      connected: visible.length > 0,
      locations: visible.map((location) => ({
        id: location.id,
        title: location.title,
        review_url: location.selected ? selectedReviewUrl : null,
        selected: location.selected,
      })),
      selectedLocationId: selected?.id ?? null,
      autoReviewUrl: selectedReviewUrl,
    };
  } catch (error) {
    // Manual review links remain usable while optional Google selection storage is unavailable.
    if (statusOf(error) !== 503 && statusOf(error) !== 409) throw error;
    return { connected: false, locations: [], selectedLocationId: null, autoReviewUrl: null };
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const businessId = new URL(request.url).searchParams.get("businessId");
  try {
    const context = await requireActiveAgentBusinessContext(session.user.id, session.user.email, "review_booster", businessId);
    const [settings, google] = await Promise.all([
      getBusinessFollowupSettings(context.businessId, session.user.id),
      readGoogleSettings(context),
    ]);
    if (!settings) return NextResponse.json({ error: "Business not found" }, { status: 404 });
    return NextResponse.json({
      ...settings,
      businessId: context.businessId,
      business_role: context.role,
      can_manage_settings: context.role === "owner",
      google_profile_connected: google.connected,
      google_profile_locations: google.locations,
      selected_location_id: google.selectedLocationId,
      auto_google_review_url: google.autoReviewUrl,
      effective_google_review_url: isSafeGoogleReviewUrl(settings.google_review_url) ? settings.google_review_url : google.autoReviewUrl,
      rebooking_url: settings.rebooking_url,
      email_from_name: settings.email_from_name,
      rebooking_url_valid: settings.rebooking_url === null || isSafeBookingUrl(settings.rebooking_url),
      google_review_url_valid: settings.google_review_url === null || isSafeGoogleReviewUrl(settings.google_review_url),
    });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.settings.get");
  }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: Record<string, unknown>;
  try {
    const parsed = objectBody(await request.json());
    if (!parsed) return NextResponse.json({ error: "Invalid settings body" }, { status: 400 });
    payload = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof payload.business_name !== "string" || !payload.business_name.trim() || payload.business_name.trim().length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(payload.business_name)) {
    return NextResponse.json({ error: "business_name is required" }, { status: 400 });
  }
  for (const key of ["business_type", "tone", "language", "google_review_url", "rebooking_url", "email_from_name"]) {
    if (Object.hasOwn(payload, key) && payload[key] !== null && typeof payload[key] !== "string") {
      return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 });
    }
  }
  if (Object.hasOwn(payload, "businessId") && typeof payload.businessId !== "string") {
    return NextResponse.json({ error: "businessId must be a string" }, { status: 400 });
  }
  const queryBusinessId = new URL(request.url).searchParams.get("businessId");
  const bodyBusinessId = Object.hasOwn(payload, "businessId") ? payload.businessId as string : null;
  if (queryBusinessId && bodyBusinessId && queryBusinessId !== bodyBusinessId) {
    return NextResponse.json({ error: "Conflicting business selection." }, { status: 400 });
  }
  const requestedBusinessId = bodyBusinessId ?? queryBusinessId;
  for (const [key, maximum] of [["business_type", 120], ["tone", 120], ["language", 20]] as const) {
    if (typeof payload[key] === "string" && (payload[key] as string).length > maximum) {
      return NextResponse.json({ error: `${key} is too long` }, { status: 400 });
    }
  }

  const rebooking = Object.hasOwn(payload, "rebooking_url")
    ? normalizeOptionalSetting(payload.rebooking_url)
    : null;
  if (rebooking && !rebooking.valid) return NextResponse.json({ error: "Invalid rebooking_url" }, { status: 400 });
  if (rebooking?.value !== null && rebooking && !isSafeBookingUrl(rebooking.value)) {
    return NextResponse.json({ error: "rebooking_url must be a safe public HTTPS URL" }, { status: 400 });
  }

  const senderName = Object.hasOwn(payload, "email_from_name")
    ? normalizeOptionalSetting(payload.email_from_name)
    : null;
  if (senderName && !senderName.valid) return NextResponse.json({ error: "Invalid email_from_name" }, { status: 400 });
  if (senderName?.value !== null && senderName && !isSafeSenderName(senderName.value)) {
    return NextResponse.json({ error: "email_from_name must be at most 120 characters and contain no control characters" }, { status: 400 });
  }

  try {
    const context = await requireActiveAgentBusinessContext(session.user.id, session.user.email, "review_booster", requestedBusinessId);
    assertBusinessOwner(context);
    const selectedGoogle = await readGoogleSettings(context);
    if (Object.hasOwn(payload, "selected_location_id")) {
      const requestedSelection = payload.selected_location_id;
      if ((requestedSelection !== null && typeof requestedSelection !== "string") ||
          (requestedSelection !== null && requestedSelection !== selectedGoogle.selectedLocationId) ||
          (requestedSelection === null && selectedGoogle.selectedLocationId !== null)) {
        return NextResponse.json({ error: "Use the Google location selection control to change the selected location." }, { status: 409 });
      }
    }
    const current = await getBusinessFollowupSettings(context.businessId, session.user.id);
    if (!current) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    let googleReviewUrl = current.google_review_url;
    if (Object.hasOwn(payload, "google_review_url")) {
      const manual = normalizeOptionalSetting(payload.google_review_url);
      if (!manual.valid) return NextResponse.json({ error: "Invalid google_review_url" }, { status: 400 });
      if (manual.value !== null && !isSafeGoogleReviewUrl(manual.value)) {
        return NextResponse.json({ error: "google_review_url must be a direct HTTPS Google review destination" }, { status: 400 });
      }
      googleReviewUrl = manual.value ?? selectedGoogle.autoReviewUrl;
    }
    const businessType = Object.hasOwn(payload, "business_type")
      ? normalizeOptionalSetting(payload.business_type)
      : { valid: true as const, value: current.business_type };
    const tone = Object.hasOwn(payload, "tone") ? normalizeOptionalSetting(payload.tone) : { valid: true as const, value: current.tone };
    const language = Object.hasOwn(payload, "language") ? normalizeOptionalSetting(payload.language) : { valid: true as const, value: current.language };
    if (!businessType.valid || !tone.valid || !language.valid) return NextResponse.json({ error: "Invalid settings value" }, { status: 400 });

    const updated = await sql`
      UPDATE public.businesses
      SET name = ${payload.business_name.trim()},
        business_type = CASE WHEN ${Object.hasOwn(payload, "business_type")} THEN ${businessType.value} ELSE business_type END,
        google_review_url = CASE WHEN ${Object.hasOwn(payload, "google_review_url")} THEN ${googleReviewUrl} ELSE google_review_url END,
        tone = CASE WHEN ${Object.hasOwn(payload, "tone")} THEN ${tone.value} ELSE tone END,
        language = CASE WHEN ${Object.hasOwn(payload, "language")} THEN ${language.value} ELSE language END,
        rebooking_url = CASE WHEN ${Boolean(rebooking)} THEN ${rebooking?.value ?? null} ELSE rebooking_url END,
        email_from_name = CASE WHEN ${Boolean(senderName)} THEN ${senderName?.value ?? null} ELSE email_from_name END,
        updated_at = now()
      WHERE id = ${context.businessId} AND owner_user_id = ${session.user.id}
      RETURNING id
    `;
    if (!updated.length) return NextResponse.json({ error: "Business access denied." }, { status: 403 });

    const [settings, refreshedGoogle] = await Promise.all([
      getBusinessFollowupSettings(context.businessId, session.user.id),
      readGoogleSettings(context),
    ]);
    return NextResponse.json({
      ...settings,
      businessId: context.businessId,
      business_role: context.role,
      can_manage_settings: true,
      google_profile_connected: refreshedGoogle.connected,
      google_profile_locations: refreshedGoogle.locations,
      selected_location_id: refreshedGoogle.selectedLocationId,
      auto_google_review_url: refreshedGoogle.autoReviewUrl,
      effective_google_review_url: isSafeGoogleReviewUrl(settings?.google_review_url) ? settings.google_review_url : refreshedGoogle.autoReviewUrl,
      rebooking_url_valid: settings?.rebooking_url === null || isSafeBookingUrl(settings?.rebooking_url),
      google_review_url_valid: settings?.google_review_url === null || isSafeGoogleReviewUrl(settings?.google_review_url),
    });
  } catch (error) {
    return safeApiErrorResponse(error, "review_booster.settings.post");
  }
}
