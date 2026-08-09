import { googleFetch } from "@/lib/google";

export type GoogleReviewRecord = {
  reviewId?: string;
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

export async function fetchAllGoogleReviews(
  userId: string,
  locationName: string,
  maxPages = 20
): Promise<GoogleReviewRecord[]> {
  const reviews: GoogleReviewRecord[] = [];
  let pageToken: string | null = null;
  let page = 0;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await googleFetch(
      userId,
      `https://mybusiness.googleapis.com/v4/${encodeURIComponent(locationName)}/reviews?${params.toString()}`
    );
    if (!response.ok) throw new Error(`Google reviews sync failed (${response.status})`);

    const payload = (await response.json()) as GoogleReviewsPage;
    reviews.push(...(payload.reviews ?? []));
    pageToken = payload.nextPageToken ?? null;
    page += 1;
  } while (pageToken && page < maxPages);

  return reviews;
}