export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { fetchAllGoogleReviews } from "@/lib/google-review-sync";
import { sql } from "@/lib/db/neon";
import { demoReviews } from "@/lib/demo-data";
import { getUserPlan } from "@/lib/plan-server";
import { canUseReviewAutomation } from "@/lib/plan";
import { requireActiveAgentAccess } from "@/lib/api-security";
import { safeLogger } from "@/lib/safe-logger";
import { parseGoogleStarRating } from "@/lib/google-review-rating";
import { sendNewReviewAlert } from "@/lib/review-alerts";
import { getBusinessForUser } from "@/lib/db/businesses";

export async function POST(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return NextResponse.json({ imported: demoReviews.length });
  }

  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(user.id);
  if (!canUseReviewAutomation(plan)) {
    return NextResponse.json({ error: "Review sync requires a paid plan" }, { status: 403 });
  }
  const userEmail = "email" in user ? user.email : null;
  await requireActiveAgentAccess(user.id, userEmail, "review_replies");
  const business = await getBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });

  const { locationName } = await req.json();
  if (!locationName) return NextResponse.json({ error: "locationName required" }, { status: 400 });

  try {
    const reviews = await fetchAllGoogleReviews(user.id, locationName);
    const locRows = await sql`
      SELECT id FROM public.gbp_locations
      WHERE user_id = ${user.id} AND location_name = ${locationName}
      LIMIT 1
    `;
    if (!locRows.length) return NextResponse.json({ error: "No locations were found for this account." }, { status: 404 });

    const rows = reviews.map((rv) => ({
      user_id: user.id,
      business_id: business.id,
      location_name: locationName as string,
      google_review_id: rv.reviewId as string,
      reviewer_name: (rv.reviewer as { displayName?: string } | undefined)?.displayName ?? null,
      star_rating: parseGoogleStarRating(rv.starRating),
      comment: (rv.comment as string) ?? null,
      review_update_time: rv.updateTime ? new Date(rv.updateTime as string).toISOString() : null,
      language_code: (rv.reviewReply as { languageCode?: string } | undefined)?.languageCode ?? null,
      reply_comment: (rv.reviewReply as { comment?: string } | undefined)?.comment ?? null,
      reply_update_time: (rv.reviewReply as { updateTime?: string } | undefined)?.updateTime
        ? new Date((rv.reviewReply as { updateTime: string }).updateTime).toISOString()
        : null,
      status: (rv.reviewReply as { comment?: string } | undefined)?.comment ? "replied" : "new",
      updated_at: new Date().toISOString(),
    }));

    const newReviews: Array<{ reviewerName: string | null; starRating: number | null; comment: string | null }> = [];
    for (const row of rows) {
      const inserted = await sql`
        INSERT INTO public.reviews (
          user_id, business_id, location_name, google_review_id, reviewer_name, star_rating, comment,
          review_update_time, language_code, reply_comment, reply_update_time, status, updated_at
        ) VALUES (
          ${row.user_id}, ${row.business_id}, ${row.location_name}, ${row.google_review_id}, ${row.reviewer_name}, ${row.star_rating}, ${row.comment},
          ${row.review_update_time}, ${row.language_code}, ${row.reply_comment}, ${row.reply_update_time}, ${row.status}, ${row.updated_at}
        )
        ON CONFLICT (business_id, google_review_id) DO NOTHING
        RETURNING id
      `;
      if (inserted.length > 0) {
        newReviews.push({ reviewerName: row.reviewer_name, starRating: row.star_rating, comment: row.comment });
        continue;
      }
      await sql`
        UPDATE public.reviews
        SET location_name = ${row.location_name}, reviewer_name = ${row.reviewer_name}, star_rating = ${row.star_rating},
            comment = ${row.comment}, review_update_time = ${row.review_update_time}, language_code = ${row.language_code},
            reply_comment = ${row.reply_comment}, reply_update_time = ${row.reply_update_time}, status = ${row.status}, updated_at = ${row.updated_at}
        WHERE business_id = ${row.business_id} AND google_review_id = ${row.google_review_id}
      `;
    }

    if (newReviews.length > 0 && userEmail) {
      const businessRows = await sql`
        SELECT b.name AS business_name
        FROM public.businesses b
        WHERE b.owner_user_id = ${user.id}
        ORDER BY b.created_at ASC
        LIMIT 1
      `;
      const businessName = (businessRows[0] as { business_name?: string } | undefined)?.business_name || "your business";
      await sendNewReviewAlert({ recipientEmail: userEmail, businessName, locationName, reviews: newReviews });
    }

    return NextResponse.json({ imported: rows.length, new_reviews: newReviews.length });
  } catch (e: unknown) {
    safeLogger.error("google.reviews.sync.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Review sync failed. Please try again." }, { status: 500 });
  }
}
