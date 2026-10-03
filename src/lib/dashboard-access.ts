import { resolveBusinessForSessionUserStrict } from "@/lib/api-security";
import { getBusinessPlanInfo, type BusinessPlanInfo } from "@/lib/plan-server";
import type { BusinessContext } from "@/lib/business-context";

export type DashboardAgentAccess = {
  context: BusinessContext;
  entitlement: BusinessPlanInfo;
};

/** Resolves the signed-in actor and the owner's workspace entitlement together. */
export async function getDashboardAgentAccess(
  actorUserId: string,
  agentId: "review_booster" | "review_replies",
): Promise<DashboardAgentAccess> {
  const context = await resolveBusinessForSessionUserStrict(actorUserId);
  const entitlement = await getBusinessPlanInfo(context, agentId);
  return { context, entitlement };
}
