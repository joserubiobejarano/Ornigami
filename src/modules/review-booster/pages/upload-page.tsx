"use client";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

export default function ReviewBoosterUploadPagePlaceholder() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Upload Visits (Placeholder)" description="Imported upload UI logic is staged in this module; API route activation is pending." backToOverview />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        Placeholder page for CSV upload flow.
      </div>
    </div>
  );
}