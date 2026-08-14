import { createHash, randomBytes } from "node:crypto";

import { getOptionalEnv, getServerAppUrl } from "@/lib/env";

export const TEAM_INVITATION_DAYS = 7;

export function createTeamInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTeamInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function teamInvitationUrl(token: string): string {
  return `${getServerAppUrl()}/team/invite/${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendTeamInvitationEmail(input: {
  email: string;
  businessName: string;
  inviterEmail: string;
  invitationUrl: string;
}): Promise<{ sent: boolean }> {
  const resendApiKey = getOptionalEnv("RESEND_API_KEY");
  const emailFrom = getOptionalEnv("EMAIL_FROM");
  if (!resendApiKey || !emailFrom) {
    return { sent: false };
  }

  const businessName = escapeHtml(input.businessName || "your team");
  const inviterEmail = escapeHtml(input.inviterEmail);
  const invitationUrl = escapeHtml(input.invitationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Ornigami <${emailFrom}>`,
      to: input.email,
      subject: `You have been invited to ${input.businessName || "an Ornigami workspace"}`,
      text: `${input.inviterEmail} invited you to join ${input.businessName || "their Ornigami workspace"}. Accept the invitation: ${input.invitationUrl}`,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;"><p>${inviterEmail} invited you to join <strong>${businessName}</strong> on Ornigami.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p style="font-size:12px;color:#64748b;">This invitation expires in ${TEAM_INVITATION_DAYS} days.</p></div>`,
    }),
  });

  if (!response.ok) {
    throw new Error("Team invitation email could not be sent.");
  }

  return { sent: true };
}
