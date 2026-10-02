import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { getBusinessPromptSettingsByBusinessId } from "@/server/db/repositories/business-prompt-settings.repo";
import { getBusinessById } from "@/server/db/repositories/businesses.repo";
import {
  clearInboundMessageProcessingLock,
  getConversationById,
  markLastMessageAt,
  tryBeginInboundMessageProcessing,
  updateConversationAiState,
} from "@/server/db/repositories/conversations.repo";
import { getLeadById } from "@/server/db/repositories/leads.repo";
import {
  getMessageById,
  listRecentConversationMessages,
} from "@/server/db/repositories/messages.repo";
import { conversations, leads } from "@/server/db/schema";
import { env } from "@/server/env";
import { normalizePhone } from "@/server/lib/phone";
import { safeLogger } from "@/lib/safe-logger";
import { generateLeadReply } from "@/server/services/ai-reply.service";
import type { LeadReplyResult } from "@/server/services/ai/lead-conversation.schemas";
import {
  extractPreferredTimingFromAiState,
  normalizeUrgencyValue,
} from "@/server/services/ai/conversation-flow";
import {
  evaluateInboundAntiAbuse,
  FINAL_SUPPRESSION_STOP_MESSAGE,
  type SuppressionReason,
} from "@/server/services/anti-abuse.service";
import { triggerBusinessNotification } from "@/server/services/business-notification.service";
import { logEvent } from "@/server/services/events.service";
import { InboundLatencyTracker } from "@/server/services/inbound-latency-tracker.service";
import { sendLeadReply } from "@/server/services/messaging.service";
import { buildLeadInsights } from "@/server/services/lead-scoring.service";

type HandleInboundLeadMessageInput = {
  businessId: string;
  leadId: string;
  conversationId: string;
  inboundMessageId: string;
};

type HandleInboundLeadMessageResult = {
  status: "processed" | "duplicate" | "already_processing";
  outboundMessageId?: string;
};

const FAST_REPLY_PLACEHOLDER_TEXTS = [
  "Got it, give me a second.",
  "One moment while I check that for you.",
  "Thanks for your message. Let me look into that quickly.",
] as const;
const CONVERSATION_COMPLETION_MESSAGE =
  "Perfect \u2014 I\u2019ve shared your details with the team. They\u2019ll reach out shortly \ud83d\udc4d";

