import { sql } from "@/lib/db/neon";
import { encryptToken } from "@/lib/encrypted-token";

/** Returns true if the user has a Google Business Profile OAuth row saved. */
export async function userHasGbpConnection(userId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 AS ok
    FROM public.gbp_connections
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function upsertGbpConnection(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO public.gbp_connections (
      user_id, access_token, refresh_token, expires_at, scope, updated_at
    ) VALUES (
      ${input.userId},
      ${encryptToken(input.accessToken)},
      ${encryptToken(input.refreshToken)},
      ${input.expiresAt},
      ${input.scope},
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      updated_at = now()
  `;
}

export async function updateGbpTokens(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string | null;
}): Promise<void> {
  await sql`
    UPDATE public.gbp_connections
    SET
      access_token = ${encryptToken(input.accessToken)},
      refresh_token = ${encryptToken(input.refreshToken)},
      expires_at = ${input.expiresAt},
      scope = ${input.scope},
      updated_at = now()
    WHERE user_id = ${input.userId}
  `;
}
