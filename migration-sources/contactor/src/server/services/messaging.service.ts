import twilio from "twilio";

import { env } from "@/server/env";
import {
  createMessage,
  getLatestOutboundMessageByBody,
  getLatestOutboundMessageByParentInboundMessageId,
  updateOutboundMessageResult,
} from "@/server/db/repositories/messages.repo";
import type { Business, Conversation, Lead } from "@/server/db/schema";
import { normalizePhone, withWhatsappPrefix } from "@/server/lib/phone";
import { getFallbackChannelForFailedPreferredSend } from "@/server/services/channel-policy.service";
import { logEvent } from "@/server/services/events.service";
import { safeLogger } from "@/lib/safe-logger";

type Channel = "sms" | "whatsapp";

type SendLeadReplyParams = {
  business: Business;
  conversation: Conversation;
  lead: Lead;
  channel: Channel;
  body: string;
  parentInboundMessageId?: string;
  allowMultipleRepliesPerInbound?: boolean;
  replyKind?: "placeholder" | "final" | "suppression_stop";
};

type SendLeadReplyResult = {
  messageId: string;
  sid: string | null;
  deliveryStatus: string;
  duplicateSkipped: boolean;
};

const twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
const DUPLICATE_WINDOW_MS = 90_000;

export async function sendLeadReply(
  params: SendLeadReplyParams,
): Promise<SendLeadReplyResult> {
  const normalizedBody = params.body.trim();
  if (!normalizedBody) {
    throw new Error("Outbound message body cannot be empty.");
  }

  const toAddress = formatTwilioTo(params.lead.phone, params.channel);
  const fromAddress = formatTwilioFrom(params.business, params.channel);

  if (params.parentInboundMessageId) {
    const messageForInbound = await getLatestOutboundMessageByParentInboundMessageId(
      {
        conversationId: params.conversation.id,
        parentInboundMessageId: params.parentInboundMessageId,
        ...(params.allowMultipleRepliesPerInbound && params.replyKind
          ? { replyKind: params.replyKind }
          : {}),
      },
    );
    if (messageForInbound && messageForInbound.deliveryStatus !== "failed") {
      return {
        messageId: messageForInbound.id,
        sid: messageForInbound.externalMessageId ?? null,
        deliveryStatus: messageForInbound.deliveryStatus ?? "sent",
        duplicateSkipped: true,
      };
    }
  }

  const duplicate = await getLatestOutboundMessageByBody({
    conversationId: params.conversation.id,
    channel: params.channel,
    body: normalizedBody,
  });
  if (duplicate && isDuplicateWithinWindow(duplicate)) {
    return {
      messageId: duplicate.id,
      sid: duplicate.externalMessageId ?? null,
      deliveryStatus: duplicate.deliveryStatus ?? "sent",
      duplicateSkipped: true,
    };
  }

  const outboundMessage = await createMessage({
    businessId: params.business.id,
    conversationId: params.conversation.id,
    direction: "outbound",
    senderType: "ai",
    channel: params.channel,
    body: normalizedBody,
    deliveryStatus: "queued",
    rawPayload: {
      provider: "twilio",
      sendState: "queued",
      from: fromAddress,
      to: toAddress,
      parentInboundMessageId: params.parentInboundMessageId ?? null,
      replyKind: params.replyKind ?? null,
    },
  });

  try {
    safeLogger.info("Twilio outbound send attempt.", {
      businessId: params.business.id,
      leadId: params.lead.id,
      conversationId: params.conversation.id,
      channel: params.channel,
      from: fromAddress,
      to: toAddress,
      body: normalizedBody,
      parentInboundMessageId: params.parentInboundMessageId ?? null,
      replyKind: params.replyKind ?? null,
    });

    const twilioMessage = await twilioClient.messages.create({
      from: fromAddress,
      to: toAddress,
      body: normalizedBody,
    });

    const deliveryStatus = normalizeDeliveryStatus(twilioMessage.status);
    await updateOutboundMessageResult({
      messageId: outboundMessage.id,
      externalMessageId: twilioMessage.sid,
      deliveryStatus,
      rawPayload: {
        provider: "twilio",
        sendState: "sent",
        from: fromAddress,
        to: toAddress,
        parentInboundMessageId: params.parentInboundMessageId ?? null,
        replyKind: params.replyKind ?? null,
        sid: twilioMessage.sid,
        twilioStatus: twilioMessage.status ?? null,
      },
    });

    return {
      messageId: outboundMessage.id,
      sid: twilioMessage.sid,
      deliveryStatus,
      duplicateSkipped: false,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Twilio error";

    await updateOutboundMessageResult({
      messageId: outboundMessage.id,
      deliveryStatus: "failed",
      rawPayload: {
        provider: "twilio",
        sendState: "failed",
        from: fromAddress,
        to: toAddress,
        parentInboundMessageId: params.parentInboundMessageId ?? null,
        replyKind: params.replyKind ?? null,
        error: detail,
      },
    });

    await logEvent({
      businessId: params.business.id,
      leadId: params.lead.id,
      eventType: "twilio.outbound.failed",
      payload: {
        conversationId: params.conversation.id,
        messageId: outboundMessage.id,
        channel: params.channel,
        error: detail,
      },
    });

    const fallbackChannel = getFallbackChannelForFailedPreferredSend({
      preferredChannel: params.business.preferredChannel,
      smsEnabled: params.business.smsEnabled,
      whatsappEnabled: params.business.whatsappEnabled,
      attemptedChannel: params.channel,
    });
    if (fallbackChannel) {
      // TODO(mvp): implement fallback-send policy and retry strategy for failed preferred sends.
      await logEvent({
        businessId: params.business.id,
        leadId: params.lead.id,
        eventType: "twilio.outbound.fallback_available",
        payload: {
          conversationId: params.conversation.id,
          messageId: outboundMessage.id,
          attemptedChannel: params.channel,
          fallbackChannel,
          reason: "preferred_channel_send_failed",
        },
      });
    }

    safeLogger.error("Twilio outbound send failed.", {
      businessId: params.business.id,
      leadId: params.lead.id,
      conversationId: params.conversation.id,
      channel: params.channel,
      error: detail,
    });
    throw error;
  }
}

function normalizeDeliveryStatus(status: string | null): "queued" | "sent" | "failed" {
  if (!status) return "sent";
  if (status === "failed" || status === "undelivered" || status === "canceled") {
    return "failed";
  }
  if (
    status === "queued" ||
    status === "accepted" ||
    status === "scheduled" ||
    status === "sending"
  ) {
    return "queued";
  }
  return "sent";
}

function formatTwilioTo(leadPhone: string | null, channel: Channel): string {
  const normalizedLeadPhone = normalizePhone(leadPhone);
  if (!normalizedLeadPhone) {
    throw new Error("Lead phone number is missing or invalid.");
  }

  const smsPhone = normalizedLeadPhone.replace("whatsapp:", "");
  return channel === "whatsapp" ? withWhatsappPrefix(smsPhone) : smsPhone;
}

function formatTwilioFrom(business: Business, channel: Channel): string {
  const businessFrom = business.twilioPhoneNumber?.trim();

  if (channel === "whatsapp") {
    if (businessFrom?.toLowerCase().startsWith("whatsapp:")) {
      return withWhatsappPrefix(
        (normalizePhone(businessFrom) ?? businessFrom).replace("whatsapp:", ""),
      );
    }

    const envWhatsappFrom = env.TWILIO_WHATSAPP_FROM;
    if (!envWhatsappFrom) {
      throw new Error(
        "TWILIO_WHATSAPP_FROM is not configured and no business WhatsApp number is available.",
      );
    }
    const normalizedEnvWhatsappFrom =
      normalizePhone(envWhatsappFrom) ?? envWhatsappFrom;
    return withWhatsappPrefix(normalizedEnvWhatsappFrom.replace("whatsapp:", ""));
  }

  if (businessFrom && !businessFrom.toLowerCase().startsWith("whatsapp:")) {
    const normalizedBusinessFrom = normalizePhone(businessFrom);
    if (normalizedBusinessFrom) {
      return normalizedBusinessFrom.replace("whatsapp:", "");
    }
  }

  const envSmsFrom = env.TWILIO_SMS_FROM;
  if (!envSmsFrom) {
    throw new Error(
      "TWILIO_SMS_FROM is not configured and no business SMS number is available.",
    );
  }

  const normalizedSmsFrom = normalizePhone(envSmsFrom) ?? envSmsFrom;
  return normalizedSmsFrom.replace("whatsapp:", "");
}

function isDuplicateWithinWindow(message: {
  createdAt: Date;
  deliveryStatus: string | null;
} | null): boolean {
  if (!message) return false;
  if (message.deliveryStatus === "failed") return false;
  return Date.now() - message.createdAt.getTime() <= DUPLICATE_WINDOW_MS;
}
