import { ReviewRepliesDashboardPage } from "@/components/dashboard/review-replies-dashboard-page";
import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";

export default async function ReviewRepliesAgentPage() {
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
  const hasAccess = await canAccessAgent(business.id, "review_replies");

  if (!hasAccess) {
    return (
      <AgentActivationPlaceholder
        agentName="Review Replies"
        description="Handle and respond to your Google reviews."
      />
    );
  }

  return <ReviewRepliesDashboardPage />;
}
