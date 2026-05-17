import Link from "next/link";

import { DashboardPage } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents, getOrCreateBusinessForUser } from "@/lib/db/businesses";
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
  } catch {
    // Keep dashboard functional for legacy/misaligned sessions.
  }

  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Ornigami</h1>
        <p className="text-sm text-foreground">Manage your AI agents for local business growth.</p>
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
                    <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      Active
                    </Badge>
                  ) : (
                    <Badge className="border border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
                      Not active
                    </Badge>
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
                  <Button asChild className="bg-[#0f172b] text-white hover:opacity-90">
                    <Link href={agent.basePath}>
                      Open agent
                    </Link>
                  </Button>
                ) : (
                  <form action="/api/stripe/checkout" method="post">
                    <input type="hidden" name="agent_id" value={agent.id} />
                    <Button type="submit" className="bg-[#0f172b] text-white hover:opacity-90">
                      Activate
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div>
        <Button asChild className="bg-[#0f172b] text-white hover:opacity-90">
          <Link href="/dashboard/billing">Billing & subscriptions</Link>
        </Button>
      </div>
    </DashboardPage>
  );
}
