import { resolveBusinessContext } from "@/lib/business-context";
import { canAccessAgent } from "@/lib/db/businesses";
import { sql } from "@/lib/db/neon";
import { z } from "zod";

const MiddlewareAccessRowSchema = z.object({ has_gbp: z.boolean() });
export type MiddlewareAccessState = {
  hasGbp: boolean;
  hasRepliesAccess: boolean;
  businessId: string | null;
  ownerUserId: string | null;
};

/** Optimistic navigation check. Route handlers must authorize each operation. */
export async function getMiddlewareAccessState(userId: string, businessId?: string): Promise<MiddlewareAccessState> {
  const context = await resolveBusinessContext(userId, businessId);
  if (!context) return { hasGbp: false, hasRepliesAccess: false, businessId: null, ownerUserId: null };
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM public.gbp_connections gc
      WHERE gc.user_id = ${context.integrationOwnerUserId}
    ) AS has_gbp
  `;
  const row = rows[0] ? MiddlewareAccessRowSchema.parse(rows[0]) : null;
  const hasRepliesAccess = await canAccessAgent(context.businessId, "review_replies");
  return { hasGbp: row?.has_gbp ?? false, hasRepliesAccess, businessId: context.businessId, ownerUserId: context.integrationOwnerUserId };
}
