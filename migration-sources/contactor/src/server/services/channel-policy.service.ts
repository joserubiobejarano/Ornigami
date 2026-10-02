import type { Business } from "@/server/db/schema";

type Channel = "sms" | "whatsapp";
type WhatsappSenderStatus =
  | "not_started"
  | "number_assigned"
  | "pending_approval"
  | "approved"
  | "rejected";

type BusinessChannelSettings = Pick<
  Business,
  "preferredChannel" | "smsEnabled" | "whatsappEnabled"
>;

type WhatsappActivationSettings = Pick<
  Business,
  "twilioPhoneNumber" | "whatsappSenderStatus"
>;

export class ChannelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelConfigurationError";
  }
}

export class WhatsappActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsappActivationError";
  }
}

function isApprovedSenderStatus(status: WhatsappSenderStatus): boolean {
  return status === "approved";
}

export function assertCanEnableWhatsapp(
  settings: WhatsappActivationSettings,
): void {
  if (!settings.twilioPhoneNumber) {
    throw new WhatsappActivationError(
      "Cannot enable WhatsApp without an assigned Twilio number.",
    );
  }

  if (!isApprovedSenderStatus(settings.whatsappSenderStatus)) {
    throw new WhatsappActivationError(
      "Cannot enable WhatsApp until sender status is approved.",
    );
  }
}

export function assertValidPreferredChannelConfiguration(
  settings: BusinessChannelSettings,
): void {
  if (settings.preferredChannel === "whatsapp" && !settings.whatsappEnabled) {
    throw new ChannelConfigurationError(
      "Preferred channel is WhatsApp, but WhatsApp is disabled. Enable WhatsApp or choose SMS.",
    );
  }

  if (settings.preferredChannel === "sms" && !settings.smsEnabled) {
    throw new ChannelConfigurationError(
      "Preferred channel is SMS, but SMS is disabled. Enable SMS or choose WhatsApp.",
    );
  }
}

export function resolveLeadConversationChannel(
  settings: BusinessChannelSettings,
): Channel {
  assertValidPreferredChannelConfiguration(settings);
  return settings.preferredChannel;
}

export function getFallbackChannelForFailedPreferredSend(
  settings: BusinessChannelSettings & { attemptedChannel: Channel },
): Channel | null {
  const attemptedPreferredChannel =
    settings.attemptedChannel === settings.preferredChannel;
  if (!attemptedPreferredChannel) return null;

  const fallbackChannel = settings.preferredChannel === "sms" ? "whatsapp" : "sms";
  const fallbackEnabled =
    fallbackChannel === "sms" ? settings.smsEnabled : settings.whatsappEnabled;

  return fallbackEnabled ? fallbackChannel : null;
}
