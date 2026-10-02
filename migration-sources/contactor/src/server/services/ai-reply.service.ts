import OpenAI from "openai";
import { ZodError } from "zod";
import { safeLogger } from "@/lib/safe-logger";

import { env } from "@/server/env";
import type {
  Business,
  BusinessPromptSetting,
  Lead,
  Message,
} from "@/server/db/schema";
import {
  type LeadReplyResult,
  leadReplyResultSchema,
} from "@/server/services/ai/lead-conversation.schemas";
import {
  buildLeadConversationSystemPrompt,
  buildLeadConversationUserPrompt,
} from "@/server/services/ai/prompt-builder";
import {
  buildFlowGuidance,
  detectExplicitNonUrgentSignal,
  detectExplicitUrgencySignal,
  extractPreferredTimingFromAiState,
  normalizeUrgencyValue,
} from "@/server/services/ai/conversation-flow";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const AI_DEBUG_MODE = process.env.AI_DEBUG_MODE === "true";
const AI_SCHEMA_PATH = "src/server/services/ai/lead-conversation.schemas.ts";

type AiRequestMode = {
  api: "responses";
  outputMode: "plain_json_text";
  schemaPath: string;
};

type AiFailureStage =
  | "openai_request"
  | "pre_parse"
  | "output_json_parse"
  | "output_schema_validation";

export async function generateLeadReply(params: {
  businessProfile: Business;
  businessPromptSettings: BusinessPromptSetting | null;
  leadRecord: Lead;
  recentConversationMessages: Message[];
  inboundMessageText: string;
  channel: "sms" | "whatsapp";
  currentAiState: Record<string, unknown> | null;
}): Promise<LeadReplyResult> {
  const maxAttempts = 2;
  const currentAiState = params.currentAiState ?? {};
  const requestMode: AiRequestMode = {
    api: "responses",
    outputMode: "plain_json_text",
    schemaPath: AI_SCHEMA_PATH,
  };
  const isFirstOutboundReply = hasNoPriorOutboundReplies(
    params.recentConversationMessages,
  );
  const isFormSubmittedLeadSource =
    params.leadRecord.source === "hosted_form" || params.leadRecord.source === "embed_form";

  const basePromptInput = {
    businessProfile: params.businessProfile,
    businessPromptSettings: params.businessPromptSettings,
    leadRecord: params.leadRecord,
    recentConversationMessages: params.recentConversationMessages,
    inboundMessageText: params.inboundMessageText,
    channel: params.channel,
    currentAiState,
    isFirstOutboundReply,
    isFormSubmittedLeadSource,
  } as const;

  let lastError: unknown = null;
  let lastRawOutputText: string | null = null;
  let lastFailureStage: AiFailureStage = "openai_request";
  let repairRetryTriggered = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let failureStage: AiFailureStage = "openai_request";
    try {
      const systemPrompt = buildLeadConversationSystemPrompt(basePromptInput);
      const userPrompt = buildLeadConversationUserPrompt(basePromptInput);

      const instructions = buildJsonOnlyInstructions({
        systemPrompt,
        includeRepairHint: attempt > 1,
      });
      const inputMessages: Array<{ role: "user"; content: string }> = [
        {
          role: "user",
          content: userPrompt,
        },
      ];
      if (attempt > 1) {
        inputMessages.push({
          role: "user",
          content: buildJsonRepairPrompt({
            priorOutput: lastRawOutputText,
            priorError: lastError,
          }),
        });
      }

      logAiDebug("ai_request_started", {
        businessId: params.businessProfile.id,
        leadId: params.leadRecord.id,
        channel: params.channel,
        attempt,
        maxAttempts,
        requestMode,
      });

      const response = await openai.responses.create({
        model: env.OPENAI_MODEL,
        instructions,
        input: inputMessages,
        temperature: 0.35,
        max_output_tokens: 320,
      });

      failureStage = "pre_parse";
      const outputText = response.output_text?.trim() ?? "";
      lastRawOutputText = outputText;
      if (!outputText) {
        throw new Error("OpenAI response did not include text output.");
      }

      failureStage = "output_json_parse";
      const parsedJson = parseJsonFromModelOutput(outputText);

      failureStage = "output_schema_validation";
      const parsedResult = leadReplyResultSchema.parse(parsedJson);

      logAiDebug("ai_request_succeeded", {
        businessId: params.businessProfile.id,
        leadId: params.leadRecord.id,
        channel: params.channel,
        attempt,
        requestMode,
        outputLength: outputText.length,
        repairRetryUsed: repairRetryTriggered,
      });
      safeLogger.info("AI JSON repair retry status.", {
        businessId: params.businessProfile.id,
        leadId: params.leadRecord.id,
        channel: params.channel,
        repairRetryUsed: repairRetryTriggered,
        attemptsUsed: attempt,
      });

      return applyLeadReplyPolicy({
        aiReply: parsedResult,
        businessProfile: params.businessProfile,
        businessPromptSettings: params.businessPromptSettings,
        leadRecord: params.leadRecord,
        inboundMessageText: params.inboundMessageText,
        isFirstOutboundReply,
        isFormSubmittedLeadSource,
        currentAiState,
        leadId: params.leadRecord.id,
      });
    } catch (error) {
      lastError = error;
      lastFailureStage = failureStage;
      logAiDebug("ai_request_failed", {
        businessId: params.businessProfile.id,
        leadId: params.leadRecord.id,
        channel: params.channel,
        attempt,
        requestMode,
        failureStage,
        errorCode: getErrorCode(error),
      });
      const shouldRetry = shouldRunRepairRetry({
        attempt,
        maxAttempts,
        failureStage,
      });
      if (shouldRetry) {
        repairRetryTriggered = true;
        safeLogger.info("AI JSON repair retry triggered.", {
          businessId: params.businessProfile.id,
          leadId: params.leadRecord.id,
          channel: params.channel,
          attempt,
          nextAttempt: attempt + 1,
          failureStage,
        });
        logAiError("AI reply generation attempt failed; retrying.", error, {
          businessId: params.businessProfile.id,
          leadId: params.leadRecord.id,
          channel: params.channel,
          attempt,
          maxAttempts,
          requestMode,
          failureStage,
          outputPreview: toSafePreview(lastRawOutputText),
        });
        continue;
      }
    }
  }

  logAiError("AI reply generation failed; using fallback.", lastError, {
    businessId: params.businessProfile.id,
    leadId: params.leadRecord.id,
    channel: params.channel,
    attempt: maxAttempts,
    maxAttempts,
    requestMode,
    failureStage: lastFailureStage,
    outputPreview: toSafePreview(lastRawOutputText),
  });
  safeLogger.info("AI JSON repair retry status.", {
    businessId: params.businessProfile.id,
    leadId: params.leadRecord.id,
    channel: params.channel,
    repairRetryUsed: repairRetryTriggered,
    attemptsUsed: maxAttempts,
    fallbackUsed: true,
  });

  return buildFallbackReply({
    inboundMessageText: params.inboundMessageText,
    leadRecord: params.leadRecord,
    businessName: params.businessProfile.name,
    error: lastError,
    isFirstOutboundReply,
  });
}

