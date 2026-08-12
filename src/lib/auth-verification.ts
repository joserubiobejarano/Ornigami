import { createHash, randomBytes } from "node:crypto";

import { sql } from "@/lib/db/neon";
import { getServerAppUrl } from "@/lib/env";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailVerification(email: string, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashToken(token)}, now() + interval '24 hours')
    ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = now()
  `;

  const link = `${getServerAppUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return link;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Ornigami <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Verify your Ornigami email",
      text: `Verify your email address by opening this link: ${link}`,
      html: `<p>Verify your Ornigami email address:</p><p><a href="${link}">Verify email</a></p>`,
    }),
  });
  if (!response.ok) throw new Error("Verification email could not be sent.");
  return link;
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  const rows = await sql`
    UPDATE public.users u
    SET email_verified = now(), updated_at = now()
    FROM public.email_verification_tokens t
    WHERE t.user_id = u.id
      AND t.token_hash = ${hashToken(token)}
      AND t.expires_at > now()
    RETURNING u.id
  `;
  if (rows.length === 0) return false;
  await sql`DELETE FROM public.email_verification_tokens WHERE user_id = ${(rows[0] as { id: string }).id}`;
  return true;
}
