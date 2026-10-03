import { googleFetch } from "@/lib/google";
import { sql } from "@/lib/db/neon";
import type { ReviewReplyInput } from "@/lib/openai";
import { generateReviewReply, sanitizeReviewReply } from "@/lib/openai";
import type { ProfileReplyRow } from "@/lib/reply-profile-defaults";
import { parseGoogleStarRating } from "@/lib/google-review-rating";
import { requireActiveAgentBusinessContext } from "@/lib/api-security";
import { getSelectedGoogleLocation } from "@/lib/google-business";
import { googleReviewReplyUrl, parseGoogleLocationName } from "@/lib/google-resources";
import { claimReplyPost, finishReplyPost, type ReplyPostIntent } from "@/lib/review-draft-policy";
import { beginAccountLifecycleOperation, finishAccountLifecycleOperation } from "@/lib/account-lifecycle";

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

/** Post reply to Google GBP and persist posted state (same behavior as /api/google/replies). */
export async function postReplyToGoogleAndPersist(
  actorUserId: string,
  businessId: string,
  googleReviewId: string,
  locationName: string,
  reply: string,
  approved?: { intent: ReplyPostIntent; expectedVersion: number; expectedText: string }
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const normalizedReply = reply.trim();
  if (!normalizedReply || Buffer.byteLength(normalizedReply, "utf8") > 4096) {
    return { ok: false, error: "Reply must be between 1 and 4096 UTF-8 bytes", status: 400 };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(googleReviewId)) {
    return { ok: false, error: "Invalid Google review ID", status: 400 };
  }
  if (!approved || approved.expectedText.trim() !== normalizedReply || !Number.isSafeInteger(approved.expectedVersion)) {
    return { ok: false, error: "An approved saved draft version is required", status: 409 };
  }
  if (approved.expectedVersion < 1 || (approved.intent !== "manual" && approved.intent !== "automatic")) {
    return { ok: false, error: "Invalid approved draft intent or version", status: 400 };
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

  const postClaim = await claimReplyPost(
    context.businessId, googleReviewId, normalizedReply, approved.expectedVersion, approved.intent
  );
  if (!postClaim.ok) {
    const status = postClaim.reason === "not-found" ? 404 : 409;
    return { ok: false, error: "The saved reply is no longer approved for posting", status };
  }

  const lifecycle = await beginAccountLifecycleOperation({
    userId: context.integrationOwnerUserId,
    actorUserId,
    businessId: context.businessId,
    kind: "google_reply_post",
    idempotencyKey: postClaim.token,
    leaseMs: 55000,
  });
  if (lifecycle.result !== "claimed" || !lifecycle.token) {
    await finishReplyPost(context.businessId, googleReviewId, normalizedReply, postClaim.token, false).catch(() => false);
    return { ok: false, error: "Account lifecycle prevents posting this reply", status: 409 };
  }
  const operationToken = lifecycle.token;

  const resource = parseGoogleLocationName(selected.location_name);
  const url = googleReviewReplyUrl(resource.accountName, resource.locationId, googleReviewId);

  let r: Response;
  try {
    r = await googleFetch(context.integrationOwnerUserId, url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: normalizedReply }),
    }, selected.connection_version, { actorUserId, businessId });
  } catch (error) {
    if (error instanceof Error && error.name === "GoogleConnectionVersionError") {
      await finishReplyPost(context.businessId, googleReviewId, normalizedReply, postClaim.token, false);
      await finishAccountLifecycleOperation(operationToken, "failed");
      return { ok: false, error: "Google connection changed since location selection", status: 409 };
    }
    // The request may have reached Google before the connection failed. Keep
    // the post fence for reconciliation instead of risking an automatic retry.
    await finishAccountLifecycleOperation(operationToken, "uncertain").catch(() => false);
    return { ok: false, error: "Google reply update failed", status: 502 };
  }

  if (!r.ok) {
    await r.body?.cancel().catch(() => undefined);
    const status = r.status === 429 ? 429 : r.status === 503 ? 503 : 502;
    if (r.status >= 400 && r.status < 500) {
      await finishReplyPost(context.businessId, googleReviewId, normalizedReply, postClaim.token, false);
      await finishAccountLifecycleOperation(operationToken, "failed");
    } else {
      await finishAccountLifecycleOperation(operationToken, "uncertain").catch(() => false);
    }
    return { ok: false, error: "Google reply update failed", status };
  }
  await r.body?.cancel().catch(() => undefined);

  let persisted = false;
  try {
    persisted = await finishReplyPost(context.businessId, googleReviewId, normalizedReply, postClaim.token, true);
  } catch {
    persisted = false;
  }
  if (!persisted) {
    await finishAccountLifecycleOperation(operationToken, "uncertain").catch(() => false);
    return {
      ok: false,
      error: "Google accepted the reply, but its local status could not be updated. Sync reviews before retrying.",
      status: 502,
    };
  }

  if (!await finishAccountLifecycleOperation(operationToken, "done")) {
    return { ok: false, error: "Reply status was saved, but deletion reconciliation is required", status: 502 };
  }

  return { ok: true };
}

export async function generateReplyForReviewRow(
  review: ReviewRowForReply,
  profile: ProfileReplyRow | null,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  const input = buildReviewReplyInputFromRow(review, profile);
  const raw = await generateReviewReply(input, options);
  return sanitizeReviewReply(raw);
}

