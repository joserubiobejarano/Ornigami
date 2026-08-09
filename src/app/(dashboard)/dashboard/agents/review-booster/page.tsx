import Link from "next/link";

import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { RunFollowupsButton } from "@/modules/review-booster/components/run-followups-button";
import { StatusBadge } from "@/modules/review-booster/components/status-badge";
import {
  getFollowupStats,
  getRecentVisits,
  getReviewOutcomeStats,
  getReviewBoosterMonthlyUsage,
} from "@/modules/review-booster/services/review-booster-db.service";

export default async function ReviewBoosterPage() {
  const session = await requireUser();
  let business;
  try {
    business = await getOrCreateBusinessForUser(session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("Could not resolve user in public.users") &&
      session.user.email
    ) {
      business = await getOrCreateBusinessForUser(session.user.email);
    } else {
      throw error;
    }
  }
  const hasAccess = await canAccessAgent(business.id, "review_booster");
  if (!hasAccess) {
    return (
      <AgentActivationPlaceholder
        agentId="review_booster"
        agentName="Review Booster"
        description="Post-visit review request automations."
      />
    );
  }

  const [stats, recentVisits, outcomes, monthlyUsage] = await Promise.all([
    getFollowupStats(business.id),
    getRecentVisits(business.id, 20),
    getReviewOutcomeStats(business.id),
    getReviewBoosterMonthlyUsage(business.id),
  ]);

  const statCards = [
    { label: "Pending", value: stats.pending },
    { label: "Sent", value: stats.sent },
    { label: "Failed", value: stats.failed },
    { label: "Skipped", value: stats.skipped },
  ];

  const usagePercent = monthlyUsage.allowance > 0 ? Math.round((monthlyUsage.sent / monthlyUsage.allowance) * 100) : 0;

  const outcomeCards = [
    { label: "Requests sent", value: outcomes.requestsSent },
    { label: "Reviews synced", value: outcomes.reviewsSynced },
    { label: "Replies posted", value: outcomes.repliesPosted },
    { label: "Review link clicks", value: outcomes.linkClicks },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Review Booster Dashboard</h1>
        </div>
        <Link
          href="/dashboard/agents/review-booster/new"
          className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Add Visit
        </Link>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-800 shadow-sm">
        Upload completed visits and automatically send warm thank-you emails with a Google review request.
        <p className="mt-2 text-xs text-slate-600">
          Tip: in Settings, use the direct Google Maps review link so customers land on the review form immediately.
        </p>
      </section>

      {usagePercent >= 80 && (
        <section className={`rounded-xl border p-4 text-sm ${usagePercent >= 100 ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {usagePercent >= 100
            ? `Monthly review request allowance reached (${monthlyUsage.sent}/${monthlyUsage.allowance}). New eligible visits are being skipped until next month.`
            : `You've used ${monthlyUsage.sent} of ${monthlyUsage.allowance} review requests this month.`}
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Outcomes</h2>
          <p className="mt-1 text-xs text-slate-600">Reviews synced are shown as an operating signal, not guaranteed attribution to these requests.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {outcomeCards.map((card) => (
            <article key={card.label} className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none text-slate-900">{card.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <RunFollowupsButton />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="text-2xl font-semibold text-slate-900">Recent Visits</h2>
        </div>
        {recentVisits.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-600">No visits yet for this business.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-900">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Visited At</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Error Reason</th>
                </tr>
              </thead>
              <tbody>
                {recentVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-slate-200 last:border-b-0">
                    <td className="px-4 py-3 text-slate-900">{visit.customer_name || "-"}</td>
                    <td className="px-4 py-3 text-slate-900">{visit.customer_email || "-"}</td>
                    <td className="px-4 py-3 text-slate-900">{visit.service_name || "-"}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {new Date(visit.visited_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-900 capitalize">{visit.source || "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={visit.followup_status || "pending"} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-900">{visit.error_reason || "-"}</td>
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