export async function handleInboundLeadMessage(
  input: HandleInboundLeadMessageInput,
  latencyTracker?: InboundLatencyTracker,
): Promise<HandleInboundLeadMessageResult> {
  const loaded = await loadInboundLeadContext(input);
  latencyTracker?.attachContext({
    businessId: loaded.business.id,
    leadId: loaded.lead.id,
    conversationId: loaded.conversation.id,
    inboundMessageId: loaded.inboundMessage.id,
  });

  const currentAiState = loaded.conversation.aiState ?? {};
  if (currentAiState.last_replied_inbound_message_id === input.inboundMessageId) {
    markSkippedStages(latencyTracker, [
      "ai_request",
      "lead_update_persist",
      "ai_state_persist",
      "outbound_send",
      "notification_work",
    ], "already_replied_to_inbound");
    await logEvent({
      businessId: loaded.business.id,
      leadId: loaded.lead.id,
      eventType: "lead.orchestration.skipped_duplicate",
      payload: {
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
        reason: "already_replied_to_inbound",
      },
    });
    return { status: "duplicate" };
  }

  const lockAcquired = await tryBeginInboundMessageProcessing({
    conversationId: loaded.conversation.id,
    inboundMessageId: input.inboundMessageId,
  });
  if (!lockAcquired) {
    markSkippedStages(latencyTracker, [
      "ai_request",
      "lead_update_persist",
      "ai_state_persist",
      "outbound_send",
      "notification_work",
    ], "already_processing");
    await logEvent({
      businessId: loaded.business.id,
      leadId: loaded.lead.id,
      eventType: "lead.orchestration.skipped_in_progress",
      payload: {
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
      },
    });
    return { status: "already_processing" };
  }

  try {
    await logEvent({
      businessId: loaded.business.id,
      leadId: loaded.lead.id,
      eventType: "lead.orchestration.started",
      payload: {
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
      },
    });

    const normalizedLeadPhone = normalizePhone(loaded.lead.phone);
    if (!normalizedLeadPhone) {
      markSkippedStages(latencyTracker, [
        "ai_request",
        "lead_update_persist",
        "outbound_send",
        "notification_work",
      ], "missing_phone");
      const skippedState = {
        ...currentAiState,
        last_replied_inbound_message_id: input.inboundMessageId,
        reply_skipped_reason: "missing_phone",
      };
      if (latencyTracker) {
        await latencyTracker.timeStage("ai_state_persist", async () =>
          updateConversationAiState(loaded.conversation.id, skippedState),
        );
      } else {
        await updateConversationAiState(loaded.conversation.id, skippedState);
      }
      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.reply_skipped",
        payload: {
          reason: "missing_phone",
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
        },
      });
      return {
        status: "processed",
      };
    }

    const antiAbuse = evaluateInboundAntiAbuse({
      inboundMessageText: loaded.inboundMessage.body,
      currentAiState,
      recentConversationMessages: loaded.recentMessages,
      leadUrgency: loaded.lead.urgency,
    });

    await logAntiAbuseSignals({
      loaded,
      input,
      antiAbuse,
    });

    if (antiAbuse.shouldSkipAiReply) {
      markSkippedStages(latencyTracker, ["ai_request", "lead_update_persist"], antiAbuse.skipReason ?? "anti_abuse_guardrail");
      markSkippedStages(latencyTracker, ["notification_work"], antiAbuse.skipReason ?? "anti_abuse_guardrail");

      let outboundMessageId: string | undefined;
      let finalAiState: Record<string, unknown> = {
        ...antiAbuse.nextAiState,
        last_ai_processed_inbound_message_id: input.inboundMessageId,
        last_ai_processed_at: new Date().toISOString(),
        last_replied_inbound_message_id: input.inboundMessageId,
        reply_skipped_reason: antiAbuse.skipReason ?? "anti_abuse_guardrail",
      };

      if (antiAbuse.shouldSendFinalStopMessage) {
        const stopMessage = await (latencyTracker
          ? latencyTracker.timeStage("outbound_send", async () =>
              sendLeadReply({
                business: loaded.business,
                conversation: loaded.conversation,
              lead: loaded.lead,
              channel: loaded.conversation.channel,
              body: FINAL_SUPPRESSION_STOP_MESSAGE,
              parentInboundMessageId: input.inboundMessageId,
              replyKind: "suppression_stop",
            }),
          )
          : sendLeadReply({
              business: loaded.business,
              conversation: loaded.conversation,
              lead: loaded.lead,
              channel: loaded.conversation.channel,
              body: FINAL_SUPPRESSION_STOP_MESSAGE,
              parentInboundMessageId: input.inboundMessageId,
              replyKind: "suppression_stop",
            }));

        outboundMessageId = stopMessage.messageId;
        finalAiState = {
          ...finalAiState,
          suppression_stop_message_sent_at: new Date().toISOString(),
          last_outbound_message_id: stopMessage.messageId,
          last_outbound_channel: loaded.conversation.channel,
        };
        await markLastMessageAt(loaded.conversation.id);

        await logEvent({
          businessId: loaded.business.id,
          leadId: loaded.lead.id,
          eventType: "lead.suppression_stop_message_sent",
          payload: {
            conversationId: loaded.conversation.id,
            inboundMessageId: input.inboundMessageId,
            messageId: stopMessage.messageId,
            reason: antiAbuse.suppressionReason,
          },
        });
      } else {
        latencyTracker?.mark("outbound_send", 0, {
          skipped: true,
          reason: antiAbuse.skipReason ?? "anti_abuse_guardrail",
        });
      }

      await persistAiState({
        conversationId: loaded.conversation.id,
        aiState: finalAiState,
        latencyTracker,
        context: {
          businessId: loaded.business.id,
          leadId: loaded.lead.id,
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
        },
      });

      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.orchestration.completed",
        payload: {
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
          outboundMessageId: outboundMessageId ?? null,
          skippedByAntiAbuse: true,
          skipReason: antiAbuse.skipReason,
        },
      });

      return {
        status: "processed",
        outboundMessageId,
      };
    }

    if (
      readBoolean(currentAiState.conversation_completed) &&
      antiAbuse.classification.signal !== "meaningful"
    ) {
      markSkippedStages(
        latencyTracker,
        ["ai_request", "lead_update_persist", "outbound_send", "notification_work"],
        "conversation_completed_non_meaningful",
      );
      const skippedState: Record<string, unknown> = {
        ...antiAbuse.nextAiState,
        conversation_completed: true,
        last_ai_processed_inbound_message_id: input.inboundMessageId,
        last_ai_processed_at: new Date().toISOString(),
        last_replied_inbound_message_id: input.inboundMessageId,
        reply_skipped_reason: "conversation_completed_non_meaningful",
      };
      await persistAiState({
        conversationId: loaded.conversation.id,
        aiState: skippedState,
        latencyTracker,
        context: {
          businessId: loaded.business.id,
          leadId: loaded.lead.id,
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
        },
      });
      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.reply_skipped",
        payload: {
          reason: "conversation_completed_non_meaningful",
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
          intentSignal: antiAbuse.classification.signal,
          intentReason: antiAbuse.classification.reason,
        },
      });
      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.orchestration.completed",
        payload: {
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
          outboundMessageId: null,
          skippedAfterCompletion: true,
        },
      });
      return { status: "processed" };
    }

    const isFirstInboundInConversation =
      loaded.recentMessages.length === 1 &&
      loaded.recentMessages[0]?.direction === "inbound" &&
      loaded.recentMessages[0]?.id === input.inboundMessageId;
    const fastReply = createFastReplyCoordinator({
      enabled: true,
      useImmediatePlaceholder: isFirstInboundInConversation,
      latencyThresholdMs: env.FAST_REPLY_LATENCY_THRESHOLD_MS,
      sendPlaceholder: async (trigger) => {
        const placeholderText = selectFastReplyPlaceholderText(input.inboundMessageId);
        const outboundResult = await sendLeadReply({
          business: loaded.business,
          conversation: loaded.conversation,
          lead: loaded.lead,
          channel: loaded.conversation.channel,
          body: placeholderText,
          parentInboundMessageId: input.inboundMessageId,
          allowMultipleRepliesPerInbound: true,
          replyKind: "placeholder",
        });
        await markLastMessageAt(loaded.conversation.id);
        await logEvent({
          businessId: loaded.business.id,
          leadId: loaded.lead.id,
          eventType: "lead.fast_reply_placeholder_sent",
          payload: {
            conversationId: loaded.conversation.id,
            inboundMessageId: input.inboundMessageId,
            messageId: outboundResult.messageId,
            trigger,
            duplicateSkipped: outboundResult.duplicateSkipped,
          },
        });
      },
    });

    if (isFirstInboundInConversation) {
      await fastReply.sendPlaceholder("first_message");
    }

    const aiReplyPromise = latencyTracker
      ? latencyTracker.timeStage("ai_request", async () =>
          generateLeadReply({
            businessProfile: loaded.business,
            businessPromptSettings: loaded.promptSettings,
            leadRecord: loaded.lead,
            recentConversationMessages: loaded.recentMessages,
            inboundMessageText: loaded.inboundMessage.body,
            channel: loaded.conversation.channel,
            currentAiState: antiAbuse.nextAiState,
          }),
        )
      : generateLeadReply({
          businessProfile: loaded.business,
          businessPromptSettings: loaded.promptSettings,
          leadRecord: loaded.lead,
          recentConversationMessages: loaded.recentMessages,
          inboundMessageText: loaded.inboundMessage.body,
          channel: loaded.conversation.channel,
          currentAiState: antiAbuse.nextAiState,
        });
    fastReply.armSlowReplyTimer(aiReplyPromise);
    const aiReply = await aiReplyPromise;

    const nowIso = new Date().toISOString();
    const nextAiState = {
      ...antiAbuse.nextAiState,
      ...aiReply.ai_state_updates,
      last_ai_processed_inbound_message_id: input.inboundMessageId,
      last_ai_processed_at: nowIso,
    };
    if (aiReply.ai_state_updates.fallback_used === true) {
      safeLogger.warn("Inbound orchestration continuing with fallback AI reply.", {
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
        fallbackReason:
          typeof aiReply.ai_state_updates.fallback_reason === "string"
            ? aiReply.ai_state_updates.fallback_reason
            : null,
      });
    }
    const responseMode = aiReply.ai_state_updates.response_mode;
    if (responseMode === "off_topic_redirect") {
      safeLogger.info("Inbound off-topic redirect response sent.", {
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
      });
    }
    if (
      responseMode === "unknown_service_not_offered" ||
      responseMode === "unknown_service_uncertain"
    ) {
      safeLogger.info("Inbound unknown-service safe response sent.", {
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
        mode: responseMode,
        requestedService:
          typeof aiReply.ai_state_updates.requested_service === "string"
            ? aiReply.ai_state_updates.requested_service
            : null,
      });
    }

    const leadUpdates = mapLeadUpdates(aiReply.lead_updates);
    const completion = evaluateConversationCompletion({
      existingAiState: loaded.conversation.aiState ?? {},
      nextAiState,
      existingLead: loaded.lead,
      leadUpdates,
    });
    const shouldSendCompletionMessage = completion.shouldMarkConversationCompleted;
    const outboundReplyText = shouldSendCompletionMessage
      ? CONVERSATION_COMPLETION_MESSAGE
      : aiReply.reply_text?.trim();

    const updatedLeadFields = Object.keys(leadUpdates);
    let outboundMessageId: string | undefined;
    let finalAiState: Record<string, unknown> = {
      ...nextAiState,
      ...completion.aiStateUpdates,
      last_replied_inbound_message_id: input.inboundMessageId,
    };
    if (outboundReplyText) {
      await fastReply.waitForPlaceholderDelivery();

      const outboundResult = await (latencyTracker
        ? latencyTracker.timeStage("outbound_send", async () =>
            sendLeadReply({
              business: loaded.business,
              conversation: loaded.conversation,
              lead: loaded.lead,
              channel: loaded.conversation.channel,
              body: outboundReplyText,
              parentInboundMessageId: input.inboundMessageId,
              allowMultipleRepliesPerInbound: fastReply.wasPlaceholderSent(),
              replyKind: fastReply.wasPlaceholderSent() ? "final" : undefined,
            }),
          )
        : sendLeadReply({
            business: loaded.business,
            conversation: loaded.conversation,
            lead: loaded.lead,
            channel: loaded.conversation.channel,
            body: outboundReplyText,
            parentInboundMessageId: input.inboundMessageId,
            allowMultipleRepliesPerInbound: fastReply.wasPlaceholderSent(),
            replyKind: fastReply.wasPlaceholderSent() ? "final" : undefined,
          }));
      outboundMessageId = outboundResult.messageId;
      finalAiState = {
        ...finalAiState,
        last_outbound_message_id: outboundResult.messageId,
        last_outbound_channel: loaded.conversation.channel,
      };

      await markLastMessageAt(loaded.conversation.id);

      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.replied",
        payload: {
          channel: loaded.conversation.channel,
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
          messageId: outboundResult.messageId,
          externalMessageId: outboundResult.sid,
          duplicateSkipped: outboundResult.duplicateSkipped,
          deliveryStatus: outboundResult.deliveryStatus,
          shouldNotifyBusiness: shouldSendCompletionMessage
            ? true
            : aiReply.should_notify_business,
          shouldEscalate: aiReply.should_escalate,
          conversationCompleted: completion.shouldMarkConversationCompleted,
        },
      });
    } else {
      latencyTracker?.mark("outbound_send", 0, {
        skipped: true,
        reason: "empty_reply_text",
      });
      await logEvent({
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        eventType: "lead.reply_skipped",
        payload: {
          conversationId: loaded.conversation.id,
          inboundMessageId: input.inboundMessageId,
          reason: "empty_reply_text",
        },
      });
    }

    await persistLeadUpdates({
      leadId: loaded.lead.id,
      leadUpdates,
      updatedLeadFields,
      latencyTracker,
      context: {
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
      },
    });
    await persistAiState({
      conversationId: loaded.conversation.id,
      aiState: finalAiState,
      latencyTracker,
      context: {
        businessId: loaded.business.id,
        leadId: loaded.lead.id,
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
      },
    });

    runPostSendFollowUpWork({
      loaded,
      aiReply,
      input,
      updatedLeadFields,
      leadUpdates,
      isFirstInboundInConversation,
      latencyTracker,
      outboundMessageId: outboundMessageId ?? null,
    });

    await logEvent({
      businessId: loaded.business.id,
      leadId: loaded.lead.id,
      eventType: "lead.orchestration.completed",
      payload: {
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
        outboundMessageId: outboundMessageId ?? null,
      },
    });

    return {
      status: "processed",
      outboundMessageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown orchestration error";
    await logEvent({
      businessId: loaded.business.id,
      leadId: loaded.lead.id,
      eventType: "lead.orchestration.failed",
      payload: {
        conversationId: loaded.conversation.id,
        inboundMessageId: input.inboundMessageId,
        error: errorMessage,
      },
    });

    const latestConversation = await getConversationById(loaded.conversation.id);
    const latestAiState = latestConversation?.aiState ?? {};
    await updateConversationAiState(loaded.conversation.id, {
      ...latestAiState,
      last_failed_inbound_message_id: input.inboundMessageId,
      last_orchestration_error: errorMessage,
      last_orchestration_failed_at: new Date().toISOString(),
    });

    throw error;
  } finally {
    await clearInboundMessageProcessingLock(loaded.conversation.id);
  }
}

