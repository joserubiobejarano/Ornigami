export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { demoReviews } from "@/lib/demo-data";
import { resolveUser } from "@/lib/user-from-req";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { getSelectedGoogleLocation, resolveRequestedBusinessId, BusinessGoogleError } from "@/lib/google-business";
import { fetchAllGoogleReviews, GoogleReviewsSyncError } from "@/lib/google-review-sync";
import { persistGoogleReviews } from "@/lib/google-review-persistence";
import { sendNewReviewAlert } from "@/lib/review-alerts";
import { randomUUID } from "node:crypto";
import { beginAccountLifecycleOperation, finishAccountLifecycleOperation } from "@/lib/account-lifecycle";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") {
    return NextResponse.json({ imported: demoReviews.length });
  }

  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = "email" in user ? user.email : null;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = body as { businessId?: unknown; locationName?: unknown };
  if (input.businessId !== undefined && (typeof input.businessId !== "string" || !input.businessId.trim())) {
    return NextResponse.json({ error: "businessId must be a non-empty string" }, { status: 400 });
  }
  if (input.locationName !== undefined && (typeof input.locationName !== "string" || !input.locationName.trim())) {
    return NextResponse.json({ error: "locationName must be a non-empty string" }, { status: 400 });
  }
  const requestedBusiness = resolveRequestedBusinessId(
    req.nextUrl.searchParams.get("businessId"), input.businessId
  );
  if (!requestedBusiness.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });

  try {
    const context = await requireActiveAgentBusinessContext(
      user.id, email, "review_replies", requestedBusiness.businessId
    );
    const location = await getSelectedGoogleLocation(context, input.locationName as string | undefined);
    const lifecycle = await beginAccountLifecycleOperation({
      userId: context.integrationOwnerUserId, actorUserId: user.id, businessId: context.businessId,
      kind: "google_review_sync", idempotencyKey: randomUUID(), leaseMs: 90000,
    });
    if (lifecycle.result !== "claimed" || !lifecycle.token) return NextResponse.json({ error: "Account lifecycle prevents Google sync" }, { status: 409 });
    let result: Awaited<ReturnType<typeof persistGoogleReviews>>;
    try {
      const reviews = await fetchAllGoogleReviews(
        context.integrationOwnerUserId, location.location_name, undefined, location.connection_version,
        { actorUserId: user.id, businessId: context.businessId }
      );
      result = await persistGoogleReviews(context.integrationOwnerUserId, context.businessId, location.location_name, reviews);
    } catch (error) {
      await finishAccountLifecycleOperation(lifecycle.token, "uncertain").catch(() => false);
      throw error;
    }
    if (!await finishAccountLifecycleOperation(lifecycle.token, "done")) throw new Error("Google sync lifecycle lease expired");

    if (result.newReviews.length > 0 && email) {
      await sendNewReviewAlert({
        ownerUserId: context.integrationOwnerUserId,
        actorUserId: user.id,
        businessId: context.businessId,
        recipientEmail: email,
        businessName: context.business.name || "your business",
        locationName: location.location_name,
        reviews: result.newReviews,
      });
    }
    return NextResponse.json({ imported: result.synced, new_reviews: result.newReviews.length });
  } catch (error) {
    if (error instanceof Error && error.name === "GoogleConnectionVersionError") {
      return NextResponse.json({ error: "Google connection changed since location selection. Retry the sync." }, { status: 409 });
    }
    if (error instanceof BusinessGoogleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof GoogleReviewsSyncError) {
      const retryAfter = error.retryAfter && /^\d{1,5}$/.test(error.retryAfter)
        && Number(error.retryAfter) <= 86400 ? error.retryAfter : null;
      return NextResponse.json({ error: "Google review sync is temporarily unavailable. Please retry." }, {
        status: error.status,
        headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      });
    }
    return safeApiErrorResponse(error, "google.reviews.sync.failed");
  }
}
