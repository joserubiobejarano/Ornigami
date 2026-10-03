import { generateReplyForReviewRow, postReplyToGoogleAndPersist, type ReviewRowForReply } from "@/lib/review-reply-server";
import type { ProfileReplyRow } from "@/lib/reply-profile-defaults";
import {
  claimReplyGeneration, reserveReplyGenerationUsage, saveGeneratedReplyDraftAndCharge,
  releaseReplyGenerationUsage, releaseReplyGenerationClaim,
  type ReplyDraftRecord,
} from "@/lib/review-draft-policy";
import { parseGoogleStarRating } from "@/lib/google-review-rating";
import { randomUUID } from "node:crypto";
import { beginAccountLifecycleOperation, finishAccountLifecycleOperation } from "@/lib/account-lifecycle";

export type DraftProcessingSource = "scheduled" | "individual" | "interactive_batch";
export type DraftProcessingResult =
  | { outcome: "saved"; draft: ReplyDraftRecord; posted: false }
  | { outcome: "saved"; draft: ReplyDraftRecord; posted: true }
  | { outcome: "skipped"; reason: "existing-draft" | "busy" | "not-found" | "empty" | "conflict" }
  | { outcome: "limit" }
  | { outcome: "failed"; stage: "generate" | "save" | "post"; draft?: ReplyDraftRecord };

export function isSafeAutoReplyRating(value: unknown): boolean {
  if (typeof value === "number") return value === 4 || value === 5;
  if (typeof value !== "string") return false;
  if (value === "FOUR" || value === "FIVE") return true;
  const parsed = parseGoogleStarRating(value);
  return parsed === 4 || parsed === 5;
}

/** A failed request can still have been processed when transport or server
 * failure obscures whether OpenAI accepted it. Keep that outcome blocking. */
function isUnknownOpenAIOutcome(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; status?: unknown };
  if (candidate.name === "APIConnectionError" || candidate.name === "APIConnectionTimeoutError") return true;
  return typeof candidate.status === "number" && (candidate.status === 408 || candidate.status >= 500);
}

/** One policy path for scheduled and interactive review drafting. */
async function processReviewDraftInner(input: {
  actorUserId: string;
  businessId: string;
  locationName: string;
  row: ReviewRowForReply;
  profile: ProfileReplyRow | null;
  source: DraftProcessingSource;
  /** Optional scheduled-work provider deadline; interactive callers keep defaults. */
  providerTimeoutMs?: number;
}): Promise<DraftProcessingResult> {
  const { actorUserId, businessId, locationName, row, profile, source } = input;
  if (!(row.comment ?? "").trim()) return { outcome: "skipped", reason: "empty" };
  const claimed = await claimReplyGeneration(actorUserId, businessId, row.google_review_id);
  if (!claimed.ok) return { outcome: "skipped", reason: claimed.reason };
  const reservation = await reserveReplyGenerationUsage(actorUserId, businessId, row.google_review_id, claimed.claim);
  if (!reservation.ok) {
    await releaseReplyGenerationClaim(businessId, row.google_review_id, claimed.claim).catch(() => undefined);
    return reservation.reason === "limit" ? { outcome: "limit" } : { outcome: "skipped", reason: "busy" };
  }
  let reply: string;
  try {
    reply = (await generateReplyForReviewRow(row, profile, { timeoutMs: input.providerTimeoutMs })).trim();
  } catch (error) {
    await releaseReplyGenerationUsage(reservation.reservationId, claimed.claim).catch(() => undefined);
    if (isUnknownOpenAIOutcome(error)) throw error;
    return { outcome: "failed", stage: "generate" };
  }
  if (!reply) {
    await releaseReplyGenerationUsage(reservation.reservationId, claimed.claim).catch(() => undefined);
    return { outcome: "skipped", reason: "empty" };
  }
  let saved: Awaited<ReturnType<typeof saveGeneratedReplyDraftAndCharge>>;
  try {
    saved = await saveGeneratedReplyDraftAndCharge({
      businessId, googleReviewId: row.google_review_id, markdown: reply,
      claim: claimed.claim, reservationId: reservation.reservationId,
    });
  } catch {
    await releaseReplyGenerationUsage(reservation.reservationId, claimed.claim).catch(() => undefined);
    return { outcome: "failed", stage: "save" };
  }
  if (!saved.ok) {
    await releaseReplyGenerationUsage(reservation.reservationId, claimed.claim).catch(() => undefined);
    return { outcome: "skipped", reason: saved.reason === "empty" ? "empty" : "conflict" };
  }

  const shouldAutoPost = source === "interactive_batch" && profile?.auto_reply_all_reviews === true && isSafeAutoReplyRating(row.star_rating);
  if (!shouldAutoPost) return { outcome: "saved", draft: saved.draft, posted: false };
  let posted: Awaited<ReturnType<typeof postReplyToGoogleAndPersist>>;
  try {
    posted = await postReplyToGoogleAndPersist(
      actorUserId, businessId, row.google_review_id, locationName, reply,
      { intent: "automatic", expectedVersion: saved.draft.version, expectedText: reply },
    );
  } catch {
    return { outcome: "failed", stage: "post", draft: saved.draft };
  }
  if (!posted.ok) return { outcome: "failed", stage: "post", draft: saved.draft };
  return { outcome: "saved", draft: saved.draft, posted: true };
}

export async function processReviewDraft(input: {
  ownerUserId: string;
  actorUserId: string;
  businessId: string;
  locationName: string;
  row: ReviewRowForReply;
  profile: ProfileReplyRow | null;
  source: DraftProcessingSource;
  providerTimeoutMs?: number;
}): Promise<DraftProcessingResult> {
  const lifecycle = await beginAccountLifecycleOperation({
    userId: input.ownerUserId, actorUserId: input.actorUserId, businessId: input.businessId,
    kind: "openai_reply_draft", idempotencyKey: randomUUID(), leaseMs: 90000,
  });
  if (lifecycle.result !== "claimed" || !lifecycle.token) return { outcome: "skipped", reason: "busy" };
  let result: DraftProcessingResult;
  try {
    result = await processReviewDraftInner(input);
  } catch (error) {
    await finishAccountLifecycleOperation(lifecycle.token, "uncertain").catch(() => false);
    throw error;
  }
  if (!await finishAccountLifecycleOperation(lifecycle.token, "done")) return { outcome: "failed", stage: "save" };
  return result;
}
