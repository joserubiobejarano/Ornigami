export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUser } from "@/lib/user-from-req";
import { requireActiveAgentBusinessContext, safeApiErrorResponse } from "@/lib/api-security";
import { BusinessGoogleError, resolveRequestedBusinessId, getSelectedGoogleLocation } from "@/lib/google-business";
import { sql } from "@/lib/db/neon";
import { getReplyDraft, saveHumanReplyDraft } from "@/lib/review-draft-policy";
import { isSameOriginMutation } from "@/lib/team-lifecycle";

const BodySchema = z.object({
  businessId: z.string().optional(),
  reviewId: z.string().min(1),
  reply: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(req: NextRequest) {
  if (req.headers.get("x-demo") === "true") return NextResponse.json({ ok: true });
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "reviewId, reply, and expectedVersion are required" }, { status: 400 });
  const requested = resolveRequestedBusinessId(req.nextUrl.searchParams.get("businessId"), parsed.data.businessId);
  if (!requested.valid) return NextResponse.json({ error: "Conflicting or invalid businessId" }, { status: 400 });
  try {
    const email = "email" in user ? user.email : null;
    const context = await requireActiveAgentBusinessContext(user.id, email, "review_replies", requested.businessId);
    const reviewRows = await sql`
      SELECT location_name FROM public.reviews
      WHERE business_id = ${context.businessId} AND google_review_id = ${parsed.data.reviewId}
      LIMIT 1
    ` as { location_name: string }[];
    const locationName = reviewRows[0]?.location_name;
    if (!locationName) return NextResponse.json({ ok: false, error: "Review not found", code: "not-found" }, { status: 404 });
    await getSelectedGoogleLocation(context, locationName);
    const result = await saveHumanReplyDraft(
      context.businessId, parsed.data.reviewId, parsed.data.reply, parsed.data.expectedVersion
    );
    if (!result.ok) {
      const status = result.code === "conflict" ? 409 : result.code === "not-found" ? 404 : 400;
      const currentDraft = result.code === "conflict"
        ? await getReplyDraft(context.businessId, parsed.data.reviewId)
        : undefined;
      return NextResponse.json({ ...result, ...(currentDraft ? { currentDraft } : {}) }, { status });
    }
    return NextResponse.json({ ok: true, draft: result.draft });
  } catch (error) {
    if (error instanceof BusinessGoogleError) return NextResponse.json({ error: error.message }, { status: error.status });
    return safeApiErrorResponse(error, "reviews.draft.save");
  }
}
