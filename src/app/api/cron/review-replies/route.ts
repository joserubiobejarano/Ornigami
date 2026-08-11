export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllGoogleReviews } from "@/lib/google-review-sync";
import { sql } from "@/lib/db/neon";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { generateReplyForReviewRow, saveReplyDraft, type ReviewRowForReply } from "@/lib/review-reply-server";
import { safeLogger } from "@/lib/safe-logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendNewReviewAlert } from "@/lib/review-alerts";
import { finishCronRun, startCronRun } from "@/lib/cron-health";
import { parseGoogleStarRating } from "@/lib/google-review-rating";

type LocationRow = { business_id: string; user_id: string; location_name: string };
type NewReview = { reviewerName: string | null; starRating: number | null; comment: string | null };

async function syncLocation(userId: string, businessId: string, locationName: string): Promise<{ synced: number; newReviews: NewReview[] }> {
  const reviews = await fetchAllGoogleReviews(userId, locationName);
  const newReviews: NewReview[] = [];

  for (const review of reviews) {
    if (!review.reviewId) continue;
    const rating = parseGoogleStarRating(review.starRating);
    const reply = review.reviewReply;
    const existingRows = await sql`
      SELECT 1 FROM public.reviews
      WHERE business_id = ${businessId} AND google_review_id = ${review.reviewId}
      LIMIT 1
    `;
    await sql`
      INSERT INTO public.reviews (
        user_id, business_id, location_name, google_review_id, reviewer_name, star_rating, comment,
        review_update_time, language_code, reply_comment, reply_update_time, status, updated_at
      ) VALUES (
        ${userId}, ${businessId}, ${locationName}, ${review.reviewId}, ${review.reviewer?.displayName ?? null}, ${rating},
        ${review.comment ?? null}, ${review.updateTime ? new Date(review.updateTime).toISOString() : null},
        ${reply?.languageCode ?? null}, ${reply?.comment ?? null},
        ${reply?.updateTime ? new Date(reply.updateTime).toISOString() : null},
        ${reply?.comment ? "replied" : "new"}, now()
      )
      ON CONFLICT (business_id, google_review_id) DO UPDATE SET
        location_name = EXCLUDED.location_name, reviewer_name = EXCLUDED.reviewer_name,
        star_rating = EXCLUDED.star_rating, comment = EXCLUDED.comment,
        review_update_time = EXCLUDED.review_update_time, language_code = EXCLUDED.language_code,
        reply_comment = EXCLUDED.reply_comment, reply_update_time = EXCLUDED.reply_update_time,
        status = EXCLUDED.status, updated_at = now()
    `;
    if (existingRows.length === 0) {
      newReviews.push({ reviewerName: review.reviewer?.displayName ?? null, starRating: rating, comment: review.comment ?? null });
    }
  }
  return { synced: reviews.length, newReviews };
}

async function draftPending(userId: string, businessId: string, locationName: string): Promise<number> {
  const profile = await getProfileReplyDefaults(userId);
  const rows = (await sql`
    SELECT id, google_review_id, comment, star_rating
    FROM public.reviews
    WHERE business_id = ${businessId} AND location_name = ${locationName}
      AND (status IS NULL OR lower(status) <> 'replied') AND comment IS NOT NULL
    ORDER BY review_update_time DESC NULLS LAST
    LIMIT 40
  `) as ReviewRowForReply[];
  let drafted = 0;
  for (const row of rows) {
    const reply = await generateReplyForReviewRow(row, profile);
    if (!reply.trim()) continue;
    const result = await saveReplyDraft(businessId, row.google_review_id, reply);
    if (result.ok) drafted += 1;
  }
  return drafted;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const runId = await startCronRun("review_replies");
  try {
    const locations = (await sql`
      SELECT DISTINCT b.id AS business_id, l.user_id, l.location_name
      FROM public.gbp_locations l
      INNER JOIN public.businesses b ON b.owner_user_id = l.user_id
      INNER JOIN public.business_agents ba ON ba.business_id = b.id
      WHERE ba.agent_id = 'review_replies' AND lower(ba.status) IN ('active', 'trialing')
    `) as LocationRow[];
    let synced = 0;
    let drafted = 0;
    let failed = 0;
    for (const location of locations) {
      try {
        const result = await syncLocation(location.user_id, location.business_id, location.location_name);
        synced += result.synced;
        if (result.newReviews.length > 0) {
          const ownerRows = await sql`
            SELECT u.email, b.name AS business_name
            FROM public.users u INNER JOIN public.businesses b ON b.owner_user_id = u.id
            WHERE u.id = ${location.user_id}
            LIMIT 1
          `;
          const owner = ownerRows[0] as { email?: string; business_name?: string } | undefined;
          if (owner?.email) {
            await sendNewReviewAlert({ recipientEmail: owner.email, businessName: owner.business_name || "your business", locationName: location.location_name, reviews: result.newReviews });
          }
        }
        drafted += await draftPending(location.user_id, location.business_id, location.location_name);
      } catch (error) {
        failed += 1;
        safeLogger.error("cron.review_replies.location_failed", { userId: location.user_id, locationName: location.location_name, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    await finishCronRun({ runId, status: "succeeded", processedCount: locations.length, failedCount: failed });
    return NextResponse.json({ ok: true, locations_scanned: locations.length, reviews_synced: synced, drafts_created: drafted, failed });
  } catch (error) {
    await finishCronRun({ runId, status: "failed", processedCount: 0, failedCount: 1, errorMessage: error instanceof Error ? error.message : "unknown" });
    safeLogger.error("cron.review_replies.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
