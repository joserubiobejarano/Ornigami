import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { LeadStatusBadge } from "@/components/dashboard/status-badge";
import { PageShell } from "@/components/ui/page-shell";
import { getDashboardOverviewData } from "@/server/services/dashboard.service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const overview = await getDashboardOverviewData();

  return (
    <PageShell
      title="Dashboard"
      subtitle="Internal MVP view for the seeded demo business."
    >
      {!overview ? (
        <EmptyState
          title="No seeded demo business found"
          description="Run the seed script to load demo data, then refresh this dashboard."
        />
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Total leads" value={overview.totalLeads} />
            <MetricCard
              label="Recent conversations"
              value={overview.recentConversations.length}
            />
            <MetricCard label="Business" value={overview.business.name} />
          </section>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-900">Leads by status</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {overview.leadsByStatus.map((statusRow) => (
                <div
                  key={statusRow.status}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <LeadStatusBadge status={statusRow.status} />
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{statusRow.count}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Recent conversations</h2>
              <Link
                href="/admin/leads"
                className="text-sm font-medium text-slate-700 underline underline-offset-2"
              >
                View all leads
              </Link>
            </div>

            <div className="mt-3 space-y-2">
              {overview.recentConversations.length === 0 ? (
                <EmptyState
                  title="No conversations yet"
                  description="Conversations will appear here after a lead sends a message."
                />
              ) : (
                overview.recentConversations.map((conversation) => (
                  <article
                    key={conversation.id}
                    className="rounded-md border border-slate-200 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {conversation.leadName ?? "Unknown lead"}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        {conversation.channel}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {conversation.latestMessage?.body ?? "No messages yet."}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{conversation.leadPhone ?? "No phone"}</span>
                      <Link
                        href={`/admin/leads/${conversation.leadId}`}
                        className="font-medium text-slate-700 underline underline-offset-2"
                      >
                        Open lead
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}