function shouldRunRepairRetry(input: {
  attempt: number;
  maxAttempts: number;
  failureStage: AiFailureStage;
}): boolean {
  if (input.attempt >= input.maxAttempts) return false;
  return (
    input.failureStage === "pre_parse" ||
    input.failureStage === "output_json_parse" ||
    input.failureStage === "output_schema_validation"
  );
}

function buildFallbackReply(input: {
  inboundMessageText: string;
  leadRecord: Lead;
  businessName: string;
  error: unknown;
  isFirstOutboundReply: boolean;
}): LeadReplyResult {
  const soundsUrgent = detectExplicitUrgencySignal(input.inboundMessageText);
  const soundsNonUrgent = detectExplicitNonUrgentSignal(input.inboundMessageText);
  const fallbackUrgency = soundsNonUrgent ? "non_urgent" : soundsUrgent ? "urgent" : "unknown";
  const fallbackKind = getFallbackKind(input.isFirstOutboundReply);
  const fallbackText = buildFallbackText({
    fallbackKind,
    businessName: input.businessName,
  });

  safeLogger.warn("AI fallback reply path used.", {
    leadId: input.leadRecord.id,
    soundsUrgent,
    fallbackKind,
    fallbackReason: getErrorCode(input.error),
  });
  logAiDebug("fallback_used", {
    leadId: input.leadRecord.id,
    fallbackKind,
    fallbackReason: getErrorCode(input.error),
  });

  return leadReplyResultSchema.parse({
    reply_text: fallbackText,
    lead_updates: {
      full_name: null,
      intent: null,
      urgency: fallbackUrgency,
      email: null,
      status: null,
      summary: null,
    },
    ai_state_updates: {
      fallback_used: true,
      fallback_kind: fallbackKind,
      fallback_reason: getErrorCode(input.error),
    },
    should_notify_business: soundsUrgent,
    should_escalate: soundsUrgent,
  });
}

