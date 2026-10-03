import { sql } from "@/lib/db/neon";

export type DbUserRow = {
  id: string;
  auth_version: number;
  email: string;
  name: string | null;
  password_hash: string | null;
  image: string | null;
  email_verified: string | null;
  privacy_deletion_requested_at?: string | null;
};

export async function findUserByEmail(email: string): Promise<DbUserRow | null> {
  const rows = await sql`
    SELECT id, auth_version, email, name, password_hash, image, email_verified,
      privacy_deletion_requested_at
    FROM public.users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;
  const row = rows[0] as DbUserRow | undefined;
  return row ?? null;
}

export async function findUserById(id: string): Promise<Pick<DbUserRow, "id" | "auth_version" | "privacy_deletion_requested_at"> | null> {
  const rows = await sql`
    SELECT id, auth_version, privacy_deletion_requested_at
    FROM public.users
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0] as { id: string; auth_version: number; privacy_deletion_requested_at: string | null } | undefined;
  return row ?? null;
}

/** Upsert OAuth user and ensure profile row exists. */
export async function ensureUserFromOAuth(input: {
  email: string;
  name: string | null;
  image: string | null;
}): Promise<{ id: string; auth_version: number; privacy_deletion_requested_at: string | null }> {
  const rows = await sql`
    WITH oauth_user AS (
      INSERT INTO public.users (email, name, image, email_verified)
      VALUES (${input.email}, ${input.name}, ${input.image}, now())
      ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.users.name),
        image = COALESCE(EXCLUDED.image, public.users.image),
        email_verified = COALESCE(public.users.email_verified, EXCLUDED.email_verified),
        updated_at = now()
      WHERE public.users.privacy_deletion_requested_at IS NULL
      RETURNING id, auth_version, privacy_deletion_requested_at
    ), profile AS (
      INSERT INTO public.profiles (id, full_name)
      SELECT id, ${input.name} FROM oauth_user
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ), deleting_user AS (
      SELECT id, auth_version, privacy_deletion_requested_at
      FROM public.users
      WHERE lower(email) = lower(${input.email})
        AND privacy_deletion_requested_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM oauth_user)
      LIMIT 1
    )
    SELECT id, auth_version, privacy_deletion_requested_at FROM oauth_user
    UNION ALL
    SELECT id, auth_version, privacy_deletion_requested_at FROM deleting_user
    LIMIT 1
  `;
  const row = rows[0] as { id: string; auth_version: number; privacy_deletion_requested_at: string | null } | undefined;
  if (!row) throw new Error("oauth_user_unavailable");
  return row;
}

export async function createUserWithPassword(input: {
  email: string;
  passwordHash: string;
  fullName: string | null;
}): Promise<{ id: string } | null> {
  /** Single-statement transaction: user + profile stay in sync. */
  const rows = await sql`
    WITH inserted_user AS (
      INSERT INTO public.users (email, password_hash, name)
      VALUES (${input.email}, ${input.passwordHash}, ${input.fullName})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    )
    INSERT INTO public.profiles (id, full_name)
    SELECT id, ${input.fullName} FROM inserted_user
    RETURNING id
  `;
  return (rows[0] as { id: string } | undefined) ?? null;
}
