import { sql } from "@/lib/db/neon";

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

export async function getBusinessForUser(userId: string): Promise<DbBusinessRow | null> {
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
  const existing = await getBusinessForUser(userId);
  if (existing) {
    await ensureBusinessDefaults(existing.id, userId);
    return existing;
  }

  const identityRows = await sql`
    SELECT u.email, p.business_name
    FROM public.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  const identity = identityRows[0] as
    | {
        email: string | null;
        business_name: string | null;
      }
    | undefined;

  const businessName =
    identity?.business_name?.trim() ||
    identity?.email?.trim() ||
    "My Business";

  const insertedRows = await sql`
    INSERT INTO public.businesses (owner_user_id, name)
    VALUES (${userId}, ${businessName})
    RETURNING
      id, owner_user_id, name, business_type, city, country, website, phone,
      google_review_url, rebooking_url, tone, language, email_from_name, created_at, updated_at
  `;
  const created = insertedRows[0] as DbBusinessRow;

  await ensureBusinessDefaults(created.id, userId);
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
