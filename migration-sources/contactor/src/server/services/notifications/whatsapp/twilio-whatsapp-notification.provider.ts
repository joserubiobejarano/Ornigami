import twilio from "twilio";

import { env } from "@/server/env";
import type { Business } from "@/server/db/schema";
import { normalizePhone, withWhatsappPrefix } from "@/server/lib/phone";

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export type SendBusinessWhatsappParams = {
  business: Business;
  to: string;
  body: string;
};

export type SendBusinessWhatsappResult = {
  sid: string | null;
  status: string | null;
};

export async function sendBusinessWhatsappNotification(
  params: SendBusinessWhatsappParams,
): Promise<SendBusinessWhatsappResult> {
  const to = normalizePhone(params.to);
  if (!to) {
    throw new Error("Business notification WhatsApp number is invalid.");
  }

  const from = resolveWhatsappFromNumber(params.business);
  const message = await twilioClient.messages.create({
    from,
    to: withWhatsappPrefix(to.replace("whatsapp:", "")),
    body: params.body,
  });

  return {
    sid: message.sid ?? null,
    status: message.status ?? null,
  };
}

function resolveWhatsappFromNumber(business: Business): string {
  const businessFrom = business.twilioPhoneNumber?.trim();

  if (businessFrom?.toLowerCase().startsWith("whatsapp:")) {
    const normalized = normalizePhone(businessFrom);
    if (normalized) {
      return withWhatsappPrefix(normalized.replace("whatsapp:", ""));
    }
  }

  const envWhatsappFrom = env.TWILIO_WHATSAPP_FROM;
  if (!envWhatsappFrom) {
    throw new Error(
      "TWILIO_WHATSAPP_FROM is not configured and no business WhatsApp number is available.",
    );
  }

  const normalized = normalizePhone(envWhatsappFrom) ?? envWhatsappFrom;
  return withWhatsappPrefix(normalized.replace("whatsapp:", ""));
}
