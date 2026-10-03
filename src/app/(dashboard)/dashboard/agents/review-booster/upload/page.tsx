import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";
import ReviewBoosterUploadPagePlaceholder from "@/modules/review-booster/pages/upload-page";

export default async function ReviewBoosterUploadPage() {
  const session = await requireUser();
  const { context, entitlement } = await getDashboardAgentAccess(session.user.id, "review_booster");
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

  return <ReviewBoosterUploadPagePlaceholder />;
}
