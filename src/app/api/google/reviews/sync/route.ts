export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";

import { googleFetch } from "@/lib/google";

import { sql } from "@/lib/db/neon";
import { demoReviews } from "@/lib/demo-data";
import { getUserPlan } from "@/lib/plan-server";
import { canUseReviewAutomation } from "@/lib/plan";
import { requireActiveAgentAccess } from "@/lib/api-security";
import { safeLogger } from "@/lib/safe-logger";

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

  const { locationName } = await req.json();

  if (!locationName) {
    return NextResponse.json({ error: "locationName required" }, { status: 400 });
  }

  try {
    const url = `https://mybusiness.googleapis.com/v4/${encodeURIComponent(locationName)}/reviews?pageSize=100`;

    const r = await googleFetch(user.id, url);

    if (!r.ok) {
      return NextResponse.json({ error: "Google reviews sync failed" }, { status: 502 });
    }

    const json = await r.json();

    const locRows = await sql`
      SELECT id FROM public.gbp_locations
      WHERE user_id = ${user.id}
        AND location_name = ${locationName}
      LIMIT 1
    `;

    if (!locRows.length) {
      return NextResponse.json({ error: "No locations were found for this account." }, { status: 404 });
    }

    const rows = (json.reviews ?? []).map((rv: Record<string, unknown>) => ({
      user_id: user.id,
      location_name: locationName as string,
      google_review_id: rv.reviewId as string,
      reviewer_name: (rv.reviewer as { displayName?: string } | undefined)?.displayName ?? null,
      star_rating: rv.starRating ? Number(rv.starRating) : null,
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

    for (const row of rows) {
      await sql`
        INSERT INTO public.reviews (
          user_id, location_name, google_review_id, reviewer_name, star_rating, comment,
          review_update_time, language_code, reply_comment, reply_update_time, status, updated_at
        )
        VALUES (
          ${row.user_id},
          ${row.location_name},
          ${row.google_review_id},
          ${row.reviewer_name},
          ${row.star_rating},
          ${row.comment},
          ${row.review_update_time},
          ${row.language_code},
          ${row.reply_comment},
          ${row.reply_update_time},
          ${row.status},
          ${row.updated_at}
        )
        ON CONFLICT (user_id, google_review_id) DO UPDATE SET
          location_name = EXCLUDED.location_name,
          reviewer_name = EXCLUDED.reviewer_name,
          star_rating = EXCLUDED.star_rating,
          comment = EXCLUDED.comment,
          review_update_time = EXCLUDED.review_update_time,
          language_code = EXCLUDED.language_code,
          reply_comment = EXCLUDED.reply_comment,
          reply_update_time = EXCLUDED.reply_update_time,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at
      `;
    }

    return NextResponse.json({ imported: rows.length });
  } catch (e: unknown) {
    safeLogger.error("google.reviews.sync.failed", { error: e instanceof Error ? e.message : "unknown" });
    return NextResponse.json({ error: "Review sync failed. Please try again." }, { status: 500 });
  }
}
