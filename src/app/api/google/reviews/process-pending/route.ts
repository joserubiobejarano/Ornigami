export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveUser } from "@/lib/user-from-req";
import { sql } from "@/lib/db/neon";
import { canUseReviewAutomation } from "@/lib/plan";
import { getUserPlan } from "@/lib/plan-server";
import { getProfileReplyDefaults } from "@/lib/reply-profile-defaults";
import { requireActiveAgentAccess } from "@/lib/api-security";
import { getBusinessForUser } from "@/lib/db/businesses";
import { safeLogger } from "@/lib/safe-logger";
import { MAX_REVIEW_REPLY_BATCH, safeProcessingError } from "@/lib/review-reply-policy";
import { checkReviewReplyUsage, incrementReviewReplyUsage } from "@/lib/usage";
import {
  generateReplyForReviewRow,
  postReplyToGoogleAndPersist,
  saveReplyDraft,
  type ReviewRowForReply,
} from "@/lib/review-reply-server";

const BodySchema = z.object({
  locationName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const isDemo = req.headers.get("x-demo") === "true";
  if (isDemo) {
    return NextResponse.json({
      processed: 0,
      posted: 0,
      drafted: 0,
      skipped: 0,
      skippedNoComment: 0,
      autoHandled: 0,
      errors: [],
    });
  }

  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join(".")}: ${first.message}` : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { locationName } = parsed.data;

  const profile = await getProfileReplyDefaults(user.id);
  const autoReply = profile?.auto_reply_all_reviews === true;
  const plan = await getUserPlan(user.id);
  const canPost = canUseReviewAutomation(plan);
  const userEmail = "email" in user ? user.email : null;
  await requireActiveAgentAccess(user.id, userEmail, "review_replies");
  const business = await getBusinessForUser(user.id);
  if (!business) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });

  const rows = (await sql`
    SELECT id, google_review_id, comment, star_rating
    FROM public.reviews
    WHERE business_id = ${business.id}
      AND location_name = ${locationName}
      AND (status IS NULL OR lower(status) <> 'replied')
    ORDER BY review_update_time DESC NULLS LAST
    LIMIT ${MAX_REVIEW_REPLY_BATCH}
  `) as ReviewRowForReply[];

  const posted = 0;
  let drafted = 0;
  let autoHandled = 0;
  let skipped = 0;
  let skippedNoComment = 0;
  const errors: string[] = [];
  let safetyLimitReached = false;

  for (const row of rows) {
    const text = (row.comment ?? "").trim();
    if (!text) {
      skipped += 1;
      skippedNoComment += 1;
      continue;
    }

    try {
      const usage = await checkReviewReplyUsage(user.id, business.id);
      if (!usage.allowed) {
        safetyLimitReached = true;
        break;
      }
      const reply = await generateReplyForReviewRow(row, profile);
      if (!reply.trim()) {
        skipped += 1;
        continue;
      }
      await incrementReviewReplyUsage(user.id);

      const shouldAutoPost = autoReply && canPost;
      const hasKnownSafeRating = typeof row.star_rating === "number" && row.star_rating >= 4;
      if (shouldAutoPost && hasKnownSafeRating) {
        const res = await postReplyToGoogleAndPersist(user.id, business.id, row.google_review_id, locationName, reply);
        if (res.ok) {
          autoHandled += 1;
        } else {
          safeLogger.warn("reviews.process_pending.post_failed", { reviewId: row.google_review_id, error: res.error });
          errors.push(`${row.google_review_id}: ${safeProcessingError("post")}`);
          const draftRes = await saveReplyDraft(business.id, row.google_review_id, reply);
          if (draftRes.ok) drafted += 1;
        }
      } else {
        const draftRes = await saveReplyDraft(business.id, row.google_review_id, reply);
        if (draftRes.ok) {
          drafted += 1;
        } else {
          safeLogger.warn("reviews.process_pending.draft_failed", { reviewId: row.google_review_id, error: draftRes.error });
          errors.push(`${row.google_review_id}: ${safeProcessingError("draft")}`);
        }
      }
    } catch (e: unknown) {
      safeLogger.warn("reviews.process_pending.generate_failed", { reviewId: row.google_review_id, error: e instanceof Error ? e.message : "unknown" });
      errors.push(`${row.google_review_id}: ${safeProcessingError("generate")}`);
    }
  }

  return NextResponse.json({
    processed: rows.length,
    posted,
    drafted,
    autoHandled,
    skipped,
    skippedNoComment,
    errors: safetyLimitReached
      ? [...errors, "Reply drafting is temporarily paused after reaching the monthly safety threshold."]
      : errors,
  });
}
