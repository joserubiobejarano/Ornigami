type LeadSnapshot = {
  fullName?: string | null;
  intent?: string | null;
  urgency?: string | null;
};

export type ConversationStage =
  | "first_contact"
  | "clarifying_service"
  | "clarifying_urgency"
  | "collecting_timing"
  | "collecting_name"
  | "collecting_operational"
  | "wrap_up";

export type QuestionFocus =
  | "service_reason"
  | "urgency"
  | "timing"
  | "name"
  | "operational"
  | "none";

export type FlowGuidance = {
  conversationStage: ConversationStage;
  nextQuestionFocus: QuestionFocus;
  knownFields: {
    serviceReason: string | null;
    urgency: "urgent" | "non_urgent" | "unknown";
    preferredTiming: string | null;
    name: string | null;
  };
  missingCoreFields: Array<"service_reason" | "urgency" | "preferred_timing" | "name">;
  requiredOperationalQuestions: string[];
  missingOperationalQuestions: string[];
  insuranceRequired: boolean;
  qualificationReady: boolean;
};

export function buildFlowGuidance(input: {
  leadRecord: LeadSnapshot;
  currentAiState: Record<string, unknown>;
  qualificationRules: Record<string, unknown> | null;
  isFirstOutboundReply: boolean;
}): FlowGuidance {
  const requiredOperationalQuestions = extractRequiredOperationalQuestions(
    input.qualificationRules,
  );
  const knownServiceReason = toNonEmptyString(input.leadRecord.intent);
  const knownUrgency = normalizeUrgencyValue(input.leadRecord.urgency);
  const knownPreferredTiming = extractPreferredTimingFromAiState(input.currentAiState);
  const knownName = toNonEmptyString(input.leadRecord.fullName);

  const missingCoreFields: Array<
    "service_reason" | "urgency" | "preferred_timing" | "name"
  > = [];
  if (!knownServiceReason) missingCoreFields.push("service_reason");
  if (knownUrgency === "unknown") missingCoreFields.push("urgency");
  if (!knownPreferredTiming) missingCoreFields.push("preferred_timing");
  if (!knownName) missingCoreFields.push("name");

  const missingOperationalQuestions = requiredOperationalQuestions.filter(
    (question) => !isOperationalQuestionAnswered(question, input.currentAiState),
  );

  const conversationStage = resolveConversationStage({
    isFirstOutboundReply: input.isFirstOutboundReply,
    missingCoreFields,
    missingOperationalQuestions,
  });
  const nextQuestionFocus = resolveQuestionFocus(conversationStage);
  const qualificationReady =
    missingCoreFields.length === 0 && missingOperationalQuestions.length === 0;
  const insuranceRequired = requiredOperationalQuestions.some((question) =>
    normalizeKey(question).includes("insurance"),
  );

  return {
    conversationStage,
    nextQuestionFocus,
    knownFields: {
      serviceReason: knownServiceReason,
      urgency: knownUrgency,
      preferredTiming: knownPreferredTiming,
      name: knownName,
    },
    missingCoreFields,
    requiredOperationalQuestions,
    missingOperationalQuestions,
    insuranceRequired,
    qualificationReady,
  };
}

export function normalizeUrgencyValue(
  rawValue: string | null | undefined,
): "urgent" | "non_urgent" | "unknown" {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (!value) return "unknown";

  if (
    value === "urgent" ||
    value.includes("emergency") ||
    value.includes("asap") ||
    value.includes("immediately") ||
    value.includes("severe pain")
  ) {
    return "urgent";
  }

  if (
    value === "non_urgent" ||
    value === "not_urgent" ||
    value === "not urgent" ||
    value === "routine" ||
    value === "normal" ||
    value === "low" ||
    value.includes("not an emergency") ||
    value.includes("no rush")
  ) {
    return "non_urgent";
  }

  return "unknown";
}

export function detectExplicitUrgencySignal(inboundMessageText: string): boolean {
  const text = inboundMessageText.toLowerCase();
  if (!text) return false;

  return /\b(pain|emergency|bleeding|severe discomfort|urgent|asap|today|immediately)\b/.test(
    text,
  );
}

export function detectExplicitNonUrgentSignal(inboundMessageText: string): boolean {
  const text = inboundMessageText.toLowerCase();
  if (!text) return false;

  return /\b(not urgent|not an emergency|no rush|routine|regular checkup|whenever)\b/.test(
    text,
  );
}

