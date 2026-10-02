import Link from "next/link";

import { FollowupsNav } from "@/components/followups/followups-nav";
import { PageHeader } from "@/components/followups/page-header";
import { RunFollowupsButton } from "@/components/followups/run-followups-button";
import { StatusBadge } from "@/components/followups/status-badge";
import { SummaryCard } from "@/components/followups/summary-card";
import { buttonStyles } from "@/components/followups/button";
import { getFirstBusiness, getFollowupStats, getRecentVisits } from "@/server/services/followups";

export const dynamic = "force-dynamic";

export default async function FollowupsDashboardPage() {
  const business = await getFirstBusiness();
  const stats = await getFollowupStats(business?.id);
  const recentVisits = await getRecentVisits(20, business?.id);
  const settingsIncomplete = !business || !business.name?.trim() || !business.google_review_url;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Review Booster" description="Follow up with recent customers and invite happy ones to leave a review.">
        <Link className={buttonStyles("primary")} href="/dashboard/followups/new">Add a visit</Link>
      </PageHeader>

      <section className="rounded-2xl border-[1.5px] border-border bg-tint-mint p-5 text-sm text-primary shadow-ink-sm">
        Add a visit or upload a list, then run the campaign when you are ready. Nothing sends until you confirm.
      </section>

      {settingsIncomplete ? (
        <section className="rounded-2xl border-[1.5px] border-accent-marigold/35 bg-tint-butter p-4 text-sm text-primary shadow-ink-sm">
          Add your business name and Google review URL in Settings before sending follow-ups.
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Scheduled" value={stats.pending} />
        <SummaryCard label="Sent" value={stats.sent} />
        <SummaryCard label="Couldn't send" value={stats.failed} />
        <SummaryCard label="Skipped" value={stats.skipped} />
      </div>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-ink-sm">
        <RunFollowupsButton
          disabled={stats.pending === 0 || settingsIncomplete}
          disabledReason={settingsIncomplete ? "Add your business name and Google review URL in Settings before sending." : stats.pending === 0 ? "There are no eligible visits to send right now." : undefined}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border-[1.5px] border-border bg-card shadow-ink-sm">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-2xl font-semibold text-card-foreground">Recent visits</h2>
        </div>
        {recentVisits.length === 0 ? (
          <div className="space-y-4 px-5 py-8 text-sm text-muted-foreground">
            <p>No visits yet. Add a visit or upload a list to send your first follow-up.</p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonStyles("primary")} href="/dashboard/followups/new">Add a visit</Link>
              <Link className={buttonStyles("outline")} href="/dashboard/followups/upload">Upload visits</Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-surface text-left text-primary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Visit date</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Why it didn&apos;t send</th>
                </tr>
              </thead>
              <tbody>
                {recentVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-card-foreground">{visit.customer_name || "-"}</td>
                    <td className="px-4 py-3 text-card-foreground">{visit.customer_email || "-"}</td>
                    <td className="px-4 py-3 text-card-foreground">{visit.service_name || "-"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-card-foreground">{new Date(visit.visited_at).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize text-card-foreground">{visit.source || "-"}</td>
                    <td className="px-4 py-3"><StatusBadge status={visit.followup_status} /></td>
                    <td className="max-w-xs px-4 py-3 text-card-foreground">{visit.followup_error_reason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
