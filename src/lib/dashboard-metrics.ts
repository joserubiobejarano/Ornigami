import { auth } from "@/auth";
import { sql } from "@/lib/db/neon";
import { getBusinessForUser } from "@/lib/db/businesses";
import { safeLogger } from "@/lib/safe-logger";

export type DashboardMetrics = {
  /** @deprecated kept for backward compatibility; use review-centric fields below */
  reviewsThisMonth: number;
  /** @deprecated */
  contentThisMonth: number;
  /** @deprecated; the former unscoped public.leads count was retired for tenant privacy. */
  auditsThisMonth: number;
  postsLimit: number;
  postsUsed: number;
  postsRemaining: number;
  auditsLimit: number;
  auditsUsed: number;
  auditsRemaining: number;
  isDemo: boolean;
  /** Reviews synced into this member's canonical workspace. */
  totalReviewsSynced: number;
  /** Reviews that do not have a reply yet */
  unansweredReviews: number;
  /** Replies generated this month; placeholder if not tracked */
  repliesGeneratedThisMonth: number;
  /**
   * Current saved drafts; historical versions and in-browser unsaved edits are excluded.
   */
  draftsCount: number;
  /** Replies posted to Google this month */
  repliesPostedThisMonth: number;
  /** Accepted Booster follow-ups in the canonical workspace, across time. */
  followupsSent: number;
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
    auditsLimit: 0,
    auditsUsed: 0,
    auditsRemaining: 0,
    isDemo: false,
    totalReviewsSynced: 0,
    unansweredReviews: 0,
    repliesGeneratedThisMonth: 0,
    draftsCount: 0,
    repliesPostedThisMonth: 0,
    followupsSent: 0,
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
      followupsSent: 3,
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
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    // Each statistic is an independent, business-scoped aggregate. Keeping the
    // review/reply/click tables out of a combined join avoids multiplicative rows.
    let followupsFailed = false;
    const [totalReviewsRows, unansweredRows, draftsRows, repliesRows, followupsRows, projectsRows] = await Promise.all([
      sql`SELECT count(*)::int AS c FROM public.reviews WHERE business_id = ${business.id}`,
      sql`SELECT count(*)::int AS c FROM public.reviews
        WHERE business_id = ${business.id} AND (status IS NULL OR lower(status) <> 'replied')`,
      sql`SELECT count(*)::int AS c FROM public.review_reply_draft_state d
        JOIN public.reviews r ON r.id = d.review_id AND r.business_id = d.business_id
        JOIN public.review_replies rr ON rr.id = d.reply_id
          AND rr.review_id = r.id AND rr.business_id = d.business_id
        WHERE d.business_id = ${business.id}
          AND d.state IN ('ai_drafted', 'human_edited', 'approved')
          AND d.posting_token IS NULL AND rr.posted IS FALSE
          AND lower(COALESCE(r.status, '')) <> 'replied' AND r.reply_comment IS NULL`,
      sql`SELECT count(*)::int AS c FROM public.reviews
        WHERE business_id = ${business.id} AND status = 'replied'
          AND updated_at >= ${startOfMonth} AND updated_at < ${endOfMonth}`,
      sql`SELECT count(*)::int AS c FROM public.followup_visits
        WHERE business_id = ${business.id} AND lower(followup_status) = 'sent'`.catch((error) => {
          followupsFailed = true;
          safeLogger.error("dashboard_metrics.followups_failed", {
            error: error instanceof Error ? error.message : "unknown",
          });
          return [{ c: 0 }];
        }),
      sql`SELECT count(*)::int AS c FROM public.projects
        WHERE user_id = ${userId} AND created_at >= ${startOfMonth} AND created_at < ${endOfMonth}`,
    ]);
    const totalReviewsRow = totalReviewsRows[0];
    const unansweredRow = unansweredRows[0];
    const draftsRow = draftsRows[0];
    const reviewsCountRow = repliesRows[0];
    const followupsRow = followupsRows[0];
    const projectsRow = projectsRows[0];

    const totalReviews =
      Number((totalReviewsRow as { c: number }).c ?? 0);
    const unansweredCount = Number((unansweredRow as { c: number }).c ?? 0);
    const draftsCount = Number((draftsRow as { c: number }).c ?? 0);
    const reviewsCount = Number((reviewsCountRow as { c: number }).c ?? 0);
    const contentThisMonth = Number((projectsRow as { c: number }).c ?? 0);
    const auditsThisMonth = 0; // The former global leads count was not tenant-scoped and is retired.
    const followupsSent = Number((followupsRow as { c: number }).c ?? 0);

    const postsLimit = 20;
    const auditsLimit = 0;
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
      followupsSent,
      ...(followupsFailed ? { criticalError: "We could not load follow-up stats. Please refresh." } : {}),
    };
  } catch (error) {
    safeLogger.error("dashboard_metrics.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return zeroedMetrics({ criticalError: "We could not load stats. Please refresh." });
  }
}
