export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { getBusinessForUser } from "@/lib/db/businesses";

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const business = await getBusinessForUser(user.id);
  if (!business) return NextResponse.json({ items: [] });

  const loc = new URL(req.url).searchParams.get("loc");

  if (!loc) return NextResponse.json({ items: [] });

  const rows = await sql`
    SELECT
      r.google_review_id,
      r.reviewer_name,
      r.star_rating,
      r.comment,
      r.status,
      COALESCE(draft.draft_markdown, r.reply_comment) AS draft_reply
    FROM public.reviews r
    LEFT JOIN LATERAL (
      SELECT rr.draft_markdown
      FROM public.review_replies rr
      WHERE rr.review_id = r.id
        AND rr.posted = false
      ORDER BY rr.updated_at DESC NULLS LAST, rr.created_at DESC
      LIMIT 1
    ) draft ON true
    WHERE r.business_id = ${business.id}
      AND r.location_name = ${loc}
    ORDER BY r.review_update_time DESC NULLS LAST
    LIMIT 100
  `;

  return NextResponse.json({ items: rows });
}