function hasNoPriorOutboundReplies(messages: Message[]): boolean {
  return messages.every((message) => message.direction !== "outbound");
}

function getFallbackKind(
  isFirstOutboundReply: boolean,
): "first_contact" | "mid_conversation" {
  return isFirstOutboundReply ? "first_contact" : "mid_conversation";
}

function buildFallbackText(input: {
  fallbackKind: "first_contact" | "mid_conversation";
  businessName: string;
}): string {
  if (input.fallbackKind === "first_contact") {
    return `Hi! Thanks for contacting ${input.businessName}. We've received your message. Could you briefly tell us what you need help with and whether it's urgent?`;
  }

  return "Thanks - we've noted that. A member of the team will review your message and get back to you shortly.";
}

function applyLeadReplyPolicy(input: {
  aiReply: LeadReplyResult;
  businessProfile: Business;
  businessPromptSettings: BusinessPromptSetting | null;
  leadRecord: Lead;
  inboundMessageText: string;
  isFirstOutboundReply: boolean;
  isFormSubmittedLeadSource: boolean;
  currentAiState: Record<string, unknown>;
  leadId: string;
}): LeadReplyResult {
  const inbound = input.inboundMessageText.trim();
  const shouldRedirectOffTopic = isOffTopicInput(inbound);
  if (shouldRedirectOffTopic) {
    safeLogger.info("Off-topic redirect guardrail triggered.", {
      leadId: input.leadId,
      businessId: input.businessProfile.id,
    });
    return leadReplyResultSchema.parse({
      ...input.aiReply,
      reply_text: `I'm here to help with questions related to ${input.businessProfile.name} and your inquiry. If you'd like, tell me what service or appointment information you need.`,
      ai_state_updates: {
        ...input.aiReply.ai_state_updates,
        response_mode: "off_topic_redirect",
      },
    });
  }

  const serviceGuardrail = applyUnknownServiceGuardrail({
    inboundMessageText: inbound,
    businessName: input.businessProfile.name,
    businessPromptSettings: input.businessPromptSettings,
  });

  if (serviceGuardrail) {
    safeLogger.info("Unknown service guardrail triggered.", {
      leadId: input.leadId,
      businessId: input.businessProfile.id,
      mode: serviceGuardrail.mode,
      requestedService: serviceGuardrail.requestedService,
    });
    return leadReplyResultSchema.parse({
      ...input.aiReply,
      reply_text: serviceGuardrail.replyText,
      ai_state_updates: {
        ...input.aiReply.ai_state_updates,
        response_mode: serviceGuardrail.mode,
        requested_service: serviceGuardrail.requestedService,
      },
      should_notify_business:
        input.aiReply.should_notify_business || serviceGuardrail.mode !== "unknown_service_uncertain",
    });
  }

  const baseMode =
    input.isFirstOutboundReply && input.isFormSubmittedLeadSource
      ? "form_first_reply"
      : "normal";
  const ensuredQuestion = ensureUsefulQuestionForFormFirstReply({
    replyText: input.aiReply.reply_text,
    isFirstOutboundReply: input.isFirstOutboundReply,
    isFormSubmittedLeadSource: input.isFormSubmittedLeadSource,
    businessPromptSettings: input.businessPromptSettings,
    businessName: input.businessProfile.name,
  });
  const urgencyResolution = resolveUrgency({
    inboundMessageText: input.inboundMessageText,
    aiUrgency: input.aiReply.lead_updates.urgency,
    existingLeadUrgency: input.leadRecord.urgency,
  });
  const mergedAiState = {
    ...input.currentAiState,
    ...input.aiReply.ai_state_updates,
  };
  const preferredTimingUpdate =
    typeof input.aiReply.ai_state_updates.preferred_timing === "string" &&
    input.aiReply.ai_state_updates.preferred_timing.trim().length > 0
      ? input.aiReply.ai_state_updates.preferred_timing.trim()
      : extractPreferredTimingFromAiState(mergedAiState);
  const effectiveLeadSnapshot: Pick<Lead, "intent" | "fullName" | "urgency"> = {
    intent:
      typeof input.aiReply.lead_updates.intent === "string"
        ? input.aiReply.lead_updates.intent
        : input.leadRecord.intent,
    fullName:
      typeof input.aiReply.lead_updates.full_name === "string"
        ? input.aiReply.lead_updates.full_name
        : input.leadRecord.fullName,
    urgency: urgencyResolution.urgency,
  };
  const flowGuidance = buildFlowGuidance({
    leadRecord: effectiveLeadSnapshot,
    currentAiState: {
      ...mergedAiState,
      ...(preferredTimingUpdate ? { preferred_timing: preferredTimingUpdate } : {}),
    },
    qualificationRules: input.businessPromptSettings?.qualificationRules ?? null,
    isFirstOutboundReply: input.isFirstOutboundReply,
  });
  const derivedStatus = deriveLeadStatusFromFlow({
    existingStatus: input.leadRecord.status,
    aiRequestedStatus: input.aiReply.lead_updates.status,
    qualificationReady: flowGuidance.qualificationReady,
  });
  const sanitizedReplyText = softenRoboticConfirmation(ensuredQuestion);
  const shouldEscalate = input.aiReply.should_escalate && urgencyResolution.urgency === "urgent";

  return leadReplyResultSchema.parse({
    ...input.aiReply,
    reply_text: trimToReasonableLength(sanitizedReplyText),
    lead_updates: {
      ...input.aiReply.lead_updates,
      urgency: urgencyResolution.urgency,
      status: derivedStatus,
    },
    should_escalate: shouldEscalate,
    ai_state_updates: {
      ...input.aiReply.ai_state_updates,
      conversation_stage: flowGuidance.conversationStage,
      next_question_focus: flowGuidance.nextQuestionFocus,
      qualification_ready: flowGuidance.qualificationReady,
      ...(preferredTimingUpdate ? { preferred_timing: preferredTimingUpdate } : {}),
      urgency_inferred_from_message: urgencyResolution.source,
      response_mode:
        typeof input.aiReply.ai_state_updates.response_mode === "string"
          ? input.aiReply.ai_state_updates.response_mode
          : baseMode,
    },
  });
}

