import { sql } from "@/lib/db/neon";
import { parseGoogleStarRating } from "@/lib/google-review-rating";
import type { GoogleReviewRecord } from "@/lib/google-review-sync";

export type NewGoogleReview = {
  reviewerName: string | null;
  starRating: number | null;
  comment: string | null;
};

export type PersistGoogleReviewsResult = {
  synced: number;
  newReviews: NewGoogleReview[];
};

type ReviewUpsertRow = {
  user_id: string;
  business_id: string;
  location_name: string;
  google_review_id: string;
  reviewer_name: string | null;
  star_rating: number | null;
  comment: string | null;
  review_update_time: string | null;
  language_code: string | null;
  reply_comment: string | null;
  reply_update_time: string | null;
  status: "new" | "replied";
};

const UPSERT_BATCH_SIZE = 250;

function providerTime(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Google returned an invalid review timestamp");
  return parsed.toISOString();
}

function toUpsertRow(ownerUserId: string, businessId: string, locationName: string, review: GoogleReviewRecord): ReviewUpsertRow {
  if (!review.reviewId || /[/\\\u0000-\u001f\u007f]/.test(review.reviewId)) {
    throw new Error("Google returned an invalid review resource");
  }
  const reply = review.reviewReply;
  return {
    user_id: ownerUserId,
    business_id: businessId,
    location_name: locationName,
    google_review_id: review.reviewId,
    reviewer_name: review.reviewer?.displayName ?? null,
    star_rating: parseGoogleStarRating(review.starRating),
    comment: review.comment ?? null,
    review_update_time: providerTime(review.updateTime),
    language_code: reply?.languageCode ?? null,
    reply_comment: reply?.comment ?? null,
    reply_update_time: providerTime(reply?.updateTime),
    status: reply?.comment ? "replied" : "new",
  };
}

/**
 * Persist a fully fetched provider result in bounded SQL batches. The owner id is
 * deliberately stored on rows so shared-business members use one integration identity.
 */
export async function persistGoogleReviews(
  ownerUserId: string,
  businessId: string,
  locationName: string,
  reviews: GoogleReviewRecord[]
): Promise<PersistGoogleReviewsResult> {
  const rows = reviews.map((review) => toUpsertRow(ownerUserId, businessId, locationName, review));
  const newReviews: NewGoogleReview[] = [];

  for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + UPSERT_BATCH_SIZE);
    const returned = (await sql`
      WITH business_lock AS MATERIALIZED (
        SELECT id,owner_user_id FROM public.businesses
        WHERE id=${businessId}::uuid AND owner_user_id=${ownerUserId}::uuid
        FOR UPDATE
      ), lifecycle_user AS MATERIALIZED (
        SELECT u.id FROM public.users u JOIN business_lock b ON b.owner_user_id=u.id
        WHERE u.privacy_deletion_requested_at IS NULL
        FOR UPDATE OF u
      ), incoming AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS item(
          user_id uuid, business_id uuid, location_name text, google_review_id text,
          reviewer_name text, star_rating integer, comment text, review_update_time timestamptz,
          language_code text, reply_comment text, reply_update_time timestamptz, status text
        )
      )
      INSERT INTO public.reviews (
        user_id, business_id, location_name, google_review_id, reviewer_name, star_rating, comment,
        review_update_time, language_code, reply_comment, reply_update_time, status, updated_at
      )
      SELECT user_id, business_id, location_name, google_review_id, reviewer_name, star_rating, comment,
        review_update_time, language_code, reply_comment, reply_update_time, status, now()
      FROM incoming
      JOIN business_lock ON business_lock.id=incoming.business_id
      JOIN lifecycle_user ON lifecycle_user.id=incoming.user_id
      ON CONFLICT (business_id, google_review_id) DO UPDATE SET
        reviewer_name = EXCLUDED.reviewer_name,
        star_rating = EXCLUDED.star_rating,
        comment = EXCLUDED.comment,
        review_update_time = EXCLUDED.review_update_time,
        language_code = COALESCE(EXCLUDED.language_code, public.reviews.language_code),
        reply_comment = COALESCE(EXCLUDED.reply_comment, public.reviews.reply_comment),
        reply_update_time = COALESCE(EXCLUDED.reply_update_time, public.reviews.reply_update_time),
        status = CASE
          WHEN EXCLUDED.status = 'replied' THEN 'replied'
          WHEN lower(COALESCE(public.reviews.status, '')) = 'replied' THEN public.reviews.status
          ELSE EXCLUDED.status
        END,
        updated_at = now()
      WHERE public.reviews.location_name = EXCLUDED.location_name
      RETURNING google_review_id, reviewer_name, star_rating, comment, (xmax = 0) AS was_inserted
    `) as Array<{
      google_review_id: string;
      reviewer_name: string | null;
      star_rating: number | null;
      comment: string | null;
      was_inserted: boolean;
    }>;

    if (returned.length !== batch.length) {
      throw new Error("A Google review belongs to a different stored location");
    }
    for (const row of returned) {
      if (row.was_inserted) {
        newReviews.push({ reviewerName: row.reviewer_name, starRating: row.star_rating, comment: row.comment });
      }
    }
  }

  return { synced: rows.length, newReviews };
}
