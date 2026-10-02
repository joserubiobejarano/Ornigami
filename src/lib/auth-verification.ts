import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db/neon";
import { getOptionalEnv, getServerAppUrl } from "@/lib/env";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function authEmailDeliveryAvailable(): boolean {
  const key = getOptionalEnv("RESEND_API_KEY");
  const from = getOptionalEnv("EMAIL_FROM");
  const rawUrl = getOptionalEnv("NEXT_PUBLIC_APP_URL");
  if (!key || !from || !rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return process.env.NODE_ENV !== "production" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function sendAuthEmail(to: string, subject: string, link: string, action: string) {
  const key = getOptionalEnv("RESEND_API_KEY");
  const from = getOptionalEnv("EMAIL_FROM");
  if (!key || !from) throw new Error("Auth email delivery unavailable");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Ornigami <${from}>`, to, subject,
      text: `${action}: ${link}`,
      html: `<p>${action}</p><p><a href="${link}">${action}</a></p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Auth email delivery failed");
}

export async function createEmailVerification(email: string, userId: string, callbackUrl: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at, callback_url)
    VALUES (${userId}, ${hashToken(token)}, now() + interval '24 hours', ${callbackUrl})
    ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at, callback_url = EXCLUDED.callback_url, created_at = now()
  `;
  const link = `${getServerAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  await sendAuthEmail(email, "Verify your Ornigami email", link, "Verify your email address");
}

export async function createPasswordReset(email: string, userId: string, callbackUrl: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at, callback_url)
    VALUES (${userId}, ${hashToken(token)}, now() + interval '1 hour', ${callbackUrl})
    ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash,
      expires_at = EXCLUDED.expires_at, callback_url = EXCLUDED.callback_url, created_at = now()
  `;
  const link = `${getServerAppUrl()}/reset-password?token=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  await sendAuthEmail(email, "Reset your Ornigami password", link, "Reset your password");
}

export async function verifyEmailToken(token: string): Promise<{ ok: boolean; callbackUrl: string | null }> {
  const tokenHash = hashToken(token);
  const known = await sql`
    SELECT callback_url, expires_at > now() AS active
    FROM public.email_verification_tokens WHERE token_hash = ${tokenHash} LIMIT 1
  `;
  if (!known.length) return { ok: false, callbackUrl: null };
  const callbackUrl = String((known[0] as { callback_url?: string | null }).callback_url ?? "/dashboard");
  if (!(known[0] as { active: boolean }).active) return { ok: false, callbackUrl };
  const rows = await sql`
    WITH consumed AS (
      DELETE FROM public.email_verification_tokens
      WHERE token_hash = ${tokenHash} AND expires_at > now()
      RETURNING user_id, callback_url
    ), updated AS (
      UPDATE public.users u SET email_verified = now(), updated_at = now()
      FROM consumed c WHERE u.id = c.user_id RETURNING c.callback_url
    ) SELECT callback_url FROM updated
  `;
  return rows.length
    ? { ok: true, callbackUrl: String((rows[0] as { callback_url?: string | null }).callback_url ?? "/dashboard") }
    : { ok: false, callbackUrl };
}

export async function consumePasswordReset(token: string, passwordHash: string): Promise<{ ok: boolean; callbackUrl: string | null }> {
  const tokenHash = hashToken(token);
  const known = await sql`
    SELECT callback_url
    FROM public.password_reset_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const knownCallback = (known[0] as { callback_url?: string | null } | undefined)?.callback_url ?? null;
  const rows = await sql`
    WITH consumed AS (
      DELETE FROM public.password_reset_tokens t USING public.users u
      WHERE t.user_id = u.id AND t.token_hash = ${tokenHash} AND t.expires_at > now()
        AND u.password_hash IS NOT NULL
      RETURNING t.user_id, t.callback_url
    ), updated AS (
      UPDATE public.users u SET password_hash = ${passwordHash}, auth_version = u.auth_version + 1, updated_at = now()
      FROM consumed c WHERE u.id = c.user_id RETURNING c.callback_url
    ) SELECT callback_url FROM updated
  `;
  if (!rows.length) return { ok: false, callbackUrl: knownCallback };
  return { ok: true, callbackUrl: String((rows[0] as { callback_url?: string | null }).callback_url ?? "/dashboard") };
}
