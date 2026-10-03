import { sql } from "@/lib/db/neon";
import { DbBusinessAgentRowSchema, DbBusinessRowSchema } from "@/lib/validators";
import { isWithinPastDueGracePeriod as isWithinPastDueGracePeriodPolicy, PAST_DUE_GRACE_DAYS as PAST_DUE_GRACE_DAYS_POLICY } from "@/lib/business-access-policy";
import { z } from "zod";
import { hasActiveBusinessEntitlement } from "@/lib/business-access-policy";

export type DbBusinessRow = z.infer<typeof DbBusinessRowSchema>;
export type DbBusinessAgentRow = z.infer<typeof DbBusinessAgentRowSchema>;


export const PAST_DUE_GRACE_DAYS = PAST_DUE_GRACE_DAYS_POLICY;
export const isWithinPastDueGracePeriod = isWithinPastDueGracePeriodPolicy;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function getBusinessForUser(userId: string): Promise<DbBusinessRow | null> {
  if (!isUuid(userId)) {
    return null;
  }

  const rows = await sql`
    SELECT
      public.businesses.id,
      public.businesses.owner_user_id,
      public.businesses.name,
      public.businesses.business_type,
      public.businesses.city,
      public.businesses.country,
      public.businesses.website,
      public.businesses.phone,
      public.businesses.google_review_url,
      public.businesses.rebooking_url,
      public.businesses.tone,
      public.businesses.language,
      public.businesses.email_from_name,
      public.businesses.created_at,
      public.businesses.updated_at
    FROM public.businesses
    INNER JOIN public.users actor ON actor.id = ${userId}
    INNER JOIN public.users owner ON owner.id = public.businesses.owner_user_id
    LEFT JOIN public.business_members bm ON bm.business_id = public.businesses.id AND bm.user_id = actor.id
    WHERE actor.privacy_deletion_requested_at IS NULL
      AND owner.privacy_deletion_requested_at IS NULL
      AND (public.businesses.owner_user_id = actor.id OR bm.user_id = actor.id)
    ORDER BY public.businesses.created_at ASC, public.businesses.id ASC
    LIMIT 1
  `;
  const row = rows[0] ? DbBusinessRowSchema.parse(rows[0]) : undefined;
  return row ?? null;
}

export async function getOrCreateBusinessForUser(userId: string): Promise<DbBusinessRow> {
  const ownerUser = await resolveOwnerUser(userId);

  const resolvedUserId = ownerUser?.id ?? userId;

  if (!isUuid(resolvedUserId)) {
    throw new Error("Could not resolve user in public.users for business creation.");
  }

  const existing = await getBusinessForUser(resolvedUserId);
  if (existing) {
    const defaults = await sql`SELECT public.privacy_ensure_business_defaults(
      ${existing.id}, ${resolvedUserId}, ${existing.owner_user_id}, ${
        existing.owner_user_id === resolvedUserId && isPlaceholderBusinessName(existing.name, ownerUser?.email)
      }
    ) AS allowed`;
    if ((defaults[0] as { allowed?: boolean } | undefined)?.allowed !== true) {
      throw new Error("Workspace is unavailable.");
    }
    if (existing.owner_user_id === resolvedUserId && isPlaceholderBusinessName(existing.name, ownerUser?.email)) {
      existing.name = "";
    }
    return existing;
  }

  if (!ownerUser?.id) {
    throw new Error("Could not resolve user in public.users for business creation.");
  }

  const businessName = isPlaceholderBusinessName(ownerUser.business_name, ownerUser.email)
    ? ""
    : ownerUser.business_name?.trim() || "";

  const createdRows = await sql`
    SELECT * FROM public.ensure_workspace_for_user(${resolvedUserId}, ${businessName})
  `;
  const created = createdRows[0] ? DbBusinessRowSchema.parse(createdRows[0]) : null;
  if (!created) {
    throw new Error("Could not resolve user in public.users for business creation.");
  }

  const defaults = await sql`SELECT public.privacy_ensure_business_defaults(
    ${created.id}, ${resolvedUserId}, ${created.owner_user_id}, false
  ) AS allowed`;
  if ((defaults[0] as { allowed?: boolean } | undefined)?.allowed !== true) {
    throw new Error("Workspace is unavailable.");
  }
  return created;
}