export async function loadRecentConversationHistory(
  conversationId: string,
  limit = 8,
) {
  return listRecentConversationMessages(conversationId, limit);
}

async function loadInboundLeadContext(input: HandleInboundLeadMessageInput) {
  const [business, lead, conversation, inboundMessage, promptSettings, recentMessages] =
    await Promise.all([
      getBusinessById(input.businessId),
      getLeadById(input.leadId),
      getConversationById(input.conversationId),
      getMessageById(input.inboundMessageId),
      getBusinessPromptSettingsByBusinessId(input.businessId),
      loadRecentConversationHistory(input.conversationId),
    ]);

  if (!business) throw new Error("Business not found.");
  if (!lead) throw new Error("Lead not found.");
  if (!conversation) throw new Error("Conversation not found.");
  if (!inboundMessage) throw new Error("Inbound message not found.");

  if (lead.businessId !== business.id) {
    throw new Error("Lead does not belong to business.");
  }
  if (conversation.businessId !== business.id || conversation.leadId !== lead.id) {
    throw new Error("Conversation ownership mismatch.");
  }
  if (inboundMessage.conversationId !== conversation.id) {
    throw new Error("Inbound message does not belong to conversation.");
  }
  if (inboundMessage.direction !== "inbound") {
    throw new Error("Message is not inbound.");
  }

  return {
    business,
    lead,
    conversation,
    inboundMessage,
    promptSettings,
    recentMessages,
  };
}

