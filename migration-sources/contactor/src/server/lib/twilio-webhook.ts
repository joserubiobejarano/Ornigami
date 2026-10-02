import twilio from "twilio";

import { env } from "@/server/env";

type SupportedChannel = "sms" | "whatsapp";

export class TwilioSignatureError extends Error {
  constructor() {
    super("Invalid Twilio request signature.");
    this.name = "TwilioSignatureError";
  }
}

export function detectTwilioChannel(from?: string, to?: string): SupportedChannel {
  const normalizedFrom = from?.trim().toLowerCase() ?? "";
  const normalizedTo = to?.trim().toLowerCase() ?? "";
  if (normalizedFrom.startsWith("whatsapp:") || normalizedTo.startsWith("whatsapp:")) {
    return "whatsapp";
  }
  return "sms";
}

function getWebhookValidationUrl(req: Request): string {
  const configuredBase = env.TWILIO_WEBHOOK_BASE_URL?.trim();
  if (!configuredBase) return req.url;

  const incomingUrl = new URL(req.url);
  const base = configuredBase.replace(/\/+$/, "");
  return `${base}${incomingUrl.pathname}${incomingUrl.search}`;
}

export function verifyTwilioRequestSignature(params: {
  request: Request;
  formFields: Record<string, string>;
}): void {
  if (!env.TWILIO_VALIDATE_WEBHOOK_SIGNATURE) {
    return;
  }

  const signature = params.request.headers.get("x-twilio-signature");
  if (!signature) {
    throw new TwilioSignatureError();
  }

  const url = getWebhookValidationUrl(params.request);
  const authToken = env.TWILIO_WEBHOOK_AUTH_TOKEN;
  const isValid = twilio.validateRequest(authToken, signature, url, params.formFields);
  if (!isValid) {
    throw new TwilioSignatureError();
  }
}
