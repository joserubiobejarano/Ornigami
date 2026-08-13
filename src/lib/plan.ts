import { agentsForPlan, type AgentId, type PlanId as BillingPlanId } from "@/lib/billing/plans";

export type PlanId = "free" | BillingPlanId;
export type PlanStatus = "free" | "active" | "trialing" | "past_due" | "canceled";

export function canUseAgent(plan: PlanId, agentId: AgentId): boolean {
  return plan !== "free" && agentsForPlan(plan).includes(agentId);
}

export function canUseGoogleConnection(plan: PlanId): boolean {
  return plan !== "free";
}

export function canUseReviewAutomation(plan: PlanId): boolean {
  return canUseAgent(plan, "review_replies");
}

export function isPaidUser(planStatus: PlanStatus | null | undefined): boolean {
  return planStatus === "active" || planStatus === "trialing" || planStatus === "past_due";
}

export function isTrialing(planStatus: PlanStatus | null | undefined): boolean {
  return planStatus === "trialing";
}

export function isFreeUser(planStatus: PlanStatus | null | undefined): boolean {
  return !planStatus || planStatus === "free" || planStatus === "canceled";
}