function mapLeadUpdates(
  updates: LeadReplyResult["lead_updates"] | null | undefined,
): Record<string, unknown> {
  if (!updates) return {};

  const out: Record<string, unknown> = {};
  if (typeof updates.full_name === "string") out.fullName = updates.full_name.trim();
  if (typeof updates.intent === "string") out.intent = updates.intent.trim();
  if (typeof updates.urgency === "string") out.urgency = updates.urgency.trim();
  if (typeof updates.email === "string") out.email = updates.email.toLowerCase();
  if (
    updates.status === "new" ||
    updates.status === "qualified" ||
    updates.status === "contacted" ||
    updates.status === "closed"
  ) {
    out.status = updates.status;
  }
  if (typeof updates.summary === "string") out.summary = updates.summary.trim();

  return out;
}

async function persistLeadUpdates(input: {
  leadId: string;
  leadUpdates: Record<string, unknown>;
  updatedLeadFields: string[];
  latencyTracker?: InboundLatencyTracker;
  context: {
    businessId: string;
    leadId: string;
    conversationId: string;
    inboundMessageId: string;
  };
}): Promise<void> {
  const persist = async () => {
    if (input.updatedLeadFields.length > 0) {
      await db
        .update(leads)
        .set({
          ...input.leadUpdates,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, input.leadId));
    }

    safeLogger.info("Inbound lead update persistence status.", {
      ...input.context,
      persisted: input.updatedLeadFields.length > 0,
      updatedFields: input.updatedLeadFields,
    });
  };

  if (input.latencyTracker) {
    await input.latencyTracker.timeStage("lead_update_persist", persist, {
      persisted: input.updatedLeadFields.length > 0,
    });
    return;
  }

  await persist();
}

