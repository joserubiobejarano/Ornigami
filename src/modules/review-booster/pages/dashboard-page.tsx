import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { SummaryCard } from "@/modules/review-booster/components/summary-card";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";

export default function ReviewBoosterDashboardPagePlaceholder() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Review Booster Dashboard (Placeholder)" description="Imported from legacy Follow-Up app. Route and data wiring pending." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={0} />
        <SummaryCard label="Sent" value={0} />
        <SummaryCard label="Failed" value={0} />
        <SummaryCard label="Skipped" value={0} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <RunFollowupsButton />
      </div>
    </div>
  );
}