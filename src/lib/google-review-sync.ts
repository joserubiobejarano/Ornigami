import { googleFetch } from "@/lib/google";
import { googleReviewsUrl, parseGoogleLocationName } from "@/lib/google-resources";
import { DEFAULT_GOOGLE_REVIEWS_MAX_PAGES } from "@/lib/review-sync-policy";

export type GoogleReviewRecord = {
  reviewId: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  updateTime?: string;
  reviewReply?: { languageCode?: string; comment?: string; updateTime?: string };
};

type GoogleReviewsPage = {
  reviews?: GoogleReviewRecord[];
  nextPageToken?: string;
};

export class GoogleReviewsSyncError extends Error {
  readonly status: 429 | 502 | 503;
  readonly retryAfter: string | null;
  constructor(status: 429 | 502 | 503, retryAfter: string | null = null, message?: string) {
    super(message ?? `Google reviews sync failed (${status})`);
    this.name = "GoogleReviewsSyncError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const REVIEW_ID = /^[A-Za-z0-9_-]+$/;
const PAGE_SIZE = 50;

function validateGoogleReview(review: unknown): GoogleReviewRecord {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error("Google returned an invalid review resource");
  }
  const candidate = review as Partial<GoogleReviewRecord>;
  const validTime = (value: unknown) => value === undefined
    || (typeof value === "string" && Number.isFinite(new Date(value).getTime()));
  const validText = (value: unknown) => value === undefined || typeof value === "string";
  const validReviewer = candidate.reviewer === undefined || (
    typeof candidate.reviewer === "object" && candidate.reviewer !== null && !Array.isArray(candidate.reviewer)
      && validText(candidate.reviewer.displayName)
  );
  const validReply = candidate.reviewReply === undefined || (
    typeof candidate.reviewReply === "object" && candidate.reviewReply !== null && !Array.isArray(candidate.reviewReply)
      && validText(candidate.reviewReply.languageCode)
      && validText(candidate.reviewReply.comment)
      && validTime(candidate.reviewReply.updateTime)
  );
  if (typeof candidate.reviewId !== "string" || !REVIEW_ID.test(candidate.reviewId.trim())
    || !validReviewer || !validReply || !validText(candidate.comment)
    || !validTime(candidate.updateTime)) {
    throw new GoogleReviewsSyncError(502, null, "Google returned an invalid review resource");
  }
  return { ...candidate, reviewId: candidate.reviewId.trim() };
}

/** Fetch every page before returning, so callers never import a partial provider result. */
export async function fetchAllGoogleReviews(
  userId: string,
  locationName: string,
  maxPages = DEFAULT_GOOGLE_REVIEWS_MAX_PAGES
): Promise<GoogleReviewRecord[]> {
  const { accountName, locationId } = parseGoogleLocationName(locationName);
  if (!Number.isFinite(maxPages)) throw new Error("Invalid Google reviews page limit");
  const pageLimit = Math.min(100, Math.max(1, Math.floor(maxPages)));
  const reviews: GoogleReviewRecord[] = [];
  const seenTokens = new Set<string>();
  const seenReviewIds = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < pageLimit; page += 1) {
    const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) query.set("pageToken", pageToken);
    let response: Response;
    try {
      response = await googleFetch(userId, googleReviewsUrl(accountName, locationId, query));
    } catch {
      throw new GoogleReviewsSyncError(502);
    }
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status === 503 ? 503 : 502;
      const retryAfter = response.headers.get("Retry-After");
      await response.body?.cancel().catch(() => undefined);
      throw new GoogleReviewsSyncError(status, retryAfter);
    }

    let payload: GoogleReviewsPage;
    try {
      payload = await response.json() as GoogleReviewsPage;
    } catch {
      throw new GoogleReviewsSyncError(502);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || (payload.reviews !== undefined && !Array.isArray(payload.reviews))) {
      throw new GoogleReviewsSyncError(502, null, "Google returned an invalid reviews page");
    }
    const pageReviews = (payload.reviews ?? []).map(validateGoogleReview);
    for (const review of pageReviews) {
      if (seenReviewIds.has(review.reviewId)) {
        throw new GoogleReviewsSyncError(502, null, "Google returned a duplicate review resource");
      }
      seenReviewIds.add(review.reviewId);
    }
    reviews.push(...pageReviews);

    const next = payload.nextPageToken;
    if (next == null || next === "") return reviews;
    if (typeof next !== "string" || seenTokens.has(next)) {
      throw new GoogleReviewsSyncError(502, null, "Google returned an invalid reviews page token");
    }
    seenTokens.add(next);
    pageToken = next;
  }

  throw new GoogleReviewsSyncError(502, null, "Google reviews sync exceeded the page limit");
}
