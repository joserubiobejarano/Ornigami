import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import ReviewBoosterNewVisitPagePlaceholder from "@/modules/review-booster/pages/new-visit-page";

export default async function ReviewBoosterNewPage() {
  const session = await requireUser();
  let business;
  try {
    business = await getOrCreateBusinessForUser(session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && session.user.email) {
      business = await getOrCreateBusinessForUser(session.user.email);
    } else {
      throw error;
    }
  }

  const hasAccess = await canAccessAgent(business.id, "review_booster");
  if (!hasAccess) {
    return (
      <AgentActivationPlaceholder
        agentName="Review Booster"
        description="Post-visit review request automations."
      />
    );
  }

  return <ReviewBoosterNewVisitPagePlaceholder />;
}
