import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { getDashboardAgentAccess } from "@/lib/dashboard-access";
import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";
import { RecentVisitsTable } from "@/modules/review-booster/components/recent-visits-table";
import {
  getFollowupStats,
  getRecentVisitsPage,
  getReviewOutcomeStats,
  getReviewBoosterBillingPeriodUsage,
} from "@/modules/review-booster/services/review-booster-db.service";

export default async function ReviewBoosterPage() {
  const session = await requireUser();
  const { context, entitlement } = await getDashboardAgentAccess(session.user.id, "review_booster");
  const business = context.business;
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

  const [stats, recentVisitsPage, outcomes, monthlyUsage] = await Promise.all([
    getFollowupStats(business.id),
    getRecentVisitsPage(business.id, { limit: 50 }),
    getReviewOutcomeStats(business.id),
    getReviewBoosterBillingPeriodUsage(business.id),
  ]);

  const statCards = [
    { label: "Scheduled", value: stats.pending },
    { label: "Sent", value: stats.sent },
    { label: "Couldn't send", value: stats.failed },
    { label: "Skipped", value: stats.skipped },
  ];

  const usagePercent = monthlyUsage.allowance > 0 ? Math.round((monthlyUsage.used / monthlyUsage.allowance) * 100) : 0;
  const nextUtcMonth = new Date();
  nextUtcMonth.setUTCDate(1);
  nextUtcMonth.setUTCHours(0, 0, 0, 0);
  nextUtcMonth.setUTCMonth(nextUtcMonth.getUTCMonth() + 1);
  const utcResetDate = nextUtcMonth.toISOString().slice(0, 10);

  const outcomeCards = [
    { label: "Requests sent", value: outcomes.requestsSent },
    { label: "Reviews synced", value: outcomes.reviewsSynced },
    { label: "Replies posted", value: outcomes.repliesPosted },
    { label: "Review link clicks", value: outcomes.linkClicks },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <FollowupsNav />

      <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-tint-mint p-7 shadow-ink-md">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-green">Review Booster</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-primary">Follow up with recent customers.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Follow up with recent customers and invite happy ones to leave a review.</p>
        </div>
      </section>

      <section className="rounded-2xl border-[1.5px] border-border bg-card px-5 py-4 text-sm text-primary shadow-ink-sm">
        Follow up with recent customers and invite happy ones to leave a review.
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: in Settings, use the direct Google Maps review link so customers land on the review form immediately.
        </p>
      </section>

      {usagePercent >= 80 && (
        <section className={`rounded-2xl border-[1.5px] p-4 text-sm ${usagePercent >= 100 ? "border-destructive/35 bg-destructive/10 text-destructive" : "border-accent-marigold/35 bg-accent-marigold/10 text-primary"}`}>
          {usagePercent >= 100
            ? `Your monthly review request allowance is full (${monthlyUsage.used}/${monthlyUsage.allowance} used). New eligible visits will wait until the UTC reset on ${utcResetDate}.`
            : `You've used ${monthlyUsage.used} of ${monthlyUsage.allowance} review requests this month.`}
          <p className="mt-2 text-xs">Usage includes accepted sends and reserved deliveries. Unknown deliveries keep their reservation until reconciled.</p>
          <p className="mt-1 text-xs">Visits waiting for quota can only send before they reach seven days old.</p>
        </section>
      )}

      {monthlyUsage.allowance > 0 && usagePercent < 80 && (
        <p className="text-xs text-muted-foreground">Monthly usage: {monthlyUsage.used} of {monthlyUsage.allowance} (including {monthlyUsage.reserved} reserved). Resets at 00:00 UTC on {utcResetDate}. Unknown deliveries keep their reservation until reconciled.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-card-foreground">{card.value}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-ink-sm">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Outcomes</h2>
          <p className="mt-1 text-xs text-muted-foreground">New reviews synced around the same time are shown as context, not guaranteed attribution to these requests.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {outcomeCards.map((card) => (
            <article key={card.label} className="rounded-xl border-[1.5px] border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none text-card-foreground">{card.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
        <RunFollowupsButton
          disabled={!business.name.trim()}
          disabledReason={!business.name.trim() ? "Add your business name in Settings before sending follow-ups." : undefined}
        />
      </div>

      <RecentVisitsTable
        key={business.id}
        businessId={business.id}
        initialVisits={recentVisitsPage.items}
        initialPage={recentVisitsPage.page}
      />
    </div>
  );
}
