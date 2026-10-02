export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchAllGoogleReviews } from "@/lib/google-review-sync";
import { persistGoogleReviews } from "@/lib/google-review-persistence";
import { sql } from "@/lib/db/neon";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { generateReplyForReviewRow, saveReplyDraft, type ReviewRowForReply } from "@/lib/review-reply-server";
import { safeLogger } from "@/lib/safe-logger";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { sendNewReviewAlert } from "@/lib/review-alerts";
import { finishCronRun, startCronRun } from "@/lib/cron-health";
import { checkReviewReplyUsage, incrementReviewReplyUsage } from "@/lib/usage";

type LocationRow = { business_id: string; user_id: string; business_name: string; location_name: string };
type NewReview = { reviewerName: string | null; starRating: number | null; comment: string | null };

async function syncLocation(userId: string, businessId: string, locationName: string): Promise<{ synced: number; newReviews: NewReview[] }> {
  const reviews = await fetchAllGoogleReviews(userId, locationName);
  return persistGoogleReviews(userId, businessId, locationName, reviews);
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
    const usage = await checkReviewReplyUsage(userId, businessId);
    if (!usage.allowed) break;
    const reply = await generateReplyForReviewRow(row, profile);
    if (!reply.trim()) continue;
    await incrementReviewReplyUsage(userId);
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
      SELECT DISTINCT b.id AS business_id, b.owner_user_id AS user_id, b.name AS business_name, l.location_name
      FROM public.business_google_locations selected
      INNER JOIN public.businesses b ON b.id = selected.business_id
      INNER JOIN public.gbp_locations l ON l.id = selected.location_id
        AND l.user_id = b.owner_user_id AND l.connected IS TRUE
      INNER JOIN public.gbp_connections gc ON gc.user_id = b.owner_user_id
        AND l.connection_version = gc.connection_version
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
            SELECT u.email
            FROM public.users u
            WHERE u.id = ${location.user_id}
            LIMIT 1
          `;
          const owner = ownerRows[0] as { email?: string } | undefined;
          if (owner?.email) {
            await sendNewReviewAlert({ recipientEmail: owner.email, businessName: location.business_name || "your business", locationName: location.location_name, reviews: result.newReviews });
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