async function persistAiState(input: {
  conversationId: string;
  aiState: Record<string, unknown>;
  latencyTracker?: InboundLatencyTracker;
  context: {
    businessId: string;
    leadId: string;
    conversationId: string;
    inboundMessageId: string;
  };
}): Promise<void> {
  const persist = async () => {
    await db
      .update(conversations)
      .set({
        aiState: input.aiState,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, input.conversationId));
    safeLogger.info("Inbound conversation ai_state persistence status.", {
      ...input.context,
      persisted: true,
    });
  };

  if (input.latencyTracker) {
    await input.latencyTracker.timeStage("ai_state_persist", persist, {
      persisted: true,
    });
    return;
  }

  await persist();
}

function runPostSendFollowUpWork(input: {
  loaded: Awaited<ReturnType<typeof loadInboundLeadContext>>;
  aiReply: LeadReplyResult;
  input: HandleInboundLeadMessageInput;
  updatedLeadFields: string[];
  leadUpdates: Record<string, unknown>;
  isFirstInboundInConversation: boolean;
  latencyTracker?: InboundLatencyTracker;
  outboundMessageId: string | null;
}): void {
  const stageStartMs = Date.now();
  let requestedOwnerNotifications = 0;
  const run = async () => {
    if (input.updatedLeadFields.length > 0) {
      await logEvent({
        businessId: input.loaded.business.id,
        leadId: input.loaded.lead.id,
        eventType: "lead.updated_from_ai",
        payload: {
          conversationId: input.loaded.conversation.id,
          inboundMessageId: input.input.inboundMessageId,
          updatedFields: input.updatedLeadFields,
        },
      });
    }

    const leadReplyWasSent = Boolean(input.outboundMessageId);
    const ownerTriggers = resolveOwnerNotificationTriggers({
      leadReplyWasSent,
      business: input.loaded.business,
      existingLead: input.loaded.lead,
      leadUpdates: input.leadUpdates,
      existingAiState: input.loaded.conversation.aiState ?? {},
      aiStateUpdates: input.aiReply.ai_state_updates,
      isFirstInboundInConversation: input.isFirstInboundInConversation,
    });

    for (const trigger of ownerTriggers) {
      requestedOwnerNotifications += 1;
      const notificationLead = applyLeadNotificationOverrides(
        input.loaded.lead,
        input.leadUpdates,
      );

      await logEvent({
        businessId: input.loaded.business.id,
        leadId: input.loaded.lead.id,
        eventType: "lead.owner_notification.requested",
        payload: {
          conversationId: input.loaded.conversation.id,
          inboundMessageId: input.input.inboundMessageId,
          reason: trigger.reason,
        },
      });

      await triggerBusinessNotification({
        business: input.loaded.business,
        lead: notificationLead,
        conversation: input.loaded.conversation,
        reason: trigger.reason,
        inboundMessageId: input.input.inboundMessageId,
        preferredTiming: trigger.preferredTiming,
      });
    }

    if (ownerTriggers.length === 0) {
      await logEvent({
        businessId: input.loaded.business.id,
        leadId: input.loaded.lead.id,
        eventType: "lead.owner_notification.skipped",
        payload: {
          conversationId: input.loaded.conversation.id,
          inboundMessageId: input.input.inboundMessageId,
          reason: "trigger_not_met_or_deduped",
        },
      });
    }
  };

  void Promise.resolve()
    .then(run)
    .then(() => {
      input.latencyTracker?.mark("notification_work", Date.now() - stageStartMs, {
        requested: requestedOwnerNotifications > 0,
        requestedCount: requestedOwnerNotifications,
        outboundMessageId: input.outboundMessageId,
      });
    })
    .catch((error) => {
      input.latencyTracker?.mark("notification_work", Date.now() - stageStartMs, {
        failed: true,
      });
        safeLogger.error("Post-send follow-up work failed.", {
        businessId: input.loaded.business.id,
        leadId: input.loaded.lead.id,
        conversationId: input.loaded.conversation.id,
        inboundMessageId: input.input.inboundMessageId,
        error: error instanceof Error ? error.message : "Unknown follow-up error",
      });
    });
}