function isPlaceholderBusinessName(name: string | null | undefined, email: string | null | undefined): boolean {
  const normalizedName = name?.trim().toLowerCase();
  const normalizedEmail = email?.trim().toLowerCase();
  return Boolean(normalizedName && normalizedEmail && normalizedName === normalizedEmail);
}

export async function getBusinessAgentStatus(
  businessId: string,
  agentId: string
): Promise<DbBusinessAgentRow | null> {
  const rows = await sql`
    SELECT
      id, business_id, agent_id, status, plan_id, billing_period, current_period_start, current_period_end, activated_at, deactivated_at, created_at, updated_at
    FROM public.business_agents
    WHERE business_id = ${businessId} AND agent_id = ${agentId}
    LIMIT 1
  `;
  const row = rows[0] ? DbBusinessAgentRowSchema.parse(rows[0]) : undefined;
  return row ?? null;
}

export async function getBusinessAgents(businessId: string): Promise<DbBusinessAgentRow[]> {
  const rows = await sql`
    SELECT
      id, business_id, agent_id, status, plan_id, billing_period, current_period_start, current_period_end, activated_at, deactivated_at, created_at, updated_at
    FROM public.business_agents
    WHERE business_id = ${businessId}
    ORDER BY agent_id ASC
  `;

  return rows.map((row) => DbBusinessAgentRowSchema.parse(row));
}

export async function userHasActiveAgentAccess(userId: string, agentId: string): Promise<boolean> {
  const business = await getBusinessForUser(userId);
  if (!business) return false;
  return canAccessAgent(business.id, agentId);
}
export async function canAccessAgent(businessId: string, agentId: string): Promise<boolean> {
  const statusRow = await getBusinessAgentStatus(businessId, agentId);
  if (!statusRow) {
    return false;
  }

  return hasActiveBusinessEntitlement(statusRow.status, statusRow.current_period_end);
}

export async function upsertBusinessAgentStatus(
  businessId: string,
  agentId: string,
  status: string
): Promise<DbBusinessAgentRow> {
  const rows = await sql`
    INSERT INTO public.business_agents (business_id, agent_id, status, activated_at, deactivated_at)
    VALUES (
      ${businessId},
      ${agentId},
      ${status},
      CASE WHEN ${status} = 'active' THEN now() ELSE NULL END,
      CASE WHEN ${status} = 'inactive' THEN now() ELSE NULL END
    )
    ON CONFLICT (business_id, agent_id) DO UPDATE SET
      status = EXCLUDED.status,
      activated_at = CASE
        WHEN EXCLUDED.status = 'active' THEN COALESCE(public.business_agents.activated_at, now())
        ELSE public.business_agents.activated_at
      END,
      deactivated_at = CASE
        WHEN EXCLUDED.status = 'inactive' THEN now()
        ELSE public.business_agents.deactivated_at
      END,
      updated_at = now()
    RETURNING
      id, business_id, agent_id, status, plan_id, billing_period, current_period_start, current_period_end, activated_at, deactivated_at, created_at, updated_at
  `;
  return DbBusinessAgentRowSchema.parse(rows[0]);
}

async function resolveOwnerUser(userId: string): Promise<{
  id: string | null;
  email: string | null;
  business_name: string | null;
} | null> {
  // Legacy sessions can carry email in place of UUID user ids.
  // Resolve by email first to avoid UUID cast errors in Postgres.
  if (userId.includes("@")) {
    const byEmailRows = await sql`
      SELECT u.id, u.email, p.business_name
      FROM public.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE lower(u.email) = lower(${userId})
        AND u.privacy_deletion_requested_at IS NULL
      LIMIT 1
    `;
    const byEmail = byEmailRows[0] as
      | {
          id: string;
          email: string | null;
          business_name: string | null;
        }
      | undefined;
    return byEmail ?? null;
  }

  const byIdRows = await sql`
    SELECT u.id, u.email, p.business_name
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = ${userId}
      AND u.privacy_deletion_requested_at IS NULL
    LIMIT 1
  `;
  const byId = byIdRows[0] as
    | {
        id: string;
        email: string | null;
        business_name: string | null;
      }
    | undefined;
  if (byId) {
    return byId;
  }

  return null;
}
