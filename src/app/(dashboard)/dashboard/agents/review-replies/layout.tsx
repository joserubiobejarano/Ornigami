import { ReactNode } from "react";

import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";

export default async function ReviewRepliesLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const { context, entitlement } = await getDashboardAgentAccess(session.user.id, "review_replies");
  if (!entitlement.hasAccess) {
    return (
      <AgentActivationPlaceholder
        agentId="review_replies"
        agentName="Review Replies"
        description="Handle and respond to your Google reviews."
        canManageBilling={context.role === "owner"}
      />
    );
  }

  return <>{children}</>;
}
