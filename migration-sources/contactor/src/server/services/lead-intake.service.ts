import {
  createConversation,
  getConversationByLeadAndChannel,
  markLastMessageAt,
} from "@/server/db/repositories/conversations.repo";
import {
  getBusinessByInboundAddress,
  getBusinessBySlug,
  resolveBusinessByInboundAddress,
} from "@/server/db/repositories/businesses.repo";
import { createFormSubmission } from "@/server/db/repositories/form-submissions.repo";
import {
  createLead,
  findLeadByPhone,
} from "@/server/db/repositories/leads.repo";
import {
  createMessage,
  getMessageByExternalMessageId,
} from "@/server/db/repositories/messages.repo";
import { normalizePhone } from "@/server/lib/phone";
import { detectTwilioChannel } from "@/server/lib/twilio-webhook";
import { resolveLeadConversationChannel } from "@/server/services/channel-policy.service";
import { logEvent } from "@/server/services/events.service";
import { handleInboundLeadMessage } from "@/server/services/inbound-lead-orchestrator.service";
import { InboundLatencyTracker } from "@/server/services/inbound-latency-tracker.service";
import { safeLogger } from "@/lib/safe-logger";
import type { SubmitFormInput } from "@/server/validators/forms";
import type { TwilioInboundInput } from "@/server/validators/twilio";

export class BusinessInboundAddressNotFoundError extends Error {
  readonly normalizedInboundAddress: string | null;

  constructor(normalizedInboundAddress: string | null) {
    super("Business not found for inbound address.");
    this.name = "BusinessInboundAddressNotFoundError";
    this.normalizedInboundAddress = normalizedInboundAddress;
  }
}

export class InvalidInboundIdentityError extends Error {
  constructor() {
    super("Inbound sender identity is invalid.");
    this.name = "InvalidInboundIdentityError";
  }
}

type IngestResult = {
  leadId: string;
  conversationId: string;
  inboundMessageId: string;
  outboundMessageId?: string;
};

export async function ingestFormLead(input: SubmitFormInput): Promise<IngestResult> {
  const business = await getBusinessBySlug(input.businessSlug);
  if (!business) throw new Error("Business not found.");

  const lead = await createLead({
    businessId: business.id,
    source: input.source,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    notes: input.metadata
      ? `Form metadata: ${JSON.stringify(input.metadata)}`
      : "Form lead created.",
  });

  await createFormSubmission({
    businessId: business.id,
    leadId: lead.id,
    sourceLabel: input.source,
    payload: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      message: input.message,
      metadata: input.metadata ?? {},
    },
  });

  const channel = resolveLeadConversationChannel(business);
  const conversation =
    (await getConversationByLeadAndChannel(business.id, lead.id, channel)) ??
    (await createConversation({ businessId: business.id, leadId: lead.id, channel }));

  const inboundMessage = await createMessage({
    businessId: business.id,
    conversationId: conversation.id,
    direction: "inbound",
    senderType: "lead",
    channel,
    body: input.message,
    rawPayload: {
      source: input.source,
    },
  });

  await markLastMessageAt(conversation.id);
  await logEvent({
    businessId: business.id,
    leadId: lead.id,
    eventType: "lead.received",
    payload: {
      source: input.source,
      conversationId: conversation.id,
      messageId: inboundMessage.id,
    },
  });

  const orchestration = await handleInboundLeadMessage({
    businessId: business.id,
    leadId: lead.id,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
  });

  return {
    leadId: lead.id,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
    outboundMessageId: orchestration.outboundMessageId,
  };
}

