import type {
  Business,
  BusinessPromptSetting,
  Lead,
  Message,
} from "@/server/db/schema";
import { buildFlowGuidance } from "@/server/services/ai/conversation-flow";

type BuildPromptInput = {
  businessProfile: Business;
  businessPromptSettings: BusinessPromptSetting | null;
  leadRecord: Lead;
  recentConversationMessages: Message[];
  inboundMessageText: string;
  channel: "sms" | "whatsapp";
  currentAiState: Record<string, unknown>;
  isFirstOutboundReply: boolean;
  isFormSubmittedLeadSource: boolean;
};

export function buildLeadConversationSystemPrompt(input: BuildPromptInput): string {
  const tone = input.businessPromptSettings?.toneOfVoice ?? "warm, helpful, local";
  const assistantLanguage = input.businessPromptSettings?.assistantLanguage ?? "english";
  const firstReplyMode = input.isFirstOutboundReply && input.isFormSubmittedLeadSource;
  const flowGuidance = buildFlowGuidance({
    leadRecord: input.leadRecord,
    currentAiState: input.currentAiState,
    qualificationRules: input.businessPromptSettings?.qualificationRules ?? null,
    isFirstOutboundReply: input.isFirstOutboundReply,
  });

  return [
    "You are not a generic chatbot.",
    "You are a speed-to-lead qualification receptionist for a local business.",
    "Primary domain optimization: dental clinics (appointments, pain triage, insurance details when required, treatment timing).",
    "Adapt wording for other local services without sounding generic.",
    `Current channel: ${input.channel}. Tone: ${tone}.`,
    `Assistant language: ${assistantLanguage}. Always reply in this language unless staff overrides it.`,
    `First-reply strategy active: ${firstReplyMode ? "yes" : "no"}.`,
    "Reply briefly, practically, and naturally in plain text.",
    "Keep every reply concise and useful. Avoid long paragraphs.",
    "Use a slightly warm and human tone while staying business-focused.",
    "Add light phrasing variation across turns for greetings, acknowledgments, and follow-up questions.",
    "Keep variation subtle and professional. Do not become chatty or overly friendly.",
    "Greeting examples (first contact): 'Hi, thanks for reaching out.', 'Hello, thanks for your message.', 'Hi there, thanks for contacting us.'.",
    "Acknowledgment examples: 'Understood.', 'Got it, thanks.', 'Thanks for clarifying.', 'That helps.'.",
    "Follow-up question examples: 'Could you share what service you need?', 'What timing works best for you?', 'Would morning or afternoon be better?'.",
    "Avoid repeating the exact same opener in back-to-back replies.",
    "Do not add small talk, filler, emojis, or unrelated friendliness.",
    "Ask only one useful question at a time.",
    "Qualification priority order:",
    "1) service / reason for inquiry (intent)",
    "2) urgency",
    "3) preferred timing / availability",
    "4) name",
    "5) required operational questions only if relevant (for example insurance when explicitly required by business rules)",
    "Do not ask insurance early unless business rules require insurance for qualification.",
    "If this is first contact, acknowledge quickly and ask the next missing item in the qualification order.",
    "Avoid robotic confirmation patterns. Do not say 'Just to confirm' unless there is real ambiguity.",
    "Do not ask users to restate information that is already clear in the conversation.",
    "If enough information is gathered, summarize and stop asking unnecessary questions.",
    `Current recommended stage: ${flowGuidance.conversationStage}.`,
    `Current recommended next question focus: ${flowGuidance.nextQuestionFocus}.`,
    "BUSINESS-ONLY POLICY:",
    "- You SHOULD answer business-related questions, qualify leads, collect lead details, identify urgency, and safely redirect when missing info.",
    "- You MUST NOT engage in general chit-chat or unrelated topics (trivia, politics, sports, entertainment, random conversations).",
    "- For unrelated input, send a short redirect to business inquiry only.",
    "SERVICE SAFETY POLICY:",
    "- Never invent services, pricing, or guarantees.",
    "- If service is clearly offered: answer confidently and continue qualification.",
    "- If service is clearly not offered: say so politely and offer to note interest for team follow-up.",
    "- If service availability is unclear: do not guess. Say you are not fully sure and can note interest for team confirmation.",
    "Urgency classification must be strict:",
    "- Mark urgent only when the user clearly signals urgency (pain, emergency, bleeding, severe discomfort, urgent/asap/today/immediately).",
    "- Neutral service inquiries are not urgent by default.",
    "- 'Not urgent' should map to non_urgent.",
    "Escalate only when urgency is clearly justified.",
    "Set ai_state_updates.response_mode to one of: normal, form_first_reply, off_topic_redirect, unknown_service_not_offered, unknown_service_uncertain.",
    "Set ai_state_updates.conversation_stage to one of: first_contact, clarifying_service, clarifying_urgency, collecting_timing, collecting_name, collecting_operational, wrap_up.",
    "Set ai_state_updates.next_question_focus to one of: service_reason, urgency, timing, name, operational, none.",
    "When timing is provided, store it in ai_state_updates.preferred_timing.",
    "When ready for team handoff, set ai_state_updates.qualification_ready to true and avoid asking more questions.",
    "If you use off-topic redirect, keep it short and avoid follow-up chatter.",
    "In lead_updates always include: full_name, intent, urgency, email, status, summary.",
    "Use lead_updates.urgency values: urgent, non_urgent, or unknown.",
    "If a lead_updates value is unknown, set it to null instead of omitting it.",
    "Always output valid JSON matching the required schema. No markdown, no extra keys.",
  ].join("\n");
}

