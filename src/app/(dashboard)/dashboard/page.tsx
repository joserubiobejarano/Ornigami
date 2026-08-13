import Link from "next/link";

import { DashboardPage, DashboardPageHeader, StatusBadge } from "@/components/dashboard";
import { ActivationChecklist, type ActivationChecklistStep } from "@/components/dashboard/activation-checklist";
import { ChangePlanButton } from "@/components/dashboard/change-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { userHasGbpConnection } from "@/lib/db/gbp";
import { sql } from "@/lib/db/neon";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { isPlanId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";

export default async function DashboardPageRoute() {
  const session = await requireUser();
  const metrics = await getDashboardMetrics();
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
  let currentPlan: PlanId | null = null;
  let currentBillingPeriod: BillingPeriod = "monthly";
  let hasActiveAgent = false;
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
    const activeSubscriptionAgent = businessAgents.find(
      (row) => ["active", "trialing", "past_due"].includes(row.status) && isPlanId(row.plan_id),
    );
    if (activeSubscriptionAgent && isPlanId(activeSubscriptionAgent.plan_id)) {
      currentPlan = activeSubscriptionAgent.plan_id;
      currentBillingPeriod = activeSubscriptionAgent.billing_period === "annual" ? "annual" : "monthly";
    }
    const hasBooster = ["active", "trialing", "past_due"].includes(agentStatusById.get("review_booster") ?? "");
    const hasReplies = ["active", "trialing", "past_due"].includes(agentStatusById.get("review_replies") ?? "");
    hasActiveAgent = hasBooster || hasReplies;
    const hasTone = Boolean((business as { tone?: string | null }).tone?.trim());
    const visitRows = hasBooster
      ? await sql`SELECT count(*)::int AS count FROM public.followup_visits WHERE business_id = ${business.id}`
      : [];
    const hasVisits = Number((visitRows[0] as { count?: number } | undefined)?.count ?? 0) > 0;
    const hasGbp = hasReplies ? await userHasGbpConnection(canonicalUserId) : true;
    if (hasBooster || hasReplies) {
      activationSteps = [
        ...(hasBooster
          ? [
              {
                label: "Send your first follow-up",
                description: "Add a visit or upload a list to invite a happy customer to leave a review.",
                complete: metrics.postsUsed > 0,
                href: "/dashboard/agents/review-booster/new",
                actionLabel: "Add visit",
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
                label: "Connect your Google profile",
                description: "Connect your profile so Review Replies can sync and draft replies.",
                complete: hasGbp,
                href: "/connect",
                actionLabel: "Connect Google",
              },
              {
                label: "Set your reply tone",
                description: "Give drafts a little context so they sound more like your business.",
                complete: hasTone,
                href: "/settings",
                actionLabel: "Set tone",
              },
              {
                label: "Approve your first reply",
                description: "Review a draft and send it when it feels right.",
                complete: metrics.repliesPostedThisMonth > 0,
                href: "/reviews",
                actionLabel: "Open inbox",
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
      <DashboardPageHeader
        kicker="Your workspace"
        title={`Welcome back, ${session.user.name?.split(" ")[0] ?? "there"}.`}
        description={businessName ? `Your review and follow-up work, in one calm place · ${businessName}` : "Your review and follow-up work, in one calm place."}
      />

      {!hasActiveAgent ? (
        <Card className="border-[1.5px] border-navy/25 bg-tint-navy shadow-ink-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge variant="secondary">Start here</Badge>
                <CardTitle className="mt-3 text-xl">Choose the quiet work you want Ornigami to handle.</CardTitle>
                <CardDescription className="mt-2 max-w-2xl">
                  Start with one agent today, or explore a demo first. You&apos;ll keep the final say on what gets sent or posted.
                </CardDescription>
              </div>
              <Button asChild variant="accent" className="shrink-0">
                <Link href="/pricing">Start free trial</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-[1.5px] border-border bg-card/80 shadow-none">
                <CardHeader>
                  <CardTitle>Review Replies</CardTitle>
                  <CardDescription>Bring Google reviews into one inbox and draft thoughtful replies in your voice.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Button asChild size="sm">
                    <Link href="/review-replies">See Review Replies</Link>
                  </Button>
                  <Button asChild size="sm" variant="link">
                    <Link href="/demo-review-replies">Try the demo</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="border-[1.5px] border-border bg-card/80 shadow-none">
                <CardHeader>
                  <CardTitle>Review Booster</CardTitle>
                  <CardDescription>Send a gentle follow-up after a visit so happy customers can leave a review.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Button asChild size="sm">
                    <Link href="/review-booster">See Review Booster</Link>
                  </Button>
                  <Button asChild size="sm" variant="link">
                    <Link href="/demo-review-booster">Try the demo</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Reviews answered", metrics.repliesPostedThisMonth, "bg-tint-navy"],
          ["Awaiting your approval", metrics.unansweredReviews, "bg-tint-butter"],
          ["Follow-ups sent", metrics.postsUsed, "bg-tint-peach"],
        ].map(([label, value, tint]) => <Card key={String(label)} className={`border-[1.5px] border-border ${tint} shadow-ink-sm`}><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-primary">{value}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {AGENT_REGISTRY.map((agent) => {
          const agentStatus = agentStatusById.get(agent.id);
          const canOpen = ["active", "trialing", "past_due"].includes(agentStatus ?? "");
          const isComingSoon = agent.id === "speed_to_lead";

          return (
            <Card key={agent.id} className="border-[1.5px] border-border bg-card shadow-ink-sm transition-transform hover:-translate-y-1 hover:shadow-ink-md">
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
                  currentPlan && currentPlan !== "complete" ? (
                    <ChangePlanButton planId="complete" billingPeriod={currentBillingPeriod} label="Upgrade to Complete" />
                  ) : (
                    <form action="/api/stripe/checkout" method="post">
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <Button type="submit" variant="accent">
                        Activate
                      </Button>
                    </form>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ActivationChecklist steps={activationSteps} />

      <div><Button asChild variant="secondary"><Link href="/dashboard/billing">Plan & billing</Link></Button></div>
    </DashboardPage>
  );
}
