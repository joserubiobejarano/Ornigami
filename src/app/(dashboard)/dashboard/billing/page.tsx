import { BillingPlanOptions } from "@/components/billing/billing-plan-options";
import { DashboardPage } from "@/components/dashboard";
import { ChangePlanButton } from "@/components/dashboard/change-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";
import { PLANS, formatPrice, isPlanId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";

export default async function BillingPage() {
  const session = await requireUser();
  const resolvedRows = await sql`SELECT id FROM public.users WHERE lower(email) = lower(${session.user.email}) LIMIT 1`;
  const canonicalUserId = (resolvedRows[0] as { id: string } | undefined)?.id ?? session.user.id;
  const business = await getOrCreateBusinessForUser(canonicalUserId);
  const agents = await getBusinessAgents(business.id);
  const activeAgent = agents.find((agent) => ["active", "trialing", "past_due"].includes(agent.status) && isPlanId(agent.plan_id));
  const currentPlan: PlanId | null = activeAgent && isPlanId(activeAgent.plan_id) ? activeAgent.plan_id : null;
  const period: BillingPeriod = activeAgent?.billing_period === "annual" ? "annual" : "monthly";

  return (
    <DashboardPage width="lg" className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Billing & subscriptions</h1>
        <p className="text-sm text-muted-foreground">Plans are per location. Business: {business.name}</p>
      </div>

      {currentPlan ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{PLANS[currentPlan].name}</CardTitle>
              <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-800">{activeAgent?.status}</Badge>
            </div>
            <CardDescription>{formatPrice(currentPlan, period)} / {period === "annual" ? "year" : "month"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <form action="/api/stripe/portal" method="post"><Button type="submit" variant="outline">Manage billing</Button></form>
            {currentPlan !== "complete" ? <ChangePlanButton planId="complete" billingPeriod={period} /> : null}
          </CardContent>
        </Card>
      ) : null}

      <BillingPlanOptions currentPlan={currentPlan} currentPeriod={period} />
    </DashboardPage>
  );
}
