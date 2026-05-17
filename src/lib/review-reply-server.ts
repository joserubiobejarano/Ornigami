import { googleFetch } from "@/lib/google";
import { sql } from "@/lib/db/neon";
import type { ReviewReplyInput } from "@/lib/openai";
import { generateReviewReply, sanitizeReviewReply } from "@/lib/openai";
import type { ProfileReplyRow } from "@/lib/reply-profile-defaults";

export type ReviewRowForReply = {
  id: string | number;
  google_review_id: string;
  comment: string | null;
  star_rating: number | null;
};

/** Build OpenAI input from a stored review row + saved profile defaults. */
export function buildReviewReplyInputFromRow(
  review: ReviewRowForReply,
  profile: ProfileReplyRow | null
): ReviewReplyInput {
  const tone =
    profile?.reply_tone?.trim() || "Friendly and professional";
  return {
    businessName: profile?.business_name?.trim() ?? "",
    city: "",
    rating: Math.min(5, Math.max(1, Number(review.star_rating) || 5)),
    text: (review.comment ?? "").trim(),
    tone,
    ownerName: profile?.owner_name?.trim() || undefined,
    contactPreference: profile?.contact_preference?.trim() || undefined,
  };
}

/** Replace any existing unposted draft for this review, then insert one row. */
export async function saveReplyDraft(
  userId: string,
  googleReviewId: string,
  markdown: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reviewRows = await sql`
    SELECT id FROM public.reviews
    WHERE user_id = ${userId}
      AND google_review_id = ${googleReviewId}
    LIMIT 1
  `;
  const review = reviewRows[0] as { id: string | number } | undefined;
  if (!review) {
    return { ok: false, error: "Review not found" };
  }

  await sql`
    DELETE FROM public.review_replies
    WHERE user_id = ${userId}
      AND review_id = ${review.id}
      AND posted = false
  `;

  await sql`
    INSERT INTO public.review_replies (
      user_id, review_id, draft_markdown, posted, posted_at
    ) VALUES (
      ${userId},
      ${review.id},
      ${markdown},
      false,
      NULL
    )
  `;

  return { ok: true };
}

/**
 * Mark a reply as posted in the app DB only (no Google API).
 * Used for MVP auto-reply simulation after sync; mirrors the persist step of real posting.
 */
export async function persistReplyPostedLocally(
  userId: string,
  googleReviewId: string,
  reply: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reviewRows = await sql`
    SELECT id FROM public.reviews
    WHERE user_id = ${userId}
      AND google_review_id = ${googleReviewId}
    LIMIT 1
  `;

  const review = reviewRows[0] as { id: string | number } | undefined;
  if (!review) {
    return { ok: false, error: "Review not found" };
  }

  await sql`
    DELETE FROM public.review_replies
    WHERE user_id = ${userId}
      AND review_id = ${review.id}
      AND posted = false
  `;

  await sql`
    INSERT INTO public.review_replies (
      user_id, review_id, draft_markdown, posted, posted_at
    ) VALUES (
      ${userId},
      ${review.id},
      ${reply},
      true,
      ${new Date().toISOString()}
    )
  `;

  await sql`
    UPDATE public.reviews
    SET
      status = 'replied',
      reply_comment = ${reply},
      reply_update_time = ${new Date().toISOString()},
      updated_at = now()
    WHERE id = ${review.id}
  `;

  return { ok: true };
}

/** Post reply to Google GBP and persist posted state (same behavior as /api/google/replies). */
export async function postReplyToGoogleAndPersist(
  userId: string,
  googleReviewId: string,
  locationName: string,
  reply: string
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const url = `https://mybusiness.googleapis.com/v4/${encodeURIComponent(locationName)}/reviews/${encodeURIComponent(googleReviewId)}:updateReply`;

  const r = await googleFetch(userId, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reply: { comment: reply } }),
  });

  if (!r.ok) {
    const t = await r.text();
    return { ok: false, error: t, status: r.status };
  }

  const persist = await persistReplyPostedLocally(userId, googleReviewId, reply);
  if (!persist.ok) {
    // Google accepted the reply but local row missing , still report success to match prior behavior
  }

  return { ok: true };
}

export async function generateReplyForReviewRow(
  review: ReviewRowForReply,
  profile: ProfileReplyRow | null
): Promise<string> {
  const input = buildReviewReplyInputFromRow(review, profile);
  const raw = await generateReviewReply(input);
  return sanitizeReviewReply(raw);
}

