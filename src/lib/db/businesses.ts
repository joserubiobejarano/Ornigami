import { sql } from "@/lib/db/neon";
import { ensureUserFromOAuth } from "@/lib/db/users";

export type DbBusinessRow = {
  id: string;
  owner_user_id: string;
  name: string;
  business_type: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  google_review_url: string | null;
  rebooking_url: string | null;
  tone: string | null;
  language: string | null;
  email_from_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DbBusinessAgentRow = {
  id: string;
  business_id: string;
  agent_id: string;
  status: string;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

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
      id, owner_user_id, name, business_type, city, country, website, phone,
      google_review_url, rebooking_url, tone, language, email_from_name, created_at, updated_at
    FROM public.businesses
    WHERE owner_user_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const row = rows[0] as DbBusinessRow | undefined;
  return row ?? null;
}

export async function getOrCreateBusinessForUser(userId: string): Promise<DbBusinessRow> {
  let ownerUser = await resolveOwnerUser(userId);

  if (!ownerUser?.id && userId.includes("@")) {
    await ensureUserFromOAuth({
      email: userId,
      name: null,
      image: null,
    });
    ownerUser = await resolveOwnerUser(userId);
  }

  const resolvedUserId = ownerUser?.id ?? userId;

  if (!isUuid(resolvedUserId)) {
    throw new Error("Could not resolve user in public.users for business creation.");
  }

  const existing = await getBusinessForUser(resolvedUserId);
  if (existing) {
    await ensureBusinessDefaults(existing.id, resolvedUserId);
    return existing;
  }

  if (!ownerUser?.id) {
    throw new Error("Could not resolve user in public.users for business creation.");
  }

  const businessName =
    ownerUser.business_name?.trim() ||
    ownerUser.email?.trim() ||
    "My Business";

  const insertedRows = await sql`
    INSERT INTO public.businesses (owner_user_id, name)
    VALUES (${resolvedUserId}, ${businessName})
    RETURNING
      id, owner_user_id, name, business_type, city, country, website, phone,
      google_review_url, rebooking_url, tone, language, email_from_name, created_at, updated_at
  `;
  const created = insertedRows[0] as DbBusinessRow;

  await ensureBusinessDefaults(created.id, resolvedUserId);
  return created;
}

export async function getBusinessAgentStatus(
  businessId: string,
  agentId: string
): Promise<DbBusinessAgentRow | null> {
  const rows = await sql`
    SELECT
      id, business_id, agent_id, status, activated_at, deactivated_at, created_at, updated_at
    FROM public.business_agents
    WHERE business_id = ${businessId} AND agent_id = ${agentId}
    LIMIT 1
  `;
  const row = rows[0] as DbBusinessAgentRow | undefined;
  return row ?? null;
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
      id, business_id, agent_id, status, activated_at, deactivated_at, created_at, updated_at
  `;
  return rows[0] as DbBusinessAgentRow;
}

async function ensureBusinessDefaults(businessId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO public.business_members (business_id, user_id, role)
    VALUES (${businessId}, ${userId}, 'owner')
    ON CONFLICT (business_id, user_id) DO NOTHING
  `;

  await upsertBusinessAgentStatus(businessId, "review_replies", "active");
  await upsertBusinessAgentStatus(businessId, "review_booster", "inactive");
  await upsertBusinessAgentStatus(businessId, "speed_to_lead", "inactive");
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
