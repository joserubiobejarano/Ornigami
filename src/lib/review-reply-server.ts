import { googleFetch } from "@/lib/google";
import { sql } from "@/lib/db/neon";
import type { ReviewReplyInput } from "@/lib/openai";
import { generateReviewReply, sanitizeReviewReply } from "@/lib/openai";
import type { ProfileReplyRow } from "@/lib/reply-profile-defaults";
import { parseGoogleStarRating } from "@/lib/google-review-rating";
import { requireActiveAgentBusinessContext } from "@/lib/api-security";
import { getSelectedGoogleLocation } from "@/lib/google-business";
import { googleReviewReplyUrl, parseGoogleLocationName } from "@/lib/google-resources";

export type ReviewRowForReply = {
  id: string | number;
  google_review_id: string;
  comment: string | null;
  star_rating: number | string | null;
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
    rating: Math.min(5, Math.max(1, typeof review.star_rating === "number"
      ? review.star_rating
      : parseGoogleStarRating(review.star_rating) ?? 3)),
    text: (review.comment ?? "").trim(),
    tone,
    ownerName: profile?.owner_name?.trim() || undefined,
    contactPreference: profile?.contact_preference?.trim() || undefined,
  };
}

/** Replace any existing unposted draft for this review, then insert one row. */
export async function saveReplyDraft(
  businessId: string,
  googleReviewId: string,
  markdown: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reviewRows = await sql`
    SELECT id FROM public.reviews
    WHERE business_id = ${businessId}
      AND google_review_id = ${googleReviewId}
    LIMIT 1
  `;
  const review = reviewRows[0] as { id: string | number } | undefined;
  if (!review) {
    return { ok: false, error: "Review not found" };
  }

  await sql`
    DELETE FROM public.review_replies
    WHERE business_id = ${businessId}
      AND review_id = ${review.id}
      AND posted = false
  `;

  await sql`
    INSERT INTO public.review_replies (
      user_id, business_id, review_id, draft_markdown, posted, posted_at
    ) VALUES (
      (SELECT owner_user_id FROM public.businesses WHERE id = ${businessId}),
      ${businessId},
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
  businessId: string,
  googleReviewId: string,
  reply: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reviewRows = await sql`
    SELECT id FROM public.reviews
    WHERE business_id = ${businessId}
      AND google_review_id = ${googleReviewId}
    LIMIT 1
  `;

  const review = reviewRows[0] as { id: string | number } | undefined;
  if (!review) {
    return { ok: false, error: "Review not found" };
  }

  await sql`
    DELETE FROM public.review_replies
    WHERE business_id = ${businessId}
      AND review_id = ${review.id}
      AND posted = false
  `;

  await sql`
    INSERT INTO public.review_replies (
      user_id, business_id, review_id, draft_markdown, posted, posted_at
    ) VALUES (
      (SELECT owner_user_id FROM public.businesses WHERE id = ${businessId}),
      ${businessId},
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
  actorUserId: string,
  businessId: string,
  googleReviewId: string,
  locationName: string,
  reply: string
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const normalizedReply = reply.trim();
  if (!normalizedReply || Buffer.byteLength(normalizedReply, "utf8") > 4096) {
    return { ok: false, error: "Reply must be between 1 and 4096 UTF-8 bytes", status: 400 };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(googleReviewId)) {
    return { ok: false, error: "Invalid Google review ID", status: 400 };
  }
  // Re-resolve explicit business membership here because legacy internal callers
  // (including process-pending) also reach this provider boundary.
  const context = await requireActiveAgentBusinessContext(actorUserId, null, "review_replies", businessId);
  const selected = await getSelectedGoogleLocation(context, locationName);
  if (selected.location_name !== locationName) {
    return { ok: false, error: "Selected Google location changed", status: 409 };
  }

  const storedReviews = await sql`
    SELECT id
    FROM public.reviews
    WHERE business_id = ${context.businessId}
      AND location_name = ${selected.location_name}
      AND google_review_id = ${googleReviewId}
    LIMIT 1
  `;
  const storedReview = storedReviews[0] as { id: string | number } | undefined;
  if (!storedReview) return { ok: false, error: "Review not found for the selected Google location", status: 404 };

  const resource = parseGoogleLocationName(selected.location_name);
  const url = googleReviewReplyUrl(resource.accountName, resource.locationId, googleReviewId);

  let r: Response;
  try {
    r = await googleFetch(context.integrationOwnerUserId, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: normalizedReply }),
    });
  } catch {
    return { ok: false, error: "Google reply update failed", status: 502 };
  }

  if (!r.ok) {
    await r.body?.cancel().catch(() => undefined);
    const status = r.status === 429 ? 429 : r.status === 503 ? 503 : 502;
    return { ok: false, error: "Google reply update failed", status };
  }
  await r.body?.cancel().catch(() => undefined);

  let persist: { ok: true } | { ok: false; error: string };
  try {
    persist = await persistReplyPostedLocally(context.businessId, googleReviewId, normalizedReply);
  } catch {
    persist = { ok: false, error: "Local persistence failed" };
  }
  if (!persist.ok) {
    return {
      ok: false,
      error: "Google accepted the reply, but its local status could not be updated. Sync reviews before retrying.",
      status: 502,
    };
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