function resolveOwnerNotificationTriggers(input: {
  leadReplyWasSent: boolean;
  business: Awaited<ReturnType<typeof loadInboundLeadContext>>["business"];
  existingLead: Awaited<ReturnType<typeof loadInboundLeadContext>>["lead"];
  leadUpdates: Record<string, unknown>;
  existingAiState: Record<string, unknown>;
  aiStateUpdates: Record<string, unknown>;
  isFirstInboundInConversation: boolean;
}): Array<{
  reason: "urgent" | "qualification_ready" | "new_lead";
  preferredTiming: string | null;
}> {
  if (!input.leadReplyWasSent) {
    return [];
  }

  const responseMode =
    typeof input.aiStateUpdates.response_mode === "string"
      ? input.aiStateUpdates.response_mode
      : null;

  const mergedAiState = {
    ...input.existingAiState,
    ...input.aiStateUpdates,
  };

  const previousUrgency = normalizeUrgencyValue(input.existingLead.urgency);
  const nextUrgency = normalizeUrgencyValue(
    typeof input.leadUpdates.urgency === "string"
      ? input.leadUpdates.urgency
      : input.existingLead.urgency,
  );

  const previousQualificationReady = readBoolean(input.existingAiState.qualification_ready);
  const nextQualificationReady = readBoolean(mergedAiState.qualification_ready);
  const previousConversationCompleted = readBoolean(input.existingAiState.conversation_completed);
  const nextConversationCompleted = readBoolean(mergedAiState.conversation_completed);

  const leadInsights = buildLeadInsights({
    status:
      input.leadUpdates.status === "new" ||
      input.leadUpdates.status === "qualified" ||
      input.leadUpdates.status === "contacted" ||
      input.leadUpdates.status === "closed"
        ? input.leadUpdates.status
        : input.existingLead.status,
    fullName:
      typeof input.leadUpdates.fullName === "string"
        ? input.leadUpdates.fullName
        : input.existingLead.fullName,
    intent:
      typeof input.leadUpdates.intent === "string"
        ? input.leadUpdates.intent
        : input.existingLead.intent,
    urgency: nextUrgency,
    summary:
      typeof input.leadUpdates.summary === "string"
        ? input.leadUpdates.summary
        : input.existingLead.summary,
    aiState: mergedAiState,
    latestMessageBody: null,
    latestMessageDirection: "inbound",
  });

  if (responseMode === "off_topic_redirect" || leadInsights.suppressionActive || leadInsights.isLowIntent) {
    return [];
  }

  const preferredTiming = extractPreferredTimingFromAiState(mergedAiState);
  const triggers: Array<{
    reason: "urgent" | "qualification_ready" | "new_lead";
    preferredTiming: string | null;
  }> = [];

  if (input.business.notifyOnUrgent && nextUrgency === "urgent" && previousUrgency !== "urgent") {
    triggers.push({ reason: "urgent", preferredTiming });
  }

  if (
    input.business.notifyOnQualificationReady &&
    ((nextQualificationReady && !previousQualificationReady) ||
      (nextConversationCompleted && !previousConversationCompleted))
  ) {
    triggers.push({ reason: "qualification_ready", preferredTiming });
  }

  if (input.business.notifyOnNewLead && input.isFirstInboundInConversation) {
    triggers.push({ reason: "new_lead", preferredTiming });
  }

  return dedupeTriggers(triggers);
}

