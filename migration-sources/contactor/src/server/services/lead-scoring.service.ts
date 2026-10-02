import {
  extractPreferredTimingFromAiState,
  normalizeUrgencyValue,
} from "@/server/services/ai/conversation-flow";

export type LeadScoreBucket = "hot" | "warm" | "cold";

export type RecommendedNextStep =
  | "Call now"
  | "Follow up soon"
  | "Await customer reply"
  | "No action needed"
  | "Review manually";

export type LeadInsights = {
  score: number;
  scoreBucket: LeadScoreBucket;
  recommendedNextStep: RecommendedNextStep;
  preferredTiming: string | null;
  qualificationReady: boolean;
  suppressionActive: boolean;
  suppressionReason: string | null;
  lowIntentInboundCount: number;
  meaningfulIntentInboundCount: number;
  offTopicInboundCount: number;
  isUrgent: boolean;
  isLowIntent: boolean;
  needsFollowUp: boolean;
};

export type LeadScoringInput = {
  status: "new" | "qualified" | "contacted" | "closed";
  fullName: string | null;
  intent: string | null;
  urgency: string | null;
  summary: string | null;
  aiState: Record<string, unknown> | null;
  latestMessageBody: string | null;
  latestMessageDirection: "inbound" | "outbound" | null;
};

export function buildLeadInsights(input: LeadScoringInput): LeadInsights {
  const aiState = input.aiState ?? {};
  const preferredTiming = extractPreferredTimingFromAiState(aiState);
  const qualificationReady = readBoolean(aiState.qualification_ready);
  const suppressionActive = readBoolean(aiState.suppression_active);
  const suppressionReason = readString(aiState.suppression_reason);
  const lowIntentInboundCount = readNumber(aiState.low_intent_inbound_count);
  const meaningfulIntentInboundCount = readNumber(aiState.meaningful_intent_inbound_count);
  const offTopicInboundCount = readNumber(aiState.off_topic_inbound_count);
  const responseMode = readString(aiState.response_mode);
  const urgency = normalizeUrgencyValue(input.urgency);

  const isUrgent = urgency === "urgent";
  const hasName = isMeaningfulText(input.fullName);
  const hasIntent = hasClearServiceIntent(input.intent) || hasClearServiceIntent(input.summary);
  const asksToSchedule = includesSchedulingSignal(input.latestMessageBody);
  const respondsToQualification =
    qualificationReady ||
    meaningfulIntentInboundCount >= 2 ||
    (meaningfulIntentInboundCount > lowIntentInboundCount + offTopicInboundCount &&
      meaningfulIntentInboundCount >= 1);
  const lowIntentBehavior =
    lowIntentInboundCount >= 2 || responseMode === "unknown_service_uncertain";
  const offTopicBehavior =
    offTopicInboundCount >= 2 || responseMode === "off_topic_redirect";

  let score = 20;
  if (hasIntent) score += 18;
  if (isUrgent) {
    score += 22;
  } else if (urgency === "non_urgent") {
    score += 6;
  }
  if (preferredTiming) score += 10;
  if (hasName) score += 8;
  if (respondsToQualification) score += 10;
  if (asksToSchedule) score += 12;
  if (qualificationReady) score += 16;

  if (offTopicBehavior) score -= 18;
  if (lowIntentBehavior) score -= 14;
  if (offTopicInboundCount >= 4) score -= 8;
  if (suppressionActive) score -= 50;
  if (suppressionReason) score -= 10;

  if (!hasIntent && !qualificationReady && urgency === "unknown") {
    score = Math.min(score, 50);
  }
  if (lowIntentBehavior && !qualificationReady) {
    score = Math.min(score, 55);
  }
  if (offTopicBehavior && !qualificationReady) {
    score = Math.min(score, 45);
  }
  if (suppressionActive) {
    score = Math.min(score, 20);
  }
  if (input.status === "closed") {
    score = Math.min(score, 25);
  }

  const boundedScore = clamp(score, 0, 100);
  const scoreBucket = resolveScoreBucket({
    score: boundedScore,
    suppressionActive,
    lowIntentBehavior,
    offTopicBehavior,
  });
  const recommendedNextStep = resolveRecommendedNextStep({
    status: input.status,
    scoreBucket,
    suppressionActive,
    isUrgent,
    qualificationReady,
    latestMessageDirection: input.latestMessageDirection,
    isLowIntent: lowIntentBehavior || offTopicBehavior,
  });

  return {
    score: boundedScore,
    scoreBucket,
    recommendedNextStep,
    preferredTiming,
    qualificationReady,
    suppressionActive,
    suppressionReason,
    lowIntentInboundCount,
    meaningfulIntentInboundCount,
    offTopicInboundCount,
    isUrgent,
    isLowIntent: lowIntentBehavior || offTopicBehavior,
    needsFollowUp:
      !suppressionActive &&
      (recommendedNextStep === "Call now" || recommendedNextStep === "Follow up soon"),
  };
}

function resolveScoreBucket(input: {
  score: number;
  suppressionActive: boolean;
  lowIntentBehavior: boolean;
  offTopicBehavior: boolean;
}): LeadScoreBucket {
  if (
    input.suppressionActive ||
    (input.lowIntentBehavior && input.offTopicBehavior)
  ) {
    return "cold";
  }
  if (input.score >= 70) return "hot";
  if (input.score >= 40) return "warm";
  return "cold";
}

function resolveRecommendedNextStep(input: {
  status: "new" | "qualified" | "contacted" | "closed";
  scoreBucket: LeadScoreBucket;
  suppressionActive: boolean;
  isUrgent: boolean;
  qualificationReady: boolean;
  latestMessageDirection: "inbound" | "outbound" | null;
  isLowIntent: boolean;
}): RecommendedNextStep {
  if (input.suppressionActive || (input.scoreBucket === "cold" && input.isLowIntent)) {
    return "No action needed";
  }
  if (input.status === "closed") {
    return "No action needed";
  }
  if (input.isUrgent) {
    return "Call now";
  }
  if (input.qualificationReady) {
    return "Follow up soon";
  }
  if (input.latestMessageDirection === "outbound") {
    return "Await customer reply";
  }
  if (input.scoreBucket === "hot" || input.scoreBucket === "warm") {
    return "Follow up soon";
  }
  return "Review manually";
}

function hasClearServiceIntent(value: string | null): boolean {
  if (!isMeaningfulText(value)) return false;
  const normalized = value.toLowerCase();
  if (/^(unknown|general|question|info|general inquiry)$/.test(normalized)) return false;
  return /\b(appointment|book|booking|schedule|quote|price|pricing|service|help|consult|estimate|cleaning|repair|install|treatment)\b/.test(
    normalized,
  );
}

function includesSchedulingSignal(value: string | null): boolean {
  if (!isMeaningfulText(value)) return false;
  const normalized = value.toLowerCase();
  return /\b(schedule|book|booking|confirm|set up|available|availability|tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday)\b/.test(
    normalized,
  );
}

function isMeaningfulText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