function isOffTopicInput(inboundMessageText: string): boolean {
  const text = inboundMessageText.toLowerCase();
  if (!text) return false;

  const obviouslyBusiness = /\b(appointment|book|schedule|service|quote|price|insurance|hours|open|location|address|call|callback|help|cleaning|whitening|emergency|pain|tooth|dental|dentist)\b/;
  if (obviouslyBusiness.test(text)) return false;

  const clearlyOffTopic = /\b(joke|meme|movie|music|song|celebrity|politics|election|president|football|soccer|nba|nfl|baseball|weather|bitcoin|crypto|stock|capital of|trivia|who won)\b/;
  return clearlyOffTopic.test(text);
}

function applyUnknownServiceGuardrail(input: {
  inboundMessageText: string;
  businessName: string;
  businessPromptSettings: BusinessPromptSetting | null;
}):
  | {
      mode: "unknown_service_not_offered" | "unknown_service_uncertain";
      requestedService: string;
      replyText: string;
    }
  | null {
  const requestedService = extractRequestedService(input.inboundMessageText);
  if (!requestedService) return null;

  const offered = extractServiceNames(input.businessPromptSettings?.offeredServices);
  const notOffered = extractServiceNames(input.businessPromptSettings?.notOfferedServices);
  const normalizedRequested = normalizeServiceName(requestedService);

  const isMatchedOffered = offered.some((service) =>
    service === normalizedRequested ||
    service.includes(normalizedRequested) ||
    normalizedRequested.includes(service),
  );
  if (isMatchedOffered) return null;

  const isMatchedNotOffered = notOffered.some((service) =>
    service === normalizedRequested ||
    service.includes(normalizedRequested) ||
    normalizedRequested.includes(service),
  );
  if (isMatchedNotOffered) {
    return {
      mode: "unknown_service_not_offered",
      requestedService,
      replyText: `Thanks for asking. ${input.businessName} does not currently offer that service. If you'd like, I can note your interest so the team can follow up with alternatives.`,
    };
  }

  if (offered.length > 0 || notOffered.length > 0) {
    return {
      mode: "unknown_service_uncertain",
      requestedService,
      replyText:
        "I'm not fully sure based on the information I have here. I can note your interest and have the team confirm it with you.",
    };
  }

  return null;
}

