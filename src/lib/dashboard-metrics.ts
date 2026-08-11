import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { getBusinessForUser } from "@/lib/db/businesses";

export type DashboardMetrics = {
  /** @deprecated kept for backward compatibility; use review-centric fields below */
  reviewsThisMonth: number;
  /** @deprecated */
  contentThisMonth: number;
  /** @deprecated */
  auditsThisMonth: number;
  postsLimit: number;
  postsUsed: number;
  postsRemaining: number;
  auditsLimit: number;
  auditsUsed: number;
  auditsRemaining: number;
  isDemo: boolean;
  /** Total reviews synced from GBP for this user */
  totalReviewsSynced: number;
  /** Reviews that do not have a reply yet */
  unansweredReviews: number;
  /** Replies generated (AI drafts) this month; placeholder if not tracked */
  repliesGeneratedThisMonth: number;
  /**
   * Unposted rows in `review_replies` (posted = false). In-browser drafts on Reviews are not included until persisted.
   */
  draftsCount: number;
  /** Replies posted to Google this month */
  repliesPostedThisMonth: number;
  /** Set only when a truly unexpected server failure occurred; do not use for no-data/no-session. */
  criticalError?: string;
};

function zeroedMetrics(overrides?: Partial<DashboardMetrics>): DashboardMetrics {
  return {
    reviewsThisMonth: 0,
    contentThisMonth: 0,
    auditsThisMonth: 0,
    postsLimit: 20,
    postsUsed: 0,
    postsRemaining: 20,
    auditsLimit: 5,
    auditsUsed: 0,
    auditsRemaining: 5,
    isDemo: false,
    totalReviewsSynced: 0,
    unansweredReviews: 0,
    repliesGeneratedThisMonth: 0,
    draftsCount: 0,
    repliesPostedThisMonth: 0,
    ...overrides,
  };
}

export async function getDashboardMetrics(isDemo: boolean = false): Promise<DashboardMetrics> {
  if (isDemo) {
    return {
      reviewsThisMonth: 12,
      contentThisMonth: 3,
      auditsThisMonth: 1,
      postsLimit: 20,
      postsUsed: 3,
      postsRemaining: 17,
      auditsLimit: 5,
      auditsUsed: 1,
      auditsRemaining: 4,
      isDemo: true,
      totalReviewsSynced: 24,
      unansweredReviews: 5,
      repliesGeneratedThisMonth: 8,
      draftsCount: 8,
      repliesPostedThisMonth: 12,
    };
  }

  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return zeroedMetrics();
    }
    const business = await getBusinessForUser(userId);
    if (!business) return zeroedMetrics();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [totalReviewsRow] = await sql`
      SELECT count(*)::int AS c FROM public.reviews WHERE business_id = ${business.id}
    `;
    const [unansweredRow] = await sql`
      SELECT count(*)::int AS c FROM public.reviews
      WHERE business_id = ${business.id}
        AND (status IS NULL OR lower(status) <> 'replied')
    `;
    const [draftsRow] = await sql`
      SELECT count(*)::int AS c FROM public.review_replies
      WHERE business_id = ${business.id}
        AND posted = false
    `;
    const [reviewsCountRow] = await sql`
      SELECT count(*)::int AS c FROM public.reviews
      WHERE business_id = ${business.id}
        AND status = 'replied'
        AND updated_at >= ${startOfMonth}
        AND updated_at < ${endOfMonth}
    `;
    const [contentCountRow] = await sql`
      SELECT count(*)::int AS c FROM public.projects
      WHERE user_id = ${userId}
        AND created_at >= ${startOfMonth}
        AND created_at < ${endOfMonth}
    `;
    const [auditsCountRow] = await sql`
      SELECT count(*)::int AS c FROM public.leads
      WHERE created_at >= ${startOfMonth}
        AND created_at < ${endOfMonth}
    `;

    const totalReviews =
      Number((totalReviewsRow as { c: number }).c ?? 0);
    const unansweredCount = Number((unansweredRow as { c: number }).c ?? 0);
    const draftsCount = Number((draftsRow as { c: number }).c ?? 0);
    const reviewsCount = Number((reviewsCountRow as { c: number }).c ?? 0);
    const contentThisMonth = Number((contentCountRow as { c: number }).c ?? 0);
    const auditsThisMonth = Number((auditsCountRow as { c: number }).c ?? 0);

    const postsLimit = 20;
    const auditsLimit = 5;
    const postsUsed = contentThisMonth;
    const auditsUsed = auditsThisMonth;

    return {
      reviewsThisMonth: reviewsCount,
      contentThisMonth,
      auditsThisMonth,
      postsLimit,
      postsUsed,
      postsRemaining: Math.max(postsLimit - postsUsed, 0),
      auditsLimit,
      auditsUsed,
      auditsRemaining: Math.max(auditsLimit - auditsUsed, 0),
      isDemo: false,
      totalReviewsSynced: totalReviews,
      unansweredReviews: unansweredCount,
      repliesGeneratedThisMonth: 0,
      draftsCount,
      repliesPostedThisMonth: reviewsCount,
    };
  } catch (error) {
    console.error("[DashboardMetrics] Unexpected error:", error);
    return zeroedMetrics({ criticalError: "We could not load stats. Please refresh." });
  }
}