function dedupeTriggers(
  triggers: Array<{ reason: "urgent" | "qualification_ready" | "new_lead"; preferredTiming: string | null }>,
): Array<{ reason: "urgent" | "qualification_ready" | "new_lead"; preferredTiming: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ reason: "urgent" | "qualification_ready" | "new_lead"; preferredTiming: string | null }> = [];
  for (const trigger of triggers) {
    if (seen.has(trigger.reason)) continue;
    seen.add(trigger.reason);
    out.push(trigger);
  }
  return out;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function evaluateConversationCompletion(input: {
  existingAiState: Record<string, unknown>;
  nextAiState: Record<string, unknown>;
  existingLead: Awaited<ReturnType<typeof loadInboundLeadContext>>["lead"];
  leadUpdates: Record<string, unknown>;
}): {
  shouldMarkConversationCompleted: boolean;
  aiStateUpdates: Record<string, unknown>;
} {
  const wasCompleted = readBoolean(input.existingAiState.conversation_completed);
  const qualificationReady = readBoolean(input.nextAiState.qualification_ready);
  const nextIntent =
    typeof input.leadUpdates.intent === "string"
      ? input.leadUpdates.intent
      : input.existingLead.intent;
  const nextUrgency =
    typeof input.leadUpdates.urgency === "string"
      ? input.leadUpdates.urgency
      : input.existingLead.urgency;
  const nextPreferredTiming = extractPreferredTimingFromAiState(input.nextAiState);
  const hasIntent = Boolean(nextIntent?.trim());
  const hasTiming = Boolean(nextPreferredTiming?.trim());
  const hasUrgency = normalizeUrgencyValue(nextUrgency) !== "unknown";
  const shouldMarkConversationCompleted =
    !wasCompleted && qualificationReady && hasIntent && (hasTiming || hasUrgency);

  if (!shouldMarkConversationCompleted) {
    return {
      shouldMarkConversationCompleted: false,
      aiStateUpdates: {},
    };
  }

  return {
    shouldMarkConversationCompleted: true,
    aiStateUpdates: {
      conversation_completed: true,
      conversation_completed_at: new Date().toISOString(),
      completion_trigger: "qualification_ready_with_key_fields",
      response_mode: "conversation_completed",
    },
  };
}

function applyLeadNotificationOverrides(
  lead: Awaited<ReturnType<typeof loadInboundLeadContext>>["lead"],
  leadUpdates: Record<string, unknown>,
) {
  return {
    ...lead,
    fullName:
      typeof leadUpdates.fullName === "string" ? leadUpdates.fullName : lead.fullName,
    intent: typeof leadUpdates.intent === "string" ? leadUpdates.intent : lead.intent,
    urgency: typeof leadUpdates.urgency === "string" ? leadUpdates.urgency : lead.urgency,
    summary: typeof leadUpdates.summary === "string" ? leadUpdates.summary : lead.summary,
    email: typeof leadUpdates.email === "string" ? leadUpdates.email : lead.email,
    status:
      leadUpdates.status === "new" ||
      leadUpdates.status === "qualified" ||
      leadUpdates.status === "contacted" ||
      leadUpdates.status === "closed"
        ? leadUpdates.status
        : lead.status,
  };
}

