import Link from "next/link";

import { Button } from "@/components/ui/button";
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
  getReviewBoosterBillingPeriodUsage,
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
    getReviewBoosterBillingPeriodUsage(business.id),
  ]);

  const statCards = [
    { label: "Scheduled", value: stats.pending },
    { label: "Sent", value: stats.sent },
    { label: "Couldn't send", value: stats.failed },
    { label: "Skipped", value: stats.skipped },
  ];

  const usagePercent = monthlyUsage.allowance > 0 ? Math.round((monthlyUsage.used / monthlyUsage.allowance) * 100) : 0;
  const nextUtcMonth = new Date();
  nextUtcMonth.setUTCDate(1);
  nextUtcMonth.setUTCHours(0, 0, 0, 0);
  nextUtcMonth.setUTCMonth(nextUtcMonth.getUTCMonth() + 1);
  const utcResetDate = nextUtcMonth.toISOString().slice(0, 10);

  const outcomeCards = [
    { label: "Requests sent", value: outcomes.requestsSent },
    { label: "Reviews synced", value: outcomes.reviewsSynced },
    { label: "Replies posted", value: outcomes.repliesPosted },
    { label: "Review link clicks", value: outcomes.linkClicks },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <FollowupsNav />

      <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-tint-mint p-7 shadow-ink-md">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-green">Review Booster</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-primary">Follow up with recent customers.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Follow up with recent customers and invite happy ones to leave a review.</p>
        </div>
      </section>

      <section className="rounded-2xl border-[1.5px] border-border bg-card px-5 py-4 text-sm text-primary shadow-ink-sm">
        Follow up with recent customers and invite happy ones to leave a review.
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: in Settings, use the direct Google Maps review link so customers land on the review form immediately.
        </p>
      </section>

      {usagePercent >= 80 && (
        <section className={`rounded-2xl border-[1.5px] p-4 text-sm ${usagePercent >= 100 ? "border-destructive/35 bg-destructive/10 text-destructive" : "border-accent-marigold/35 bg-accent-marigold/10 text-primary"}`}>
          {usagePercent >= 100
            ? `Your monthly review request allowance is full (${monthlyUsage.used}/${monthlyUsage.allowance} used). New eligible visits will wait until the UTC reset on ${utcResetDate}.`
            : `You've used ${monthlyUsage.used} of ${monthlyUsage.allowance} review requests this month.`}
          <p className="mt-2 text-xs">Usage includes accepted sends and reserved deliveries. Unknown deliveries keep their reservation until reconciled.</p>
          <p className="mt-1 text-xs">Visits waiting for quota can only send before they reach seven days old.</p>
        </section>
      )}

      {monthlyUsage.allowance > 0 && usagePercent < 80 && (
        <p className="text-xs text-muted-foreground">Monthly usage: {monthlyUsage.used} of {monthlyUsage.allowance} (including {monthlyUsage.reserved} reserved). Resets at 00:00 UTC on {utcResetDate}. Unknown deliveries keep their reservation until reconciled.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold leading-none text-card-foreground">{card.value}</p>
          </article>
        ))}
      </div>

      <section className="space-y-3 rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-ink-sm">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Outcomes</h2>
          <p className="mt-1 text-xs text-muted-foreground">New reviews synced around the same time are shown as context, not guaranteed attribution to these requests.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {outcomeCards.map((card) => (
            <article key={card.label} className="rounded-xl border-[1.5px] border-border bg-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold leading-none text-card-foreground">{card.value}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border-[1.5px] border-border bg-card p-4 shadow-ink-sm">
        <RunFollowupsButton
          disabled={!business.name.trim()}
          disabledReason={!business.name.trim() ? "Add your business name in Settings before sending follow-ups." : undefined}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border-[1.5px] border-border bg-card shadow-ink-sm">
        <div className="border-b border-border px-4 py-4">
          <h2 className="text-2xl font-semibold text-card-foreground">Recent visits</h2>
        </div>
        {recentVisits.length === 0 ? (
          <div className="px-4 py-6"><p className="text-sm text-muted-foreground">No visits yet for this business.</p><Button asChild className="mt-3"><Link href="/dashboard/agents/review-booster/new">Add your first visit</Link></Button></div>
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
                    <td className="px-4 py-3 text-card-foreground">
                      {formatProductDate(visit.visited_at)}
                    </td>
                    <td className="px-4 py-3 text-card-foreground capitalize">{visit.source || "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={visit.followup_status || "pending"} />
                      {visit.followup_status === "deferred_quota" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Waiting for quota; eligibility expires {new Date(new Date(visit.visited_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC.
                        </p>
                      )}
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
