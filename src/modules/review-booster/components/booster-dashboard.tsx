import { DashboardCallout, DashboardPage, DashboardPageHeader } from "@/components/dashboard";
import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";
import { RecentVisitsTable } from "@/modules/review-booster/components/recent-visits-table";
import type { FollowupStats, FollowupVisit } from "@/modules/review-booster/types/followup.types";
import type { ReviewBoosterBillingPeriodUsage, ReviewOutcomeStats } from "@/modules/review-booster/services/review-booster-db.service";

type BoosterDashboardProps = {
  business: { id: string; name: string };
  stats: FollowupStats;
  outcomes: ReviewOutcomeStats;
  monthlyUsage: ReviewBoosterBillingPeriodUsage;
  recentVisitsPage: { items: FollowupVisit[]; page: { nextCursor: string | null; hasMore: boolean } };
  reconciliationEnabled?: boolean;
};

export function BoosterDashboard({ business, stats, outcomes, monthlyUsage, recentVisitsPage, reconciliationEnabled = false }: BoosterDashboardProps) {
  const usagePercent = monthlyUsage.allowance > 0 ? (monthlyUsage.used / monthlyUsage.allowance) * 100 : 0;
  const nextUtcMonth = new Date();
  nextUtcMonth.setUTCDate(1);
  nextUtcMonth.setUTCHours(0, 0, 0, 0);
  nextUtcMonth.setUTCMonth(nextUtcMonth.getUTCMonth() + 1);
  const utcResetDate = nextUtcMonth.toISOString().slice(0, 10);
  const statCards = [
    { label: "Scheduled", value: stats.pending },
    { label: "Accepted by provider", value: stats.sent },
    { label: "Couldn't send", value: stats.failed },
    { label: "Skipped", value: stats.skipped },
  ];
  const outcomeCards = [
    { label: "Requests accepted by provider", value: outcomes.requestsSent },
    { label: "Reviews synced", value: outcomes.reviewsSynced },
    { label: "Replies posted", value: outcomes.repliesPosted },
    { label: "Review link clicks", value: outcomes.linkClicks },
  ];

  return (
    <DashboardPage width="lg">
      <FollowupsNav />
      <DashboardPageHeader
        kicker="Review Booster"
        title="Keep the conversation going."
        description="Invite recent customers to share a review after their visit."
      >
        <RunFollowupsButton
          disabled={!business.name.trim()}
          disabledReason={!business.name.trim() ? "Add your business name in Settings before sending follow-ups." : undefined}
        />
      </DashboardPageHeader>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm sm:p-5" aria-label="Follow-up summary">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label}>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-primary">{card.value}</p>
            </div>
          ))}
        </div>
        {monthlyUsage.allowance > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <p className="font-medium text-primary">Monthly requests: {monthlyUsage.used} / {monthlyUsage.allowance}</p>
              <p>UTC reset: {utcResetDate}, 00:00</p>
            </div>
            <progress
              className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-surface [&::-webkit-progress-value]:bg-accent-green [&::-moz-progress-bar]:bg-accent-green"
              value={Math.min(monthlyUsage.used, monthlyUsage.allowance)}
              max={monthlyUsage.allowance}
              aria-label="Monthly review request usage"
            />
            <details>
              <summary className="w-fit cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Usage details</summary>
              <p className="mt-2 leading-relaxed">Includes {monthlyUsage.reserved} reserved deliveries. Unknown deliveries keep their reservation until reconciled. Visits waiting for quota can only send before they reach seven days old.</p>
            </details>
          </div>
        )}
      </section>

      {usagePercent >= 80 && (
        <DashboardCallout variant="warning" title={usagePercent >= 100 ? "Monthly allowance reached" : "Approaching your monthly allowance"}>
          <p>{usagePercent >= 100
            ? `${monthlyUsage.used}/${monthlyUsage.allowance} used. Eligible visits wait until the UTC reset on ${utcResetDate}; visits older than seven days cannot send.`
            : `${monthlyUsage.used} of ${monthlyUsage.allowance} requests used. Your allowance resets on ${utcResetDate} at 00:00 UTC.`}</p>
        </DashboardCallout>
      )}

      <RecentVisitsTable
        key={business.id}
        businessId={business.id}
        initialVisits={recentVisitsPage.items}
        initialPage={recentVisitsPage.page}
        reconciliationEnabled={reconciliationEnabled}
      />

      <details className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm sm:p-5">
        <summary className="cursor-pointer rounded font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Review activity</summary>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Workspace totals provide context; reviews aren&apos;t necessarily the result of these requests.</p>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {outcomeCards.map((card) => (
            <div key={card.label}>
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-primary">{card.value}</p>
            </div>
          ))}
        </div>
      </details>
    </DashboardPage>
  );
}
