import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { messages, type Message } from "@/server/db/schema";

type CreateMessageInput = {
  businessId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderType: "lead" | "ai" | "staff" | "system";
  channel: "sms" | "whatsapp";
  body: string;
  externalMessageId?: string | null;
  deliveryStatus?: string | null;
  rawPayload?: Record<string, unknown>;
};

export async function createMessage(input: CreateMessageInput): Promise<Message> {
  const [created] = await db
    .insert(messages)
    .values({
      businessId: input.businessId,
      conversationId: input.conversationId,
      direction: input.direction,
      senderType: input.senderType,
      channel: input.channel,
      body: input.body,
      externalMessageId: input.externalMessageId ?? null,
      deliveryStatus: input.deliveryStatus ?? null,
      rawPayload: input.rawPayload,
    })
    .returning();

  return created;
}

export async function listRecentConversationMessages(
  conversationId: string,
  limit = 12,
): Promise<Message[]> {
  const recent = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return [...recent].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function getMessageByExternalMessageId(
  externalMessageId: string,
): Promise<Message | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.externalMessageId, externalMessageId))
    .orderBy(asc(messages.createdAt))
    .limit(1);

  return message ?? null;
}

export async function getMessageById(messageId: string): Promise<Message | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  return message ?? null;
}

export async function updateMessageDeliveryStatus(
  messageId: string,
  deliveryStatus: string,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  await db
    .update(messages)
    .set({
      deliveryStatus,
      rawPayload,
    })
    .where(eq(messages.id, messageId));
}

export async function updateOutboundMessageResult(input: {
  messageId: string;
  externalMessageId?: string | null;
  deliveryStatus: string;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  await db
    .update(messages)
    .set({
      externalMessageId: input.externalMessageId ?? null,
      deliveryStatus: input.deliveryStatus,
      rawPayload: input.rawPayload,
    })
    .where(eq(messages.id, input.messageId));
}

export async function getLatestOutboundMessageByBody(params: {
  conversationId: string;
  channel: "sms" | "whatsapp";
  body: string;
}): Promise<Message | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, params.conversationId),
        eq(messages.direction, "outbound"),
        eq(messages.channel, params.channel),
        eq(messages.body, params.body),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return message ?? null;
}

export async function getLatestOutboundMessageByParentInboundMessageId(params: {
  conversationId: string;
  parentInboundMessageId: string;
  replyKind?: string;
}): Promise<Message | null> {
  const replyKindCondition =
    typeof params.replyKind === "string" && params.replyKind.trim().length > 0
      ? sql` and ${messages.rawPayload}->>'replyKind' = ${params.replyKind.trim()}`
      : sql``;

  const [message] = await db
    .select()
    .from(messages)
    .where(
      sql`
        ${messages.conversationId} = ${params.conversationId}
        and ${messages.direction} = 'outbound'
        and ${messages.rawPayload}->>'parentInboundMessageId' = ${params.parentInboundMessageId}
        ${replyKindCondition}
      `,
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return message ?? null;
}
