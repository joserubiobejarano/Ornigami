import type { Business, Conversation, Lead } from "@/server/db/schema";
import { getMessageById } from "@/server/db/repositories/messages.repo";
import { logEvent } from "@/server/services/events.service";
import {
  getEmailProvider,
  getEmailProviderStatus,
} from "@/server/services/notifications/email/email-provider-factory";
import { sendBusinessWhatsappNotification } from "@/server/services/notifications/whatsapp/twilio-whatsapp-notification.provider";
import { normalizePhone } from "@/server/lib/phone";
import { safeLogger } from "@/lib/safe-logger";

type TriggerBusinessNotificationParams = {
  business: Business;
  lead: Lead;
  conversation: Conversation;
  reason: "urgent" | "qualification_ready" | "new_lead";
  inboundMessageId: string;
  preferredTiming: string | null;
};

const { provider: emailProvider, status: emailProviderStatus } = getEmailProvider();

export async function triggerBusinessNotification(
  params: TriggerBusinessNotificationParams,
): Promise<void> {
  const inboundMessage = await getMessageById(params.inboundMessageId);
  const context = buildNotificationContext(params, inboundMessage?.body ?? null);
  const email = cleanValue(params.business.notificationEmail);
  const whatsapp = normalizePhone(params.business.notificationWhatsapp)?.replace(
    "whatsapp:",
    "",
  );

  const channelPlans: Array<{
    channel: "email" | "whatsapp";
    destination: string;
  }> = [];

  if (params.business.notifyOwnerViaEmail && email) {
    channelPlans.push({ channel: "email", destination: email });
  }
  if (params.business.notifyOwnerViaWhatsapp && whatsapp) {
    channelPlans.push({ channel: "whatsapp", destination: whatsapp });
  }

  if (channelPlans.length === 0) {
    await logEvent({
      businessId: params.business.id,
      leadId: params.lead.id,
      eventType: "lead.owner_notification.skipped",
      payload: {
        skipReason: "no_enabled_channel_or_destination",
        configured: {
          notifyOwnerViaEmail: params.business.notifyOwnerViaEmail,
          notifyOwnerViaWhatsapp: params.business.notifyOwnerViaWhatsapp,
          hasEmail: Boolean(email),
          hasWhatsapp: Boolean(whatsapp),
        },
        ...context,
      },
    });
    return;
  }

  for (const plan of channelPlans) {
    await logEvent({
      businessId: params.business.id,
      leadId: params.lead.id,
      eventType: "lead.owner_notification.attempted",
      payload: {
        deliveryChannel: plan.channel,
        destination: plan.destination,
        ...context,
      },
    });

    try {
      if (plan.channel === "email") {
        const result = await emailProvider.send({
          to: plan.destination,
          subject: `[Lead Alert] ${context.businessName} - ${context.reasonLabel}`,
          text: renderEmailNotificationText(context),
          metadata: context,
        });

        await logEvent({
          businessId: params.business.id,
          leadId: params.lead.id,
          eventType: "lead.owner_notification.sent",
          payload: {
            deliveryChannel: "email",
            destination: plan.destination,
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            ...context,
          },
        });
        continue;
      }

      const result = await sendBusinessWhatsappNotification({
        business: params.business,
        to: plan.destination,
        body: renderWhatsappNotificationText(context),
      });

      await logEvent({
        businessId: params.business.id,
        leadId: params.lead.id,
        eventType: "lead.owner_notification.sent",
        payload: {
          deliveryChannel: "whatsapp",
          destination: plan.destination,
          provider: "twilio",
          sid: result.sid,
          status: result.status,
          ...context,
        },
      });
    } catch (error) {
      await logNotificationFailure({
        params,
        context,
        deliveryChannel: plan.channel,
        destination: plan.destination,
        error,
      });
    }
  }
}

type NotificationContext = {
  recommendedAction: "Call now" | "Follow up" | "Schedule";
  businessName: string;
  leadName: string | null;
  leadPhone: string | null;
  sourceChannel: string;
  inquirySummary: string;
  intent: string | null;
  urgency: string | null;
  preferredTiming: string | null;
  reason: "urgent" | "qualification_ready" | "new_lead";
  reasonLabel: "Urgent Lead" | "Qualification Ready" | "New Lead";
  timestamp: string;
  conversationId: string;
  inboundMessageId: string;
  leadDashboardPath: string;
  leadDashboardUrl: string | null;
  reasonDescription: string;
  providerMode: "mock" | "resend" | "disabled";
};