function extractRequestedService(inboundMessageText: string): string | null {
  const patterns = [
    /\bdo you offer ([a-z0-9\s-]{3,80})/i,
    /\bcan you do ([a-z0-9\s-]{3,80})/i,
    /\bdo you provide ([a-z0-9\s-]{3,80})/i,
    /\bi need ([a-z0-9\s-]{3,80})/i,
    /\bi(?:'m| am) looking for ([a-z0-9\s-]{3,80})/i,
  ];

  for (const pattern of patterns) {
    const match = inboundMessageText.match(pattern);
    if (!match?.[1]) continue;

    const cleaned = match[1].trim().replace(/[?.!,;:]+$/g, "");
    if (cleaned.length >= 3) {
      return cleaned;
    }
  }

  return null;
}

function extractServiceNames(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return normalizeServiceName(item);
        if (item && typeof item === "object") {
          const candidate =
            getObjectText(item, "name") ??
            getObjectText(item, "service") ??
            getObjectText(item, "label") ??
            null;
          if (candidate) return normalizeServiceName(candidate);
        }
        return "";
      })
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.keys(value).map(normalizeServiceName);
  }

  return [];
}

function getObjectText(value: object, key: string): string | null {
  const out = (value as Record<string, unknown>)[key];
  return typeof out === "string" ? out : null;
}

function normalizeServiceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function ensureUsefulQuestionForFormFirstReply(input: {
  replyText: string;
  isFirstOutboundReply: boolean;
  isFormSubmittedLeadSource: boolean;
  businessPromptSettings: BusinessPromptSetting | null;
  businessName: string;
}): string {
  if (!input.isFirstOutboundReply || !input.isFormSubmittedLeadSource) {
    return input.replyText;
  }

  if (input.replyText.includes("?")) {
    return input.replyText;
  }

  const context = [
    input.businessName,
    input.businessPromptSettings?.businessDescription ?? "",
    input.businessPromptSettings?.servicesSummary ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const isDental = /\b(dental|dentist|tooth|teeth|oral|clinic)\b/.test(context);
  const question = isDental
    ? "Is this for a general cleaning, whitening, an emergency, or something else?"
    : "What service or appointment are you looking for?";

  return `${input.replyText.trim()} ${question}`;
}

function trimToReasonableLength(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 320) {
    return normalized;
  }
  return `${normalized.slice(0, 317)}...`;
}

function resolveUrgency(input: {
  inboundMessageText: string;
  aiUrgency: string | null;
  existingLeadUrgency: string | null;
}): {
  urgency: "urgent" | "non_urgent" | "unknown";
  source: "explicit_urgent" | "explicit_non_urgent" | "ai_non_urgent" | "existing_state" | "default_unknown";
} {
  const hasExplicitNonUrgentSignal = detectExplicitNonUrgentSignal(input.inboundMessageText);
  if (hasExplicitNonUrgentSignal) {
    return {
      urgency: "non_urgent",
      source: "explicit_non_urgent",
    };
  }

  const hasExplicitUrgentSignal = detectExplicitUrgencySignal(input.inboundMessageText);
  if (hasExplicitUrgentSignal) {
    return {
      urgency: "urgent",
      source: "explicit_urgent",
    };
  }

  const aiUrgency = normalizeUrgencyValue(input.aiUrgency);
  if (aiUrgency === "non_urgent") {
    return {
      urgency: "non_urgent",
      source: "ai_non_urgent",
    };
  }

  const existingUrgency = normalizeUrgencyValue(input.existingLeadUrgency);
  if (existingUrgency !== "unknown") {
    return {
      urgency: existingUrgency,
      source: "existing_state",
    };
  }

  return {
    urgency: "unknown",
    source: "default_unknown",
  };
}

function deriveLeadStatusFromFlow(input: {
  existingStatus: "new" | "qualified" | "contacted" | "closed";
  aiRequestedStatus: "new" | "qualified" | "contacted" | "closed" | null;
  qualificationReady: boolean;
}): "new" | "qualified" | "contacted" | "closed" | null {
  if (input.aiRequestedStatus === "closed" || input.aiRequestedStatus === "contacted") {
    return input.aiRequestedStatus;
  }

  if (input.qualificationReady) {
    return "qualified";
  }

  if (input.aiRequestedStatus === "qualified" || input.existingStatus === "qualified") {
    return "qualified";
  }

  return input.aiRequestedStatus ?? null;
}

