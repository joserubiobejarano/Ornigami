import { sql } from "@/lib/db/neon";
import { PLANS, isPlanId } from "@/lib/billing/plans";

const STARTER_LIMITS = {
  aiPosts: 20,
  audits: 5,
};

export async function checkReviewReplyUsage(userId: string, businessId: string) {
  await checkUsageLimit(userId, "ai_posts");
  const rows = await sql`
    SELECT p.review_replies_used, ba.plan_id
    FROM public.profiles p
    LEFT JOIN public.business_agents ba ON ba.business_id = ${businessId} AND ba.agent_id = 'review_replies'
    WHERE p.id = ${userId}
    LIMIT 1
  `;
  const row = rows[0] as { review_replies_used?: number | null; plan_id?: string | null } | undefined;
  const planId = row?.plan_id && isPlanId(row.plan_id) ? row.plan_id : "replies";
  const limit = PLANS[planId].monthlyRequestAllowance;
  const used = Number(row?.review_replies_used ?? 0);
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
  plan_type: string | null;
  plan_status: string | null;
};

export async function checkUsageLimit(
  userId: string,
  type: "ai_posts" | "audits"
): Promise<{ allowed: boolean; used: number; limit: number; resetDate: string | null }> {
  const rows = await sql`
    SELECT ai_posts_used, audits_used, usage_reset_date, plan_type, plan_status
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
        review_replies_used = 0,
        usage_reset_date = ${nextReset},
        updated_at = now()
      WHERE id = ${userId}
    `;

    return {
      allowed: true,
      used: 0,
      limit: STARTER_LIMITS[type === "ai_posts" ? "aiPosts" : "audits"],
      resetDate: nextReset,
    };
  }

  const isStarter =
    profile.plan_type === "starter" &&
    (profile.plan_status === "active" ||
      profile.plan_status === "trialing" ||
      profile.plan_status === "past_due");

  if (!isStarter) {
    return {
      allowed: true,
      used: 0,
      limit: 0,
      resetDate: resetDate?.toISOString().split("T")[0] ?? null,
    };
  }

  const used =
    type === "ai_posts"
      ? (profile.ai_posts_used ?? 0)
      : (profile.audits_used ?? 0);
  const limit = STARTER_LIMITS[type === "ai_posts" ? "aiPosts" : "audits"];

  return {
    allowed: used < limit,
    used,
    limit,
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
