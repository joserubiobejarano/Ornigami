import type { Message } from "@/server/db/schema";
import { env } from "@/server/env";

export const FINAL_SUPPRESSION_STOP_MESSAGE =
  "Thanks for your messages. A member of the team can follow up directly if needed.";

export type SuppressionReason =
  | "low_intent_limit_reached"
  | "repeated_off_topic"
  | "spam_like_behavior";

type IntentSignal = "meaningful" | "low";

type InboundIntentClassification = {
  signal: IntentSignal;
  reason: string;
  isOffTopic: boolean;
  isStrongLeadIntent: boolean;
  isLikelyBusinessAnswer: boolean;
};

export type AntiAbuseEvaluation = {
  classification: InboundIntentClassification;
  nextAiState: Record<string, unknown>;
  shouldSkipAiReply: boolean;
  skipReason: "suppressed" | "inbound_throttled" | null;
  shouldSendFinalStopMessage: boolean;
  suppressionActivated: boolean;
  suppressionLifted: boolean;
  suppressionReason: SuppressionReason | null;
  throttleTriggered: boolean;
  inboundBurstCount: number;
};

export function evaluateInboundAntiAbuse(input: {
  inboundMessageText: string;
  currentAiState: Record<string, unknown>;
  recentConversationMessages: Message[];
  leadUrgency?: string | null;
  now?: Date;
}): AntiAbuseEvaluation {
  const now = input.now ?? new Date();
  const classification = classifyInboundIntent({
    inboundMessageText: input.inboundMessageText,
    recentConversationMessages: input.recentConversationMessages,
    currentAiState: input.currentAiState,
  });

  const previouslySuppressed = readBoolean(input.currentAiState.suppression_active);
  const qualificationReady = readBoolean(input.currentAiState.qualification_ready);
  const knownUrgency = readString(input.currentAiState.known_urgency);
  const leadUrgency = normalizeUrgencyValue(input.leadUrgency);
  const urgentConversation =
    knownUrgency === "urgent" ||
    readString(input.currentAiState.urgency) === "urgent" ||
    leadUrgency === "urgent";
  const suppressionProtectionActive = qualificationReady || urgentConversation;

  const inboundBurstCount = countRecentInboundMessages(
    input.recentConversationMessages,
    now,
    env.INBOUND_BURST_WINDOW_SECONDS,
  );
  const throttleTriggered =
    inboundBurstCount >= env.INBOUND_BURST_MESSAGE_LIMIT && !classification.isStrongLeadIntent;
  const likelySpamBurst = inboundBurstCount >= env.INBOUND_SPAM_MESSAGE_LIMIT;

  const totalInboundCount = readNumber(input.currentAiState.total_inbound_message_count) + 1;
  const lowIntentCount =
    readNumber(input.currentAiState.low_intent_inbound_count) +
    (classification.signal === "low" ? 1 : 0);
  const meaningfulIntentCount =
    readNumber(input.currentAiState.meaningful_intent_inbound_count) +
    (classification.signal === "meaningful" ? 1 : 0);
  const offTopicCount =
    readNumber(input.currentAiState.off_topic_inbound_count) +
    (classification.isOffTopic ? 1 : 0);
  const consecutiveLowIntentCount =
    classification.signal === "low"
      ? readNumber(input.currentAiState.consecutive_low_intent_inbound_count) + 1
      : 0;
  const consecutiveOffTopicCount = classification.isOffTopic
    ? readNumber(input.currentAiState.consecutive_off_topic_inbound_count) + 1
    : 0;

  let suppressionActivated = false;
  let suppressionLifted = false;
  let suppressionReason: SuppressionReason | null = readSuppressionReason(
    input.currentAiState.suppression_reason,
  );
  let shouldSkipAiReply = false;
  let skipReason: AntiAbuseEvaluation["skipReason"] = null;
  let shouldSendFinalStopMessage = false;
  let suppressionActive = previouslySuppressed;

  if (previouslySuppressed) {
    if (classification.isStrongLeadIntent) {
      suppressionActive = false;
      suppressionLifted = true;
      suppressionReason = null;
    } else {
      suppressionActive = true;
      shouldSkipAiReply = true;
      skipReason = "suppressed";
    }
  }

  if (!suppressionActive && !suppressionProtectionActive) {
    const shouldSuppressForSpam =
      likelySpamBurst && throttleTriggered && classification.signal === "low";
    const shouldSuppressForOffTopic =
      classification.signal === "low" &&
      classification.isOffTopic &&
      consecutiveOffTopicCount >= env.OFF_TOPIC_MESSAGE_LIMIT;
    const shouldSuppressForLowIntent =
      classification.signal === "low" &&
      consecutiveLowIntentCount >= env.LOW_INTENT_MESSAGE_LIMIT;

    const nextSuppressionReason: SuppressionReason | null = shouldSuppressForSpam
      ? "spam_like_behavior"
      : shouldSuppressForOffTopic
        ? "repeated_off_topic"
        : shouldSuppressForLowIntent
          ? "low_intent_limit_reached"
          : null;

    if (nextSuppressionReason) {
      suppressionActive = true;
      suppressionActivated = true;
      suppressionReason = nextSuppressionReason;
      shouldSkipAiReply = true;
      skipReason = "suppressed";
      shouldSendFinalStopMessage = true;
    } else if (throttleTriggered) {
      shouldSkipAiReply = true;
      skipReason = "inbound_throttled";
    }
  }

  const nextAiState: Record<string, unknown> = {
    ...input.currentAiState,
    total_inbound_message_count: totalInboundCount,
    low_intent_inbound_count: lowIntentCount,
    meaningful_intent_inbound_count: meaningfulIntentCount,
    off_topic_inbound_count: offTopicCount,
    consecutive_low_intent_inbound_count: consecutiveLowIntentCount,
    consecutive_off_topic_inbound_count: consecutiveOffTopicCount,
    last_intent_signal: classification.signal,
    last_intent_reason: classification.reason,
    last_intent_classified_at: now.toISOString(),
    last_intent_is_off_topic: classification.isOffTopic,
    last_intent_is_strong_lead: classification.isStrongLeadIntent,
    inbound_burst_count_window: inboundBurstCount,
    ...(throttleTriggered ? { inbound_throttle_last_triggered_at: now.toISOString() } : {}),
  };

  if (suppressionActivated) {
    nextAiState.suppression_active = true;
    nextAiState.suppression_reason = suppressionReason;
    nextAiState.suppression_activated_at = now.toISOString();
    nextAiState.suppression_lifted_at = null;
  } else if (suppressionLifted) {
    nextAiState.suppression_active = false;
    nextAiState.suppression_reason = null;
    nextAiState.suppression_lifted_at = now.toISOString();
    nextAiState.consecutive_low_intent_inbound_count = 0;
    nextAiState.consecutive_off_topic_inbound_count = 0;
  } else if (suppressionActive) {
    nextAiState.suppression_active = true;
    nextAiState.suppression_reason = suppressionReason;
  } else {
    nextAiState.suppression_active = false;
    nextAiState.suppression_reason = null;
  }

  return {
    classification,
    nextAiState,
    shouldSkipAiReply,
    skipReason,
    shouldSendFinalStopMessage,
    suppressionActivated,
    suppressionLifted,
    suppressionReason,
    throttleTriggered,
    inboundBurstCount,
  };
}

