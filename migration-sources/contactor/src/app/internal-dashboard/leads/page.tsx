import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import {
  LeadScoreBadge,
  LeadStatusBadge,
  NextStepBadge,
  UrgencyBadge,
} from "@/components/dashboard/status-badge";
import { PageShell } from "@/components/ui/page-shell";
import { getDashboardLeads } from "@/server/services/dashboard.service";

export const dynamic = "force-dynamic";

type LeadsFilter =
  | "all"
  | "hot"
  | "urgent"
  | "qualification_ready"
  | "needs_follow_up"
  | "suppressed_low_intent";

type Props = {
  searchParams?: Promise<{ filter?: string }>;
};

const FILTER_LABELS: Record<LeadsFilter, string> = {
  all: "All leads",
  hot: "Hot",
  urgent: "Urgent",
  qualification_ready: "Qualification ready",
  needs_follow_up: "Needs follow-up",
  suppressed_low_intent: "Suppressed / Low intent",
};

export default async function DashboardLeadsPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const activeFilter = parseFilter(resolvedSearchParams.filter);
  const leads = await getDashboardLeads(100);

  const filterCounts: Record<LeadsFilter, number> = {
    all: leads.length,
    hot: 0,
    urgent: 0,
    qualification_ready: 0,
    needs_follow_up: 0,
    suppressed_low_intent: 0,
  };

  for (const lead of leads) {
    if (lead.scoreBucket === "hot") filterCounts.hot += 1;
    if (lead.isUrgent) filterCounts.urgent += 1;
    if (lead.qualificationReady) filterCounts.qualification_ready += 1;
    if (lead.needsFollowUp) filterCounts.needs_follow_up += 1;
    if (lead.suppressionActive || lead.isLowIntent) filterCounts.suppressed_low_intent += 1;
  }

  const filteredLeads = leads.filter((lead) => matchesFilter(lead, activeFilter));

  return (
    <PageShell
      title="Leads"
      subtitle="Prioritize high-intent leads quickly with score buckets and next-step guidance."
    >
      <section className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as LeadsFilter[]).map((filter) => {
          const selected = filter === activeFilter;
          return (
            <Link
              key={filter}
              href={filter === "all" ? "/admin/leads" : `/admin/leads?filter=${filter}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {FILTER_LABELS[filter]} ({filterCounts[filter]})
            </Link>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Lead</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Intent</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Urgency / Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Score / Action</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Latest activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLeads.length === 0 ? (
              <tr>
                <td className="px-4 py-6" colSpan={5}>
                  <EmptyState
                    title="No leads in this filter"
                    description="Try a different filter to review more leads."
                  />
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-4 py-3 text-slate-900">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="font-medium text-slate-900 underline underline-offset-2"
                    >
                      {lead.fullName ?? "Unknown"}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatSourceLabel(lead.source)} | {lead.phone ?? "No phone"}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    <p className="font-medium text-slate-800">{lead.intent ?? "Unknown intent"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Timing: {lead.preferredTiming ?? "Not provided"}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <UrgencyBadge urgency={lead.urgency} />
                      <LeadStatusBadge status={lead.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Qualification: {lead.qualificationReady ? "Ready" : "In progress"}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadScoreBadge bucket={lead.scoreBucket} />
                      <span className="text-xs font-semibold text-slate-600">{lead.score}/100</span>
                    </div>
                    <div className="mt-2">
                      <NextStepBadge label={lead.recommendedNextStep} />
                    </div>
                    {lead.suppressionActive ? (
                      <p className="mt-1 text-xs text-rose-700">
                        Suppressed{lead.suppressionReason ? `: ${lead.suppressionReason}` : ""}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    <p className="text-sm text-slate-800">
                      {truncatePreview(lead.latestMessagePreview) ?? "No messages yet."}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lead.lastActivityAt.toLocaleString()}
                    </p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </PageShell>
  );
}

function parseFilter(value: string | undefined): LeadsFilter {
  if (
    value === "hot" ||
    value === "urgent" ||
    value === "qualification_ready" ||
    value === "needs_follow_up" ||
    value === "suppressed_low_intent"
  ) {
    return value;
  }
  return "all";
}

function matchesFilter(
  lead: Awaited<ReturnType<typeof getDashboardLeads>>[number],
  filter: LeadsFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "hot") return lead.scoreBucket === "hot";
  if (filter === "urgent") return lead.isUrgent;
  if (filter === "qualification_ready") return lead.qualificationReady;
  if (filter === "needs_follow_up") return lead.needsFollowUp;
  return lead.suppressionActive || lead.isLowIntent;
}

function formatSourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function truncatePreview(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 120) return compact;
  return `${compact.slice(0, 117)}...`;
}

