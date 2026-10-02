import { sql } from "@/lib/db/neon";
import { NextResponse } from "next/server";
import { safeLogger } from "@/lib/safe-logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isSameOriginMutation(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return fetchSite === "same-origin";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

type LifecycleResult = { status: string; [key: string]: unknown };

function resultOf(rows: unknown[]): LifecycleResult {
  const row = rows[0] as { result?: LifecycleResult } | undefined;
  return row?.result ?? { status: "error" };
}

export async function hasCompleteTeamAccess(businessId: string): Promise<boolean> {
  const rows = await sql`SELECT public.team_has_complete_access(${businessId}) AS allowed`;
  return (rows[0] as { allowed?: boolean } | undefined)?.allowed === true;
}

export async function reserveTeamInvitation(input: {
  actorId: string;
  businessId: string;
  email: string;
  tokenHash: string;
  lifetimeDays: number;
}): Promise<LifecycleResult> {
  const rows = await sql`
    SELECT public.team_reserve_invitation(
      ${input.actorId}, ${input.businessId}, ${input.email},
      ${input.tokenHash}, ${input.lifetimeDays}
    ) AS result
  `;
  return resultOf(rows);
}

export async function acceptTeamInvitation(userId: string, tokenHash: string): Promise<LifecycleResult> {
  const rows = await sql`SELECT public.team_accept_invitation(${userId}, ${tokenHash}) AS result`;
  return resultOf(rows);
}

export async function revokeTeamInvitation(actorId: string, invitationId: string): Promise<LifecycleResult> {
  const rows = await sql`SELECT public.team_revoke_invitation(${actorId}, ${invitationId}) AS result`;
  return resultOf(rows);
}

export async function removeTeamMember(
  actorId: string,
  businessId: string,
  userId: string,
): Promise<LifecycleResult> {
  const rows = await sql`SELECT public.team_remove_member(${actorId}, ${businessId}, ${userId}) AS result`;
  return resultOf(rows);
}

export async function cleanupFailedTeamInvitation(invitationId: string, tokenHash: string): Promise<void> {
  await sql`SELECT public.team_cleanup_invitation(${invitationId}, ${tokenHash})`;
}

export function teamMutationError(status: string): { message: string; httpStatus: number } {
  switch (status) {
    case "unauthorized":
      return { message: "Authentication required.", httpStatus: 401 };
    case "not_found":
      return { message: "This invitation or member could not be found.", httpStatus: 404 };
    case "invalid":
      return { message: "This invitation is invalid or has expired.", httpStatus: 404 };
    case "business_missing":
      return { message: "The workspace could not be found.", httpStatus: 404 };
    case "forbidden":
      return { message: "Only the workspace owner can manage teammates.", httpStatus: 403 };
    case "no_entitlement":
      return { message: "Team access is available on the Complete plan.", httpStatus: 403 };
    case "already_member":
      return { message: "That person already has access to this workspace.", httpStatus: 409 };
    case "another_workspace":
      return { message: "That account already belongs to another workspace.", httpStatus: 409 };
    case "already_pending":
      return { message: "An invitation is already pending for that email.", httpStatus: 409 };
    case "seats_full":
      return { message: "This workspace has reached its 3-user limit.", httpStatus: 409 };
    case "email_mismatch":
      return { message: "Verify and log in with the email address on the invitation.", httpStatus: 403 };
    case "owner_protected":
      return { message: "The workspace owner cannot be removed.", httpStatus: 409 };
    case "not_pending":
      return { message: "This invitation is no longer pending.", httpStatus: 409 };
    default:
      return { message: "The team change could not be completed.", httpStatus: 500 };
  }
}

export function teamFailureResponse(error: unknown, event: string): Response {
  safeLogger.error(event, { error: error instanceof Error ? error.message : "unknown_error" });
  return NextResponse.json({ error: "The team request could not be completed. Please try again." }, { status: 500 });
}
