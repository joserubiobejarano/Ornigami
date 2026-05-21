import { NextResponse } from "next/server";

import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { safeLogger } from "@/lib/safe-logger";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function safeApiErrorResponse(error: unknown, event: string) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  safeLogger.error(event, {
    error: error instanceof Error ? error.message : "unknown_error",
  });
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function resolveBusinessForSessionUserStrict(userId: string, email?: string | null) {
  try {
    return await getOrCreateBusinessForUser(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Could not resolve user in public.users") && email) {
      return getOrCreateBusinessForUser(email);
    }
    throw error;
  }
}

export async function requireActiveAgentAccess(
  userId: string,
  email: string | null | undefined,
  agentId: "review_booster" | "review_replies"
) {
  const business = await resolveBusinessForSessionUserStrict(userId, email);
  const hasAccess = await canAccessAgent(business.id, agentId);
  if (!hasAccess) {
    throw new HttpError(403, "Agent access is inactive for this business.");
  }
  return business;
}

