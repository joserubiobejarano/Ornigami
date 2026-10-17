import { createHash, randomBytes } from "node:crypto";

import { getOptionalEnv, getServerAppUrl } from "@/lib/env";
import { qrMailConfigured, sendAuthorizedResend, type QrMailContext } from "@/lib/qr-mail";

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
  invitationId: string;
  businessId: string;
  email: string;
  businessName: string;
  inviterEmail: string;
  invitationUrl: string;
}): Promise<{ sent: boolean }> {
  const resendApiKey = getOptionalEnv("RESEND_API_KEY");
  const emailFrom = getOptionalEnv("EMAIL_FROM");
  if (!resendApiKey || !emailFrom || !qrMailConfigured("team_invitation")) {
    throw new Error("Team invitation delivery is unavailable.");
  }

  const businessName = escapeHtml(input.businessName || "your team");
  const inviterEmail = escapeHtml(input.inviterEmail);
  const invitationUrl = escapeHtml(input.invitationUrl);
  const payload = JSON.stringify({
      from: `Ornigami <${emailFrom}>`,
      to: input.email,
      subject: `You have been invited to ${input.businessName || "an Ornigami workspace"}`,
      text: `${input.inviterEmail} invited you to join ${input.businessName || "their Ornigami workspace"}. Accept the invitation: ${input.invitationUrl}`,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;"><p>${inviterEmail} invited you to join <strong>${businessName}</strong> on Ornigami.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p style="font-size:12px;color:#64748b;">This invitation expires in ${TEAM_INVITATION_DAYS} days.</p></div>`,
  });
  const context: QrMailContext = {
    purpose: "team_invitation", businessId: input.businessId, candidateId: input.invitationId,
    workKey: `team-invitation:${input.invitationId}`, idempotencyKey: `team-invitation:${input.invitationId}`,
  };
  await sendAuthorizedResend(payload, context);

  return { sent: true };
}
