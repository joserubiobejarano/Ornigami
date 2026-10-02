export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { resolveUser } from "@/lib/user-from-req";
import { postReplyToGoogleAndPersist } from "@/lib/review-reply-server";
import { BusinessGoogleError, getSelectedGoogleLocation, resolveRequestedBusinessId } from "@/lib/google-business";
import { getReplyDraft } from "@/lib/review-draft-policy";
import { sql } from "@/lib/db/neon";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") {
    return NextResponse.json({ ok: true });
  }

  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const input = body as {
    businessId?: unknown;
    reviewId?: unknown;
    locationName?: unknown;
    reply?: unknown;
    intent?: unknown;
    expectedVersion?: unknown;
  };
  if (input.businessId !== undefined && (typeof input.businessId !== "string" || !input.businessId.trim())) {
    return NextResponse.json({ error: "businessId must be a non-empty string" }, { status: 400 });
  }
  if (typeof input.reviewId !== "string" || !input.reviewId.trim()
    || typeof input.locationName !== "string" || !input.locationName.trim()
    || typeof input.reply !== "string" || !input.reply.trim()) {
    return NextResponse.json({ error: "reviewId, locationName, and reply are required" }, { status: 400 });
  }
  if (input.intent !== "manual" || !Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) {
    return NextResponse.json({ error: "Manual approval with expectedVersion is required" }, { status: 400 });
  }
  if (Buffer.byteLength(input.reply.trim(), "utf8") > 4096) {
    return NextResponse.json({ error: "reply must be at most 4096 UTF-8 bytes" }, { status: 400 });
  }
  const requestedBusiness = resolveRequestedBusinessId(
    req.nextUrl.searchParams.get("businessId"), input.businessId
  );
  if (!requestedBusiness.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });

  try {
    const email = "email" in user ? user.email : null;
    const context = await requireActiveAgentBusinessContext(
      user.id, email, "review_replies", requestedBusiness.businessId
    );
    const reviewRows = await sql`
      SELECT location_name FROM public.reviews
      WHERE business_id = ${context.businessId} AND google_review_id = ${input.reviewId.trim()}
      LIMIT 1
    ` as { location_name: string }[];
    const reviewLocation = reviewRows[0]?.location_name;
    if (!reviewLocation) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    if (reviewLocation !== input.locationName.trim()) return NextResponse.json({ error: "Google location access denied." }, { status: 403 });
    await getSelectedGoogleLocation(context, reviewLocation);
    const result = await postReplyToGoogleAndPersist(
      user.id, context.businessId, input.reviewId.trim(), input.locationName.trim(), input.reply.trim(), {
        intent: "manual", expectedVersion: Number(input.expectedVersion), expectedText: input.reply.trim(),
      }
    );
    if (!result.ok) {
      const currentDraft = await getReplyDraft(context.businessId, input.reviewId.trim()).catch(() => null);
      return NextResponse.json({ error: result.error, currentDraft }, { status: result.status ?? 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BusinessGoogleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeApiErrorResponse(error, "google.replies.post");
  }
}
