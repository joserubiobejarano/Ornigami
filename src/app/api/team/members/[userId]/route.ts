import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { resolveBusinessContext } from "@/lib/business-context";
import { isSameOriginMutation, isUuid, removeTeamMember, teamFailureResponse, teamMutationError } from "@/lib/team-lifecycle";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try { return await deleteMember(req, context); }
  catch (error) { return teamFailureResponse(error, "team.member.remove.failed"); }
}

async function deleteMember(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { userId } = await params;
  if (!isUuid(userId)) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  const context = await resolveBusinessContext(session.user.id);
  if (!context) return NextResponse.json({ error: "Business setup is incomplete." }, { status: 409 });
  if (context.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can remove teammates." }, { status: 403 });
  }

  const result = await removeTeamMember(session.user.id, context.businessId, userId);
  if (result.status !== "removed") {
    const error = teamMutationError(result.status);
    return NextResponse.json({ error: error.message }, { status: error.httpStatus });
  }
  return NextResponse.json({ ok: true });
}
