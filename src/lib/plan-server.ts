import { sql } from "@/lib/db/neon";
import type { PlanId, PlanStatus } from "@/lib/plan";
import { UserPlanViewRowSchema } from "@/lib/validators";
import { normalizePlanIdValue } from "@/lib/plan-policy";

export type UserPlanInfo = {
  planId: PlanId;
  planStatus: PlanStatus;
  planType: string | null;
  currentPeriodEnd: string | null;
  aiPostsUsed: number;
  auditsUsed: number;
  usageResetDate: string | null;
};

export async function getUserPlan(userId: string): Promise<PlanId> {
  const info = await getUserPlanInfo(userId);
  return info.planId;
}

export function normalizePlanId(value: unknown): PlanId {
  return normalizePlanIdValue(value) as PlanId;
}

export async function getUserPlanInfo(userId: string): Promise<UserPlanInfo> {
  const rows = await sql`
    SELECT *
    FROM public.v_user_plan
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  const plan = rows[0] ? UserPlanViewRowSchema.parse(rows[0]) : undefined;

  const storedPlanStatus = plan?.plan_status as PlanStatus | undefined;
  const planStatus: PlanStatus =
    (storedPlanStatus === "past_due" ? storedPlanStatus : plan?.subscription_status as PlanStatus) ||
    storedPlanStatus ||
    "free";

  const effectivePlanId: PlanId =
    planStatus === "active" || planStatus === "trialing" || planStatus === "past_due"
      ? normalizePlanId(plan?.plan_type)
      : normalizePlanId(plan?.manual_plan);

  return {
    planId: effectivePlanId,
    planStatus,
    planType: (plan?.plan_type as string) || null,
    currentPeriodEnd:
      (plan?.plan_current_period_end as string) ||
      (plan?.subscription_current_period_end as string) ||
      null,
    aiPostsUsed: Number(plan?.ai_posts_used ?? 0),
    auditsUsed: Number(plan?.audits_used ?? 0),
    usageResetDate: (plan?.usage_reset_date as string) || null,
  };
}
