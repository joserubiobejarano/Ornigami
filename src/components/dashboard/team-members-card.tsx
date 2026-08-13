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

export function TeamMembersCard() {
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  async function loadTeam() {
    setLoading(true);
    try {
      const response = await fetch("/api/team", { credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "We could not load team access.");
      setData(body as TeamData);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "We could not load team access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeam();
  }, []);

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInvitationUrl(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The invitation could not be sent.");
      setEmail("");
      setInvitationUrl(typeof body.invitationUrl === "string" ? body.invitationUrl : null);
      await loadTeam();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The invitation could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

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
          {data?.hasCompleteAccess ? <Badge variant="secondary">{data.members.length + data.pendingInvitations.length}/{data.seatLimit} users</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading team access…</p> : null}
        {error ? <DashboardCallout variant="error"><p>{error}</p></DashboardCallout> : null}

        {!loading && data && !data.hasCompleteAccess ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-border bg-surface px-4 py-3">
            <p className="text-sm text-muted-foreground">Invite teammates when you move to the Complete plan.</p>
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/billing">See Complete</Link></Button>
          </div>
        ) : null}

        {data?.hasCompleteAccess ? (
          <>
            <ul className="divide-y divide-border rounded-xl border-[1.5px] border-border bg-surface">
              {data.members.map((member) => (
                <li key={member.user_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{member.name || member.email}</p>
                    {member.name ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}
                  </div>
                  <Badge variant="secondary">{member.role === "owner" ? "Owner" : "Member"}</Badge>
                </li>
              ))}
              {data.pendingInvitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">Invitation pending</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </li>
              ))}
            </ul>

            {data.canManage ? (
              <form onSubmit={inviteMember} className="flex flex-col gap-3 sm:flex-row">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="teammate@example.com"
                  aria-label="Teammate email address"
                  required
                />
                <Button type="submit" disabled={submitting} className="shrink-0">
                  {submitting ? "Sending…" : "Invite teammate"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Only the workspace owner can invite teammates.</p>
            )}

            {invitationUrl ? (
              <DashboardCallout variant="info">
                <p>Email delivery is not configured here. Share this invitation link with your teammate: <a href={invitationUrl}>{invitationUrl}</a></p>
              </DashboardCallout>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