async function logAntiAbuseSignals(input: {
  loaded: Awaited<ReturnType<typeof loadInboundLeadContext>>;
  input: HandleInboundLeadMessageInput;
  antiAbuse: ReturnType<typeof evaluateInboundAntiAbuse>;
}): Promise<void> {
  const contextPayload = {
    conversationId: input.loaded.conversation.id,
    inboundMessageId: input.input.inboundMessageId,
    intentSignal: input.antiAbuse.classification.signal,
    intentReason: input.antiAbuse.classification.reason,
    suppressionReason: input.antiAbuse.suppressionReason,
    burstCount: input.antiAbuse.inboundBurstCount,
  };

  if (input.antiAbuse.classification.signal === "low") {
    await logEvent({
      businessId: input.loaded.business.id,
      leadId: input.loaded.lead.id,
      eventType: "lead.low_intent_detected",
      payload: contextPayload,
    });
  }

  if (
    input.antiAbuse.suppressionActivated &&
    input.antiAbuse.classification.isOffTopic &&
    input.antiAbuse.suppressionReason === "repeated_off_topic"
  ) {
    await logEvent({
      businessId: input.loaded.business.id,
      leadId: input.loaded.lead.id,
      eventType: "lead.repeated_off_topic_detected",
      payload: contextPayload,
    });
  }

  if (input.antiAbuse.throttleTriggered) {
    await logEvent({
      businessId: input.loaded.business.id,
      leadId: input.loaded.lead.id,
      eventType: "lead.inbound_throttling_triggered",
      payload: {
        ...contextPayload,
        triggered: true,
      },
    });
  }

  if (input.antiAbuse.suppressionActivated) {
    await logEvent({
      businessId: input.loaded.business.id,
      leadId: input.loaded.lead.id,
      eventType: "lead.conversation_suppression_activated",
      payload: {
        ...contextPayload,
        suppressionReasonLabel: formatSuppressionReasonLabel(
          input.antiAbuse.suppressionReason,
        ),
      },
    });
  }

  if (input.antiAbuse.suppressionLifted) {
    await logEvent({
      businessId: input.loaded.business.id,
      leadId: input.loaded.lead.id,
      eventType: "lead.conversation_suppression_lifted",
      payload: {
        ...contextPayload,
        liftedByStrongIntent: true,
      },
    });
  }
}

function formatSuppressionReasonLabel(reason: SuppressionReason | null): string | null {
  if (reason === "low_intent_limit_reached") return "Low intent threshold reached";
  if (reason === "repeated_off_topic") return "Repeated off-topic messages";
  if (reason === "spam_like_behavior") return "Spam-like burst behavior";
  return null;
}

function selectFastReplyPlaceholderText(inboundMessageId: string): string {
  const seed = inboundMessageId
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FAST_REPLY_PLACEHOLDER_TEXTS[seed % FAST_REPLY_PLACEHOLDER_TEXTS.length];
}

function createFastReplyCoordinator(input: {
  enabled: boolean;
  useImmediatePlaceholder: boolean;
  latencyThresholdMs: number;
  sendPlaceholder: (trigger: "first_message" | "slow_ai") => Promise<void>;
}): {
  sendPlaceholder: (trigger: "first_message" | "slow_ai") => Promise<void>;
  armSlowReplyTimer: (aiPromise: Promise<unknown>) => void;
  waitForPlaceholderDelivery: () => Promise<void>;
  wasPlaceholderSent: () => boolean;
} {
  if (!input.enabled) {
    return {
      sendPlaceholder: async () => undefined,
      armSlowReplyTimer: () => undefined,
      waitForPlaceholderDelivery: async () => undefined,
      wasPlaceholderSent: () => false,
    };
  }

  let placeholderPromise: Promise<void> | null = null;
  let placeholderSent = false;

  const sendPlaceholder = async (trigger: "first_message" | "slow_ai") => {
    if (placeholderPromise) {
      await placeholderPromise;
      return;
    }
    placeholderPromise = input
      .sendPlaceholder(trigger)
      .then(() => {
        placeholderSent = true;
      })
      .catch((error) => {
        safeLogger.error("Fast reply placeholder send failed.", {
          trigger,
          error: error instanceof Error ? error.message : "Unknown fast reply error",
        });
      });

    await placeholderPromise;
  };

  const armSlowReplyTimer = (aiPromise: Promise<unknown>) => {
    if (input.useImmediatePlaceholder) return;

    const timer = setTimeout(() => {
      void sendPlaceholder("slow_ai");
    }, input.latencyThresholdMs);

    void aiPromise.finally(() => {
      clearTimeout(timer);
    });
  };

  return {
    sendPlaceholder,
    armSlowReplyTimer,
    waitForPlaceholderDelivery: async () => {
      if (!placeholderPromise) return;
      await placeholderPromise;
    },
    wasPlaceholderSent: () => placeholderSent,
  };
}

function markSkippedStages(
  latencyTracker: InboundLatencyTracker | undefined,
  stages: Array<
    "ai_request" | "lead_update_persist" | "ai_state_persist" | "outbound_send" | "notification_work"
  >,
  reason: string,
): void {
  if (!latencyTracker) return;
  for (const stage of stages) {
    latencyTracker.mark(stage, 0, { skipped: true, reason });
  }
}
