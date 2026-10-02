import {
  getMessageByExternalMessageId,
  updateMessageDeliveryStatus,
} from "@/server/db/repositories/messages.repo";
import { getConversationById } from "@/server/db/repositories/conversations.repo";
import { logEvent } from "@/server/services/events.service";
import type { TwilioStatusInput } from "@/server/validators/twilio";

export async function processTwilioStatusCallback(
  input: TwilioStatusInput,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  const message = await getMessageByExternalMessageId(input.MessageSid);

  if (!message) {
    return;
  }

  await updateMessageDeliveryStatus(
    message.id,
    input.MessageStatus,
    rawPayload,
  );

  const conversation = await getConversationById(message.conversationId);
  if (!conversation) return;

  await logEvent({
    businessId: message.businessId,
    leadId: conversation.leadId,
    eventType: "twilio.status.updated",
    payload: {
      status: input.MessageStatus,
      errorCode: input.ErrorCode,
      errorMessage: input.ErrorMessage,
      messageId: message.id,
      conversationId: message.conversationId,
    },
  });
}
