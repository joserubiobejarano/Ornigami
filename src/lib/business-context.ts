import { sql } from "@/lib/db/neon";
import { DbBusinessRowSchema } from "@/lib/validators";
import type { DbBusinessRow } from "@/lib/db/businesses";

export type BusinessRole = "owner" | "member";
export type BusinessContext = {
  actorUserId: string;
  businessId: string;
  business: DbBusinessRow;
  role: BusinessRole;
  ownerUserId: string;
  billingOwnerUserId: string;
  integrationOwnerUserId: string;
  replyPolicyOwnerUserId: string;
  usageOwnerUserId: string;
};

export class BusinessAccessError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "BusinessAccessError";
    this.status = status;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves access only for a persisted canonical actor and an owned/member workspace. */
export async function resolveBusinessContext(
  actorUserId: string,
  businessId?: string | null
): Promise<BusinessContext | null> {
  if (!UUID_RE.test(actorUserId) || (businessId != null && !UUID_RE.test(businessId))) return null;
  const rows = businessId
    ? await sql`
        SELECT b.id, b.owner_user_id, b.name, b.business_type, b.city, b.country,
          b.website, b.phone, b.google_review_url, b.rebooking_url, b.tone,
          b.language, b.email_from_name, b.created_at, b.updated_at,
          CASE WHEN b.owner_user_id = actor.id THEN 'owner' ELSE 'member' END AS actor_role
        FROM public.users actor
        INNER JOIN public.businesses b ON b.id = ${businessId}
        LEFT JOIN public.business_members bm ON bm.business_id = b.id AND bm.user_id = actor.id
        WHERE actor.id = ${actorUserId}
          AND (b.owner_user_id = actor.id OR bm.user_id = actor.id)
        LIMIT 1
      `
    : await sql`
        SELECT b.id, b.owner_user_id, b.name, b.business_type, b.city, b.country,
          b.website, b.phone, b.google_review_url, b.rebooking_url, b.tone,
          b.language, b.email_from_name, b.created_at, b.updated_at,
          CASE WHEN b.owner_user_id = actor.id THEN 'owner' ELSE 'member' END AS actor_role
        FROM public.users actor
        INNER JOIN public.businesses b ON (b.owner_user_id = actor.id OR EXISTS (
          SELECT 1 FROM public.business_members bm
          WHERE bm.business_id = b.id AND bm.user_id = actor.id
        ))
        WHERE actor.id = ${actorUserId}
        ORDER BY b.created_at ASC, b.id ASC
        LIMIT 1
      `;
  const row = rows[0] as (Record<string, unknown> & { actor_role: string }) | undefined;
  if (!row) return null;
  const business = DbBusinessRowSchema.parse(row);
  const ownerUserId = business.owner_user_id;
  return {
    actorUserId, businessId: business.id, business,
    role: row.actor_role === "owner" ? "owner" : "member",
    ownerUserId, billingOwnerUserId: ownerUserId, integrationOwnerUserId: ownerUserId,
    replyPolicyOwnerUserId: ownerUserId, usageOwnerUserId: ownerUserId,
  };
}

export async function requireBusinessContext(
  actorUserId: string | null | undefined,
  businessId?: string | null
): Promise<BusinessContext> {
  if (!actorUserId || !UUID_RE.test(actorUserId)) {
    throw new BusinessAccessError(401, "Authentication required.");
  }
  const context = await resolveBusinessContext(actorUserId, businessId);
  if (!context) throw new BusinessAccessError(403, "Business access denied.");
  return context;
}

export function assertBusinessOwner(context: BusinessContext): void {
  if (context.role !== "owner" || context.actorUserId !== context.business.owner_user_id) {
    throw new BusinessAccessError(403, "Business owner access required.");
  }
}

export async function requireBusinessOwner(
  actorUserId: string | null | undefined,
  businessId?: string | null
): Promise<BusinessContext> {
  const context = await requireBusinessContext(actorUserId, businessId);
  assertBusinessOwner(context);
  return context;
}
