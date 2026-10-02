import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  businessPromptSettings,
  businesses,
  conversations,
  leadEvents,
  leads,
  messages,
} from "@/server/db/schema";
import { getOwnerDashboardUserByBusinessId } from "@/server/db/repositories/dashboard-users.repo";
import {
  assertCanEnableWhatsapp,
  assertValidPreferredChannelConfiguration,
} from "@/server/services/channel-policy.service";
import { buildLeadInsights } from "@/server/services/lead-scoring.service";
import { getEmailProviderStatus } from "@/server/services/notifications/email/email-provider-factory";

type LeadStatus = "new" | "qualified" | "contacted" | "closed";

export const DASHBOARD_DEMO_BUSINESS_SLUG = "demo-dental-studio";

const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "qualified", "contacted", "closed"];

type DashboardBusinessScope = {
  businessId?: string;
};

async function getDemoBusiness() {
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, DASHBOARD_DEMO_BUSINESS_SLUG))
    .limit(1);

  return business ?? null;
}

async function resolveDashboardBusiness(scope: DashboardBusinessScope = {}) {
  if (scope.businessId) {
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, scope.businessId))
      .limit(1);

    return business ?? null;
  }

  return getDemoBusiness();
}

export async function getDashboardOverviewData(scope: DashboardBusinessScope = {}) {
  const business = await resolveDashboardBusiness(scope);
  if (!business) return null;

  const [leadCountRow, groupedStatusRows, recentConversations] = await Promise.all([
    db
      .select({ value: count() })
      .from(leads)
      .where(eq(leads.businessId, business.id)),
    db
      .select({
        status: leads.status,
        value: count(),
      })
      .from(leads)
      .where(eq(leads.businessId, business.id))
      .groupBy(leads.status),
    db
      .select({
        id: conversations.id,
        leadId: conversations.leadId,
        channel: conversations.channel,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        leadName: leads.fullName,
        leadPhone: leads.phone,
      })
      .from(conversations)
      .innerJoin(leads, eq(leads.id, conversations.leadId))
      .where(eq(conversations.businessId, business.id))
      .orderBy(
        sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt}) desc` as SQL,
      )
      .limit(8),
  ]);

  const statusCounts = new Map<LeadStatus, number>(
    LEAD_STATUS_ORDER.map((status) => [status, 0]),
  );

  for (const row of groupedStatusRows) {
    statusCounts.set(row.status, row.value);
  }

  const conversationIds = recentConversations.map((conversation) => conversation.id);
  const latestMessages =
    conversationIds.length === 0
      ? []
      : await db
          .select({
            conversationId: messages.conversationId,
            body: messages.body,
            direction: messages.direction,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(inArray(messages.conversationId, conversationIds))
          .orderBy(desc(messages.createdAt));

  const latestMessageByConversation = new Map<
    string,
    { body: string; direction: "inbound" | "outbound"; createdAt: Date }
  >();

  for (const message of latestMessages) {
    if (!latestMessageByConversation.has(message.conversationId)) {
      latestMessageByConversation.set(message.conversationId, message);
    }
  }

  return {
    business,
    totalLeads: leadCountRow[0]?.value ?? 0,
    leadsByStatus: LEAD_STATUS_ORDER.map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0,
    })),
    recentConversations: recentConversations.map((conversation) => {
      const latestMessage = latestMessageByConversation.get(conversation.id);
      return {
        ...conversation,
        latestMessage,
      };
    }),
  };
}

export async function getDashboardLeads(limit = 50, scope: DashboardBusinessScope = {}) {
  const business = await resolveDashboardBusiness(scope);
  if (!business) return [];

  const leadRows = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      phone: leads.phone,
      email: leads.email,
      source: leads.source,
      status: leads.status,
      intent: leads.intent,
      urgency: leads.urgency,
      summary: leads.summary,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(eq(leads.businessId, business.id))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  if (leadRows.length === 0) return [];

  const leadIds = leadRows.map((lead) => lead.id);
  const leadConversations = await db
    .select({
      id: conversations.id,
      leadId: conversations.leadId,
      aiState: conversations.aiState,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(and(eq(conversations.businessId, business.id), inArray(conversations.leadId, leadIds)))
    .orderBy(
      sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt}) desc` as SQL,
    );

  const latestConversationByLeadId = new Map<
    string,
    {
      id: string;
      aiState: Record<string, unknown> | null;
      lastActivityAt: Date;
    }
  >();
  for (const conversation of leadConversations) {
    if (latestConversationByLeadId.has(conversation.leadId)) continue;
    latestConversationByLeadId.set(conversation.leadId, {
      id: conversation.id,
      aiState: conversation.aiState as Record<string, unknown> | null,
      lastActivityAt: conversation.lastMessageAt ?? conversation.createdAt,
    });
  }

  const latestConversationIds = [...latestConversationByLeadId.values()].map(
    (conversation) => conversation.id,
  );
  const latestMessages =
    latestConversationIds.length === 0
      ? []
      : await db
          .select({
            conversationId: messages.conversationId,
            body: messages.body,
            direction: messages.direction,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(inArray(messages.conversationId, latestConversationIds))
          .orderBy(desc(messages.createdAt));

  const latestMessageByConversationId = new Map<
    string,
    { body: string; direction: "inbound" | "outbound"; createdAt: Date }
  >();
  for (const message of latestMessages) {
    if (!latestMessageByConversationId.has(message.conversationId)) {
      latestMessageByConversationId.set(message.conversationId, message);
    }
  }

  return leadRows.map((lead) => {
    const latestConversation = latestConversationByLeadId.get(lead.id) ?? null;
    const aiState = latestConversation?.aiState ?? null;
    const latestMessage = latestConversation
      ? latestMessageByConversationId.get(latestConversation.id) ?? null
      : null;
    const leadInsights = buildLeadInsights({
      status: lead.status,
      fullName: lead.fullName,
      intent: lead.intent,
      urgency: lead.urgency,
      summary: lead.summary,
      aiState,
      latestMessageBody: latestMessage?.body ?? null,
      latestMessageDirection: latestMessage?.direction ?? null,
    });

    return {
      ...lead,
      score: leadInsights.score,
      scoreBucket: leadInsights.scoreBucket,
      recommendedNextStep: leadInsights.recommendedNextStep,
      preferredTiming: leadInsights.preferredTiming,
      qualificationReady: leadInsights.qualificationReady,
      suppressionActive: leadInsights.suppressionActive,
      suppressionReason: leadInsights.suppressionReason,
      lowIntentInboundCount: leadInsights.lowIntentInboundCount,
      meaningfulIntentInboundCount: leadInsights.meaningfulIntentInboundCount,
      offTopicInboundCount: leadInsights.offTopicInboundCount,
      isUrgent: leadInsights.isUrgent,
      isLowIntent: leadInsights.isLowIntent,
      needsFollowUp: leadInsights.needsFollowUp,
      latestMessagePreview: latestMessage?.body ?? null,
      latestMessageDirection: latestMessage?.direction ?? null,
      lastActivityAt:
        latestMessage?.createdAt ??
        latestConversation?.lastActivityAt ??
        lead.updatedAt ??
        lead.createdAt,
    };
  });
}

export async function getDashboardLeadDetail(leadId: string, scope: DashboardBusinessScope = {}) {
  const business = await resolveDashboardBusiness(scope);
  if (!business) return null;

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.businessId, business.id)))
    .limit(1);

  if (!lead) return null;

  const leadConversations = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      aiState: conversations.aiState,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .where(and(eq(conversations.businessId, business.id), eq(conversations.leadId, lead.id)))
    .orderBy(
      sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt}) desc` as SQL,
    );

  const conversationIds = leadConversations.map((conversation) => conversation.id);
  const conversationById = new Map(leadConversations.map((conversation) => [conversation.id, conversation]));

  const conversationHistory =
    conversationIds.length === 0
      ? []
      : await db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            body: messages.body,
            direction: messages.direction,
            senderType: messages.senderType,
            channel: messages.channel,
            deliveryStatus: messages.deliveryStatus,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(and(eq(messages.businessId, business.id), inArray(messages.conversationId, conversationIds)))
          .orderBy(asc(messages.createdAt));

  const events = await db
    .select({
      id: leadEvents.id,
      eventType: leadEvents.eventType,
      payload: leadEvents.payload,
      createdAt: leadEvents.createdAt,
    })
    .from(leadEvents)
    .where(and(eq(leadEvents.businessId, business.id), eq(leadEvents.leadId, lead.id)))
    .orderBy(desc(leadEvents.createdAt))
    .limit(100);

  const primaryConversation = leadConversations[0] ?? null;
  const latestHistoryMessage = conversationHistory[conversationHistory.length - 1] ?? null;
  const leadInsights = buildLeadInsights({
    status: lead.status,
    fullName: lead.fullName,
    intent: lead.intent,
    urgency: lead.urgency,
    summary: lead.summary,
    aiState: (primaryConversation?.aiState as Record<string, unknown> | null) ?? null,
    latestMessageBody: latestHistoryMessage?.body ?? null,
    latestMessageDirection: latestHistoryMessage?.direction ?? null,
  });
  const lastActivityAt =
    latestHistoryMessage?.createdAt ??
    primaryConversation?.lastMessageAt ??
    primaryConversation?.createdAt ??
    lead.updatedAt ??
    lead.createdAt;
  const shortSummary =
    lead.summary?.trim() ||
    truncatePreview(latestHistoryMessage?.body ?? null, 180) ||
    "No summary available.";

  return {
    business,
    lead,
    leadInsights,
    lastActivityAt,
    shortSummary,
    conversations: leadConversations.map((conversation) => ({
      ...conversation,
      suppressionActive: readAiStateBoolean(conversation.aiState, "suppression_active"),
      suppressionReason: readAiStateString(conversation.aiState, "suppression_reason"),
      lowIntentInboundCount: readAiStateNumber(conversation.aiState, "low_intent_inbound_count"),
      meaningfulIntentInboundCount: readAiStateNumber(
        conversation.aiState,
        "meaningful_intent_inbound_count",
      ),
      offTopicInboundCount: readAiStateNumber(conversation.aiState, "off_topic_inbound_count"),
    })),
    conversationHistory: conversationHistory.map((message) => ({
      ...message,
      conversation: conversationById.get(message.conversationId) ?? null,
    })),
    events,
  };
}

export async function getDashboardSettingsData(scope: DashboardBusinessScope = {}) {
  const business = await resolveDashboardBusiness(scope);
  if (!business) return null;

  const [promptSettings] = await db
    .select()
    .from(businessPromptSettings)
    .where(eq(businessPromptSettings.businessId, business.id))
    .limit(1);

  return {
    business,
    promptSettings: promptSettings ?? null,
  };
}

export async function getBusinessActivationData(businessId: string) {
  const [promptSettings, ownerUser] = await Promise.all([
    db
      .select({
        id: businessPromptSettings.id,
      })
      .from(businessPromptSettings)
      .where(eq(businessPromptSettings.businessId, businessId))
      .limit(1),
    getOwnerDashboardUserByBusinessId(businessId),
  ]);

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  const emailProviderStatus = getEmailProviderStatus();
  const hasNotificationEmail = Boolean(business.notificationEmail?.trim());
  const emailEnabled = business.notifyOwnerViaEmail;
  const emailNotificationsOperational =
    !emailEnabled || (hasNotificationEmail && emailProviderStatus.operational);

  const notificationsConfigured =
    business.notifyOwnerViaEmail ||
    business.notifyOwnerViaWhatsapp ||
    Boolean(business.notificationEmail) ||
    Boolean(business.notificationWhatsapp);

  return {
    business,
    ownerUser,
    checklist: {
      businessCreated: true,
      promptSettingsConfigured: promptSettings.length > 0,
      notificationsConfigured,
      emailNotificationsOperational,
      dashboardUserCreated: Boolean(ownerUser),
      hostedFormUrlReady: Boolean(business.slug),
      embedSnippetReady: Boolean(business.slug),
      twilioNumberAssigned: Boolean(business.twilioPhoneNumber),
      whatsappSenderApproved: business.whatsappSenderStatus === "approved",
      whatsappActive: Boolean(business.whatsappEnabled),
      productionTestCompleted: Boolean(business.productionTestCompletedAt),
    },
    emailNotifications: {
      enabled: emailEnabled,
      destinationConfigured: hasNotificationEmail,
      provider: emailProviderStatus.kind,
      operational: emailNotificationsOperational,
      reason: emailProviderStatus.reason,
    },
  };
}

type UpdateDashboardSettingsInput = {
  businessName: string;
  preferredChannel: "sms" | "whatsapp";
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  twilioPhoneNumber: string | null;
  notificationEmail: string | null;
  notificationWhatsapp: string | null;
  notifyOwnerViaEmail: boolean;
  notifyOwnerViaWhatsapp: boolean;
  notifyOnUrgent: boolean;
  notifyOnQualificationReady: boolean;
  notifyOnNewLead: boolean;
  businessDescription: string | null;
  servicesSummary: string | null;
  toneOfVoice: string | null;
  assistantLanguage: "english" | "spanish";
  offeredServices: unknown;
  notOfferedServices: unknown;
  qualificationRules: Record<string, unknown> | null;
  faqContext: Record<string, unknown> | null;
};

export async function updateDashboardSettings(
  input: UpdateDashboardSettingsInput,
  scope: DashboardBusinessScope = {},
) {
  const business = await resolveDashboardBusiness(scope);
  if (!business) {
    throw new Error("Business not found.");
  }

  assertValidPreferredChannelConfiguration({
    preferredChannel: input.preferredChannel,
    whatsappEnabled: input.whatsappEnabled,
    smsEnabled: input.smsEnabled,
  });

  if (input.whatsappEnabled) {
    assertCanEnableWhatsapp({
      twilioPhoneNumber: input.twilioPhoneNumber,
      whatsappSenderStatus: business.whatsappSenderStatus,
    });
  }

  await db
    .update(businesses)
    .set({
      name: input.businessName,
      preferredChannel: input.preferredChannel,
      whatsappEnabled: input.whatsappEnabled,
      smsEnabled: input.smsEnabled,
      twilioPhoneNumber: input.twilioPhoneNumber,
      notificationEmail: input.notificationEmail,
      notificationWhatsapp: input.notificationWhatsapp,
      notifyOwnerViaEmail: input.notifyOwnerViaEmail,
      notifyOwnerViaWhatsapp: input.notifyOwnerViaWhatsapp,
      notifyOnUrgent: input.notifyOnUrgent,
      notifyOnQualificationReady: input.notifyOnQualificationReady,
      notifyOnNewLead: input.notifyOnNewLead,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));

  await db
    .insert(businessPromptSettings)
    .values({
      businessId: business.id,
      businessDescription: input.businessDescription,
      servicesSummary: input.servicesSummary,
      toneOfVoice: input.toneOfVoice,
      assistantLanguage: input.assistantLanguage,
      offeredServices: input.offeredServices,
      notOfferedServices: input.notOfferedServices,
      qualificationRules: input.qualificationRules,
      faqContext: input.faqContext,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: businessPromptSettings.businessId,
      set: {
        businessDescription: input.businessDescription,
        servicesSummary: input.servicesSummary,
        toneOfVoice: input.toneOfVoice,
        assistantLanguage: input.assistantLanguage,
        offeredServices: input.offeredServices,
        notOfferedServices: input.notOfferedServices,
        qualificationRules: input.qualificationRules,
        faqContext: input.faqContext,
        updatedAt: new Date(),
      },
    });
}

export async function updateBusinessActivationManualFields(input: {
  businessId: string;
  twilioPhoneNumber: string | null;
  smsEnabled: boolean;
}) {
  await db
    .update(businesses)
    .set({
      twilioPhoneNumber: input.twilioPhoneNumber,
      smsEnabled: input.smsEnabled,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function updateBusinessWhatsappSenderProfile(input: {
  businessId: string;
  displayName: string | null;
  businessCategory: string | null;
}) {
  await db
    .update(businesses)
    .set({
      whatsappDisplayName: input.displayName,
      whatsappBusinessCategory: input.businessCategory,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function assignBusinessTwilioNumber(input: {
  businessId: string;
  twilioPhoneNumber: string | null;
}) {
  const [business] = await db
    .select({
      whatsappSenderStatus: businesses.whatsappSenderStatus,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) {
    throw new Error("Business not found.");
  }

  const nextSenderStatus =
    input.twilioPhoneNumber && business.whatsappSenderStatus === "not_started"
      ? "number_assigned"
      : business.whatsappSenderStatus;

  await db
    .update(businesses)
    .set({
      twilioPhoneNumber: input.twilioPhoneNumber,
      whatsappSenderStatus: nextSenderStatus,
      ...(input.twilioPhoneNumber
        ? {}
        : { whatsappEnabled: false, whatsappActivatedAt: null }),
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function markBusinessWhatsappSenderStatus(input: {
  businessId: string;
  senderStatus:
    | "not_started"
    | "number_assigned"
    | "pending_approval"
    | "approved"
    | "rejected";
}) {
  const [business] = await db
    .select({
      twilioPhoneNumber: businesses.twilioPhoneNumber,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) {
    throw new Error("Business not found.");
  }

  const requiresAssignedNumber = input.senderStatus !== "not_started";
  if (requiresAssignedNumber && !business.twilioPhoneNumber) {
    throw new Error("Assign a Twilio number before updating WhatsApp sender status.");
  }

  const shouldDisableWhatsapp = input.senderStatus !== "approved";

  await db
    .update(businesses)
    .set({
      whatsappSenderStatus: input.senderStatus,
      ...(shouldDisableWhatsapp
        ? { whatsappEnabled: false, whatsappActivatedAt: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function activateBusinessWhatsapp(input: { businessId: string }) {
  const [business] = await db
    .select({
      twilioPhoneNumber: businesses.twilioPhoneNumber,
      whatsappSenderStatus: businesses.whatsappSenderStatus,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) {
    throw new Error("Business not found.");
  }

  assertCanEnableWhatsapp({
    twilioPhoneNumber: business.twilioPhoneNumber,
    whatsappSenderStatus: business.whatsappSenderStatus,
  });

  await db
    .update(businesses)
    .set({
      whatsappEnabled: true,
      whatsappActivatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function markBusinessProductionTestCompleted(input: {
  businessId: string;
  completed: boolean;
}) {
  await db
    .update(businesses)
    .set({
      productionTestCompletedAt: input.completed ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, input.businessId));
}

function readAiStateBoolean(
  aiState: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return aiState?.[key] === true;
}

function readAiStateString(
  aiState: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = aiState?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readAiStateNumber(
  aiState: Record<string, unknown> | null | undefined,
  key: string,
): number {
  const value = aiState?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function truncatePreview(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}
