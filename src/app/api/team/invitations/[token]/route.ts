import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { acceptTeamInvitation, isSameOriginMutation, isUuid, revokeTeamInvitation, teamFailureResponse, teamMutationError } from "@/lib/team-lifecycle";
import { hashTeamInvitationToken } from "@/lib/team";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  try { return await acceptInvitation(req, context); }
  catch (error) { return teamFailureResponse(error, "team.invitation.accept.failed"); }
}

async function acceptInvitation(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Log in with the invited email address first." }, { status: 401 });
  }

  const { token } = await params;
  const result = await acceptTeamInvitation(session.user.id, hashTeamInvitationToken(token));
  if (result.status !== "accepted") {
    const error = teamMutationError(result.status);
    return NextResponse.json({ error: error.message }, { status: error.httpStatus });
  }

  const redirectTo = "/dashboard/agents/review-replies/settings?team=accepted";
  if (req.headers.get("accept")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: true, redirectTo });
  }
  return NextResponse.redirect(new URL(redirectTo, req.url), 303);
}

/** The existing token segment also accepts invitation UUIDs for owner revocation. */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  try { return await revokeInvitation(req, context); }
  catch (error) { return teamFailureResponse(error, "team.invitation.revoke.failed"); }
}

async function revokeInvitation(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { token: invitationId } = await params;
  if (!isUuid(invitationId)) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });

  const result = await revokeTeamInvitation(session.user.id, invitationId);
  if (result.status !== "revoked") {
    const error = teamMutationError(result.status);
    return NextResponse.json({ error: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ ok: true });
}
