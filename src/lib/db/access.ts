import { sql } from "@/lib/db/neon";
import { z } from "zod";

const MiddlewareAccessRowSchema = z.object({
  has_gbp: z.boolean(),
  has_replies_access: z.boolean(),
});

export async function getMiddlewareAccessState(userId: string): Promise<{
  hasGbp: boolean;
  hasRepliesAccess: boolean;
}> {
  const rows = await sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM public.gbp_connections
        WHERE user_id = ${userId}
      ) AS has_gbp,
      EXISTS (
        SELECT 1
        FROM public.business_agents ba
        INNER JOIN public.business_members bm ON bm.business_id = ba.business_id
        WHERE bm.user_id = ${userId}
          AND ba.agent_id = 'review_replies'
          AND (
            lower(ba.status) IN ('active', 'trialing')
            OR (
              lower(ba.status) = 'past_due'
              AND ba.current_period_end >= now() - interval '7 days'
            )
          )
      ) AS has_replies_access
  `;
  const row = rows[0] ? MiddlewareAccessRowSchema.parse(rows[0]) : null;
  return {
    hasGbp: row?.has_gbp ?? false,
    hasRepliesAccess: row?.has_replies_access ?? false,
  };
}