function classifyInboundIntent(input: {
  inboundMessageText: string;
  recentConversationMessages: Message[];
  currentAiState: Record<string, unknown>;
}): InboundIntentClassification {
  const normalized = normalizeText(input.inboundMessageText);
  if (!normalized) {
    return {
      signal: "low",
      reason: "empty_input",
      isOffTopic: false,
      isStrongLeadIntent: false,
      isLikelyBusinessAnswer: false,
    };
  }

  const businessIntentPattern =
    /\b(service|problem|help|availability|available|price|pricing|quote|cost|book|booking|schedule|appointment|confirm|tomorrow|today|next week|urgent|not urgent|estimate)\b/i;
  const offTopicPattern =
    /\b(joke|meme|celebrity|movie|song|music|crypto|bitcoin|football|soccer|nba|nfl|baseball|weather|politics|election|trivia|capital of|who won)\b/i;
  const socialPattern =
    /\b(hello|hi|hey|how are you|what'?s up|sup|chat|talk to me|friend)\b/i;

  const isStrongLeadIntent =
    businessIntentPattern.test(normalized) || hasStrongNeedExpression(normalized);
  const isOffTopic = offTopicPattern.test(normalized);
  const isLikelyBusinessAnswer = isLikelyBusinessAnswerMessage({
    inboundMessageText: normalized,
    recentConversationMessages: input.recentConversationMessages,
    currentAiState: input.currentAiState,
  });

  if (isStrongLeadIntent || isLikelyBusinessAnswer) {
    return {
      signal: "meaningful",
      reason: isStrongLeadIntent ? "direct_business_intent" : "answers_business_question",
      isOffTopic,
      isStrongLeadIntent,
      isLikelyBusinessAnswer,
    };
  }

  if (isOffTopic) {
    return {
      signal: "low",
      reason: "off_topic_input",
      isOffTopic: true,
      isStrongLeadIntent: false,
      isLikelyBusinessAnswer: false,
    };
  }

  if (socialPattern.test(normalized) && normalized.length <= 40) {
    return {
      signal: "low",
      reason: "social_chat_without_business_intent",
      isOffTopic: false,
      isStrongLeadIntent: false,
      isLikelyBusinessAnswer: false,
    };
  }

  if (looksLikeNonsense(normalized)) {
    return {
      signal: "low",
      reason: "nonsense_or_noise",
      isOffTopic: false,
      isStrongLeadIntent: false,
      isLikelyBusinessAnswer: false,
    };
  }

  if (normalized.split(/\s+/).length <= 2) {
    return {
      signal: "low",
      reason: "short_non_progressing_reply",
      isOffTopic: false,
      isStrongLeadIntent: false,
      isLikelyBusinessAnswer: false,
    };
  }

  return {
    signal: "meaningful",
    reason: "general_business_conversation",
    isOffTopic: false,
    isStrongLeadIntent: false,
    isLikelyBusinessAnswer: false,
  };
}

function hasStrongNeedExpression(text: string): boolean {
  return /\b(i need|we need|looking for|can i book|can we book|need help with|need a quote|need pricing|do you offer|can you do|are you available)\b/i.test(
    text,
  );
}

function isLikelyBusinessAnswerMessage(input: {
  inboundMessageText: string;
  recentConversationMessages: Message[];
  currentAiState: Record<string, unknown>;
}): boolean {
  const text = input.inboundMessageText;
  if (!text) return false;

  const directAnswerPattern =
    /^(yes|no|yep|nope|tomorrow|today|tonight|next week|this week|morning|afternoon|evening|not urgent|urgent|asap|whenever|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm)?)$/i;
  const timingPattern =
    /\b(tomorrow|today|next week|this week|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s?(am|pm)?)\b/i;
  const urgencyPattern = /\b(urgent|not urgent|asap|no rush|emergency)\b/i;

  const nextQuestionFocus = readString(input.currentAiState.next_question_focus);
  if (nextQuestionFocus === "timing" && timingPattern.test(text)) return true;
  if (nextQuestionFocus === "urgency" && urgencyPattern.test(text)) return true;
  if (nextQuestionFocus === "name" && /^[a-z][a-z\s'.-]{1,50}$/i.test(text)) return true;

  const lastOutbound = [...input.recentConversationMessages]
    .reverse()
    .find((message) => message.direction === "outbound");
  if (!lastOutbound) return false;
  if (!lastOutbound.body.includes("?")) return false;

  const outboundText = normalizeText(lastOutbound.body);
  const outboundAskedBusinessQuestion =
    /\b(service|help|need|availability|available|price|pricing|quote|budget|urgent|timing|time|schedule|book|appointment|name|email|phone)\b/i.test(
      outboundText,
    );
  if (!outboundAskedBusinessQuestion) return false;

  if (directAnswerPattern.test(text)) return true;
  if (timingPattern.test(text) || urgencyPattern.test(text)) return true;
  if (/^[a-z][a-z\s'.-]{1,60}$/i.test(text) && text.split(/\s+/).length <= 3) return true;

  return false;
}

function looksLikeNonsense(text: string): boolean {
  if (text.length >= 60) return false;
  if (/^[a-z0-9\s.,!?'"-]+$/i.test(text) === false) return true;
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 3) return true;
  return /(.)\1{5,}/.test(compact);
}

function countRecentInboundMessages(
  messages: Message[],
  now: Date,
  windowSeconds: number,
): number {
  const lowerBound = now.getTime() - windowSeconds * 1000;
  return messages.filter(
    (message) =>
      message.direction === "inbound" && message.createdAt.getTime() >= lowerBound,
  ).length;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readSuppressionReason(value: unknown): SuppressionReason | null {
  if (
    value === "low_intent_limit_reached" ||
    value === "repeated_off_topic" ||
    value === "spam_like_behavior"
  ) {
    return value;
  }
  return null;
}

function normalizeUrgencyValue(value: string | null | undefined): "urgent" | "non_urgent" | "unknown" {
  const normalized = readString(value)?.toLowerCase() ?? "";
  if (!normalized) return "unknown";
  if (normalized === "urgent") return "urgent";
  if (normalized === "non_urgent" || normalized === "not urgent") return "non_urgent";
  return "unknown";
}