function buildNotificationContext(
  params: TriggerBusinessNotificationParams,
  inboundMessageBody: string | null,
): NotificationContext {
  const intent = cleanValue(params.lead.intent);
  const urgency = cleanValue(params.lead.urgency);
  const preferredTiming = cleanValue(params.preferredTiming);

  return {
    recommendedAction: resolveRecommendedAction({
      reason: params.reason,
      urgency,
      preferredTiming,
      intent,
    }),
    businessName: params.business.name,
    leadName: cleanValue(params.lead.fullName),
    leadPhone: cleanValue(params.lead.phone),
    sourceChannel: cleanValue(params.lead.source) ?? params.conversation.channel,
    inquirySummary: buildInquirySummary(params.lead.summary, inboundMessageBody),
    intent,
    urgency,
    preferredTiming,
    reason: params.reason,
    reasonLabel: mapReasonLabel(params.reason),
    timestamp: new Date().toISOString(),
    conversationId: params.conversation.id,
    inboundMessageId: params.inboundMessageId,
    leadDashboardPath: `/dashboard/leads/${params.lead.id}`,
    leadDashboardUrl: buildDashboardUrl(params.lead.id),
    reasonDescription: mapReasonDescription(params.reason),
    providerMode: emailProviderStatus.kind,
  };
}

function mapReasonLabel(
  reason: TriggerBusinessNotificationParams["reason"],
): NotificationContext["reasonLabel"] {
  if (reason === "urgent") return "Urgent Lead";
  if (reason === "new_lead") return "New Lead";
  return "Qualification Ready";
}

function mapReasonDescription(reason: TriggerBusinessNotificationParams["reason"]): string {
  if (reason === "urgent") {
    return "Lead urgency was marked as urgent and requires immediate owner attention.";
  }
  if (reason === "new_lead") {
    return "A new lead entered the conversation flow and notifications are enabled for new leads.";
  }
  return "Lead reached qualification-ready criteria and is ready for owner follow-up.";
}

function buildInquirySummary(
  leadSummary: string | null,
  inboundMessageBody: string | null,
): string {
  const summary = cleanValue(leadSummary) ?? cleanValue(inboundMessageBody);
  if (!summary) return "No summary available.";

  const compact = summary.replace(/\s+/g, " ").trim();
  if (compact.length <= 240) return compact;
  return `${compact.slice(0, 237)}...`;
}

function renderEmailNotificationText(context: NotificationContext): string {
  const lines = [
    `${context.reasonLabel} - ${context.businessName}`,
    "",
    `Reason for notification: ${context.reasonDescription}`,
    `Reason: ${context.reasonLabel}`,
    `Recommended action: ${context.recommendedAction}`,
    `Lead name: ${context.leadName ?? "Unknown"}`,
    `Phone: ${context.leadPhone ?? "Unknown"}`,
    `Source channel: ${context.sourceChannel}`,
    `Intent: ${context.intent ?? "Unknown"}`,
    `Urgency: ${context.urgency ?? "Unknown"}`,
    `Preferred timing: ${context.preferredTiming ?? "Unknown"}`,
    `Summary: ${context.inquirySummary}`,
    `Dashboard: ${context.leadDashboardUrl ?? context.leadDashboardPath}`,
    `Timestamp: ${context.timestamp}`,
  ];

  return lines.join("\n");
}

function renderWhatsappNotificationText(context: NotificationContext): string {
  return [
    `${context.reasonLabel} for ${context.businessName}:`,
    `Recommended action: ${context.recommendedAction}`,
    `Name: ${context.leadName ?? "Unknown"}`,
    `Source: ${context.sourceChannel}`,
    `Intent: ${context.intent ?? "Unknown"}`,
    `Urgency: ${context.urgency ?? "Unknown"}`,
    `Timing: ${context.preferredTiming ?? "Unknown"}`,
    `Summary: ${context.inquirySummary}`,
    `Phone: ${context.leadPhone ?? "Unknown"}`,
    "Check dashboard for full details.",
  ].join("\n");
}

function resolveRecommendedAction(input: {
  reason: TriggerBusinessNotificationParams["reason"];
  urgency: string | null;
  preferredTiming: string | null;
  intent: string | null;
}): NotificationContext["recommendedAction"] {
  const urgency = input.urgency?.toLowerCase() ?? "";
  if (input.reason === "urgent" || urgency === "urgent") {
    return "Call now";
  }
  if (input.preferredTiming) {
    return "Schedule";
  }
  if (input.reason === "qualification_ready" || input.intent) {
    return "Follow up";
  }
  return "Follow up";
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function buildDashboardUrl(leadId: string): string | null {
  const baseUrl = cleanValue(process.env.APP_BASE_URL)?.replace(/\/$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/dashboard/leads/${leadId}`;
}

async function logNotificationFailure(input: {
  params: TriggerBusinessNotificationParams;
  context: NotificationContext;
  deliveryChannel: "email" | "whatsapp";
  destination: string;
  error: unknown;
}): Promise<void> {
  const detail = input.error instanceof Error ? input.error.message : "Unknown error";

  await logEvent({
    businessId: input.params.business.id,
    leadId: input.params.lead.id,
    eventType: "lead.owner_notification.failed",
    payload: {
      deliveryChannel: input.deliveryChannel,
      destination: input.destination,
      error: detail,
      providerReason: getEmailProviderStatus().reason,
      ...input.context,
    },
  });

  safeLogger.error("Business notification delivery failed.", {
    businessId: input.params.business.id,
    leadId: input.params.lead.id,
    deliveryChannel: input.deliveryChannel,
    error: detail,
  });
}
