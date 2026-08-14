import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canAccessAgent } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";
import { PLANS } from "@/lib/billing/plans";
import { hashTeamInvitationToken } from "@/lib/team";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Log in with the invited email address first." }, { status: 401 });
  }

  const { token } = await params;
  const invitationRows = await sql`
    SELECT id, business_id, email
    FROM public.team_invitations
    WHERE token_hash = ${hashTeamInvitationToken(token)}
      AND accepted_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  const invitation = invitationRows[0] as { id: string; business_id: string; email: string } | undefined;
  if (!invitation) return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 404 });
  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: "Log in with the invited email address to accept this invitation." }, { status: 403 });
  }

  const memberOfAnotherWorkspace = await sql`
    SELECT 1
    FROM public.business_members
    WHERE user_id = ${session.user.id} AND business_id <> ${invitation.business_id}
    LIMIT 1
  `;
  if (memberOfAnotherWorkspace.length) {
    return NextResponse.json({ error: "Your account already belongs to another workspace." }, { status: 409 });
  }

  const completeAgent = await sql`
    SELECT 1
    FROM public.business_agents
    WHERE business_id = ${invitation.business_id}
      AND plan_id = 'complete'
      AND status IN ('active', 'trialing', 'past_due')
    LIMIT 1
  `;
  const hasCompleteAccess = completeAgent.length > 0 &&
    await canAccessAgent(invitation.business_id, "review_replies") &&
    await canAccessAgent(invitation.business_id, "review_booster");
  if (!hasCompleteAccess) return NextResponse.json({ error: "This workspace no longer has an active Complete plan." }, { status: 403 });

  const memberCountRows = await sql`
    SELECT count(*)::int AS count
    FROM public.business_members
    WHERE business_id = ${invitation.business_id}
  `;
  const memberCount = Number((memberCountRows[0] as { count?: number } | undefined)?.count ?? 0);
  if (memberCount >= PLANS.complete.seats) {
    return NextResponse.json({ error: "This workspace has reached its 3-user limit." }, { status: 409 });
  }

  await sql`
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES (${invitation.business_id}, ${session.user.id}, 'member')
    ON CONFLICT (business_id, user_id) DO NOTHING
  `;
  await sql`
    UPDATE public.team_invitations
    SET accepted_at = now()
    WHERE id = ${invitation.id}
  `;

  return NextResponse.redirect(new URL("/dashboard/agents/review-replies/settings?team=accepted", req.url));
}
