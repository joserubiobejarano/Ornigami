import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { resolveBusinessContext } from "@/lib/business-context";
import { sql } from "@/lib/db/neon";
import { PLANS } from "@/lib/billing/plans";
import {
  cleanupFailedTeamInvitation,
  hasCompleteTeamAccess,
  isSameOriginMutation,
  reserveTeamInvitation,
  teamFailureResponse,
  teamMutationError,
} from "@/lib/team-lifecycle";
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

const InviteSchema = z.object({ email: z.string().trim().email().max(320) });

export async function GET() {
  try { return await getTeam(); }
  catch (error) { return teamFailureResponse(error, "team.get.failed"); }
}

async function getTeam() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await resolveBusinessContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });

  const [members, pendingInvitations, hasCompleteAccess] = await Promise.all([
    sql`
      SELECT * FROM (
        SELECT b.owner_user_id AS user_id, 'owner' AS role, b.created_at, u.email, u.name
        FROM public.businesses b
        INNER JOIN public.users u ON u.id = b.owner_user_id
        WHERE b.id = ${context.businessId}
        UNION ALL
        SELECT bm.user_id, 'member' AS role, bm.created_at, u.email, u.name
        FROM public.business_members bm
        INNER JOIN public.users u ON u.id = bm.user_id
        WHERE bm.business_id = ${context.businessId} AND bm.user_id <> ${context.ownerUserId}
      ) team_members
      ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC
    `,
    sql`
      SELECT id, email, role, status, expires_at, created_at
      FROM public.team_invitations
      WHERE business_id = ${context.businessId} AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC
    `,
    hasCompleteTeamAccess(context.businessId),
  ]);

  return NextResponse.json({
    businessName: context.business.name,
    role: context.role,
    hasCompleteAccess,
    // Owner cleanup remains available after downgrade or expiry.
    canManage: context.role === "owner",
    seatLimit: PLANS.complete.seats,
    members,
    pendingInvitations,
    invitationDays: TEAM_INVITATION_DAYS,
  });
}

export async function POST(req: Request) {
  try { return await createInvitation(req); }
  catch (error) { return teamFailureResponse(error, "team.invitation.failed"); }
}

async function createInvitation(req: Request) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const context = await resolveBusinessContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });
  if (context.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can invite teammates." }, { status: 403 });
  }

  const email = parsed.data.email.toLowerCase();
  const token = createTeamInvitationToken();
  const tokenHash = hashTeamInvitationToken(token);
  const reserved = await reserveTeamInvitation({
    actorId: session.user.id,
    businessId: context.businessId,
    email,
    tokenHash,
    lifetimeDays: TEAM_INVITATION_DAYS,
  });
  if (reserved.status !== "reserved") {
    const error = teamMutationError(reserved.status);
    return NextResponse.json({ error: error.message }, { status: error.httpStatus });
  }

  const invitationId = String(reserved.invitationId);
  const invitationUrl = teamInvitationUrl(token);
  try {
    const delivery = await sendTeamInvitationEmail({
      email,
      businessName: context.business.name,
      inviterEmail: session.user.email,
      invitationUrl,
    });
    return NextResponse.json({ ok: true, sent: delivery.sent, invitationUrl: delivery.sent ? null : invitationUrl });
  } catch (error: unknown) {
    await cleanupFailedTeamInvitation(invitationId, tokenHash);
    safeLogger.error("team.invitation.send.failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "The invitation could not be sent. Please try again." }, { status: 502 });
  }
}
