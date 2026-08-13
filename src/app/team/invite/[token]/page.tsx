import Link from "next/link";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hashTeamInvitationToken } from "@/lib/team";
import { sql } from "@/lib/db/neon";

export const dynamic = "force-dynamic";

export default async function TeamInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const invitationRows = await sql`
    SELECT i.email, b.name AS business_name
    FROM public.team_invitations i
    INNER JOIN public.businesses b ON b.id = i.business_id
    WHERE i.token_hash = ${hashTeamInvitationToken(token)}
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
    LIMIT 1
  `;
  const invitation = invitationRows[0] as { email: string; business_name: string } | undefined;
  const invitationPath = `/team/invite/${encodeURIComponent(token)}`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface/55 p-6">
      <Card className="w-full max-w-lg border-[1.5px] border-border shadow-ink-md">
        <CardHeader>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent-marigold">Team invitation</p>
          <CardTitle className="text-2xl">Join an Ornigami workspace.</CardTitle>
          <CardDescription>
            {invitation
              ? `You have been invited to ${invitation.business_name || "a business workspace"}.`
              : "This invitation is no longer available."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!invitation ? (
            <Button asChild>
              <Link href="/">Back to Ornigami</Link>
            </Button>
          ) : !session?.user?.id ? (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Log in with <span className="font-medium text-foreground">{invitation.email}</span> to accept this invitation. If you are new to Ornigami, create an account first.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href={`/login?callbackUrl=${encodeURIComponent(invitationPath)}`}>Log in to accept</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`/signup?invite=${encodeURIComponent(token)}`}>Create an account</Link>
                </Button>
              </div>
            </>
          ) : session.user.email?.toLowerCase() !== invitation.email.toLowerCase() ? (
            <p className="rounded-xl border-[1.5px] border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This invitation is for {invitation.email}. Sign out and log in with that email to continue.
            </p>
          ) : (
            <form action={`/api/team/invitations/${encodeURIComponent(token)}`} method="post">
              <Button type="submit" variant="accent">Accept invitation</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
