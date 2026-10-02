export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { resolveUser } from "@/lib/user-from-req";
import { getBusinessReplyDefaults } from "@/lib/reply-profile-defaults";
import { BusinessGoogleError, getSelectedGoogleLocation, resolveRequestedBusinessId } from "@/lib/google-business";
import { sql } from "@/lib/db/neon";
import { MAX_REVIEW_REPLY_BATCH, safeProcessingError } from "@/lib/review-reply-policy";
import {
  type ReviewRowForReply,
} from "@/lib/review-reply-server";
import { processReviewDraft } from "@/lib/review-draft-processing";
import { safeLogger } from "@/lib/safe-logger";

const BodySchema = z.object({ businessId: z.string().optional(), locationName: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") {
    return NextResponse.json({ processed: 0, drafted: 0, skipped: 0, skippedNoComment: 0, errors: [] });
  }
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "locationName is required" }, { status: 400 });
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), parsed.data.businessId);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });

  try {
    const email = "email" in user ? user.email : null;
    const context = await requireActiveAgentBusinessContext(user.id, email, "review_replies", requested.businessId);
    const selected = await getSelectedGoogleLocation(context, parsed.data.locationName);
    const profile = await getBusinessReplyDefaults(user.id, context.businessId);
    const rows = await sql`
      SELECT r.id, r.google_review_id, r.comment, r.star_rating
      FROM public.reviews r
      WHERE r.business_id = ${context.businessId} AND r.location_name = ${selected.location_name}
        AND (r.status IS NULL OR lower(r.status) <> 'replied') AND r.comment IS NOT NULL
        AND NULLIF(BTRIM(r.comment), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.review_replies rr
          WHERE rr.review_id = r.id AND rr.business_id = r.business_id
            AND rr.posted IS FALSE
        )
      ORDER BY review_update_time DESC NULLS LAST
      LIMIT ${MAX_REVIEW_REPLY_BATCH}
    ` as ReviewRowForReply[];
    let drafted = 0;
    let autoHandled = 0;
    let skipped = 0;
    let skippedNoComment = 0;
    let safetyLimitReached = false;
    const errors: string[] = [];
    for (const row of rows) {
      if (!(row.comment ?? "").trim()) { skipped += 1; skippedNoComment += 1; continue; }
      const result = await processReviewDraft({
        actorUserId: user.id, businessId: context.businessId, locationName: selected.location_name,
        row, profile, source: "interactive_batch",
      });
      if (result.outcome === "limit") { safetyLimitReached = true; break; }
      if (result.outcome === "skipped") { skipped += 1; continue; }
      if (result.outcome === "failed") {
        if (result.draft) drafted += 1;
        safeLogger.warn("reviews.process_pending.failed", { reviewId: row.google_review_id, stage: result.stage });
        const errorKind = result.stage === "post" ? "post" : result.stage === "save" ? "draft" : "generate";
        errors.push(`${row.google_review_id}: ${safeProcessingError(errorKind)}`);
        continue;
      }
      if (result.posted) autoHandled += 1;
      else drafted += 1;
    }
    return NextResponse.json({
      processed: rows.length, posted: 0, drafted, autoHandled, skipped, skippedNoComment,
      errors: safetyLimitReached ? [...errors, "Reply drafting is temporarily paused after reaching the current safety threshold."] : errors,
    });
  } catch (error) {
    if (error instanceof BusinessGoogleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return safeApiErrorResponse(error, "reviews.process_pending");
  }
}
