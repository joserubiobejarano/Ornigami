"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatProductDate } from "@/lib/format-date";
import { MAX_FOLLOWUP_ATTEMPTS } from "@/lib/followup-retry-policy";
import { StatusBadge } from "@/modules/review-booster/components/status-badge";
import type { FollowupVisit } from "@/modules/review-booster/types/followup.types";

type VisitPage = { nextCursor: string | null; hasMore: boolean };

function utcDateTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }).format(date)} UTC`;
}

function VisitStatusGuidance({ visit, now }: { visit: FollowupVisit; now: number | null }) {
  const status = visit.followup_status.toLowerCase();
  if (["sending", "unknown", "reconciliation_required"].includes(status)) {
    return <p className="mt-1 max-w-xs text-xs text-primary">Status is being checked. The quota reservation remains in place; don&apos;t retry or create a duplicate request.</p>;
  }
  if (visit.delivery_status === "sent") {
    return <p className="mt-1 max-w-xs text-xs text-muted-foreground">The provider accepted this email. Delivery has not been confirmed.</p>;
  }
  if (visit.delivery_status === "delayed") {
    return <p className="mt-1 max-w-xs text-xs text-muted-foreground">The provider reports a delivery delay. It may still arrive; don&apos;t retry or create a duplicate request.</p>;
  }
  if (status === "failed") {
    if ((visit.attempt_count ?? 0) >= MAX_FOLLOWUP_ATTEMPTS) {
      return <p className="mt-1 max-w-sm text-xs text-muted-foreground">Automatic retry limit reached. Contact support before arranging another request.</p>;
    }
    if (visit.next_attempt_at) {
      const retryAt = new Date(visit.next_attempt_at);
      if (now === null) {
        return <p className="mt-1 max-w-sm text-xs text-muted-foreground">The next run rechecks timing, contact details and eligibility.</p>;
      }
      if (!Number.isNaN(retryAt.getTime()) && retryAt.getTime() > now) {
        return <p className="mt-1 max-w-sm text-xs text-muted-foreground">Next retry is scheduled for {utcDateTime(visit.next_attempt_at)}.</p>;
      }
    }
    const expiry = new Date(new Date(visit.visited_at).getTime() + 7 * 24 * 60 * 60 * 1000);
    if (now !== null && !Number.isNaN(expiry.getTime()) && expiry.getTime() <= now) {
      return <p className="mt-1 max-w-sm text-xs text-muted-foreground">This visit is past the seven-day retry window. The next run will not retry it automatically.</p>;
    }
    return <p className="mt-1 max-w-sm text-xs text-muted-foreground">A later run rechecks timing, contact details and eligibility before retrying.</p>;
  }
  if (status === "deferred_quota") {
    const expiry = new Date(new Date(visit.visited_at).getTime() + 7 * 24 * 60 * 60 * 1000);
    return <p className="mt-1 max-w-sm text-xs text-muted-foreground">Waiting for monthly quota. Eligibility ends {Number.isNaN(expiry.getTime()) ? "after seven days" : utcDateTime(expiry)}.</p>;
  }
  return null;
}

export function RecentVisitsTable({
  businessId,
  initialVisits,
  initialPage,
  reconciliationEnabled = false,
}: {
  businessId: string;
  initialVisits: FollowupVisit[];
  initialPage: VisitPage;
  reconciliationEnabled?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [visits, setVisits] = useState(initialVisits);
  const [page, setPage] = useState(initialPage);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerIds, setProviderIds] = useState<Record<string, string>>({});
  const [reconciliationMessages, setReconciliationMessages] = useState<Record<string, string>>({});
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const navigationRef = useRef(false);
  const reconciliationRef = useRef(false);
  const failedDirectionRef = useRef<"first" | "previous" | "next" | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  async function navigate(direction: "first" | "previous" | "next") {
    if (loading || navigationRef.current || reconciliationRef.current) return;
    const cursor = direction === "first" ? null : direction === "next" ? page.nextCursor : pageCursors[pageIndex - 1] ?? null;
    if (direction === "first" && pageIndex === 0) return;
    if (direction === "next" && !page.hasMore || direction === "previous" && pageIndex === 0) return;
    const requestId = ++requestRef.current;
    navigationRef.current = true;
    setLoading(true);
    setError(null);
    failedDirectionRef.current = null;
    try {
      const query = new URLSearchParams({ businessId, limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/review-booster/visits?${query}`);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "We couldn't load these visits. Please retry.";
        throw new Error(message);
      }
      if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items) || !("page" in body)
        || typeof body.page !== "object" || body.page === null
        || typeof (body.page as Record<string, unknown>).hasMore !== "boolean"
        || ((body.page as Record<string, unknown>).nextCursor !== null && typeof (body.page as Record<string, unknown>).nextCursor !== "string")) {
        throw new Error("The visit page response was incomplete. Please retry.");
      }
      const nextPage = body.page as VisitPage;
      if (requestId !== requestRef.current) return;
      setVisits(body.items as FollowupVisit[]);
      setPage(nextPage);
      if (direction === "first") {
        setPageCursors([null]);
        setPageIndex(0);
      } else if (direction === "next") {
        setPageCursors((current) => [...current.slice(0, pageIndex + 1), cursor]);
        setPageIndex((current) => current + 1);
      } else {
        setPageIndex((current) => current - 1);
      }
    } catch (cause) {
      if (requestId === requestRef.current) {
        failedDirectionRef.current = direction;
        setError(cause instanceof Error ? cause.message : "We couldn't load these visits. Please retry.");
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
      navigationRef.current = false;
    }
  }

  async function checkProviderStatus(visit: FollowupVisit) {
    if (!reconciliationEnabled || !visit.delivery_id || loading || navigationRef.current || reconciliationRef.current) return;
    reconciliationRef.current = true;
    let providerStatusRecorded = false;
    setReconcilingId(visit.delivery_id);
    setReconciliationMessages((current) => ({ ...current, [visit.id]: "Checking the existing provider email. No new email will be sent." }));
    try {
      const providerMessageId = providerIds[visit.id]?.trim();
      const response = await fetch(`/api/review-booster/deliveries/${encodeURIComponent(visit.delivery_id)}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...(providerMessageId ? { providerMessageId } : {}) }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (response.status === 202) {
        setReconciliationMessages((current) => ({
          ...current,
          [visit.id]: "The provider result is still unconfirmed. The quota reservation remains in place; do not retry or create another request.",
        }));
        return;
      }
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "Provider status could not be checked. The reservation remains in place; do not retry this request.";
        setReconciliationMessages((current) => ({ ...current, [visit.id]: message }));
        return;
      }

      if (response.status !== 200 || !result || typeof result !== "object"
        || !("status" in result) || !["resolved", "already_resolved"].includes(String(result.status))
        || !("deliveryState" in result) || result.deliveryState !== "accepted") {
        setReconciliationMessages((current) => ({ ...current, [visit.id]: "Provider status could not be confirmed. The reservation remains in place; do not create a duplicate request." }));
        return;
      }
      providerStatusRecorded = true;

      // Re-read the bounded page to show the durable webhook/reconciliation projection.
      const cursor = pageCursors[pageIndex] ?? null;
      const query = new URLSearchParams({ businessId, limit: "50" });
      if (cursor) query.set("cursor", cursor);
      const refreshed = await fetch(`/api/review-booster/visits?${query}`);
      const pageBody: unknown = await refreshed.json().catch(() => null);
      if (refreshed.ok && pageBody && typeof pageBody === "object" && "items" in pageBody && Array.isArray(pageBody.items) && "page" in pageBody) {
        setVisits(pageBody.items as FollowupVisit[]);
        const nextPage = (pageBody as { page?: unknown }).page;
        if (nextPage && typeof nextPage === "object" && "hasMore" in nextPage && typeof nextPage.hasMore === "boolean" && "nextCursor" in nextPage && (typeof nextPage.nextCursor === "string" || nextPage.nextCursor === null)) {
          setPage(nextPage as VisitPage);
        }
        setReconciliationMessages((current) => ({ ...current, [visit.id]: "Provider status recorded and visit details refreshed. No new email was sent." }));
      } else {
        setReconciliationMessages((current) => ({ ...current, [visit.id]: "Provider status was recorded, but this page could not refresh. Reload the dashboard to view the latest status. No new email was sent." }));
      }
    } catch {
      setReconciliationMessages((current) => ({
        ...current,
        [visit.id]: providerStatusRecorded
          ? "Provider status was recorded, but visit details could not refresh. Reload the dashboard to view the latest status. No new email was sent."
          : "Provider status could not be confirmed. The reservation remains in place; do not retry or create another request.",
      }));
    } finally {
      reconciliationRef.current = false;
      setReconcilingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border-[1.5px] border-border bg-card shadow-ink-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">Recent visits</h2>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">{loading ? "Loading visits…" : `${visits.length} ${visits.length === 1 ? "visit" : "visits"} on this page`}</p>
        </div>
        {(visits.length > 0 || pageIndex > 0) && (
          <nav className="flex w-full gap-2 sm:w-auto" aria-label="Visit pages">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void navigate("previous")} disabled={pageIndex === 0 || loading || reconcilingId !== null}>Previous</Button>
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void navigate("next")} disabled={!page.hasMore || loading || reconcilingId !== null}>{loading ? "Loading…" : "Next"}</Button>
            {visits.length === 0 && pageIndex > 0 && <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void navigate("first")} disabled={loading || reconcilingId !== null}>Newest visits</Button>}
          </nav>
        )}
      </div>
      {error && <div className="px-4 pt-4"><div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={() => failedDirectionRef.current && void navigate(failedDirectionRef.current)} disabled={loading || !failedDirectionRef.current}>Retry page change</Button></div></div>}
      {visits.length === 0 ? (
        <div className="px-4 py-6"><p className="text-sm text-muted-foreground">{pageIndex === 0 ? "No visits yet for this business." : "No visits were returned for this page. The list may have changed; return to the newest visits."}</p>{pageIndex === 0 && <Button asChild className="mt-3"><Link href="/dashboard/agents/review-booster/new">Add your first visit</Link></Button>}</div>
      ) : (
        <div
          className="overflow-x-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          role="region"
          aria-label="Recent visit details"
          tabIndex={0}
        >
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface text-left text-primary"><tr>
              <th scope="col" className="px-4 py-3 font-semibold">Customer</th><th scope="col" className="px-4 py-3 font-semibold">Service</th><th scope="col" className="px-4 py-3 font-semibold">Visit date</th><th scope="col" className="px-4 py-3 font-semibold">Status</th>
            </tr></thead>
            <tbody>{visits.map((visit) => (
              <tr key={visit.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 align-top text-card-foreground"><p className="font-medium">{visit.customer_name || "Anonymous"}</p><p className="mt-1 text-xs text-muted-foreground">{visit.customer_email || "No email"}</p></td>
                <td className="px-4 py-3 align-top text-card-foreground">{visit.service_name || "-"}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-card-foreground">{formatProductDate(visit.visited_at)}</td>
                <td className="min-w-52 px-4 py-3 align-top">
                  <StatusBadge status={
                    ["sending", "unknown", "reconciliation_required"].includes((visit.followup_status || "").toLowerCase())
                      ? visit.followup_status
                      : visit.delivery_id && visit.delivery_status && visit.delivery_status !== "pending"
                        ? visit.delivery_status === "sent" ? "accepted" : visit.delivery_status === "failed" ? "provider_failed" : visit.delivery_status
                        : visit.delivery_id && (visit.followup_status || "").toLowerCase() === "sent"
                          ? "accepted"
                          : visit.followup_status || "pending"
                  } />
                  <VisitStatusGuidance visit={visit} now={now} />
                  {visit.delivery_id && visit.delivery_status && ["failed", "suppressed", "bounced", "complained"].includes(visit.delivery_status.toLowerCase()) && (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">Provider reported a terminal email outcome. This request will not be sent again automatically; do not create a duplicate request.</p>
                  )}
                  {visit.delivery_id && reconciliationEnabled && ["unknown", "reconciliation_required"].includes((visit.followup_status || "").toLowerCase()) && (
                    <div className="mt-2 max-w-xs space-y-2">
                      <label className="block text-xs text-muted-foreground" htmlFor={`provider-message-${visit.id}`}>Resend email ID (optional if already recorded)</label>
                      <input
                        id={`provider-message-${visit.id}`}
                        value={providerIds[visit.id] ?? ""}
                        onChange={(event) => setProviderIds((current) => ({ ...current, [visit.id]: event.target.value }))}
                        placeholder="Provider email UUID"
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={reconcilingId !== null}
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => void checkProviderStatus(visit)} disabled={reconcilingId !== null}>
                        {reconcilingId === visit.delivery_id ? "Checking…" : "Check provider status"}
                      </Button>
                      <p className="text-xs text-muted-foreground">This checks the existing email only. Unknown sends keep their quota reservation; no retry or duplicate is created.</p>
                    </div>
                  )}
                  {reconciliationMessages[visit.id] && <p role="status" className="mt-2 max-w-xs text-xs text-muted-foreground">{reconciliationMessages[visit.id]}</p>}
                  {(visit.source || visit.error_reason) && <details className="mt-2 max-w-xs text-xs text-muted-foreground">
                    <summary className="w-fit cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Details for ${visit.customer_name || "anonymous customer"}`}>Details</summary>
                    {visit.error_reason && <p className="mt-1 break-words">{visit.error_reason}</p>}
                    {visit.source && <p className="mt-1 capitalize">Source: {visit.source}</p>}
                  </details>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