export function buildLeadConversationUserPrompt(input: BuildPromptInput): string {
  const offeredServices = normalizeServiceKnowledge(input.businessPromptSettings?.offeredServices);
  const notOfferedServices = normalizeServiceKnowledge(
    input.businessPromptSettings?.notOfferedServices,
  );
  const promptMessages = selectPromptMessages(input.recentConversationMessages);
  const firstReplyQuestionHint = buildFirstReplyQuestionHint({
    isFirstOutboundReply: input.isFirstOutboundReply,
    isFormSubmittedLeadSource: input.isFormSubmittedLeadSource,
    businessName: input.businessProfile.name,
    businessDescription: input.businessPromptSettings?.businessDescription ?? null,
    servicesSummary: input.businessPromptSettings?.servicesSummary ?? null,
  });
  const flowGuidance = buildFlowGuidance({
    leadRecord: input.leadRecord,
    currentAiState: input.currentAiState,
    qualificationRules: input.businessPromptSettings?.qualificationRules ?? null,
    isFirstOutboundReply: input.isFirstOutboundReply,
  });

  return JSON.stringify(
    {
      business_profile: {
        name: input.businessProfile.name,
        phone: input.businessProfile.phone,
        preferred_channel: input.businessProfile.preferredChannel,
      },
      business_prompt_settings: {
        business_description: input.businessPromptSettings?.businessDescription ?? null,
        services_summary: input.businessPromptSettings?.servicesSummary ?? null,
        tone_of_voice: input.businessPromptSettings?.toneOfVoice ?? null,
        assistant_language: input.businessPromptSettings?.assistantLanguage ?? null,
        offered_services: compactValueForPrompt(offeredServices),
        not_offered_services: compactValueForPrompt(notOfferedServices),
        qualification_rules: compactValueForPrompt(
          input.businessPromptSettings?.qualificationRules ?? {},
        ),
        faq_context: compactValueForPrompt(input.businessPromptSettings?.faqContext ?? {}),
        escalation_rules: compactValueForPrompt(
          input.businessPromptSettings?.escalationRules ?? {},
        ),
      },
      lead_record: {
        full_name: input.leadRecord.fullName,
        email: input.leadRecord.email,
        phone: input.leadRecord.phone,
        status: input.leadRecord.status,
        intent: input.leadRecord.intent,
        urgency: input.leadRecord.urgency,
        summary: input.leadRecord.summary,
      },
      recent_conversation_messages: promptMessages.map((message) => ({
        direction: message.direction,
        sender_type: message.senderType,
        channel: message.channel,
        text: compactText(message.body, 320),
        created_at: message.createdAt.toISOString(),
      })),
      inbound_message_text: input.inboundMessageText,
      channel: input.channel,
      conversation_context: {
        is_first_outbound_reply: input.isFirstOutboundReply,
        is_form_submitted_lead_source: input.isFormSubmittedLeadSource,
        first_reply_question_hint: firstReplyQuestionHint,
      },
      flow_guidance: {
        qualification_order: [
          "service_reason",
          "urgency",
          "preferred_timing",
          "name",
          "required_operational_questions",
        ],
        current_stage: flowGuidance.conversationStage,
        next_question_focus: flowGuidance.nextQuestionFocus,
        known_fields: flowGuidance.knownFields,
        missing_core_fields: flowGuidance.missingCoreFields,
        required_operational_questions: flowGuidance.requiredOperationalQuestions,
        missing_operational_questions: flowGuidance.missingOperationalQuestions,
        insurance_required: flowGuidance.insuranceRequired,
        qualification_ready: flowGuidance.qualificationReady,
      },
      current_ai_state: input.currentAiState,
    },
    null,
    2,
  );
}

function normalizeServiceKnowledge(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return [value];
  return [];
}

function selectPromptMessages(messages: Message[]): Message[] {
  if (messages.length <= 8) return messages;
  return messages.slice(-8);
}

function compactValueForPrompt(
  value: unknown,
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return compactText(value, 320);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, 8)
      .map((item) => compactValueForPrompt(item, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= 2) {
      return "[truncated_object]";
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 14);
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [key, compactValueForPrompt(nestedValue, depth + 1)]),
    );
  }

  return String(value);
}

function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 3)}...`;
}

function buildFirstReplyQuestionHint(input: {
  isFirstOutboundReply: boolean;
  isFormSubmittedLeadSource: boolean;
  businessName: string;
  businessDescription: string | null;
  servicesSummary: string | null;
}): string | null {
  if (!input.isFirstOutboundReply || !input.isFormSubmittedLeadSource) {
    return null;
  }

  const context = [
    input.businessName,
    input.businessDescription ?? "",
    input.servicesSummary ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const isDental = /\b(dental|dentist|tooth|teeth|oral|clinic)\b/.test(context);
  if (isDental) {
    return "What can we help with today - a cleaning, pain, whitening, or something else?";
  }

  return "What service or appointment are you looking for?";
}
