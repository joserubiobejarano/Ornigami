import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canAccessAgent, getBusinessAgents, getBusinessForUser } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";
import { PLANS } from "@/lib/billing/plans";
import {
  createTeamInvitationToken,
  hashTeamInvitationToken,
  sendTeamInvitationEmail,
  teamInvitationUrl,
  TEAM_INVITATION_DAYS,
} from "@/lib/team";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InviteSchema = z.object({
  email: z.string().trim().email().max(320),
});

async function getTeamContext(userId: string) {
  const business = await getBusinessForUser(userId);
  if (!business) return null;

  const membershipRows = await sql`
    SELECT role
    FROM public.business_members
    WHERE business_id = ${business.id} AND user_id = ${userId}
    LIMIT 1
  `;
  const membership = membershipRows[0] as { role: string } | undefined;
  if (!membership) return null;

  const agents = await getBusinessAgents(business.id);
  const completePlan = agents.some(
    (agent) => agent.plan_id === "complete" && ["active", "trialing", "past_due"].includes(agent.status),
  );
  const hasCompleteAccess = completePlan &&
    await canAccessAgent(business.id, "review_replies") &&
    await canAccessAgent(business.id, "review_booster");

  return {
    business,
    role: membership.role,
    hasCompleteAccess,
    canManage: membership.role === "owner" && hasCompleteAccess,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await getTeamContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });

  const members = await sql`
    SELECT bm.user_id, bm.role, bm.created_at, u.email, u.name
    FROM public.business_members bm
    INNER JOIN public.users u ON u.id = bm.user_id
    WHERE bm.business_id = ${context.business.id}
    ORDER BY CASE WHEN bm.role = 'owner' THEN 0 ELSE 1 END, bm.created_at ASC
  `;
  const pendingInvitations = await sql`
    SELECT id, email, role, expires_at, created_at
    FROM public.team_invitations
    WHERE business_id = ${context.business.id}
      AND accepted_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
  `;

  return NextResponse.json({
    businessName: context.business.name,
    role: context.role,
    hasCompleteAccess: context.hasCompleteAccess,
    canManage: context.canManage,
    seatLimit: PLANS.complete.seats,
    members,
    pendingInvitations,
    invitationDays: TEAM_INVITATION_DAYS,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const context = await getTeamContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });
  if (!context.canManage) {
    return NextResponse.json(
      { error: context.hasCompleteAccess ? "Only the workspace owner can invite teammates." : "Team access is available on the Complete plan." },
      { status: 403 },
    );
  }

  const existingMember = await sql`
    SELECT 1
    FROM public.business_members bm
    INNER JOIN public.users u ON u.id = bm.user_id
    WHERE bm.business_id = ${context.business.id} AND lower(u.email) = ${email}
    LIMIT 1
  `;
  if (existingMember.length) {
    return NextResponse.json({ error: "That person already has access to this workspace." }, { status: 409 });
  }

  const memberOfAnotherWorkspace = await sql`
    SELECT 1
    FROM public.business_members bm
    INNER JOIN public.users u ON u.id = bm.user_id
    WHERE bm.business_id <> ${context.business.id} AND lower(u.email) = ${email}
    LIMIT 1
  `;
  if (memberOfAnotherWorkspace.length) {
    return NextResponse.json({ error: "That email already belongs to another workspace." }, { status: 409 });
  }

  const existingInvitation = await sql`
    SELECT 1
    FROM public.team_invitations
    WHERE business_id = ${context.business.id}
      AND lower(email) = ${email}
      AND accepted_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  if (existingInvitation.length) {
    return NextResponse.json({ error: "An invitation is already pending for that email." }, { status: 409 });
  }

  const [memberCountRows, pendingCountRows] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM public.business_members WHERE business_id = ${context.business.id}`,
    sql`SELECT count(*)::int AS count FROM public.team_invitations WHERE business_id = ${context.business.id} AND accepted_at IS NULL AND expires_at > now()`,
  ]);
  const memberCount = Number((memberCountRows[0] as { count?: number } | undefined)?.count ?? 0);
  const pendingCount = Number((pendingCountRows[0] as { count?: number } | undefined)?.count ?? 0);
  if (memberCount + pendingCount >= PLANS.complete.seats) {
    return NextResponse.json({ error: `Complete includes up to ${PLANS.complete.seats} users, including you.` }, { status: 409 });
  }

  const token = createTeamInvitationToken();
  const invitationUrl = teamInvitationUrl(token);
  const invitationRows = await sql`
    INSERT INTO public.team_invitations (business_id, invited_by, email, role, token_hash, expires_at)
    VALUES (
      ${context.business.id},
      ${session.user.id},
      ${email},
      'member',
      ${hashTeamInvitationToken(token)},
      now() + ${TEAM_INVITATION_DAYS} * INTERVAL '1 day'
    )
    RETURNING id
  `;
  const invitationId = (invitationRows[0] as { id: string } | undefined)?.id;

  try {
    const delivery = await sendTeamInvitationEmail({
      email,
      businessName: context.business.name,
      inviterEmail: session.user.email,
      invitationUrl,
    });
    return NextResponse.json({ ok: true, sent: delivery.sent, invitationUrl: delivery.sent ? null : invitationUrl });
  } catch (error: unknown) {
    if (invitationId) {
      await sql`DELETE FROM public.team_invitations WHERE id = ${invitationId}`;
    }
    safeLogger.error("team.invitation.send.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "The invitation could not be sent. Please try again." }, { status: 502 });
  }
}