export async function ingestTwilioInbound(
  input: TwilioInboundInput,
  rawPayload: Record<string, unknown>,
  preResolvedBusiness?: {
    business: Awaited<ReturnType<typeof getBusinessByInboundAddress>>;
    normalizedInboundAddress: string | null;
    matchedBusinessAddress: string | null;
  },
  latencyTracker?: InboundLatencyTracker,
): Promise<IngestResult> {
  const businessResolution =
    preResolvedBusiness ?? (await resolveBusinessByInboundAddress(input.To));
  const business = businessResolution.business;
  if (!business) {
    throw new BusinessInboundAddressNotFoundError(
      businessResolution.normalizedInboundAddress,
    );
  }

  const channel = detectTwilioChannel(input.From, input.To);
  const normalizedFrom = normalizePhone(input.From);
  const normalizedWaId = input.WaId ? normalizePhone(input.WaId) : null;
  const leadLookupPhone =
    normalizedFrom ?? (channel === "whatsapp" ? normalizedWaId : null);
  if (!leadLookupPhone) {
    throw new InvalidInboundIdentityError();
  }

  latencyTracker?.attachContext({
    businessId: business.id,
  });
  const lead = await (latencyTracker
    ? latencyTracker.timeStage("lead_lookup_or_create", async () => {
        const existingLead = await findLeadByPhone(business.id, leadLookupPhone);
        return (
          existingLead ??
          (await createLead({
            businessId: business.id,
            source: channel,
            fullName: input.ProfileName,
            phone: leadLookupPhone,
            notes: input.WaId ? `WaId: ${input.WaId}` : null,
          }))
        );
      })
    : (async () => {
        const existingLead = await findLeadByPhone(business.id, leadLookupPhone);
        return (
          existingLead ??
          (await createLead({
            businessId: business.id,
            source: channel,
            fullName: input.ProfileName,
            phone: leadLookupPhone,
            notes: input.WaId ? `WaId: ${input.WaId}` : null,
          }))
        );
      })());
  latencyTracker?.attachContext({
    leadId: lead.id,
  });

  const externalContactId = normalizedWaId ?? normalizedFrom ?? input.From;
  const conversation =
    (await getConversationByLeadAndChannel(business.id, lead.id, channel)) ??
    (await createConversation({
      businessId: business.id,
      leadId: lead.id,
      channel,
      externalContactId,
    }));
  latencyTracker?.attachContext({
    conversationId: conversation.id,
  });

  const inboundMessage = await (latencyTracker
    ? latencyTracker.timeStage("message_persist", async () => {
        const existingInbound =
          input.MessageSid && input.MessageSid.trim().length > 0
            ? await getMessageByExternalMessageId(input.MessageSid)
            : null;
        return existingInbound && existingInbound.conversationId === conversation.id
          ? existingInbound
          : createMessage({
              businessId: business.id,
              conversationId: conversation.id,
              direction: "inbound",
              senderType: "lead",
              channel,
              body: input.Body,
              externalMessageId: input.MessageSid ?? null,
              rawPayload,
            });
      })
    : (async () => {
        const existingInbound =
          input.MessageSid && input.MessageSid.trim().length > 0
            ? await getMessageByExternalMessageId(input.MessageSid)
            : null;
        return existingInbound && existingInbound.conversationId === conversation.id
          ? existingInbound
          : createMessage({
              businessId: business.id,
              conversationId: conversation.id,
              direction: "inbound",
              senderType: "lead",
              channel,
              body: input.Body,
              externalMessageId: input.MessageSid ?? null,
              rawPayload,
            });
      })());
  latencyTracker?.attachContext({
    inboundMessageId: inboundMessage.id,
  });

  await markLastMessageAt(conversation.id);
  await logEvent({
    businessId: business.id,
    leadId: lead.id,
    eventType: "twilio.inbound.received",
    payload: {
      from: input.From,
      to: input.To,
      channel,
      externalMessageId: input.MessageSid ?? null,
      conversationId: conversation.id,
      messageId: inboundMessage.id,
    },
  });

  let orchestration: Awaited<ReturnType<typeof handleInboundLeadMessage>> | null = null;
  try {
    orchestration = await handleInboundLeadMessage({
      businessId: business.id,
      leadId: lead.id,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
    }, latencyTracker);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown orchestration error";
      safeLogger.error("Twilio inbound orchestration failed after inbound was stored.", {
      businessId: business.id,
      leadId: lead.id,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
      error: detail,
    });

    try {
      await logEvent({
        businessId: business.id,
        leadId: lead.id,
        eventType: "twilio.inbound.orchestration_failed_nonblocking",
        payload: {
          conversationId: conversation.id,
          inboundMessageId: inboundMessage.id,
          error: detail,
        },
      });
    } catch (eventError) {
      safeLogger.error("Failed to log non-blocking inbound orchestration failure event.", {
        businessId: business.id,
        leadId: lead.id,
        conversationId: conversation.id,
        inboundMessageId: inboundMessage.id,
        error: eventError instanceof Error ? eventError.message : "Unknown event error",
      });
    }
  }

  return {
    leadId: lead.id,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
    outboundMessageId: orchestration?.outboundMessageId,
  };
}
