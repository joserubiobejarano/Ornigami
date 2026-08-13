import { sql } from "@/lib/db/neon";

// Product promise: effectively unlimited reply drafting. This internal ceiling
// only protects against runaway automation or abuse and is intentionally high.
export const REVIEW_REPLY_SAFETY_LIMIT = 2_000;

export async function checkReviewReplyUsage(userId: string, businessId: string) {
  const rows = await sql`
    SELECT
      p.review_replies_used,
      p.review_replies_usage_period_start,
      COALESCE(
        ba.current_period_start,
        CASE
          WHEN ba.current_period_end IS NOT NULL AND ba.billing_period = 'annual' THEN ba.current_period_end - INTERVAL '1 year'
          WHEN ba.current_period_end IS NOT NULL THEN ba.current_period_end - INTERVAL '1 month'
          ELSE ba.activated_at
        END,
        now()
      ) AS current_period_start
    FROM public.profiles p
    LEFT JOIN public.business_agents ba ON ba.business_id = ${businessId} AND ba.agent_id = 'review_replies'
    WHERE p.id = ${userId}
    LIMIT 1
  `;
  const row = rows[0] as {
    review_replies_used?: number | null;
    review_replies_usage_period_start?: string | null;
    current_period_start?: string | null;
  } | undefined;
  const limit = REVIEW_REPLY_SAFETY_LIMIT;
  const currentPeriodStart = row?.current_period_start ? new Date(row.current_period_start) : null;
  const storedPeriodStart = row?.review_replies_usage_period_start ? new Date(row.review_replies_usage_period_start) : null;
  const periodChanged = Boolean(currentPeriodStart && (!storedPeriodStart || storedPeriodStart.getTime() !== currentPeriodStart.getTime()));
  if (periodChanged && currentPeriodStart) {
    await sql`
      UPDATE public.profiles
      SET review_replies_used = 0,
          review_replies_usage_period_start = ${currentPeriodStart.toISOString()},
          updated_at = now()
      WHERE id = ${userId}
    `;
  }
  const used = periodChanged ? 0 : Number(row?.review_replies_used ?? 0);
  return { allowed: used < limit, used, limit };
}

export async function incrementReviewReplyUsage(userId: string): Promise<void> {
  await sql`
    UPDATE public.profiles
    SET review_replies_used = COALESCE(review_replies_used, 0) + 1, updated_at = now()
    WHERE id = ${userId}
  `;
}

type ProfileUsageRow = {
  ai_posts_used: number | null;
  audits_used: number | null;
  usage_reset_date: string | null;
};

export async function checkUsageLimit(
  userId: string
): Promise<{ allowed: boolean; used: number; limit: number; resetDate: string | null }> {
  const rows = await sql`
    SELECT ai_posts_used, audits_used, usage_reset_date
    FROM public.profiles
    WHERE id = ${userId}
    LIMIT 1
  `;

  const profile = rows[0] as ProfileUsageRow | undefined;

  if (!profile) {
    return { allowed: false, used: 0, limit: 0, resetDate: null };
  }

  const resetDate = profile.usage_reset_date ? new Date(profile.usage_reset_date) : null;
  const now = new Date();
  if (resetDate && resetDate <= now) {
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())
      .toISOString()
      .split("T")[0];

    await sql`
      UPDATE public.profiles
      SET
        ai_posts_used = 0,
        audits_used = 0,
        usage_reset_date = ${nextReset},
        updated_at = now()
      WHERE id = ${userId}
    `;

    return {
      allowed: true,
      used: 0,
      limit: 0,
      resetDate: nextReset,
    };
  }

  return {
    allowed: true,
    used: 0,
    limit: 0,
    resetDate: resetDate?.toISOString().split("T")[0] ?? null,
  };
}

export async function incrementUsage(
  userId: string,
  type: "ai_posts" | "audits"
): Promise<void> {
  const field = type === "ai_posts" ? "ai_posts_used" : "audits_used";

  if (field === "ai_posts_used") {
    await sql`
      UPDATE public.profiles
      SET ai_posts_used = COALESCE(ai_posts_used, 0) + 1, updated_at = now()
      WHERE id = ${userId}
    `;
  } else {
    await sql`
      UPDATE public.profiles
      SET audits_used = COALESCE(audits_used, 0) + 1, updated_at = now()
      WHERE id = ${userId}
    `;
  }
}
