import { requireUser } from "@/lib/auth";
import { getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";
import { SummaryCard } from "@/modules/review-booster/components/summary-card";
import {
  getFollowupStats,
  getRecentVisits,
} from "@/modules/review-booster/services/review-booster-db.service";

export default async function ReviewBoosterPage() {
  const session = await requireUser();
  const business = await getOrCreateBusinessForUser(session.user.id);
  const [stats, recentVisits] = await Promise.all([
    getFollowupStats(business.id),
    getRecentVisits(business.id, 20),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader
        title="Review Booster Dashboard"
        description="Send thank-you emails and Google review requests after customer visits."
      >
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
          Business: {business.name}
        </span>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={stats.pending} />
        <SummaryCard label="Sent" value={stats.sent} />
        <SummaryCard label="Failed" value={stats.failed} />
        <SummaryCard label="Skipped" value={stats.skipped} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <RunFollowupsButton />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Recent visits</h2>
        {recentVisits.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No visits yet for this business.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentVisits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {visit.customer_name || "Unknown customer"}
                </span>
                <span className="text-slate-600">
                  {visit.service_name || "Service"} - {visit.followup_status || "pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