export function extractPreferredTimingFromAiState(
  aiState: Record<string, unknown> | null | undefined,
): string | null {
  if (!aiState || typeof aiState !== "object") return null;

  const candidateKeys = [
    "preferred_timing",
    "preferredTiming",
    "availability",
    "preferred_availability",
    "appointment_window",
    "desired_time",
  ];
  for (const key of candidateKeys) {
    const value = aiState[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function extractRequiredOperationalQuestions(
  qualificationRules: Record<string, unknown> | null | undefined,
): string[] {
  if (!qualificationRules || typeof qualificationRules !== "object") return [];

  const required = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const cleaned = value.trim();
    if (cleaned) required.add(cleaned);
  };

  const topLevelRequiredFields = readStringArray(qualificationRules.required_fields);
  for (const field of topLevelRequiredFields) add(field);

  const legacyRequiredFields = readStringArray(qualificationRules.requiredFields);
  for (const field of legacyRequiredFields) add(field);

  const requiredQuestions = readRequiredQuestionKeys(qualificationRules.required_questions);
  for (const question of requiredQuestions) add(question);

  const requiredQuestionsCamel = readRequiredQuestionKeys(qualificationRules.requiredQuestions);
  for (const question of requiredQuestionsCamel) add(question);

  const operationalQuestions = readRequiredQuestionKeys(qualificationRules.operational_questions);
  for (const question of operationalQuestions) add(question);

  const operationalQuestionsCamel = readRequiredQuestionKeys(
    qualificationRules.operationalQuestions,
  );
  for (const question of operationalQuestionsCamel) add(question);

  const insuranceRequiredFlags = [
    qualificationRules.insurance_required,
    qualificationRules.insuranceRequired,
    qualificationRules.require_insurance,
    qualificationRules.requireInsurance,
  ];
  if (insuranceRequiredFlags.some((value) => value === true)) {
    add("insurance");
  }

  return [...required];
}

function toNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConversationStage(input: {
  isFirstOutboundReply: boolean;
  missingCoreFields: Array<"service_reason" | "urgency" | "preferred_timing" | "name">;
  missingOperationalQuestions: string[];
}): ConversationStage {
  if (input.missingCoreFields[0] === "service_reason" && input.isFirstOutboundReply) {
    return "first_contact";
  }
  if (input.missingCoreFields[0] === "service_reason") return "clarifying_service";
  if (input.missingCoreFields[0] === "urgency") return "clarifying_urgency";
  if (input.missingCoreFields[0] === "preferred_timing") return "collecting_timing";
  if (input.missingCoreFields[0] === "name") return "collecting_name";
  if (input.missingOperationalQuestions.length > 0) return "collecting_operational";
  return "wrap_up";
}

function resolveQuestionFocus(stage: ConversationStage): QuestionFocus {
  if (stage === "first_contact" || stage === "clarifying_service") return "service_reason";
  if (stage === "clarifying_urgency") return "urgency";
  if (stage === "collecting_timing") return "timing";
  if (stage === "collecting_name") return "name";
  if (stage === "collecting_operational") return "operational";
  return "none";
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isOperationalQuestionAnswered(
  questionKey: string,
  aiState: Record<string, unknown>,
): boolean {
  const normalizedQuestionKey = normalizeKey(questionKey);
  const directCandidates = [questionKey, normalizedQuestionKey, normalizedQuestionKey.replace(/_/g, "")];

  for (const candidate of directCandidates) {
    const directValue = aiState[candidate];
    if (isPopulatedValue(directValue)) {
      return true;
    }
  }

  const operationalAnswers = aiState.operational_answers;
  if (operationalAnswers && typeof operationalAnswers === "object") {
    for (const [key, value] of Object.entries(operationalAnswers)) {
      if (normalizeKey(key) === normalizedQuestionKey && isPopulatedValue(value)) {
        return true;
      }
    }
  }

  return false;
}

function isPopulatedValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readRequiredQuestionKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const maybeRequired = (item as Record<string, unknown>).required;
    if (maybeRequired === false) continue;

    const keyCandidate =
      readObjectString(item, "key") ??
      readObjectString(item, "id") ??
      readObjectString(item, "field") ??
      readObjectString(item, "name") ??
      readObjectString(item, "question");
    if (keyCandidate) out.push(keyCandidate);
  }
  return out;
}

function readObjectString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}
