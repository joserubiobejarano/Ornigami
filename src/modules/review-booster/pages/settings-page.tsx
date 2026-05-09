"use client";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

export default function ReviewBoosterSettingsPagePlaceholder() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings (Placeholder)" backToOverview />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        Placeholder page for Review Booster business settings.
      </div>
    </div>
  );
}