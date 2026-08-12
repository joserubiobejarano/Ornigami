import Link from "next/link";

import { DashboardPage, StatusBadge } from "@/components/dashboard";
import { ActivationChecklist, type ActivationChecklistStep } from "@/components/dashboard/activation-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { userHasGbpConnection } from "@/lib/db/gbp";
import { sql } from "@/lib/db/neon";

export default async function DashboardPageRoute() {
  const session = await requireUser();
  const resolvedUserRows = await sql`
    SELECT id
    FROM public.users
    WHERE lower(email) = lower(${session.user.email})
    LIMIT 1
  `;
  const resolvedUser = resolvedUserRows[0] as { id: string } | undefined;
  const canonicalUserId = resolvedUser?.id ?? session.user.id;

  let businessName: string | null = null;
  let agentStatusById = new Map<string, string>();
  let activationSteps: ActivationChecklistStep[] = [];
  try {
    let business;
    try {
      business = await getOrCreateBusinessForUser(canonicalUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Could not resolve user in public.users") && session.user.email) {
        business = await getOrCreateBusinessForUser(session.user.email);
      } else {
        throw error;
      }
    }
    businessName = business.name;
    const businessAgents = await getBusinessAgents(business.id);
    agentStatusById = new Map(businessAgents.map((row) => [row.agent_id, row.status]));
    const hasBooster = ["active", "trialing"].includes(agentStatusById.get("review_booster") ?? "");
    const hasReplies = ["active", "trialing"].includes(agentStatusById.get("review_replies") ?? "");
    const visitRows = hasBooster
      ? await sql`SELECT count(*)::int AS count FROM public.followup_visits WHERE business_id = ${business.id}`
      : [];
    const hasVisits = Number((visitRows[0] as { count?: number } | undefined)?.count ?? 0) > 0;
    const hasGbp = hasReplies ? await userHasGbpConnection(canonicalUserId) : true;
    if (hasBooster || hasReplies) {
      activationSteps = [
        {
          label: "Activate an agent",
          description: "Your subscription is active and ready to use.",
          complete: hasBooster || hasReplies,
        },
        ...(hasBooster
          ? [
              {
                label: "Add your review link",
                description: "Tell Review Booster where customers should leave their review.",
                complete: Boolean(business.google_review_url),
                href: "/dashboard/agents/review-booster/settings",
                actionLabel: "Add link",
              },
              {
                label: "Add your first visit",
                description: "Create or upload a visit so the follow-up workflow can begin.",
                complete: hasVisits,
                href: "/dashboard/agents/review-booster/new",
                actionLabel: "Add visit",
              },
            ]
          : []),
        ...(hasReplies
          ? [
              {
                label: "Connect Google Business Profile",
                description: "Connect your profile so Review Replies can sync and draft replies.",
                complete: hasGbp,
                href: "/connect",
                actionLabel: "Connect",
              },
            ]
          : []),
      ];
    }
  } catch {
    // Keep dashboard functional for legacy/misaligned sessions.
  }

  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Ornigami</h1>
        <p className="text-sm text-muted-foreground">Manage your tools for local business growth.</p>
        {businessName ? (
          <p className="text-sm text-muted-foreground">Business: {businessName}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {AGENT_REGISTRY.map((agent) => {
          const agentStatus = agentStatusById.get(agent.id);
          const canOpen = agentStatus === "active" || agentStatus === "trialing";
          const isComingSoon = agent.id === "speed_to_lead";

          return (
            <Card key={agent.id} className="shadow-md md:shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{agent.name}</CardTitle>
                  {isComingSoon ? (
                    <Badge variant="secondary">Coming soon</Badge>
                  ) : canOpen ? (
                    <StatusBadge tone="success">
                      Active
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="error">
                      Not active
                    </StatusBadge>
                  )}
                </div>
                <CardDescription>{agent.shortDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {isComingSoon ? (
                  <Button disabled variant="outline">
                    Coming soon
                  </Button>
                ) : canOpen ? (
                  <Button asChild>
                    <Link href={agent.basePath}>Open agent</Link>
                  </Button>
                ) : (
                  <form action="/api/stripe/checkout" method="post">
                    <input type="hidden" name="agent_id" value={agent.id} />
                    <Button type="submit">
                      Activate
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ActivationChecklist steps={activationSteps} />

      <div>
        <Button asChild>
          <Link href="/dashboard/billing">Billing & subscriptions</Link>
        </Button>
      </div>
    </DashboardPage>
  );
}
