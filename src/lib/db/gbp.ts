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
}): Promise<{ connectionVersion: string; encryptedRefreshToken: string }> {
  const rows = await sql`
    WITH business_locks AS MATERIALIZED (
      SELECT id FROM public.businesses WHERE owner_user_id=${input.userId}::uuid ORDER BY id FOR UPDATE
    ), lifecycle_user AS MATERIALIZED (
      SELECT u.id FROM public.users u WHERE u.id=${input.userId}::uuid
        AND u.privacy_deletion_requested_at IS NULL AND EXISTS (SELECT 1 FROM business_locks)
      FOR UPDATE OF u
    ), cache_invalidation AS MATERIALIZED (
      UPDATE public.gbp_locations SET connected=false,updated_at=now()
      WHERE user_id=${input.userId}::uuid AND EXISTS (SELECT 1 FROM lifecycle_user)
      RETURNING user_id
    )
    INSERT INTO public.gbp_connections (
      user_id, access_token, refresh_token, expires_at, scope, connection_version, updated_at
    ) SELECT
      ${input.userId},
      ${encryptToken(input.accessToken)},
      ${encryptToken(input.refreshToken)},
      ${input.expiresAt},
      ${input.scope},
      gen_random_uuid(),
      now()
    FROM lifecycle_user CROSS JOIN (SELECT count(*) FROM cache_invalidation) invalidated
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      scope = EXCLUDED.scope,
      connection_version = EXCLUDED.connection_version,
      updated_at = now()
    WHERE EXISTS (SELECT 1 FROM public.users lifecycle_user WHERE lifecycle_user.id=EXCLUDED.user_id
      AND lifecycle_user.privacy_deletion_requested_at IS NULL)
    RETURNING user_id,connection_version,refresh_token
  `;
  if (!rows.length) throw new Error("Google connection blocked by account lifecycle");
  const row = rows[0] as { connection_version?: string; refresh_token?: string };
  if (!row.connection_version || !row.refresh_token) throw new Error("Google connection persistence snapshot missing");
  return { connectionVersion: row.connection_version, encryptedRefreshToken: row.refresh_token };
}

export async function updateGbpTokens(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string | null;
}): Promise<void> {
  const rows = await sql`
    WITH business_locks AS MATERIALIZED (
      SELECT id FROM public.businesses WHERE owner_user_id=${input.userId}::uuid ORDER BY id FOR UPDATE
    ), lifecycle_user AS MATERIALIZED (
      SELECT u.id FROM public.users u WHERE u.id=${input.userId}::uuid
        AND u.privacy_deletion_requested_at IS NULL AND EXISTS (SELECT 1 FROM business_locks)
      FOR UPDATE OF u
    )
    UPDATE public.gbp_connections
    SET
      access_token = ${encryptToken(input.accessToken)},
      refresh_token = ${encryptToken(input.refreshToken)},
      expires_at = ${input.expiresAt},
      scope = ${input.scope},
      updated_at = now()
    WHERE user_id = ${input.userId}::uuid AND EXISTS (SELECT 1 FROM lifecycle_user)
    RETURNING user_id
  `;
  if (!rows.length) throw new Error("Google token update blocked by account lifecycle");
}

/**
 * Persists a refresh or legacy-token upgrade only while the exact encrypted
 * credentials and OAuth connection generation read by the caller are current.
 * A false result means another refresh, reconnect, or disconnect won the race.
 */
export async function updateGbpTokensIfCurrent(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string | null;
  expectedConnectionVersion: string;
  expectedEncryptedAccessToken: string;
  expectedEncryptedRefreshToken: string;
}): Promise<boolean> {
  const rows = await sql`
    WITH business_locks AS MATERIALIZED (
      SELECT id FROM public.businesses WHERE owner_user_id=${input.userId}::uuid ORDER BY id FOR UPDATE
    ), lifecycle_user AS MATERIALIZED (
      SELECT u.id FROM public.users u WHERE u.id=${input.userId}::uuid
        AND u.privacy_deletion_requested_at IS NULL AND EXISTS (SELECT 1 FROM business_locks)
      FOR UPDATE OF u
    )
    UPDATE public.gbp_connections
    SET
      access_token = ${encryptToken(input.accessToken)},
      refresh_token = ${encryptToken(input.refreshToken)},
      expires_at = ${input.expiresAt},
      scope = ${input.scope},
      updated_at = now()
    WHERE user_id = ${input.userId}
      AND connection_version = ${input.expectedConnectionVersion}
      AND access_token = ${input.expectedEncryptedAccessToken}
      AND refresh_token = ${input.expectedEncryptedRefreshToken}
      AND EXISTS (SELECT 1 FROM lifecycle_user)
    RETURNING user_id
  `;
  return rows.length > 0;
}
