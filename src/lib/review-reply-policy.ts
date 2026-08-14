export const MAX_REVIEW_REPLY_BATCH = 40;
export const REVIEW_REPLY_SAFETY_LIMIT = 2_000;

export function safeProcessingError(kind: "post" | "draft" | "generate"): string {
  if (kind === "post") return "Could not post the reply to Google; it was kept as a draft.";
  if (kind === "draft") return "Could not save the generated reply as a draft.";
  return "Could not generate a reply for this review.";
}
