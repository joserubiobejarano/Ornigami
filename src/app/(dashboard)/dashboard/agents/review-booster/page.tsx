import Link from "next/link";

import { AgentActivationPlaceholder } from "@/components/dashboard/agent-activation-placeholder";
import { requireUser } from "@/lib/auth";
import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { formatProductDate } from "@/lib/format-date";
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

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-card-foreground">Review Booster Dashboard</h1>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-card-foreground shadow-sm">
        Upload completed visits and automatically send warm thank-you emails with a Google review request.
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: in Settings, use the direct Google Maps review link so customers land on the review form immediately.
        </p>
      </section>

      {usagePercent >= 80 && (
        <section className={`rounded-xl border p-4 text-sm ${usagePercent >= 100 ? "border-destructive/35 bg-destructive/10 text-destructive" : "border-accent-yellow/35 bg-accent-yellow/10 text-primary"}`}>
          {usagePercent >= 100
            ? `Monthly review request allowance reached (${monthlyUsage.sent}/${monthlyUsage.allowance}). New eligible visits are being skipped until next month.`
            : `You've used ${monthlyUsage.sent} of ${monthlyUsage.allowance} review requests this month.`}
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-card-foreground">{card.value}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Outcomes</h2>
          <p className="mt-1 text-xs text-muted-foreground">New reviews synced around the same time are shown as context, not guaranteed attribution to these requests.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {outcomeCards.map((card) => (
            <article key={card.label} className="rounded-lg bg-muted p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none text-card-foreground">{card.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <RunFollowupsButton
          disabled={stats.pending === 0 || !business.name.trim()}
          disabledReason={!business.name.trim() ? "Add your business name in Settings before sending follow-ups." : stats.pending === 0 ? "There are no eligible visits to send right now." : undefined}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-4">
          <h2 className="text-2xl font-semibold text-card-foreground">Recent Visits</h2>
        </div>
        {recentVisits.length === 0 ? (
          <div className="px-4 py-6"><p className="text-sm text-muted-foreground">No visits yet for this business.</p><Link href="/dashboard/agents/review-booster/new" className="mt-3 inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Add your first visit</Link></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted text-left text-card-foreground">
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
                  <tr key={visit.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-card-foreground">{visit.customer_name || "-"}</td>
                    <td className="px-4 py-3 text-card-foreground">{visit.customer_email || "-"}</td>
                    <td className="px-4 py-3 text-card-foreground">{visit.service_name || "-"}</td>
                    <td className="px-4 py-3 text-card-foreground">
                      {formatProductDate(visit.visited_at)}
                    </td>
                    <td className="px-4 py-3 text-card-foreground capitalize">{visit.source || "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={visit.followup_status || "pending"} />
                    </td>
                    <td className="max-w-xs px-4 py-3 text-card-foreground">{visit.error_reason || "-"}</td>
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
