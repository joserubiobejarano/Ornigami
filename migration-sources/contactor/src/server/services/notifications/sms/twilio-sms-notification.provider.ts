import twilio from "twilio";

import { env } from "@/server/env";
import type { Business } from "@/server/db/schema";
import { normalizePhone } from "@/server/lib/phone";

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export type SendBusinessSmsParams = {
  business: Business;
  to: string;
  body: string;
};

export type SendBusinessSmsResult = {
  sid: string | null;
  status: string | null;
};

export async function sendBusinessSmsNotification(
  params: SendBusinessSmsParams,
): Promise<SendBusinessSmsResult> {
  const to = normalizePhone(params.to)?.replace("whatsapp:", "");
  if (!to) {
    throw new Error("Business notification phone is invalid.");
  }

  const from = resolveSmsFromNumber(params.business);
  const message = await twilioClient.messages.create({
    from,
    to,
    body: params.body,
  });

  return {
    sid: message.sid ?? null,
    status: message.status ?? null,
  };
}

function resolveSmsFromNumber(business: Business): string {
  const businessFrom = business.twilioPhoneNumber?.trim();
  if (businessFrom && !businessFrom.toLowerCase().startsWith("whatsapp:")) {
    const normalized = normalizePhone(businessFrom);
    if (normalized) {
      return normalized.replace("whatsapp:", "");
    }
  }

  const envSmsFrom = env.TWILIO_SMS_FROM;
  if (!envSmsFrom) {
    throw new Error(
      "TWILIO_SMS_FROM is not configured and no business SMS number is available.",
    );
  }

  const fallback = normalizePhone(envSmsFrom) ?? envSmsFrom;
  return fallback.replace("whatsapp:", "");
}
