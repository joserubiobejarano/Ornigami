import Link from "next/link";

import { DashboardCallout, DashboardPage, DashboardPageHeader, StatusBadge } from "@/components/dashboard";
import { ActivationChecklist, type ActivationChecklistStep } from "@/components/dashboard/activation-checklist";
import { ChangePlanButton } from "@/components/dashboard/change-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { requireUser } from "@/lib/auth";
import { getBusinessAgents } from "@/lib/db/businesses";
import { userHasGbpConnection } from "@/lib/db/gbp";
import { sql } from "@/lib/db/neon";
import { getDashboardMetrics } from "@/lib/dashboard-metrics";
import { isPlanId, type BillingPeriod, type PlanId } from "@/lib/billing/plans";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";
import { getBusinessPlanInfo } from "@/lib/plan-server";

export default async function DashboardPageRoute() {
  const session = await requireUser();
  const metrics = await getDashboardMetrics();

  let businessName: string | null = null;
  let agentAccessById = new Map<string, boolean>();
  let activationSteps: ActivationChecklistStep[] = [];
  let currentPlan: PlanId | null = null;
  let currentBillingPeriod: BillingPeriod = "monthly";
  let hasActiveAgent = false;
  let isWorkspaceOwner = false;
  let hasWorkspaceContext = false;
  try {
    const { context, entitlement: boosterPlan } = await getDashboardAgentAccess(session.user.id, "review_booster");
    const business = context.business;
    isWorkspaceOwner = context.role === "owner";
    businessName = business.name;
    const businessAgents = await getBusinessAgents(business.id);
    const repliesPlan = await getBusinessPlanInfo(context, "review_replies");
    agentAccessById = new Map([
      ["review_booster", boosterPlan.hasAccess],
      ["review_replies", repliesPlan.hasAccess],
    ]);
    const activeSubscriptionAgent = businessAgents.find(
      (row) => agentAccessById.get(row.agent_id) && isPlanId(row.plan_id),
    );
    if (activeSubscriptionAgent && isPlanId(activeSubscriptionAgent.plan_id)) {
      currentPlan = activeSubscriptionAgent.plan_id;
      currentBillingPeriod = activeSubscriptionAgent.billing_period === "annual" ? "annual" : "monthly";
    }
    const hasBooster = agentAccessById.get("review_booster") ?? false;
    const hasReplies = agentAccessById.get("review_replies") ?? false;
    hasActiveAgent = hasBooster || hasReplies;
    const hasTone = Boolean((business as { tone?: string | null }).tone?.trim());
    const visitRows = hasBooster
      ? await sql`SELECT count(*)::int AS count FROM public.followup_visits WHERE business_id = ${business.id}`
      : [];
    const hasVisits = Number((visitRows[0] as { count?: number } | undefined)?.count ?? 0) > 0;
    const hasGbp = hasReplies ? await userHasGbpConnection(context.integrationOwnerUserId) : false;
    hasWorkspaceContext = true;
    if (hasBooster || hasReplies) {
      activationSteps = [
        ...(hasBooster
          ? [
              {
                label: "Send your first follow-up",
                description: "Add a visit or upload a list to invite a happy customer to leave a review.",
                complete: metrics.followupsSent > 0,
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
                label: hasGbp ? "Google profile connected" : "Connect your Google profile",
                description: hasGbp
                  ? "The workspace owner has connected Google Business Profile."
                  : isWorkspaceOwner
                    ? "Connect Google Business Profile so Review Replies can sync and draft replies."
                    : "Ask the workspace owner to connect Google Business Profile so Review Replies can sync and draft replies.",
                complete: hasGbp,
                href: isWorkspaceOwner ? "/connect" : undefined,
                actionLabel: isWorkspaceOwner ? "Connect Google" : undefined,
              },
              {
                label: "Set your reply tone",
                description: isWorkspaceOwner
                  ? "Give drafts a little context so they sound more like your business."
                  : "The workspace owner can set the reply tone for everyone.",
                complete: hasTone,
                href: isWorkspaceOwner ? "/settings" : undefined,
                actionLabel: isWorkspaceOwner ? "Set tone" : undefined,
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
    // Keep the shell usable without treating a failed access check as a free workspace.
  }

  return (
    <DashboardPage width="lg" className="space-y-6">
      <DashboardPageHeader
        kicker="Your workspace"
        title={`Welcome back, ${session.user.name?.split(" ")[0] ?? "there"}.`}
        description={businessName ? `Your review and follow-up work, in one calm place · ${businessName}` : "Your review and follow-up work, in one calm place."}
      />

      {metrics.criticalError ? <DashboardCallout variant="error"><p>{metrics.criticalError}</p></DashboardCallout> : null}

      {!hasWorkspaceContext ? (
        <DashboardCallout variant="error">
          <p>We couldn&apos;t verify your workspace. Refresh the page to try again.</p>
        </DashboardCallout>
      ) : !hasActiveAgent ? (
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
              {isWorkspaceOwner ? <Button asChild variant="accent" className="shrink-0">
                <Link href="/pricing">Start free trial</Link>
              </Button> : <p className="text-sm font-medium text-muted-foreground">Ask your workspace owner to activate a plan.</p>}
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

      {hasWorkspaceContext ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Replies posted · this UTC month", metrics.repliesPostedThisMonth, "bg-tint-navy"],
          ["Awaiting your approval", metrics.unansweredReviews, "bg-tint-butter"],
          ["Follow-ups sent · all time", metrics.followupsSent, "bg-tint-peach"],
        ].map(([label, value, tint]) => <Card key={String(label)} className={`border-[1.5px] border-border ${tint} shadow-ink-sm`}><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-primary">{value}</p></CardContent></Card>)}
      </div> : null}

      {hasWorkspaceContext ? <div className="grid gap-4 md:grid-cols-3">
        {AGENT_REGISTRY.map((agent) => {
          const canOpen = agentAccessById.get(agent.id) ?? false;
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
                ) : isWorkspaceOwner ? (
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
                ) : (
                  <p className="text-sm text-muted-foreground">Ask the workspace owner to activate this agent.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div> : null}

      {hasWorkspaceContext ? <ActivationChecklist steps={activationSteps} /> : null}

      {hasWorkspaceContext && isWorkspaceOwner ? <div><Button asChild variant="secondary"><Link href="/dashboard/billing">Plan & billing</Link></Button></div> : null}
    </DashboardPage>
  );
}
