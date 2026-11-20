import { createHash } from "node:crypto";

/**
 * Privacy-safe operational signal. Subject/session identifiers are reduced to
 * a short one-way reference; offer copy, labels, tokens and request bodies are
 * never logged.
 */
export function builderSubjectRef(subjectId: string): string {
  return createHash("sha256").update(subjectId, "utf8").digest("hex").slice(0, 12);
}

export type BuilderGenerationSignal = {
  event:
    | "reservation_denied"
    | "reservation_created"
    | "settled"
    | "settlement_unavailable"
    | "cancelled";
  subjectRef?: string;
  usageId?: string;
  code?: string;
  outcome?: string;
  providerDispatched?: boolean;
  costMicros?: number;
  retryAfterSeconds?: number | null;
};

export function logBuilderGenerationSignal(signal: BuilderGenerationSignal): void {
  const { event, ...fields } = signal;
  console.info(
    JSON.stringify({
      event: "builder_generation",
      signal: event,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}
