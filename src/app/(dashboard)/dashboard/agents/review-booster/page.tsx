import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";
import { BoosterDashboard } from "@/modules/review-booster/components/booster-dashboard";
import {
  getFollowupStats,
  getRecentVisitsPage,
  getReviewOutcomeStats,
  getReviewBoosterBillingPeriodUsage,
} from "@/modules/review-booster/services/review-booster-db.service";

export default async function ReviewBoosterPage() {
  const session = await requireUser();
  const { context, entitlement } = await getDashboardAgentAccess(session.user.id, "review_booster");
  const business = context.business;
  if (!entitlement.hasAccess) {
    return (
      <AgentActivationPlaceholder
        agentId="review_booster"
        agentName="Review Booster"
        description="Post-visit review request automations."
        canManageBilling={context.role === "owner"}
      />
    );
  }

  const [stats, recentVisitsPage, outcomes, monthlyUsage] = await Promise.all([
    getFollowupStats(business.id),
    getRecentVisitsPage(business.id, { limit: 50 }),
    getReviewOutcomeStats(business.id),
    getReviewBoosterBillingPeriodUsage(business.id),
  ]);

  return (
    <BoosterDashboard
      business={business}
      stats={stats}
      outcomes={outcomes}
      monthlyUsage={monthlyUsage}
      recentVisitsPage={recentVisitsPage}
    />
  );
}
