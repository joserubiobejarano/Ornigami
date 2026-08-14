import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { SummaryCard } from "@/modules/review-booster/components/summary-card";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";

export default function ReviewBoosterDashboardPagePlaceholder() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Review Booster" description="Follow up with recent customers and invite happy ones to leave a review." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Scheduled" value={0} />
        <SummaryCard label="Sent" value={0} />
        <SummaryCard label="Couldn't send" value={0} />
        <SummaryCard label="Skipped" value={0} />
      </div>
      <div className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
        <RunFollowupsButton />
      </div>
    </div>
  );
}
