import {
  createConversation,
  getConversationByLeadAndChannel,
  markLastMessageAt,
} from "@/server/db/repositories/conversations.repo";
import { createFormSubmission } from "@/server/db/repositories/form-submissions.repo";
import { getBusinessBySlug } from "@/server/db/repositories/businesses.repo";
import { createLead } from "@/server/db/repositories/leads.repo";
import { createMessage } from "@/server/db/repositories/messages.repo";
import { resolveLeadConversationChannel } from "@/server/services/channel-policy.service";
import { logEvent } from "@/server/services/events.service";
import { handleInboundLeadMessage } from "@/server/services/inbound-lead-orchestrator.service";
import type { SubmitFormInput } from "@/server/validators/forms";
import { checkFormRateLimit } from "@/server/services/form-rate-limit.service";
import { safeLogger } from "@/lib/safe-logger";

export class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found.");
    this.name = "BusinessNotFoundError";
  }
}

type FormSubmissionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

type SubmitFormResult = {
  accepted: boolean;
  blockedReason?: "honeypot" | "rate_limited";
  retryAfterSeconds?: number;
  leadId?: string;
  conversationId?: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
};

export async function getHostedFormBusinessBySlug(businessSlug: string) {
  const business = await getBusinessBySlug(businessSlug);
  if (!business) return null;

  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    preferredChannel: business.preferredChannel,
  };
}

export async function submitLeadForm(
  input: SubmitFormInput,
  context: FormSubmissionContext = {},
): Promise<SubmitFormResult> {
  const business = await getBusinessBySlug(input.businessSlug);
  if (!business) {
    throw new BusinessNotFoundError();
  }

  if (input.honeypot.trim().length > 0) {
    safeLogger.warn("forms.submit.honeypot", {
      businessSlug: input.businessSlug,
      source: input.source,
      ipAddress: context.ipAddress ?? null,
    });
    return {
      accepted: false,
      blockedReason: "honeypot",
    };
  }

  const rateLimitResult = await checkFormRateLimit({
    businessSlug: input.businessSlug,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
  });
  if (rateLimitResult.limited) {
    safeLogger.warn("forms.submit.rate_limited", {
      businessId: business.id,
      businessSlug: business.slug,
      source: input.source,
      rateLimitKey: rateLimitResult.key,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });
    return {
      accepted: false,
      blockedReason: "rate_limited",
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    };
  }

  const lead = await createLead({
    businessId: business.id,
    source: input.source,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    notes: "Form lead created.",
  });

  const channel = resolveLeadConversationChannel(business);
  const conversation =
    (await getConversationByLeadAndChannel(business.id, lead.id, channel)) ??
    (await createConversation({
      businessId: business.id,
      leadId: lead.id,
      channel,
    }));

  const inboundMessage = await createMessage({
    businessId: business.id,
    conversationId: conversation.id,
    direction: "inbound",
    senderType: "lead",
    channel,
    body: input.message,
    rawPayload: {
      source: input.source,
      userAgent: context.userAgent ?? null,
    },
  });

  await createFormSubmission({
    businessId: business.id,
    leadId: lead.id,
    sourceLabel: input.source,
    payload: {
      fullName: input.fullName,
      email: input.email ?? null,
      phone: input.phone,
      message: input.message,
      metadata: input.metadata ?? {},
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
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

  let outboundMessageId: string | undefined;
  try {
    const orchestration = await handleInboundLeadMessage({
      businessId: business.id,
      leadId: lead.id,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
    });
    outboundMessageId = orchestration.outboundMessageId;
  } catch (error) {
    safeLogger.error("forms.submit.orchestration_failed", {
      businessId: business.id,
      leadId: lead.id,
      conversationId: conversation.id,
      inboundMessageId: inboundMessage.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return {
    accepted: true,
    leadId: lead.id,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
    outboundMessageId,
  };
}
