import { createHash } from "node:crypto";

import { sql } from "@/lib/db/neon";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

function keyHash(kind: string, value: string) {
  return createHash("sha256").update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

function keys(email: string, ipAddress: string | null) {
  return [keyHash("email", email), keyHash("ip", ipAddress || "unknown")];
}

export async function isCredentialsLoginRateLimited(email: string, ipAddress: string | null) {
  const rows = await Promise.all(keys(email, ipAddress).map((key) => sql`
    SELECT failures, locked_until
    FROM public.auth_login_attempts
    WHERE key_hash = ${key}
      AND window_started_at > now() - (${WINDOW_MINUTES} * interval '1 minute')
    LIMIT 1
  `));
  return rows.some((result) => {
    const row = result[0] as { failures?: number; locked_until?: string | null } | undefined;
    return Boolean(row && (Number(row.failures ?? 0) >= MAX_FAILURES || (row.locked_until && new Date(row.locked_until) > new Date())));
  });
}

export async function recordCredentialsLoginFailure(email: string, ipAddress: string | null) {
  for (const key of keys(email, ipAddress)) {
    await sql`
      INSERT INTO public.auth_login_attempts (key_hash, failures, window_started_at, locked_until)
      VALUES (${key}, 1, now(), NULL)
      ON CONFLICT (key_hash) DO UPDATE SET
        failures = CASE
          WHEN public.auth_login_attempts.window_started_at <= now() - (${WINDOW_MINUTES} * interval '1 minute') THEN 1
          ELSE public.auth_login_attempts.failures + 1
        END,
        window_started_at = CASE
          WHEN public.auth_login_attempts.window_started_at <= now() - (${WINDOW_MINUTES} * interval '1 minute') THEN now()
          ELSE public.auth_login_attempts.window_started_at
        END,
        locked_until = CASE
          WHEN public.auth_login_attempts.failures + 1 >= ${MAX_FAILURES} THEN now() + interval '15 minutes'
          ELSE NULL
        END,
        updated_at = now()
    `;
  }
}

export async function clearCredentialsLoginFailures(email: string, ipAddress: string | null) {
  for (const key of keys(email, ipAddress)) {
    await sql`DELETE FROM public.auth_login_attempts WHERE key_hash = ${key}`;
  }
}
