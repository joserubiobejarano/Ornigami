export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/user-from-req";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { BusinessGoogleError, getSelectedGoogleLocation, resolveRequestedBusinessId } from "@/lib/google-business";
import { sql } from "@/lib/db/neon";
import { createDashboardPage, decodeDashboardCursor, parseDashboardPageSize } from "@/lib/dashboard-pagination";

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), undefined);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });
  const limit = parseDashboardPageSize(req.nextUrl.searchParams.get("limit"));
  if (limit === null) return NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 });
  const loc = req.nextUrl.searchParams.get("loc");
  if (!loc) return NextResponse.json({ items: [], page: { nextCursor: null, hasMore: false } });
  try {
    const email = "email" in user ? user.email : null;
    const context = await requireActiveAgentBusinessContext(user.id, email, "review_replies", requested.businessId);
    const selected = await getSelectedGoogleLocation(context, loc);
    const scope = JSON.stringify([context.businessId, selected.location_name]);
    let cursor;
    try {
      cursor = decodeDashboardCursor(req.nextUrl.searchParams.get("cursor"), scope, {
        idType: "bigint",
        timestampNullable: true,
      });
    } catch {
      return NextResponse.json({ error: "Invalid pagination cursor." }, { status: 400 });
    }
    const rows = await sql`
      SELECT r.id AS review_id, r.google_review_id, r.reviewer_name, r.star_rating, r.comment,
        r.status, r.reply_comment, r.location_name, r.review_update_time,
        ds.reply_id, ds.state AS draft_state, COALESCE(ds.version, 0) AS draft_version,
        ds.updated_at AS draft_updated_at, current_reply.draft_markdown AS saved_draft_reply,
        r.review_update_time::text AS cursor_timestamp,
        CASE WHEN ds.posting_token IS NULL THEN NULL
          WHEN ds.posting_lease_until > now() THEN 'posting'
          ELSE 'reconciliation_required' END AS post_recovery_status
      FROM public.reviews r
      LEFT JOIN public.review_reply_draft_state ds
        ON ds.review_id = r.id AND ds.business_id = r.business_id
      LEFT JOIN public.review_replies current_reply
        ON current_reply.id = ds.reply_id AND current_reply.review_id = r.id
      WHERE r.business_id = ${context.businessId}
        AND r.location_name = ${selected.location_name}
        AND (COALESCE(r.review_update_time, '-infinity'::timestamptz), r.id) <
          (COALESCE(${cursor === null ? "+infinity" : cursor.timestamp ?? "-infinity"}::timestamptz, '-infinity'::timestamptz),
            ${cursor?.id ?? "9223372036854775807"}::bigint)
      ORDER BY COALESCE(r.review_update_time, '-infinity'::timestamptz) DESC, r.id DESC
      LIMIT ${limit + 1}
    ` as Array<{
      review_id: string | number; google_review_id: string; reviewer_name: string | null;
      star_rating: number | null; comment: string | null; status: string | null;
      reply_comment: string | null; location_name: string; review_update_time: string | null;
      reply_id: string | number | null; draft_state: string | null; draft_version: number | null;
      draft_updated_at: string | null; saved_draft_reply: string | null;
      cursor_timestamp: string | null;
      post_recovery_status: "posting" | "reconciliation_required" | null;
    }>;
    const page = createDashboardPage(rows.map((row) => ({
      ...row,
      cursorId: row.review_id,
      cursorTimestamp: row.cursor_timestamp,
    })), limit, scope);
    const items = page.items.map((row) => {
      const currentReply = row.saved_draft_reply ?? row.reply_comment;
      return {
        google_review_id: row.google_review_id,
        reviewer_name: row.reviewer_name,
        star_rating: row.star_rating,
        comment: row.comment,
        status: row.status ?? "new",
        draft_reply: currentReply,
        draftReply: currentReply,
        draftId: row.reply_id,
        draftState: row.draft_state ?? (row.status?.toLowerCase() === "replied" ? "posted" : "new"),
        draftVersion: Number(row.draft_version ?? 0),
        draftUpdatedAt: row.draft_updated_at,
        postRecoveryStatus: row.post_recovery_status,
        location_name: row.location_name,
        review_update_time: row.review_update_time,
      };
    });
    return NextResponse.json({ items, page: page.page, businessId: context.businessId, locationName: selected.location_name });
  } catch (error) {
    if (error instanceof BusinessGoogleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return safeApiErrorResponse(error, "reviews.list");
  }
}
