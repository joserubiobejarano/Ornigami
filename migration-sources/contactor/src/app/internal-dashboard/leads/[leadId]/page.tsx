import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/dashboard/empty-state";
import {
  LeadScoreBadge,
  LeadStatusBadge,
  NextStepBadge,
  UrgencyBadge,
} from "@/components/dashboard/status-badge";
import { PageShell } from "@/components/ui/page-shell";
import { getDashboardLeadDetail } from "@/server/services/dashboard.service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ leadId: string }>;
};

function toJson(value: Record<string, unknown> | null) {
  return JSON.stringify(value ?? {}, null, 2);
}

export default async function LeadDetailPage({ params }: Props) {
  const { leadId } = await params;
  const detail = await getDashboardLeadDetail(leadId);

  if (!detail) {
    notFound();
  }

  const { lead, conversationHistory, events, conversations, leadInsights, shortSummary, lastActivityAt } =
    detail;

  return (
    <PageShell
      title={lead.fullName ?? "Lead detail"}
      subtitle="Lead summary, next action, conversation history, and safeguard signals."
    >
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Recommended next step</p>
            <div className="mt-1">
              <NextStepBadge label={leadInsights.recommendedNextStep} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LeadScoreBadge bucket={leadInsights.scoreBucket} />
            <span className="text-sm font-semibold text-slate-700">{leadInsights.score}/100</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Lead name" value={lead.fullName ?? "Unknown"} />
          <SummaryItem
            label="Contact"
            value={[lead.phone, lead.email].filter(Boolean).join(" | ") || "No contact info"}
          />
          <SummaryItem label="Source" value={formatSourceLabel(lead.source)} />
          <SummaryItem label="Intent" value={lead.intent ?? "Unknown"} />
          <SummaryItem
            label="Urgency"
            value={<UrgencyBadge urgency={lead.urgency} />}
          />
          <SummaryItem label="Preferred timing" value={leadInsights.preferredTiming ?? "Unknown"} />
          <SummaryItem
            label="Qualification status"
            value={leadInsights.qualificationReady ? "Ready" : "In progress"}
          />
          <SummaryItem
            label="Suppression"
            value={
              leadInsights.suppressionActive
                ? `Active${leadInsights.suppressionReason ? ` (${leadInsights.suppressionReason})` : ""}`
                : "Not suppressed"
            }
          />
          <SummaryItem label="Current status" value={<LeadStatusBadge status={lead.status} />} />
          <SummaryItem label="Last activity" value={lastActivityAt.toLocaleString()} />
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Short summary</p>
          <p className="mt-1 text-sm text-slate-800">{shortSummary}</p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Conversation safeguards</h2>
        <div className="mt-4 space-y-3">
          {conversations.length === 0 ? (
            <EmptyState
              title="No conversation safeguards yet"
              description="Suppression and intent counters appear once messages are processed."
            />
          ) : (
            conversations.map((conversation) => (
              <article key={conversation.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wide text-slate-600">
                    {conversation.channel}
                  </span>
                  <span>
                    {conversation.lastMessageAt?.toLocaleString() ?? conversation.createdAt.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-sm text-slate-800 sm:grid-cols-2">
                  <p>Suppressed: {conversation.suppressionActive ? "Yes" : "No"}</p>
                  <p>Reason: {conversation.suppressionReason ?? "-"}</p>
                  <p>Low-intent count: {conversation.lowIntentInboundCount}</p>
                  <p>Meaningful-intent count: {conversation.meaningfulIntentInboundCount}</p>
                  <p>Off-topic count: {conversation.offTopicInboundCount}</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Conversation history</h2>
        <div className="mt-4 space-y-3">
          {conversationHistory.length === 0 ? (
            <EmptyState
              title="No conversation history"
              description="Messages will appear once this lead starts a conversation."
            />
          ) : (
            conversationHistory.map((message) => (
              <article key={message.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {message.direction} | {message.senderType} | {message.channel}
                  </span>
                  <span>{message.createdAt.toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-800">{message.body}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Lead events</h2>
        <div className="mt-4 space-y-3">
          {events.length === 0 ? (
            <EmptyState
              title="No events recorded"
              description="Events generated by workflows will show up here."
            />
          ) : (
            events.map((event) => (
              <article key={event.id} className="rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wide text-slate-600">
                    {event.eventType}
                  </span>
                  <span>{event.createdAt.toLocaleString()}</span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                  {toJson(event.payload)}
                </pre>
              </article>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function formatSourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
