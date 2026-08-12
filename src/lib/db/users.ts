import { sql } from "@/lib/db/neon";

export type DbUserRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
  image: string | null;
  email_verified: string | null;
};

export async function findUserByEmail(email: string): Promise<DbUserRow | null> {
  const rows = await sql`
    SELECT id, email, name, password_hash, image, email_verified
    FROM public.users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `;
  const row = rows[0] as DbUserRow | undefined;
  return row ?? null;
}

/** Upsert OAuth user and ensure profile row exists. */
export async function ensureUserFromOAuth(input: {
  email: string;
  name: string | null;
  image: string | null;
}): Promise<{ id: string }> {
  const rows = await sql`
    INSERT INTO public.users (email, name, image, email_verified)
    VALUES (${input.email}, ${input.name}, ${input.image}, now())
    ON CONFLICT (email) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, public.users.name),
      image = COALESCE(EXCLUDED.image, public.users.image),
      email_verified = COALESCE(public.users.email_verified, EXCLUDED.email_verified),
      updated_at = now()
    RETURNING id
  `;
  const id = (rows[0] as { id: string }).id;

  await sql`
    INSERT INTO public.profiles (id, full_name)
    VALUES (${id}, ${input.name})
    ON CONFLICT (id) DO NOTHING
  `;

  return { id };
}

export async function createUserWithPassword(input: {
  email: string;
  passwordHash: string;
  fullName: string | null;
}): Promise<{ id: string }> {
  /** Single-statement transaction: user + profile stay in sync. */
  const rows = await sql`
    WITH inserted_user AS (
      INSERT INTO public.users (email, password_hash, name)
      VALUES (${input.email}, ${input.passwordHash}, ${input.fullName})
      RETURNING id
    )
    INSERT INTO public.profiles (id, full_name)
    SELECT id, ${input.fullName} FROM inserted_user
    RETURNING id
  `;
  const id = (rows[0] as { id: string }).id;
  return { id };
}
