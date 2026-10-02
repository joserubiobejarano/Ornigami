import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { conversations, type Conversation } from "@/server/db/schema";

type ConversationChannel = "sms" | "whatsapp";

export async function getConversationByLeadAndChannel(
  businessId: string,
  leadId: string,
  channel: ConversationChannel,
): Promise<Conversation | null> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.leadId, leadId),
        eq(conversations.channel, channel),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  return existing ?? null;
}

export async function createConversation(input: {
  businessId: string;
  leadId: string;
  channel: ConversationChannel;
  externalContactId?: string | null;
  aiState?: Record<string, unknown>;
}): Promise<Conversation> {
  const [created] = await db
    .insert(conversations)
    .values({
      businessId: input.businessId,
      leadId: input.leadId,
      channel: input.channel,
      externalContactId: input.externalContactId ?? null,
      aiState: input.aiState,
    })
    .returning();

  return created;
}

export async function markLastMessageAt(conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

export async function getConversationById(
  conversationId: string,
): Promise<Conversation | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return conversation ?? null;
}

export async function updateConversationAiState(
  conversationId: string,
  aiState: Record<string, unknown>,
): Promise<void> {
  await db
    .update(conversations)
    .set({
      aiState,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

export async function tryBeginInboundMessageProcessing(input: {
  conversationId: string;
  inboundMessageId: string;
}): Promise<boolean> {
  const result = await db.execute(sql`
    update ${conversations}
    set
      ai_state = jsonb_set(
        jsonb_set(
          coalesce(${conversations.aiState}, '{}'::jsonb),
          '{in_progress_inbound_message_id}',
          to_jsonb(${input.inboundMessageId}::text),
          true
        ),
        '{in_progress_started_at}',
        to_jsonb(now() at time zone 'utc'),
        true
      ),
      updated_at = now()
    where ${conversations.id} = ${input.conversationId}
      and coalesce(${conversations.aiState}->>'last_replied_inbound_message_id', '') <> ${input.inboundMessageId}
      and coalesce(${conversations.aiState}->>'in_progress_inbound_message_id', '') <> ${input.inboundMessageId}
  `);

  return result.rowCount > 0;
}

export async function clearInboundMessageProcessingLock(
  conversationId: string,
): Promise<void> {
  await db.execute(sql`
    update ${conversations}
    set
      ai_state = (coalesce(${conversations.aiState}, '{}'::jsonb) - 'in_progress_inbound_message_id' - 'in_progress_started_at'),
      updated_at = now()
    where ${conversations.id} = ${conversationId}
  `);
}
