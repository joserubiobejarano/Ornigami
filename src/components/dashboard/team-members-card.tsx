"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardCallout } from "@/components/dashboard/callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TeamMember = {
  user_id: string;
  email: string;
  name: string | null;
  role: string;
};

type PendingInvitation = {
  id: string;
  email: string;
  expires_at: string;
  created_at?: string;
};

type TeamData = {
  role: string;
  hasCompleteAccess: boolean;
  canManage: boolean;
  seatLimit: number;
  members: TeamMember[];
  pendingInvitations: PendingInvitation[];
  invitationDays: number;
};

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

function invitationExpiry(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return "Expiry date unavailable";
  if (timestamp <= Date.now()) return "Expired; refresh the list";
  return `Expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(timestamp)} UTC`;
}

export function TeamMembersCard() {
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  async function loadTeam(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/team", { credentials: "include" });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(body, "We could not load team access."));
      setData(body as TeamData);
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "We could not load team access.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setInvitationUrl(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(body, "The invitation could not be sent."));
      const result = body as { invitationUrl?: unknown; sent?: unknown };
      setEmail("");
      setInvitationUrl(typeof result.invitationUrl === "string" ? result.invitationUrl : null);
      setNotice(result.sent === true ? "Invitation email sent." : null);
      setNow(Date.now());
      await loadTeam(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeAccess(actionId: string, endpoint: string, successMessage: string) {
    setBusyAction(actionId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE", credentials: "include" });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseError(body, "Workspace access could not be updated."));
      setConfirmAction(null);
      setNotice(successMessage);
      setNow(Date.now());
      await loadTeam(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Workspace access could not be updated.");
    } finally {
      setBusyAction(null);
    }
  }

  const liveInvitations = data ? data.pendingInvitations.filter((invitation) => {
    const expiry = Date.parse(invitation.expires_at);
    return !Number.isFinite(expiry) || now === 0 || expiry > now;
  }) : [];
  const seatCount = data ? data.members.length + liveInvitations.length : 0;
  const atSeatLimit = data !== null && seatCount >= data.seatLimit;

  return (
    <Card className="border-[1.5px] border-border shadow-ink-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Team access</CardTitle>
            <CardDescription className="mt-2">
              Complete includes up to 3 users for the same Review Replies and Review Booster workspace.
            </CardDescription>
          </div>
          {data ? <Badge variant="secondary">{seatCount}/{data.seatLimit} users</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading team access…</p> : null}
        {error ? <DashboardCallout variant="error"><p role="alert" aria-live="polite">{error}</p></DashboardCallout> : null}
        {!loading && !data ? <Button type="button" variant="outline" size="sm" onClick={() => void loadTeam()}>Try loading team access again</Button> : null}
        {notice ? <DashboardCallout variant="info"><p role="status" aria-live="polite">{notice}</p></DashboardCallout> : null}

        {!loading && data && !data.hasCompleteAccess ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface px-4 py-3">
            <p className="text-sm text-muted-foreground">Team invitations require the Complete plan. Current workspace access remains listed below.</p>
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/billing">See Complete</Link></Button>
          </div>
        ) : null}

        {!loading && data ? (
          <>
            <ul aria-label="Workspace members and invitations" className="divide-y divide-border rounded-xl border-[1.5px] border-border bg-surface">
              {data.members.map((member) => {
                const isOwner = member.role === "owner";
                const rowActionId = `member:${member.user_id}`;
                return (
                  <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary">{member.name || member.email}</p>
                      {member.name ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{isOwner ? "Owner" : "Member"}</Badge>
                      {data.canManage && !isOwner ? (
                        confirmAction === rowActionId ? (
                          <span className="flex items-center gap-2">
                            <span className="sr-only">Remove {member.email} from this workspace?</span>
                            <Button type="button" size="sm" variant="destructive" disabled={busyAction !== null || submitting} onClick={() => void changeAccess(rowActionId, `/api/team/members/${encodeURIComponent(member.user_id)}`, "Member removed from this workspace.")}>{busyAction === rowActionId ? "Removing…" : "Confirm removal"}</Button>
                            <Button type="button" size="sm" variant="ghost" disabled={busyAction !== null || submitting} onClick={() => setConfirmAction(null)}>Keep member</Button>
                          </span>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled={busyAction !== null || submitting} onClick={() => setConfirmAction(rowActionId)}>Remove</Button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {data.pendingInvitations.map((invitation) => {
                const rowActionId = `invitation:${invitation.id}`;
                return (
                  <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">Pending invitation · {invitationExpiry(invitation.expires_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Pending</Badge>
                      {data.canManage && Date.parse(invitation.expires_at) <= now && now !== 0 ? (
                        <Button type="button" size="sm" variant="outline" disabled={busyAction !== null || submitting} onClick={() => void loadTeam(false)}>Refresh</Button>
                      ) : data.canManage ? (
                        confirmAction === rowActionId ? (
                          <span className="flex items-center gap-2">
                            <span className="sr-only">Revoke the invitation for {invitation.email}?</span>
                            <Button type="button" size="sm" variant="destructive" disabled={busyAction !== null || submitting} onClick={() => void changeAccess(rowActionId, `/api/team/invitations/${encodeURIComponent(invitation.id)}`, "Invitation revoked.")}>{busyAction === rowActionId ? "Revoking…" : "Confirm revoke"}</Button>
                            <Button type="button" size="sm" variant="ghost" disabled={busyAction !== null || submitting} onClick={() => setConfirmAction(null)}>Keep invitation</Button>
                          </span>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled={busyAction !== null || submitting} onClick={() => setConfirmAction(rowActionId)}>Revoke</Button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {data.members.length === 0 && data.pendingInvitations.length === 0 ? (
                <li className="px-4 py-3 text-sm text-muted-foreground">No members or pending invitations are listed.</li>
              ) : null}
            </ul>

            {data.canManage && data.hasCompleteAccess ? (
              <form onSubmit={inviteMember} className="flex flex-col gap-3 sm:flex-row" aria-busy={submitting}>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  aria-label="Teammate email address"
                  required
                />
                <Button type="submit" disabled={submitting || busyAction !== null || atSeatLimit} className="shrink-0">
                  {submitting ? "Sending…" : atSeatLimit ? "Seat limit reached" : "Invite teammate"}
                </Button>
              </form>
            ) : data.canManage ? (
              <p className="text-sm text-muted-foreground">The workspace owner can remove members or revoke pending invitations while access is downgraded. Invitation creation is available on Complete.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Only the workspace owner can manage invitations and remove teammates.</p>
            )}

            {atSeatLimit && data.hasCompleteAccess ? (
              <p className="text-sm text-muted-foreground">All {data.seatLimit} seats are in use, including pending invitations. Remove a member or revoke an invitation to free a seat.</p>
            ) : null}

            {invitationUrl ? (
              <DashboardCallout variant="info">
                <p>Email delivery is not configured here. Share this invitation link with your teammate: <a className="break-all underline" href={invitationUrl}>{invitationUrl}</a></p>
              </DashboardCallout>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
