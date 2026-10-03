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
  const inserted = await sql`SELECT public.auth_create_email_verification_token(
    ${userId}, ${hashToken(token)}, ${callbackUrl}
  ) AS created`;
  if ((inserted[0] as { created?: boolean } | undefined)?.created !== true) {
    throw new Error("auth_token_creation_denied");
  }
  const link = `${getServerAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  await sendAuthEmail(email, "Verify your Ornigami email", link, "Verify your email address");
}

export async function createPasswordReset(email: string, userId: string, callbackUrl: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const inserted = await sql`SELECT public.auth_create_password_reset_token(
    ${userId}, ${hashToken(token)}, ${callbackUrl}
  ) AS created`;
  if ((inserted[0] as { created?: boolean } | undefined)?.created !== true) {
    throw new Error("auth_token_creation_denied");
  }
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
  const rows = await sql`SELECT * FROM public.auth_consume_email_verification_token(${tokenHash})`;
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
  const rows = await sql`SELECT * FROM public.auth_consume_password_reset_token(${tokenHash}, ${passwordHash})`;
  if (!rows.length) return { ok: false, callbackUrl: knownCallback };
  return { ok: true, callbackUrl: String((rows[0] as { callback_url?: string | null }).callback_url ?? "/dashboard") };
}