function softenRoboticConfirmation(replyText: string): string {
  const trimmed = replyText.trim();
  const roboticPrefixPatterns = [
    /^just to confirm[,\s:-]*/i,
    /^to confirm[,\s:-]*/i,
    /^just confirming[,\s:-]*/i,
  ];

  for (const pattern of roboticPrefixPatterns) {
    if (!pattern.test(trimmed)) continue;
    const withoutPrefix = trimmed.replace(pattern, "").trim();
    if (!withoutPrefix) {
      return "Got it.";
    }
    const sentence = /^[a-z]/.test(withoutPrefix)
      ? withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1)
      : withoutPrefix;
    return `Got it. ${sentence}`;
  }

  return trimmed;
}

function getErrorCode(error: unknown): string {
  if (error instanceof ZodError) return "schema_validation_error";
  if (error instanceof OpenAI.APIError) return `openai_api_${error.status ?? "error"}`;
  if (error instanceof Error) return "runtime_error";
  return "unknown_error";
}

function logAiError(
  message: string,
  error: unknown,
  meta: {
    businessId: string;
    leadId: string;
    channel: "sms" | "whatsapp";
    attempt: number;
    maxAttempts: number;
    requestMode: AiRequestMode;
    failureStage: AiFailureStage;
    outputPreview: string | null;
  },
): void {
  if (error instanceof OpenAI.APIError) {
    safeLogger.error(message, {
      ...meta,
      status: error.status,
      requestId: error.requestID,
      name: error.name,
      code: error.code,
      param: error.param,
      type: error.type,
      errorBody: sanitizeForLogs(error.error),
    });
    return;
  }

  if (error instanceof ZodError) {
    safeLogger.error(message, {
      ...meta,
      validationIssues: error.issues.length,
      validationDetails: sanitizeForLogs(error.issues),
      name: error.name,
    });
    return;
  }

  if (error instanceof Error) {
    safeLogger.error(message, {
      ...meta,
      name: error.name,
      detail: error.message,
    });
    return;
  }

  safeLogger.error(message, meta);
}

function buildJsonOnlyInstructions(input: {
  systemPrompt: string;
  includeRepairHint: boolean;
}): string {
  const repairHint = input.includeRepairHint
    ? "Your previous answer was invalid JSON. Fix it now."
    : "";
  return `${input.systemPrompt}
${repairHint}
Return a single strict JSON object only.
Do not use markdown.
Do not wrap JSON in code fences.
Use exactly this top-level shape:
{
  "reply_text": string,
  "lead_updates": {
    "full_name": string | null,
    "intent": string | null,
    "urgency": string | null,
    "email": string | null,
    "status": "new" | "qualified" | "contacted" | "closed" | null,
    "summary": string | null
  },
  "ai_state_updates": object,
  "should_notify_business": boolean,
  "should_escalate": boolean
}`;
}

function buildJsonRepairPrompt(input: {
  priorOutput: string | null;
  priorError: unknown;
}): string {
  const reason = input.priorError instanceof Error ? input.priorError.message : "invalid_output";
  return [
    "Repair attempt: the previous output failed validation.",
    `Failure reason: ${reason}`,
    "Return corrected JSON only and preserve intended semantics.",
    input.priorOutput ? `Previous output:\n${input.priorOutput.slice(0, 1200)}` : "Previous output unavailable.",
  ].join("\n");
}

function parseJsonFromModelOutput(outputText: string): unknown {
  const direct = tryJsonParse(outputText);
  if (direct.ok) return direct.value;

  const fenced = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const fencedParsed = tryJsonParse(fenced[1]);
    if (fencedParsed.ok) return fencedParsed.value;
  }

  const objectCandidate = extractFirstJsonObject(outputText);
  if (objectCandidate) {
    const extractedParsed = tryJsonParse(objectCandidate);
    if (extractedParsed.ok) return extractedParsed.value;
  }

  throw new Error("Model output is not valid JSON.");
}

function tryJsonParse(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value.trim()) };
  } catch {
    return { ok: false };
  }
}

function extractFirstJsonObject(value: string): string | null {
  const start = value.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function sanitizeForLogs(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const redactedKeys = new Set(["authorization", "apiKey", "api_key", "token", "secret"]);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogs(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, keyValue] of Object.entries(value)) {
    if (redactedKeys.has(key.toLowerCase())) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeForLogs(keyValue);
  }
  return result;
}

function toSafePreview(value: string | null): string | null {
  if (!value) return null;
  return value.length > 280 ? `${value.slice(0, 280)}...` : value;
}

function logAiDebug(
  event: "ai_request_started" | "ai_request_succeeded" | "ai_request_failed" | "fallback_used",
  payload: Record<string, unknown>,
): void {
  if (!AI_DEBUG_MODE) return;
  safeLogger.info(event, payload);
}
