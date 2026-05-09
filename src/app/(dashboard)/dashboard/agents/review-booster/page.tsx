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
        agentName="Review Booster"
        description="Post-visit review request automations."
      />
    );
  }

  const [stats, recentVisits] = await Promise.all([
    getFollowupStats(business.id),
    getRecentVisits(business.id, 20),
  ]);

  const statCards = [
    { label: "Pending", value: stats.pending },
    { label: "Sent", value: stats.sent },
    { label: "Failed", value: stats.failed },
    { label: "Skipped", value: stats.skipped },
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
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-slate-900">{card.value}</p>
          </article>
        ))}
      </div>

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
                    <td className="px-4 py-3 text-slate-900">-</td>
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
