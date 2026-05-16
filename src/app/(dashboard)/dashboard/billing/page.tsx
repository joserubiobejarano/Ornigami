import { DashboardPage } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";

const MONTHLY_PRICES: Record<string, string> = {
  review_replies: "$19/month",
  review_booster: "$24/month",
  speed_to_lead: "Coming soon",
};

export default async function BillingPage() {
  const session = await requireUser();
  const resolvedUserRows = await sql`
    SELECT id
    FROM public.users
    WHERE lower(email) = lower(${session.user.email})
    LIMIT 1
  `;
  const resolvedUser = resolvedUserRows[0] as { id: string } | undefined;
  const canonicalUserId = resolvedUser?.id ?? session.user.id;

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
  const businessAgents = await getBusinessAgents(business.id);
  const statusByAgent = new Map(businessAgents.map((row) => [row.agent_id, row.status]));

  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Billing & subscriptions</h1>
        <p className="text-sm text-foreground">Business: {business.name}</p>
      </div>

      <div className="grid gap-4">
        {AGENT_REGISTRY.map((agent) => {
          const status = statusByAgent.get(agent.id) ?? "inactive";
          const hasAccess = status === "active" || status === "trialing";
          const isComingSoon = agent.id === "speed_to_lead";

          return (
            <Card key={agent.id} className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{agent.name}</CardTitle>
                  <Badge variant={hasAccess ? "default" : "secondary"}>
                    {isComingSoon ? "Coming soon" : status}
                  </Badge>
                </div>
                <CardDescription>{agent.shortDescription}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">Monthly price: {MONTHLY_PRICES[agent.id]}</div>
                {isComingSoon ? (
                  <Button disabled variant="outline">
                    Coming soon
                  </Button>
                ) : hasAccess ? (
                  <form action="/api/stripe/portal" method="post">
                    <Button type="submit" variant="outline">
                      Manage billing
                    </Button>
                  </form>
                ) : (
                  <form action="/api/stripe/checkout" method="post">
                    <input type="hidden" name="agent_id" value={agent.id} />
                    <Button type="submit">Activate</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DashboardPage>
  );
}
