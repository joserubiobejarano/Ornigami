import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import type { DbBusinessRow } from "@/lib/db/businesses";
import { canAccessAgent, getOrCreateBusinessForUser } from "@/lib/db/businesses";
import { BusinessAccessError, requireBusinessContext, resolveBusinessContext, type BusinessContext } from "@/lib/business-context";
import { safeLogger } from "@/lib/safe-logger";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function safeApiErrorResponse(error: unknown, event: string) {
  if (error instanceof HttpError || error instanceof BusinessAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  safeLogger.error(event, {
    error: error instanceof Error ? error.message : "unknown_error",
  });
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

const CANONICAL_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Email is accepted only for call-site compatibility and ignored. */
export async function resolveBusinessForSessionUserStrict(
  userId: string,
  _email?: string | null,
  businessId?: string | null
): Promise<BusinessContext> {
  if (!CANONICAL_USER_ID.test(userId)) {
    throw new BusinessAccessError(401, "Authentication required.");
  }
  const context = await resolveBusinessContext(userId, businessId);
  if (context) return context;
  if (businessId != null) throw new BusinessAccessError(403, "Business access denied.");

  // The legacy helper rejects unknown UUIDs. Never attempt email identity creation.
  try {
    await getOrCreateBusinessForUser(userId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Could not resolve user in public.users")) {
      throw new BusinessAccessError(401, "Authentication required.");
    }
    throw error;
  }
  return requireBusinessContext(userId);
}

export async function requireActiveAgentBusinessContext(
  userId: string,
  email: string | null | undefined,
  agentId: "review_booster" | "review_replies",
  businessId?: string | null
): Promise<BusinessContext> {
  const context = await resolveBusinessForSessionUserStrict(userId, email, businessId);
  if (!(await canAccessAgent(context.businessId, agentId))) {
    throw new HttpError(403, "Agent access is inactive for this business.");
  }
  return context;
}

/** Existing routes receive a business row; new consumers can request the full context. */
export async function requireActiveAgentAccess(
  userId: string,
  email: string | null | undefined,
  agentId: "review_booster" | "review_replies",
  businessId?: string | null
): Promise<DbBusinessRow> {
  return (await requireActiveAgentBusinessContext(userId, email, agentId, businessId)).business;
}

export type ActiveAgentHandlerContext = {
  session: Session;
  business: DbBusinessRow;
  businessContext: BusinessContext;
};

export function withActiveAgent(
  agentId: "review_booster" | "review_replies",
  handler: (request: Request, context: ActiveAgentHandlerContext) => Promise<Response>
) {
  return async function activeAgentRoute(request: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const businessContext = await requireActiveAgentBusinessContext(session.user.id, session.user.email, agentId);
      return await handler(request, { session, business: businessContext.business, businessContext });
    } catch (error) {
      return safeApiErrorResponse(error, `agent.${agentId}.request_failed`);
    }
  };
}
